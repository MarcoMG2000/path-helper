# Implementación - f3-srd-data, Lote D1 (conjuros a-d)

Estado: **implementado** (TD1.1..TD1.4 hechas; anotadas en `specs/f3-srd-data/tasks.md` como línea de estado de D1 bajo la plantilla compartida TDn, sin tocar los `[ ]` de la plantilla porque sirve a D1-D4). Pendiente de reviewer.
No se tocó `feature-list.json`, `package.json`, configs, `scripts/**` ni ficheros de otros lotes. No se ejecutó `npm ci/install`, `./init.sh` ni `data:glossary`. No se editó `spell-class-ids.json`. `prettier --write` sobre los directorios compartidos de resúmenes/glosario de conjuros dejó los ficheros de D2 "unchanged".

## Recuentos

| Dato | Valor |
|---|---|
| Esperado (`expectedCountByBatch["a-d"]`, congelado en `provenance/spells/a-d.json`) | **172** |
| Páginas importadas (semillas) | 172 (155 descargadas, 17 de caché) |
| Entradas escritas | 172 = 30 (a) + 28 (b) + 59 (c) + 55 (d) |
| Discrepancia con el esperado | **ninguna** |
| Páginas de otro libro excluidas (R46) | 0 |
| `needsReview` | 0 |
| `levels` vacíos (R102) | 0 |
| Conjuros con varias etiquetas `Source` | 0 |
| Overrides necesarios | 0 (no hay `overrides/spells/a-d.json`) |
| Secciones de otro libro excluidas (`Mythic ...`) | 53 |
| Campo ausente `savingThrow` / `spellResistance` | 18 / 18 (mismos 18 conjuros, personales: alter-self, arcane-sight, arcane-sight-greater, augury, beast-shape-i..iv, blink, commune, commune-with-nature, comprehend-languages, contact-other-plane, contingency, disguise-self, divination, divine-favor, divine-power) |
| Niveles presentes | 0-9; claves de `levels` solo CRB: sorcerer, wizard, cleric, druid, bard, ranger, paladin (sin barbarian/fighter/monk/rogue en el rango) |

Comandos usados (siempre con subconjunto): `npm run data:import -- --category spells:a-d` y `npm run data:parse -- --category spells:a-d` (este segundo, dos veces; idempotente, para refrescar `spells/index.ts`).

## Clases descartadas (R97)

1.094 apariciones de clases de otro libro descartadas, todas dentro del catálogo `nonCrbClassIds` ya cerrado en D0 (ningún token desconocido; no hizo falta tocar `spell-class-ids.json`):
adept 31, alchemist 31, antipaladin 20, arcanist 95, bloodrager 17, hunter 46, inquisitor 66, investigator 31, magus 37, medium 35, mesmerist 45, occultist 69, oracle 84, psychic 82, redmantisassassin 14, sahirafiyun 6, shaman 87, skald 47, spiritualist 51, summoner 34, summoner (unchained) 30, warpriest 72, witch 64.

## kind: "other" (R96) - 60 notas, 0 fallos

Contadores: castingTime 2, duration 18, range 6, savingThrow 15, spellResistance 11, targeting 8 (detalle con `raw` en `reports/import-2026-10-16.md`, sección `## parse: spells:a-d`). Cuatro patrones, todos "válvula" prevista y no errores de datos:

- Duraciones/salvaciones compuestas o con "see text": p. ej. `acid-arrow` duration «1 round + 1 round per three levels», `analyze-dweomer` «none or Will negates; see text», `cure-*-wounds-mass` «Will half (harmless) or Will half; see text» (ya decidido en D0).
- Etiquetas de objetivo largas: `dispel-chaos|evil|good|law` targeting «you and a touched evil creature from another plane, or you and an enchantment or evil spell...» (idéntico en los cuatro; así viene en la fuente, también para chaos/good/law), `dispel-magic`, `dispel-magic-greater`, `detect-poison`.
- Posibles **mejoras del clasificador de rangos** (valores simples hoy en `other`): `clone` range «0 ft.», `control-weather` range «2 miles», `control-winds` range «40 ft./level», `creeping-doom` range «close (25 ft. + 5 ft./2 levels)/100 ft.; see text». No se tocó `fields.ts` (es de D0). Pregunta para el leader/Z (abajo).
- `castingTime` other: `contingency` «at least 10 minutes; see text», `control-weather` «10 minutes; see text».

## Goldens (design.md §5) en el rango

`burning-hands` y `cure-light-wounds` se comparan con `compareSpellToGolden` sobre los datos reales: **sin diferencias**. Sobre Burning Hands: la pertenencia al dominio de Fuego no se puede comprobar aquí (D0: la línea `Level` no trae dominios; la comprueba Z). Cure Light Wounds: SR real `yes (harmless); see text` -> `yes` + `harmless` (decisión 2 de D0).

## Capa ES (TD1.3)

- `src/data/summaries/spells/{a,b,c,d}.json`: 172 resúmenes, todos `status: draft`, redactados solo desde el `textEn` de cada conjuro (sin cifras ni reglas añadidas; las cifras del resumen se verificaron con `checkNumericFidelity` fuera del repo antes de escribir y las comprueba la regla `summaries.numeric` del test). Todos ≤ 300 caracteres. Nombres de conjuros y términos de juego sin traducir oficial se dejan en inglés (las salvaciones se escriben Voluntad/Reflejos/Fortaleza; también puntos de golpe, asalto, pies; criterio mío, a revisar con el glosario de términos).
- Algunos conjuros muy largos o con tablas (binding, contact-other-plane, create-undead, detect-evil...) están resumidos de forma parcial por el tope de 300 caracteres; el resumen no sustituye al `textEn`.
- `src/data/glossary/spells/{a,b,c,d}.es.json`: 172 claves `spells:<id>`, `es` = nombre inglés como marcador, `verified:false`, `origin:draft`, `kind:entry`, con la misma nota que usa `glossary/feats.es.json` (nombre del manual de Devir pendiente, Q2).

## Verificación

| Comando | Resultado |
|---|---|
| `npx vitest run tests/data/spells/a-d.test.ts` | 8 tests en verde |
| `npx vitest run tests/data tests/scripts` (estado del repo en ese momento, con lotes en paralelo) | 48 ficheros / 592 tests en verde |
| `node node_modules/typescript/bin/tsc --noEmit` | sin errores |
| `eslint tests/data/spells/a-d.test.ts`; `prettier --check` sobre mis ficheros | limpio |
| `runIntegrity(..., { categories: ["spells"] })` filtrado a ids a-d | 0 hallazgos (datos, `summaries.*`, `glossary.*`) |

## Trazabilidad R -> test (`tests/data/spells/a-d.test.ts`)

| R | Test |
|---|---|
| R20, R101 | "cada conjuro supera SpellSchema, es del CRB y tiene escuela del catálogo" |
| R20 (goldens) | "los goldens de design.md §5 cuya inicial cae en a-d coinciden" |
| R26, R99 | "el recuento es el congelado en la procedencia del lote" (172, ids únicos) |
| R91 | "las claves de levels son clases del CRB y los niveles van de 0 a 9" |
| R96 | "los campos estructurados coinciden con classifySpellFields(raw)" y la regla de integridad completa |
| R92 | misma regla de integridad (`spells.level-key`) |
| R28, R29, R30, R31, R33 | "la integridad (datos y capa ES) no halla problemas en el rango" + "cada conjuro tiene resumen y glosario en borrador, sin verificar" |
| R27, R45, R46, R93, R94, R97, R102 | cubiertos por el parser (D0: `tests/scripts/srd/parse-spells.test.ts`, `spell-batches.test.ts`) y por el import/parse real de este lote (0 páginas excluidas, 0 `needsReview`, ningún token desconocido; el parse falla cerrado ante cualquiera de ellos) |

## Ficheros del lote

`src/data/spells/{a,b,c,d}.json`, `src/data/provenance/spells/a-d.json`, `src/data/summaries/spells/{a,b,c,d}.json`, `src/data/glossary/spells/{a,b,c,d}.es.json`, `tests/data/spells/a-d.test.ts`, esta nota y la línea de estado en `specs/f3-srd-data/tasks.md`. `src/data/spells/index.ts` lo regenera `data:parse` (compartido; refleja los shards presentes en disco, incluidos los de D2).

## Preguntas abiertas / para el leader o Z

1. ¿Ampliar `classifyRange` (D0, `fields.ts`) para `0 ft.`, `N miles` y `N ft./level` (hoy `kind: other`)? Impacto bajo; sin cambio el dato sigue siendo fiel (`raw` intacto).
2. 18 conjuros del rango tienen `savingThrow`/`spellResistance` ausentes en la fuente (`raw: ""`, `kind/applies: other`, decisión 1 de D0); sigue pendiente la decisión humana (`none`/`no` o campo opcional).
3. Pertenencia a dominios (p. ej. Burning Hands -> Fuego): no sale de la línea `Level`; queda para Z/A (`domains`).
4. Nombres en español de conjuros (glosario): todo marcador en inglés, pendiente de Q2.
5. `reports/import-2026-10-16.md` es compartido por todos los lotes (append); la sección de D1 es `## parse: spells:a-d`.
