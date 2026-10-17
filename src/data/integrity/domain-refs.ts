import type { ClassFeature } from "../schema/class-feature";
import type { Domain } from "../schema/domain";
import { isRecord, validEntries } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

// R23: los conjuros de dominio existen en `spells` (cuando el dataset está cargado) y los poderes de
// dominio de `domains` y de `class-features` (`cleric.domain.<dominio>.<poder>`) son la misma lista.

const DOMAIN_FEATURE = /^cleric\.domain\.([a-z0-9]+(?:-[a-z0-9]+)*)\./;

export const domainRefsRule: IntegrityRule = (data, ctx) => {
  const issues: IntegrityIssue[] = [];
  const domains = validEntries(data, "domains", ctx) as Domain[];
  const features = validEntries(data, "class-features", ctx) as ClassFeature[];

  const spells = data.entries.spells;
  if (spells && spells.length > 0) {
    const spellIds = new Set(spells.filter(isRecord).map((s) => s["id"]));
    for (const domain of domains) {
      for (const spell of domain.spells) {
        if (!spellIds.has(spell.spellId)) {
          issues.push({
            category: "domains",
            id: domain.id,
            rule: "domain.spell-ref",
            message: `el conjuro de dominio de nivel ${spell.level} "${spell.name}" (${spell.spellId}) no existe en spells (R23)`,
          });
        }
      }
    }
  }

  // domains.grantedPowers <-> class-features cleric.domain.*
  if (features.length > 0 && domains.length > 0) {
    const byDomain = new Map<string, ClassFeature[]>();
    for (const f of features) {
      const m = DOMAIN_FEATURE.exec(f.id);
      if (m) byDomain.set(m[1]!, [...(byDomain.get(m[1]!) ?? []), f]);
    }
    const domainIds = new Set(domains.map((d) => d.id));
    for (const id of byDomain.keys()) {
      if (!domainIds.has(id)) {
        issues.push({
          category: "class-features",
          rule: "domain.feature-ref",
          message: `hay poderes cleric.domain.${id}.* pero el dominio ${id} no existe en domains`,
        });
      }
    }
    for (const domain of domains) {
      const options = byDomain.get(domain.id) ?? [];
      if (options.length !== domain.grantedPowers.length) {
        issues.push({
          category: "domains",
          id: domain.id,
          rule: "domain.powers-consistency",
          message: `grantedPowers tiene ${domain.grantedPowers.length} poderes y class-features ${options.length}`,
        });
        continue;
      }
      for (const power of domain.grantedPowers) {
        const match = options.find((o) => o.name === power.name);
        if (!match || match.level !== power.level || match.abilityType !== power.abilityType) {
          issues.push({
            category: "domains",
            id: domain.id,
            rule: "domain.powers-consistency",
            message: `el poder "${power.name}" no coincide (nombre, nivel o tipo) con su opción en class-features`,
          });
        } else if (match.textEn !== power.textEn) {
          issues.push({
            category: "domains",
            id: domain.id,
            rule: "domain.powers-consistency",
            message: `el textEn del poder "${power.name}" difiere del de class-features`,
          });
        }
      }
    }
  }
  return issues;
};
