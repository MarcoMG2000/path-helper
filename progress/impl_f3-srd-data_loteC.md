# Implementación - f3-srd-data, Lote C (Dotes)

Estado: **implementado** (TC.1..TC.6 marcadas `[x]` en `specs/f3-srd-data/tasks.md`). Pendiente de reviewer/humano.
No se tocó `feature-list.json`, ni `package.json`, ni ficheros de otros lotes; no se ejecutó `npm ci/install`, `./init.sh` ni `data:glossary`.

## Resultado

| | Esperado | Importado |
|---|---|---|
| Dotes CRB | 176 (`Feats [176]` de la página de fuente de AoN, congelado en `provenance/feats.json` `expectedCount`) | **176** (20 shards `feats/<inicial>.json`) |
| Resúmenes ES (draft) | 176 | 176 (`summaries/feats/<inicial>.json`) |
| Claves de glosario (draft) | 176 | 176 (`glossary/feats.es.json`) |

Por tipo (una dote puede tener varios): Combat 110, General 49, Metamagic 9, Item Creation 8, Critical 10 (las 10 críticas son también Combat).
Prerrequisitos: 83 dotes con `featIds`, 6 con `skills`, **36 con `other` no vacío** (lista completa en el informe `reports/import-2026-10-16.md`, sección Notas, git-ignorado). `needsReview`: 2 (Extra Channel y Rapid Reload, varias etiquetas `Source` en el bloque principal).
`data:validate` filtrado a `feats` (loadDataset + `runIntegrity` con `categories:["feats"]`): 0 hallazgos (schema, ids, R27, R18, R19, R29, R30, R33, overrides).

## Hallazgo de fuente importante (afecta a otros lotes)

El índice general de AoN `Feats.aspx` **no trae el libro** de cada dote (3.442 filas de todos los libros), así que "índice filtrado por CRB" no es posible con él. Descubrí que AoN tiene una página de fuente que agrupa **todo lo del CRB por tabla con recuento**:

`https://aonprd.com/SourceDisplay.aspx?FixedSource=PRPG Core Rulebook`

(secciones `Feats [176]`, `Spells [623]`, `Classes [16]`, `Cleric Domains [33]`, `Equipment (Armor) [21]`, `Equipment (Weapons) [88]`, `Equipment (Misc.) [161]`, `Magic Items (Armor) [48]`, `(Weapons) [64]`, `(Rings) [43]`, `(Rods) [36]`, `(Staves) [21]`, `(Wondrous Items) [300]`, `(Cursed Items) [29]`, `(Artifacts) [12]`, `Races [7]`, `Skill Uses [27]`, `Rogue Talents [23]`, `Barbarian Rage Powers [28]`, ... en el HTML cacheado de `.cache/srd-raw/aonprd.com/`). Es el índice filtrado por libro que el design §2 asumía, con `expectedCount` por tabla directamente de la fuente. **Recomiendo que los lotes D (conjuros, `Spells [623]`), E, M y A lo usen como semilla/descubrimiento** (mi `crbFeatIndex`/`discover` en `scripts/srd/parsers/feats.ts` es un ejemplo). Sin él, el contrato `discover` no puede congelar `expectedCount` cuando el índice no tiene libro (el `discover` solo ve las páginas semilla).

Cómo se usa en el Lote C: `discover` lee `Feats [N]`, comprueba que N == número de enlaces, devuelve las 176 URLs y `expectedCount: 176`. `parse` exige coherencia en ambos sentidos (falla cerrado): toda dote listada tiene página con `Source` CRB; ninguna página con `Source` CRB queda fuera de la lista.

Verificación puntual adicional (no reproducible por la CLI, hecha con un script desechable): antes de descubrir la página de fuente descargué ~720 páginas de dotes de otros libros (el principio del índice alfabético, de "Aberrant Tumor" hacia delante). En las 896 páginas `FeatDisplay` que hay en caché (176 CRB + ~720 de otros libros), las páginas con etiqueta `Source` CRB son exactamente las 176 listadas, ninguna fuera de la lista. (Ese escaneo lo paré yo; las páginas sobrantes solo están en `.cache/`, no en `provenance/feats.json`, que contiene 181 páginas: la de fuente, 4 listados por tipo y las 176 dotes.)

## Ficheros del Lote C

- Schema: `src/data/schema/feat.ts` (`FeatSchema`, `FEAT_TYPES`, `FeatPrerequisitesSchema`).
- Integridad: `src/data/integrity/feat-prereqs.ts` (`featPrereqsRule`: `feats.prereq-ref` R18, `feats.prereq-cycle` R19 por componentes fuertemente conexos, y `feats.prereq-skill` cruzada solo si `skills` está cargada).
- Parser: `scripts/srd/parsers/feats.ts` (`discover`, `parse`, `structurePrerequisites`, `tokenizePrerequisites`, `expandTables`).
- Config (solo mis claves): `seeds.json` (`feats.urls` = página de fuente CRB + listados `Feats.aspx?Category=Combat|Metamagic|Item Creation|Critical`), `section-allowlist.json` (`feats`: Source, Prerequisites, Prerequisite, Benefit, Normal, Special, Leadership Modifiers), `slug-aliases.json` (`feats`: `light|medium|heavy-armor-proficiency` -> `armor-proficiency-light|medium|heavy`).
- Datos: `src/data/feats/*.json` + `index.ts` (generado), `src/data/provenance/feats.json`, `src/data/summaries/feats/*.json`, `src/data/glossary/feats.es.json`.
- Tests: `tests/data/schema/feat.test.ts`, `tests/data/integrity/feat-prereqs.test.ts`, `tests/scripts/srd/parse-feats.test.ts`, `tests/data/feats.test.ts`; fixtures `tests/fixtures/srd-html/feats/*.html` (contenido real de páginas AoN recortado al `span` de la dote; extractos reales del índice de fuente CRB —con el recuento `Feats [N]` ajustado al extracto— y de los listados por tipo).

## Decisiones de diseño dentro del spec

1. **Universo y filtro CRB** como arriba (R17, R26, R27, R46).
2. `types`: del sufijo del `h1` ("Power Attack (Combat)"); sin sufijo = `General` (las dotes generales no llevan etiqueta en AoN). Segunda lectura contra los listados por tipo de AoN (Combat/Metamagic/Item Creation/Critical): una discrepancia marca `needsReview`; hoy hay 0.
3. Texto: `textEn` = ambientación + `**Prerequisites**` + `**Benefit**` + `**Normal**` + `**Special**` íntegros en Markdown restringido, sin la línea `Source` ni el contenido de otros libros (secciones `h2` de Pathfinder Unchained, míticas, etc.: 200 secciones ignoradas, cada una verificada con un `Source` no CRB; una sección sin `Source` o con `Source` CRB detiene el parseo, R45).
4. `other` es la válvula: clase/nivel de clase ("12th-level fighter"), capacidades de clase, alternativas con "or", "Proficiency with selected weapon", etc. **Una dote con calificador** ("Spell Focus (conjuration)", "Weapon Focus with selected weapon") pone la dote en `featIds` **y** el texto completo en `other` (para no perder el calificador).
5. `skillId`: slug del nombre; `Knowledge (x)` -> `knowledge-x`; `Perform/Craft (x)` -> `perform`/`craft` (coherente con el design de Lote B). La regla cruzada `feats.prereq-skill` comprobará esos ids cuando `skills` exista (hoy solo aparece `ride`).
6. Tablas con `rowspan/colspan` (solo Leadership): `expandTables` repite el contenido para alinear columnas en Markdown; `lib/html.ts` (compartido) no los soporta y no lo toqué.
7. Etiquetas permitidas (R45): los campos estructurales son `Source/Prerequisites/Benefit/Normal/Special`; "Leadership Modifiers" es un subtítulo permitido dentro de Benefit (se conserva como contenido); cualquier otra etiqueta en negrita al inicio de párrafo detiene el parseo.
8. Resúmenes ES: borrador `draft`, redactados solo desde el `textEn` de cada dote (R30 verificado por la integridad). Nombres de habilidades, conjuros y dotes citados dentro del resumen se dejan en inglés (no inventé nombres españoles). Condiciones: usé términos comunes (aturdido, tambaleante, desprevenido...) salvo en Medusa's Wrath, donde dejé las condiciones en inglés por ambigüedad (dazed/stunned).
9. Glosario: R33 exige clave por entrada y no hay nombres españoles de dotes en el glosario salvo `power-attack` ("Ataque poderoso", del spec, Q2): `feats:power-attack` -> "Ataque poderoso"; las otras 175 llevan **el nombre inglés como marcador** (`draft`, `verified:false`, con `note`). El humano debe aportar los nombres de Devir (Q2).

## Discrepancias y puntos para el humano

- **Golden de Cleave**: el spec (design §5) dice "Cleave (Str 13, Power Attack)"; la fuente (AoN CRB pg. 119) dice "Str 13, Power Attack, base attack bonus +1". No es una contradicción (el golden omite el BAB), pero los datos incluyen `bab: 1`. Los tests comprueban Str 13 y Power Attack (golden) y `bab 1` (fuente). Power Attack (Str 13, BAB +1) y Great Cleave (Str 13, Cleave, Power Attack, BAB +4) coinciden exactamente.
- **Improved Familiar** (`improved-familiar`): el texto de AoN dice "the creatures listed below are also available to you ... You can find the full list of available Improved Familiars here." La lista de criaturas es un enlace a otra página y **no está en `textEn`**. Pendiente de decidir si se importa esa lista (fuera de mi alcance).
- **Extra Channel** (CRB pg. 123) y **Rapid Reload** (CRB pg. 132) tienen varias etiquetas `Source` (Advanced Class Guide; Ultimate Combat + Inner Sea World Guide): AoN muestra el texto actualizado de la primera. Quedan `needsReview: true` (Q13). El texto de Extra Channel menciona al "warpriest" (no del CRB) y Rapid Reload "firearm" (Ultimate Combat): es el texto que muestra la fuente, no el impreso del CRB; el humano decide.
- **Nombres en prerrequisitos**: AoN escribe "Light/Medium Armor Proficiency" (sin enlace) donde la dote se llama "Armor Proficiency, Light/Medium"; declarado como alias en `slug-aliases.json` (revisar).
- **Hallazgos de coherencia a anotar**: Leadership usa "Character level 7th" (nivel de personaje) -> `other` (no hay campo de nivel de personaje en el schema del design).
- **Q10 (recuento)**: el 176 sale de la propia fuente (AoN). Falta contrastarlo con el CRB impreso (lo hace el humano).
- **Prettier**: los JSON de datos se escriben con `JSON.stringify(..., 2)` y no pasan `prettier --check` (igual que `src/data/classes`); `src/data` no está en `.prettierignore` (cambio a decidir por el leader, fuera de mi alcance).
- **Typecheck global**: `tsc --noEmit` muestra errores en ficheros de otros lotes (`tests/data/spells/a-d.test.ts`, `tests/scripts/srd/parse-class*.test.ts`); mis ficheros están limpios.
- **Incidente de proceso** (resuelto): un `import` en segundo plano (escaneo de las 3.446 páginas de dotes, que ya no hacía falta) mantuvo bloqueados ficheros de `node_modules` y pudo contribuir a que un `npm ci` de otro agente dejara `node_modules` incompleto; lo detuve en cuanto lo vi (`node_modules` está restaurado).

## Verificación

| Comando | Resultado |
|---|---|
| `npx vitest run tests/data tests/scripts` | 46 ficheros / 556 tests en verde (con los de otros lotes presentes) |
| `npx vitest run tests/data/feats.test.ts tests/scripts/srd/parse-feats.test.ts tests/data/schema/feat.test.ts tests/data/integrity/feat-prereqs.test.ts` | 70 tests en verde |
| `npx tsc --noEmit` | sin errores en mis ficheros (errores ajenos arriba) |
| eslint sobre mis ficheros | sin errores |
| `loadDataset(ROOT,["feats"])` + `runIntegrity(..., {categories:["feats"]})` | 0 hallazgos |
| `data:import --category feats` / `data:parse --category feats` | 181 páginas (124 descargadas) / 176 entradas, 20 ficheros, 2 needsReview |

Red real (solo vía pipeline, 1 req/s, caché): índice `Feats.aspx` + 4 listados por tipo + `Sources.aspx` (2 páginas de navegación) + la página de fuente CRB + 6 dotes de prueba + el escaneo parcial detenido (~720 páginas) + las 176 dotes CRB.

## Trazabilidad R -> test

| R | Test |
|---|---|
| R2, R3, R7, R8 (feats) | `tests/data/schema/feat.test.ts`, `tests/data/feats.test.ts` (integridad), `tests/scripts/srd/parse-feats.test.ts` (FeatSchema sobre fixtures) |
| R17 | `tests/scripts/srd/parse-feats.test.ts` (fixtures: Power Attack, Cleave, Great Cleave, Mounted Combat, Empower Spell, Armor Proficiency x3, Augment Summoning, Alignment Channel, Extra Channel, Rapid Reload...), `tests/data/feats.test.ts` (datos reales y goldens), `tests/data/schema/feat.test.ts` |
| R18, R19 | `tests/data/integrity/feat-prereqs.test.ts` (referencia rota, ciclos de 2 y 3 dotes, autociclo, caso verde, aristas rotas), `tests/data/feats.test.ts` (datos reales sin hallazgos; cadena Great Cleave) |
| R26 | `parse-feats.test.ts` (`discover` recuento; recuento declarado distinto falla; dote listada sin página falla), `feats.test.ts` (176 == `expectedCount`) |
| R27 | `parse-feats.test.ts` (página de otro libro/vacía excluida y listada; CRB no listada falla; listada no CRB falla), `feats.test.ts` |
| R28-R31, R33 | `tests/data/feats.test.ts` (176 resúmenes draft, 176 claves de glosario draft, integridad R29/R30/R33 sin hallazgos) |
| R44 | `parse-feats.test.ts` (orden de páginas) |
| R45 | `parse-feats.test.ts` (etiqueta desconocida, sección h2 sin Source, Benefit ausente, tipo desconocido) |
| R46 | `parse-feats.test.ts` (páginas excluidas se listan) |

## Para el Lote Z

- `counts.ts` (R26) leerá `provenance/feats.json` -> `expectedCount: 176`; coincide.
- La regla `feats.prereq-skill` se activa sola cuando exista `skills`; verificar que el único `skillId` usado (`ride`) existe.
- `data:glossary` (TZ.2) debe incluir `glossary/feats.es.json` (176 claves `feats:*`).
- Regenerar `feats/index.ts` con `data:parse --category feats` si cambian resúmenes/glosario (idempotente).
