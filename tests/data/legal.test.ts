import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getLegalNotice, renderLegalMarkdown } from "../../src/data/legal";
import { PROVENANCE_LICENSE, ProvenanceSchema } from "../../src/data/schema/provenance";
import { ROOT } from "../project/helpers";

const md = readFileSync(resolve(ROOT, "LICENSE-OGL.md"), "utf8");
const notice = getLegalNotice();

describe("aviso legal OGL", () => {
  it("R37: LICENSE-OGL.md contiene el texto íntegro de la OGL 1.0a (15 cláusulas)", () => {
    expect(notice.oglText.startsWith("OPEN GAME LICENSE Version 1.0a")).toBe(true);
    for (let n = 1; n <= 15; n++) {
      expect(notice.oglText, `cláusula ${n}`).toMatch(new RegExp(`(^|\\n)${n}\\. `));
    }
    expect(md).toContain(notice.oglText);
    expect(md).toContain("Wizards of the Coast");
  });

  it("R37: la Section 15 incluye los avisos del Core Rulebook y del Reference Document", () => {
    expect(
      notice.section15.some((s) =>
        s.startsWith(
          "Pathfinder Roleplaying Game Core Rulebook. © 2009, Paizo Publishing, LLC; Author: Jason Bulmahn",
        ),
      ),
    ).toBe(true);
    expect(
      notice.section15.some((s) =>
        s.startsWith(
          "Pathfinder Roleplaying Game Reference Document. © 2011, Paizo Publishing, LLC",
        ),
      ),
    ).toBe(true);
    expect(
      notice.section15.some((s) =>
        s.startsWith("Open Game License v 1.0a Copyright 2000, Wizards of the Coast"),
      ),
    ).toBe(true);
    for (const entry of notice.section15) expect(md).toContain(entry);
  });

  it("R38: getLegalNotice() coincide con LICENSE-OGL.md (que es su render canónico)", () => {
    expect(md).toBe(renderLegalMarkdown(notice));
    expect(notice.unofficialNotice).toMatch(/no oficial/);
    expect(md).toContain(notice.unofficialNotice);
  });

  it("R38: devuelve copias (modificar el resultado no altera el módulo)", () => {
    getLegalNotice().section15.push("x");
    expect(getLegalNotice().section15).not.toContain("x");
  });

  it("R39: la licencia de procedencia es OGL-1.0a y el schema rechaza otra", () => {
    expect(PROVENANCE_LICENSE).toBe("OGL-1.0a");
    const base = {
      category: "feats",
      importerVersion: "1",
      humanReviewed: false,
      pages: [],
    };
    expect(ProvenanceSchema.safeParse({ ...base, license: "OGL-1.0a" }).success).toBe(true);
    expect(ProvenanceSchema.safeParse({ ...base, license: "CC0" }).success).toBe(false);
    expect(ProvenanceSchema.safeParse(base).success).toBe(false);
  });
});
