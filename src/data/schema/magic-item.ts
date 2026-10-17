import { z } from "zod";
import { BaseEntrySchema, Kebab } from "./common";

// Objetos mágicos del capítulo 15 del CRB (Lote M, R63-R90, design.md §14.3).

export const MAGIC_ITEM_KINDS = [
  "armor-ability",
  "shield-ability",
  "weapon-ability",
  "specific-armor",
  "specific-shield",
  "specific-weapon",
  "potion",
  "oil",
  "ring",
  "rod",
  "staff",
  "wand",
  "wondrous",
  "cursed",
  "intelligent",
  "artifact",
  "general",
] as const;
export type MagicItemKind = (typeof MAGIC_ITEM_KINDS)[number];

/**
 * Los 19 tipos de bonificador del resolvedor de f2 (`BONUS_TYPES` de `src/rules/types.ts`, f2
 * design §3). f3 no importa `src/rules`; un test (R73) comprueba que ambas listas son idénticas.
 */
export const BONUS_TYPES = [
  "alchemical",
  "armor",
  "circumstance",
  "competence",
  "deflection",
  "dodge",
  "enhancement",
  "inherent",
  "insight",
  "luck",
  "morale",
  "naturalArmor",
  "profane",
  "racial",
  "resistance",
  "sacred",
  "shield",
  "size",
  "untyped",
] as const;
export type MagicBonusType = (typeof BONUS_TYPES)[number];

/** CRB, capítulo 15 (Magic Armor / Magic Weapons): mejora máxima y bonificador efectivo máximo (R83). */
export const MAX_ENHANCEMENT_BONUS = 5;
export const MAX_EFFECTIVE_BONUS = 10;

export const FIXED_EFFECT_TARGETS = [
  "attack",
  "damage",
  "ac",
  "initiative",
  "save.fortitude",
  "save.reflex",
  "save.will",
  "save.all",
  "ability.str",
  "ability.dex",
  "ability.con",
  "ability.int",
  "ability.wis",
  "ability.cha",
] as const;

export const SKILL_TARGET_REGEX = /^skill\.[a-z0-9]+(-[a-z0-9]+)*$/;

export const MagicEffectSchema = z
  .strictObject({
    target: z.union([z.enum(FIXED_EFFECT_TARGETS), z.string().regex(SKILL_TARGET_REGEX)]), // R74
    bonusType: z.enum(BONUS_TYPES), // R73
    value: z
      .number()
      .int()
      .refine((v) => v !== 0, { message: "value no puede ser 0" }), // R72; < 0 = penalizador
    appliesTo: z.enum(["wearer", "item"]),
    conditional: z.boolean(),
    conditionText: z.string().min(1).optional(),
    foldInto: z.enum(["armor", "shield", "naturalArmor"]).optional(), // R77
    evidence: z.string().min(1), // R75: subcadena literal de textEn
  })
  .superRefine((effect, ctx) => {
    if (effect.conditional && effect.conditionText === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["conditionText"],
        message: "un efecto condicional necesita conditionText (R76)",
      });
    }
    if (!effect.conditional && effect.conditionText !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["conditionText"],
        message: "conditionText solo se admite con conditional:true (R76)",
      });
    }
    if (effect.foldInto !== undefined && effect.target !== "ac") {
      ctx.addIssue({
        code: "custom",
        path: ["foldInto"],
        message: 'foldInto solo se admite con target "ac" (R77)',
      });
    }
  });
export type MagicEffect = z.infer<typeof MagicEffectSchema>;

export const ExtraDamageSchema = z
  .strictObject({
    dice: z.string().regex(/^\d+d\d+$/),
    damageType: z.string().min(1),
    trigger: z.enum(["always", "onCritical", "conditional"]),
    conditionText: z.string().min(1).optional(),
    evidence: z.string().min(1), // R75
  })
  .superRefine((damage, ctx) => {
    if ((damage.trigger === "conditional") !== (damage.conditionText !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["conditionText"],
        message: 'conditionText es obligatorio si y solo si trigger es "conditional"',
      });
    }
  });
export type ExtraDamage = z.infer<typeof ExtraDamageSchema>;

/** Precio en piezas de cobre (1 gp = 100 cp) o `null` si la fuente no da un precio fijo (R68). */
const PriceCp = z.number().int().nonnegative().nullable();

export const MagicVariantSchema = z
  .strictObject({
    variantId: Kebab, // `default` si es única; `plus-2`, `minor`...
    label: z.string().min(1),
    casterLevel: z.number().int().positive().nullable(),
    priceRaw: z.string(),
    priceCp: PriceCp, // R68
    bonusEquivalent: z.number().int().min(1).max(5).optional(), // R69
    effects: z.array(MagicEffectSchema),
    extraDamage: z.array(ExtraDamageSchema),
  })
  .superRefine((variant, ctx) => {
    if (variant.bonusEquivalent !== undefined && variant.priceCp !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["priceCp"],
        message: "una variante con bonusEquivalent debe tener priceCp null (R69)",
      });
    }
  });
export type MagicVariant = z.infer<typeof MagicVariantSchema>;

export const ConstructionSchema = z.strictObject({
  requirements: z.string(),
  costRaw: z.string(),
  costCp: PriceCp,
});

export const WeaponLegalForSchema = z.strictObject({
  range: z.enum(["melee", "ranged", "any"]),
  damageTypes: z
    .array(z.enum(["B", "P", "S"]))
    .min(1)
    .optional(),
  weaponIds: z.array(Kebab).min(1).optional(),
  raw: z.string(),
});
export type WeaponLegalFor = z.infer<typeof WeaponLegalForSchema>;

export const ArmorLegalForSchema = z.strictObject({
  categories: z
    .array(z.enum(["light", "medium", "heavy"]))
    .min(1)
    .optional(),
  raw: z.string(),
});
export type ArmorLegalFor = z.infer<typeof ArmorLegalForSchema>;

export const EnhancementOnSchema = z.enum(["weapon", "armor", "shield"]);
export type EnhancementOn = z.infer<typeof EnhancementOnSchema>;

export const SpellRefSchema = z.strictObject({
  name: z.string().min(1), // nombre literal del conjuro
  spellId: Kebab.nullable(), // R85: null solo si el conjuro no es del CRB
  spellLevel: z.number().int().min(0).max(9).optional(),
});
export type SpellRef = z.infer<typeof SpellRefSchema>;

export const EnhancementPriceSchema = z.strictObject({
  bonus: z.number().int().min(1).max(5),
  priceCp: z.number().int().nonnegative(),
});

const base = BaseEntrySchema.extend({
  slot: z.string(), // literal de la fuente (`weapon quality`, `ring`, `none`...)
  aura: z.string(),
  weightLb: z.number().nonnegative().nullable(),
  construction: ConstructionSchema,
  sourceRefAll: z.string().min(1).optional(), // línea Source literal completa (R86)
  reprintedIn: z.array(z.string().min(1)), // etiquetas Source que no son el CRB (R86)
  variants: z.array(MagicVariantSchema).min(1),
});

function plain<K extends MagicItemKind>(kind: K) {
  return base.extend({ kind: z.literal(kind) });
}

const specificFields = {
  baseItemId: Kebab.nullable(), // R70
  baseItemRaw: z.string().min(1).optional(),
  // Los objetos específicos no mágicos (p. ej. mithral shirt) no declaran mejora.
  enhancement: z
    .strictObject({
      on: EnhancementOnSchema,
      bonus: z.number().int().min(1).max(MAX_ENHANCEMENT_BONUS),
    })
    .optional(),
  abilityIds: z.array(Kebab),
  baseEvidence: z.string().min(1), // R70: fragmento literal de textEn
};

const spellRefFields = { spellRefs: z.array(SpellRefSchema) };

const members = [
  base.extend({ kind: z.literal("weapon-ability"), legalFor: WeaponLegalForSchema }),
  base.extend({ kind: z.literal("armor-ability"), legalFor: ArmorLegalForSchema }),
  base.extend({ kind: z.literal("shield-ability"), legalFor: ArmorLegalForSchema }),
  base.extend({ kind: z.literal("specific-weapon"), ...specificFields }),
  base.extend({ kind: z.literal("specific-armor"), ...specificFields }),
  base.extend({ kind: z.literal("specific-shield"), ...specificFields }),
  base.extend({ kind: z.literal("potion"), ...spellRefFields }),
  base.extend({ kind: z.literal("oil"), ...spellRefFields }),
  base.extend({ kind: z.literal("wand"), ...spellRefFields }),
  base.extend({ kind: z.literal("staff"), ...spellRefFields }),
  base.extend({
    kind: z.literal("general"),
    enhancementPrices: z.array(EnhancementPriceSchema).optional(), // R71
  }),
  plain("ring"),
  plain("rod"),
  plain("wondrous"),
  plain("cursed"),
  plain("intelligent"),
  plain("artifact"),
] as const;

const ENHANCEMENT_ON_BY_KIND: Readonly<Record<string, EnhancementOn>> = {
  "specific-weapon": "weapon",
  "specific-armor": "armor",
  "specific-shield": "shield",
};

export const MagicItemSchema = z.discriminatedUnion("kind", members).superRefine((item, ctx) => {
  const ids = new Set<string>();
  for (const variant of item.variants) {
    if (ids.has(variant.variantId)) {
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: `variantId repetido "${variant.variantId}"`,
      });
    }
    ids.add(variant.variantId);
  }
  const expectedOn = ENHANCEMENT_ON_BY_KIND[item.kind];
  if (expectedOn !== undefined && "abilityIds" in item) {
    if (item.enhancement === undefined) {
      // Sin mejora declarada solo si el objeto no es mágico o queda pendiente de revisión humana.
      if (!/^no aura/i.test(item.aura) && item.needsReview !== true) {
        ctx.addIssue({
          code: "custom",
          path: ["enhancement"],
          message: "un objeto específico mágico declara enhancement o queda needsReview (R70)",
        });
      }
    } else if (item.enhancement.on !== expectedOn) {
      ctx.addIssue({
        code: "custom",
        path: ["enhancement", "on"],
        message: `enhancement.on debe ser "${expectedOn}" para ${item.kind}`,
      });
    }
    if (item.baseItemId === null && item.baseItemRaw === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["baseItemRaw"],
        message: "baseItemId null exige baseItemRaw literal (R70)",
      });
    }
    if (!item.textEn.includes(item.baseEvidence)) {
      ctx.addIssue({
        code: "custom",
        path: ["baseEvidence"],
        message: "baseEvidence debe ser subcadena literal de textEn (R70)",
      });
    }
  }
  if (
    (item.kind === "weapon-ability" ||
      item.kind === "armor-ability" ||
      item.kind === "shield-ability") &&
    item.variants.some((v) => v.bonusEquivalent === undefined && v.priceCp === null)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["variants"],
      message: "cada variante de una habilidad especial declara bonusEquivalent o priceCp (R69)",
    });
  }
});
export type MagicItem = z.infer<typeof MagicItemSchema>;

// --- configuración de secciones (scripts/srd/config/magic-sections.json, R66) ---------------------

export const MagicSectionConfigSchema = z
  .strictObject({
    description: z.string().min(1),
    /** `0` + `reason`: la fuente no tiene entradas CRB de este `kind` (R66). */
    expectedCount: z.literal(0).optional(),
    /** Pendiente de una decisión humana (p. ej. `Q11`): cuenta como sección sin importar. */
    pending: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .superRefine((section, ctx) => {
    if ((section.expectedCount === 0 || section.pending !== undefined) && !section.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "expectedCount 0 y pending exigen un reason (R66)",
      });
    }
    if (section.expectedCount === 0 && section.pending !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["pending"],
        message: "expectedCount 0 y pending son excluyentes",
      });
    }
  });

export const MagicSectionsConfigSchema = z.strictObject({
  kinds: z.strictObject(
    Object.fromEntries(MAGIC_ITEM_KINDS.map((kind) => [kind, MagicSectionConfigSchema])) as Record<
      MagicItemKind,
      typeof MagicSectionConfigSchema
    >,
  ),
  knownGaps: z.array(
    z.strictObject({
      family: z.string().min(1),
      rowName: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
});
export type MagicSectionsConfig = z.infer<typeof MagicSectionsConfigSchema>;
