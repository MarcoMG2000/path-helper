import { describe, expect, it } from "vitest";
import {
  createAuthorizationPolicy,
  projectEventFor,
  type Actor,
  type KindRules,
  type RealtimeEvent,
} from "../../../src/server/authz";

const rules: KindRules = {
  test_sheet: { scope: "owned", ownerWrite: true, gmRead: true, gmWrite: true },
  test_private_note: { scope: "owned", ownerWrite: true, gmRead: false, gmWrite: false },
  test_shared: { scope: "shared", ownerWrite: false, gmRead: false, gmWrite: true },
};
const policy = createAuthorizationPolicy(rules);
const playerA: Actor = { userId: "A", role: "player" };
const playerB: Actor = { userId: "B", role: "player" };
const gm: Actor = { userId: "GM", role: "gm" };

const ALL_VIEWS = { gm: "vista-gm", owner: "vista-dueño", others: "vista-otros" };

function event(
  kind: string,
  ownerId: string | undefined,
  views: RealtimeEvent<string>["views"] = ALL_VIEWS,
): RealtimeEvent<string> {
  return { type: "t", resource: ownerId === undefined ? { kind } : { kind, ownerId }, views };
}

describe("projectEventFor", () => {
  it("R79: el propietario recibe la vista owner (con el type del evento)", () => {
    expect(projectEventFor(policy, playerA, event("test_sheet", "A"))).toEqual({
      type: "t",
      payload: "vista-dueño",
    });
  });

  it("R79: un GM propietario recibe la vista owner, no la gm", () => {
    expect(projectEventFor(policy, gm, event("test_private_note", "GM"))).toEqual({
      type: "t",
      payload: "vista-dueño",
    });
  });

  it("R80: el payload de A no llega a B, aunque el evento traiga vistas gm y others", () => {
    expect(projectEventFor(policy, playerB, event("test_sheet", "A"))).toBeNull();
    expect(projectEventFor(policy, playerB, event("test_private_note", "A"))).toBeNull();
  });

  it("R80: el payload de A no llega a B ni siquiera si solo existe la vista others", () => {
    const onlyOthers = event("test_sheet", "A", { others: "filtrado" });
    expect(projectEventFor(policy, playerB, onlyOthers)).toBeNull();
  });

  it("R80: ninguna cadena del payload de A aparece en lo que recibe B (barrido de actores)", () => {
    const secret = event("test_sheet", "A", {
      owner: "SECRETO-A",
      gm: "SECRETO-GM",
      others: "SECRETO-O",
    });
    const received = [playerB, { userId: "C", role: "player" as const }].map((actor) =>
      projectEventFor(policy, actor, secret),
    );
    expect(JSON.stringify(received)).not.toContain("SECRETO");
  });

  it("R81: un GM no propietario recibe la vista gm si gmRead=true", () => {
    expect(projectEventFor(policy, gm, event("test_sheet", "A"))).toEqual({
      type: "t",
      payload: "vista-gm",
    });
  });

  it("R82: un GM no propietario no recibe nada si gmRead=false (nota privada)", () => {
    expect(projectEventFor(policy, gm, event("test_private_note", "A"))).toBeNull();
  });

  it("R83: en recursos shared el GM recibe gm y el jugador others", () => {
    expect(projectEventFor(policy, gm, event("test_shared", undefined))).toEqual({
      type: "t",
      payload: "vista-gm",
    });
    for (const player of [playerA, playerB]) {
      expect(projectEventFor(policy, player, event("test_shared", undefined))).toEqual({
        type: "t",
        payload: "vista-otros",
      });
    }
  });

  it("R84: si falta la vista de la audiencia devuelve null y no usa otra como sustituta", () => {
    expect(
      projectEventFor(policy, playerA, event("test_sheet", "A", { gm: "g", others: "o" })),
    ).toBeNull();
    expect(
      projectEventFor(policy, gm, event("test_sheet", "A", { owner: "d", others: "o" })),
    ).toBeNull();
    expect(
      projectEventFor(policy, playerA, event("test_shared", undefined, { gm: "g" })),
    ).toBeNull();
    expect(
      projectEventFor(policy, gm, event("test_shared", undefined, { others: "o" })),
    ).toBeNull();
    expect(projectEventFor(policy, playerA, event("test_shared", undefined, {}))).toBeNull();
  });

  it("R84: una vista presente con valor falsy (0, cadena vacía, false) sí se entrega", () => {
    const zero: RealtimeEvent<number> = {
      type: "t",
      resource: { kind: "test_shared" },
      views: { others: 0 },
    };
    expect(projectEventFor(policy, playerA, zero)).toEqual({ type: "t", payload: 0 });
  });

  it("R85: un kind no registrado no llega a nadie, ni al GM ni al dueño", () => {
    for (const actor of [playerA, playerB, gm]) {
      expect(projectEventFor(policy, actor, event("desconocido", actor.userId))).toBeNull();
    }
  });

  it("R73/R85: un recurso owned sin ownerId no llega a nadie", () => {
    for (const actor of [playerA, gm]) {
      expect(projectEventFor(policy, actor, event("test_sheet", undefined))).toBeNull();
    }
  });

  it("una conexión por actor: de N conexiones solo recibe quien corresponde", () => {
    const connections: Actor[] = [playerA, playerB, gm];
    const delivered = connections.map(
      (c) => projectEventFor(policy, c, event("test_sheet", "A"))?.payload,
    );
    expect(delivered).toEqual(["vista-dueño", undefined, "vista-gm"]);
  });
});
