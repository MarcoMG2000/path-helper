# Review 2 - feature f3-srd-data (segunda revision tras las correcciones A y B)

**Veredicto:** APROBADO (APPROVED), con una excepcion documentada (R40, ver abajo) y una lista de decisiones para el humano.

Los defectos del primer informe (D1-D14) estan corregidos y verificados de forma independiente contra el PRD oficial de Paizo (paizo.com/pathfinderRPG/prd/coreRulebook/, descargado de nuevo por mi, 1 peticion/s, User-Agent identificable) y d20pfsrd. No he fiado nada de los informes de A y B ni de las citas `evidence`. No he editado codigo ni datos del repo (`git status` tiene las mismas 92 entradas antes y despues; copias temporales y descargas en el scratchpad `.../scratchpad/r2/`).

Limitaciones: (a) AoN (`aonprd.com/SourceDisplay.aspx`) devolvio HTTP 500 hoy, asi que NO pude repetir el recuento contra SourceDisplay; uso los de la revision 1 (hash de los indices identico) y compruebo que los datos siguen en 176/623/87/12/6/164/33/7/35/240/442 y que `data:validate` (que compara con el `expectedCount` congelado en la procedencia) pasa; (b) no abri hoy las paginas de AoN de `symbol-of-*`: uso el texto de los datos (que es el de AoN) frente al PRD y d20pfsrd.

## Ejecucion real (Windows + Git Bash)

| Comando | Resultado |
|---|---|
| `bash ./init.sh` (1er intento) | fallo en `npm ci` con ENOTEMPTY sobre `node_modules/es-abstract/2015` (bloqueo de Windows, ajeno al repo) |
| `rm -rf node_modules && bash ./init.sh` | **exit 0**: 128 ficheros / **1927 tests verdes**; `data:validate: sin errores.` |
| `npm run test:int` | 7 ficheros / 47 tests verdes |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 (tsc + vite + PWA) |
| `data:parse` completo en copia temporal (src, scripts, `.cache` real), 2 veces | `diff -rq src/data` frente al repo: **0 diferencias** (R43/R44, idempotente). No crea `provenance/spells.json` (D13 corregido) |
| Caracteres de control (U+001F...) en `src/data` | ninguno |

## 1. Defectos del primer informe: verificacion punto por punto

| Defecto | Comprobacion independiente | Resultado |
|---|---|---|
| D1 `ranger.hunters-bond` | `textEn` = lista del CRB (badger, bird, camel, cat (small), dire rat, dog, horse, pony, snake (viper or constrictor), wolf; shark si acuatico). Comparacion frase a frase con classes/ranger.html: 0 frases ajenas. Comprobado tambien al reves: no se perdio ninguna frase del CRB | CORREGIDO |
| D1 `paladin.divine-bond` | "heavy horse (Medium) or pony (Small), although more exotic mounts, such as a boar, camel, or dog"; 0 ajenas, 26/26 frases del PRD presentes | CORREGIDO |
| D1 `druid.nature-bond` | solo dos formas (dominio o companero animal); 0 ajenas, 14/14 presentes | CORREGIDO |
| D1 `ranger.combat-style.archery` | "adds Improved Precise Shot and Manyshot"; sin Crossbow Mastery | CORREGIDO |
| D1 `bard.lore-master` | sin "even when threatened or distracted"; 4/4 frases del PRD | CORREGIDO |
| D2 `rapid-reload` | texto, prerrequisito (`Weapon Proficiency (crossbow type chosen)` en `raw` y `other`), `benefit`, `normal`, `special` = PRD (solo ballestas); `needsReview` false | CORREGIDO |
| D2 `extra-channel` | sin la frase del warpriest; conserva la de paladin, que SI esta en el PRD; `needsReview` false | CORREGIDO |
| D3 `summon-monster-1` | sin Nethys Note ni nota de antipaladines | CORREGIDO |
| D5 `feather-tokens` | 6 variantes (anchor 50, bird 300, fan 200, swan boat 450, tree 400, whip 500 gp), strong conjuration, CL 12; identico al PRD | CORREGIDO |
| D5 `figurines-of-wondrous-power` | 9 variantes con los 9 precios del PRD (10.000/10.000/16.500/21.000/17.000/28.500/15.500/9.100/3.800) | CORREGIDO |
| D5 `golem-manuals` | 5 variantes (12.000/8.000/35.000/22.000/44.000 gp); `sourceRef` sin pagina (ver decisiones) | CORREGIDO |
| D5 `mace-of-smiting` | una sola version (75.312 gp, CL 11, +3 adamantine heavy mace) como el PRD | CORREGIDO |
| D5 cabeceras (armor-of-rage, bracers-of-defenselessness, net-of-snaring, poisonous-cloak) | overrides aplicados (body / arms / 6 lbs / strong abjuration) | CORREGIDO |
| D4 equipo | shovel-or-spade 2 gp/8 lb; soap 5 sp/1 lb; wagon 35 gp/400 lb; cart/carriage/rowboat/sled 200/600/100/300 lb; perros, caballos y burro/mula con precio PRD y peso null ("-"); holly-and-mistletoe sin precio; coach-cab 3 cp/milla; ships-passage 1 sp/milla; locked-gauntlet 8 gp. Las 17 fichas revisadas (incluidas 8 alquimicas) tienen todas sus frases en el PRD | CORREGIDO |
| D6 burst | ver seccion 4 | CORREGIDO |
| D8 descriptores/subescuelas | catalogo cerrado de 25 descriptores y 14 subescuelas; sin "see-text"; gate = creation + [calling], mislead = figment + [glamer], fire shield = fire, cold | CORREGIDO |
| D9 cursivas en `raw` | 0 campos `raw` de los 623 conjuros con `*` | CORREGIDO |
| D13 provenance duplicado | `src/data/provenance/spells.json` no existe y `data:parse` completo no lo crea | CORREGIDO |
| D14 linea D2 | `tasks.md` linea 194 `[x] D2 (e-k)` | CORREGIDO |
| D10 smite evil (resumen ES) | reescrito | CORREGIDO |
| D7 favored-terrain | la tabla de 8 terrenos esta en `textEn`; no era defecto | CERRADO |
| D11, D12 | erratas de AoN; asedio y dardos de cerbatana: sin cambio, 6 weapons `needsReview` | ACEPTADO, a ratificar |

## 2. Casos nuevos de A y B: correcto, minimo, sin borrar texto legitimo

- Comprobacion al reves (cada frase de la seccion del PRD debe estar en los datos) en hunters-bond, divine-bond, nature-bond, lore-master y extra-channel: 0 frases del CRB perdidas. Los 9 overrides de `class-features` y los 12 de `feats` son de campo completo con `reason` y `evidence`.
- `bard.lore-master`: minimo (una clausula).
- `planar-ally-lesser`: se quito solo el parrafo final de "outsider subdomain" (APG).
- `improved-familiar`: ahora la tabla trae las 10 criaturas y 3 notas identicas al PRD (celestial hawk, dire rat, fiendish viper 3rd; elemental Small, stirge 5th; homunculus, imp, mephit, pseudodragon, quasit 7th). Restaura contenido del CRB.
- 7 razas: la parte descriptiva es del PRD (todas sus frases estan en races.html). Los rasgos conservan la redaccion de AoN, misma mecanica en Stonecunning, Orc Ferocity y Keen Senses ("1 or more" = "above 0"; "Perception checks" = "Perception skill checks"). Siguen `needsReview` (correcto).
- 8 recetas alquimicas retiradas: ya no hay "Alchemical Recipe" ni "Crafting this item is a DC" en ninguna ficha, y las 8 descripciones son exactamente las del PRD. No se perdio texto del CRB.
- `loadHtml` U+001F a "x": flaming-burst conserva "x3"/"x4" y la armadura recupera "2d4 x 100"; ningun caracter de control en `src/data`.
- Diez entradas editadas comparadas palabra a palabra con el PRD: hunters-bond, divine-bond, nature-bond, lore-master, extra-channel, rapid-reload, improved-familiar, feather-tokens, mace-of-smiting y las alquimicas (acid, alchemists-fire, thunderstone, tanglefoot-bag): identicas en reglas y cifras.

## 3. Test guardian `foreign-text`

Pruebas propias (scripts en el scratchpad, no en el repo):

1. **Copia temporal en disco** (`src/data` + config copiados, `runCli(["validate"], {root})`): inyecte "Gunslingers may use a musket (Ultimate Combat)." en el `textEn` de la primera entrada de **12 categorias** (classes, class-features, domains, races, skills, feats, spells, weapons, armor, shields, gear, magic-items). Resultado: `data:validate` **exit 1**, 38 errores, con los tres patrones (`firearms`, `other-book`, `other-class`) en las 12 categorias. Con los datos reales: 0 hallazgos. FUNCIONA.
2. **Inyeccion en cada campo de texto** (en memoria, datos reales): se detecta en `textEn` de todas las categorias, incluidos `traits[].textEn`, `grantedPowers[].textEn` y `variants[].textEn`. **No se detecta** en `feats.benefit/normal/special/prerequisites.raw/other`, `spells.shortDescriptionEn` y los `raw` de componentes/alcance/duracion/salvacion/RC, `gear.stats.*`, `weapons.stats.*`, `magic-items.construction.requirements`, `aura`, `legalFor.raw`, `spellRefs.name`, `variants.effects.conditionText/evidence`. Prueba con `rapid-reload`: reintroduciendo armas de fuego solo en `benefit` y `prerequisites`, lo unico que salta es `overrides.not-applied` (porque esa dote tiene override); en una dote sin override pasaria en verde. Hueco real, no bloqueante: esos campos derivan del mismo HTML que `textEn`, asi que una contaminacion suele aparecer tambien en `textEn`.
3. **Palabras guia**: no detecta (probado con `scanForeignText`) "Adventurer's Guide", "Technology Guide", "Armor Master's Handbook", "Unchained" suelto, "Bestiary 7", "Resonance", "Hellknight", "Dragon Empires", las clases oracle / investigator / brawler / slayer / shaman / alchemist / psychic, "rifle/revolver", "grit/panache", "bombs", "Qadira/Osirion/Andoran". Barrido propio de esas palabras sobre todos los `textEn` de los datos: 0 contenido ajeno real (solo "alchemist's fire/lab", "oracles" en crystal ball, "bombs" en fire seeds, "resonance" en implosion, que son del CRB; "Adventurer's Guide", "Andoran" y "Pathfinder Society" aparecen solo en `sourceRefAll`, metadato de reimpresiones). **Sin falsos negativos sobre los datos actuales; se recomienda ampliar la lista** (no bloqueante).
4. **Falsos positivos**: ninguno sobre los datos reales; el caso verde del test cubre "alchemist's fire", "oracles" y "the staff of the magi".
5. `FOREIGN_TEXT_ALLOWLIST` vacia, con exigencia de motivo y deteccion de excepcion obsoleta: bien disenado.

## 4. API `getExtraDamage` / `getWeaponAbilitiesExtraDamage` (script propio, datos reales)

Texto del PRD (weapons.html): flaming burst "extra 1d10 ... If the weapon's critical multiplier is x3, add an extra 2d10 ... instead, and if the multiplier is x4, add an extra 3d10"; icy y shocking burst igual (frio / electricidad); thundering 1d8/2d8/3d8 sonic. combat.html: "Extra damage dice over and above a weapon's normal damage are never multiplied."

| Arma (datos reales) | Habilidad | Sin critico | Critico |
|---|---|---|---|
| longsword 19-20/x2 | flaming burst | 1d6 fuego | 1d10 + 1d6 fuego |
| longsword | icy burst | 1d6 frio | 1d10 + 1d6 frio |
| longsword | shocking burst | 1d6 electricidad | 1d10 + 1d6 electricidad |
| battleaxe x3 | flaming / icy / shocking burst | 1d6 | 2d10 + 1d6 (del tipo) |
| scythe x4 | flaming / icy / shocking burst | 1d6 | 3d10 + 1d6 (del tipo) |
| gnome-hooked-hammer, extremo x3 / x4 | flaming burst | 1d6 | 2d10 + 1d6 / 3d10 + 1d6 |
| dagger x2, battleaxe x3, scythe x4 | thundering | nada | 1d8 / 2d8 / 3d8 sonic |

Todas coinciden con el PRD. Ademas: un critico sin multiplicador lanza `RangeError`; `["flaming","flaming-burst"]` no cuenta el 1d6 dos veces; Flame Tongue (`abilityIds: ["flaming-burst"]`, base longsword) da 1d10 + 1d6 en x2; dos burst a la vez suman cada uno su dado. Sumar las tres alternativas (6d10) es irrepresentable por schema. Observaciones para f6, no defectos de f3: `flaming`/`frost`/`shock` se modelan como `always` aunque el PRD dice "Upon command" (hay que activar el arma), y `vicious` modela los 2d6 al oponente pero no el 1d6 al portador.

## 5. Decisiones "a ratificar" y casos no resueltos: recomendacion

| Caso | PRD (Paizo) | AoN | d20pfsrd | Recomendacion |
|---|---|---|---|---|
| 8 `symbol-of-*` (quien encuentra/desactiva) | "While any character can use Perception to find a symbol, only a character with the trapfinding class feature can use Disable Device" | "A rogue (only) can use the Perception skill ... and Disable Device" | pagina sin esa nota | **Usar el PRD** (override). "rogue (only)" es un resto de 3.5 que contradice trapfinding en el mismo libro; es el criterio de fidelidad al PRD fijado por el humano. Confirmar con el impreso si se puede |
| `unhallow` "+4 profane" vs "+4 sacred" (CD contra energia negativa) | "sacred" | "profane" | "sacred" | **Dejar AoN (profane) con `needsReview`** y confirmar con el impreso o la fe de erratas: PRD y d20pfsrd (copias del texto de 2011) coinciden, pero "sacred" haria que unhallow y hallow usaran el mismo tipo, lo que carece de sentido. Si no se puede comprobar, "profane" |
| `staff-of-illumination`, coste de creacion | 20.750 gp (precio 51.500) | 25.750 gp | 25.750 gp (Ultimate Equipment) | **Mantener 25.750 gp**: es la mitad del precio, regla de creacion de bastones del CRB; 20.750 parece errata del PRD. Excepcion documentada en el test |
| ~12 erratas de redaccion de AoN (uncanny-dodge "Dex", elemental-channel "no affect", improved-overrun "overrrun", detect-magic "eminates"...) | version correcta | con errata | - | Corregir solo las ortograficas con overrides (visibles en la UI); dejar las variantes de redaccion sin cambio mecanico. Prioridad baja |
| Texto de Ultimate Equipment en 115 fichas de `gear` y ~310 de `magic-items`; `chime-of-opening` cambia "wizard" por "spellcaster de nivel menor que 15" | CRB literal | UE | - | Aceptar como reimpresion, con override para `chime-of-opening` (a "wizard"). Importar el PRD como fuente (ampliar R6) solo si el humano exige texto literal; aportaria ademas `bag-of-tricks` y `lens-of-detection` (`knownGaps`) |
| `golem-manuals.sourceRef` sin pagina | el PRD no numera | "pg. 1" (error) | - | Aceptar sin pagina; poner el numero cuando alguien lo compruebe en el impreso |
| Dardos de cerbatana y 5 maquinas de asedio (`needsReview`) | dardos "-"; asedio ausente | UC pg. 160 | dardos 1 lb | Mantener `needsReview`; decidir si las maquinas de asedio forman parte del grupo |
| 16 piedras ioun sin el parrafo general del CRB | lo trae | no | - | Anadirlo por override en una pasada posterior (baja prioridad) |

## 6. Regresion: muestreo estratificado nuevo (generador propio, semilla 20261018; distinto del de la revision 1)

Contra el PRD de Paizo (o la tabla del PRD para equipo): **25 entradas muestreadas mas 4 comprobaciones de tablas de clase, 0 regresiones por los overrides.**

| Categoria | Entradas | Resultado |
|---|---|---|
| spells (7) | endure-elements, weird, magic-fang-greater, find-traps, hold-monster-mass, rope-trick, summon-monster-9 | escuela, subescuela, descriptores, niveles, componentes, alcance, objetivo, duracion, salvacion y RC = PRD (los 6 verificados campo a campo; summon-monster-9 por la tabla); 0 frases de `textEn` fuera del PRD |
| class-features (4) | cleric.domain.magic.dispelling-touch, rogue.advanced-talents, cleric.domain.nobility.inspiring-word, rogue.talent.bleeding-attack | 0 frases fuera del PRD |
| feats (3) | diehard, unseat, greater-spell-penetration | 0 frases fuera del PRD |
| skills (1) | intimidate | identico al PRD |
| weapons/armor (3) | unarmed-strike, gauntlet, studded-leather | dano 1d2/1d3 x2 B; gauntlet 2 gp 1 lb; studded leather 25 gp +3/+5/-1/15%/30-20 ft/20 lb = PRD |
| gear (3) | bedroll, lock-good, trail-rations | 1 sp 5 lb; lock good 80 gp 1 lb; 5 sp 1 lb = PRD |
| magic-items (4) | dwarven-plate, eyes-of-the-eagle, wild-armor, axe-of-the-dwarvish-lords | aura, CL, ranura, precio, peso y construccion = PRD; solo frases de ambientacion de UE de mas |
| Tablas de clase | monk, sorcerer, rogue, cleric | `src/data/classes` no ha cambiado desde la revision 1 (140/140 filas verificadas entonces; ningun diff) |

Barridos globales: 176 dotes frente a la pagina de dotes del PRD: 164 identicas; 12 con diferencias solo de erratas (elemental-channel "no affect", improved-overrun "overrrun"), de redaccion (vital-strike y variantes, shield-master, empower-spell, penetrating-strike) o de tablas en markdown (improved-familiar, leadership); extra-channel por "a day"/"per day". 240 capacidades de clase frente a 11 paginas de clase del PRD: 234 identicas, 6 con erratas o tablas (bardic-knowledge, luck.good-fortune, cleric.domains, favored-enemy, favored-terrain, la lista de archery). Recuentos de datos: feats 176, spells 623, class-features 240, classes 7, races 7, skills 35, domains 33, weapons 87, armor 12, shields 6, gear 164, magic-items 442 (armor-ability 17, artifact 12, cursed 29, general 21, ring 34, rod 24, shield-ability 14, specific-armor 12, specific-shield 8, specific-weapon 30, staff 21, weapon-ability 30, wondrous 190), iguales a la revision 1.

## Trazabilidad requirements <-> tests

- R1-R103: [x] cada R tiene al menos un test que lo cita en `tests/{data,scripts,setup}` (barrido propio; las citas "R40" en `tests/project` son de f0).
- **R40**: [ ] sin test en esta feature. **Excepcion documentada en el propio spec**: la tabla de trazabilidad de `requirements.md` (linea 454) dice "Test en la feature que monte la pantalla (ver Q6); `data/legal.test.ts` cubre el contrato", y `progress/impl_f3-srd-data_Z.md` lo repite. El contrato `getLegalNotice()` (R38) si esta cubierto. Lo trato como excepcion aprobada y lo elevo al humano (Q6); si el humano no la acepta, el veredicto pasa a CHANGES_REQUESTED.
- Correcciones: R27 -> `tests/data/integrity/foreign-text.test.ts`, `tests/data/crb-text-fidelity.test.ts`; R24/R25 -> `tests/data/equipment-prd.test.ts` (251 tests con fixture del PRD, no circular); R78/R84 -> `tests/data/magic-extra-damage.test.ts`, `tests/data/integrity/magic-refs.test.ts`; R49 -> `tests/data/integrity/overrides.test.ts`; R96/R101 -> `tests/scripts/srd/parse-spells.test.ts`; R98 -> `tests/scripts/srd/cli.test.ts`; U+001F -> `tests/scripts/srd/html.test.ts`.

## Tasks completas

T0.1-T0.14, TA.1-TA.8, TB.1-TB.5, TC.1-TC.6, TD.x, TE, TM.x, TZ.x: [x] (61 `[x]`). Las 4 lineas `[ ]` (TDn.1-TDn.4, lineas 176-189) son la plantilla compartida de D1-D4; el estado por lote esta en `[x]` (D1, D2 `e-k` linea 194, D3, D4). Aceptado como en la revision 1.

## Checkpoints

- C1: [x] archivos base y 4 docs; `./init.sh` exit 0 (tras reinstalar node_modules).
- C2: [x] una sola feature `in_progress` (f3-srd-data); `progress/current.md` describe la sesion.
- C3: [x] capas respetadas (`layering.test.ts` verde); `console.log` solo en CLI y scripts de semillas de `scripts/srd`; sin TODO/FIXME ni secretos; dependencias pineadas.
- C4: [x] tests por modulo, sin red en unitarios (stub de fetch), 1927 verdes, test:int 47 verdes.
- C5: [x] spec completa, EARS, tasks `[x]` (plantilla aparte); cada R cubierto salvo R40 (excepcion del propio spec).

## Defectos abiertos (no bloqueantes) para una pasada posterior

1. `foreign-text` solo escanea claves `textEn`: ampliar a `benefit`, `normal`, `special`, `prerequisites.raw/other`, `shortDescriptionEn`, `construction.requirements` y `raw` de conjuros. Reproduccion: en una copia, anadir "firearms" al `benefit` de una dote sin override y ejecutar `data:validate` (pasa en verde).
2. Lista de palabras guia: anadir Adventurer's Guide, Technology Guide, Armor Master's Handbook, Unchained suelto, Bestiary 7+, oracle/investigator/brawler/slayer/psychic, rifle/revolver, grit/panache, Resonance, Qadira/Osirion/Andoran.
3. Para f6: `flaming`/`frost`/`shock` como `always` (PRD: "Upon command") y `vicious` sin dano al portador.

## Decisiones que debe tomar el humano

1. Symbol-of-* (8): PRD (trapfinding) o AoN ("rogue (only)"). Recomendacion: PRD.
2. Unhallow: "sacred" (PRD y d20pfsrd) o "profane" (AoN). Recomendacion: dejar profane con `needsReview` y confirmar con el impreso.
3. Staff of illumination: 25.750 gp (recomendado) o 20.750 gp.
4. ~12 erratas: corregir solo las ortograficas por override, o dejar todo.
5. Texto de Ultimate Equipment en equipo y objetos magicos: aceptar como reimpresion (recomendado, con override para `chime-of-opening`) o importar el PRD como fuente (ampliar R6) para texto literal y para recuperar `bag-of-tricks` y `lens-of-detection`.
6. Maquinas de asedio y dardos de cerbatana (`needsReview`); `golem-manuals.sourceRef` sin pagina; parrafo general de las piedras ioun.
7. Q6 / R40: quien monta la pantalla legal y si se anade la declaracion de Product Identity de Paizo. Taldane/Chelaxians y Katapesh ya no estan en los datos (solo en `reason` de overrides y procedencia).
8. Ratificar: extension del schema de conjuros (catalogos cerrados de 25 descriptores y 14 subescuelas, campo `additionalSubschools`), campos `critMultiplier` y `functionsAs` en objetos magicos, nueva regla `foreign-text`; y las preguntas abiertas Q2 (nombres ES, todo draft), Q9 (otras 4 clases), Q11 (pociones/aceites/varitas con `expectedCount: 0`), Q14/Q7 (Special Materials, venenos, companeros animales, monturas, familiares), Q15 (sin listas de hechicero/mago).
