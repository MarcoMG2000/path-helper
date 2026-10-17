# Implementación — f2-rules-engine-core

Estado: implementado, pendiente de reviewer. Tasks T1..T13 marcadas `[x]` en `specs/f2-rules-engine-core/tasks.md`.
T14 queda SIN marcar: no se ejecutó `./init.sh` (regla de concurrencia: no `npm ci`/`init.sh`); el leader debe
correrlo. La feature NO se marca `done` ni se toca `feature-list.json`.

## Verificación ejecutada (Node v24.20.0, Windows 11 + Git Bash)

| Comando | Resultado |
|---|---|
| `npx vitest run tests/rules` | 13 ficheros / 215 tests en verde |
| `npx eslint src/rules tests/rules` | sin errores |
| `npx prettier --check src/rules tests/rules` | OK |
| `npm run typecheck` | 0 errores en `src/rules` y `tests/rules`. Sí falla en código AJENO de f1 (`src/server/config/load.ts`, `src/server/stores/sqlite/*` por `better-sqlite3` ausente, `tests/helpers/temp-db.ts`, `tests/server/stores/sqlite/*`) |
| Trazabilidad | script: cada `R1`..`R54` aparece en el nombre de al menos un test de `tests/rules` |

Cobertura por umbral (OQ-11): no se añadió `@vitest/coverage-v8` (no está en f0 y no se instala nada). Queda para decisión humana.

## Archivos

`src/rules/`: `types.ts`, `result.ts`, `modifiers.ts`, `ability.ts`, `size.ts`, `progression.ts`, `saves.ts`,
`armor-class.ts`, `check.ts`, `initiative.ts`, `skills.ts`, `index.ts`.
`tests/rules/`: `result`, `determinism`, `json`, `purity`, `modifiers`, `ability`, `size`, `progression`, `saves`,
`armor-class`, `check`, `initiative`, `skills` (`.test.ts`) + `fixtures.ts` (casos de llamada compartidos; no es un test).
No se tocó `src/server`, `src/web`, `src/data`, `src/shared`, `package.json`, `feature-list.json`.

## Reglas verificadas contra el SRD (consultado por curl el 2026-10-16)

Fuentes: d20pfsrd (D) y Archives of Nethys (A). El texto es el SRD publicado (mirror del Core).

| Regla / OQ | Resultado | Fuente |
|---|---|---|
| Tabla de modificadores de característica 1-45 (columna modificador) | VERIFICADA: coincide (1=-5 ... 44-45=+17) | D https://www.d20pfsrd.com/basics-ability-scores/ability-scores/ |
| Tabla de tamaño (CA/ataque) | VERIFICADA | D https://www.d20pfsrd.com/gamemastering/combat/ (Armor Class, Table: Size Modifiers) |
| Fórmula de CA, toque (sin armor/shield/natural; tamaño, Des, desvío sí), desprevenido (sin Des "if any"; esquiva se pierde con el Des) | VERIFICADA (OQ-15, OQ-7) | D https://www.d20pfsrd.com/gamemastering/combat/ (Armor Class, Touch Attacks, Flat-Footed, Dodge Bonuses) |
| Mejoras de armadura/armadura natural incrementan ese bonificador y no cuentan en toque (OQ-7) | VERIFICADA | D https://www.d20pfsrd.com/basics-ability-scores/glossary/ (Enhancement, Natural Armor, Shield) |
| Des máx. "no afecta a ninguna otra capacidad basada en Des" (OQ-14) | VERIFICADA | D https://www.d20pfsrd.com/equipment---final/armor/ (Maximum Dex Bonus) |
| Armadura vs carga: "use the worse figure (from armor or from load) ... Do not stack the penalties" (OQ-5); Tabla 7-5 carga media Des máx. +3 / ACP -3, pesada +1 / -6 | VERIFICADA | A https://aonprd.com/Rules.aspx?Name=Carrying%20Capacity&Category=Equipment (CRB p.169) |
| ACP: armadura y escudo se suman ("both armor check penalties apply") (OQ-6) | VERIFICADA | D https://www.d20pfsrd.com/equipment---final/armor/ (Armor Check Penalty > Shields) |
| Nadar no duplica el ACP (OQ-8) | VERIFICADA (la página de Swim no menciona duplicación) | D https://www.d20pfsrd.com/skills/swim/ |
| Habilidades con ACP y Trained Only (OQ-9) | VERIFICADA la lista del spec (Acrobatics, Climb, Disable Device, Escape Artist, Fly, Ride, Sleight of Hand, Stealth, Swim con ACP; Trained Only: Disable Device, Handle Animal, Knowledge, Linguistics, Profession, Sleight of Hand, Spellcraft, Use Magic Device) | D https://www.d20pfsrd.com/skills/ (Table: Skills) |
| Habilidad de clase +3 solo con rangos; rangos máx. = Dados de Golpe; Trained Only exige 1 rango | VERIFICADA | D https://www.d20pfsrd.com/skills/ |
| BAB y salvaciones: fórmulas good/medium/poor comprobadas nivel 1-20 contra las tablas de clase del SRD de Paladín, Pícaro, Bardo, Druida, Bárbaro, Clérigo, Mago, Guerrero, Explorador, Monje y Hechicero (script) | VERIFICADA; progresiones: Pal G/F+R-W+, Pic M/F-R+W-, Bar M/F-R+W+, Dru M/F+R-W+, Bbn G/F+R-W-, Clr M/F+R-W+ | D https://www.d20pfsrd.com/classes/core-classes/<clase>/ |
| Multiclase: se suman HP, BAB y salvaciones de cada clase; BAB de distintas fuentes se apilan | VERIFICADA | A https://aonprd.com/Rules.aspx?Name=Multiclassing&Category=Character%20Advancement ; D combat (Base Attack Bonus) |
| Salvación = base + modificador (Fort/Con, Ref/Des, Will/Sab) | VERIFICADA | D https://www.d20pfsrd.com/gamemastering/combat/ (Saving Throws) |
| Iniciativa = prueba de Des + dotes/conjuros; Improved Initiative +4 | VERIFICADA | D combat (Initiative); D https://www.d20pfsrd.com/feats/combat-feats/improved-initiative-combat/ |
| Tipos de bonificador, apilamiento, penalizadores (OQ-1, OQ-2, OQ-3) | VERIFICADA, con DESVIACIONES D1 y D2 (abajo) | D https://www.d20pfsrd.com/magic/ (Bonus Types, Stacking Effects); D .../basics-ability-scores/glossary/ (Bonus, Penalty, Table: Bonus Types and Effects) ; A https://aonprd.com/Rules.aspx?Name=Combining%20Magic%20Effects&Category=Magic (CRB p.208) |
| OQ-1 "mismo origen": "Bonuses without a type always stack, unless they are from the same source" | VERIFICADA la lectura del spec; se mantiene el rechazo de `id` duplicados (R19) | D magic / glossary |

NO verificadas / abiertas: OQ-4 (característica efectiva < 1: el SRD solo describe consecuencias, p. ej. Des 0 = inmóvil;
se mantiene el error provisional), OQ-10, OQ-11, OQ-12, OQ-13, OQ-16 (decisiones de modelado o fuera de alcance).
El texto literal del Core impreso (PDF) no se ha cotejado, solo el SRD web.

## Desviaciones respecto al spec (el SRD manda; cada una marcada con comentario en el test)

- **D1 — `racial` se apila (OQ-2).** El SRD dice "With the exception of dodge bonuses, most circumstance bonuses, and
  racial bonuses, only the better bonus of a given type works". El spec (R9) sólo listaba dodge, circumstance y untyped.
  Implementado: `dodge`, `circumstance`, `racial`, `untyped` (más `base`/`ability`) siempre suman. Test: `modifiers.test.ts`
  "R9/D1". Efecto en el spec: R9 amplía la lista con `racial`.
- **D2 — Penalizadores del mismo tipo con nombre: solo cuenta el peor (R11 / M7).** El SRD: "a character taking two or
  more penalties of the same type applies only the worst one, although most penalties have no type and thus always
  stack". El spec (R11/M7) decía que todos los penalizadores suman (morale -2 y -2 = -4). Implementado: entre
  penalizadores (`value < 0`) del mismo tipo que no sea dodge/circumstance/racial/untyped/base/ability, cuenta el peor
  (empate: el primero) y los demás quedan `suppressed` con `suppressedBy`. Bonificadores y penalizadores del mismo tipo
  siguen sumándose entre sí (M8 se mantiene). M7 ahora da -2. Tests: `modifiers.test.ts` "R11/M7/D2" y siguientes,
  `R14` (permutaciones con empates).
- **D3 — Fixture de la cota de mallas.** El spec usaba Chainmail +5; el SRD (Table: Armor and Shields) da +6, Des máx. +2,
  ACP -5. En `armor-class.test.ts` A4/A5 se usa +6: resultados 18/12/16/10 y 17/11/16/10 (en vez de 17/12/15/10 y
  16/11/15/10). Es solo un dato de test (el dato real vive en f3); la lógica no cambia. Otros fixtures confirmados:
  Full plate +9/+1/-6, Leather +2/+6/0, Studded leather +3/+5/-1, Heavy steel shield +2/-2.
- **D4 (detalle, no cambia requisitos).** "Cazador" de los fixtures del spec no existe en el Core (Hunter es del APG); los
  tests usan clases del Core (paladin, rogue, bard, druid, cleric, barbarian, wizard).
- `trait` no se añade al catálogo de 19 tipos (OQ-3): la tabla del SRD web lista "Trait", pero los rasgos son APG
  (fuera de alcance); `trait` se rechaza con `invalid_modifier_type` (test M14). El spec sigue siendo coherente.

Decisiones de implementación dentro del design: errores con `field` = id del modificador/clase/característica;
`progression.ts` exporta además `classSaveModifiers` (interno, no re-exportado en `index.ts`); las líneas ACP se llaman
`skill.acp:<id>`; `0 - v` evita `-0` (no sobrevive a JSON). Una progresión desconocida en runtime (fuera del tipo) no
tiene código de error en el spec: el tipo TypeScript la impide y el servidor valida con zod; sin cobertura.

## Trazabilidad R<n> -> test (bajo `tests/rules/`)

| R | Test |
|---|---|
| R1 | `result.test.ts` (una entrada inválida por módulo no lanza) |
| R2, R3 | `determinism.test.ts` (todas las funciones públicas, `Date.now`/`Math.random` espiados, entradas congeladas) |
| R4, R6 | `purity.test.ts` |
| R5 | `json.test.ts` |
| R7-R20 | `modifiers.test.ts` (M1-M18, permutaciones, D1, D2) |
| R21-R25 | `ability.test.ts` (tabla 1-45, AB2-AB6) |
| R26 | `size.test.ts` |
| R27-R32 | `progression.test.ts` (tablas de 20 niveles, P2-P9, tablas de clase SRD) |
| R33 | `saves.test.ts` (SV1-SV4) |
| R34-R43 | `armor-class.test.ts` (A1-A10, exclusiones, `adjustment`, `invalid_max_dex`, ids reservados) |
| R44, R45 | `check.test.ts` |
| R46 | `initiative.test.ts` (I1, I2, I4) |
| R47-R54 | `skills.test.ts` (S1-S11) |

## API pública exportada por `src/rules/index.ts`

Valores: `ABILITY_IDS`, `BONUS_TYPES`, `ok`, `err`, `resolveModifiers`, `abilityModifier`, `abilityModifiers`,
`effectiveAbility`, `sizeModifier`, `baseAttackBonusFor`, `baseSaveFor`, `characterBaseAttackBonus`,
`characterBaseSave`, `SAVE_ABILITY`, `savingThrow`, `armorClass`, `applyD20`, `initiativeModifier`,
`maxSkillRanks`, `skillModifier`.

Tipos: `AbilityId`, `AbilityScores`, `AbilityModifiers`, `BonusType`, `ModifierType`, `Modifier`, `Breakdown`,
`BreakdownLine`, `LineStatus`, `ExcludedReason`, `LineAdjustment`, `Size`, `Result`, `RulesError`, `RulesErrorCode`,
`ResolveOptions`, `BabProgression`, `SaveProgression`, `SaveId`, `ClassLevel`, `SavingThrowInput`, `MaxDexCap`,
`ArmorClassInput`, `ArmorClassResult`, `CheckResult`, `InitiativeInput`, `SkillDefinition`,
`ArmorCheckPenaltyEntry`, `SkillInput`, `SkillResult`.

Firmas: las del design §4 sin cambios.

## Pendiente para el leader / humano

1. Ejecutar `./init.sh` (T14) cuando node_modules esté estable; hoy `npm run typecheck` falla por código de f1, no de f2.
2. Aprobar D1, D2 y D3 (el spec debería actualizarse: R9 +`racial`; R11/M7; fixture de cota de mallas) antes de que f4-f7 dependan de ello.
3. OQ-4 (error vs flag con característica < 1) y OQ-11 (umbral de cobertura) siguen abiertas.
