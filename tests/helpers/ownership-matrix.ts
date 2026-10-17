import { randomUUID } from "node:crypto";
import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedAccounts, type TestApp } from "./test-app";

/**
 * Matriz de propiedad reutilizable (docs/architecture.md §6: "todo endpoint nuevo exige un
 * test jugador A no accede a recurso de B"). Crea los jugadores A y B y un GM, siembra un
 * recurso de A y comprueba, contra el endpoint de LECTURA que se le pase:
 *  - A (propietario) accede;
 *  - B recibe EXACTAMENTE la misma respuesta (estado y cuerpo) que para un id inexistente
 *    y nada del contenido de A;
 *  - el GM accede o no según `gmCanRead` (si no, recibe lo mismo que un id inexistente);
 *  - el anónimo recibe 401 y nada del contenido de A.
 */
export interface OwnershipContext {
  t: TestApp;
  /** Cabeceras `cookie` ya autenticadas. */
  cookies: { a: string; b: string; gm: string };
  ids: { a: string; b: string; gm: string };
}

export interface OwnershipMatrixOptions {
  name: string;
  makeApp: () => Promise<TestApp>;
  /** Siembra un recurso propiedad de A y devuelve su id. */
  seed: (ctx: OwnershipContext) => Promise<string>;
  /** Hace la petición de lectura del recurso `resourceId` con la cookie dada (o anónima). */
  request: (
    ctx: OwnershipContext,
    cookie: string | undefined,
    resourceId: string,
  ) => Promise<LightMyRequestResponse>;
  /** Textos del recurso de A que no deben aparecer jamás en respuestas a B ni al anónimo. */
  secrets: string[];
  gmCanRead: boolean;
  /** Estado esperado para el propietario (200 por defecto). */
  ownerStatus?: number;
}

export interface OwnershipViolations {
  owner: string[];
  otherPlayer: string[];
  gm: string[];
  anonymous: string[];
}

export async function evaluateOwnershipMatrix(
  opts: OwnershipMatrixOptions,
): Promise<{ violations: OwnershipViolations; close: () => Promise<void> }> {
  const t = await opts.makeApp();
  const { gmId, playerIds } = await seedAccounts(t.fx, [
    { name: "Jugador A", pin: "1111" },
    { name: "Jugador B", pin: "2222" },
  ]);
  const ctx: OwnershipContext = {
    t,
    cookies: {
      a: await t.loginCookie("Jugador A", "1111"),
      b: await t.loginCookie("Jugador B", "2222"),
      gm: await t.loginCookie("Gandalf", "1111"),
    },
    ids: { a: playerIds[0] ?? "", b: playerIds[1] ?? "", gm: gmId },
  };
  const resourceId = await opts.seed(ctx);
  const missingId = randomUUID();
  const ownerStatus = opts.ownerStatus ?? 200;
  const violations: OwnershipViolations = { owner: [], otherPlayer: [], gm: [], anonymous: [] };

  const leaks = (response: LightMyRequestResponse): string[] =>
    opts.secrets.filter((secret) => response.body.includes(secret));

  const owner = await opts.request(ctx, ctx.cookies.a, resourceId);
  if (owner.statusCode !== ownerStatus) {
    violations.owner.push(`el propietario recibió ${owner.statusCode}, se esperaba ${ownerStatus}`);
  }

  const bReal = await opts.request(ctx, ctx.cookies.b, resourceId);
  const bMissing = await opts.request(ctx, ctx.cookies.b, missingId);
  if (bReal.statusCode !== bMissing.statusCode || bReal.body !== bMissing.body) {
    violations.otherPlayer.push(
      `B distingue el recurso de A de un id inexistente (${bReal.statusCode} vs ${bMissing.statusCode})`,
    );
  }
  if (bReal.statusCode === ownerStatus) {
    violations.otherPlayer.push(`B recibió ${bReal.statusCode}: accede al recurso de A`);
  }
  for (const secret of leaks(bReal)) violations.otherPlayer.push(`B recibe "${secret}"`);

  const gmReal = await opts.request(ctx, ctx.cookies.gm, resourceId);
  if (opts.gmCanRead) {
    if (gmReal.statusCode !== ownerStatus) {
      violations.gm.push(`el GM recibió ${gmReal.statusCode}, se esperaba ${ownerStatus}`);
    }
  } else {
    const gmMissing = await opts.request(ctx, ctx.cookies.gm, missingId);
    if (gmReal.statusCode !== gmMissing.statusCode || gmReal.body !== gmMissing.body) {
      violations.gm.push("el GM distingue el recurso (no legible para él) de un id inexistente");
    }
    for (const secret of leaks(gmReal)) violations.gm.push(`el GM recibe "${secret}"`);
  }

  const anon = await opts.request(ctx, undefined, resourceId);
  if (anon.statusCode !== 401) {
    violations.anonymous.push(`el anónimo recibió ${anon.statusCode}, se esperaba 401`);
  }
  for (const secret of leaks(anon)) violations.anonymous.push(`el anónimo recibe "${secret}"`);

  return { violations, close: () => t.app.close() };
}

export function describeOwnershipMatrix(opts: OwnershipMatrixOptions): void {
  describe(`matriz de propiedad: ${opts.name}`, () => {
    let outcome: Awaited<ReturnType<typeof evaluateOwnershipMatrix>>;
    beforeAll(async () => {
      outcome = await evaluateOwnershipMatrix(opts);
    });
    afterAll(async () => {
      await outcome?.close();
    });

    it("el propietario accede a lo suyo", () => {
      expect(outcome.violations.owner).toEqual([]);
    });
    it("el jugador B no accede a lo de A: misma respuesta que para un id inexistente", () => {
      expect(outcome.violations.otherPlayer).toEqual([]);
    });
    it(opts.gmCanRead ? "el GM accede" : "el GM NO accede", () => {
      expect(outcome.violations.gm).toEqual([]);
    });
    it("sin sesión: 401 y nada del recurso", () => {
      expect(outcome.violations.anonymous).toEqual([]);
    });
  });
}
