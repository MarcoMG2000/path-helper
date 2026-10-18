import { describe, expect, it } from "vitest";
import { loadDataset, loadIntegrityContext } from "../../scripts/srd/lib/load-dataset";
import { runIntegrity } from "../../src/data/integrity";
import { mergeProvenance } from "../../src/data/schema/provenance";
import { FEAT_TYPES, FeatSchema, type Feat } from "../../src/data/schema/feat";
import { ROOT } from "../project/helpers";

// Datos reales de `feats` (Lote C). Los valores de referencia salen del spec (design.md §5) y de la
// propia fuente (AoN: «Feats [176]» de la página de fuente PRPG Core Rulebook).
const { data, issues: loadIssues } = loadDataset(ROOT, ["feats"]);
const feats = (data.entries.feats ?? []).map((e) => FeatSchema.parse(e));
const byId = new Map<string, Feat>(feats.map((f) => [f.id, f]));
const get = (id: string): Feat => {
  const f = byId.get(id);
  if (!f) throw new Error(`falta la dote ${id}`);
  return f;
};

describe("feats reales: recuento y procedencia (R17, R26, R27)", () => {
  it("R26: el recuento coincide con el expectedCount congelado (176, «Feats [176]» de AoN)", () => {
    const provenance = mergeProvenance(data.provenanceParts.feats ?? []);
    expect(provenance.expectedCount).toBe(176);
    expect(feats).toHaveLength(176);
    expect(new Set(feats.map((f) => f.id)).size).toBe(176);
    expect(provenance.license).toBe("OGL-1.0a");
  });

  it("R27/R3/R7: todas las dotes son del CRB y apuntan a una página de AoN", () => {
    for (const f of feats) {
      expect(f.book).toBe("CRB");
      expect(f.sourceRef).toMatch(/^PRPG Core Rulebook pg\. \d+$/);
      expect(f.source).toMatch(/^https:\/\/aonprd\.com\/FeatDisplay\.aspx\?ItemName=/);
    }
  });

  it("R18/R19/R2-R8/R28-R30: la integridad de la categoría no tiene hallazgos", () => {
    const found = runIntegrity(data, loadIntegrityContext(ROOT), { categories: ["feats"] });
    expect([...loadIssues, ...found]).toEqual([]);
  });

  it("R17: los tipos son los cinco permitidos y hay de todos", () => {
    const seen = new Set(feats.flatMap((f) => f.types));
    for (const type of FEAT_TYPES) expect(seen.has(type), type).toBe(true);
  });

  it("R17: raw se conserva siempre que haya algo estructurado", () => {
    for (const f of feats) {
      const p = f.prerequisites;
      const structured =
        p.abilities !== undefined ||
        p.bab !== undefined ||
        p.casterLevel !== undefined ||
        p.featIds.length > 0 ||
        p.skills.length > 0 ||
        p.other.length > 0;
      if (structured) expect(p.raw, f.id).not.toBe("");
    }
  });

  it("R17/R49: las dotes con varias etiquetas Source se marcaron needsReview al parsear y un override con el PRD las resuelve", () => {
    // El parser marca extra-channel y rapid-reload (Source CRB + otros libros); sus overrides sustituyen el
    // texto reimpreso por el del PRD y cierran la marca. Ninguna otra dote queda pendiente.
    expect(feats.filter((f) => f.needsReview).map((f) => f.id)).toEqual([]);
    const applied = mergeProvenance(data.provenanceParts.feats ?? []).overridesApplied ?? [];
    const cleared = applied.filter((o) => o.field === "needsReview" && o.parsedValue === true);
    expect(cleared.map((o) => o.id).sort()).toEqual(["extra-channel", "rapid-reload"]);
  });
});

describe("feats reales: goldens del spec (R17, R18, R19)", () => {
  it("Power Attack: Str 13, BAB +1; Combat; CRB pg. 131", () => {
    const f = get("power-attack");
    expect(f.name).toBe("Power Attack");
    expect(f.types).toEqual(["Combat"]);
    expect(f.sourceRef).toBe("PRPG Core Rulebook pg. 131");
    expect(f.prerequisites.abilities).toEqual({ str: 13 });
    expect(f.prerequisites.bab).toBe(1);
    expect(f.prerequisites.featIds).toEqual([]);
  });

  it("Power Attack: conserva íntegro el texto de combate que afecta al cálculo de daño", () => {
    const f = get("power-attack");
    expect(f.benefit).toBe(
      "You can choose to take a –1 penalty on all melee attack rolls and combat maneuver checks to gain a +2 bonus on all melee damage rolls. " +
        "This bonus to damage is increased by half (+50%) if you are making an attack with a two-handed weapon, a one handed weapon using two hands, or a primary natural weapon that adds 1-1/2 times your Strength modifier on damage rolls. " +
        "This bonus to damage is halved (–50%) if you are making an attack with an off-hand weapon or secondary natural weapon. " +
        "When your base attack bonus reaches +4, and every 4 points thereafter, the penalty increases by –1 and the bonus to damage increases by +2. " +
        "You must choose to use this feat before making an attack roll, and its effects last until your next turn. " +
        "The bonus damage does not apply to touch attacks or effects that do not deal hit point damage.",
    );
  });

  it("Cleave: Str 13 y Power Attack (la fuente añade además BAB +1, que el golden no menciona)", () => {
    const p = get("cleave").prerequisites;
    expect(p.abilities).toEqual({ str: 13 });
    expect(p.featIds).toEqual(["power-attack"]);
    expect(p.bab).toBe(1);
  });

  it("Great Cleave: Str 13, Cleave, Power Attack, BAB +4", () => {
    const p = get("great-cleave").prerequisites;
    expect(p.abilities).toEqual({ str: 13 });
    expect([...p.featIds].sort()).toEqual(["cleave", "power-attack"]);
    expect(p.bab).toBe(4);
  });

  it("R19: la cadena Great Cleave -> Cleave -> Power Attack no tiene ciclos (sube hasta una dote sin dotes previas)", () => {
    const seen = new Set<string>();
    const walk = (id: string, path: readonly string[]): void => {
      expect(path.includes(id), `ciclo: ${[...path, id].join(" -> ")}`).toBe(false);
      seen.add(id);
      for (const next of get(id).prerequisites.featIds) walk(next, [...path, id]);
    };
    walk("great-cleave", []);
    expect([...seen].sort()).toEqual(["cleave", "great-cleave", "power-attack"]);
  });

  it("dotes de combate que afectan al cálculo: Two-Weapon Fighting, Deadly Aim, Combat Expertise, Weapon Focus", () => {
    expect(get("two-weapon-fighting").prerequisites.abilities).toEqual({ dex: 15 });
    expect(get("deadly-aim").benefit).toContain("+2 bonus on all ranged damage rolls");
    expect(get("combat-expertise").benefit).toContain("+1 dodge bonus to your Armor Class");
    expect(get("weapon-focus").benefit).toBe(
      "You gain a +1 bonus on all attack rolls you make using the selected weapon.",
    );
    expect(get("improved-initiative").benefit).toBe("You get a +4 bonus on initiative checks.");
  });

  it("habilidad, lanzador y metamágicas", () => {
    expect(get("mounted-combat").prerequisites.skills).toEqual([{ skillId: "ride", ranks: 1 }]);
    expect(get("craft-wand").prerequisites.casterLevel).toBe(5);
    expect(get("empower-spell").types).toEqual(["Metamagic"]);
    expect(get("alertness").types).toEqual(["General"]);
  });
});

describe("feats reales: capa ES (R28-R31, R33)", () => {
  it("R28/R29: toda dote tiene resumen en borrador (la integridad lo comprueba también)", () => {
    const merged: Record<string, { status: string }> = {};
    for (const part of data.summaryParts.feats ?? []) Object.assign(merged, part.data);
    expect(Object.keys(merged)).toHaveLength(176);
    expect(Object.values(merged).every((s) => s.status === "draft")).toBe(true);
  });

  it("R31/R32/R33: glosario draft sin verificar para cada dote; Power Attack usa el término del spec", () => {
    const keys: Record<string, { es: string; verified: boolean; origin: string; kind: string }> =
      {};
    for (const shard of data.glossary.shards) {
      for (const [k, v] of Object.entries(shard.data as typeof keys)) {
        if (k.startsWith("feats:")) keys[k] = v;
      }
    }
    expect(Object.keys(keys)).toHaveLength(176);
    expect(Object.values(keys).every((g) => !g.verified && g.origin === "draft")).toBe(true);
    expect(Object.values(keys).every((g) => g.kind === "entry")).toBe(true);
    expect(keys["feats:power-attack"]?.es).toBe("Ataque poderoso");
  });
});
