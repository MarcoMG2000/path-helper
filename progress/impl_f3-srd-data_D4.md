# Implementación - f3-srd-data, Lote D4 (conjuros s-z)

Estado: **implementado** (TD4.1..TD4.4 hechas; anotadas como línea de estado de D4 bajo la plantilla compartida TDn de `specs/f3-srd-data/tasks.md`, sin tocar los `[ ]` de la plantilla). Pendiente de reviewer.
No se tocó `feature-list.json`, `package.json`, configs, `scripts/**`, `spell-class-ids.json` ni ficheros de otros lotes. No se ejecutó `npm ci/install`, `./init.sh` ni `data:glossary`. No hizo falta el patch pendiente de `scripts/srd/parsers/spells.ts` (D0): el import y el parse de `s-z` funcionaron sin errores sobre el parser vigente.

## Recuentos

| Dato | Valor |
|---|---|
| Esperado (`expectedCountByBatch["s-z"]`, congelado en `provenance/spells/s-z.json`) | **163** |
| Páginas importadas (semillas) | 163 (todas ya en caché al reintentar tras el corte; sin descargas repetidas) |
| Entradas escritas | 163 = 104 (s) + 24 (t) + 6 (u) + 5 (v) + 22 (w) + 2 (z) |
| Discrepancia con el esperado | **ninguna** |
| Páginas de otro libro excluidas (R46) | 0 |
| `needsReview` | 0 |
| `levels` vacíos (R102) | 0 |
| Conjuros con varias etiquetas `Source` | 0 |
| Overrides necesarios | 0 (no hay `overrides/spells/s-z.json`) |
| Secciones de otro libro excluidas (`Mythic ...`) | 40 |
| Campo ausente `savingThrow` / `spellResistance` | 14 / 14 (conjuros personales; `raw: ""`, `kind/applies: other`, decisión 1 de D0) |
| Claves de `levels` | solo CRB: cleric, bard, sorcerer, wizard, druid, paladin, ranger; niveles 0-9 |
| Escuelas | conjuration 43, transmutation 30, evocation 22, illusion 16, necromancy 15, abjuration 13, divination 12, enchantment 11, universal 1 (=163) |

Comandos (siempre con subconjunto; `node_modules/.bin` no existe, se usó `node node_modules/tsx/dist/cli.mjs scripts/srd/cli.ts ...`): `import --category spells:s-z` y `parse --category spells:s-z` (este segundo dos veces; idempotente, la segunda para refrescar `spells/index.ts`; por eso `reports/import-2026-10-16.md` tiene dos secciones `## parse: spells:s-z` idénticas).

Incidencia de entorno: la primera ejecución del import se cortó por límite de uso de la API antes de escribir `provenance/spells/s-z.json`; al reintentar, las 163 páginas salieron de la caché (0 descargadas). Durante la sesión `node_modules` fue reinstalado por otro agente (tsx desapareció un rato); no lo toqué.

## Clases descartadas (R97)

823 apariciones de clases de otro libro, todas dentro del catálogo `nonCrbClassIds` ya cerrado en D0 (ningún token desconocido; `spell-class-ids.json` intacto): adept 11, alchemist 16, antipaladin 9, arcanist 103, bloodrager 18, hunter 37, inquisitor 25, investigator 16, magus 28, medium 30, mesmerist 34, occultist 55, oracle 56, psychic 80, redmantisassassin 10, sahirafiyun 2, shaman 51, skald 42, spiritualist 40, summoner 30, summoner (unchained) 29, warpriest 41, witch 60. (Sin barbarian/fighter/monk/rogue en el rango, como esperable.)

## kind: "other" (R96) - 110 notas, 0 fallos

Contadores: castingTime 1, duration 45, range 24, savingThrow 28, spellResistance 9, targeting 3 (detalle con `raw` en `reports/import-2026-10-16.md`, sección `## parse: spells:s-z`). Todo es "válvula" prevista (el `raw` se conserva intacto; los campos coinciden con `classifySpellFields(raw)`). Casos **simples mal clasificados** que el leader podría decidir cubrir ampliando `fields.ts` (no lo ampliado yo):

- **range**: `0 ft.` (simulacrum, summon-instrument, teleportation-circle); `0 ft.; see text` (los 8 `symbol-of-*`: death, fear, insanity, pain, persuasion, sleep, stunning, weakness); `1 mile/level` (whispering-wind); `personal and touch` (teleport, teleport-greater); `see text` (scrying, scrying-greater, secret-chest, sending, shades, shadow-conjuration(+greater), shadow-evocation(+greater), wish).
- **duration**: `up to 1 round/level` (sympathetic-vibration); `concentration + 2 rounds` (scintillating-pattern, summon-swarm), `concentration + 1 round/level` (wall-of-fire) y `concentration + 1 hour/level (D)` (veil) (decisión 7 de D0); `permanent until discharged (D)` (spellstaff); `permanent; see text` (transmute-rock-to-mud, trap-the-soul); `1 day/level; see text` (shrink-item); `2 hours/level; see text` (water-breathing); `1 hour/level (D); see text` (wind-walk); `see text` (shades, shadow-*, symbol-of-* x8, true-strike, vision, shadow-evocation...); `1 round/level or 1 round; see text...` (scare); `1 hour/level or until completed` (suggestion, suggestion-mass); `until expended or 10 min./level` (spell-turning); `10 min./level or until discharged` (stoneskin).
- **savingThrow**: `no` (touch-of-idiocy, waves-of-exhaustion, waves-of-fatigue; hoy `other`, deberían ser `none`/equivalente), `see text` (shield-of-law, storm-of-vengeance, transmute-mud-to-rock, transmute-rock-to-mud, trap-the-soul, unhallow, unholy-aura, wall-of-iron, wall-of-stone), compuestos «X and/or Y»  (teleport, wind-walk, sequester, silence, word-of-recall...).
- **spellResistance**: `see text` (unhallow); `yes (object; see text)` (transmute-metal-to-wood); compuestos `no and yes (object)` etc.
- **targeting** other (3): shatter «5-ft.-radius spread; or one solid object or one crystaline creature» (la fuente escribe «crystaline»), telekinesis y wish «see text».
- **castingTime** other (1): trap-the-soul «1 standard action or see text».

## Goldens (design.md §5) en el rango

`wish` se compara con `compareSpellToGolden` sobre los datos reales: **sin diferencias** (test "los goldens de design.md §5 cuya inicial cae en s-z coinciden").

## Capa ES (TD4.3)

- `src/data/summaries/spells/{s,t,u,v,w,z}.json`: 163 resúmenes `status: draft`, redactados solo desde el `textEn` (sin reglas ni cifras añadidas; todos ≤ 300 caracteres; la regla `summaries.numeric` pasa). Nombres de conjuros y términos sin traducción oficial se dejan en inglés (mismo criterio que D1: salvaciones Voluntad/Reflejos/Fortaleza, puntos de golpe, asalto, pies).
- Resúmenes parciales por el tope de 300 caracteres: scrying, shadow-conjuration, teleport, tree-stride, wall-of-*, symbol-of-death, telekinesis, wish, word-of-chaos... Las tablas de invocación (summon-monster-N, summon-nature's-ally-N) no se resumen (se remite a la tabla). El resumen no sustituye al `textEn`.
- `src/data/glossary/spells/{s,t,u,v,w,z}.es.json`: 163 claves `spells:<id>`, `es` = nombre inglés como marcador, `verified:false`, `origin:draft`, `kind:entry`, misma nota que D1 (nombre del manual de Devir pendiente, Q2).

## Observaciones sobre la fuente

- `summon-monster-1` trae en su `textEn` una «Nethys Note» (comentario de AoN sobre el *Monster Summoner's Handbook*, otro libro) y las tablas de criaturas 1-9 de la Tabla 10-1; igual `summon-natures-ally-1` (Tabla 10-2). Es contenido de la página del CRB tal cual; el leader/humano puede querer recortar la «Nethys Note» (es una nota editorial de AoN, no del CRB) como override o regla del parser. No lo toqué.
- Errata de la fuente conservada: «crystaline» en shatter.
- Textos con tablas/listas Markdown (scrying, spell-turning, teleport, tree-stride, word-of-chaos, wish...) se importaron a `textEn` sin HTML.

## Verificación

| Comando | Resultado |
|---|---|
| `vitest run tests/data/spells/s-z.test.ts` | 8 tests en verde |
| `tsc --noEmit` (`node node_modules/typescript/bin/tsc`) | sin errores |
| `eslint tests/data/spells/s-z.test.ts` | limpio |
| `prettier --check` sobre mis ficheros (test, shards `src/data/spells/*.json`, provenance, summaries, glossary) | limpio |
| `runIntegrity(..., { categories: ["spells"] })` filtrado a ids s-z (dentro del test) | 0 hallazgos (datos, `summaries.*`, `glossary.*`) |

## Trazabilidad R -> test (`tests/data/spells/s-z.test.ts`)

| R | Test |
|---|---|
| R20, R101 | "cada conjuro supera SpellSchema, es del CRB y tiene escuela del catálogo" |
| R20 (goldens) | "los goldens de design.md §5 cuya inicial cae en s-z coinciden" (wish) |
| R26, R99 | "el recuento es el congelado en la procedencia del lote" (163, ids únicos) |
| R91 | "las claves de levels son clases del CRB y los niveles van de 0 a 9" |
| R96 | "los campos estructurados coinciden con classifySpellFields(raw)" y la regla de integridad completa |
| R92 | misma regla de integridad (`spells.level-key`) |
| R28, R29, R30, R31, R33 | "la integridad (datos y capa ES) no halla problemas en el rango" + "cada conjuro tiene resumen y glosario en borrador, sin verificar" |
| R27, R45, R46, R93, R94, R97, R102 | cubiertos por el parser (D0: `tests/scripts/srd/parse-spells.test.ts`, `spell-batches.test.ts`) y por el import/parse real de este lote (0 páginas excluidas, 0 `needsReview`, ningún token desconocido; el parse falla cerrado ante cualquiera de ellos) |

## Ficheros del lote

`src/data/spells/{s,t,u,v,w,z}.json`, `src/data/provenance/spells/s-z.json`, `src/data/summaries/spells/{s,t,u,v,w,z}.json`, `src/data/glossary/spells/{s,t,u,v,w,z}.es.json`, `tests/data/spells/s-z.test.ts`, esta nota y la línea de estado en `specs/f3-srd-data/tasks.md`. `src/data/spells/index.ts` lo regenera `data:parse` (compartido; refleja los shards presentes en disco).

## Preguntas abiertas / para el leader o Z

1. ¿Ampliar `classifyRange`/`classifyDuration`/`classifySavingThrow` (D0, `fields.ts`) para los casos simples listados arriba (`0 ft.`, `1 mile/level`, `no`, `up to N round/level`, `concentration + ...`)? Impacto bajo; el dato sigue fiel (`raw` intacto).
2. 14 conjuros del rango tienen `savingThrow`/`spellResistance` ausentes en la fuente (`raw: ""`, `kind/applies: other`); sigue pendiente la decisión humana de D0 (`none`/`no` o campo opcional).
3. «Nethys Note» dentro del `textEn` de `summon-monster-1`: ¿se recorta (override/regla de parser) o se deja?
4. Pertenencia a dominios: no sale de la línea `Level`; queda para Z/A (`domains`).
5. Nombres en español de conjuros (glosario): todo marcador en inglés, pendiente de Q2.
6. `reports/import-2026-10-16.md` es compartido (append); la sección de D4 es `## parse: spells:s-z` (duplicada por el segundo parse idempotente).
