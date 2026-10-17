# Implementación - f3-srd-data, Lote D2 (conjuros del CRB, iniciales `e-k`)

Estado: **implementado**. Pendiente de reviewer. No se tocó `feature-list.json`, `package.json`, `tsconfig`, configs de vitest, ficheros compartidos ni de otro lote; no se ejecutó `npm ci/install`, `./init.sh` ni `data:glossary`. No se editó `spell-class-ids.json`.

`tasks.md`: las tareas `TDn.1..TDn.4` son genéricas y compartidas por D1-D4 (una sola línea cada una), así que NO las marqué `[x]` para no afirmar el cierre de los otros rangos; el cierre de D2 queda registrado aquí (el leader las marca cuando estén los cuatro lotes). Tampoco anoté nada en `progress/current.md` (lo escriben en paralelo otros agentes).

## Ficheros escritos (solo del rango e-k)

- `src/data/spells/{e,f,g,h,i,j,k}.json` (generados por `data:parse`).
- `src/data/provenance/spells/e-k.json` (142 páginas; `expectedCountByBatch: { "e-k": 142 }`, sin `expectedCount`).
- `overrides/spells/e-k.json`: **no hace falta** (0 overrides aplicados).
- `src/data/summaries/spells/{e,f,g,h,i,j,k}.json` (142 resúmenes, todos `draft`).
- `src/data/glossary/spells/{e,f,g,h,i,j,k}.es.json` (142 claves `spells:<id>`, `verified:false`, `origin:draft`, `kind:entry`).
- `tests/data/spells/e-k.test.ts` (18 tests).
- `src/data/spells/index.ts` lo regeneró `data:parse` (lista estática de shards; compartido, contiene los shards de todos los lotes presentes en disco en ese momento).

## Comandos ejecutados

```
npm run data:import -- --category spells:e-k    # 142 páginas (131 descargadas, 11 de caché), 1 req/s
npm run data:parse  -- --category spells:e-k    # 142 entradas en 7 ficheros; 0 excluidas; 0 needsReview
```

(La primera tentativa de import falló al instante por `tsx` no encontrado en el PATH de npm —`node_modules/.bin` estaba en transición por otro agente—; se reintentó y funcionó. No se descargó nada en el intento fallido.)

## Recuentos

| Dato | Valor |
|---|---|
| Esperado (`spell-batches.json` e `index` D0) | 142 |
| Semillas / páginas importadas | 142 / 142 |
| Entradas escritas | 142 (e 22, f 36, g 23, h 29, i 28, j 1, k 3) |
| Discrepancia con el recuento esperado | **ninguna** |
| Páginas excluidas por libro | 0 |
| `needsReview` | 0 |
| `levels` vacío (R102) | 0 |
| Conjuros con varias etiquetas `Source` | 0 (el contador no aparece en el informe) |
| Overrides aplicados | 0 |
| Secciones de otro libro excluidas dentro de páginas (`Mythic ...`) | 54 |
| Ids duplicados | 0 |
| Claves de `levels` observadas | bard 39, cleric 45, druid 31, paladin 4, ranger 6, sorcerer 92, wizard 92 (todas dentro de `CRB_CLASS_IDS`; ninguna de dominio) |
| Escuelas | transmutation 36, evocation 25, necromancy 19, abjuration 17, enchantment 16, conjuration 13, illusion 10, divination 6 |

### Clases de otro libro descartadas (R97), total 766 apariciones

adept 5, alchemist 23, antipaladin 8, arcanist 92, bloodrager 24, hunter 25, inquisitor 35, investigator 23, magus 31, medium 26, mesmerist 35, occultist 58, oracle 45, psychic 71, redmantisassassin 22, shaman 43, skald 39, spiritualist 31, summoner 26, "summoner (unchained)" 27, warpriest 33, witch 44. **Todas están en `nonCrbClassIds`; ningún token desconocido** (no hubo que parar).

### Campos ausentes y `kind: "other"` (R96)

- Campo ausente en la fuente (decisión D0: `raw: ""` + `other`): `savingThrow` 17, `spellResistance` 16 (conjuros personales).
- `kind other`: castingTime 3, duration 30, range 13, savingThrow 21, spellResistance 7, targeting 3 (77 en total). Los valores (con su `raw`) están listados en el informe `reports/import-2026-10-16.md`, sección «parse: spells:e-k». Ejemplos: `fabricate` castingTime `see text`; `flame-blade`/`ironwood` range `0 ft.`; `find-the-path`/`foresight`/`freedom-of-movement`/`invisibility` range `personal or touch`; `hold-*` duración `1 round/level (D); see text`; `feather-fall` salvación `Will negates (harmless) or Will negates (object)`; `gate` duración `instantaneous or concentration (up to 1 round/level); see text`.

## Discrepancias con goldens

**Ninguna aplicable**: no hay goldens de `design.md` §5 en el rango `e-k` (`goldenIdsInRange(goldens, "e", "k")` = `[]`, lo comprueba el test). Como comprobación adicional de cordura, `fireball` coincide con lo esperado (sorcerer/wizard 3, long, Reflex half, material).

## Verificación

| Comando | Resultado |
|---|---|
| `npx vitest run tests/data/spells/e-k.test.ts` | 18 tests en verde |
| `npx vitest run tests/data tests/scripts` | 49 ficheros / 610 tests en verde (en ese momento, con datos de otros lotes en disco) |
| `npx tsc --noEmit` | sin errores |
| `eslint` (e-k.test.ts) y `prettier --check` (mis tests y JSON) | limpio |
| `loadDataset(["spells"])` + `runIntegrity({ categories: ["spells"] })` | 0 hallazgos (incluye `schema`, `spells.structured-field`, `spells.level-key`, `summaries.*`, `glossary.missing`) |

## Capa ES (TDn.3): cómo se hizo

- Resúmenes redactados a mano **solo a partir del `textEn`** de cada conjuro (no de memoria de reglas) y comprobados con un script de validación: 142/142 con `summaryEs` de 1-300 caracteres y 0 incumplimientos de `checkNumericFidelity` (R30). Las cifras solo se usan si aparecen en el `textEn` (p. ej. «24 horas» de `energy-drain` está en el texto como «Twenty-four hours», por lo que se escribió «veinticuatro horas»). Algunos resúmenes de conjuros muy largos o con tablas (`earthquake`, `forbiddance`, `gate`, `glyph-of-warding`, `guards-and-wards`, `hallow`, `heat-metal`, `helping-hand`, `knock`...) describen solo el núcleo del efecto y remiten a la tabla («según la tabla»); no se añadieron reglas.
- Los textos de los lotes son borradores (`status: draft`), sin revisión humana.
- Glosario: el nombre en español de cada conjuro es una **traducción propuesta** (borrador, `origin: draft`, `verified: false`); no se contrastó con ninguna edición oficial en español. Las referencias entre resúmenes (p. ej. «retener persona», «mantener portal», «cerradura arcana») usan esos mismos nombres propuestos. `knock` se dejó como «Apertura» y se menciona como `knock` en el resumen de `hold-portal` (nombre en español sin contrastar).

## Observaciones y preguntas abiertas

1. **Textos que remiten a otros conjuros («como se indicó arriba»)**: `hold-person-mass` («except as noted above»), `heal-mass` («except as noted above»), `globe-of-invulnerability` y otros conjuros «mass»/«greater» dicen «functions like X» y su `textEn` es corto porque la fuente así lo trae; los resúmenes lo reflejan sin completar lo que la fuente no dice.
2. **`textEn` con tablas Markdown**: `eyebite`, `giant-vermin`, `heat-metal`, `helping-hand`, `holy-word`, `imbue-with-spell-ability` traen la tabla como Markdown dentro del texto (lo produce `nodesToMarkdown`). Los resúmenes se limitan a decir «según la tabla» cuando la cifra depende de ella (`holy-word`, `eyebite` sí resumen los efectos por DG de la tabla, que están en el texto).
3. **Duración `kind: other`** abundante (30 de 142): `1 round/level (D); see text`, `... or until discharged`, `permanent until discharged (D)`, etc. Si el motor de reglas necesita estructurarlas, requeriría ampliar `DURATION_KINDS`/el clasificador (decisión del spec, no de este lote).
4. **Rango `0 ft.`** (`flame-blade`, `ironwood`) queda `other` porque `fixedFt` exige entero positivo. Posible mejora del clasificador en una pasada futura.
5. **Campo ausente** (`savingThrow`/`spellResistance` en 17/16 conjuros personales): sigue pendiente la decisión humana de D0 (`none`/`no` o campo opcional).
6. La aparente edición de la fuente en algunos textos (por ejemplo `forceful-hand` habla de «CMB» con Fuerza 27 y `grasping-hand` de Fuerza 31) es lo que trae AoN; no se tocó.
7. El informe `reports/import-2026-10-16.md` acumula las secciones de todos los lotes en paralelo; la sección de este lote es «import: spells:e-k» / «parse: spells:e-k».

## Trazabilidad R -> test (`tests/data/spells/e-k.test.ts`)

| R | Test |
|---|---|
| R20 | «recuento ... igual al congelado», «todos pertenecen al CRB y traen la fuente con página», «Fireball» |
| R26 | «el recuento es igual al congelado en la procedencia del lote» (142 = páginas = entradas) |
| R27 | «todos pertenecen al CRB» (`book: CRB`, `sourceRef` del CRB) |
| R91, R92 | «las claves de levels están dentro de CRB_CLASS_IDS y los niveles son 0-9» |
| R96 | «cada campo estructurado coincide con classifySpellFields(raw)», «la regla de integridad de conjuros no halla nada en el rango» |
| R99 | «coincide con el recuento del reparto de lotes», «la procedencia es del lote, sin recuento total» |
| R101 | «la escuela es una de las del catálogo» (+ `SpellSchema`) |
| R28, R29 | «hay un resumen por conjuro, sin huérfanos ni duplicados» |
| R30 | «los resúmenes son borradores y sus cifras salen del textEn» |
| R31, R32, R33 | «cada conjuro tiene su clave de glosario, todo borrador no verificado», «las reglas de resúmenes y glosario no informan nada de este rango» |
| R45, R46, R93, R94, R97, R102 | cubiertos en D0 (`tests/scripts/srd/parse-spells.test.ts`, `spell-batches.test.ts`); en este lote se verificaron sobre datos reales vía el informe del parse: 0 páginas excluidas, 0 `needsReview`, 0 `levels` vacíos, 22 clases descartadas todas del catálogo |
| goldens del rango | «ningún golden de design.md §5 cae en el rango e-k» |
