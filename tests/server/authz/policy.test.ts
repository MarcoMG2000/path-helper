import { describe, expect, it } from "vitest";
import {
  ACCOUNT_KIND_RULES,
  createAuthorizationPolicy,
  mergeKindRules,
  type Actor,
  type KindRules,
  type Resource,
  type ResourceKindRule,
} from "../../../src/server/authz";

const playerA: Actor = { userId: "A", role: "player" };
const playerB: Actor = { userId: "B", role: "player" };
const gm: Actor = { userId: "GM", role: "gm" };

// Tipos de prueba definidos en el propio test (ver requirements §3.7).
const TEST_RULES: KindRules = {
  test_sheet: { scope: "owned", ownerWrite: true, gmRead: true, gmWrite: true },
  test_private_note: { scope: "owned", ownerWrite: true, gmRead: false, gmWrite: false },
  test_shared: { scope: "shared", ownerWrite: false, gmRead: false, gmWrite: true },
  test_shared_readonly: { scope: "shared", ownerWrite: false, gmRead: false, gmWrite: false },
};
const policy = createAuthorizationPolicy(TEST_RULES);

const sheetOfA: Resource = { kind: "test_sheet", ownerId: "A" };
const noteOfA: Resource = { kind: "test_private_note", ownerId: "A" };

describe("policy: tabla actor x propietario x regla x acción", () => {
  interface Row {
    name: string;
    actor: Actor;
    resource: Resource;
    read: boolean;
    write: boolean;
  }
  const rows: Row[] = [
    { name: "A sobre su ficha", actor: playerA, resource: sheetOfA, read: true, write: true },
    {
      name: "B sobre la ficha de A",
      actor: playerB,
      resource: sheetOfA,
      read: false,
      write: false,
    },
    { name: "GM sobre la ficha de A", actor: gm, resource: sheetOfA, read: true, write: true },
    { name: "A sobre su nota", actor: playerA, resource: noteOfA, read: true, write: true },
    { name: "B sobre la nota de A", actor: playerB, resource: noteOfA, read: false, write: false },
    { name: "GM sobre la nota de A", actor: gm, resource: noteOfA, read: false, write: false },
    {
      name: "GM sobre SU PROPIA nota",
      actor: gm,
      resource: { kind: "test_private_note", ownerId: "GM" },
      read: true,
      write: true,
    },
    {
      name: "GM sobre SU PROPIA ficha",
      actor: gm,
      resource: { kind: "test_sheet", ownerId: "GM" },
      read: true,
      write: true,
    },
    {
      name: "A sobre la ficha del GM",
      actor: playerA,
      resource: { kind: "test_sheet", ownerId: "GM" },
      read: false,
      write: false,
    },
    {
      name: "A sobre recurso compartido",
      actor: playerA,
      resource: { kind: "test_shared" },
      read: true,
      write: false,
    },
    {
      name: "B sobre recurso compartido",
      actor: playerB,
      resource: { kind: "test_shared" },
      read: true,
      write: false,
    },
    {
      name: "GM sobre recurso compartido",
      actor: gm,
      resource: { kind: "test_shared" },
      read: true,
      write: true,
    },
    {
      name: "GM sobre compartido sin gmWrite",
      actor: gm,
      resource: { kind: "test_shared_readonly" },
      read: true,
      write: false,
    },
  ];

  for (const row of rows) {
    it(`R66-R72: ${row.name}: leer=${row.read}, escribir=${row.write}`, () => {
      expect(policy.canRead(row.actor, row.resource)).toBe(row.read);
      expect(policy.canWrite(row.actor, row.resource)).toBe(row.write);
    });
  }
});

describe("policy: matriz exhaustiva de reglas owned", () => {
  const bools = [false, true];
  const combos: ResourceKindRule[] = [];
  for (const ownerWrite of bools)
    for (const gmRead of bools)
      for (const gmWrite of bools) {
        combos.push({ scope: "owned", ownerWrite, gmRead, gmWrite });
      }

  for (const rule of combos) {
    const label = `ownerWrite=${rule.ownerWrite} gmRead=${rule.gmRead} gmWrite=${rule.gmWrite}`;
    const p = createAuthorizationPolicy({ thing: rule });
    const resource: Resource = { kind: "thing", ownerId: "A" };

    it(`R67: jugador A no lee ni escribe lo de B, sea cual sea la regla (${label})`, () => {
      // El recurso es de B; A (jugador) nunca accede.
      const ofB: Resource = { kind: "thing", ownerId: "B" };
      expect(p.canRead(playerA, ofB)).toBe(false);
      expect(p.canWrite(playerA, ofB)).toBe(false);
      expect(p.readAudience(playerA, ofB)).toBe("none");
      // Y simétricamente B sobre lo de A.
      expect(p.canRead(playerB, resource)).toBe(false);
      expect(p.canWrite(playerB, resource)).toBe(false);
    });

    it(`R66/R69: el propietario siempre lee; escribe según ownerWrite (${label})`, () => {
      expect(p.canRead(playerA, resource)).toBe(true);
      expect(p.readAudience(playerA, resource)).toBe("owner");
      expect(p.canWrite(playerA, resource)).toBe(rule.ownerWrite);
    });

    it(`R68/R70: el GM ajeno lee según gmRead y escribe según gmWrite (${label})`, () => {
      expect(p.canRead(gm, resource)).toBe(rule.gmRead);
      expect(p.readAudience(gm, resource)).toBe(rule.gmRead ? "gm" : "none");
      expect(p.canWrite(gm, resource)).toBe(rule.gmWrite);
    });

    it(`R66: un GM propietario se rige como propietario, no como GM ajeno (${label})`, () => {
      const own: Resource = { kind: "thing", ownerId: "GM" };
      expect(p.canRead(gm, own)).toBe(true);
      expect(p.readAudience(gm, own)).toBe("owner");
      expect(p.canWrite(gm, own)).toBe(rule.ownerWrite);
    });
  }
});

describe("policy: reglas shared", () => {
  it("R71: cualquier actor autenticado lee un recurso shared; audiencia gm/other", () => {
    const shared: Resource = { kind: "test_shared" };
    expect(policy.readAudience(gm, shared)).toBe("gm");
    expect(policy.readAudience(playerA, shared)).toBe("other");
    expect(policy.canRead(playerB, shared)).toBe(true);
  });

  it("R72: shared solo lo escribe el GM y solo si gmWrite", () => {
    expect(policy.canWrite(gm, { kind: "test_shared" })).toBe(true);
    expect(policy.canWrite(playerA, { kind: "test_shared" })).toBe(false);
    // ownerId en un recurso shared no concede nada al jugador
    expect(policy.canWrite(playerA, { kind: "test_shared", ownerId: "A" })).toBe(false);
  });
});

describe("policy: denegar por defecto", () => {
  it("R73: un kind no registrado se deniega a todos, incluido el GM", () => {
    for (const actor of [playerA, playerB, gm]) {
      const resource: Resource = { kind: "desconocido", ownerId: actor.userId };
      expect(policy.canRead(actor, resource)).toBe(false);
      expect(policy.canWrite(actor, resource)).toBe(false);
      expect(policy.readAudience(actor, resource)).toBe("none");
    }
  });

  it("R73: kinds que coinciden con propiedades de Object.prototype no están registrados", () => {
    for (const kind of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      for (const actor of [playerA, gm]) {
        expect(policy.canRead(actor, { kind, ownerId: actor.userId }), kind).toBe(false);
        expect(policy.canWrite(actor, { kind, ownerId: actor.userId }), kind).toBe(false);
      }
    }
  });

  it("R73: un recurso owned sin ownerId (ausente, null o vacío) se deniega incluso al GM", () => {
    const variants: Resource[] = [
      { kind: "test_sheet" },
      { kind: "test_sheet", ownerId: null },
      { kind: "test_sheet", ownerId: "" },
    ];
    for (const resource of variants) {
      for (const actor of [playerA, playerB, gm]) {
        expect(policy.canRead(actor, resource), JSON.stringify(resource)).toBe(false);
        expect(policy.canWrite(actor, resource), JSON.stringify(resource)).toBe(false);
      }
    }
  });

  it("R73: un actor con userId vacío no es propietario de un recurso sin dueño", () => {
    const ghost: Actor = { userId: "", role: "player" };
    expect(policy.canRead(ghost, { kind: "test_sheet", ownerId: "" })).toBe(false);
  });

  it("R66: la comparación de propietario es exacta (sin normalizar mayúsculas ni espacios)", () => {
    const lookalike: Actor = { userId: "a", role: "player" };
    expect(policy.canRead(lookalike, sheetOfA)).toBe(false);
    expect(policy.canRead({ userId: "A ", role: "player" }, sheetOfA)).toBe(false);
  });
});

describe("policy: reglas de f1", () => {
  const p = createAuthorizationPolicy(ACCOUNT_KIND_RULES);

  it("R63-R65: account: el dueño y el GM leen; el jugador ajeno no; solo el GM escribe", () => {
    const account: Resource = { kind: "account", ownerId: "A" };
    expect(p.canRead(playerA, account)).toBe(true);
    expect(p.canRead(gm, account)).toBe(true);
    expect(p.canRead(playerB, account)).toBe(false);
    expect(p.canWrite(playerA, account)).toBe(false);
    expect(p.canWrite(gm, account)).toBe(true);
    expect(p.canWrite(playerB, account)).toBe(false);
  });
});

describe("mergeKindRules", () => {
  const rule: ResourceKindRule = {
    scope: "shared",
    ownerWrite: false,
    gmRead: false,
    gmWrite: true,
  };

  it("une conjuntos disjuntos", () => {
    const merged = mergeKindRules({ a: rule }, { b: rule }, {});
    expect(Object.keys(merged).sort()).toEqual(["a", "b"]);
  });

  it("R74: un kind duplicado lanza un error que lo nombra", () => {
    expect(() => mergeKindRules({ a: rule, dup: rule }, { dup: rule })).toThrow(/"dup"/);
    expect(() => mergeKindRules({ a: rule }, { a: rule })).toThrow(/"a"/);
  });

  it("R74: el resultado compone con createAuthorizationPolicy (cableado de compose)", () => {
    const merged = mergeKindRules(ACCOUNT_KIND_RULES, TEST_RULES);
    const p = createAuthorizationPolicy(merged);
    expect(p.canRead(playerA, { kind: "account", ownerId: "A" })).toBe(true);
    expect(p.canRead(playerA, sheetOfA)).toBe(true);
  });
});
