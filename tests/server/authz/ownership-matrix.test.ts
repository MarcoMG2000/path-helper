import { describe, expect, it } from "vitest";
import {
  createAuthorizationPolicy,
  authorizeOrDeny,
  notFoundBody,
  type KindRules,
} from "../../../src/server/authz";
import {
  describeOwnershipMatrix,
  evaluateOwnershipMatrix,
  type OwnershipMatrixOptions,
} from "../../helpers/ownership-matrix";
import { makeTestApp, type TestApp } from "../../helpers/test-app";

// Autotest del helper (T18): el helper detecta las fugas típicas y valida un endpoint correcto.
// Recurso de prueba: una "nota" con texto secreto, propiedad de A.

const SECRET = "texto-secreto-de-A";
type Mode = "correct" | "everyone-reads" | "distinguishes-403" | "gm-blocked" | "public";

function makeNotesApp(
  mode: Mode,
  gmRead: boolean,
): { make: () => Promise<TestApp>; notes: Map<string, { ownerId: string }> } {
  const notes = new Map<string, { ownerId: string }>();
  const rules: KindRules = {
    test_note: { scope: "owned", ownerWrite: true, gmRead, gmWrite: false },
  };
  const policy = createAuthorizationPolicy(rules);
  const make = async (): Promise<TestApp> => {
    const t = await makeTestApp({
      overrides: {
        extraKindRules: [rules],
        extraPublicRoutes: mode === "public" ? ["GET /api/notes/:id"] : [],
      },
    });
    t.app.get<{ Params: { id: string } }>("/api/notes/:id", async (request, reply) => {
      const note = notes.get(request.params.id);
      const actor = request.actor;
      if (mode === "everyone-reads") {
        return note
          ? { id: request.params.id, text: SECRET }
          : reply.code(404).send(notFoundBody());
      }
      if (mode === "public") {
        return note
          ? { id: request.params.id, text: SECRET }
          : reply.code(404).send(notFoundBody());
      }
      if (!actor || !note) return reply.code(404).send(notFoundBody());
      if (mode === "distinguishes-403") {
        if (actor.userId !== note.ownerId && actor.role !== "gm") {
          return reply.code(403).send({ error: { code: "forbidden", message: "no" } });
        }
        return { id: request.params.id, text: SECRET };
      }
      if (mode === "gm-blocked" && actor.role === "gm") return reply.code(404).send(notFoundBody());
      const verdict = authorizeOrDeny(policy, actor, "read", {
        kind: "test_note",
        ownerId: note.ownerId,
      });
      if (!verdict.ok) return reply.code(verdict.denial.status).send(verdict.denial.body);
      return { id: request.params.id, text: SECRET };
    });
    return t;
  };
  return { make, notes };
}

function options(mode: Mode, gmCanRead: boolean, policyGmRead = gmCanRead): OwnershipMatrixOptions {
  const { make, notes } = makeNotesApp(mode, policyGmRead);
  return {
    name: `notas (${mode})`,
    makeApp: make,
    seed: async (ctx) => {
      notes.set("nota-1", { ownerId: ctx.ids.a });
      return "nota-1";
    },
    request: (ctx, cookie, id) =>
      ctx.t.req({ method: "GET", url: `/api/notes/${id}`, ...(cookie ? { cookie } : {}) }),
    secrets: [SECRET],
    gmCanRead,
  };
}

describe("ownership-matrix: endpoint correcto", () => {
  describeOwnershipMatrix({
    ...options("correct", false),
    name: "nota privada (el GM no lee)",
  });
  describeOwnershipMatrix({
    ...options("correct", true),
    name: "ficha (el GM lee)",
  });
});

describe("ownership-matrix: detecta endpoints con fugas", () => {
  it("un endpoint que deja leer a cualquier jugador autenticado se detecta (B accede)", async () => {
    const outcome = await evaluateOwnershipMatrix(options("everyone-reads", true));
    try {
      expect(outcome.violations.otherPlayer.length).toBeGreaterThan(0);
      expect(outcome.violations.otherPlayer.join(" ")).toContain("B recibió 200");
      expect(outcome.violations.otherPlayer.join(" ")).toContain(SECRET);
    } finally {
      await outcome.close();
    }
  });

  it("un endpoint que responde 403 al ajeno (distinto de 404) se detecta", async () => {
    const outcome = await evaluateOwnershipMatrix(options("distinguishes-403", true));
    try {
      expect(outcome.violations.otherPlayer.join(" ")).toContain("distingue");
    } finally {
      await outcome.close();
    }
  });

  it("un endpoint que bloquea al GM cuando debería poder leer se detecta", async () => {
    const outcome = await evaluateOwnershipMatrix(options("gm-blocked", true));
    try {
      expect(outcome.violations.gm.length).toBeGreaterThan(0);
    } finally {
      await outcome.close();
    }
  });

  it("un endpoint que deja leer al GM cuando no debería (gmRead=false) se detecta", async () => {
    // El endpoint aplica gmRead=true pero el contrato espera que el GM NO lea.
    const outcome = await evaluateOwnershipMatrix(options("correct", false, true));
    try {
      expect(outcome.violations.gm.length).toBeGreaterThan(0);
    } finally {
      await outcome.close();
    }
  });

  it("una ruta pública que sirve el recurso al anónimo se detecta", async () => {
    const outcome = await evaluateOwnershipMatrix(options("public", true));
    try {
      expect(outcome.violations.anonymous.length).toBeGreaterThan(0);
      expect(outcome.violations.anonymous.join(" ")).toContain("anónimo");
    } finally {
      await outcome.close();
    }
  });

  it("un endpoint correcto no produce violaciones", async () => {
    const outcome = await evaluateOwnershipMatrix(options("correct", true));
    try {
      expect(outcome.violations).toEqual({ owner: [], otherPlayer: [], gm: [], anonymous: [] });
    } finally {
      await outcome.close();
    }
  });
});
