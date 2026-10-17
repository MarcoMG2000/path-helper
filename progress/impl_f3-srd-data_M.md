# Implementación - f3-srd-data, Lote M (objetos mágicos, capítulo 15)

Estado: **implementado** (TM.0..TM.10 marcadas `[x]` en `specs/f3-srd-data/tasks.md`; TM.7/TM.8 con la salvedad de Q11, ver abajo). Pendiente de reviewer.
No se tocó `feature-list.json`, `package.json`, `lib/**`, `cli.ts`, `categories.ts` ni ficheros de otros lotes; no se ejecutó `npm ci/install`, `./init.sh` ni `data:glossary`; ningún proceso de import quedó en segundo plano. La feature NO está `done`.

## Resultado: recuentos reales vs esperados

El universo sale de la página de fuente CRB de AoN (`SourceDisplay.aspx?FixedSource=PRPG Core Rulebook`, 553 filas en 8 tablas) y de la página de reglas del capítulo (`Rules.aspx?ID=365`). Un **título de página = una entrada** (AoN lista una fila por variante de precio y las páginas de variantes son idénticas; ver hallazgo 1). `expectedCountByKind` está congelado en `src/data/provenance/magic-items.json` por `discover` (calculado desde las páginas, con doble lectura de `kind` por los índices por categoría de AoN).

| kind | esperado (congelado) | importado | filas de la fuente |
|---|---|---|---|
| weapon-ability | 30 | 30 | (en «Weapons [64]») |
| armor-ability | 17 | 17 | (en «Armor [48]») |
| shield-ability | 14 | 14 | idem |
| specific-weapon | 30 | 30 | idem |
| specific-armor | 12 | 12 | idem |
| specific-shield | 8 | 8 | idem |
| ring | 34 | 34 | «Rings [43]» |
| rod | 24 | 24 | «Rods [36]» |
| staff | 21 | 21 | «Staves [21]» |
| wondrous | 190 | 190 | «Wondrous Items [300]» (191 títulos, 1 hueco de la fuente) |
| cursed | 29 | 29 | «Cursed Items [29]» |
| artifact | 12 | 12 | «Artifacts [12]» |
| general | 21 | 21 | 21 secciones `h1` de la página de reglas con etiqueta CRB |
| potion / oil / wand | — | 0 | **pendientes de Q11** |
| intelligent | `expectedCount: 0` + `reason` | 0 | la fuente no lista ninguno |
| **total** | | **442 entradas** en 13 ficheros `src/data/magic-items/<kind>.json` | 553 filas |

Equivalencia filas -> entradas: 553 filas = 413 títulos de objeto; 8 de ellos (Energy Resistance x3, Fortification, Ghost Touch, Spell Resistance, Undead Controlling, Wild) sirven a armadura y escudo y producen dos entradas (+8 = 421 entradas de objeto), más 21 `general` = 442. Contadores y exclusiones en `reports/import-2026-10-17.md` (git-ignorado).

`npx vitest run` (suite global): 119 ficheros / 1547 tests en verde; `npx tsc --noEmit` y `npx eslint .` limpios; prettier aplicado a mis ficheros.
`data:validate` (carga completa con `weapons`, `armor`, `shields`, `skills`, `spells` reales de otros lotes): para `magic-items` **solo** `magic.sections-complete` para `potion`, `oil` y `wand` (Q11). R82/R84/R85 pasan contra los datos reales del equipo (87 armas/12 armaduras/6 escudos), las 35 habilidades y los 623 conjuros.

## TM.0: hallazgos de la fuente (resumen; el detalle está en «Hallazgos y decisiones»)

1. Filas != entradas (páginas de variantes idénticas; comprobado 0 grupos con contenido distinto).
2. **Q11**: AoN no tiene páginas de pociones, aceites ni varitas del CRB; el CRB impreso los trata solo como reglas de precio por fórmula y tablas de coste. Esas tablas («Potion Costs», «Wand Costs», «Scroll Costs», Tablas 15-12, 15-15, 15-17) están dentro de las entradas `general` `potions`/`scrolls`/`wands` (p. ej. `| 1st | 50 gp |` y `| 1st | 750 gp |`). Los kinds `potion`/`oil`/`wand` quedan en `magic-sections.json` como `pending: "Q11"` (NO como `expectedCount: 0`, para que el humano decida). **Recomendación:** declararlos `expectedCount: 0` con ese motivo, porque no hay objetos con nombre CRB que importar; los precios genéricos ya están en las tablas.
3. Tres huecos de la fuente, declarados en `magic-sections.json` (`knownGaps`), sin inventar texto: `Lens of Detection` (la página enlazada no tiene contenido) y `Bag of Tricks (Gray|Rust|Tan)` (la página solo trae la versión de Aquatic Adventures, sin etiqueta CRB). Faltan por tanto 2 objetos maravillosos del CRB (Lens of Detection, Bag of Tricks); el humano decide si se cotejan otra fuente (Q11/Q13).
4. Topes (R83), texto literal del CRB pg. 461 (Magic Armor): «Magic armor bonuses are enhancement bonuses, never rise above +5 ...», «A suit of armor cannot have an effective bonus (enhancement plus special ability bonus equivalents, including from character abilities and spells) higher than +10. A suit of armor with a special ability must also have at least a +1 enhancement bonus.» Igual para escudos y (pg. 468, Magic Weapons) para armas: «Magic weapons have enhancement bonuses ranging from +1 to +5 ... A single weapon cannot have a modified bonus ... higher than +10. A weapon with a special ability must also have at least a +1 enhancement bonus.» Coincide con design §14.5: no hay discrepancia, R83 codifica +5 y +10.

## Hallazgos y decisiones dentro del spec (revisar)

1. **Entrada = título de página.** Las filas de la página de fuente (`Ring of Protection (+1)` ... `(+5)`) apuntan a páginas idénticas con todos los precios; produce una entrada con varias `variants` (design §14.3). `source` apunta a la primera fila de la fuente.
2. **Habilidades «armor/shield quality»** (Energy Resistance x3, Fortification, Ghost Touch, Spell Resistance, Undead Controlling, Wild): una página, dos entradas (`armor-ability` y `shield-ability`) con ids por alias `<kind>.<slug>` en `slug-aliases.json`: `energy-resistance-armor`/`-shield`, ..., y `ghost-touch-weapon`/`-armor`/`-shield` (Ghost Touch existe además como arma). La clasificación de `kind` usa el campo `Slot` de la página y se contrasta con los índices de AoN (`MagicArmor.aspx?Category=...`, `MagicWeapons.aspx?Category=...`): discrepancia = error.
3. **Q13 (Source múltiple):** casi todas las páginas (421 de 442) traen varias etiquetas `Source`. Se usa el texto de AoN tal cual (por defecto del spec), `sourceRef` = etiqueta CRB, `sourceRefAll` y `reprintedIn`. **Aviso:** el texto de AoN es con frecuencia el de la reimpresión de Ultimate Equipment (p. ej. Bracers of Armor cita «Table 3–3»; los Ioun Stone traen `Resonance`, regla de Ultimate Equipment). Marcadas `needsReview`: los 16 Ioun Stone y `golem-manuals` (cita Construct Handbook / Lost Kingdoms). El humano debe cotejar contra el CRB impreso si quiere exactitud absoluta.
4. **Interpretación de R75:** «la evidencia contiene el valor» se cumple si aparece el número exacto, o si la evidencia trae un rango «+1 to +5» / una lista «+2, +4, or +6» que lo incluye (en caso contrario Ring of Protection +3 no podría tener evidencia literal). Implementado en `src/data/magic-items/evidence.ts`.
5. **Extracción de efectos conservadora** (65 efectos distintos en 442 entradas; los huecos los lista `findEffectGaps`): solo bonificadores/penalizadores **tipados** con objetivo del vocabulario de R74. No se asigna el efecto si (a) el beneficiario no es el portador (troops, creatures, those who...), (b) la lista de objetivos no se sabe resolver entera («on saving throws, ability checks, and skill checks» no produce un efecto parcial), (c) el valor depende de una elección del dueño. Las condiciones («against», «when», «for 1 hour», «unarmed»...) ponen `conditional: true` con la frase como `conditionText`. La mejora propia de un objeto específico no se duplica como efecto (está en `enhancement`).
6. **Objetos específicos (R70):** `baseItemId` = slug del nombre AoN de la tabla «Equipment» del CRB (los ids de Lote E coinciden: `longsword`, `arrows-20`, `heavy-steel-shield`, `chain-shirt`...; comprobado contra `src/data/equipment/*.json`). Si el texto trae varias menciones distintas de `+N ... base` (Sword of the Planes, Holy Avenger, Shatterspike, Mace of Smiting) **no se declara ni mejora ni habilidades** (`needsReview`); el schema exige `enhancement` o `needsReview` (cambio mínimo respecto al design: `enhancement` es opcional solo para objetos no mágicos o `needsReview`).
7. `damageType` de `extraDamage` es `"untyped"` cuando el texto no da tipo (Anarchic/Axiomatic/Holy/Unholy 2d6 contra criaturas alineadas, Bane, Merciful, Vicious, ...). Los multiplicadores de crítico (×3, ×4) de los *burst* y Thundering son entradas `onCritical` propias.
8. `weightLb: null` cuando el peso no es numérico (`varies`, `15+ lbs.`: Carpet of Flying, Bag of Holding); el literal está en `textEn`. Los precios sin campo (`Price`) en objetos malditos/artefactos: `priceRaw: ""`, `priceCp: null`. Los objetos no mágicos específicos (12) tienen `construction` vacía.
9. `textEn` = línea de cabecera (`**Aura** ..; **CL** ..; **Slot** ..; **Price** ..; **Weight** ..`) + secciones (`**Description**`, `**Resonance**`...) + `**Construction**` con `Requirements`/`Cost` (cursivas conservadas). Los `general` llevan el texto de la sección con sus tablas en Markdown. `Source` y `PFS` no se incluyen.
10. Resúmenes ES: `summaries/magic-items/<kind>.json` (442, `draft`, escritos solo desde el `textEn`; nombres de objetos, conjuros y dotes en inglés). Glosario: `glossary/magic-items.es.json` (442 claves `draft`, el nombre inglés como marcador, como `feats`). **No se regeneró `glossary.es.json`** (TZ.2). Algunos resúmenes de textos largos (`magic-item-creation`, `intelligent-items`, `cursed-items`, `mirror-of-life-trapping`, `iron-flask`...) están hechos desde el inicio del texto; el humano debe revisarlos.

## needsReview (27)

- Restricción de uso sin estructurar (R81): `animated` («cannot be added to a tower shield»), `ghost-touch-weapon` («melee weapons and ammunition»).
- Objeto base o mejora no deducibles / ambiguos (R70): `adamantine-battleaxe`, `mithral-heavy-shield`, `screaming-bolt`, `javelin-of-lightning` (no declara +N), `holy-avenger`, `mace-of-smiting`, `shatterspike`, `sword-of-the-planes` (varias menciones).
- Texto de otro libro (Q13): `golem-manuals` + 16 Ioun Stone (`*-normal-ioun-stone`, sección Resonance).
- Los avisos `Extra Channel`/`Rapid Reload` del Lote C no aplican aquí.

## R88: entradas con bonificador tipado y sin efecto estructurado (26, para el humano)

armor-of-rage, arrow-catching, bracers-of-archery-lesser, candle-of-invocation, circlet-of-persuasion (Charisma-based checks), cloak-of-the-manta-ray (+3 de armadura natural, dentro de otra forma), codex-of-the-infinite-planes, deck-of-many-things, feather-tokens, figurines-of-wondrous-power, golem-manuals, mace-of-smiting, manual-of-bodily-health / manual-of-gainful-exercise / manual-of-quickness-of-action y tome-of-clear-thought / tome-of-leadership-and-influence / tome-of-understanding (bono inherente de un solo uso), pale-green-prism-normal-ioun-stone y stone-of-good-luck-luckstone (lista de objetivos que no se estructura entera), ring-of-elemental-command, ring-of-jumping-improved (el texto de la fuente omite «on»), rod-of-the-python, salve-of-slipperiness, shatterspike, sword-of-the-planes. Cada uno puede estructurarse con un override (`reason` + `evidence`, R49) si el humano lo decide.

## Discrepancias con los goldens del spec (NO corregidas)

- **Flame Tongue (R70):** el golden dice `abilityIds` = `flaming` y `flaming-burst`; la fuente dice «This is a +1 flaming burst longsword» (una sola habilidad) y los datos tienen `["flaming-burst"]`. Anotado en `tests/data/fixtures/magic-golden.json` (`specAbilityIds`, `discrepancy`).
- Poción y varita de *cure light wounds* (50 gp / 750 gp): no hay entradas `potion`/`wand` (Q11); los precios están en las tablas de las secciones general `potions` y `wands` (comprobado en `magic-items.test.ts`).
- Todos los demás goldens (Keen, Seeking, Flaming, Ring of Protection, Cloak of Resistance, Belt of Giant Strength, Amulet of Natural Armor, Bracers of Armor, precios de mejora) coinciden con la fuente.

## Preguntas abiertas para el humano

- **Q11** (potion/oil/wand): ¿se declaran `expectedCount: 0` (recomendado) o se usa otra fuente para filas genéricas? Mientras tanto `data:validate` falla solo por `magic.sections-complete` (3 kinds).
- **Q13**: ¿se acepta el texto de AoN (con reimpresión de Ultimate Equipment) o se coteja con el CRB impreso? Especialmente Ioun Stones, Bracers of Armor, Belts/Headbands (texto «Treat this as a temporary ability bonus ... 24 hours», de UE).
- Los 2 objetos CRB sin texto en la fuente (Lens of Detection, Bag of Tricks).
- Objetos con elección del dueño (Belt of Physical Might, Headband of Mental Prowess): sin efectos estructurados por diseño.
- `ctx.config.magicSections` ahora tiene formato propio (`kinds` + `knownGaps`), definido en `schema/magic-item.ts` (`MagicSectionsConfigSchema`); `counts.ts` (Lote Z) debe delegar `magic-items` en `magic-refs` (R66/R67).

## Ficheros del Lote M

- Schema/datos: `src/data/schema/magic-item.ts`, `src/data/magic-items/{effects,evidence,index}.ts`, `src/data/magic-items/<kind>.json` (13), `src/data/provenance/magic-items.json`, `src/data/summaries/magic-items/<kind>.json` (13), `src/data/glossary/magic-items.es.json`.
- Integridad: `src/data/integrity/magic-refs.ts` (R66, R67, R75, R82, R83, R84, R85).
- Parser: `scripts/srd/parsers/magic-items/{index,catalog,header,variants,legal-for,effects,specific,rules,seeds-cli}.ts`.
- Config (solo mis claves): `scripts/srd/config/magic-sections.json`, `seeds.json` (`magic-items`: 562 URL = página de fuente, página de reglas, 7 índices y las 553 filas), `section-allowlist.json` (`magic-items`), `slug-aliases.json` (`magic-items`, 17 alias).
- Tests: `tests/data/schema/magic-item.test.ts`, `tests/data/magic-effects.test.ts`, `tests/data/integrity/magic-refs.test.ts`, `tests/scripts/srd/parse-magic-items.test.ts`, `tests/data/magic-items.test.ts`, `tests/data/helpers/magic.ts`, fixtures `tests/data/fixtures/{bonus-types,magic-golden}.json` y `tests/fixtures/srd-html/magic-items/*.html` (16 páginas reales recortadas al `span` del objeto).
- Descargas reales (solo vía `createFetchCache`, 1 req/s, caché): 553 filas + 9 páginas de índice/reglas + unas 15 páginas de sondeo.

## Trazabilidad R -> test (rutas bajo `tests/`)

| R | Test |
|---|---|
| R63, R64 | `data/schema/magic-item.test.ts` (registro, 17 kinds, una válida por kind, rechazos) |
| R65 | `scripts/srd/parse-magic-items.test.ts` (Keen, Cloak of Resistance), `data/magic-items.test.ts` |
| R66, R67 | `data/integrity/magic-refs.test.ts`, `data/schema/magic-item.test.ts` (config), `scripts/srd/parse-magic-items.test.ts` (`discover`), `data/magic-items.test.ts` (datos reales) |
| R68, R69 | `data/schema/magic-item.test.ts`, `scripts/srd/parse-magic-items.test.ts` (variantes de precio) |
| R70, R71 | `data/schema/magic-item.test.ts`, `scripts/srd/parse-magic-items.test.ts` (`resolveSpecific`, `enhancementPrices`), `data/magic-items.test.ts` (Flame Tongue, precios de mejora) |
| R72-R77 | `data/schema/magic-item.test.ts` (cada rechazo), `data/magic-effects.test.ts` (R73 contra `src/rules/types.ts` y `fixtures/bonus-types.json`), `data/integrity/magic-refs.test.ts` (R75), `scripts/srd/parse-magic-items.test.ts` (extracción) |
| R78 | `scripts/srd/parse-magic-items.test.ts`, `data/magic-items.test.ts` (Flaming) |
| R79, R80 | `data/magic-effects.test.ts`, `data/magic-items.test.ts` |
| R81, R82 | `scripts/srd/parse-magic-items.test.ts` (`legalFor`), `data/integrity/magic-refs.test.ts` (Keen sobre arco/maza/espada, Seeking sobre arma cuerpo a cuerpo y arrojadiza) |
| R83, R84, R85 | `data/integrity/magic-refs.test.ts` (sintéticos rotos y verde), `data/magic-items.test.ts` (datos reales contra equipo, habilidades y conjuros) |
| R86, R87 | `scripts/srd/parse-magic-items.test.ts` (Source múltiple, páginas sin etiqueta CRB, huecos) |
| R88 | `scripts/srd/parse-magic-items.test.ts` (`findEffectGaps`, informe), `scripts/srd/sample.test.ts` (Lote 0) |
| R89, R90 | `scripts/srd/sample.test.ts` (Lote 0); comprobado con `data:sample --seed 42` real (sección «Objetos mágicos») |
| R28-R33 (magic-items) | `data/magic-items.test.ts` (sin hallazgos de capa ES), `data/integrity/*.test.ts` (Lote 0) |
| R44 | `scripts/srd/parse-magic-items.test.ts` (determinismo, orden de páginas) |
| R45 | `scripts/srd/parse-magic-items.test.ts` (h3 y campo desconocidos) |

## Para el Lote Z

- `counts.ts` debe delegar `magic-items` en `magicRefsRule` (R66/R67).
- TZ.2: regenerar `glossary.es.json` (incluye `glossary/magic-items.es.json`, 442 claves).
- `data:validate` con todo cargado ya pasa R82/R84/R85 de `magic-items` (comprobado), excepto la sección Q11.
- No se marcó `humanReviewed`.
