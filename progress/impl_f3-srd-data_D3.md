# Implementación - f3-srd-data, Lote D3 (conjuros l-r)

Estado: **implementado** (TD3.1..TD3.4 hechas; anotadas en la línea de estado de D3 bajo la plantilla compartida TDn de `specs/f3-srd-data/tasks.md`). Pendiente de reviewer.
No se tocó `feature-list.json`, `package.json`, configs, `scripts/**`, parsers ni ficheros de otros lotes. No se ejecutó `npm ci/install`, `./init.sh` ni `data:glossary`. No se editó `spell-class-ids.json`.

## Historia (para el leader)

1. Primer intento: el import bajó las 146 páginas y el parse falló cerrado por dos huecos del parser de D0 (informado como `blocked`).
2. El leader corrigió el parser. Reanudado: `data:parse --category spells:l-r` desde caché (sin descargar) sin errores.

Los dos casos y su resultado:

| Página | Problema original | Resultado tras el arreglo |
|---|---|---|
| Mislead | cabecera `Target/Effect` desconocida | importado; `targeting = [{kind: "other", raw: "you/one illusory double"}]` (nota `kind other: mislead targeting`) |
| Reincarnate | `<h2>` sin `Source` («Core Incarnations», «Other Incarnations») tras la sección excluida «Reincarnation on Golarion» (Inner Sea Races) | importado; sourceRef CRB; su `textEn` no contiene el contenido de la sección de otro libro (comprobado en test) |

## Recuentos

| Dato | Valor |
|---|---|
| Esperado (`expectedCountByBatch["l-r"]`, congelado en `provenance/spells/l-r.json`) | **146** |
| Páginas importadas | 146 (descargadas en el primer intento; el re-import y el parse fueron desde caché) |
| Entradas escritas | 146 = 10 (l) + 45 (m) + 3 (n) + 7 (o) + 47 (p) + 1 (q) + 33 (r) |
| Discrepancia con el esperado | **ninguna** |
| Páginas de otro libro excluidas (R46) | 0 |
| `needsReview` | 0 |
| `levels` vacíos (R102) | 0 |
| Conjuros con varias etiquetas `Source` | 0 |
| Overrides necesarios | 0 (no hay `overrides/spells/l-r.json`) |
| Secciones de otro libro excluidas (`Mythic ...`, «Reincarnation on Golarion»...) | 44 |
| Campo ausente `savingThrow` / `spellResistance` | 12 / 12 (mismos 12, personales: legend-lore, longstrider, mages-lucubration, meld-into-stone, mirror-image, mnemonic-enhancer, moment-of-prescience, plant-shape-i, plant-shape-ii, plant-shape-iii, read-magic, righteous-might) |
| Claves de `levels` presentes | sorcerer 104, wizard 106, cleric 51, bard 36, druid 33, paladin 18, ranger 14 (sin barbarian/fighter/monk/rogue en el rango) |
| Niveles | 0 a 9 (0: 37, 1: 53, 2: 48, 3: 60, 4: 35, 5: 39, 6: 28, 7: 27, 8: 23, 9: 12) |

Comandos (siempre con subconjunto; `npm run` no halló `tsx`, se usó `node node_modules/tsx/dist/cli.mjs scripts/srd/cli.ts ...`): `import --category spells:l-r` y `parse --category spells:l-r` (dos veces; la segunda refresca `spells/index.ts` con los resúmenes).

## Clases descartadas (R97)

881 apariciones de clases de otro libro descartadas, todas dentro del catálogo `nonCrbClassIds` (ningún token desconocido): adept 20, alchemist 21, antipaladin 9, arcanist 104, bloodrager 22, hunter 31, inquisitor 32, investigator 21, magus 25, medium 39, mesmerist 44, occultist 53, oracle 51, psychic 80, redmantisassassin 18, sahirafiyun 1, shaman 46, skald 36, spiritualist 52, summoner 45, summoner (unchained) 43, warpriest 44, witch 44.

## kind: "other" (R96) - 75 notas, 0 fallos

Contadores: castingTime 4, duration 36, range 11, savingThrow 11, spellResistance 7, targeting 6 (detalle con `raw` en `reports/import-2026-10-16.md`, sección `## parse: spells:l-r`; `reports/` está fuera de git). Todo es la válvula prevista, el `raw` es literal:

- Duraciones compuestas, con «see text» o «concentration + N»: legend-lore, lullaby, mages-faithful-hound, magic-jar, mislead, rage, rainbow-pattern, prying-eyes, etc.
- Salvación/RC compuestas: meteor-swarm «none or Reflex half, see text», planar-binding(-greater/-lesser) RC «no and yes; see text», pyrotechnics «yes or no; see text», quench, prismatic-*.
- Targeting: limited-wish, miracle, plant-growth, prestidigitation «see text»; mislead «you/one illusory double»; quench «one 20-ft. cube/level (S) or one fire-based magic item».
- Rangos simples que hoy caen en `other` (misma observación que D1): `0 ft.` (minor-creation, phantom-steed, produce-flame), `1 mile` (prying-eyes, prying-eyes-greater), `up to 10 ft./level` (repulsion), `personal or close (...)` (levitate); y «see text» (limited-wish, miracle, permanency, plant-growth).
- `castingTime` other: legend-lore «see text», modify-memory «1 round; see text», move-earth «see text», regenerate «3 full rounds».

## Goldens (design.md §5) en el rango

`magic-missile` se compara con `compareSpellToGolden` sobre los datos reales: **sin diferencias**. No hay discrepancias que anotar.

## Capa ES (TD3.3)

- `src/data/summaries/spells/{l,m,n,o,p,q,r}.json`: 146 resúmenes, todos `status: draft`, redactados solo desde el `textEn` de cada conjuro, sin reglas ni cifras ajenas. Antes de escribir los ficheros se comprobó con `checkNumericFidelity` (R30) y la longitud (<= 300) con un script fuera del repo; la regla `summaries.*` del test las vuelve a comprobar. Evité guiones entre números (`51-100` solo donde la fuente lo trae) por cómo tokeniza R30.
- Las tablas largas (permanency, reincarnate, polymorph any object, nightmare, prismatic wall/spray) y los conjuros muy largos (magic circle against evil, planar binding lesser, magic jar...) están resumidos de forma parcial por el tope de 300 caracteres; el resumen no sustituye al `textEn`.
- Nombres de conjuros referenciados en los resúmenes: traducción mía de trabajo (p. ej. «muro prismático», «colmillo mágico», «aliado de otro plano menor»); pendiente de contraste con el manual de Devir (Q2). Los términos de juego (pies, asalto, DG, RD, RC, CD) son criterio mío, a revisar con el glosario de términos.
- `src/data/glossary/spells/{l,m,n,o,p,q,r}.es.json`: 146 claves `spells:<id>`, `es` = nombre inglés como marcador (igual que D1; no inventé traducciones), `verified:false`, `origin:draft`, `kind:entry`, con la misma `note` (Q2).

## Verificación

| Comando | Resultado |
|---|---|
| `vitest run tests/data/spells` | 7 ficheros / 144 tests en verde (`l-r.test.ts`: 10 tests) |
| `node node_modules/typescript/bin/tsc --noEmit` | sin errores |
| `eslint tests/data/spells/l-r.test.ts`; `prettier --check` de mis ficheros | limpio |
| `runIntegrity(..., { categories: ["spells"] })` filtrado a ids l-r (sin `glossary.stale`) | 0 hallazgos (datos, `summaries.*`, `glossary.*`) |

## Trazabilidad R -> test (`tests/data/spells/l-r.test.ts`)

| R | Test |
|---|---|
| R20, R101 | "cada conjuro supera SpellSchema, es del CRB y tiene escuela del catálogo" |
| R20 (goldens) | "los goldens de design.md §5 cuya inicial cae en l-r coinciden" (magic-missile) |
| R26, R99 | "el recuento es el congelado en la procedencia del lote" (146, ids únicos) y "el recuento por inicial coincide con el índice de la fuente" |
| R91 | "las claves de levels son clases del CRB y los niveles van de 0 a 9" |
| R96 | "los campos estructurados coinciden con classifySpellFields(raw)" y la regla de integridad completa |
| R92 | misma regla de integridad (`spells.level-key`) |
| R45, R46 | "Mislead ... y Reincarnate ... se importan" (datos reales) + parser (D0) |
| R28, R29, R30, R31, R33 | "la integridad (datos y capa ES) no halla problemas en el rango" + "cada conjuro tiene resumen y glosario en borrador, sin verificar" |
| R27, R93, R94, R97, R102 | cubiertos por el parser (D0: `parse-spells.test.ts`, `spell-batches.test.ts`) y por el import/parse real (0 excluidas, 0 `needsReview`, ningún token desconocido; el parse falla cerrado ante cualquiera de ellos) |

## Ficheros del lote

`src/data/spells/{l,m,n,o,p,q,r}.json`, `src/data/provenance/spells/l-r.json`, `src/data/summaries/spells/{l..r}.json`, `src/data/glossary/spells/{l..r}.es.json`, `tests/data/spells/l-r.test.ts`, esta nota y la línea de estado en `specs/f3-srd-data/tasks.md`. `src/data/spells/index.ts` lo regenera `data:parse` (compartido).

## Preguntas abiertas / para el leader o Z

1. Ampliar `classifyRange` (D0) para `0 ft.`, `1 mile`, `up to N ft./level` y similares (hoy `kind: other`); sin cambio el dato sigue siendo fiel (`raw` intacto). Misma pregunta que D1.
2. 12 conjuros del rango tienen `savingThrow`/`spellResistance` ausentes en la fuente (`raw: ""`, `kind/applies: other`, decisión 1 de D0); sigue pendiente la decisión humana (`none`/`no` o campo opcional).
3. `Target/Effect` (Mislead) queda como `targeting.kind: other` (la etiqueta combinada no es derivable a un solo `kind`), igual que `Target or Area`.
4. Pertenencia a dominios: no sale de la línea `Level`; queda para Z/A (`domains`).
5. Nombres en español de conjuros (glosario): todo marcador en inglés, pendiente de Q2.
6. `node_modules` se quedó incompleto dos veces mientras corría esta sesión (otro agente); no tiene que ver con los datos, pero convendría serializar los `npm ci/install` frente a los lotes.
