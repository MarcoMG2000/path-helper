import { describe, expect, it } from "vitest";
import { loadDataset, loadIntegrityContext } from "../../scripts/srd/lib/load-dataset";
import { runIntegrity } from "../../src/data/integrity";
import { mergeProvenance } from "../../src/data/schema/provenance";
import { SkillSchema, type Skill } from "../../src/data/schema/skill";
import { ROOT } from "../project/helpers";

// Datos reales de `skills` (Lote B). Los valores de referencia salen de la propia fuente (AoN, cabecera
// de cada página de habilidad y «Skill Uses [27]» de la página de fuente PRPG Core Rulebook).
const { data, issues: loadIssues } = loadDataset(ROOT, ["skills"]);
const skills = (data.entries.skills ?? []).map((e) => SkillSchema.parse(e));
const byId = new Map<string, Skill>(skills.map((s) => [s.id, s]));
const get = (id: string): Skill => {
  const skill = byId.get(id);
  if (!skill) throw new Error(`falta la habilidad ${id}`);
  return skill;
};

const KNOWLEDGE = [
  "arcana",
  "dungeoneering",
  "engineering",
  "geography",
  "history",
  "local",
  "nature",
  "nobility",
  "planes",
  "religion",
];
const EXPECTED_IDS = [
  "acrobatics",
  "appraise",
  "bluff",
  "climb",
  "craft",
  "diplomacy",
  "disable-device",
  "disguise",
  "escape-artist",
  "fly",
  "handle-animal",
  "heal",
  "intimidate",
  ...KNOWLEDGE.map((s) => `knowledge-${s}`),
  "linguistics",
  "perception",
  "perform",
  "profession",
  "ride",
  "sense-motive",
  "sleight-of-hand",
  "spellcraft",
  "stealth",
  "survival",
  "swim",
  "use-magic-device",
];

describe("skills reales: recuento, ids y procedencia (R16, R26, R27)", () => {
  it("R16: exactamente las 35 habilidades (Knowledge expandido; Craft, Perform y Profession únicos)", () => {
    expect(skills.map((s) => s.id).sort()).toEqual([...EXPECTED_IDS].sort());
    expect(skills).toHaveLength(35);
    expect(byId.has("knowledge")).toBe(false);
    expect(byId.has("knowledge-all")).toBe(false);
    expect(skills.filter((s) => s.id.startsWith("craft"))).toHaveLength(1);
    expect(skills.filter((s) => s.id.startsWith("perform"))).toHaveLength(1);
    expect(skills.filter((s) => s.id.startsWith("profession"))).toHaveLength(1);
  });

  it("R26: el recuento coincide con el expectedCount congelado (26 páginas - Knowledge + 10 = 35)", () => {
    const provenance = mergeProvenance(data.provenanceParts.skills ?? []);
    expect(provenance.expectedCount).toBe(35);
    expect(skills).toHaveLength(35);
    expect(provenance.license).toBe("OGL-1.0a");
  });

  it("R27/R3/R7: todas son del CRB y apuntan a su página en AoN", () => {
    for (const skill of skills) {
      expect(skill.book).toBe("CRB");
      expect(skill.sourceRef).toMatch(/^PRPG Core Rulebook pg\. \d+$/);
      expect(skill.source).toMatch(/^https:\/\/aonprd\.com\/Skills\.aspx\?ItemName=/);
    }
  });

  it("R2-R8/R28-R31/R33: la integridad de la categoría no tiene hallazgos", () => {
    const found = runIntegrity(data, loadIntegrityContext(ROOT), { categories: ["skills"] });
    expect([...loadIssues, ...found]).toEqual([]);
  });
});

describe("skills reales: goldens de la fuente (R16)", () => {
  it("Stealth: Dex, penalizador de armadura, no solo entrenada (CRB pg. 106)", () => {
    const stealth = get("stealth");
    expect(stealth.name).toBe("Stealth");
    expect(stealth.keyAbility).toBe("dex");
    expect(stealth.armorCheckPenalty).toBe(true);
    expect(stealth.trainedOnly).toBe(false);
    expect(stealth.sourceRef).toBe("PRPG Core Rulebook pg. 106");
    expect(stealth.knowledgeSubject).toBeUndefined();
    expect(stealth.textEn).toContain(
      "**Check**: Your Stealth check is opposed by the Perception check",
    );
  });

  it("Knowledge (arcana): Int, solo entrenada, sin penalizador de armadura (CRB pg. 99)", () => {
    const arcana = get("knowledge-arcana");
    expect(arcana.name).toBe("Knowledge (arcana)");
    expect(arcana.keyAbility).toBe("int");
    expect(arcana.trainedOnly).toBe(true);
    expect(arcana.armorCheckPenalty).toBe(false);
    expect(arcana.knowledgeSubject).toBe("arcana");
    expect(arcana.sourceRef).toBe("PRPG Core Rulebook pg. 99");
  });

  it("las 10 materias de Knowledge son Int, solo entrenadas, sin penalizador, con su materia", () => {
    for (const subject of KNOWLEDGE) {
      const skill = get(`knowledge-${subject}`);
      expect(skill.name).toBe(`Knowledge (${subject})`);
      expect(skill.keyAbility).toBe("int");
      expect(skill.trainedOnly).toBe(true);
      expect(skill.armorCheckPenalty).toBe(false);
      expect(skill.knowledgeSubject).toBe(subject);
    }
  });

  it("característica clave, solo entrenada y penalizador de armadura de las demás habilidades", () => {
    // [característica, solo entrenada, penalizador de armadura], leído de la cabecera de cada página.
    const table: Record<string, [string, boolean, boolean]> = {
      acrobatics: ["dex", false, true],
      appraise: ["int", false, false],
      bluff: ["cha", false, false],
      climb: ["str", false, true],
      craft: ["int", false, false],
      diplomacy: ["cha", false, false],
      "disable-device": ["dex", true, true],
      disguise: ["cha", false, false],
      "escape-artist": ["dex", false, true],
      fly: ["dex", false, true],
      "handle-animal": ["cha", true, false],
      heal: ["wis", false, false],
      intimidate: ["cha", false, false],
      linguistics: ["int", true, false],
      perception: ["wis", false, false],
      perform: ["cha", false, false],
      profession: ["wis", true, false],
      ride: ["dex", false, true],
      "sense-motive": ["wis", false, false],
      "sleight-of-hand": ["dex", true, true],
      spellcraft: ["int", true, false],
      stealth: ["dex", false, true],
      survival: ["wis", false, false],
      swim: ["str", false, true],
      "use-magic-device": ["cha", true, false],
    };
    for (const [id, [ability, trained, acp]] of Object.entries(table)) {
      const skill = get(id);
      expect([skill.keyAbility, skill.trainedOnly, skill.armorCheckPenalty], id).toEqual([
        ability,
        trained,
        acp,
      ]);
    }
    expect(Object.keys(table)).toHaveLength(25);
  });
});

describe("skills reales: texto (R8, R27)", () => {
  it("el textEn no lleva HTML ni contenido de otros libros", () => {
    for (const skill of skills) {
      expect(skill.textEn, skill.id).not.toMatch(/<[a-z]/i);
      expect(skill.textEn, skill.id).not.toContain("Skill Unlock");
      expect(skill.textEn, skill.id).not.toContain("Unchained");
    }
  });

  it("las 10 entradas de Knowledge comparten el texto íntegro de Knowledge (lista de materias y tabla)", () => {
    const texts = new Set(KNOWLEDGE.map((s) => get(`knowledge-${s}`).textEn));
    expect(texts.size).toBe(1);
    const text = [...texts][0]!;
    expect(text).toContain("- Engineering (buildings, aqueducts, bridges, fortifications)");
    expect(text).toContain("| **Task** | **Knowledge Skill** | **DC** |");
    expect(text).toContain("**Untrained**: You cannot make an untrained Knowledge check");
  });

  it("Diplomacy incluye la sección «Directing Crowds» del CRB (pg. 436) y nada más de otros libros", () => {
    const text = get("diplomacy").textEn;
    expect(text).toContain("**Directing Crowds**");
    expect(text).not.toContain("Calling for the Guards");
    expect(text).not.toContain("Hypnotism");
  });
});

describe("skills reales: capa ES (R28-R31, R33)", () => {
  it("R28/R29: 35 resúmenes draft, uno por habilidad", () => {
    const merged: Record<string, { status: string }> = {};
    for (const part of data.summaryParts.skills ?? []) Object.assign(merged, part.data);
    expect(Object.keys(merged).sort()).toEqual(skills.map((s) => s.id).sort());
    for (const summary of Object.values(merged)) expect(summary.status).toBe("draft");
  });

  it("R31/R33: 35 claves de glosario `skills:*`, todas draft sin verificar", () => {
    const keys: Record<string, { verified: boolean; origin: string; kind: string }> = {};
    for (const shard of data.glossary.shards) {
      for (const [k, v] of Object.entries(shard.data as typeof keys)) {
        if (k.startsWith("skills:")) keys[k] = v;
      }
    }
    expect(Object.keys(keys).sort()).toEqual(skills.map((s) => `skills:${s.id}`).sort());
    for (const value of Object.values(keys)) {
      expect(value.verified).toBe(false);
      expect(value.origin).toBe("draft");
      expect(value.kind).toBe("entry");
    }
  });
});

describe("skills reales: referencias de otras categorías (R14, R12)", () => {
  it("los classSkills de las clases cargadas resuelven a ids de skills (solo si classes está cargada)", () => {
    const withClasses = loadDataset(ROOT, ["classes", "skills"]);
    const ids = new Set(skills.map((s) => s.id));
    const unknown: string[] = [];
    for (const raw of withClasses.data.entries.classes ?? []) {
      const entry = raw as { id: string; classSkills: string[] };
      for (const skillId of entry.classSkills) {
        if (!ids.has(skillId)) unknown.push(`${entry.id}: ${skillId}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});
