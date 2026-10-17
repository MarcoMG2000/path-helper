# Implementación - f3-srd-data, Lote 0 (Fundamentos)

Estado: **implementado** (T0.1..T0.14 marcadas `[x]` en `specs/f3-srd-data/tasks.md`). Pendiente de reviewer.
La feature NO se ha marcado `done` ni se ha tocado `feature-list.json`. No se implementó ningún lote A-E/M/Z.

## Verificación (sin `npm ci` ni `init.sh`)

| Comando | Resultado |
|---|---|
| `npx vitest run` (suite completa del repo en ese momento) | 78 ficheros / 794 tests en verde |
| `npx vitest run tests/data tests/scripts tests/setup` | 28+ ficheros en verde (mis tests) |
| `npm run typecheck` | sin errores (ahora `tsconfig.json` incluye `scripts`) |
| `npm run lint` (`eslint .`) | sin errores |
| `npm run data:validate` (datos reales, vacíos) | `sin errores`, exit 0 |
| `npm run data:sample -- --seed 42 --per-category 8` | genera `reports/srd-sample-42.md` (0 entradas) |
| `npm run data:import` / `data:parse` sin semillas ni procedencia | mensaje y exit 0 |

Red real: solo 2 peticiones corteses (User-Agent identificable, >1 s entre ellas) para copiar el texto de la OGL
(`https://paizo.com/pathfinderRPG/prd/openGameLicense.html`) y ver el HTML de una página de AoN
(`SpellDisplay.aspx?ItemName=Magic Missile`, usada como fixture `tests/fixtures/srd-html/common/magic-missile.html`).
Los tests no usan red (R50).

## Dependencias

- `cheerio@1.2.0` (exacta, `npm view` del 2026-10-16) en **devDependencies** (`npm install --save-dev --save-exact`, una sola operación). No se añadió ninguna otra.
- Scripts `data:import|parse|glossary|validate|sample` en `package.json` (`tsx scripts/srd/cli.ts <subcomando>`). Se comprobó el diff: las dependencias/scripts de f1 (`create-gm`, `@fastify/cookie`) se conservan.

## Ficheros creados / tocados

- `src/data/`: `categories.ts`, `shard-loader.ts`, `rules-data-source.ts`, `json-rules-data-source.ts`, `in-memory-rules-data-source.ts`, `localize.ts`, `index.ts`, `glossary.es.json` (generado, 42 claves), `glossary/terms.es.json`, `legal/{ogl-1.0a.ts,section15.json,index.ts}`, `schema/{common,summary,glossary,provenance,override}.ts` (reales) y `schema/{class,class-feature,domain,race,skill,feat,spell,spell-list,equipment,magic-item}.ts` (stubs), `integrity/{index,types,helpers,format,schema,ids,book-filter,summaries,glossary,overrides}.ts` (reales) y `integrity/{class-tables,class-refs,domain-refs,feat-prereqs,spell-lists,magic-refs,counts}.ts` (stubs), y 13 `src/data/<categoría>/index.ts` generados.
- `scripts/srd/`: `cli.ts`, `lib/{paths,json,config,slug,rate-limiter,fetch-cache,provenance,overrides,html,sections,text,prng,shard-index,parser-contract,parser-registry,glossary-build,load-dataset,report,sample}.ts`, `config/{seeds,slug-aliases,section-allowlist}.json`.
- Raíz: `LICENSE-OGL.md`, `.gitignore` (`.cache/`, `reports/`), `.prettierignore` (+ `tests/fixtures/`, `LICENSE-OGL.md`: deben conservarse byte a byte), `tsconfig.json` (`include` + `scripts`), `vitest.config.ts` (`setupFiles`), `package.json`/`package-lock.json` (cheerio + scripts).
- Tests: `tests/data/**`, `tests/scripts/**`, `tests/setup/**`, `tests/fixtures/srd-html/common/magic-missile.html`.

## Cómo trabajan ahora los lotes (contrato estable)

### Reglas de oro
- **No se editan**: `categories.ts`, `package.json`, `config/slug-aliases.json` salvo alias propios, `integrity/index.ts`, `cli.ts`, `lib/**`. Cada lote solo sustituye "sus" ficheros y rellena "sus" claves de `seeds.json` / `section-allowlist.json`.
- **No ejecutar `npm run data:glossary` ni commitear `glossary.es.json`** (lo regenera el Lote Z, TZ.2). Hoy `glossary.es.json` solo contiene los 42 `term` y se queda desfasado en cuanto un lote añada shards; por eso las pruebas de datos reales de cada lote deben filtrar por categoría (abajo).
- Pruebas de datos reales de un lote:

```ts
import { loadDataset, loadIntegrityContext } from "../../scripts/srd/lib/load-dataset";
import { runIntegrity } from "../../src/data/integrity";
const { data, issues } = loadDataset(ROOT, ["feats"]);          // solo sus categorías
const found = runIntegrity(data, loadIntegrityContext(ROOT), { categories: ["feats"] });
```
  `categories` descarta los hallazgos globales (`glossary.stale`, ...) y los de otras categorías.
- Los tests sintéticos deben pasar `ctx.schemas` (o usar `BaseEntrySchema`) si no quieren depender del schema real de un lote; ver `tests/data/helpers/integrity.ts` (`baseContext`, `dataset`).

### Registro de categorías (`src/data/categories.ts`)
`CATEGORIES` (13, orden de `CATEGORY_IDS`), `getCategory(id)`, `EntryOf<C>`. Cada def: `dataset` (camelCase, `magicItems`), `shape` (`entries` | `record`; solo `spell-lists` es `record`), `schema`, `dir` (donde vive el `index.ts` generado), `shardPatterns` (+ `shardExclude`), `summaryDir`, `dottedIds` (solo `class-features`), `batched` (solo `spells`), `loadShards`.

Rutas de datos (relativas a `src/data`):

| Categoría | Ficheros de datos | `index.ts` generado |
|---|---|---|
| classes | `classes/*.json` | `classes/index.ts` |
| class-features | `class-features/*.json` | `class-features/index.ts` |
| domains | `domains.json` | `domains/index.ts` |
| races / skills | `races.json` / `skills.json` | `races/index.ts` / `skills/index.ts` |
| feats | `feats/*.json` | `feats/index.ts` |
| spells | `spells/*.json` salvo `spells/lists.json` | `spells/index.ts` |
| spell-lists | `spells/lists.json` | `spell-lists/index.ts` |
| weapons / armor / shields / gear | `equipment/{weapons,armor,shields,gear}.json` | `<categoría>/index.ts` |
| magic-items | `magic-items/*.json` | `magic-items/index.ts` |

**Todo shard JSON es un array de entradas** (también `domains.json`, `races.json`, `classes/druid.json` = array de 1), salvo `spells/lists.json`, que es un único objeto `clase -> nivel("0".."9") -> ids`. Los `index.ts` los regenera `data:parse` (y `data:glossary`) de la categoría procesada escaneando el disco, e incluyen también los resúmenes (`summaries/<cat>/**.json`). Si un lote añade resúmenes o glosario después del parse, vuelve a ejecutar `npm run data:parse -- --category <c>` (idempotente) para refrescar su `index.ts`; `data:validate` informa `index.stale` si hay desfase.

### Stubs que los lotes sustituyen (conservando los nombres de export)

| Fichero | Export(s) a conservar | Lote |
|---|---|---|
| `schema/class.ts`, `class-feature.ts`, `domain.ts` | `ClassSchema`, `ClassFeatureSchema`, `DomainSchema` | A |
| `schema/race.ts`, `skill.ts` | `RaceSchema`, `SkillSchema` | B |
| `schema/feat.ts` | `FeatSchema` | C |
| `schema/spell.ts` | `SpellSchema` (+ ya definidas `CRB_CLASS_IDS`, `SPELL_SCHOOLS`) | D0 |
| `schema/spell-list.ts` | `SpellListsSchema`, `SpellLists`, `CASTER_CLASS_IDS` | D0 |
| `schema/equipment.ts` | `WeaponSchema`, `ArmorSchema`, `ShieldSchema`, `GearSchema` | E |
| `schema/magic-item.ts` | `MagicItemSchema` (+ ya definida `MAGIC_ITEM_KINDS`) | M |
| `integrity/class-tables.ts`, `class-refs.ts`, `domain-refs.ts` | `classTablesRule`, `classRefsRule`, `domainRefsRule` | A |
| `integrity/feat-prereqs.ts` | `featPrereqsRule` | C |
| `integrity/spell-lists.ts` | `spellListsRule` | D0 |
| `integrity/magic-refs.ts` | `magicRefsRule` (R66/R67 incluidas) | M |
| `integrity/counts.ts` | `countsRule` | Z |

Los stubs de schema son `BaseEntrySchema.extend({})` (estricto): se sustituyen por el schema real **antes** de escribir datos. `BaseEntrySchema` es `z.strictObject` y `.extend()` conserva el modo estricto (comprobado en test). Los stubs de integridad devuelven `[]`.

Una regla es `IntegrityRule = (data: LoadedDataset, ctx: IntegrityContext) => IntegrityIssue[]` (puras). `LoadedDataset` trae todo **sin validar**: `entries[cat]` (crudas), `origins[cat][i]` (fichero), `spellLists`, `provenanceParts[cat]`, `overrideParts[cat]`, `summaryParts[cat]`, `glossary.{shards,committedText}`. `IntegrityContext` trae `slugAliases`, `config` (todos los `scripts/srd/config/*.json` restantes en camelCase: `config.spellBatches`, `config.magicSections`, `config.spellClassIds`, además de `seeds` y `sectionAllowlist`) y `schemas?` (sustitución en tests). Ayudantes en `integrity/helpers.ts` (exportados también por `integrity/index.ts`): `validEntries(data, cat, ctx)` (solo las que pasan su schema; las inválidas las informa la regla `schema`), `provenanceOf(data, cat)` (unión R98, con `error` si es inválida). `IntegrityIssue.category` admite además `"glossary"` y `"global"`.

Reglas reales ya registradas, en este orden: `schema` (R2, R3, R6, R7, R8, R60; reglas `schema.book|source|sourceRef|textEn|id`), `ids` (R4, R5), `book-filter` (R27), stubs, `summaries` (R28-R30), `glossary` (R31-R33, R36), `overrides` (R49). Una regla que lanza se convierte en hallazgo `integrity.crashed` y las demás siguen (R52).

### Plantilla de parser (T0.14)

Un parser es un módulo `scripts/srd/parsers/<módulo>.ts` (mapa fijo en `lib/parser-registry.ts`: `classes.ts`, `class-features.ts`, `domains.ts`, `races.ts`, `skills.ts`, `feats.ts`, `spells.ts`, `spell-lists.ts`, `equipment.ts` (weapons/armor/shields/gear comparten módulo; se distingue por `input.category`), `magic-items/index.ts`). Exporta `parse` y, opcional, `discover`. Tipos en `lib/parser-contract.ts`:

```ts
// ParserInput: HTML cacheado + URL de cada página registrada en la procedencia del ámbito
interface ParserInput { category; subset: string | undefined;           // --category c:subset
  pages: { url; html; sha256 }[]; config: { allowedSections: string[]; slugAliases } }
// ParserOutput: entradas + needsReview + páginas excluidas (+ extras)
interface ParserOutput { entries: ({ id: string } & Record<string, unknown>)[];   // shape "entries"
  record?: unknown;                                  // shape "record" (spell-lists)
  shardOf?: (entry) => string;                       // "classes/druid.json"; obligatorio si la categoría tiene patrón `dir/*.json`
  needsReview: { id; reason }[];                     // la CLI fuerza needsReview:true en esas entradas
  excluded: { url; book; reason }[];                 // R46/R87 -> informe
  counters?: Record<string, number>; notes?: string[];            // al informe (R97, R96, R88...)
  provenancePatch?: { importedKinds?: string[] } }
// discover (opcional): índices ya descargados -> URLs de entradas + recuentos congelables
discover({ category, subset, seedPages, config }) => { urls: string[]; expectations?: { expectedCount?; expectedCountByKind?; expectedCountByBatch? } }
```

Reglas del contrato: el parser es **puro** (sin red ni disco) y determinista (R44: no meter fechas ni orden de iteración no estable; la CLI ordena cada fichero por `id`). Debe usar `lib/html.ts` (`loadHtml`, `findContent`, `splitSections`, `labelledFields`, `sourceLabels`, `nodesToMarkdown` para `textEn` sin HTML), `lib/sections.ts` (`assertAllowedHeadings(page, headings, allowedSections)` lanza `SectionError` con página y encabezado, R45) y `resolveEntryId(category, name, config.slugAliases, kind?)` para los ids (R4). Un error del parser (excepción) detiene el parseo de ese ámbito sin escribir nada.

Flujo de la CLI (`scripts/srd/cli.ts`, `runCli(argv, deps)` testeable):
- `import [--category c[:sub][,...]] [--verify]`: descarga semillas (`seeds.json`: `urls` + `subsets[sub]`; sin subconjunto se usan todas) y las URLs de `discover`, con caché `.cache/srd-raw/<host>/<sha1>.html`, 1 req/s, User-Agent identificable y 3 reintentos con backoff (404/4xx no se reintenta). Escribe `provenance/<cat>.json` (o `provenance/<cat>/<sub>.json` en categorías `batched`, hoy solo `spells`; el subconjunto `index` va a `provenance/spells/index.json`). Los `expected*` **se congelan**: solo se fijan si faltan; un valor distinto se avisa y no se pisa. `--verify` vuelve a descargar sin tocar caché ni `src/data` y sale con 1 si hay diferencias.
- `parse [--category ...] [--accept-drift]`: offline, desde la caché; comprueba `sha256` (R47), llama al parser, aplica `overrides/<cat>.json` o `overrides/<cat>/*.json` (obsoleto o sin destino = error), valida **todo** contra el schema antes de escribir (falla cerrado), escribe shards ordenados por `id`, actualiza la procedencia (`importedKinds`, `overridesApplied`), regenera `<cat>/index.ts` y añade a `reports/import-<fecha>.md`.
- `glossary`, `validate` (código != 0; agrega por categoría > regla > id; además `load.json` e `index.stale`), `sample --seed n --per-category k [--crosscheck]`.
- En categorías `batched` con subconjunto, `parse` usa solo la procedencia del lote y la del `index`.

`seeds.json`: `{ "crosscheck": { "<cat>": "https://www.d20pfsrd.com/.../{slug}" }, "<cat>": { "urls": [...], "subsets": { "<sub>": [...] } } }` (hosts de R6; una clave por categoría ya presente con `urls: []`). `section-allowlist.json`: `{ "<cat>": ["Encabezado permitido", ...] }` (comparación sin distinguir mayúsculas). `slug-aliases.json`: `{ "<cat>": { "<slug>" | "<kind>.<slug>": "<id>" } }`.

### Procedencia, overrides, resúmenes y glosario (formatos)
- `provenance/<cat>.json`: `{license:"OGL-1.0a", category, batch?, importerVersion, expectedCount?, expectedCountByKind?, expectedCountByBatch?, importedKinds?, humanReviewed, reviewedBy?, reviewedAt?, pages:[{url,sha256,bytes,fetchedAt}], overridesApplied?:[{id,field,parsedValue}]}`. La unión de ficheros de lote (`mergeProvenance`, en `src/data/schema/provenance.ts`) suma `expectedCount`, fusiona mapas (clave repetida = error), exige `license` en cada fichero y rechaza lote o página duplicados (R98).
- `overrides/<cat>.json` (o `overrides/<cat>/<lote>.json`): array de `{id, field (ruta con puntos: table.3.special), value, reason, evidence}`.
- `summaries/<cat>/**.json`: objeto `id -> {summaryEs (1-300), status: draft|reviewed}`; R30 usa `checkNumericFidelity` (`+N` en el resumen se acepta si el texto trae `+N` o `N`; `-N` exige el signo).
- `glossary/**.es.json`: objeto `clave -> {es, verified, origin, kind, note?}`; claves `<categoría>:<id>` (class-features: `class-features:paladin.smite-evil`) y `term:<id>`. Nunca `verified:true` con `origin:draft` (R32).

## Desviaciones y decisiones (todas dentro del design; ninguna cambia un requisito)

1. `CATEGORY_IDS` (tupla) y `Category` viven en `schema/common.ts`; `CATEGORIES` es el registro de `categories.ts` (design §4 usaba el mismo nombre para ambas cosas).
2. `LocalizedEntry.summaryEs`/`summaryStatus` son `string | null` (el design los tipaba no nulos): una categoría sin resumen no debe lanzar en runtime; R29 lo exige en `validate`. `RulesDataSource.get/list` se restringen a `EntryCategory` (sin `spell-lists`) y `getSpellList(classId: string)` devuelve `undefined` para clases sin lista.
3. Ids de `class-features`: `BaseEntrySchema.id` sigue siendo kebab-case estricto; la regla `ids` acepta el prefijo `<clase>.` en `class-features` (`dottedIds`). El Lote A debe redefinir `id` en su schema (p. ej. `.extend({ id: ClassFeatureId })`).
4. Overrides obsoletos (R49): se detectan en `parse` (error) y en `validate` mediante `provenance.overridesApplied[].parsedValue` (formato añadido a la procedencia; el design no lo especificaba).
5. `<cat>/index.ts` incluye también `SUMMARIES` (lista estática de resúmenes), no solo los shards de datos.
6. `data:import --verify` sale con código 1 si hay diferencias o fallos (el spec solo pide listarlas).
7. `tsconfig.json` (+ `scripts` en `include`), `vitest.config.ts` (`setupFiles` de R50) y `.prettierignore` son ficheros de f0 tocados con cambios mínimos; el resto de tests de f0 siguen en verde.
8. `glossary.es.json` se genera y commitea ya (solo `term`) porque `JsonRulesDataSource` lo importa estáticamente y el build/tipos lo necesitan; el Lote Z lo regenera (TZ.2).
9. Aviso legal: la Section 15 contiene solo los avisos de la OGL, del SRD de Wizards, del Pathfinder Reference Document y del Core Rulebook (los que aplican al contenido usado); no se copiaron los de Bestiarios, Tome of Horrors, etc. de la misma página.

## T0.12: de dónde se copió el texto legal (para revisión humana)

- Texto de la OGL v1.0a (cláusulas 1-14 y encabezado de la 15) y avisos de la Section 15: copiados literalmente (espacios normalizados) de **https://paizo.com/pathfinderRPG/prd/openGameLicense.html** (Pathfinder Reference Document, sitio legacy de Paizo), párrafos "OPEN GAME LICENSE Version 1.0a" a "Pathfinder Roleplaying Game Core Rulebook. © 2009, Paizo Publishing, LLC; Author: Jason Bulmahn, based on material by Jonathan Tweet, Monte Cook, and Skip Williams.".
- Avisos incluidos (en este orden): `Open Game License v 1.0a Copyright 2000, Wizards of the Coast, Inc.`; `System Reference Document. Copyright 2000, Wizards of the Coast, Inc.; Authors Jonathan Tweet, Monte Cook, Skip Williams, based on material by E. Gary Gygax and Dave Arneson.`; `Pathfinder Roleplaying Game Reference Document. © 2011, Paizo Publishing, LLC; Author: Paizo Publishing, LLC.`; `Pathfinder Roleplaying Game Core Rulebook. © 2009, Paizo Publishing, LLC; Author: Jason Bulmahn, based on material by Jonathan Tweet, Monte Cook, and Skip Williams.`
- `LICENSE-OGL.md` es el render canónico de `getLegalNotice()` (`renderLegalMarkdown`), así que no pueden divergir. Q6 (revisión legal de Product Identity) sigue abierta.

## Trazabilidad R -> test (rutas bajo `tests/`)

| R | Test |
|---|---|
| R1, R63 | `data/categories.test.ts` |
| R2, R3, R6, R7, R8 | `data/schema/common.test.ts`, `data/integrity/index.test.ts`, `data/integrity/schema.test.ts` |
| R4, R5 | `data/integrity/ids.test.ts`, `scripts/srd/small-libs.test.ts` (slug/alias) |
| R27 | `data/integrity/book-filter.test.ts` |
| R28, R30 | `data/schema/summary.test.ts`, `data/integrity/summaries.test.ts` |
| R29 | `data/integrity/summaries.test.ts` |
| R31, R32, R33 | `data/schema/glossary.test.ts`, `data/integrity/glossary.test.ts`, `data/glossary.test.ts` |
| R34 | `data/glossary.test.ts` (42 `term` de design §7) |
| R35, R58, R59 | `data/rules-data-source.test.ts` (contrato ejecutado contra `JsonRulesDataSource` e `InMemoryRulesDataSource`) |
| R36 | `scripts/srd/glossary-build.test.ts`, `data/integrity/glossary.test.ts`, `scripts/srd/cli.test.ts` (`glossary`, `validate`) |
| R37, R38, R39 | `data/legal.test.ts`, `data/schema/provenance.test.ts` |
| R41, R42 | `scripts/srd/fetch-cache.test.ts`, `scripts/srd/provenance.test.ts`, `scripts/srd/cli.test.ts` (import) |
| R43, R44, R45, R46, R47 | `scripts/srd/cli.test.ts` (parse), `scripts/srd/html.test.ts` (R45: `assertAllowedHeadings`), `scripts/srd/provenance.test.ts` (R47) |
| R48 | `scripts/srd/provenance.test.ts`, `scripts/srd/cli.test.ts` (`--verify`) |
| R49 | `data/integrity/overrides.test.ts`, `data/schema/override.test.ts`, `scripts/srd/overrides.test.ts`, `scripts/srd/cli.test.ts` |
| R50 | `setup/no-network.test.ts` |
| R51, R52 | `scripts/srd/cli.test.ts` (validate), `data/integrity/index.test.ts` |
| R53, R54, R55, R56, R57 | `scripts/srd/sample.test.ts`, `scripts/srd/cli.test.ts` (sample, `--crosscheck`) |
| R60, R61 | `data/rules-data-source.test.ts` |
| R62 | `data/layering.test.ts` |
| R89, R90, R103 | `scripts/srd/sample.test.ts` (estrato por `kind`, estrato por escuela y sor/wiz, contadores) |
| R98 (unión de procedencia y overrides) | `data/schema/provenance.test.ts`, `scripts/srd/provenance.test.ts`, `scripts/srd/overrides.test.ts` |

Cubiertos en T0 solo en su parte de infraestructura (la regla de dominio es de otro lote): R14/R26/R98-R99 (Z/D), R66-R67 (M), R11/R12/R23 (A), R18-R19 (C), R21-R22/R92/R95-R96 (D0). R40 (pantalla legal) no pertenece al Lote 0.

## Puntos abiertos / ambigüedades detectadas (no bloquean a los lotes)

- Estructura real de AoN observada (Magic Missile): contenido plano en `<span id="MainContent_DataListTypes_LabelName_0">` con `<h1 class="title">`, campos `<b>Etiqueta</b> valor` separados por `<br>`/`;`, subcabeceras `<h3 class="framing">Casting|Effect|Description</h3>` y **contenido de otros libros en el mismo span** bajo `<h2 class="title">Mythic ...</h2>` con su propio `<b>Source</b>`; `lib/html.ts` (`splitSections`, `labelledFields`) está pensado para eso. La línea `Level` de la página real mezcla clases de otros libros (`arcanist`, `bloodrager`, `magus`, `psychic`...) y no incluye claves de dominio: confirma las previsiones de R97 (para que TD.1 lo cierre con fixtures).
- `tests/data/glossary.test.ts` comprueba que `glossary.es.json` contiene los `term` (no igualdad total) para no romperse mientras los lotes añaden shards; la igualdad la comprueban `validate` (R36) y el Lote Z.
- `src/data/index.ts` solo exporta la API del Lote 0; el Lote D0 puede importar `classifySpellFields`/`spellsForClass` por ruta (`src/data/spells/*`) sin tocar `index.ts`.
