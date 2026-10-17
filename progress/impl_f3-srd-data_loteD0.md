# Implementación - f3-srd-data, Lote D0 (fundamentos de conjuros)

Estado: **implementado** (TD.1..TD.5 marcadas `[x]` en `specs/f3-srd-data/tasks.md`). Pendiente de reviewer.
No se tocó `feature-list.json`, ni `package.json`, ni `lib/**`/`cli.ts`/`categories.ts`; no se ejecutó `npm ci/install`, `./init.sh` ni `data:glossary`. No se implementó ningún D1-D5.

## Hallazgo principal: el universo CRB NO sale del índice de conjuros

El índice completo de AoN (`https://www.aonprd.com/Spells.aspx?Class=All`, 3.039 conjuros de todos los libros) **no trae el libro de cada conjuro** (solo nombre, marcas `R/M/Y/F/T` y descripción corta). R93 ("índice filtrado por CRB") se resuelve con la página de fuente de AoN
`https://www.aonprd.com/SourceDisplay.aspx?FixedSource=PRPG Core Rulebook`, que lista por tipo todo lo del CRB. Su sección «Spells [623]» declara 623 y trae 623 enlaces únicos; los 623 están en el índice completo.

- **Recuento total esperado de conjuros CRB: 623** (congelado como `expectedCount` en `src/data/provenance/spells/index.json`). Contrastable con el capítulo 10 impreso (Q10).
- Esa misma página de fuente sirve a otros lotes (dotes: 176, objetos mágicos, equipo...), con los mismos encabezados `Feats [176]`, etc.

## Reparto de rangos D1-D4 (reajustado con los recuentos reales)

Recuento CRB por inicial del id: a30 b28 c59 d55 e22 f36 g23 h29 i28 j1 k3 l10 m45 n3 o7 p47 q1 r33 s104 t24 u6 v5 w22 z2 (=623). Partición contigua que minimiza el lote mayor:

| Lote | Rango | Conjuros | Shards (`src/data/spells/`) |
|---|---|---|---|
| D1 | `a-d` | 172 | `a.json b.json c.json d.json` |
| D2 | `e-k` | 142 | `e.json f.json g.json h.json i.json j.json k.json` |
| D3 | `l-r` | 146 | `l.json m.json n.json o.json p.json q.json r.json` |
| D4 | `s-z` | 163 | `s.json t.json u.json v.json w.json z.json` (no hay `x`/`y`) |

(El reparto inicial del spec era a-c/d-h/i-r/s-z con máximo 178; este tiene máximo 172.) Está en `scripts/srd/config/spell-batches.json` (`batches` + `expectedCountByBatch`), con test de rangos contiguos, disjuntos y que cubren a-z.

## Contrato de lote para D1-D4 (TD.5)

Cada Dn con su `<rango>` (`a-d`, `e-k`, `l-r`, `s-z`):

```
npm run data:import -- --category spells:<rango>   # descarga SUS páginas (de seeds.json), ~1 req/s; 142-172 páginas
npm run data:parse  -- --category spells:<rango>   # offline; usa la procedencia del lote + la de `index`
```

- **Siempre con subconjunto.** No ejecutar `data:import --category spells` (sin subconjunto): descargaría todo y escribiría `provenance/spells.json`, que duplica páginas de los lotes (R98 lo rechaza).
- Semillas: `scripts/srd/config/seeds.json` -> `spells.subsets.index` (índice completo + página de fuente CRB; ya importado) y `spells.subsets.<rango>` (una URL por conjuro del filtro CRB de ese rango; generadas por `npx tsx scripts/srd/parsers/spells-seeds.ts [--write]`, offline desde la caché). El import del lote congela `expectedCountByBatch[<rango>]` en `provenance/spells/<rango>.json` (la `discover` falla si las semillas no cuadran con el índice).
- Escribe cada lote SOLO: `src/data/spells/<iniciales>.json`, `src/data/provenance/spells/<rango>.json`, `src/data/overrides/spells/<rango>.json` (si hace falta), `src/data/summaries/spells/<inicial>.json`, `src/data/glossary/spells/<inicial>.es.json`, `tests/data/spells/<rango>.test.ts`. Los `index.ts` los regenera `data:parse`.
- Qué comprueba `parse` (fail-closed): las páginas del lote son EXACTAMENTE el filtro CRB de su rango (faltan/sobran = error); un encabezado fuera de `["Casting","Effect","Description"]` falla con página y encabezado (R45); token de clase desconocido en `Level` falla con página y token (R97); campos de cabecera desconocidos o repetidos fallan; el esquema se valida antes de escribir.
- **Si un lote halla un token de clase desconocido: NO editar `spell-class-ids.json`**; anotarlo y parar (lo cierra el leader/Z, para no tener cuatro agentes editando el mismo fichero).
- Informe de import (`reports/import-<fecha>.md`): contadores `clases de otro libro descartadas` (+ una por clase), `secciones de otro libro excluidas`, `conjuros con levels vacío` (R102), `conjuros con varias etiquetas Source`, `campo ausente: savingThrow/spellResistance`, `kind other: <campo>` (R96) y una nota por cada `kind other` con su `raw`.
- Test de datos reales de cada lote: reutilizar `tests/data/spells/golden.ts` (`loadSpellGoldens`, `goldenIdsInRange(goldens, from, to)`, `compareSpellToGolden(spell, golden)`). Goldens por rango: a-d `burning-hands`, `cure-light-wounds`; l-r `magic-missile`; s-z `wish`; e-k ninguno. Para verificar un lote: `loadDataset(ROOT, ["spells"])` + `runIntegrity(..., { categories: ["spells"] })` (esperar solo `summaries.*`/`glossary.*` hasta TDn.3). Plantilla de recuento: `provenance/spells/<rango>.json` -> `expectedCountByBatch[<rango>]`.
- Para completar R26/R99 en Z: `expectedCount` total vive en `provenance/spells/index.json` (623) y la suma de `expectedCountByBatch` de los 4 lotes debe dar 623 (los lotes NO llevan `expectedCount`).

## Qué se hizo

| Task | Entrega |
|---|---|
| TD.1 | `schema/spell.ts` (real; `CRB_CLASS_IDS`, `SPELL_SCHOOLS`, sub-schemas por campo, coherencia `fixedFt`/`amount+unit+perLevel`), `schema/spell-list.ts` (`CASTER_CLASS_IDS`; rechaza `sorcerer`/`wizard`/otras claves), 14 fixtures HTML reales + 3 recortadas con `README.md` (`tests/fixtures/srd-html/spells/`), `config/spell-class-ids.json` cerrado |
| TD.2 | `src/data/spells/fields.ts` (`classifySpellFields` + clasificadores por campo, `targetingKindFromLabel`, `unrecognizedComponentTokens`), `query.ts` (`spellsForClass`) |
| TD.3 | `scripts/srd/parsers/spells.ts` (`parse`, `discover`, `parseSpellPage`, `extractCrbSpells`, `extractIndexDescriptions`), `spells-config.ts` (catálogos + `parseLevelLine`), `spells-seeds.ts` (siembra por lote), `config/spell-batches.json`, claves `spells` de `seeds.json` y `section-allowlist.json` |
| TD.4 | `integrity/spell-lists.ts`: `spell-lists.unknown-spell` (R21), `spell-lists.level-mismatch` y `spell-lists.missing-from-list` (R22), `spells.level-key` (R92), `spells.structured-field` (R96); R95 por construcción (solo se exigen listas a las clases que la tienen) |
| TD.5 | `tests/data/fixtures/spell-golden.json`, `tests/data/spells/golden.ts` (+ test), este contrato |

Fixtures de la línea `Level`: las salidas reales (clases de otros libros, `redmantisassassin`, `summoner (unchained)`) están en las 14 páginas; `sor/wiz`, `sorcerer/wizard`, token desconocido y línea vacía se prueban con variantes sintéticas de la página de Magic Missile y con `parseLevelLine`.

Descargas reales (solo por el pipeline, 1 req/s, User-Agent identificable): índice completo, página de fuente CRB, 54 páginas de conjuros de muestra (52 CRB + 2 APG para el caso "otro libro") y la lista de clase de clérigo, más el listado `Sources.aspx` de exploración. Todo está en `.cache/` (fuera de git); D1-D4 reutilizan las que coincidan por URL. Se borraron `provenance/spells/fixtures.json` y el subconjunto temporal de las semillas: queda solo `provenance/spells/index.json` (2 páginas, `expectedCount: 623`).

## Observaciones sobre la fuente (importan a D1-D4)

- `Level` solo trae clases; **no hay claves de dominio** (Burning Hands no lista `fire`/`fire-domain`) y `sorcerer`/`wizard` vienen separados (no aparece `sor/wiz`; la abreviatura queda en el catálogo por R94 y se prueba sintéticamente). La pertenencia a dominio queda en `domains` (R23/Z).
- `nonCrbClassIds` (23, en minúsculas, como llegan): se cerró con el menú de clases de AoN (`Spells.aspx?Class=...`) y con lo visto en las 54 páginas: `adept alchemist antipaladin arcanist bloodrager hunter inquisitor investigator magus medium mesmerist occultist oracle psychic redmantisassassin sahirafiyun shaman skald spiritualist summoner "summoner (unchained)" warpriest witch`. Sin muestra de las 623 páginas puede aparecer un token nuevo; el parseo lo detendrá nombrándolo.
- Una página de AoN puede traer varias entradas (cada una con su `<h1>`: p. ej. `Summon Monster 1` incluye 2..9, `Animate Dead` incluye `Animate Dead, Lesser`) y spans vacíos antes del contenido (`Charm Person`, `Entangle`). El parser elige la entrada cuyo `<h1>` coincide con `ItemName`.
- Las secciones de otros libros son `<h2>` («Mythic ...») con su propio `Source`; se excluyen por su etiqueta de libro y se cuentan. Cualquier otro `<h2>` falla (R45).
- Ninguna de las 52 páginas CRB de muestra tiene varias etiquetas en la línea `Source` principal: el caso `needsReview` se prueba con una variante sintética (documentado). Los lotes informarán cuántos hay realmente (`conjuros con varias etiquetas Source`).
- `shortDescriptionEn`: las páginas de conjuro de AoN **no** traen la línea en cursiva; se toma del índice completo (descripción tras el nombre). Los 623 CRB la tienen en el índice.
- Campos ausentes en la fuente (conjuros personales: Commune, Shapechange, Time Stop, Contingency sin `Saving Throw`/`Spell Resistance`).

## Decisiones tomadas dentro del spec (revisar)

1. **Campo ausente = `raw: ""` y `kind`/`applies: "other"`** (no se inventa `none`/`no`); se cuenta aparte (`campo ausente: ...`) y NO en `kind other`. Alternativa pendiente de decisión humana: `none`/`no` para personales, o campo opcional en el schema.
2. `; see text` / `, see text` final no cambia la clasificación de salvación y RC (`yes (harmless); see text` -> yes+harmless, como pide el golden de Cure Light Wounds); el `raw` conserva el texto. `Will half (harmless) or Will half; see text` queda `other`.
3. `targeting.kind` sale de la **etiqueta** de la página (`Target`/`Targets` -> target, `Area`, `Effect`); etiquetas combinadas (`Target or Area`, `Target, Effect, or Area`) -> `other`. R96 sobre `targeting` solo puede comprobar que `raw` coincide (el `kind` no es derivable del texto).
4. `components`: el paréntesis describe el primer símbolo del grupo (`M/DF (polvo)` -> `details.material`). Componentes no reconocidos -> `needsReview` (el schema no tiene `kind` para componentes).
5. R92 parte de dominios: la regla ya admite como clave válida el `id` de cualquier entrada de `data.entries.domains`; el test de integración real sigue siendo de TZ.1.
6. Semillas por lote materializadas en `seeds.json` (el parser es puro y la CLI solo descarga URLs de las semillas): `spells-seeds.ts` las regenera y `parse` las comprueba contra la página de fuente CRB (que viaja en la procedencia `index`).
7. Duración `concentration, up to N unit/level` -> `kind: concentration` (sin amount); `concentration + 1 round/level` -> `other`.

## Discrepancias con goldens

**Ninguna.** Cure Light Wounds, Magic Missile, Burning Hands y Wish coinciden con `design.md` §5 sobre las páginas reales (comprobado en `parse-spells.test.ts`, "goldens de conjuros sobre las fixtures"). Matiz: la RC de Cure Light Wounds es `yes (harmless); see text` en la fuente; el golden compara `applies: yes, harmless: true`. La pertenencia de Burning Hands al dominio de Fuego no se puede comprobar aquí (Lote A/Z); el golden la deja como `domainNames: ["Fire"]` sin inventar un id.

## Pendiente / para otros lotes

- **D5**: `parsers/spell-lists.ts` (el design §11 lo asigna a D0, pero TD.3 y TD.6 lo sitúan en la importación de D5; no se escribió). Hay una fixture recortada de la página de lista de clase (`class-list-cleric.html`): las listas de clase de AoN **incluyen conjuros de otros libros**, así que habrá que filtrar por el universo CRB.
- **Crosscheck (R56)**: no se rellenó `seeds.crosscheck.spells`: las URL de d20pfsrd van por inicial (`.../all-spells/a/acid-arrow/`) y la plantilla solo admite `{id}`, `{slug}`, `{name}`. Haría falta un marcador `{initial}` en `lib/sample.ts` (fichero compartido del Lote 0).
- **Z (TZ.1)**: leer `ctx.config.spellBatches` en `counts.ts` para R99 (lotes sin hueco/solape, suma de `expectedCountByBatch` = `provenance/spells/index.json.expectedCount` = 623); las funciones `parseSpellBatches`/`parseSpellClassCatalog` viven en `scripts/` (no importables desde `src/data`).
- Si se vuelve a ejecutar `spells-seeds.ts --write`, reescribe `seeds.json` entero con formato canónico (2 espacios).

## Verificación

| Comando | Resultado |
|---|---|
| `npx vitest run tests/data tests/scripts tests/setup` | 39 ficheros / 454 tests en verde |
| `node node_modules/typescript/bin/tsc --noEmit` | sin errores |
| `eslint` + `prettier` sobre mis ficheros | limpio |
| Parser sobre las 52 páginas CRB de muestra (script puntual, no committeado) | 52/52 parsean, superan `SpellSchema`, 0 `needsReview`; 2/2 de APG excluidas |
| `npm run data:import -- --category spells:index` (desde caché) | `expectedCount: 623`, `discover` OK |

## Trazabilidad R -> test (bajo `tests/`)

| R | Test |
|---|---|
| R2, R3 | `data/schema/spell.test.ts` |
| R20 | `scripts/srd/parse-spells.test.ts` (campos, goldens sobre fixtures reales), `data/spells/golden.test.ts` |
| R21, R22 | `data/integrity/spell-lists.test.ts` (id inexistente, inconsistencia en ambos sentidos, verde); `data/schema/spell.test.ts` (rechazo de `sorcerer`/`wizard`) |
| R45 | `scripts/srd/parse-spells.test.ts` (h2/h3/h4 y etiqueta desconocidos) |
| R46 | `scripts/srd/parse-spells.test.ts` (Ant Haul excluido y listado; Source no CRB) |
| R91, R101 | `data/schema/spell.test.ts` |
| R92 | `data/integrity/spell-lists.test.ts` (alchemist falla; sorcerer y dominio existente pasan; dominio inexistente falla) |
| R93 | `scripts/srd/parse-spells.test.ts` (filtro CRB, faltan/sobran páginas, `discover`), `scripts/srd/spell-batches.test.ts` (`planSpellSeeds`, semillas reales) |
| R94, R97 | `scripts/srd/parse-spells.test.ts`, `scripts/srd/spell-batches.test.ts` (`parseLevelLine`, catálogo) |
| R95 | `data/integrity/spell-lists.test.ts` (sorcerer 3 sin lista) |
| R96 | `data/spells/fields.test.ts` (tabla), `data/integrity/spell-lists.test.ts` (campo alterado, siete campos) |
| R99 | `scripts/srd/spell-batches.test.ts` (rangos, huecos, solapes, suma, semillas); la comprobación de recuento real queda en TZ.1 |
| R100 | `data/spells/query.test.ts` |
| R102 | `scripts/srd/parse-spells.test.ts` (levels vacío -> needsReview) |
| R44 (parte spells) | `scripts/srd/parse-spells.test.ts` (determinismo, orden de páginas) |

## Correcciones posteriores

2026-10-17, a petición del leader tras el bloqueo de D3 (l-r), en `scripts/srd/parsers/spells.ts` (cambio aditivo, nada más):

1. **`Target/Effect` (Mislead).** `TARGETING_LABEL` admite ahora `\s*\/\s*` como separador (`Target/Effect`, `Target/Area`...). `targetingKindFromLabel` ya devolvía `other` para etiquetas combinadas, así que Mislead queda con `targeting: [{ kind: "other", raw: "you/one illusory double" }]`. Una etiqueta con barra y palabra desconocida sigue fallando.
2. **`<h2>` sin `Source` tras una sección excluida (Reincarnate).** En el bucle de subsecciones `<h2>`, un `<h2>` sin ninguna etiqueta `Source` que sigue a una sección ya excluida por libro hereda su exclusión (y se cuenta en `secciones de otro libro excluidas`); la herencia se encadena entre hermanos y se corta en cuanto aparece un `<h2>` no excluido. Un `<h2>` sin `Source` que NO sigue a una excluida sigue fallando con `SectionError` (R45).
   - Efecto colateral buscado: un `<h2>` sin Source añadido tras la sección «Mythic» de una página ya no falla (hereda la exclusión). El test existente de R45 «h2 sin libro fuera de la lista» se movió a la fixture de Commune (sin `<h2>`), donde el h2 queda realmente suelto.
3. Fixtures nuevas (copia byte a byte desde la caché): `mislead.html`, `reincarnate.html` (documentadas en el README de fixtures). Tests nuevos en `tests/scripts/srd/parse-spells.test.ts` («correcciones posteriores»): Mislead real, `Target/Area` sintético y `Target/Weirdness` que falla, Reincarnate real (3 secciones excluidas, `textEn` sin «Core/Other Incarnations»), h2 excluido + hermanos sin Source (sintético), y los casos sueltos que siguen fallando (sin sección previa, tras sección CRB, tras h2 CRB intercalado).

Comprobación de que no altera nada más: re-parseo en memoria desde la caché de los lotes a-d y e-k con el parser nuevo da, para `src/data/spells/{a..k}.json`, exactamente el mismo contenido que hay en disco (IDÉNTICO fichero a fichero, 0 `needsReview`, 0 excluidas), y los `sha256` de esos 11 ficheros no cambiaron (no se reescribieron). Con el parser nuevo el lote l-r parsea sus 146 páginas (0 `needsReview`, 0 excluidas). `npx vitest run tests/data tests/scripts tests/setup`: 50 ficheros / 618 tests en verde; `tsc --noEmit`, eslint y prettier limpios.
