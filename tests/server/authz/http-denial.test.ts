import { describe, expect, it } from "vitest";
import {
  authorizeOrDeny,
  createAuthorizationPolicy,
  forbiddenBody,
  notFoundBody,
  type Actor,
  type KindRules,
} from "../../../src/server/authz";

const rules: KindRules = {
  test_sheet: { scope: "owned", ownerWrite: true, gmRead: true, gmWrite: false },
  test_private_note: { scope: "owned", ownerWrite: true, gmRead: false, gmWrite: false },
  test_readonly_owned: { scope: "owned", ownerWrite: false, gmRead: true, gmWrite: false },
};
const policy = createAuthorizationPolicy(rules);
const playerA: Actor = { userId: "A", role: "player" };
const playerB: Actor = { userId: "B", role: "player" };
const gm: Actor = { userId: "GM", role: "gm" };

describe("authorizeOrDeny", () => {
  it("permite lectura y escritura al propietario cuando la regla lo admite", () => {
    const resource = { kind: "test_sheet", ownerId: "A" };
    expect(authorizeOrDeny(policy, playerA, "read", resource)).toEqual({ ok: true });
    expect(authorizeOrDeny(policy, playerA, "write", resource)).toEqual({ ok: true });
  });

  it("R75: una lectura denegada responde 404 not_found, idéntico a un recurso inexistente", () => {
    const denied = authorizeOrDeny(policy, playerB, "read", { kind: "test_sheet", ownerId: "A" });
    expect(denied).toEqual({ ok: false, denial: { status: 404, body: notFoundBody() } });
    // idéntico también para un kind inexistente y para una nota privada vista por el GM
    const unknown = authorizeOrDeny(policy, playerB, "read", { kind: "x", ownerId: "A" });
    const gmNote = authorizeOrDeny(policy, gm, "read", { kind: "test_private_note", ownerId: "A" });
    expect(unknown).toEqual(denied);
    expect(gmNote).toEqual(denied);
    expect(notFoundBody().error.code).toBe("not_found");
  });

  it("R76: escritura denegada sobre algo legible responde 403 forbidden", () => {
    const gmWrite = authorizeOrDeny(policy, gm, "write", { kind: "test_sheet", ownerId: "A" });
    expect(gmWrite).toEqual({ ok: false, denial: { status: 403, body: forbiddenBody() } });
    const ownerWrite = authorizeOrDeny(policy, playerA, "write", {
      kind: "test_readonly_owned",
      ownerId: "A",
    });
    expect(ownerWrite).toEqual({ ok: false, denial: { status: 403, body: forbiddenBody() } });
    expect(forbiddenBody().error.code).toBe("forbidden");
  });

  it("R77: escritura sobre lo que no puede leer responde 404 y no 403", () => {
    const result = authorizeOrDeny(policy, playerB, "write", { kind: "test_sheet", ownerId: "A" });
    expect(result).toEqual({ ok: false, denial: { status: 404, body: notFoundBody() } });
    const gmOnNote = authorizeOrDeny(policy, gm, "write", {
      kind: "test_private_note",
      ownerId: "A",
    });
    expect(gmOnNote).toEqual({ ok: false, denial: { status: 404, body: notFoundBody() } });
  });

  it("los cuerpos no revelan datos del recurso", () => {
    const text = JSON.stringify([notFoundBody(), forbiddenBody()]);
    expect(text).not.toContain("test_sheet");
    expect(text).not.toContain('"A"');
  });
});
