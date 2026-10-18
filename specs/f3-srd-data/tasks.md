# f3-srd-data: Tasks

> Orden: **Lote 0** (secuencial, lo hace un solo agente) -> **Lotes A-C, E y M, y el grupo D** (en
> paralelo, un agente por lote, ficheros disjuntos, ver `design.md` §11; el grupo D es D0
> secuencial -> D1-D4 en paralelo -> D5) -> **Lote Z** (integración, un agente).
> Cada agente escribe su resultado en `progress/impl_f3-srd-data_<lote>.md` y devuelve solo la
> referencia. Cada task se marca `[x]` al terminar con su test en verde. Los tests de
> `tests/` se escriben ANTES o junto con el código (TDD). Ningún agente toca ficheros de otro lote.
> Prerrequisito: f0 hecho (`npm ci`, `tsx`, `vitest`, `tsconfig` strict). Si un lote halla una
> discrepancia entre una fuente y un golden, NO la resuelve: la anota y para.

## Lote 0: Fundamentos (bloquea a todos los demás)

- [x] **T0.1** `.gitignore`: añadir `.cache/` y `reports/`. Crear `src/data/categories.ts`
  (registro `CATEGORIES` de las 13 categorías, incluida `magic-items`, con rutas y schema por
  categoría; los ficheros `schema/<x>.ts` de cada lote se crean como stub que el lote dueño
  sustituye, para que `categories.ts` no vuelva a editarse) y `tests/data/categories.test.ts`.
  Cubre: R1.
- [x] **T0.2** `src/data/schema/common.ts` (`BaseEntrySchema`, hosts permitidos, `noHtmlTags`,
  `slugify`, `AbilityEnum`), `summary.ts`, `glossary.ts`, `provenance.ts` (con
  `license: "OGL-1.0a"`) y `tests/data/schema/common.test.ts`. Cubre: R2, R3, R6, R7, R8, R28, R31, R32, R39.
- [x] **T0.3** `scripts/srd/lib/slug.ts` + alias (`config/slug-aliases.json`) y
  `src/data/integrity/ids.ts` real + `tests/data/integrity/ids.test.ts`. Cubre: R4, R5.
- [x] **T0.4** Marco de integridad: `src/data/integrity/index.ts` (`IntegrityRule`,
  `IntegrityIssue`, `runIntegrity` agregador) y **stubs** de `book-filter, class-tables,
  class-refs, feat-prereqs, spell-lists, domain-refs, magic-refs, counts, summaries, glossary,
  overrides` (devuelven `[]`). Implementar ya `book-filter.ts` (R27), con test. Cubre: R27, R52.
- [x] **T0.5** Biblioteca de adquisición: `scripts/srd/lib/{rate-limiter,fetch-cache,provenance,
  html,text,overrides,prng}.ts`; `fetch` y reloj inyectables. Tests con `fetch` falso:
  tasa, reintentos acotados, caché hit/miss, escritura de `provenance`, `--verify` sin
  modificar `src/data`. La lectura/escritura de `provenance` y de `overrides` acepta tanto
  `<cat>.json` como el directorio `<cat>/<lote>.json` y trata la unión como el fichero de la
  categoría (R98), con test de unión, de `license` ausente y de lotes duplicados.
  Cubre: R41, R42, R47, R48, R98.
- [x] **T0.6** `scripts/srd/cli.ts` con subcomandos `import|parse|glossary|validate|sample`
  y su registro en `package.json` (`data:*`); `config/seeds.json` y `config/section-allowlist.json`
  con la estructura (se rellenan por lote, cada lote solo sus claves). `--category` acepta
  `categoría:subconjunto` (p. ej. `magic-items:ring`), que el parser de la categoría interpreta;
  sin subconjunto procesa la categoría entera. `validate` devuelve código != 0 y agrega errores.
  Cubre: R43, R45, R46, R51, R52.
- [x] **T0.7** `setup` de Vitest que sustituye `globalThis.fetch` por un stub que lanza
  y un test que lo comprueba. Cubre: R50.
- [x] **T0.8** Overrides: `scripts/srd/lib/overrides.ts` + `integrity/overrides.ts` reales
  (reason/evidence obligatorios, override obsoleto) con tests. Cubre: R49.
- [x] **T0.9** Capa ES y glosario: `scripts/srd/lib/glossary-build.ts` (fusión determinista de
  shards -> `glossary.es.json`), comando `data:glossary`, `integrity/glossary.ts` real (R32, R33
  con datos sintéticos, R36), `integrity/summaries.ts` real (R29, R30) y tests.
  Crear `src/data/glossary/terms.es.json` con los `term` de `design.md` §7 (incluidos los tipos
  de bonificador de los objetos mágicos), todos
  `origin: draft, verified: false`. Cubre: R29, R30, R31, R32, R33, R34, R36.
- [x] **T0.10** `RulesDataSource`, `JsonRulesDataSource` (carga perezosa por
  `<categoría>/index.ts`, validación zod al cargar), `InMemoryRulesDataSource`, test de
  contrato compartido, `LocalizedEntry`/`nameEs`. Cubre: R35, R58, R59, R60, R61.
- [x] **T0.11** `tests/data/layering.test.ts` (escaneo estático de imports de `src/data` y
  `src/rules`). Cubre: R62.
- [x] **T0.12** Aviso legal: `LICENSE-OGL.md` (texto OGL 1.0a íntegro + Section 15 literal),
  `src/data/legal/{ogl-1.0a.ts,section15.json,index.ts}` con `getLegalNotice()`, y
  `tests/data/legal.test.ts`. Anotar en `progress/impl_f3-srd-data_0.md` de dónde se copió el
  texto de la OGL y de la Section 15 para revisión. Cubre: R37, R38, R39.
- [x] **T0.13** `scripts/srd/lib/sample.ts` (`buildSample`, render Markdown, similitud de
  contraste con `fetchText` inyectado), comando `data:sample`, y `tests/scripts/srd/sample.test.ts`
  (semilla, estratificación, contenido, `--crosscheck` falso). Para `magic-items`, un estrato por
  `kind` y los contadores de `kind`, `reprintedIn` y huecos de efectos (con datos sintéticos).
  Para `spells`, un estrato por escuela, uno de conjuros solo `sorcerer`/`wizard` y los contadores
  por clave de nivel, escuela y `kind: "other"` (con datos sintéticos).
  Cubre: R53, R54, R55, R56, R57, R89, R90, R103.
- [x] **T0.14** Contrato para los lotes: documentar en `progress/impl_f3-srd-data_0.md` la
  plantilla de parser (`ParserInput` = HTML cacheado + URL; `ParserOutput` = entradas +
  `needsReview` + páginas excluidas) y cómo registrar semillas y secciones permitidas.

## Lote A: Clases, capacidades de clase y dominios

Dependen de T0. Escritura exclusiva ver `design.md` §11.

- [x] **TA.1** Fixtures HTML (`tests/fixtures/srd-html/classes/`): druida, pícaro (sin lanzamiento) y
  paladín (lanzamiento desde nivel 4) + una página con sección de otro libro. Schemas
  `class.ts`, `class-feature.ts`, `domain.ts` + tests. Cubre: R2, R10, R12, R13.
- [x] **TA.2** Parser de clases (tabla de 20 filas, "—" -> `null`, columna `special` ->
  nombres), lista permitida de secciones (excluye "Alternate Capstones", "Favored Class
  Options", "Archetypes"), y tests con las fixtures. Cubre: R10, R45, R46.
- [x] **TA.3** Parser de `class-features` (incl. opciones: talentos de pícaro, poderes de furia,
  misericordias, actuaciones, estilos de cazador, poderes de dominio) y resolución
  `special -> specialIds` con tabla de alias para nombres con paréntesis. Cubre: R13, R14.
- [x] **TA.4** Parser de `domains` (poderes + conjuros 1-9). Cubre: R23.
- [x] **TA.5** Reglas `integrity/class-tables.ts` (R11), `class-refs.ts` (R12 contra
  `class-golden.json`, `classSkills` -> `skills`, R14) y `domain-refs.ts` (R23) con tests de
  tablas/refs sintéticas rotas. Escribir `tests/data/fixtures/class-golden.json`
  (`design.md` §5). Cubre: R11, R12, R14, R23.
- [x] **TA.6** Ejecutar `data:import --category classes` (y class-features, domains) y
  `data:parse`; commitear `src/data/classes/**`, `class-features/**`, `domains.json`,
  `provenance/*`. Recuentos: 7 clases; revisar el informe de import (R46) y los `needsReview`.
  Cubre: R9, R26, R27.
- [x] **TA.7** Capa ES: `summaries/{classes,class-features,domains}/**` (solo desde el `textEn`
  de cada entrada, sin añadir reglas) y shards de glosario
  `glossary/{classes,class-features,domains}.es.json` (todo `draft`, `verified: false`).
  Cubre: R28, R29, R30, R31, R33.
- [x] **TA.8** `tests/data/classes.test.ts` (7 clases exactas, goldens, `null` vs `0`,
  `specialIds` resueltos) sobre los datos reales. Cubre: R9-R14.

## Lote B: Razas y habilidades

- [x] **TB.1** Fixtures, schemas `race.ts`, `skill.ts` y tests. Cubre: R2, R15, R16.
- [x] **TB.2** Parsers de razas (modificadores, humano/semielfo con elección, rasgos) y habilidades
  (Knowledge expandido a 10 ids; Craft/Perform/Profession únicos). Lista de secciones permitidas
  (excluye "Alternate Racial Traits", "Favored Class Options"). Cubre: R15, R16, R45.
- [x] **TB.3** Import + parse + commit de `races.json`, `skills.json`, `provenance`. Recuentos
  exactos: 7 razas, 35 habilidades. Cubre: R15, R16, R26.
- [x] **TB.4** Capa ES: resúmenes y glosario draft de razas y habilidades. Cubre: R28-R31, R33.
- [x] **TB.5** `tests/data/races.test.ts`, `tests/data/skills.test.ts` (ids exactos, golden Dwarf,
  Human, Stealth, Knowledge (arcana)). Cubre: R15, R16.

## Lote C: Dotes

- [x] **TC.1** Fixtures (Power Attack, Cleave, Great Cleave, una dote metamágica, una con
  prerrequisito de habilidad, una con `Source` múltiple), schema `feat.ts` + tests. Cubre: R2, R17.
- [x] **TC.2** Parser de dotes con estructuración de prerrequisitos
  (`abilities`, `bab`, `casterLevel`, `featIds`, `skills`, `other`) preservando siempre `raw`;
  descubrimiento desde el índice de dotes filtrado por CRB. Cubre: R17, R45, R46.
- [x] **TC.3** `integrity/feat-prereqs.ts` (R18, R19) con tests: referencia rota, ciclo, caso
  verde. Cubre: R18, R19.
- [x] **TC.4** Import + parse + commit de `feats/**`, `provenance/feats.json`; informe del número de
  dotes con `other` no vacío y de `needsReview`. Cubre: R17, R26, R27.
- [x] **TC.5** Capa ES: resúmenes `summaries/feats/<shard>.json` y glosario draft. Cubre: R28-R31, R33.
- [x] **TC.6** `tests/data/feats.test.ts` con los goldens de `design.md` §5 sobre datos reales.
  Cubre: R17-R19.

## Lote D: Conjuros (todo el capítulo 10) y listas

> Ampliado el 2026-10-16 (Q4 resuelta): `spells` contiene todos los conjuros del CRB. El Lote D
> es un grupo: **D0** (fundamentos, secuencial) -> **D1-D4** (4 agentes en paralelo, un rango
> alfabético de iniciales cada uno, ficheros disjuntos, `design.md` §11) -> **D5** (cierre).
> Cada agente escribe en `progress/impl_f3-srd-data_D<n>.md`. Cada lote Dn procesa su rango con
> `--category spells:<rango>` (T0.6) y NO toca ficheros de otro rango; el `expectedCount` de
> su rango sale del índice de la fuente y se congela en `provenance/spells/<rango>.json`.

### D0: fundamentos de conjuros (bloquea a D1-D4)

- [x] **TD.1** Fixtures (`tests/fixtures/srd-html/spells/`): *Cure Light Wounds*, *Burning Hands*,
  *Magic Missile* (solo `sor/wiz`), *Wish* (componente material con coste, nivel 9), un conjuro
  con foco y otro con foco divino, uno con varias etiquetas `Source`, una página de lista de
  clase, y un **índice** con conjuros CRB y de otro libro. Fixtures de la línea `Level` con
  clases de otros libros (`nonCrbClassIds`), abreviatura `sor/wiz` y un token desconocido.
  Schemas `spell.ts` (con `CRB_CLASS_IDS`, `SPELL_SCHOOLS`) y `spell-list.ts` + tests. Cerrar la
  lista `nonCrbClassIds` de `config/spell-class-ids.json` con lo observado en las fixtures y
  verificar si la línea `Level` incluye claves de dominio (anotar en
  `progress/impl_f3-srd-data_D0.md`; no inventarlas). Cubre: R2, R20, R21, R91, R101.
- [x] **TD.2** `src/data/spells/fields.ts` (`classifySpellFields(raw)` para `castingTime`,
  `range`, `targeting`, `duration`, `savingThrow`, `spellResistance`, `components`, con tabla de
  casos y `kind: "other"` como válvula) y `src/data/spells/query.ts` (`spellsForClass`), con sus
  tests. Cubre: R96, R100.
- [x] **TD.3** Parser de conjuros (`parsers/spells.ts`): campos de cabecera, uso de
  `classifySpellFields`, `shortDescriptionEn`, línea `Level` -> `levels` con el catálogo de
  `spell-class-ids.json` (expansión `sor/wiz`, descarte y recuento de clases de otro libro, fallo
  ante token desconocido, `needsReview` si `levels` queda vacío), lista permitida de secciones,
  descubrimiento desde el **índice completo** filtrado por CRB (no por listas de clase).
  `config/spell-batches.json` con los 4 rangos iniciales (`a-c`, `d-h`, `i-r`, `s-z`) reajustados
  con los recuentos del índice (descargado una vez con `data:import --category spells:index`) y
  `expectedCountByBatch` provisional; test de rangos contiguos, disjuntos y que cubren `a`-`z`.
  Cubre: R20, R45, R93, R94, R97, R99, R102.
- [x] **TD.4** `integrity/spell-lists.ts` real (R21, R22, R92 parte de catálogo, R95, R96) con
  datos sintéticos: id inexistente, inconsistencia en ambos sentidos, clase sin lista
  (`sorcerer`) aceptada, clave `alchemist` rechazada, campo estructurado alterado, caso verde.
  La comprobación de claves de dominio contra `domains` queda para TZ.1. Cubre: R21, R22, R92,
  R95, R96.
- [x] **TD.5** Goldens: `tests/data/fixtures/spell-golden.json` (`design.md` §5) y
  `tests/data/spells/` con el helper de comparación que usarán D1-D5; documentar en
  `progress/impl_f3-srd-data_D0.md` el contrato de lote (qué ficheros posee cada rango, cómo se
  nombra el shard y cómo se ejecuta `data:import/parse --category spells:<rango>`). Cubre: R20,
  R99.

### D1-D4: un lote por rango alfabético (en paralelo, tras D0)

Cada lote Dn con su `<rango>` ejecuta las mismas cuatro tareas sobre SUS iniciales; el reparto
inicial es D1 `a-c`, D2 `d-h`, D3 `i-r`, D4 `s-z`.

- [ ] **TDn.1** Import + parse de su rango (`spells:<rango>`), commit de
  `src/data/spells/<iniciales>.json`, `provenance/spells/<rango>.json` y, si hace falta,
  `overrides/spells/<rango>.json`. Congelar `expectedCountByBatch[<rango>]`. Revisar el informe
  de import: páginas de otro libro (R46), clases descartadas (R97), `levels` vacíos (R102),
  campos `kind: "other"` (R96), `needsReview`. Cubre: R20, R26, R27, R45, R46, R93, R94, R97,
  R99, R102.
- [ ] **TDn.2** `tests/data/spells/<rango>.test.ts` sobre los datos reales de su rango: recuento
  igual al congelado, claves de `levels` dentro de `CRB_CLASS_IDS` (o dominio), niveles 0-9, R96
  sobre cada entrada, goldens cuyas iniciales caigan en su rango. Cubre: R20, R26, R91, R96,
  R101.
- [ ] **TDn.3** Capa ES de su rango: `summaries/spells/<iniciales>.json` (solo desde el `textEn`
  de cada conjuro, sin añadir reglas; R30 filtra cifras) y
  `glossary/spells/<iniciales>.es.json` (todo `draft`, `verified: false`). Cubre: R28-R31, R33.
- [ ] **TDn.4** Anotar en `progress/impl_f3-srd-data_D<n>.md` los recuentos, discrepancias con los
  goldens (sin cambiarlos) y las preguntas abiertas que afecten al rango. Cubre: R26.

> Estado por lote (las cuatro tareas son plantilla compartida; cada Dn anota aquí el suyo):
> - [x] D1 (`a-d`): TD1.1, TD1.2, TD1.3, TD1.4 hechas (`progress/impl_f3-srd-data_D1.md`).
> - [x] D2 (`e-k`): TD2.1, TD2.2, TD2.3, TD2.4 hechas (`progress/impl_f3-srd-data_D2.md`).
> - [x] D3 (`l-r`): TD3.1, TD3.2, TD3.3, TD3.4 hechas (`progress/impl_f3-srd-data_D3.md`).
> - [x] D4 (`s-z`): TD4.1, TD4.2, TD4.3, TD4.4 hechas (`progress/impl_f3-srd-data_D4.md`).

### D5: cierre del Lote D (tras D1-D4)

- [x] **TD.6** Import + parse de `spell-lists` de las 5 clases con lista (`spells/lists.json`,
  `provenance/spell-lists.json`) y generación de `spells/index.ts` (lista estática de shards
  para la carga perezosa). Ejecutar R22 sobre los datos reales de todos los rangos y reportar
  las inconsistencias reales (override documentado o bug de parser, no se silencian). Consolidar
  `provenance/spells/` (suma de `expectedCountByBatch` = `expectedCount` total, R99). Cubre:
  R21, R22, R26, R99, R98.
- [x] **TD.7** `tests/data/spells.test.ts` sobre datos reales: goldens de §5 (incluidos los de
  solo `sorcerer`/`wizard`), cada clase con lista tiene niveles 0-9 donde proceda, `spellsForClass`
  coincide con `spell-lists` para las 5 clases y devuelve resultados para `sorcerer` y `wizard`.
  Cubre: R20-R22, R95, R100.

## Lote E: Equipo

- [x] **TE.1** Fixtures (Longsword, Dagger, Full plate, Heavy steel shield, un objeto de aventurero,
  una montura), schema `equipment.ts` (unión por `kind`) + tests, conversión de monedas a `costCp`.
  Cubre: R2, R24, R25.
- [x] **TE.2** Parsers de tablas de armas, armaduras, escudos y bienes (celdas "—", pesos
  fraccionarios, daño pequeño/mediano, crítico `19-20/x2`, rango) y descripciones; lista permitida
  de secciones (excluye objetos mágicos: van al Lote M). Cubre: R24, R25, R45.
- [x] **TE.3** Import + parse + commit de `equipment/*.json` y `provenance`. Cubre: R24-R27.
- [x] **TE.4** Capa ES: resúmenes y glosario draft de equipo. Cubre: R28-R31, R33.
- [x] **TE.5** `tests/data/equipment.test.ts` con los goldens. Cubre: R24, R25.

## Lote M: Objetos mágicos (capítulo 15)

Dependen de T0. Escritura exclusiva ver `design.md` §11 y §14. Se ejecutan en este orden, que
prioriza lo útil a nivel 5-6 (`design.md` §14.7) sin recortar el alcance del capítulo. Cada paso
de importación (TM.3 a TM.6) deja sus `kind` en `src/data/magic-items/`, con su resumen ES y una
muestra (`data:sample`) para el humano. Durante el lote el único fallo aceptable de
`data:validate` sobre `magic-items` es `magic.sections-complete` (R66). Las referencias a datos
reales de `weapons`, `armor`, `shields`, `skills` y `spells` se verifican en TZ.1 (esos lotes
corren en paralelo); aquí se prueban con datos sintéticos.

- [x] **TM.0** Sondeo de fuente, sin código de producción: para cada sección del capítulo 15
  (`design.md` §14.1) anotar en `progress/impl_f3-srd-data_M.md` qué páginas e índices de qué
  host la cubren, cuántas entradas CRB hay (recuentos del índice filtrado, no de memoria), si
  las filas genéricas de pociones, aceites, varitas y pergaminos existen como páginas (Q11), los
  casos de `Source` múltiple (Q13) y el texto literal de la sección sobre topes de mejora y de
  bonificador efectivo (R83). Rellenar `scripts/srd/config/magic-sections.json` (una entrada por
  `kind`, con `expectedCount: 0` + `reason` donde la fuente no tenga entradas CRB). Si Q11 queda
  sin resolver, los `kind` afectados se marcan pendientes y el lote continúa con el resto.
  Cubre: R66, R83.
- [x] **TM.1** Fixtures HTML (`tests/fixtures/srd-html/magic-items/`): *Keen* (`Source`
  múltiple), *Seeking*, *Flaming*, *Flame Tongue*, *Ring of Protection*, *Cloak of Resistance*
  (tabla de variantes), *Belt of Giant Strength*, *Amulet of Natural Armor*, *Bracers of Armor*,
  una página sin etiqueta `PRPG Core Rulebook`, y una poción o varita si Q11 lo permite.
  Schema `schema/magic-item.ts` (`design.md` §14.3; sustituye el stub de T0.1) y
  `tests/data/fixtures/bonus-types.json` (copia de f2 `design.md` §3). Tests de schema: un caso
  válido por `kind` y un rechazo por regla. Cubre: R2, R63, R64, R68, R69, R70, R71, R72, R73,
  R74, R76, R77, R81.
- [x] **TM.2** `src/data/magic-items/effects.ts` (`getItemEffects`, `getEnhancementEffects`) y
  `tests/data/magic-effects.test.ts`: forma `Modifier`, ids únicos, expansión de `save.all`,
  variante inexistente -> `undefined`, mejora de arma/armadura/escudo. Si `src/rules/types.ts`
  existe, comprobar además que `BONUS_TYPES` es idéntico y que los resultados son asignables a
  `Modifier`. Cubre: R73, R79, R80.
- [x] **TM.3** Parser base `scripts/srd/parsers/magic-items/` (`header`: Source, Aura, CL, Slot,
  Price, Weight, Description, Construction; `variants`: tablas de precio por fila;
  `effects`: patrón determinista con `evidence`; `legal-for`: restricción de uso;
  `index`: descubrimiento por índice filtrado por la etiqueta CRB). Lista permitida de
  secciones, `Source` múltiple (R86), exclusión sin etiqueta CRB (R87) e informe de huecos de
  efectos (R88). Tests con las fixtures de TM.1. Cubre: R45, R65, R75, R78, R81, R86, R87, R88.
- [x] **TM.4** `integrity/magic-refs.ts` real (R75 evidencias, R82 legalidad contra el arma o
  armadura base, R83 topes, R84 referencias, R85 conjuros) y, en el mismo fichero, R66 y R67
  (con `expectedCountByKind` e `importedKinds`; `counts.ts` es del Lote Z), todo con datasets
  sintéticos rotos y caso verde; *Keen* sobre arco/maza y espada, *Seeking* sobre arma cuerpo a cuerpo. Cubre: R66,
  R67, R75, R82, R83, R84, R85.
- [x] **TM.5 (prioridad 1) Armas, armaduras y escudos mágicos.** Import + parse + commit de las
  entradas `general` de mejora (con `enhancementPrices`), `weapon-ability`, `armor-ability`,
  `shield-ability`, `specific-weapon`, `specific-armor` y `specific-shield`. Revisar el informe
  (R87, R88) y los `needsReview` de `legalFor`. Capa ES de estos `kind`
  (`summaries/magic-items/<kind>.json`, solo desde el `textEn`) y glosario draft. Cubre: R63-R65,
  R67-R72, R78, R81, R86.
- [x] **TM.6 (prioridad 2) Defensa y características.** Import + parse + commit de `ring`
  (empezando por *Ring of Protection*) y de `wondrous` de las ranuras Shoulders (capas de
  resistencia), Belts, Headband (diademas), Neck (amuleto de armadura natural) y Wrist (brazales
  de armadura). Capa ES y glosario draft. Cubre: R63-R65, R67, R68, R72-R77, R86.
- [x] **TM.7 (prioridad 3) Consumibles y cargas comunes.** [HECHO salvo `potion`/`oil`/`wand`: PENDIENTES de Q11 (no hay páginas CRB en la fuente); `staff` hecho con `spellRefs`] Import + parse + commit de `potion`,
  `oil` y `wand` (y los `staff` de conjuro cuando proceda), con `spellRefs` (R85; `spellId` enlaza
  todo conjuro del CRB, también los de mago/hechicero). Depende de la
  decisión sobre Q11 para las filas genéricas; las de nombre propio no esperan. Capa ES y
  glosario draft. Cubre: R63-R65, R67, R68, R85, R86.
- [x] **TM.8 (prioridad 4) Resto del capítulo 15.** [HECHO; `magic.sections-complete` solo falla por `potion`/`oil`/`wand` (Q11)] Import + parse + commit de los `wondrous` de
  las demás ranuras (Body, Chest, Eyes, Feet, Hands, Head, None/Other), `rod`, `staff`, `cursed`,
  `intelligent`, `artifact` (si la fuente tiene alguno CRB) y las entradas `general` restantes
  (pergaminos, creación de objetos). Capa ES y glosario draft; con `importedKinds` completo,
  `magic.sections-complete` pasa a cero. Cubre: R63-R68, R72-R77, R86.
- [x] **TM.9** Capa ES en paralelo para los `kind` voluminosos (hasta 2 agentes por rangos de
  shard, como TD.6): `summaries/magic-items/<kind>.json` y
  `glossary/magic-items/<kind>.es.json`. Cubre: R28-R31, R33.
- [x] **TM.10** `tests/data/magic-items.test.ts` sobre los datos reales con los goldens de
  `design.md` §14.8 (`tests/data/fixtures/magic-golden.json`) y recuento por `kind`. Anotar
  cualquier discrepancia con la fuente en `progress/impl_f3-srd-data_M.md` sin cambiar golden
  ni dato. Cubre: R65, R67, R69, R70, R71, R72, R78.

## Lote Z: Integración (después de A-E y M)

- [x] **TZ.1** `integrity/counts.ts` real (R26) y regla cruzada final (todas las categorías
  presentes en `provenance`; `magic-items` se delega en R66/R67 de `magic-refs`), `integrity/class-refs` contra `skills`, `domain-refs` contra
  `spells`, y `magic-refs` contra los datos reales de `weapons`, `armor`, `shields`, `skills` y
  `spells` (R82, R84, R85, legalidad de cada habilidad en cada objeto específico; R85 ahora
  también falla si un `spellRefs[].spellId` es `null` y el nombre es de un conjuro del CRB),
  claves de `spells[].levels` contra `CRB_CLASS_IDS` y `domains` (R92) y recuento de `spells` por
  lote contra `expectedCountByBatch` (R99, incluida la unión de `provenance/spells/*`, R98).
  `tests/data/integrity/*.test.ts`. Cubre: R26, R14, R23, R82, R84, R85, R92, R98, R99.
- [x] **TZ.2** `npm run data:glossary` -> commitear `glossary.es.json`; `data:validate` en verde
  sobre los datos reales (corrección de cualquier hallazgo en el lote dueño, no aquí).
  Cubre: R33, R36, R51.
- [x] **TZ.3** Añadir `data:validate` a `init.sh` y a la suite (`tests/data/validate.test.ts` como
  test normal, no de integración, pues es offline; no se llama `*.int.test.ts` porque esa
  convención lo excluiría de `npm test` y de `init.sh`). Cubre: R51.
- [x] **TZ.4** Generar el informe de muestreo con `--seed 42 --per-category 8` y entregarlo al
  humano junto con la lista de preguntas abiertas pendientes (Q1-Q15; Q4 y Q12 ya resueltas el
  2026-10-16) en `progress/impl_f3-srd-data_Z.md`. NO marcar `humanReviewed`. Cubre: R53-R57,
  R89, R90, R103.
- [x] **TZ.5** Verificar la trazabilidad completa R1-R103 ↔ tests (tabla de `requirements.md`) y
  anotar en `progress/impl_f3-srd-data_Z.md` el estado (qué R queda esperando decisión humana:
  R40 por Q6; los `kind` de `magic-items` pendientes de Q11, si los hay). Cubre: todos.

## Resumen de paralelismo

```
Lote 0 ──► ┬─ Lote A (clases)
           ├─ Lote B (razas, habilidades)
           ├─ Lote C (dotes)
           ├─ Lote D0 (conjuros: fundamentos) ──► ┬─ D1 (a-c) ─┐
           │                                      ├─ D2 (d-h) ─┤
           │                                      ├─ D3 (i-r) ─┼─► D5 (cierre) ─┐
           │                                      └─ D4 (s-z) ─┘                 │
           ├─ Lote E (equipo)                                                    ├──► Lote Z
           └─ Lote M (objetos mágicos) [TM.9: hasta 2 agentes] ───────────────────┘
```
Conflictos evitados por: ficheros disjuntos por lote (el Lote M no toca ficheros de A-E ni
`counts.ts`; D1-D4 escriben cada uno solo en los ficheros de sus iniciales y en su
`provenance/spells/<rango>.json`), stubs de `integrity/*` creados en T0.4, shards de glosario por
categoría (y por inicial en conjuros) y `glossary.es.json` generado solo en TZ.2.
