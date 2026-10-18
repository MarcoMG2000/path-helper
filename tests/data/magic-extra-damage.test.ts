import { describe, expect, it } from "vitest";
import { loadDataset } from "../../scripts/srd/lib/load-dataset";
import { extractExtraDamage } from "../../scripts/srd/parsers/magic-items/effects";
import {
  getExtraDamage,
  getWeaponAbilitiesExtraDamage,
  weaponCritMultiplier,
  type WeaponAbilityLike,
} from "../../src/data/magic-items/extra-damage";
import { WeaponSchema } from "../../src/data/schema/equipment";
import {
  ExtraDamageSchema,
  MagicItemSchema,
  MagicVariantSchema,
  critAlternativeIssues,
  type ExtraDamage,
  type MagicItem,
} from "../../src/data/schema/magic-item";
import { ROOT } from "../project/helpers";
import { effect, magicBase } from "./helpers/magic";

// Corrección B de f3 (defecto D6 del reviewer): el daño de crítico de *flaming burst* y análogos
// depende del multiplicador de crítico del arma. Los textos de abajo son LITERALES del PRD oficial
// de Paizo (https://paizo.com/pathfinderRPG/prd/coreRulebook/magicItems/weapons.html, apartado
// «Weapon Special Ability Descriptions»), consultado el 2026-10-17.

const PRD_FLAMING_BURST =
  "**Aura** strong evocation; **CL** 12th; **Slot** weapon quality; **Price** +2 bonus; **Weight** —\n\n**Description**\n\nA *flaming burst weapon* functions as a *flaming weapon* that also explodes with flame upon striking a successful critical hit. The fire does not harm the wielder. In addition to the extra fire damage from the *flaming* ability (see above), a *flaming burst weapon* deals an extra 1d10 points of fire damage on a successful critical hit. If the weapon's critical multiplier is ×3, add an extra 2d10 points of fire damage instead, and if the multiplier is ×4, add an extra 3d10 points of fire damage.";

const PRD_ICY_BURST =
  "**Description**\n\nAn *icy burst weapon* functions as a *frost weapon* that also explodes with frost upon striking a successful critical hit. The frost does not harm the wielder. In addition to the extra damage from the *frost* ability, an *icy burst weapon* deals an extra 1d10 points of cold damage on a successful critical hit. If the weapon's critical multiplier is ×3, add an extra 2d10 points of cold damage instead, and if the multiplier is ×4, add an extra 3d10 points.";

const PRD_SHOCKING_BURST =
  "**Description**\n\nA *shocking burst weapon* functions as a *shock weapon* that explodes with electricity upon striking a successful critical hit. The electricity does not harm the wielder. In addition to the extra electricity damage from the *shock* ability, a *shocking burst weapon* deals an extra 1d10 points of electricity damage on a successful critical hit. If the weapon's critical multiplier is ×3, add an extra 2d10 points of electricity damage instead, and if the multiplier is ×4, add an extra 3d10 points.";

const PRD_THUNDERING =
  "**Description**\n\nA *thundering weapon* creates a cacophonous roar like thunder upon striking a successful critical hit. The sonic energy does not harm the wielder. A *thundering weapon* deals an extra 1d8 points of sonic damage on a successful critical hit. If the weapon's critical multiplier is ×3, add an extra 2d8 points of sonic damage instead, and if the multiplier is ×4, add an extra 3d8 points of sonic damage. Subjects dealt critical hits by a *thundering weapon* must make a DC 14 Fortitude save or be deafened permanently.";

const summary = (damage: readonly ExtraDamage[]) =>
  damage.map((d) => [d.dice, d.damageType, d.trigger, d.critMultiplier]);

describe("extractExtraDamage: multiplicador de crítico (R78, texto literal del PRD)", () => {
  it("flaming burst: 1d10 con ×2, 2d10 con ×3 y 3d10 con ×4, cada uno con su multiplicador", () => {
    expect(summary(extractExtraDamage(PRD_FLAMING_BURST))).toEqual([
      ["1d10", "fire", "onCritical", 2],
      ["2d10", "fire", "onCritical", 3],
      ["3d10", "fire", "onCritical", 4],
    ]);
  });

  it("icy burst y shocking burst heredan el tipo y el multiplicador igual que flaming burst", () => {
    expect(summary(extractExtraDamage(PRD_ICY_BURST))).toEqual([
      ["1d10", "cold", "onCritical", 2],
      ["2d10", "cold", "onCritical", 3],
      ["3d10", "cold", "onCritical", 4],
    ]);
    expect(summary(extractExtraDamage(PRD_SHOCKING_BURST))).toEqual([
      ["1d10", "electricity", "onCritical", 2],
      ["2d10", "electricity", "onCritical", 3],
      ["3d10", "electricity", "onCritical", 4],
    ]);
  });

  it("thundering: 1d8 / 2d8 / 3d8 sónico por multiplicador", () => {
    expect(summary(extractExtraDamage(PRD_THUNDERING))).toEqual([
      ["1d8", "sonic", "onCritical", 2],
      ["2d8", "sonic", "onCritical", 3],
      ["3d8", "sonic", "onCritical", 4],
    ]);
  });

  it("un crítico sin alternativas por multiplicador no lleva critMultiplier (aplica siempre)", () => {
    const text =
      "**Description**\n\nThis blade deals an extra 1d6 points of fire damage on a successful critical hit.";
    expect(summary(extractExtraDamage(text))).toEqual([["1d6", "fire", "onCritical", undefined]]);
  });

  it("el daño 'always' y el 'conditional' no llevan critMultiplier", () => {
    const flaming =
      "**Description**\n\nUpon command, a flaming weapon is sheathed in fire. The fire causes no harm to the wielder. The effect remains until another command is given. A flaming weapon deals an extra 1d6 points of fire damage on a successful hit.";
    expect(summary(extractExtraDamage(flaming))).toEqual([["1d6", "fire", "always", undefined]]);
    const holy =
      "**Description**\n\nA holy weapon is imbued with holy power. This power makes the weapon good-aligned and thus overcomes the corresponding damage reduction. It bestows two negative levels on any evil creature attempting to wield it. A holy weapon deals an extra 2d6 points of damage against all creatures of evil alignment.";
    expect(summary(extractExtraDamage(holy))).toEqual([
      ["2d6", "untyped", "conditional", undefined],
    ]);
  });
});

// --- schema ---------------------------------------------------------------------------------------

const dmg = (over: Partial<ExtraDamage> = {}): ExtraDamage => ({
  dice: "1d10",
  damageType: "fire",
  trigger: "onCritical",
  evidence: "an extra 1d10 points of fire damage on a successful critical hit",
  ...over,
});

describe("ExtraDamageSchema.critMultiplier (R78)", () => {
  it("acepta ×2, ×3 y ×4 con onCritical y rechaza otros valores", () => {
    for (const m of [2, 3, 4]) {
      expect(ExtraDamageSchema.safeParse(dmg({ critMultiplier: m as 2 })).success, `×${m}`).toBe(
        true,
      );
    }
    for (const bad of [1, 5, 0, "3"]) {
      expect(ExtraDamageSchema.safeParse({ ...dmg(), critMultiplier: bad }).success).toBe(false);
    }
  });

  it("critMultiplier solo es válido con trigger onCritical", () => {
    for (const trigger of ["always", "conditional"] as const) {
      const bad = ExtraDamageSchema.safeParse({
        ...dmg({ critMultiplier: 3 }),
        trigger,
        ...(trigger === "conditional" ? { conditionText: "contra no muertos" } : {}),
      });
      expect(bad.success, trigger).toBe(false);
    }
  });

  it("una variante con varios onCritical del mismo daño exige un critMultiplier distinto en cada uno", () => {
    const base = magicBase();
    const variant = (extraDamage: ExtraDamage[]) => ({
      ...(base["variants"] as Record<string, unknown>[])[0]!,
      effects: [effect()],
      extraDamage,
    });
    const flat = [dmg(), dmg({ dice: "2d10" }), dmg({ dice: "3d10" })]; // el defecto: se sumarían
    expect(MagicVariantSchema.safeParse(variant(flat)).success).toBe(false);
    expect(critAlternativeIssues(flat)[0]).toMatch(/se sumarían/);
    const dup = [dmg({ critMultiplier: 3 }), dmg({ dice: "2d10", critMultiplier: 3 })];
    expect(critAlternativeIssues(dup)[0]).toMatch(/mismo critMultiplier ×3/);
    const ok = [
      dmg({ critMultiplier: 2 }),
      dmg({ dice: "2d10", critMultiplier: 3 }),
      dmg({ dice: "3d10", critMultiplier: 4 }),
    ];
    expect(critAlternativeIssues(ok)).toEqual([]);
    expect(MagicVariantSchema.safeParse(variant(ok)).success).toBe(true);
    // Tipos distintos no compiten entre sí (p. ej. un onCritical de fuego y otro sónico).
    expect(critAlternativeIssues([dmg(), dmg({ damageType: "sonic", dice: "1d8" })])).toEqual([]);
  });
});

// --- getExtraDamage ---------------------------------------------------------------------------------

const { data } = loadDataset(ROOT, ["magic-items", "weapons"]);
const items = (data.entries["magic-items"] ?? []).map((e) => MagicItemSchema.parse(e));
const byId = new Map<string, MagicItem>(items.map((i) => [i.id, i]));
const ability = (id: string): MagicItem & { functionsAs?: string[] } => {
  const item = byId.get(id);
  if (!item) throw new Error(`falta ${id}`);
  return item as MagicItem & { functionsAs?: string[] };
};
const lookup = (id: string): WeaponAbilityLike | undefined => byId.get(id) as WeaponAbilityLike;
const dice = (list: readonly ExtraDamage[]) => list.map((d) => d.dice);

const BURSTS = [
  ["flaming-burst", "fire", ["1d10", "2d10", "3d10"]],
  ["icy-burst", "cold", ["1d10", "2d10", "3d10"]],
  ["shocking-burst", "electricity", ["1d10", "2d10", "3d10"]],
  ["thundering", "sonic", ["1d8", "2d8", "3d8"]],
] as const;

describe("getExtraDamage con los datos reales (R78, PRD weapons.html)", () => {
  it.each(BURSTS)(
    "%s: exactamente un daño de crítico según el multiplicador (×2/×3/×4), nunca la suma",
    (id, type, expected) => {
      const variant = ability(id).variants[0]!;
      expect(variant.extraDamage, "las tres alternativas están en los datos").toHaveLength(3);
      [2, 3, 4].forEach((multiplier, index) => {
        const crit = getExtraDamage(variant, { critical: true, critMultiplier: multiplier as 2 });
        expect(dice(crit.applied), `${id} ×${multiplier}`).toEqual([expected[index]]);
        expect(crit.applied[0]!.damageType).toBe(type);
        expect(crit.conditional).toEqual([]);
      });
    },
  );

  it("sin crítico no se suma ninguno de los daños de crítico", () => {
    for (const [id] of BURSTS) {
      const variant = ability(id).variants[0]!;
      expect(getExtraDamage(variant, { critical: false }).applied).toEqual([]);
      // el multiplicador es irrelevante si el golpe no es crítico
      expect(getExtraDamage(variant, { critical: false, critMultiplier: 3 }).applied).toEqual([]);
    }
  });

  it("un crítico sin multiplicador lanza (un cálculo incorrecto es peor que ninguno)", () => {
    expect(() => getExtraDamage(ability("flaming-burst").variants[0]!, { critical: true })).toThrow(
      RangeError,
    );
  });

  it("el defecto original: sumar a mano los tres daños daría 6d10 en vez de 1d10/2d10/3d10", () => {
    const all = ability("flaming-burst").variants[0]!.extraDamage;
    const total = all.reduce((sum, d) => sum + Number(d.dice.split("d")[0]), 0);
    expect(total).toBe(6);
    for (const m of [2, 3, 4] as const) {
      const applied = getExtraDamage(ability("flaming-burst").variants[0]!, {
        critical: true,
        critMultiplier: m,
      }).applied;
      expect(Number(applied[0]!.dice.split("d")[0])).toBe(m - 1);
    }
  });

  it("flaming: 1d6 de fuego en cualquier golpe; los conditional (holy, anarchic...) nunca se suman solos", () => {
    const flaming = getExtraDamage(ability("flaming").variants[0]!, { critical: false });
    expect(summary(flaming.applied)).toEqual([["1d6", "fire", "always", undefined]]);
    for (const id of ["holy", "unholy", "anarchic", "axiomatic"]) {
      const result = getExtraDamage(ability(id).variants[0]!, {
        critical: true,
        critMultiplier: 2,
      });
      expect(result.applied, id).toEqual([]);
      expect(dice(result.conditional), id).toEqual(["2d6"]);
    }
  });
});

describe("getWeaponAbilitiesExtraDamage: «funciona como» (functionsAs, R84)", () => {
  it("los datos declaran que flaming burst funciona como flaming, icy burst como frost y shocking burst como shock", () => {
    expect(ability("flaming-burst").functionsAs).toEqual(["flaming"]);
    expect(ability("icy-burst").functionsAs).toEqual(["frost"]);
    expect(ability("shocking-burst").functionsAs).toEqual(["shock"]);
    expect(ability("thundering").functionsAs).toBeUndefined();
  });

  it("una espada con flaming burst, golpe normal: 1d6 de fuego (de flaming); crítico ×2: 1d6 + 1d10", () => {
    const normal = getWeaponAbilitiesExtraDamage(["flaming-burst"], lookup, { critical: false });
    expect(dice(normal.applied)).toEqual(["1d6"]);
    const crit2 = getWeaponAbilitiesExtraDamage(["flaming-burst"], lookup, {
      critical: true,
      critMultiplier: 2,
    });
    expect(dice(crit2.applied)).toEqual(["1d10", "1d6"]);
    const crit3 = getWeaponAbilitiesExtraDamage(["flaming-burst"], lookup, {
      critical: true,
      critMultiplier: 3,
    });
    expect(dice(crit3.applied)).toEqual(["2d10", "1d6"]);
  });

  it("no cuenta dos veces flaming si llegan flaming y flaming-burst a la vez", () => {
    const result = getWeaponAbilitiesExtraDamage(["flaming", "flaming-burst"], lookup, {
      critical: true,
      critMultiplier: 4,
    });
    expect(dice(result.applied).sort()).toEqual(["1d6", "3d10"]);
  });

  it("Flame Tongue (+1 flaming burst longsword, ×2): 1d6 siempre y 1d10 más en crítico", () => {
    const flameTongue = byId.get("flame-tongue") as MagicItem & { abilityIds: string[] };
    expect(flameTongue.abilityIds).toEqual(["flaming-burst"]);
    const crit = getWeaponAbilitiesExtraDamage(flameTongue.abilityIds, lookup, {
      critical: true,
      critMultiplier: 2,
    });
    expect(dice(crit.applied)).toEqual(["1d10", "1d6"]);
  });

  it("varias habilidades se acumulan (flaming burst + thundering con ×3)", () => {
    const result = getWeaponAbilitiesExtraDamage(["flaming-burst", "thundering"], lookup, {
      critical: true,
      critMultiplier: 3,
    });
    expect(dice(result.applied).sort()).toEqual(["1d6", "2d10", "2d8"]);
  });

  it("una habilidad desconocida lanza", () => {
    expect(() => getWeaponAbilitiesExtraDamage(["no-existe"], lookup, { critical: false })).toThrow(
      /desconocida/,
    );
  });
});

describe("weaponCritMultiplier (equipo del CRB)", () => {
  const { data: gear } = loadDataset(ROOT, ["weapons"]);
  const weapon = (id: string) => {
    const entry = (gear.entries["weapons"] ?? []).find((e) => (e as { id: string }).id === id);
    return WeaponSchema.parse(entry);
  };

  it("longsword ×2, battleaxe ×3, heavy pick ×4; sin crítico (net) no devuelve nada", () => {
    expect(weaponCritMultiplier(weapon("longsword"))).toBe(2);
    expect(weaponCritMultiplier(weapon("battleaxe"))).toBe(3);
    expect(weaponCritMultiplier(weapon("heavy-pick"))).toBe(4);
    expect(weaponCritMultiplier(weapon("net"))).toBeUndefined();
  });

  it("arma doble con extremos ×3/×4 (gnome hooked hammer): extremo secundario ×4", () => {
    const hammer = weapon("gnome-hooked-hammer");
    expect(weaponCritMultiplier(hammer)).toBe(3);
    expect(weaponCritMultiplier(hammer, "secondary")).toBe(4);
    // la combinación completa: flaming burst en un crítico con el extremo ×4 = 3d10
    const crit = getExtraDamage(ability("flaming-burst").variants[0]!, {
      critical: true,
      critMultiplier: weaponCritMultiplier(hammer, "secondary")!,
    });
    expect(dice(crit.applied)).toEqual(["3d10"]);
  });
});
