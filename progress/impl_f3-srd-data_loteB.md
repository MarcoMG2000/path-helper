# Implementación - f3-srd-data, Lote B (Razas y habilidades)

Estado: **implementado** (TB.1..TB.5 marcadas `[x]` en `specs/f3-srd-data/tasks.md`). Pendiente de reviewer.
No se tocó `feature-list.json` ni se marcó la feature `done`; no se ejecutó `npm ci/install`, `./init.sh` ni `data:glossary`; no se editó ningún fichero de otro lote (de `seeds.json` y `section-allowlist.json` solo las claves `races` y `skills`).

Incidente de entorno: entre las 01:40 y las 01:57 `node_modules` estuvo corrupto a medias (lo reinstaló el coordinador). Todos los comandos que fallaron en ese intervalo se repitieron después; los resultados de abajo son posteriores a la restauración.

## Recuentos reales vs esperados

| Categoría | Esperado (spec) | Fuente | Importado |
|---|---|---|---|
| races | 7 | «Races [7]» de `SourceDisplay.aspx?FixedSource=PRPG Core Rulebook` (7 enlaces, coherente); `expectedCount: 7` congelado en `provenance/races.json` | **7** |
| skills | 35 | «Skill Uses [27]» de la misma página: 26 enlaces `Core (X)` a páginas de habilidad únicas + 1 enlace `Directing Crowds (Diplomacy)` (misma página que Diplomacy). `expectedCount` = 26 - 1 (Knowledge) + 10 materias = 35, congelado en `provenance/skills.json` | **35** |

Ambos coinciden con el spec: no hay discrepancia de recuento. Nota: «Skill Uses [27]» NO es el número de habilidades; el 35 sale de 26 páginas con Knowledge expandido. El parser contrasta además (falla cerrado) que las páginas coinciden con la lista de navegación de AoN (`#MainContent_FullSkillList`, 26 nombres) y con los `Core (X)` de la página de fuente CRB, y que la lista de materias de Knowledge de la página es exactamente la esperada (10).

Descargas: 7 páginas de razas + 26 de habilidades (1 req/s, vía pipeline); la página de fuente CRB ya estaba en caché. Sin procesos en segundo plano.

## Ids de habilidades y alineación con el Lote A

Los 35 ids salen de la fuente: `acrobatics appraise bluff climb craft diplomacy disable-device disguise escape-artist fly handle-animal heal intimidate knowledge-{arcana,dungeoneering,engineering,geography,history,local,nature,nobility,planes,religion} linguistics perception perform profession ride sense-motive sleight-of-hand spellcraft stealth survival swim use-magic-device`.

**Sin discrepancia con el Lote A.** La lista de Knowledge de la propia página de AoN incluye Engineering, así que `knowledge-engineering` existe. Comprobado con datos reales: los `classSkills` de las 7 clases (todos los ids, incluidos los 10 `knowledge-*` de la expansión del bardo) resuelven a ids de `skills`, y los `skillId` de prerrequisitos de dotes (Lote C) también. (El test `tests/data/skills.test.ts` lo vigila.) El Lote Z no necesita alinear nada por esto.

## Discrepancias spec vs fuente (anotadas, NO arregladas)

1. **Half-Orc también tiene «+2 to One Ability Score»** en la fuente (CRB pg. 25): `abilityModifiers: {}` + `abilityChoice: {amount: 2}`. R15 y design §4.2 solo citan humano y semielfo. El schema es genérico, así que no hay conflicto técnico; el test de datos documenta que las tres razas con elección son `human`, `half-elf`, `half-orc`.
2. **`type`/`subtype` del design §4.2 no se almacenan**: la página de la raza (texto del CRB) no los dice (sin «humanoid (dwarf)» en ningún sitio) y no se inventan de memoria. El schema no tiene esos campos (estricto).
3. **Extensiones menores al schema del design** (necesarias para no perder datos): `languages.bonusAny: boolean` (humano y semielfo «can choose any languages they want», sin lista) y `abilityModifiers` vacío con `abilityChoice` para las razas de +2 a elegir. El «idioma étnico» del humano no es un nombre de idioma: no figura en `languages.automatic` (`["Common"]`); el texto íntegro está en el rasgo `Languages` y se anota en el informe de importación.
4. **Los goldens Dwarf/Human/Stealth/Knowledge (arcana) no traen valores en el spec** (solo se nombran en tasks.md). Se escribieron desde la fuente: Dwarf +2 Con, +2 Wis, -2 Cha, Medium, 20 ft, Common/Dwarven, CRB pg. 21; Human +2 a elegir, Medium, 30 ft, dote y rango extra, CRB pg. 27; Stealth Dex, ACP, no trained only, CRB pg. 106; Knowledge (arcana) Int, trained only, sin ACP, CRB pg. 99. Ninguno contradice el spec (R15/R16 solo dicen «con característica clave, trainedOnly y armorCheckPenalty»).

## needsReview

- **Las 7 razas** quedan `needsReview: true`: todas declaran varias etiquetas `Source` en el bloque principal (Inner Sea Races, Advanced Race Guide y CRB). AoN muestra el texto actualizado/reimpreso, que puede diferir del CRB impreso (Q13). Los rasgos estándar de las 7 razas coinciden con la lista que conoce el CRB, pero la descripción puede ser la de otra edición: lo decide el humano. Es el mismo criterio que en dotes (Lote C).
- Habilidades: 0 (todas declaran únicamente `PRPG Core Rulebook pg. N`).

## Decisiones dentro del spec (revisar)

- **Razas** (`races.json`, 7 entradas): `textEn` = descripción íntegra del CRB (sin la línea `Source`) + `**Racial Traits**` + todos los rasgos como `**Nombre**: texto`. `traits` conserva todos los rasgos tal cual los nombra la fuente, incluido el de modificadores («+2 Constitution, +2 Wisdom, –2 Charisma», con el guion largo) y los de tamaño, velocidad e idiomas; los campos estructurados (`abilityModifiers`, `abilityChoice`, `size`, `baseSpeedFt`, `languages`) se derivan de ellos y el test de datos comprueba que concuerdan.
- **Excluido (R27, R45, R46)**: «Subraces», «<Raza> Alternate Racial Trait(s)» y «<Raza> Favored Class Options» (56 subrazas, 94 rasgos alternativos y 7 grupos de clase predilecta, todos de otros libros); el parser falla si alguno de esos grupos menciona `PRPG Core Rulebook` o si aparece cualquier otro `h1`. La lista permitida (`section-allowlist.json` -> `races`) es: Racial Traits, Subraces, Alternate Racial Trait(s), Favored Class Options (los encabezados se comparan sin el prefijo de la raza).
- **Habilidades** (`skills.json`, 35 entradas): `textEn` = texto íntegro de la página (sin `Source`) en Markdown, más las secciones `h2` que declaran el CRB. Hay **una**: «Directing Crowds» dentro de Diplomacy (CRB pg. 436, en la lista permitida de `skills`). Las 61 secciones `h2`/`h3` de otros libros (Pathfinder Unchained «Skill Unlock», Occult Adventures, GameMastery Guide...) se ignoran y cuentan; una sección sin `Source`, o del CRB fuera de la lista permitida, detiene el parseo (R45).
- **Knowledge**: las 10 entradas `knowledge-<materia>` comparten el **mismo `textEn` íntegro** de la página de Knowledge (lista de materias, tabla de tareas...), `source` y `sourceRef` (pg. 99); lo que las distingue es `name` («Knowledge (arcana)»), `id` y `knowledgeSubject`. Duplica ~4,6 KB x 10; alternativa descartada: trocear el texto por materia (sería reescribir la fuente).
- **Craft, Perform, Profession**: una entrada cada una (ids `craft`, `perform`, `profession`).
- `trainedOnly`/`armorCheckPenalty`/`keyAbility` salen del paréntesis del `h1` de cada página («Stealth (Dex; Armor Check Penalty)»); un indicador o característica desconocidos detienen el parseo.
- **Capa ES (borrador)**: 7 + 35 resúmenes `draft` (`summaries/races/races.json`, `summaries/skills/skills.json`), redactados solo desde el `textEn`; nombres de habilidades, dotes, conjuros y rasgos se dejan en inglés dentro de las frases; solo se usan términos españoles del glosario (características: Fuerza, Destreza... y «Clase de Armadura» como CA). 42 claves de glosario `races:*`/`skills:*` (`glossary/races.es.json`, `glossary/skills.es.json`) con el **nombre inglés como marcador** (`verified:false`, `origin:draft`, nota «Sin traducción conocida... Devir (Q2)»): el humano debe aportar los nombres de Devir. Comprobado R30 (cifras) y longitud <= 300 en los 42 resúmenes (mediante `runIntegrity`).
- `src/data/{races,skills}/index.ts` regenerados con `data:parse` (idempotente; R44 comprobado: `races.json`, `skills.json`, `index.ts` y procedencias idénticos byte a byte en dos ejecuciones).

## Ficheros

- Schemas: `src/data/schema/{race,skill}.ts` (sustituyen los stubs; `RaceSchema` y `SkillSchema` llevan un `.refine`, de modo que ya no son `ZodObject` extensible).
- Parsers: `scripts/srd/parsers/{races,skills}.ts` (cada uno con `discover` + `parse`) y `race-skill-common.ts` (utilidades de la página de fuente CRB, solo de este lote).
- Config (solo mis claves): `seeds.json` (`races.urls` y `skills.urls` = página de fuente CRB; el resto lo descubre `discover`), `section-allowlist.json` (`races`, `skills`). No hay `slug-aliases` ni overrides.
- Datos: `src/data/{races,skills}.json`, `src/data/provenance/{races,skills}.json`, `src/data/{races,skills}/index.ts` (generados), `src/data/summaries/{races,skills}/*.json`, `src/data/glossary/{races,skills}.es.json`.
- Tests/fixtures: `tests/fixtures/srd-html/{races,skills}/` (páginas reales recortadas de AoN: Dwarf, Gnome, Half-Elf, Human; Stealth, Knowledge, Diplomacy, Appraise, Perform; extractos reales de la página de fuente CRB y un subconjunto con la navegación recortada a las 5 habilidades), `tests/scripts/srd/parse-{races,skills}.test.ts`, `tests/data/schema/{race,skill}.test.ts`, `tests/data/{races,skills}.test.ts`.
- Tocados: `specs/f3-srd-data/tasks.md` (TB.1-TB.5 `[x]`) y este informe.

## Verificación (sin `npm ci` ni `init.sh`)

| Comando | Resultado |
|---|---|
| `vitest run` de los 6 ficheros de mi lote | 6 ficheros / 65 tests en verde |
| `loadDataset(ROOT, ["races","skills"])` + `runIntegrity(..., {categories})` | 0 hallazgos (schema, ids, R27, resúmenes R29/R30, glosario R33, overrides) |
| `vitest run tests/data tests/scripts tests/setup` | 58 de 60 ficheros en verde; los 2 que fallan (`tests/data/spells.test.ts`, `tests/scripts/srd/parse-spell-lists.test.ts`) son del Lote D5 en curso |
| `tsc --noEmit` | sin errores |
| eslint + prettier sobre mis ficheros `.ts` | limpio (los `.json` de datos no pasan prettier, igual que los demás lotes) |
| `data:parse` x2 | ficheros idénticos |

## Trazabilidad R -> test (rutas bajo `tests/`)

| R | Test |
|---|---|
| R2, R3 (races, skills) | `data/schema/race.test.ts`, `data/schema/skill.test.ts` (libro ajeno, `sourceRef` ajeno, claves desconocidas), `scripts/srd/parse-{races,skills}.test.ts` (las salidas pasan el schema real) |
| R4, R5, R6, R7, R8 | regla `runIntegrity` sobre los datos reales en `data/races.test.ts` y `data/skills.test.ts` (0 hallazgos); `textEn` sin HTML en ambos |
| R15 | `data/races.test.ts` (7 ids exactos, goldens Dwarf y Human, elección, coherencia modificadores/etiqueta, rasgos), `scripts/srd/parse-races.test.ts`, `data/schema/race.test.ts` |
| R16 | `data/skills.test.ts` (35 ids exactos, goldens Stealth y Knowledge (arcana), tabla de las 25 restantes, Craft/Perform/Profession únicos, Knowledge x10), `scripts/srd/parse-skills.test.ts`, `data/schema/skill.test.ts` |
| R26 | `data/races.test.ts` y `data/skills.test.ts` (recuento = `expectedCount` congelado: 7 y 35), `scripts/srd/parse-{races,skills}.test.ts` (`discover`: recuento y coherencia con la fuente) |
| R27 | `data/races.test.ts`, `data/skills.test.ts` (solo CRB, sin subrazas/rasgos alternativos/Skill Unlock), `scripts/srd/parse-*.test.ts` |
| R28-R30, R31, R33 | `data/races.test.ts` y `data/skills.test.ts` (resúmenes y glosario draft + integridad sin hallazgos) |
| R44 | `scripts/srd/parse-{races,skills}.test.ts` (dos ejecuciones idénticas) y `data:parse` x2 idéntico |
| R45 | `scripts/srd/parse-races.test.ts` (h1 desconocido, grupo que declara el CRB, h2 anidado), `parse-skills.test.ts` (sección del CRB fuera de la lista, sección sin Source, indicador/característica/materias desconocidos, universo incoherente) |
| R46 | `scripts/srd/parse-{races,skills}.test.ts` (página sin etiqueta CRB excluida y listada) |

## Preguntas abiertas para el humano

1. ¿Aceptas que Half-Orc lleve «+2 a una característica a elegir» (lo que dice la fuente) aunque el spec solo nombre humano y semielfo?
2. ¿Aceptas omitir `type`/`subtype` de las razas (el texto del CRB no los trae) y las extensiones `languages.bonusAny`?
3. Las 7 razas necesitan revisión humana por las etiquetas `Source` múltiples (Q13): ¿texto de AoN tal cual o cotejo con la impresión?
4. Nombres españoles de razas y habilidades (Devir, Q2): hoy son marcadores en inglés.
5. Recuento: el 7 y el 35 salen de la propia fuente; falta el contraste con el CRB impreso (Q10).
6. Para el Lote Z: `counts.ts` leerá `expectedCount` 7 (races) y 35 (skills); `data:glossary` debe incluir `glossary/{races,skills}.es.json` (42 claves).
