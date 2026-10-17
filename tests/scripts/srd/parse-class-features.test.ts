import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discover, parse } from "../../../scripts/srd/parsers/class-features";
import type { ParserInput, ParserPage } from "../../../scripts/srd/lib/parser-contract";
import { SectionError } from "../../../scripts/srd/lib/sections";
import { ClassFeatureSchema } from "../../../src/data/schema/class-feature";
import { ROOT } from "../../project/helpers";

const fixtures = resolve(ROOT, "tests", "fixtures", "srd-html");
const read = (dir: string, name: string): string =>
  readFileSync(resolve(fixtures, dir, `${name}.html`), "utf8");
const A = "https://www.aonprd.com/";
const page = (path: string, html: string): ParserPage => ({
  url: A + path,
  html,
  sha256: "0".repeat(64),
});
const cls = (c: string): ParserPage =>
  page(`ClassDisplay.aspx?ItemName=${c}`, read("classes", c.toLowerCase()));
const domain = (d: string): ParserPage =>
  page(`DomainDisplay.aspx?ItemName=${d}`, read("domains", d.toLowerCase()));

const ALLOWED = [
  "Class Skills",
  "Class Features",
  "Ex-Barbarians",
  "Ex-Clerics",
  "Ex-Druids",
  "Ex-Paladins",
  "Rogue Talents",
  "Advanced Rogue Talents",
  "Sneak Attack Talents",
  "Other Talents",
  "Barbarian Rage Powers",
  "Offensive Rage Powers",
  "Mercies",
  "3rd-Level Mercies",
  "6th-Level Mercies",
  "9th-Level Mercies",
  "12th-Level Mercies",
  "Ranger Combat Styles",
];
const config = { allowedSections: ALLOWED, slugAliases: {} };
const input = (pages: ParserPage[]): ParserInput => ({
  category: "class-features",
  subset: undefined,
  pages,
  config,
});

const allPages = (): ParserPage[] => [
  cls("Rogue"),
  page("RogueTalents.aspx", read("classes", "rogue-talents")),
  cls("Barbarian"),
  page("BarbarianRagePowers.aspx?Type=Offensive", read("classes", "rage-powers-offensive")),
  cls("Paladin"),
  page("PaladinMercies.aspx", read("classes", "paladin-mercies")),
  cls("Ranger"),
  page("RangerCombatStyles.aspx", read("classes", "ranger-combat-styles")),
  cls("Cleric"),
  cls("Bard"),
  domain("Air"),
  domain("Death"),
  domain("Chaos"),
  domain("Scalykind"),
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- datos JSON de prueba sin tipar
type Row = Record<string, any>;
const byId = (entries: readonly Row[]): Map<string, Row> =>
  new Map(entries.map((e) => [e.id as string, e]));

describe("parser de class-features: capacidades de la página de clase (R13)", () => {
  const out = parse(input(allPages()));
  const entries = byId(out.entries as unknown as Row[]);

  it("R13: todas las entradas pasan el schema real", () => {
    for (const entry of out.entries) {
      const result = ClassFeatureSchema.safeParse(entry);
      expect(result.success, String(entry.id)).toBe(true);
    }
  });

  it("R13: el paladín tiene sus capacidades con tipo y nivel de la tabla", () => {
    expect(entries.get("paladin.smite-evil")).toMatchObject({
      name: "Smite Evil",
      abilityType: "Su",
      level: 1,
      kind: "feature",
      classId: "paladin",
    });
    expect(entries.get("paladin.lay-on-hands")).toMatchObject({ level: 2, abilityType: "Su" });
    expect(entries.get("paladin.divine-bond")).toMatchObject({ level: 5, abilityType: "Sp" });
    expect(entries.get("paladin.holy-champion")).toMatchObject({ level: 20 });
  });

  it("R13: una capacidad sin marcador tiene abilityType null y la de nivel solo en el texto lo deriva", () => {
    expect(entries.get("rogue.sneak-attack")!["abilityType"]).toBeNull();
    expect(entries.get("rogue.trapfinding")!["abilityType"]).toBeNull();
    expect(entries.get("paladin.spells")).toMatchObject({ level: 4 });
  });

  it("R13: 'Medium Paladins' / 'Small Paladins' son parte de Divine Bond y no capacidades", () => {
    expect([...entries.keys()].filter((id) => id.includes("medium-paladins"))).toEqual([]);
    expect(entries.get("paladin.divine-bond")!["textEn"]).toContain("Medium Paladins");
  });

  it("las notas de Archives of Nethys no entran en el texto y se cuentan", () => {
    expect(entries.get("rogue.rogue-talents")!["textEn"]).not.toContain("Nethys");
    expect(out.counters?.["notas editoriales de Archives of Nethys retiradas"]).toBeGreaterThan(0);
  });

  it("la tabla de enemigos favoritos (antes del rótulo en AoN) pertenece a Favored Enemy", () => {
    const text = entries.get("ranger.favored-enemy")!["textEn"] as string;
    expect(text).toContain("Type (Subtype)");
    expect(entries.get("ranger.weapon-and-armor-proficiency")!["textEn"]).not.toContain(
      "Type (Subtype)",
    );
  });

  it("R13: las subcapacidades del bardo son opciones de Bardic Performance", () => {
    expect(entries.get("bard.performance.inspire-courage")).toMatchObject({
      kind: "option",
      parentId: "bard.bardic-performance",
      abilityType: "Su",
      level: 1,
    });
    expect(entries.get("bard.performance.suggestion")).toMatchObject({
      abilityType: "Sp",
      level: 6,
    });
  });
});

describe("parser de class-features: opciones elegibles (R13)", () => {
  const out = parse(input(allPages()));
  const entries = byId(out.entries as unknown as Row[]);

  it("R13: talentos de pícaro CRB, con el padre y el nivel de Rogue Talents", () => {
    expect(entries.get("rogue.talent.bleeding-attack")).toMatchObject({
      kind: "option",
      parentId: "rogue.rogue-talents",
      abilityType: "Ex",
      level: 2,
      sourceRef: "PRPG Core Rulebook pg. 68",
    });
    expect(entries.get("rogue.talent.combat-trick")).toMatchObject({ abilityType: null });
    expect(entries.get("rogue.advanced-talent.crippling-strike")).toMatchObject({
      parentId: "rogue.advanced-talents",
      level: 10,
    });
  });

  it("R46: las opciones de otros libros se descartan y se cuentan por libro", () => {
    expect(entries.has("rogue.talent.armor-piercer")).toBe(false);
    expect(entries.has("rogue.talent.accurate-poisoner")).toBe(false);
    expect(entries.has("barbarian.rage-power.armor-ripper")).toBe(false);
    expect(out.counters?.["opciones descartadas: Monster Hunter's Handbook"]).toBe(1);
    expect(out.counters?.["opciones descartadas: Blood of the Moon"]).toBe(1);
    expect(out.counters?.["opciones de otro libro descartadas"]).toBeGreaterThanOrEqual(5);
  });

  it("R13: poderes de furia, misericordias y estilos de combate", () => {
    expect(entries.get("barbarian.rage-power.knockback")).toMatchObject({
      parentId: "barbarian.rage-powers",
      level: 2,
    });
    expect(entries.get("paladin.mercy.fatigued")).toMatchObject({
      level: 3,
      parentId: "paladin.mercy",
    });
    expect(entries.get("paladin.mercy.dazed")!["level"]).toBe(6);
    expect(entries.get("paladin.mercy.cursed")!["level"]).toBe(9);
    expect(entries.get("paladin.mercy.blinded")!["level"]).toBe(12);
    expect(entries.has("paladin.mercy.deceived")).toBe(false); // Healer's Handbook
    expect(entries.get("ranger.combat-style.archery")).toMatchObject({
      parentId: "ranger.combat-style-feat",
    });
    expect(entries.has("ranger.combat-style.crossbow")).toBe(false); // APG
    expect(entries.get("ranger.combat-style.two-weapon-combat")).toBeDefined();
  });

  it("R13: poderes de dominio como opciones del clérigo, con su nivel", () => {
    expect(entries.get("cleric.domain.air.lightning-arc")).toMatchObject({
      kind: "option",
      classId: "cleric",
      parentId: "cleric.domains",
      abilityType: "Sp",
      level: 1,
    });
    expect(entries.get("cleric.domain.air.electricity-resistance")).toMatchObject({ level: 6 });
    expect(entries.get("cleric.domain.death.bleeding-touch")).toBeDefined();
  });

  it("R46: las páginas de dominio de otro libro se excluyen y se listan", () => {
    expect(out.excluded.map((e) => e.book)).toEqual(["Book of the Damned"]);
    expect(out.excluded[0]!.url).toContain("Scalykind");
    expect([...entries.keys()].some((id) => id.includes("scalykind"))).toBe(false);
  });

  it("los subdominios y las variantes de otro libro no generan opciones", () => {
    expect([...entries.keys()].some((id) => id.includes("murder") || id.includes("urgathoa"))).toBe(
      false,
    );
  });

  it("R45: un encabezado desconocido en una página de opciones detiene el parseo", () => {
    const html = read("classes", "rogue-talents").replace(
      "Sneak Attack Talents",
      "Talents of Another Book",
    );
    expect(() => parse(input([cls("Rogue"), page("RogueTalents.aspx", html)]))).toThrowError(
      SectionError,
    );
  });

  it("una opción sin su capacidad padre en las páginas procesadas falla", () => {
    expect(() =>
      parse(input([page("RogueTalents.aspx", read("classes", "rogue-talents"))])),
    ).toThrow(/rogue\.rogue-talents/);
  });

  it("una entrada con un formato de fuente inesperado falla en lugar de adivinar", () => {
    const html = read("classes", "rogue-talents").replace(
      /\(<a [^>]*><i>PRPG Core Rulebook pg\. 68<\/i><\/a>\):/,
      "(sin enlace):",
    );
    expect(() => parse(input([cls("Rogue"), page("RogueTalents.aspx", html)]))).toThrow(/fuente/);
  });
});

describe("parser de class-features: reparto y orden", () => {
  it("cada capacidad va al fichero de su clase", () => {
    const out = parse(input(allPages()));
    const files = new Set(out.entries.map((e) => out.shardOf!(e)));
    expect([...files].sort()).toEqual([
      "class-features/barbarian.json",
      "class-features/bard.json",
      "class-features/cleric.json",
      "class-features/paladin.json",
      "class-features/ranger.json",
      "class-features/rogue.json",
    ]);
    const clericDomain = out.entries.find((e) => e.id === "cleric.domain.air.lightning-arc")!;
    expect(out.shardOf!(clericDomain)).toBe("class-features/cleric.json");
  });

  it("R44: dos ejecuciones producen el mismo resultado", () => {
    expect(JSON.stringify(parse(input(allPages())))).toBe(JSON.stringify(parse(input(allPages()))));
  });

  it("discover congela el recuento de entradas que producirá el parseo", () => {
    const pages = allPages();
    const found = discover({
      category: "class-features",
      subset: undefined,
      seedPages: pages,
      config,
    });
    expect(found.expectations).toEqual({ expectedCount: parse(input(pages)).entries.length });
  });

  it("una URL sin parser detiene el parseo", () => {
    expect(() => parse(input([page("Unknown.aspx", "<html></html>")]))).toThrow(/no hay parser/);
  });
});
