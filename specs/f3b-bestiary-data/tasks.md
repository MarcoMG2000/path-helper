# f3b-bestiary-data: Tasks

> Orden: **Lote 0** (secuencial, un agente) -> **Lotes P1-P5 e I** (en paralelo, ficheros disjuntos)
> -> **Lotes M01..M<N>** (parseo por lote alfabético, hasta 4 a la vez, ficheros disjuntos) ->
> **Lote Z** (integración, un agente). Cada agente escribe su resultado en
> `progress/impl_f3b-bestiary-data_<lote>.md` y devuelve solo la referencia. Cada task se marca `[x]`
> al terminar con su test en verde; los tests se escriben ANTES o junto con el código (TDD).
> Ningún agente toca ficheros de otro lote. Si un lote halla una discrepancia entre la fuente y un
> golden, o un fallo de parser, NO lo resuelve fuera de su propiedad: lo anota y para.
> Prerrequisitos: f3 hecho (sus libs, schemas y datos Core), f2 hecho (Q14), f0 hecho.
> Ningún task descarga datos salvo Lote 0 (fixtures, una vez) y Lote I (único lote con red).

## Lote 0: Fundamentos (bloquea a todos)

- [ ] **T0.1** Preflight. Verificar que f3 y f2 están `done` y sus tests verdes. Exportar de
  `src/data/schema/*` (si no lo están) `noHtmlTags`, `allowedHost`, `slugify`, `AbilityEnum`,
  `GlossaryEntrySchema`, `ProvenanceSchema`; añadir a las libs de `scripts/srd/lib/` (fetch-cache,
  provenance, overrides, glossary-build, sample/prng) un parámetro opcional de raíz de datos con el
  valor por defecto actual. Los tests de f3 siguen en verde. Cubre: R2, R67 (habilita reutilización).
- [ ] **T0.2** `scripts/bestiary/config/{books.json,slug-aliases.json}`, `src/data/bestiary/
  categories.ts` (4 categorías), `schema/base.ts` (`BestiaryBaseEntrySchema`) y tests
  `categories.test.ts`, `schema/base.test.ts`. Cubre: R1, R2, R3, R4, R6, R7, R8.
- [ ] **T0.3** `integrity/ids.ts` real (R12, R13) con `integrity/ids.test.ts` y
  `tests/data/bestiary/core-isolation.test.ts` (schema Core rechaza `B1`; `CATEGORIES` sin
  categorías del Bestiario; `runIntegrity` Core igual con/sin Bestiario; escaneo de imports) y
  `layering.test.ts` (`src/web` solo `import type`; `src/data/bestiary` sin `server`/`web`).
  Cubre: R5, R9, R10, R11, R12, R13, R95.
- [ ] **T0.4** Schemas de monstruo: `schema/{dice,attack,spellcasting,monster-stats,monster,
  support,index-entry,review}.ts` (design §4), `STAT_LINE_KEYS`, `CR_LABELS`, `CREATURE_TYPES`, y
  tests `schema/monster.test.ts` y `schema/monster-stats.test.ts` con monstruos sintéticos
  (Goblin, dragón multibloque, constructo sin Con, mindless sin Int, incorpóreo sin Fue). Cubre:
  R14-R33, R37.
- [ ] **T0.5** Marco de integridad del Bestiario: `integrity/index.ts` (`BestiaryIssue` con
  `severity`, `runBestiaryIntegrity` que agrega TODO), y **stubs** que devuelven `[]` de
  `lines, references, cr-xp, armor-class, hit-points, type-progression, combat-maneuvers, saves,
  initiative, space, attacks, review-flags, reference-tables, batches, overrides, attribution,
  counts`, para que cada lote solo reemplace "su" fichero. Cubre: R78, R79 (estructura).
- [ ] **T0.6** `scripts/bestiary/cli.ts` con `import|parse|plan|glossary|index|validate|sample`,
  scripts `bestiary:*` en `package.json`, cerrojo `lib/lock.ts` (creación exclusiva con PID y
  fecha), y llamada a `bestiary:validate` en `init.sh`. Tests `import-lock.test.ts`,
  `validate-cli.test.ts` (código de salida, informe agregado por regla/lote/id, errores frente
  a avisos). Cubre: R67, R68, R78, R79.
- [ ] **T0.7** Procedencia por lote (`provenance/<categoría>[-<lote>].json` con `statBlocks` por
  página y `license: "OGL-1.0a"`), overrides con puntero JSON (reutiliza `overrides.ts` de f3) y
  `integrity/overrides.ts` real, más tests con `fetch` falso (huella, `--verify` sin escribir
  `src/data`, deriva de `sha256`). Cubre: R65, R69, R72, R74, R77.
- [ ] **T0.8** Aviso legal: ampliar `LICENSE-OGL.md` y `src/data/legal/section15.json` con la
  Section 15 del Bestiario literal; ajustar `tests/data/legal.test.ts` de f3 (aditivo) y crear
  `tests/data/bestiary/legal.test.ts`. Anotar en `progress/impl_f3b-bestiary-data_0.md` de dónde se
  copió el texto. Cubre: R63, R64, R65.
- [ ] **T0.9** Fixtures HTML: descargar UNA vez, con `fetch-cache`, las páginas de las trampas de
  design §5.4 (~15 páginas) y commitearlas en `tests/fixtures/bestiary-html/` con una nota de
  procedencia. Este es el único uso de red del lote (R77 se refiere a la suite de tests). Cubre: R34-R36, R73
  (insumos).
- [ ] **T0.10** Contrato para los lotes: documentar en `progress/impl_f3b-bestiary-data_0.md` la
  plantilla del parser (`ParserInput` = HTML cacheado + URL + lote; `ParserOutput` = entradas +
  `leftovers` + páginas excluidas), la propiedad de ficheros (design §7) y cómo registrar una
  discrepancia. Cubre: R70.

## Lote P1: Parser de bloques de estadísticas (dueño exclusivo del parser)

Posee `scripts/bestiary/lib/statblock/**`, `scripts/bestiary/parsers/monsters.ts`,
`config/section-allowlist.json`. Depende de T0.4 y T0.9.

- [ ] **TP1.1** `lexer.ts` + `lines.ts`: bloques, líneas de estadística conocidas, error en línea
  desconocida (R34), `descriptionEn` solo en el primer bloque (R36). Tests con HTML sintético y
  fixtures. Cubre: R33, R34, R36, R39.
- [ ] **TP1.2** `header.ts` y `defense.ts`: nombre, FP/PX, alineamiento, tamaño, tipo y subtipos,
  iniciativa, sentidos, auras, CA con componentes tipados, PG/dados, salvaciones, DR/SR/resistencias/
  inmunidades/debilidades/capacidades defensivas. Cubre: R14-R20.
- [ ] **TP1.3** `offense.ts` y `attacks.ts`: velocidades y maniobrabilidad, espacio/alcance,
  rutinas `or`, iterativos, `count`, mejora, daño (`dice`, `bonus`, crítico, extras, efectos),
  ataques especiales. Tests con una tabla de ~30 cadenas de ataque reales (casos del §5.4) con
  salida esperada escrita a mano. Cubre: R21-R25.
- [ ] **TP1.4** `spellcasting.ts` y `statistics.ts`: capacidades sortílegas/conjuros conocidos/
  preparados, características con `null`, BAB/CMB/CMD, dotes, habilidades con condicionales,
  idiomas, SQ, entorno/organización/tesoro. Cubre: R26-R31.
- [ ] **TP1.5** `special-abilities.ts` (nombre + `(Ex|Su|Sp)` + texto íntegro) y `names.ts`
  (resolución post-parseo de dotes, habilidades y conjuros contra Core y categorías de apoyo; no
  falla por no resolver: marca `unresolved`/`null`). Cubre: R32, R44, R45, R46 (resolución).
- [ ] **TP1.6** `parsers/monsters.ts`: ensamblado, `leftovers` + aviso `unparsed-fragment` (R35),
  lista permitida de secciones (R73), exclusión de libro ajeno (R41), recuento independiente de
  bloques (`countStatBlocksRaw`, R39), determinismo byte a byte (R71), `lines` ⊂ `textEn` (R33).
  Cubre: R33, R35, R39, R41, R71, R73.

## Lote P2: Integridad aritmética y avisos (dueño de las reglas de §6)

Posee `src/data/bestiary/integrity/{cr-xp,armor-class,hit-points,type-progression,combat-maneuvers,
saves,initiative,space,attacks,review-flags,reference-tables,explanations,batches,counts,lines,
references}.ts`, `scripts/bestiary/lib/review-flags.ts`, `scripts/bestiary/config/{xp-table,
type-progression}.json` y los goldens de tablas. Depende de T0.4, T0.5.

- [ ] **TP2.1** Tablas de referencia y goldens: `xp-table.json`, `type-progression.json`,
  `tests/data/bestiary/fixtures/{xp-table,type-progression}-golden.json` (de design §6, marcados
  "a confirmar contra la fuente"); `cmSz == -sizeModifier`. `integrity/reference-tables.ts` + test.
  Cubre: R61.
- [ ] **TP2.2** `cr-xp.ts`, `armor-class.ts` (suma, oráculo `armorClass()` de f2, `uncanny dodge`,
  `ac-component-mismatch`), `hit-points.ts`: caso verde y roto sintéticos por regla. Cubre:
  R47, R48, R49, R50, R51, R52.
- [ ] **TP2.3** `type-progression.ts`, `combat-maneuvers.ts`, `saves.ts`, `initiative.ts`,
  `space.ts`, `attacks.ts` y `explanations.ts` (lista de causas explicativas como datos): residuos
  calculados y expuestos para el informe. Cubre: R53-R58.
- [ ] **TP2.4** `review-flags.ts` (estampado de `reviewFlags`/`needsReview`, recalculo en
  validación, reconocimientos de `review/<lote>.json`). Cubre: R59, R60.
- [ ] **TP2.5** `counts.ts` (páginas, bloques, categorías de apoyo; por lote y total), `lines.ts`
  (R33), `references.ts` (tipos/subtipos, dotes, habilidades, conjuros; recuentos de sin resolver),
  `batches.ts` (partición disjunta, contigua, límite de tamaño de lote y de fichero). Cubre: R33,
  R38, R40, R42-R46, R75, R76.

## Lote P3: Categorías de apoyo

Posee `scripts/bestiary/parsers/{monster-feats,universal-rules,creature-types}.ts`,
`src/data/bestiary/{monster-feats,universal-rules,creature-types}.json`, sus `provenance`,
`overrides/support.json`. Depende de T0.4, T0.9 y de Lote I (TI.2) para los datos.

- [ ] **TP3.1** Fixtures y parsers de las tres categorías (solo `BestiaryBaseEntrySchema` + campos
  mínimos); tests. Cubre: R2, R8, R42.
- [ ] **TP3.2** Tras TI.2: parsear, commitear los JSON y la procedencia, congelar `expectedCount`.
  Cubre: R42, R43.

## Lote P4: Acceso a datos

Posee `src/data/bestiary/{bestiary-data-source,json-bestiary-data-source,
in-memory-bestiary-data-source,search,index}.ts`, `scripts/bestiary/lib/index-file.ts`.
Depende de T0.4.

- [ ] **TP4.1** `BestiaryDataSource`, `MonsterQuery`, `LocalizedMonster`, `displayName`,
  `InMemoryBestiaryDataSource`, `search.ts` (normalización sin acentos, filtros, orden estable) y
  contrato compartido. Cubre: R86, R87, R90, R91, R92.
- [ ] **TP4.2** `JsonBestiaryDataSource` (carga perezosa por `shards.ts`, validación al cargar,
  congelado profundo) y `lib/index-file.ts` (genera `monsters/index.json` y `shards.ts`);
  `bestiary-data-source.test.ts` contra ambas implementaciones con un lote sintético en un
  directorio temporal. Cubre: R85, R88, R89, R91.
- [ ] **TP4.3** Glosario del Bestiario: shards por lote y `terms.es.json` (13 tipos y 9 tamaños en
  borrador), `bestiary:glossary` reutilizando `glossary-build` de f3, `glossary.test.ts`
  (`verified` solo con `origin: human`; ausencia de clave no es error). Cubre: R92, R93, R94.

## Lote P5: Informe de muestreo

Posee `scripts/bestiary/lib/sample.ts` y `tests/scripts/bestiary/sample.test.ts`. Depende de T0.4 y TP2.3.

- [ ] **TP5.1** `buildBestiarySample` (estratos de design §11, PRNG de f3), render Markdown con
  `lines` literales junto a campos estructurados y residuos, contadores, `--crosscheck` con
  `fetchText` inyectado. Cubre: R80, R81, R82, R83, R84.

## Lote I: Índice, plan y descarga (único lote con red)

Posee `scripts/bestiary/{lib/discover.ts,config/seeds.json,config/batches.json}` y las cachés.
Depende de T0.6 y T0.7. Se ejecuta con el cerrojo (R68); puede correr en paralelo con P1-P5.

- [ ] **TI.1** `discover.ts` y `bestiary:plan`: descubrir páginas B1 desde el índice, filtrar por
  libro, producir `batches.json` (rangos alfabéticos <= `maxPagesPerBatch`) y congelar
  `expectedPages` en la procedencia. Test con índice HTML falso. Cubre: R38, R41, R67, R75.
- [ ] **TI.2** `bestiary:import` de las páginas de apéndices (reglas universales, dotes de
  monstruo, tipos y subtipos). Cubre: R67, R69.
- [ ] **TI.3** `bestiary:import` de todas las páginas de monstruo (en serie, 1 petición/s, caché).
  Informe `reports/bestiary-import-<fecha>.md` con páginas excluidas por libro. Cubre: R41, R67, R69, R72.
- [ ] **TI.4** **Entrega al humano** (puerta de revisión): `batches.json`, `expectedPages` y el
  informe, para contrastar con el índice del libro (Q12) y confirmar Q1/Q2. Los lotes M no se lanzan
  hasta esa confirmación.

## Lotes M01..M<N>: parseo y revisión por lote (en paralelo, hasta 4 a la vez)

Un agente por lote `b<NN>` de `batches.json`. Cada uno posee SOLO `monsters/b<NN>.json`,
`provenance/monsters-b<NN>.json`, `overrides/b<NN>.json`, `review/b<NN>.json`,
`glossary/monsters-b<NN>.es.json` y `tests/data/bestiary/monsters-b<NN>.test.ts`. No edita parser,
reglas ni schemas. Depende de P1, P2, P3, TI.4.

- [ ] **TM<NN>.1** `bestiary:parse -- --batch b<NN>` (offline). Si el parser falla por línea o
  encabezado desconocido, o por recuento de bloques (R34, R39, R73), anotar en
  `progress/impl_f3b-bestiary-data_M<NN>_bugs.md` y parar. Cubre: R70, R71.
- [ ] **TM<NN>.2** Revisar el informe de avisos del lote: por cada error, override con `reason` y
  `evidence` (R74) o bug de parser (nota); por cada aviso, dejarlo marcado. NO reconocer avisos
  (`review/`): lo hace el humano. Cubre: R47-R59, R74.
- [ ] **TM<NN>.3** Shard de glosario vacío (o con los nombres que el humano aporte) y
  `monsters-b<NN>.test.ts`: esquema, ids, recuento del lote, `runBestiaryIntegrity` sin errores
  sobre el lote, tamaño <= 400 KB. Cubre: R12, R13, R38, R40, R76.
- [ ] **TM<NN>.4** Congelar `expectedStatBlocks` del lote en su procedencia y listar en el informe
  del lote: entradas con `needsReview`, dotes/habilidades/conjuros sin resolver. Cubre: R40, R44-R46.

## Lote Z: Integración (después de M y P)

- [ ] **TZ.1** `bestiary:index` -> commitear `monsters/index.json`, `monsters/shards.ts`;
  `bestiary:glossary` -> `glossary.es.json`; test `index-file.test.ts`. Cubre: R85, R93, R94.
- [ ] **TZ.2** `attribution.ts` + `config/attributions.json` (bidireccional con la Section 15) y
  campo `attribution` en las entradas afectadas; `legal.test.ts` completo. Cubre: R63-R66.
- [ ] **TZ.3** `tests/data/bestiary/fixtures/monster-golden.json` (>= 12 monstruos, propuesta:
  Goblin, Ogre, Wolf, Owlbear, Troll, Ghoul, Skeleton (bloque de ejemplo), Air Elemental, Stone
  Golem, Dragon Red (Young), Pit Fiend, Tarrasque) escrito a mano desde la fuente y marcado "a
  confirmar" para aprobación humana, y `monsters-golden.test.ts`. Cubre: R62.
- [ ] **TZ.4** `bestiary:validate` en verde sobre los datos reales (la corrección de hallazgos
  se hace en el lote dueño, no aquí), añadido a `init.sh` y a la suite. Cubre: R78, R79.
- [ ] **TZ.5** Informe de muestreo con `--seed 42 --per-type 3` entregado al humano junto con la
  lista de preguntas abiertas pendientes (Q1-Q18) en `progress/impl_f3b-bestiary-data_Z.md`. NO marcar
  `humanReviewed`. Cubre: R80-R84.
- [ ] **TZ.6** Verificar la trazabilidad completa R1-R95 <-> tests (tabla de `requirements.md`) y
  anotar el estado en `progress/impl_f3b-bestiary-data_Z.md`, incluida la nota para f5b: usar
  `BestiaryDataSource`, `MonsterStatsSchema` y solo en servidor. Cubre: todos.

## Resumen de paralelismo

```
Lote 0 ──► ┬─ P1 parser ─────────────┐
           ├─ P2 integridad ─────────┤
           ├─ P5 muestreo            ├──► [humano: TI.4] ──► M01..M<N> (hasta 4) ──► Z
           ├─ P4 datasource          │
           ├─ I  índice+descarga ────┤
           └─ P3 apoyo (tras TI.2) ──┘
```
Conflictos evitados por: ficheros disjuntos por lote (design §7), stubs de integridad creados en
T0.5, un único fichero de monstruos por lote, glosario y overrides por lote, descarga única en serie
con cerrojo, y parser/reglas/schemas con un único dueño.
