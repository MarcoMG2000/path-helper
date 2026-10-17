# Implementación - f3-srd-data, Lote Z (integración)

Estado: **implementado** (TZ.1..TZ.5 marcadas `[x]` en `specs/f3-srd-data/tasks.md`). Pendiente de reviewer y de las decisiones humanas de abajo.
No se tocó `feature-list.json`, no se marcó la feature `done`, no se hicieron commits, no se marcó `humanReviewed`, no se configuró el contraste d20pfsrd. No quedan procesos en segundo plano. Lo que sigue sin commitear en el árbol (además de lo de este lote) es el trabajo previo del Lote M que ya estaba modificado antes de empezar: `scripts/srd/parsers/magic-items/effects.ts`, `src/data/magic-items/{armor-ability,ring}.json` y `progress/impl_f3-srd-data_M.md`.

## Resultado de la verificación (todo real, ejecutado al final, sin otros agentes)

| Comando | Resultado |
|---|---|
| `bash ./init.sh` (incluye `npm ci`, `npm test` y ahora `npm run data:validate`) | **exit 0**: 123 ficheros / 1604 tests en verde; `data:validate: sin errores.` |
| `npm run test:int` | 7 ficheros / 47 tests en verde |
| `npm run lint` | sin errores |
| `npm run typecheck` | sin errores |
| `npm run build` | OK (`tsc --noEmit` + `vite build`, PWA generado) |
| `npm run data:validate` | `sin errores` sobre las 13 categorías reales |
| `npm run data:glossary` | `glossary.es.json` generado: 1874 claves (42 `term` + 1832 de entradas); `data:validate` ya no informa `glossary.stale` |
| `npm run data:sample -- --seed 42 --per-category 8` | 145 entradas; dos ejecuciones dan el mismo md5 (R54) |

## TZ.1: integración cruzada

- `src/data/integrity/counts.ts` real (sustituye el stub). R26: recuento de cada categoría = `expectedCount` congelado en su procedencia (unión R98); toda categoría con datos tiene procedencia válida (licencia OGL en cada fichero de lote); `magic-items` se delega en R66/R67 de `magic-refs` (solo se le exige tener procedencia). R99 para `spells`: rangos de `spell-batches.json` contiguos, disjuntos y que cubren `a`-`z`, cada conjuro en exactamente un lote, recuento real por lote = `expectedCountByBatch` congelado, config = procedencia, y suma por lote = `expectedCount` total.
- `class-refs` contra `skills`, `domain-refs` contra `spells`, `spell-lists` (R92 con claves de dominio de `domains`) y `magic-refs` contra `weapons`/`armor`/`shields`/`skills`/`spells` ya estaban implementados por los lotes A, D0 y M con datos sintéticos; en Z se ejercen sobre los datos reales (0 hallazgos) y con copias alteradas de esos datos reales para demostrar que se evalúan de verdad: `tests/data/integrity/cross-categories.test.ts` (27 tests). R85 ya fallaba con `spellId: null` y nombre de conjuro del CRB (lo hizo M); se prueba con un `spellRefs` real alterado.
- Nota R82: sobre los datos reales solo hay 3 pares (objeto específico, habilidad) con `abilityIds`: `flame-tongue:flaming-burst`, `frost-brand:frost`, `rapier-of-puncturing:wounding`; los tres tienen `legalFor` y son legales. El test fija esos tres pares (si un lote futuro añade más, el test avisa).
- Hallazgo menor: 3 objetos específicos tienen `baseItemId: null` y `needsReview: true` (adamantine-battleaxe, mithral-heavy-shield, screaming-bolt): R84 no puede validarlos; ya estaban en la lista de revisión humana de M.
- Tests de este lote: `tests/data/integrity/counts.test.ts` (20), `tests/data/integrity/cross-categories.test.ts` (27). Se ajustó un test de D0 (`spell-lists.test.ts`) para que el dataset sintético ignore también `counts.*` (como ya ignoraba `summaries`/`glossary`: no tiene procedencia), y `tests/data/magic-items.test.ts` (Q11 ahora es `expectedCount: 0`, ver abajo).

### Alias de dominio -> conjuro (encargo 2): resueltos con `slug-aliases.json`, categoría `spells`

Causa: la página de dominio de AoN escribe los conjuros en cursiva con lenguaje corriente (`greater teleport`, `summon monster IX`, `mass heal`) y las páginas de conjuro se titulan al estilo AoN (`Teleport, Greater`, `Summon Monster 9`, `Heal, Mass`). El parser de dominios (Lote A) calculaba `spellId` con `resolveEntryId("spells", nombre, {})` (sin alias). Mecanismo: R4/`resolveEntryId` con la tabla `spells` de `scripts/srd/config/slug-aliases.json`; el parser de dominios ahora le pasa `config.slugAliases` (cambio de 3 líneas en `scripts/srd/parsers/domains.ts`) y se re-ejecutó `data:parse --category domains` OFFLINE desde la caché. El `name` literal de cada conjuro de dominio no cambia; **el único diff de `src/data/domains.json` son exactamente los 18 `spellId` afectados** (comprobado con `git diff`); no se tocó ningún dato de `spells`. 14 alias (los 18 errores son 14 slugs distintos, `summon-monster-ix` x4 y `mass-cure-critical-wounds` x2). Justificación, comprobada contra el HTML cacheado de cada `DomainDisplay.aspx` y contra los ids de `spells` (todos existen y son únicos, ninguna ambigüedad):

| Alias (slug en la página del dominio) | Id de `spells` | Dominios que lo usan | Evidencia |
|---|---|---|---|
| `summon-monster-ix` | `summon-monster-9` | chaos, evil, good, law (nivel 9, «chaos/evil/good/law spell only») | «summon monster IX» = Summon Monster 9 (el conjuro numera 1-9; AoN lo titula con cifra) |
| `summon-monster-v` | `summon-monster-5` | darkness (nivel 5, «summons 1d3 shadows») | ídem |
| `summon-natures-ally-iv` | `summon-natures-ally-4` | animal (nivel 4, «animals only») | ídem para Summon Nature's Ally |
| `summon-natures-ally-viii` | `summon-natures-ally-8` | animal (nivel 8, «animals only») | ídem |
| `mass-cure-critical-wounds` | `cure-critical-wounds-mass` | community (8), healing (8) | AoN titula «Cure Critical Wounds, Mass» |
| `mass-heal` | `heal-mass` | healing (9) | «Heal, Mass» |
| `mass-invisibility` | `invisibility-mass` | trickery (8) | «Invisibility, Mass» |
| `greater-shadow-evocation` | `shadow-evocation-greater` | darkness (8) | «Shadow Evocation, Greater» |
| `greater-dispel-magic` | `dispel-magic-greater` | liberation (6) | «Dispel Magic, Greater» |
| `greater-command` | `command-greater` | nobility (5) | «Command, Greater» |
| `greater-glyph-of-warding` | `glyph-of-warding-greater` | rune (6) | «Glyph of Warding, Greater» |
| `greater-teleport` | `teleport-greater` | travel (7) | «Teleport, Greater» |
| `lesser-confusion` | `confusion-lesser` | madness (1) | «Confusion, Lesser» |
| `lesser-planar-binding` | `planar-binding-lesser` | rune (5) | «Planar Binding, Lesser» |

Tests: `tests/scripts/srd/parse-domains.test.ts` (alias aplicado al `spellId` y `name` intacto, con la fixture real de Chaos) y `cross-categories.test.ts` (cada `spellId` de dominio = `resolveEntryId` del nombre literal; los 14 alias apuntan a ids existentes, no chocan con un id real de `spells` y los usa algún dominio; quitar `teleport-greater` hace fallar Travel). Si prefieres NO regenerar `domains.json` y dejar los slugs literales con resolución solo en la regla, dímelo: el cambio es revertir `domains.ts` y `domains.json` y mover el alias a `domain-refs.ts`.

## Decisiones tomadas por recomendación por defecto (pendientes de ratificación humana)

1. **Q11 (pociones, aceites, varitas).** En `scripts/srd/config/magic-sections.json`, `potion`, `oil` y `wand` pasan de `pending: "Q11"` a `expectedCount: 0` con `reason` explícito (AoN no tiene páginas CRB de esos objetos con nombre; los precios genéricos viven en las entradas `general` `potions` (Tabla 15-12) y `wands` (Tabla 15-17), también `scrolls` Tabla 15-15). El `reason` dice «Q11, decisión por recomendación por defecto, pendiente de ratificación humana». Con esto `magic.sections-complete` pasa a cero. Si el humano prefiere otra fuente (d20pfsrd o Paizo PRD), hay que volver a `pending` o a añadir entradas.
2. **«Nethys Note» de `summon-monster-1`.** Override documentado `src/data/overrides/spells/s-z.json` (`textEn`, con `reason` y `evidence` que cita `SpellDisplay.aspx?ItemName=Summon Monster 1`, PRPG Core Rulebook pg. 350, el párrafo en negrita justo antes de la tabla «1st Level»): se elimina solo ese párrafo (habla del *Monster Summoner's Handbook*, otro libro). Aplicado con `data:parse --category spells:s-z` (offline); el único cambio en datos es `spells/s.json` (`textEn` de ese conjuro) y `provenance/spells/s-z.json` (`overridesApplied`). Búsqueda en todos los datos: es la única nota «Nethys» (ni en `summon-natures-ally-1`). Test: `tests/data/spells/overrides.test.ts` (incluye que ninguna otra entrada contenga «Nethys Note»/«Note from Nethys»). Aviso: el mismo `textEn` empieza por «*Note:* Antipaladins may only summon evil creatures.», una nota de AoN sobre otra clase (APG) pero que NO es el patrón «Nethys»; no se tocó (lo dejo para el humano).
3. **Test `validate`**: el spec lo llamaba `tests/data/validate.int.test.ts` «como test normal»; ese nombre lo excluye `vitest.config.ts` (`*.int.test.*`), así que es `tests/data/validate.test.ts` (corre en `npm test` e `init.sh`). Ejecuta la CLI `validate` sobre los datos reales, `runIntegrity` completo y `JsonRulesDataSource` sobre las 12 categorías con entradas (todas con `nameEs` y `summaryEs`).
4. **`init.sh`**: tras `npm test`, ejecuta `npm run data:validate` (offline, falla con exit != 0).

## Discrepancias de goldens (NO corregidas, para el humano)

- **Flame Tongue (R70):** el golden del spec (design §14.8) dice `abilityIds` = `flaming` + `flaming-burst`; la fuente (AoN) dice «This is a +1 flaming burst longsword», una sola habilidad, y los datos tienen `["flaming-burst"]`. Anotado por M en `tests/data/fixtures/magic-golden.json` (`specAbilityIds`, `discrepancy`).
- **Cleave (R17):** el golden del spec dice «Str 13, Power Attack»; la fuente (CRB pg. 119) añade «base attack bonus +1». Los datos incluyen `bab: 1`; no es contradicción, solo golden incompleto (Lote C).
- Poción/varita de *cure light wounds* (50 gp / 750 gp): no existen como entradas (Q11); los precios están en las tablas de las entradas `general` `potions`/`wands` (test de M).
- Half-Orc también tiene «+2 a una característica a elegir» (R15 solo cita humano y semielfo; Lote B) y las 7 razas llevan `needsReview` por `Source` múltiple (Q13).
- Armas: la fuente declara 88 enlaces pero lista 87 distintos (`Crossbow bolts (10)` repetido); se congeló 87 (Lote E, Q10).

## Recuentos finales por categoría (todos = `expectedCount` congelado; R26 verde)

| Categoría | Entradas | Notas |
|---|---|---|
| classes | 7 | |
| class-features | 240 | |
| domains | 33 | |
| races | 7 | |
| skills | 35 | |
| feats | 176 | 2 `needsReview` (Extra Channel, Rapid Reload) |
| spells | 623 | lotes a-d 172, e-k 142, l-r 146, s-z 163 (suma 623) |
| spell-lists | 5 listas | bard 164, cleric 236, druid 169, paladin 45, ranger 51 (R22: 0 incoherencias) |
| weapons | 87 | |
| armor | 12 | |
| shields | 6 | |
| gear | 164 | |
| magic-items | 442 | armor-ability 17, artifact 12, cursed 29, general 21, ring 34, rod 24, shield-ability 14, specific-armor 12, specific-shield 8, specific-weapon 30, staff 21, weapon-ability 30, wondrous 190; potion/oil/wand/intelligent: `expectedCount: 0` con motivo |

Capa ES: 1832 resúmenes `draft` y 1874 claves de glosario `verified: false` (nombres españoles de Devir pendientes de Q2: casi todo es el nombre inglés como marcador).

## TZ.4: informe de muestreo para el humano

- Fichero: `reports/srd-sample-42.md` (git-ignorado; reproducible con `npm run data:sample -- --seed 42 --per-category 8`, mismo md5 en dos ejecuciones). 145 entradas: 8 por categoría + estratos (un `kind` de objeto mágico por cada uno de los 13, una por escuela de conjuro, una solo `sorcerer`/`wizard`, `needsReview`, un override). Incluye los contadores de R90/R103 (huecos R88: 26 objetos mágicos con bonificador tipado sin efecto estructurado; 421 con `reprintedIn`; conjuros por clave de nivel, por escuela, 270 con campos `kind: "other"` y 175 solo sorcerer/wizard). Sin red: no se pasó `--crosscheck`.
- NO se marcó `humanReviewed` en ninguna procedencia.

## TZ.5: trazabilidad R1-R103 <-> tests

Mapa generado escaneando `tests/{data,scripts,setup}/**/*.test.ts` (más los contratos compartidos de `tests/data/helpers/`). **Todas las R1-R103 tienen al menos un test, salvo R40.** Detalle por lotes en los informes `progress/impl_f3-srd-data_*.md`; resumen de los cierres de Z:

| R | Test(s) |
|---|---|
| R14 | `data/integrity/cross-categories.test.ts` (datos reales + capacidad quitada), `data/integrity/class-refs.test.ts`, `data/classes.test.ts` |
| R23 | `data/integrity/cross-categories.test.ts` (33 dominios, alias, Travel sin `teleport-greater`), `data/integrity/domain-refs.test.ts`, `data/domains.test.ts`, `scripts/srd/parse-domains.test.ts` |
| R26 | `data/integrity/counts.test.ts`, `data/integrity/cross-categories.test.ts`, tests de datos de cada lote |
| R33, R36 | `data/validate.test.ts` (glosario fresco = generado), `data/integrity/glossary.test.ts`, `scripts/srd/cli.test.ts` |
| R35, R58, R59 | `data/helpers/rules-data-source-contract.ts` (usado por `data/rules-data-source.test.ts`), `data/validate.test.ts` (datos reales) |
| R51, R52 | `data/validate.test.ts`, `scripts/srd/cli.test.ts`, `init.sh` |
| R53-R57, R89, R90, R103 | `scripts/srd/sample.test.ts`, `scripts/srd/cli.test.ts` + informe real `reports/srd-sample-42.md` |
| R82, R84, R85 | `data/integrity/cross-categories.test.ts` (datos reales + alterados), `data/integrity/magic-refs.test.ts`, `data/magic-items.test.ts` |
| R83, R87 | `data/integrity/magic-refs.test.ts` (R83); `scripts/srd/parse-magic-items.test.ts` (R87); R83 además verde sobre los datos reales (`validate`) |
| R92 | `data/integrity/cross-categories.test.ts`, `data/integrity/spell-lists.test.ts`, `data/schema/spell.test.ts` |
| R98, R99 | `data/integrity/counts.test.ts`, `data/integrity/cross-categories.test.ts`, `data/schema/provenance.test.ts`, `scripts/srd/spell-batches.test.ts`, `data/spells.test.ts` |
| R49 | `data/spells/overrides.test.ts` (override real de `summon-monster-1`), `data/integrity/overrides.test.ts` |

### R que quedan esperando decisión humana

- **R40** (pantalla de aviso legal en la app web): sin test hasta que se resuelva **Q6** (qué feature monta `/legal`; f0 reserva ruta y f8 la implementa, propuesta). `data/legal.test.ts` cubre el contrato `getLegalNotice()` (R37-R39).
- **R66** (Q11): cumplido formalmente con `expectedCount: 0` + motivo, pero por decisión por defecto; el humano debe ratificar o elegir otra fuente.
- **R26/R67** con recuentos congelados desde la propia fuente (circular): falta el contraste con el CRB impreso (**Q10**).
- **R86/R65** (texto de AoN con reimpresiones) hasta que se decida **Q13**; **R28-R33** (capa ES) hasta que se aporten los nombres de Devir (**Q2**).
- Las 2 dotes + 7 razas + 27 objetos mágicos `needsReview` (Q13) y los 26 objetos de la lista R88.

## Preguntas abiertas Q1-Q15 (estado)

| Q | Estado | Qué se necesita |
|---|---|---|
| Q1 | abierta (obligatoria) | Monstruos: por defecto el GM los introduce a mano y este feature NO importa el Bestiario. Confirmar. |
| Q2 | abierta | Nombres ES de Devir: todo el glosario es borrador (`verified: false`); aportar/confirmar los 14 términos listados y cómo mostrar el nombre no verificado. |
| Q3 | RESUELTA (2026-10-16) | Objetos mágicos del cap. 15 dentro de f3. |
| Q4 | RESUELTA (2026-10-16) | `spells` con los 623 conjuros del CRB. |
| Q5 | abierta | Errata: se usa el texto de AoN tal cual; ¿o la impresión? |
| Q6 | abierta | Quién monta la pantalla de aviso legal (R40) y revisión legal de Product Identity de Paizo (se conserva el texto verbatim). |
| Q7 | abierta | Compañeros/monturas/familiares quedan como texto; ¿se estructuran en f7? |
| Q8 | abierta | AoN como fuente primaria (descarga cortés, 1 req/s) o Paizo PRD. |
| Q9 | abierta | Guerrero, monje, hechicero y mago siguen sin entrada de clase (sus conjuros sí están en `spells`). |
| Q10 | abierta | Contrastar con el CRB impreso los recuentos congelados: 7 clases, 7 razas, 35 habilidades, 176 dotes, 623 conjuros, 87 armas (88 declaradas), 12 armaduras, 6 escudos, 164 bienes, 442 objetos mágicos (+2 objetos del CRB sin texto en la fuente: Lens of Detection y Bag of Tricks). |
| Q11 | **decidida por defecto en Z, pendiente de ratificación** | Pociones/aceites/varitas: `expectedCount: 0`; ¿otra fuente para filas genéricas? |
| Q12 | RESUELTA (2026-10-16) | `spellRefs.spellId` enlaza todo conjuro del CRB. |
| Q13 | abierta | Texto de páginas con varias `Source` (AoN muestra reimpresiones de Ultimate Equipment/ACG, p. ej. Ioun Stones, Bracers of Armor, Belts, Extra Channel, Rapid Reload, las 7 razas): ¿se acepta o se coteja con el CRB impreso? |
| Q14 | abierta | Materiales especiales (adamantina, mithril...): fuera por defecto; ¿`gear` categoría `special-material`? |
| Q15 | abierta | Listas de hechicero/mago: por defecto sin `spell-lists` (se obtienen con `spellsForClass`). |

Otras decisiones menores heredadas que el humano puede querer revisar (detalle en los informes de lote): `domainSpellsPerDay` del clérigo (A), tokens de competencias (A), `type`/`subtype` de razas omitidos y `languages.bonusAny` (B), campos ausentes de conjuros personales como `raw: ""`/`other` en vez de `none`/`no` (D0; unos 60 conjuros), ampliar el clasificador de rangos/duraciones de `fields.ts` para valores simples hoy en `kind: other` (`0 ft.`, `1 mile/level`...; 270 conjuros con algún `other`), munición y asedio dentro de `weapons` y complementos de armadura en `gear` (E), Improved Familiar sin su lista de criaturas (C), y los huecos de la fuente de M.

## Ficheros de Z

- Código: `src/data/integrity/counts.ts` (real), `scripts/srd/parsers/domains.ts` (alias de `spells`).
- Config/datos: `scripts/srd/config/slug-aliases.json` (+ categoría `spells`, 14 alias), `scripts/srd/config/magic-sections.json` (Q11), `src/data/domains.json` (18 `spellId`), `src/data/overrides/spells/s-z.json` (nuevo), `src/data/spells/s.json`, `src/data/provenance/spells/s-z.json`, `src/data/glossary.es.json` (regenerado).
- Tests: `tests/data/integrity/counts.test.ts`, `tests/data/integrity/cross-categories.test.ts`, `tests/data/validate.test.ts`, `tests/data/spells/overrides.test.ts` (nuevos); `tests/scripts/srd/parse-domains.test.ts`, `tests/data/magic-items.test.ts`, `tests/data/integrity/spell-lists.test.ts` (ajustes).
- Otros: `init.sh` (paso `data:validate`), `specs/f3-srd-data/tasks.md` (TZ.1-TZ.5), `progress/current.md`.
