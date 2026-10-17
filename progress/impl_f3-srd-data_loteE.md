# Implementación - f3-srd-data, Lote E (Equipo)

Estado: **implementado** (TE.1..TE.5 marcadas `[x]` en `specs/f3-srd-data/tasks.md`). Pendiente de reviewer.
No se tocó `feature-list.json`, `package.json`, `lib/**`, `cli.ts`, `categories.ts` ni ficheros de otros lotes; no se ejecutó `npm ci/install`, `./init.sh` ni `data:glossary`. De `seeds.json`, `section-allowlist.json` y `slug-aliases.json` solo se tocaron mis claves (`weapons`, `armor`, `shields`, `gear`).

## Recuentos reales vs esperados

El universo sale de la página de fuente de AoN `SourceDisplay.aspx?FixedSource=PRPG Core Rulebook` (secciones `Equipment (Weapons) [88]`, `Equipment (Armor) [21]`, `Equipment (Misc.) [161]`), clasificado con los listados de AoN por categoría (`EquipmentArmor.aspx?Category=Light|Medium|Heavy|Shield|Extra`, `EquipmentMisc.aspx?Category=...`). Nada de memoria.

| Categoría | Declarado por la fuente | Importado (= `expectedCount` congelado) |
|---|---|---|
| weapons | 88 enlaces | **87** (ver discrepancia 1) |
| armor | 21 = armaduras + escudos + complementos | **12** (4 ligeras, 4 intermedias, 4 pesadas) |
| shields | (dentro de las 21) | **6** |
| gear | 161 (Misc.) + 3 complementos de armadura | **164** |

Armor [21] = 12 armaduras + 6 escudos + 3 complementos (Armor spikes, Locked gauntlet, Shield spikes); todos acaban en un listado y solo uno. Misc. [161] = 161 nombres distintos, cada uno en exactamente un listado de categoría. Resúmenes ES: 87+12+6+164 (draft); claves de glosario: las mismas (draft, nombre inglés como marcador, `verified:false`). `needsReview`: 0 en las cuatro. `runIntegrity` filtrado a las cuatro categorías: 0 hallazgos (schema, ids, R27, R29, R30, R33, overrides).

## Discrepancias y puntos para el humano

1. **Armas: la fuente declara 88 pero lista 87 distintas.** `Equipment (Weapons) [88]` contiene dos veces el mismo enlace `Crossbow bolts (10)` (misma URL). No se fuerza: se congela 87 (entradas distintas), el parser anota el enlace repetido en el informe de importación y el recuento declarado (88) queda solo en ese informe. Hay que contrastarlo con la tabla impresa (Q10); es probable que AoN cuente una fila duplicada.
2. **Golden vs fuente**: ninguna contradicción. Longsword (15 gp, 1d6/1d8, 19-20/x2, 4 lb, S), Dagger (2 gp, 1d3/1d4, 19-20/x2, 10 ft, 1 lb, P o S), Full plate (1.500 gp, +9, Des máx +1, ACP −6, ASF 35 %, 50 lb) y Heavy steel shield (+2, ACP −2, ASF 15 %, 15 lb; la fuente da 20 gp) coinciden. Cota de mallas (`chainmail`): +6 / Des máx +2 / ACP −5, igual que el ejemplo del encargo.
3. **Casi todas las páginas llevan varias etiquetas `Source`** (Ultimate Equipment, etc., además de CRB): armas 86/87, armaduras 12/12, escudos 6/6, bienes 156/164. Criterio de R86: `sourceRef` = etiqueta CRB, el texto es el de AoN tal cual (Q5/Q13), no se marca `needsReview`. Los números coinciden con los goldens del CRB, pero el texto de descripción puede ser el de la reimpresión (Ultimate Equipment). No hay campo `reprintedIn` en equipo (el spec solo lo define para `magic-items`); si se quiere, ampliar el schema.
4. **Alcance de `weapons` (decisión mía, a confirmar)**: el listado CRB de AoN incluye **munición** (5 filas: `arrows-20`, `blowgun-darts-10`, `crossbow-bolts-10`, `repeating-crossbow-bolts-5`, `sling-bullets-10`) y **máquinas de asedio** (5: ballista-light, catapult-heavy, catapult-light, ram-large, siege-tower-large; páginas 434-435 del CRB). Se importan en `weapons` con `category` `ammunition`/`siege` (el design solo preveía `simple|martial|exotic`) y `damage: null` (sin pareja pequeño/mediano; el literal está en `stats.Damage`). Ampliación del schema respecto a design §4.5; también `minRangeFt` (catapultas), `critical.secondaryMultiplier` (armas dobles `x3/x4`, gnome hooked hammer) y `weaponGroups`.
5. **Complementos de armadura en `gear`**: `armor-spikes`, `locked-gauntlet` y `shield-spikes` (en la tabla de armaduras, con coste `+50 gp` y peso `+10 lbs.` sumandos, sin bonificador) van a `gear` con `category: "armor-extra"`. Alternativa: otra categoría. Decisión a confirmar.
6. **Ids de escudos con alias**: la fuente nombra los escudos `Heavy steel`, `Light wooden`, `Tower`... (sin "shield"). `name` conserva el literal de AoN y los ids llevan alias declarado en `slug-aliases.json` (`shields`): `heavy-steel-shield`, `heavy-wooden-shield`, `light-steel-shield`, `light-wooden-shield`, `tower-shield` (+ `buckler`). **El Lote M (`baseItemId`) y el Lote Z deben usar estos ids.** Armaduras: ids por slug (`full-plate`, `chainmail`, `studded-leather`...). Armas: slug del nombre del enlace (`short-sword`, `hand-crossbow`, `arrows-20`, `catapult-heavy`); comprobado que todos los ids de `classes.proficiencies.weapons` del Lote A existen (salvo los genéricos `simple`, `martial`, `deity-favored-weapon`).
7. **Bienes = una entrada por fila de la tabla (enlace)**, no por página: AoN agrupa variantes en una misma ficha (p. ej. `Horse (heavy)`, `Horse (light)`... y `Backpack (common)` muestran todos los precios de sus variantes). Coste y peso de cada entrada salen de **su fila del listado de AoN** (no de la página), `stats` conserva los campos de la página tal cual (incluidos todos los precios de variantes) y `textEn` el texto completo de la página; el texto de variantes de la misma ficha se repite en cada entrada. Si el precio de la página (cuando no tiene variantes) difiere del listado se marcaría `needsReview` (0 casos).
8. **Dinero**: `costCp` entero en cp, `null` cuando la fuente no da una cantidad fija: `—`, `7 gp/20 gp` (escudos/arma pesada: dos precios), `×4`/`×2` (barda), `caster level × spell level × 10 gp`. `3 sp per day`/`2 cp per mile` sí se convierten (literal en `costRaw`). Pesos: `weightLb` solo con libras; `special`, `—`, `×2`, y los casos de transportes (la columna del listado es "Price of Passage", no peso) quedan `null`/`""` con el literal en `weightRaw`. Recuentos: `costCp` null en 8 armas, 0 armaduras/escudos, 5 bienes; `weightLb` null en 13 armas y 45 bienes (casi todos "—"). Se quita la marca de nota al pie del listado (`3 lbs.1` -> `3 lbs.`).
9. **Cuatro páginas sin descripción en la fuente** (`hourglass`, `oar`, `pouch-belt-empty`, `tent`): AoN solo trae la nota editorial "From Nethys: No description was provided"; no se copia (como en el Lote A) y `textEn` contiene solo la cabecera (precio, peso, categoría). Resúmenes de esas cuatro indican "la fuente no incluye descripción".
10. **Contenido ignorado de otros libros (R46)**: sección h2 "Expanded Information" (Path of the Hellknight) en `manacles-common` y `manacles-masterwork`, por llevar `Source` no CRB. La tabla h2 "Table 3-17: Siege Tower Complement" de `siege-tower-large` no declara `Source` y se conserva (está en la lista permitida): es una tabla de Ultimate Combat (misma situación que el punto 3).
11. **Q14 (materiales especiales)**: no incluidos (AoN los lista aparte como `Special Materials [6]` sin páginas por ítem). No se hizo nada.
12. **Glosario**: sin nombres españoles de equipo conocidos en el spec; todas las claves llevan el nombre inglés como marcador (`draft`, `verified:false`, nota Q2). Los resúmenes usan las unidades de la fuente (`gp`, `lbs.`, `ft.`) y dejan en inglés los nombres de habilidades, conjuros y propiedades de arma.
13. **Fuente-AoN observada**: la lista CRB de misc. incluye cosas que no son objetos (servicios: `hireling`, `messenger`, `spellcasting`, `road-or-gate-toll`, `ships-passage`; transporte). Se importan como `gear` (R25 lo pide: bienes y servicios). La categoría (`gear.category`) es la del listado de AoN en kebab-case (13 valores; el design preveía `adventuring-gear|special-substance|tools|clothing|food-drink|mounts...`; los valores reales son de la fuente).
14. **Prettier**: `seeds.json` y `section-allowlist.json` (compartidos) no pasan `prettier --check` (los reescriben varios lotes con `JSON.stringify`); los JSON de datos tampoco, como en los otros lotes. Cambio a decidir por el leader.

## Ficheros del Lote E

- Schema: `src/data/schema/equipment.ts` (`WeaponSchema`, `ArmorSchema`, `ShieldSchema`, `GearSchema`, sustituye el stub).
- Parser: `scripts/srd/parsers/equipment.ts` (`discover`, `parse`; las 4 categorías comparten módulo) y `scripts/srd/parsers/equipment-common.ts` (puras: `parseCostCp`, `parseWeightLb`, `parseWeaponStats`, `parseDefenseStats`, `crbUniverse`, listados).
- Config (solo mis claves): `seeds.json` (`weapons`: página de fuente CRB; `armor`/`shields`: fuente + 5 listados de armadura; `gear`: fuente + 5 listados de armadura + 24 listados Misc), `section-allowlist.json` (`weapons`: Statistics, Description, "Table 3-17: Siege Tower Complement"; `armor`/`shields`: Statistics, Description; `gear`: Statistics, Description, Alchemical Recipe), `slug-aliases.json` (`shields`).
- Datos: `src/data/equipment/{weapons,armor,shields,gear}.json`, `src/data/provenance/{weapons,armor,shields,gear}.json`, `src/data/summaries/{weapons,armor,shields,gear}/<cat>.json`, `src/data/glossary/{weapons,armor,shields,gear}.es.json`, `src/data/{weapons,armor,shields,gear}/index.ts` (generados). No hay overrides (ninguno necesario).
- Tests/fixtures: `tests/fixtures/srd-html/equipment/` (34 ficheros: 24 páginas reales de AoN —Longsword, Dagger, Net, Gnome hooked hammer, Heavy shield, Catapult heavy, Arrows, Unarmed strike, Crossbow bolts, Siege tower, Full plate, Padded, Heavy steel, Tower, Armor spikes, Backpack, Horse, Acid, Hireling, Spellcasting, Oar, Manacles, Barding, Carriage—, extracto de la página de fuente y extractos de los listados), `tests/scripts/srd/parse-equipment.test.ts`, `tests/data/schema/equipment.test.ts`, `tests/data/equipment.test.ts`.
- `specs/f3-srd-data/tasks.md`: TE.1..TE.5 marcadas.

Red real (solo vía pipeline, 1 req/s con caché): página de fuente CRB (ya en caché), 5 listados de armadura, 24 listados Misc, `Equipment.aspx`/`EquipmentArmor.aspx`/`EquipmentWeapons.aspx`/`EquipmentMisc.aspx` (exploración) y 87+18+164 páginas de ítem (todo en `.cache/`). Los tests no usan red.

## Verificación

| Comando | Resultado |
|---|---|
| `vitest run tests/data tests/scripts tests/setup` | 63 ficheros / 811 tests en verde (incluye los 88 de equipo) |
| `tsc --noEmit` | sin errores |
| eslint sobre mis ficheros | limpio |
| `data:parse --category weapons,armor,shields,gear` (x2) | 87/12/6/164 entradas, 0 needsReview, idempotente |
| `loadDataset` + `runIntegrity` (`categories` = las 4) | 0 hallazgos |

## Trazabilidad R -> test (rutas bajo `tests/`)

| R | Test |
|---|---|
| R2, R3 | `data/schema/equipment.test.ts` (válido por tipo, `book: APG` y `sourceRef` ajeno rechazados, campos extra), `scripts/srd/parse-equipment.test.ts` (salidas pasan el schema real) |
| R4, R5 | `data/equipment.test.ts` (regla `ids` vía integridad, ids de escudos con alias), `parse-equipment.test.ts` (ids por slug) |
| R6, R7, R8 | `data/equipment.test.ts` (host y `sourceRef`, sin HTML ni nota de Nethys), `data/schema/equipment.test.ts` |
| R24 | `data/equipment.test.ts` (goldens Longsword, Dagger, Full plate, Heavy steel shield, Chainmail; coherencia literal-estructura; munición y asedio), `parse-equipment.test.ts` (crítico `19-20/x2`/`x3/x4`/`18-20/x2`, daño pequeño/mediano/fijo/doble, alcance y alcance mínimo, celdas "—", Heavy shield con dos precios), `data/schema/equipment.test.ts` |
| R25 | `parse-equipment.test.ts` (conversión a `costCp`, pesos fraccionarios `1-1/2 lbs.`, `×4`, `3 sp per day`, complementos `+50 gp`, fila del listado frente a página con variantes), `data/equipment.test.ts` (caballos, mochila, frasco, 161 + 3 complementos) |
| R26 | `data/equipment.test.ts` (87/12/6/164 = `expectedCount`; Armor [21] = 12+6+3; Misc. [161]), `parse-equipment.test.ts` (`discover` declara/lista, recuento que no cuadra falla, enlace repetido) |
| R27 | `data/equipment.test.ts` (todo CRB), `parse-equipment.test.ts` (página sin etiqueta CRB excluida y listada, R46) |
| R28-R31, R33 | `data/equipment.test.ts` (`runIntegrity` sobre los datos reales: resúmenes, cifras R30, glosario) |
| R44 | `parse-equipment.test.ts` (dos ejecuciones idénticas), `data:parse` x2 |
| R45 | `parse-equipment.test.ts` (h3 desconocido y h2 sin Source -> `SectionError` con página y encabezado) |
| R46 | `parse-equipment.test.ts` (h2 de otro libro ignorada y contada; página sin CRB excluida) |

## Notas para otros lotes

- **Z (TZ.1)**: `counts.ts` leerá `provenance/{weapons,armor,shields,gear}.json` -> `expectedCount` 87/12/6/164 (coinciden). Las referencias `baseItemId` del Lote M deben apuntar a estos ids (`longsword`, `full-plate`, `heavy-steel-shield`...). Si el Lote M usa otros ids de escudos, se alinea con los alias de `slug-aliases.json`. `data:glossary` (TZ.2) debe incluir `glossary/{weapons,armor,shields,gear}.es.json` (87+12+6+164 claves `weapons:*`, `armor:*`, `shields:*`, `gear:*`).
- Si se cambia un resumen/glosario, `data:parse --category weapons,armor,shields,gear` regenera los `index.ts` (idempotente).
