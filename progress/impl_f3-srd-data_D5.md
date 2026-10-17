# Implementación - f3-srd-data, Lote D5 (cierre del Lote D)

Estado: **implementado** (TD.6 y TD.7 marcadas `[x]` en `specs/f3-srd-data/tasks.md`). Pendiente de reviewer. No se tocó `feature-list.json`, `package.json`, configs de tsc/vitest, ni los shards `src/data/spells/*.json` ni el parser `parsers/spells.ts`; no se ejecutó `npm ci/install`, `./init.sh` ni `data:glossary`.

(Una primera sesión quedó bloqueada por un `node_modules` a medias; el leader lo reinstaló y esta sesión lo completó.)

## Resultado principal: R22 limpio sobre los datos reales

`runIntegrity` sobre `spells` + `spell-lists` (623 conjuros, 5 listas) devuelve **0 hallazgos** (ni `spell-lists.unknown-spell`, `level-mismatch`, `missing-from-list`, ni `spells.level-key`, `spells.structured-field`). Comprobación independiente (script puntual): para cada clase, el conjunto de pares (conjuro, nivel) de la lista y el derivado de `spells[].levels` coinciden exactamente (0 de más, 0 de menos):

| Clase | pares en lista | pares en `levels` | solo en lista | solo en `levels` |
|---|---|---|---|---|
| bard | 164 | 164 | 0 | 0 |
| cleric | 236 | 236 | 0 | 0 |
| druid | 169 | 169 | 0 | 0 |
| paladin | 45 | 45 | 0 | 0 |
| ranger | 51 | 51 | 0 | 0 |

**No hay inconsistencias reales que reportar**: no hace falta ningún override ni se detectó bug de parser. Las dos lecturas son independientes (la línea `Level` de cada página de conjuro frente a las páginas de lista de clase de AoN), así que el acuerdo es una verificación fuerte de la lectura de `levels` para estas 5 clases. Los conjuros solo de `sorcerer`/`wizard` y los de dominio NO tienen segunda lectura (como prevé el diseño). Como contexto: `levels` tiene `sorcerer` 394, `wizard` 396, `cleric` 236, `druid` 169, `bard` 164, `ranger` 51, `paladin` 45; 175 conjuros tienen solo `sorcerer`/`wizard`; ninguna clave de otro libro ni de dominio.

## Recuentos de las listas (`src/data/spells/lists.json`)

| Clase | Total | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bard | 164 | 16 | 26 | 35 | 30 | 21 | 16 | 20 | - | - | - |
| cleric | 236 | 12 | 31 | 32 | 34 | 27 | 28 | 26 | 18 | 17 | 11 |
| druid | 169 | 13 | 20 | 26 | 22 | 17 | 19 | 18 | 13 | 11 | 10 |
| paladin | 45 | - | 16 | 9 | 11 | 9 | - | - | - | - | - |
| ranger | 51 | - | 19 | 12 | 13 | 7 | - | - | - | - | - |

Cada clase tiene lista en todos los niveles que su tabla de clase permite (el test lo contrasta con `spellsPerDay`/`spellsKnown` del nivel 1-20 de `classes`: bardo 0-6, clérigo y druida 0-9, paladín y explorador 1-4). Sin claves `sorcerer`/`wizard` (R21).

## Conjuros de otros libros descartados (R93)

Las listas de AoN mezclan todos los libros. Se conservan solo los nombres del filtro CRB (la misma página de fuente que usa `spells`, 623 nombres):

| Clase | En la lista de la fuente | CRB (conservados) | Otros libros (descartados) |
|---|---|---|---|
| bard | 867 | 164 | 703 |
| cleric | 1133 | 236 | 897 |
| druid | 792 | 169 | 623 |
| paladin | 300 | 45 | 255 |
| ranger | 390 | 51 | 339 |
| **Total** | 3482 | 665 | **2817** |

Ejemplos descartados: `Detect Fiendish Presence`, `Grasp`, `Spark`, `Abundant Ammunition`, `Ant Haul`, `Air Bubble`, `Abadar's Truthtelling`. La lista completa por clase queda en el informe generado (`reports/import-2026-10-16.md`, sección «parse: spell-lists», una nota por clase) y el contador en `conjuros de otro libro descartados: 2817`.

## Qué se hizo

| Pieza | Entrega |
|---|---|
| Semillas | `scripts/srd/config/seeds.json` clave `spell-lists`: página de fuente CRB + `Spells.aspx?Class=Bard\|Cleric\|Druid\|Paladin\|Ranger` (4 descargas nuevas, 1 req/s; CRB y clérigo ya estaban en caché) |
| Parser | `scripts/srd/parsers/spell-lists.ts` (`parse`, `extractClassListLinks`, `CLASS_LIST_URLS`): encabezados `N-Level` + enlaces `SpellDisplay.aspx?ItemName=`, filtro por universo CRB, contadores y notas; falla cerrado ante encabezado desconocido, conjuro antes de encabezado, conjuro repetido en una lista, página/clase que falta |
| Datos | `src/data/spells/lists.json`, `src/data/provenance/spell-lists.json` (6 páginas, licencia OGL-1.0a), `src/data/spell-lists/index.ts` regenerado por `data:parse` (enumera `spells/lists.json`) |
| `spells/index.ts` | ya cubría los 24 shards a-z de los 4 rangos; el test lo compara con `expectedIndex` y con las iniciales reales |
| Procedencia de `spells` (R99) | sin cambios necesarios: `index.json` `expectedCount: 623`; los 4 `expectedCountByBatch` (172+142+146+163) suman 623; el test lo verifica con `mergeProvenance` |
| Tests | `tests/scripts/srd/parse-spell-lists.test.ts` (7), `tests/data/spells.test.ts` (15) |

Hallazgo de marcado en la fuente: los conjuros con marca (`<sup>R</sup>`, `Y`...) llegan como `<b><a>nombre</b><sup>R</sup><b></a></b>`; el analizador HTML duplica el enlace alrededor del `<sup>`. El parser ignora el duplicado (sin texto propio) y la fixture real lo prueba.

## Trazabilidad R -> test

| R | Test |
|---|---|
| R20 | `tests/data/spells.test.ts`: 623 conjuros CRB, 4 goldens de §5 (`cure-light-wounds`, `magic-missile`, `burning-hands`, `wish`; los dos de solo sorcerer/wizard con `levels` exactamente `sorcerer`+`wizard`), Wish nivel 9 |
| R21 | `tests/data/spells.test.ts` (5 clases, sin sorcerer/wizard, ids existentes y no repetidos, niveles = los de la tabla de clase, todos con conjuros); `tests/scripts/srd/parse-spell-lists.test.ts` (parser, `SpellListsSchema`, determinismo, fallos) |
| R22 | `tests/data/spells.test.ts` (regla de integridad sin hallazgos + comparación de pares lista/`levels` por clase); las pruebas sintéticas de ambos sentidos siguen en `integrity/spell-lists.test.ts` |
| R26, R99 | `tests/data/spells.test.ts`: `expectedCount` 623 = suma de `expectedCountByBatch` = nº de conjuros; lotes `a-d e-k l-r s-z`; licencia OGL en cada parte |
| R93, R98 | `parse-spell-lists.test.ts` (filtro por universo CRB y recuento de descartados); `spells.test.ts` (licencia de cada parte de procedencia) |
| R95 | `tests/data/spells.test.ts`: sorcerer/wizard con resultados en los niveles 0-9 sin lista |
| R100 | `tests/data/spells.test.ts`: `spellsForClass` = lista para las 5 clases (total y por nivel), orden por nivel e id, y para sorcerer/wizard |

## Verificación

| Comando | Resultado |
|---|---|
| `npx vitest run tests/data tests/scripts tests/setup` | 60 ficheros / 723 tests en verde |
| `npx tsc --noEmit` | sin errores |
| eslint y prettier sobre mis ficheros | limpios (`seeds.json` ya no cumplía prettier antes por las líneas largas de `weapons`; no es mío) |
| `data:validate` | 19 errores en 2 categorías, ninguno de conjuros ni listas (ver abajo) |

## Hallazgos fuera de mi alcance (para Z / Lote A)

1. **`domain.spell-ref` (18 errores)**: las listas de conjuros de los dominios (Lote A) usan slugs que no coinciden con los ids de `spells`. Patrones: números romanos (`summon-monster-ix`, `summon-natures-ally-iv` frente a `summon-monster-9`...) y prefijos `greater`/`mass`/`lesser` (`greater-teleport`, `mass-heal`, `mass-cure-critical-wounds`, `lesser-confusion` frente a `teleport-greater`, `heal-mass`, `cure-critical-wounds-mass`, `confusion-lesser`, ids que sí existen en `spells`). Es un tema de `domains` o de `slug-aliases.json` (categoría `spells`), no de los datos de conjuros; lo cierra Z o el Lote A.
2. `glossary.stale`: lo regenerará Z con `data:glossary`.

## Preguntas abiertas

Ninguna nueva para D5. (Heredadas de D0: campo ausente = `raw: ""`/`other`; `Target/Effect` -> `other`; crosscheck R56 sin plantilla `{initial}`.)
