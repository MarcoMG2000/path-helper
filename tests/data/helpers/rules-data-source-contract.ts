import { describe, expect, it } from "vitest";
import type { RulesDataSource } from "../../../src/data/rules-data-source";

/** Datos sintéticos que ambas implementaciones sirven (categoría `skills`, schema base). */
export const CONTRACT_ENTRIES = [
  {
    id: "acrobatics",
    name: "Acrobatics",
    textEn: "Acrobatics text.",
    source: "https://www.aonprd.com/SkillDisplay.aspx?ItemName=Acrobatics",
    sourceRef: "PRPG Core Rulebook pg. 89",
    book: "CRB" as const,
  },
  {
    id: "stealth",
    name: "Stealth",
    textEn: "Stealth text with +5.",
    source: "https://www.aonprd.com/SkillDisplay.aspx?ItemName=Stealth",
    sourceRef: "PRPG Core Rulebook pg. 106",
    book: "CRB" as const,
  },
];

export const CONTRACT_GLOSSARY = {
  "skills:stealth": { es: "Sigilo", verified: false, origin: "draft", kind: "entry" },
  "term:flat-footed": { es: "Desprevenido", verified: false, origin: "draft", kind: "term" },
};

export const CONTRACT_SUMMARIES = {
  stealth: { summaryEs: "Pasar desapercibido (+5).", status: "draft" as const },
};

export const CONTRACT_SPELL_LISTS = { cleric: { "0": ["guidance"], "1": ["bless"] } };

/** Contrato compartido (R58, R59, R35): se ejecuta contra todas las implementaciones. */
export function runRulesDataSourceContract(
  name: string,
  create: () => Promise<RulesDataSource> | RulesDataSource,
): void {
  describe(`contrato RulesDataSource: ${name}`, () => {
    it("R58: get devuelve la entrada localizada (SRD + capa ES)", async () => {
      const source = await create();
      const found = await source.get("skills", "stealth");
      expect(found?.entry.id).toBe("stealth");
      expect(found?.entry.name).toBe("Stealth");
      expect(found?.nameEs).toBe("Sigilo");
      expect(found?.nameEsVerified).toBe(false);
      expect(found?.summaryEs).toBe("Pasar desapercibido (+5).");
      expect(found?.summaryStatus).toBe("draft");
    });

    it("R35: sin glosario ni resumen expone nameEs null sin lanzar", async () => {
      const source = await create();
      const found = await source.get("skills", "acrobatics");
      expect(found?.nameEs).toBeNull();
      expect(found?.nameEsVerified).toBe(false);
      expect(found?.summaryEs).toBeNull();
      expect(found?.summaryStatus).toBeNull();
    });

    it("R59: un id inexistente devuelve undefined sin lanzar", async () => {
      const source = await create();
      await expect(source.get("skills", "does-not-exist")).resolves.toBeUndefined();
      await expect(source.get("feats", "power-attack")).resolves.toBeUndefined();
    });

    it("R58: list devuelve todas las entradas localizadas de la categoría", async () => {
      const source = await create();
      const all = await source.list("skills");
      expect(all.map((l) => l.entry.id).sort()).toEqual(["acrobatics", "stealth"]);
      expect(await source.list("feats")).toEqual([]);
    });

    it("R58: getSpellList devuelve la lista de una clase con lista y undefined para otra", async () => {
      const source = await create();
      expect(await source.getSpellList("cleric")).toEqual(CONTRACT_SPELL_LISTS.cleric);
      expect(await source.getSpellList("wizard")).toBeUndefined();
    });

    it("R38: getLegalNotice expone el aviso OGL", async () => {
      const source = await create();
      const notice = source.getLegalNotice();
      expect(notice.oglText).toContain("OPEN GAME LICENSE");
      expect(notice.section15.length).toBeGreaterThan(0);
    });
  });
}
