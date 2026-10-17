# Implementación - f3-srd-data, Lote A (Clases, capacidades de clase y dominios)

Estado: **implementado** (TA.1..TA.8 marcadas `[x]` en `specs/f3-srd-data/tasks.md`). Pendiente de reviewer y de la decisión
humana sobre los puntos de "Decisiones pendientes". No se tocó `feature-list.json` ni se marcó la feature `done`; no se ejecutó
`npm ci/install`, `./init.sh` ni `data:glossary`. No se hicieron commits.

## Verificación

| Comando | Resultado |
|---|---|
| `npx vitest run tests/data tests/scripts tests/setup` | 49 ficheros / 594 tests en verde (incluye los ficheros nuevos del Lote A) |
| `npx tsc --noEmit` | sin errores en ficheros del Lote A (queda un error ajeno en `tests/data/spells/a-d.test.ts`, Lote D) |
| `eslint` + `prettier --check` sobre mis ficheros | limpio |
| `data:import --category classes,class-features,domains` | solo desde la caché (todo descargado en la sesión anterior, 1 req/s, sin repeticiones) |
| `data:parse --category classes,class-features,domains` dos veces | ficheros idénticos byte a byte (R44) |
| `data:validate` filtrado a mis categorías | solo `domain.spell-ref` (148 hallazgos): los conjuros de dominio se contrastan con `spells`, que el Lote D todavía está importando; lo cierra TZ.1 |

Nota de entorno: durante la sesión faltó `node_modules/.bin`, así que ejecuté la CLI con `node node_modules/tsx/dist/cli.mjs scripts/srd/cli.ts ...` (equivale a `npm run data:*`).

## Recuentos reales importados vs esperados

| Categoría | Importado | `expectedCount` congelado (de `discover`) | Esperado por el spec |
|---|---|---|---|
| classes | 7 | 7 (páginas `ClassDisplay` con etiqueta CRB) | 7 (R9) |
| class-features | 240 | 240 (entradas que produce el parseo desde las páginas semilla) | sin cifra en el spec |
| domains | 33 | 33 (páginas `DomainDisplay` con etiqueta CRB; 35 enlazadas en `ClericDomains.aspx`) | sin cifra en el spec |

Desglose de class-features (240): bárbaro 12 + 28 poderes de furia; bardo 9 + 13 actuaciones; clérigo 9 + 66 poderes de dominio
(33 dominios x 2); druida 16; paladín 19 + 15 misericordias; cazador 18 + 2 estilos de combate; pícaro 10 + 15 talentos + 8 talentos avanzados.
Páginas excluidas por libro (R46): `Scalykind` y `Void` (Book of the Damned). Opciones de otros libros descartadas: 433 (desglose por libro en el informe de importación).
`needsReview`: 0 en las tres categorías (ninguna entrada CRB declara varias etiquetas `Source`).
Los `expectedCount` salen del parseo de las propias semillas (circular al congelarse); la verificación independiente es la tabla vs fórmulas (R11), los goldens (R12) y la revisión humana (Q10).

## Discrepancias con goldens

**Ninguna.** Contrastados con la fuente (AoN) todos los valores del spec: dado de golpe, rangos por nivel, BAB y salvaciones buenas/malas de las 7 clases;
clérigo y druida nivel 1 con `spellsPerDay[0] = 3` y `[1] = 1`; paladín y cazador niveles 1-3 todo `null` y nivel 4 con `[1] = 0`.
Además: Burning Hands es el conjuro de nivel 1 del dominio de Fuego (coincide con el golden de conjuros de §5).

## Decisiones pendientes para el humano (ambigüedades del spec que NO he resuelto por mi cuenta)

1. **Casilla de dominio del clérigo ("1+1").** La tabla del clérigo trae `1+1`, `2+1`...; el schema del spec (`spellsPerDay: (number|null)[]`) no puede representar el sumando.
   Para no perder datos añadí un campo **opcional** `domainSpellsPerDay` por fila (mismo indexado; `null` donde la tabla no trae sumando) y dejé en `spellsPerDay` el número base
   (cumple el golden `[1] = 1`). Es una extensión de `design.md` §4.1: aprobarla o indicar otra forma.
2. **Competencias en `classes.proficiencies`.** El spec no fija cómo expresar escudos ni el arma predilecta de la deidad: `shields` ∈ `[]`, `["all"]`, `["all-except-tower"]`
   (no se enumeran ids porque `shields` es del Lote E) y el clérigo lleva el token `deity-favored-weapon` en `weapons`. Armas = ids por slug del nombre (`short-sword`, `hand-crossbow`) o `simple`/`martial`;
   el Lote Z debe comprobar que existen en `weapons`.
3. **`Knowledge (all)` del bardo** se expande a 10 ids `knowledge-<materia>`. Nueve materias salen de las propias listas de habilidades de las 7 clases; **`engineering` solo está en mi lista de expansión** (no aparece en ninguna lista explícita).
   Hay que contrastarla con `skills` (Lote B) en TZ.1; si el Lote B usa otros ids, hay que alinearlos.
4. **Niveles derivados.** `level` de las capacidades fuera de la columna `special` (Weapon and Armor Proficiency, Spells, Orisons del clérigo, etc.) sale de la primera mención "Nth level" del texto o, si no hay, es 1
   (el informe de importación lista cada una con su base). El `level` de una opción es el de su capacidad padre (talentos 2, avanzados 10, poderes de furia 2, estilos 2), salvo misericordias (3/6/9/12 por encabezado de la fuente) y poderes de dominio (primera mención "At Nth level", si no 1).
   Los requisitos de nivel propios de cada poder de furia ("must be at least 8th level") quedan solo en `textEn`.
5. **Esquema de ids de opciones:** `rogue.talent.*`, `rogue.advanced-talent.*`, `barbarian.rage-power.*`, `paladin.mercy.*`, `ranger.combat-style.*`, `bard.performance.*` (actuaciones del bardo, subcapacidades de `bard.bardic-performance`), `cleric.domain.<dominio>.<poder>` (todos con `classId: cleric`, también para el druida vía Nature Bond).
   Los poderes de dominio existen por duplicado a propósito (R13 en class-features, R23 en `domains.grantedPowers`) y `domain-refs` comprueba que coinciden.
6. **`textEn` de `classes`** contiene introducción, rol, alineamiento, dado de golpe, riqueza, habilidades, tabla(s) de progresión (Markdown) y "Ex-<Clase>"; el texto de cada capacidad vive en `class-features` (no se duplica).
7. **Contenido de AoN omitido a propósito** (se cuenta en el informe): listas de deidades de los dominios (compilación de AoN de varios libros), subdominios y variantes por deidad (otros libros), "Pharasma-Friendly Death Domain" (fuente Paizo Blog),
   "Alternate Capstones" y "Favored Class Options" (otros libros; se comprueba que ninguna declara el CRB), y las notas editoriales "Note from Nethys". Cualquier otro encabezado o etiqueta desconocida detiene el parseo (R45).
8. **Conjuros de dominio:** `spellId` es el slug del nombre en cursiva de la fuente (`geas/quest` -> `geas-quest`, `heroes' feast` -> `heroes-feast`, `blindness/deafness` -> `blindness-deafness`); los cualificadores literales ("air only", "summons 1d3 shadows") van en `note`.
   Con los conjuros del Lote D aún a medias, 114 de los ids distintos no existen todavía; es esperado hasta TZ.1.
9. **Capa ES (borrador):** los resúmenes son `draft`, redactados solo desde el `textEn` y con R30 en verde. Como no hay glosario para ellos, **nombres de habilidades, dotes, conjuros, condiciones y armas se dejan en inglés dentro de las frases en español**;
   solo se usan nombres españoles del glosario (`term:*`) y los de clase del spec (Druida, Pícaro, Cazador, Bárbaro, Paladín, Bardo, Clérigo). Las claves de glosario sin nombre español conocido llevan el **nombre inglés como `es`** con una nota "sin traducción verificada";
   las que coinciden con un `term` (Castigar el mal, Furia, Ataque furtivo, Enemigo predilecto, Interpretación de bardo, Inspirar valor, Forma salvaje, Canalizar energía, Imposición de manos, Compañero animal) reutilizan ese nombre. Todo `verified: false`, `origin: draft`.
10. Texto de AoN tal cual (Q5/Q13): puede reflejar la errata actual y no la impresión; no se cotejó con el manual.

## Ficheros del Lote A

- Schemas: `src/data/schema/{class,class-feature,domain}.ts` (sustituyen los stubs). Reglas: `src/data/integrity/{class-tables,class-refs,domain-refs}.ts`.
- Parsers: `scripts/srd/parsers/{classes,class-features,domains}.ts` + `class-common.ts` (utilidades compartidas solo por estos tres; los parsers de clases y de class-features comparten `parseClassPage`).
- Config (solo mis claves): `scripts/srd/config/seeds.json` (classes: 7 páginas de clase; class-features: 7 clases + `RogueTalents`, `BarbarianRagePowers?Type=` x6, `PaladinMercies`, `RangerCombatStyles`, `ClericDomains` y las 35 `DomainDisplay`; domains: `ClericDomains` + las 35 `DomainDisplay`
  —se listan todas para que `discover` pueda contar las páginas CRB y comprobar que el índice queda cubierto—), `scripts/srd/config/section-allowlist.json` (classes, class-features, domains).
- Datos: `src/data/classes/*.json` (7), `src/data/class-features/*.json` (7), `src/data/domains.json`, `src/data/provenance/{classes,class-features,domains}.json`, `src/data/{classes,class-features,domains}/index.ts` (generados),
  `src/data/summaries/{classes/classes,class-features/<clase>,domains/domains}.json`, `src/data/glossary/{classes,class-features,domains}.es.json`. No hay overrides (ninguno necesario).
- Tests/fixtures: `tests/fixtures/srd-html/{classes,domains}/` (7 clases, 4 listas de opciones recortadas, 4 dominios + índice recortados; contenido real de AoN), `tests/data/fixtures/class-golden.json`,
  `tests/data/helpers/classes.ts`, `tests/data/{classes,domains}.test.ts`, `tests/data/schema/class.test.ts`, `tests/data/integrity/{class-tables,class-refs,domain-refs}.test.ts`, `tests/scripts/srd/parse-{classes,class-features,domains}.test.ts`.
- Tocados: `specs/f3-srd-data/tasks.md` (TA.* marcadas), este informe y `progress/current.md`.
- Pendiente del Lote Z: TZ.1 (R23 contra `spells`, `classSkills` contra `skills`, la regla `class-refs` ya lo hace si `skills` está cargado), TZ.2 (`data:glossary` regenera `glossary.es.json`).

## Trazabilidad R -> test (rutas bajo `tests/`)

| R | Test |
|---|---|
| R2, R3 | `data/schema/class.test.ts` (clase, capacidad y dominio válidos; `book: APG` rechazado), `scripts/srd/parse-*.test.ts` (las salidas pasan el schema real) |
| R4, R5 | regla `ids` ejecutada sobre los datos reales en `data/classes.test.ts` y `data/domains.test.ts` (ids con puntos, `dottedIds`) |
| R8 | `data/classes.test.ts` y `data/domains.test.ts` (sin HTML en `textEn`), `scripts/srd/parse-classes.test.ts` |
| R9 | `data/classes.test.ts` (7 ids exactos), `data/integrity/class-refs.test.ts` (faltan/sobran clases) |
| R10 | `data/schema/class.test.ts` (20 filas, null vs 0), `scripts/srd/parse-classes.test.ts` (druida, paladín, cazador, pícaro, clérigo, bardo), `data/classes.test.ts` |
| R11 | `data/integrity/class-tables.test.ts` (BAB, ataques iterativos, salvaciones, informe de todos los fallos), `data/classes.test.ts` (datos reales) |
| R12 | `data/classes.test.ts` + `data/fixtures/class-golden.json`, `data/integrity/class-refs.test.ts` (golden en el contexto), `scripts/srd/parse-classes.test.ts` (competencias, habilidades, riqueza) |
| R13 | `scripts/srd/parse-class-features.test.ts` (capacidades, opciones, padres, niveles), `data/schema/class.test.ts` (parentId obligatorio), `data/classes.test.ts` (recuentos por grupo) |
| R14 | `data/integrity/class-refs.test.ts` (special sin capacidad, capacidad de otra clase), `scripts/srd/parse-classes.test.ts` (normalización y error del parser), `data/classes.test.ts` (datos reales) |
| R23 | `data/integrity/domain-refs.test.ts`, `scripts/srd/parse-domains.test.ts`, `data/domains.test.ts`, `data/schema/class.test.ts` (dominio 1-9); el contraste real con `spells` queda para TZ.1 |
| R26 | `data/classes.test.ts`, `data/domains.test.ts` (recuento = `expectedCount` congelado en la procedencia) |
| R27 | `data/classes.test.ts`, `data/domains.test.ts` (solo CRB, sin secciones de otros libros), `scripts/srd/parse-classes.test.ts` |
| R28, R29, R30, R31, R33 | `runIntegrity` sobre los datos reales en `data/classes.test.ts` y `data/domains.test.ts` (hallazgos `[]`: resumen y glosario de cada entrada, cifras del resumen) |
| R44 | `scripts/srd/parse-{classes,class-features,domains}.test.ts` (dos ejecuciones idénticas) y `data:parse` x2 idéntico |
| R45 | `scripts/srd/parse-classes.test.ts`, `parse-class-features.test.ts`, `parse-domains.test.ts` (encabezado desconocido -> `SectionError` con página y encabezado; sección excluida que declare CRB -> error) |
| R46 | los mismos tests (página de clase o dominio de otro libro excluida y listada; opciones de otros libros descartadas y contadas) |
