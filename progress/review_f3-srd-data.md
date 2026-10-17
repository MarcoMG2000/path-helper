# Review - feature f3-srd-data

**Veredicto:** RECHAZADO (CHANGES_REQUESTED)

Estructura, recuentos, niveles de conjuro, tablas de clase, armas, armaduras, escudos, dotes, dominios y razas son fieles a la fuente (ver tablas). El rechazo se debe a que **hay texto y reglas de OTROS libros dentro de entradas marcadas CRB** (viola R27 y architecture.md sec. 7, y la prioridad "fidelidad"), a varios valores de equipo que difieren del CRB impreso y a un defecto de modelado que daria mal el dano de *flaming burst*. Todo es corregible con overrides de pocas entradas y/o decisiones del humano (ultima seccion).

Verificacion independiente: fuentes = Archives of Nethys (descarga propia, no la cache del pipeline), **Paizo PRD oficial** (`paizo.com/pathfinderRPG/prd/coreRulebook/...`: spellLists, feats, equipment, classes, magicItems) y d20pfsrd. Los sha256 de las paginas de indice que descargue (SourceDisplay CRB y Spells.aspx?Class=All) son identicos a los de `provenance/spells/index.json` (la fuente no ha derivado). Scripts y descargas en el scratchpad (fuera del repo); el repo no se ha tocado.

## Ejecucion real (Windows + Git Bash, sin otros agentes)

| Comando | Resultado |
|---|---|
| `bash ./init.sh` | exit 0: 123 ficheros / 1604 tests verdes; `data:validate: sin errores`. Nota: el primer intento fallo en `npm ci` con ENOTEMPTY sobre `node_modules/es-abstract` (bloqueo de Windows ajeno al repo); tras borrar `node_modules` y repetir, verde |
| `npm run test:int` | 7 ficheros / 47 tests verdes |
| `npm run lint` | sin errores |
| `npm run typecheck` | sin errores |
| `npm run build` | OK (tsc + vite + PWA) |
| `data:parse` (todas las categorias) en copia temporal con la cache real | reproduce `src/data` byte a byte (R43/R44); unica diferencia: escribe un `src/data/provenance/spells.json` extra (D13) |
| `data:sample --seed 7 --per-category 3` dos veces | mismo md5 (R54) |

## 1. Muestreo contra la fuente (cada comparacion)

OK = valor identico. Las DISCREPANCIAS estan detalladas al final (D1..D14).

### Clases (7), tablas completas
| Dato | Datos | Fuente | Res. |
|---|---|---|---|
| 140 filas (7 clases x 20 niveles): BAB iterativo, Fort/Ref/Will, columna Special, conjuros/dia 0-9 (guion = null; "1+1" del clerigo en `domainSpellsPerDay`) | tabla | AoN ClassDisplay parseado por mi | OK 140/140 (incluye niveles 1, 3, 5, 6, 10, 20) |
| Barbaro L1/3/5/6/10/20: BAB 1,3,5,6/1,10/5,20/15/10/5; saves 2/0/0, 3/1/1, 4/1/1, 5/2/2, 7/3/3, 12/6/6 | igual | igual | OK |
| Paladin L5 BAB 5 saves 4/1/4 conjuros 1st=1; L10 2/1/0; L20 4/4/3/3 | igual | igual | OK |
| Bardo: conjuros conocidos (20 niveles) | igual | AoN | OK |
| hitDie, rangos, riqueza inicial, alineamiento, competencias | class-golden y test | AoN/PRD | OK |

### Capacidades de clase (240)
| Capacidad | Resultado |
|---|---|
| Castigar el mal, Furia, Ataque furtivo, Enemigo predilecto, Interpretacion de bardo (13 actuaciones), Canalizar energia, Forma salvaje, Imposicion de manos | identicas al PRD oficial por trozos de 5 palabras; solo difieren erratas de redaccion (p. ej. Soothing Performance) |
| 95 de 106 capacidades de clase identicas al PRD; sub-opciones: 28/28 poderes de furia, 15/15 misericordias, 23/23 talentos de picaro, 65/66 poderes de dominio | OK |
| hunters-bond, divine-bond, nature-bond, combat-style archery, lore-master | DISCREPANCIA (D1) |

### Dotes (176)
| Dato | Datos | Fuente | Res. |
|---|---|---|---|
| Power Attack: Str 13, BAB +1; -1 ataque / +2 dano; +50% a dos manos | igual | AoN, PRD, d20pfsrd | OK |
| Cleave: Str 13, Power Attack, BAB +1 | igual | idem | OK |
| Great Cleave: Str 13, Cleave, Power Attack, BAB +4 | igual | idem | OK |
| Two-Weapon Fighting: Dex 15 | igual | idem | OK |
| Weapon Focus: competencia, BAB +1 | igual | idem | OK |
| Improved Initiative, Dodge (Dex 13), Point-Blank Shot, Skill Focus | igual | idem | OK |
| 176 dotes vs pagina AoN fresca | 173 identicas; vs PRD 167 identicas (resto: erratas, tabla de Leadership) | | OK salvo extra-channel, rapid-reload (D2) |
| Recuento y nombres | 176 = 176, conjuntos de nombres identicos | SourceDisplay | OK |

### Conjuros (623)
| Dato | Resultado |
|---|---|
| Universo | 623 = 623 de SourceDisplay, 0 faltan, 0 sobran |
| Los 623 contra su pagina AoN fresca (escuela, subescuela, descriptores, niveles de clase CRB, tiempo, componentes, alcance, objetivo/area/efecto, duracion, salvacion, RC, sourceRef) | 576 identicos; los 47 restantes son artefactos (marcas de cursiva en `raw`, slug "see-text" de descriptores, etiqueta "Target or Area" que mi script no leia). 0 discrepancias de nivel, componentes, alcance, duracion, salvacion o RC |
| Listas por clase vs PRD oficial spellLists.html (1061 entradas) | bardo 164/164, clerigo 236/236, druida 169/169, paladin 45/45, cazador 51/51, mago 396/396, hechicero 394 (Mnemonic Enhancer y Mages Lucubration son "Wizard only" en el PRD); 0 niveles distintos |
| Fireball, Cure Light Wounds, Magic Missile, Haste, Dispel Magic, Hold Person, Wish, Heal, Detect Magic, Mage Armor, Teleport vs d20pfsrd | estructura y niveles OK; texto igual salvo erratas (Teleport, Detect Magic) |
| Summon Monster 1 | conserva la nota de antipaladines (D3) |

### Armas, armaduras, escudos (PRD oficial, Tabla 6)
| Dato | Resultado |
|---|---|
| 80 armas: coste, dano P/M, critico (rango y multiplicador), alcance, peso, tipo | 80/80 identicas (Longsword 15 gp 1d6/1d8 19-20/x2 4 lb S; Dagger 2 gp 1d3/1d4 19-20/x2 10 ft 1 lb P o S; etc.). Las de coste "special" por material se omiten bien |
| 12 armaduras: bono, Des max, ACP, fallo arcano, velocidad, peso, coste (Padded 5 gp +1/+8/0/5%/10 lb ... Full plate 1500 gp +9/+1/-6/35%/50 lb) | 12/12 OK |
| 6 escudos (Buckler 5 gp +1/-1/5%/5 lb; Heavy steel 20 gp +2/-2/15%/15 lb; Tower 30 gp +4, Des max +2, -10, 50%, 45 lb ...) | 6/6 OK |
| Recuentos: 87 armas (88 enlaces con "Crossbow bolts (10)" repetido), 18 armaduras y escudos + 3 extras en gear (=21), gear 164 (=161+3) | OK |
| Maquinas de asedio | AoN las etiqueta "Ultimate Combat pg. 160, PRPG Core Rulebook pg. 435"; no estan en mi PRD de equipo: no verificado contra el impreso (D12) |
| d20pfsrd lista Sword butterfly y Spear totem como CRB; AoN y PRD no | datos siguen a AoN/PRD (OK) |

### Equipo mundano (164) vs PRD "Goods and Services"
124 filas coinciden por nombre en coste y peso; 17 no tienen la pareja (coste, peso) en el PRD. Discrepancias reales: D4.

### Objetos magicos (442)
| Objeto | Datos | Fuente | Res. |
|---|---|---|---|
| Ring of Protection | faint abjuration, CL 5, 2.000/8.000/18.000/32.000/50.000 gp, deflection +1..+5 CA | AoN + PRD | OK |
| Cloak of Resistance | faint abjuration, CL 5, 1.000..25.000 gp, 1 lb, resistance +1..+5 a todas las salvaciones | AoN + PRD | OK |
| Belt of Giant Strength | moderate transmutation, CL 8, 4.000/16.000/36.000 gp, enhancement +2/+4/+6 FUE | AoN + PRD | OK |
| Bracers of Armor | moderate conjuration, CL 7, 1.000..64.000 gp (+1..+8), bono de armadura a la CA | AoN + PRD | OK |
| Amulet of Natural Armor | faint transmutation, CL 5, 2.000..50.000 gp, enhancement a armadura natural (foldInto naturalArmor) | AoN + PRD | OK |
| Flaming Burst | strong evocation, CL 12, +2 bonus; critico 1d10/2d10/3d10 | AoN + PRD | OK en texto; D6 en modelado |
| Flame Tongue | +1 longsword, `abilityIds: [flaming-burst]` ("This is a +1 flaming burst longsword"); el golden del spec (flaming + flaming-burst) era el equivocado | AoN + PRD | OK |
| Habilidades de armadura (Fortification light/moderate/heavy +1/+3/+5 CL 13; Spell Resistance 13/15/17/19; Energy Resistance, Ghost Touch, Shadow, Slick) | precios por bonus equivalente y legalFor | AoN + PRD | OK |
| Ring of Climbing/Swimming improved | competence +10 estructurado | AoN | OK |
| Cabecera (aura, CL, slot, precio, peso) de 321 objetos localizados en el PRD | 206 identicas, el resto formato; diferencias reales: armor-of-rage, bracers-of-defenselessness, net-of-snaring, poisonous-cloak | PRD | D5 |
| Pociones y varitas: precios genericos | entradas `general` potions (25/50/300/750 gp ...) y wands (375/750/4.500/11.250/21.000 gp) recalculadas por formula nivel x CL x 50 o 750 | CRB | OK |

### Razas (7) y dominios (33)
Modificadores, tamano, velocidad, idiomas y rasgos de las 7 razas (incluidas las 7 needsReview) coinciden con el CRB: Dwarf +2 Con/+2 Sab/-2 Car vel. 20; Elf +2 Des/+2 Int/-2 Con; Gnome +2 Con/+2 Car/-2 Fue Small vel. 20; Halfling +2 Des/+2 Car/-2 Fue Small vel. 20; Half-elf, Half-orc y Human +2 a elegir, vel. 30. Los rasgos coinciden con el PRD salvo redaccion; el texto de presentacion es la version revisada de AoN (distinta del PRD 2011). Dominios: los conjuros de nivel 1-9 de los 33 coinciden con el PRD (33/33) y el texto con la pagina AoN fresca (33/33).

## 2. Recuentos vs SourceDisplay (CRB)

| Categoria AoN | AoN | Datos | Estado |
|---|---|---|---|
| Feats | 176 | 176 | OK |
| Spells | 623 | 623 | OK |
| Equipment (Weapons) | 88 (87 unicos) | 87 | OK |
| Equipment (Armor) | 21 | 12 armor + 6 shields + 3 en gear | OK |
| Equipment (Misc.) | 161 | 164 gear (161+3) | OK |
| Cleric Domains | 33 | 33 | OK |
| Races | 7 | 7 | OK |
| Classes | 16 | 7 | por decision (Q9); no cuadra por diseno |
| Rage Powers / Paladin Mercies / Rogue Talents | 28 / 15 / 23 | 28 / 15 / 23 | OK |
| Magic Items: Armor 48, Weapons 64, Rings 43, Rods 36, Staves 21, Wondrous 300, Artifacts 12, Cursed 29 (enlaces; cuentan variantes) | | 51 / 60 / 34 / 24 / 21 / 190 / 12 / 29 (+21 `general`) | OK: todos los nombres de AoN estan como entrada o variante, salvo los 4 `knownGaps` documentados (Lens of Detection, Bag of Tricks Gray/Rust/Tan: la fuente no tiene texto CRB) |
| No importados (fuera de las 13 categorias): Animal Companions 17, Arcane Schools 9, Bloodlines 10, Deities 20, Familiars 21, Prestige Classes 10, Special Materials 6, Poisons 35, Diseases 11, Curses 6, Traps 33 | | - | por alcance (Q7/Q14); Special Materials y Poisons afectan al grupo: decision del humano |

**Otros libros:** 0 entradas con `book` distinto de CRB o `sourceRef` ajeno en las 12 categorias. Las listas de clase son exactamente el PRD, asi que los 2.817 conjuros de otros libros descartados no se filtraron (0 conjuros fuera de los 623; 0 claves de clase ajenas en `levels`). **Pero** hay texto de otros libros dentro de entradas CRB (D1-D3, D5).

## 3. Integridad, trazabilidad, data:validate

- **R1-R103 a test**: todos tienen al menos un test que los cita (script propio sobre `tests/{data,scripts,setup}`), salvo **R40** (admitido, espera Q6). Lei en detalle los tests de R4/R5, R11-R14, R18/R19, R26, R27, R37-R39, R12 y los golden: usan valores esperados escritos a mano y casos sinteticos rotos. Debilidades: R37/R38 se comparan contra el propio modulo (circular; lo he contrastado yo con la fuente oficial, seccion 4); `validate` no detecta valores numericos alterados fuera de lo estructural (p. ej. cambiar el dano de un arma): ahi solo protegen los goldens y la procedencia.
- **Tasks**: `specs/f3-srd-data/tasks.md`: 61 `[x]`; quedan 4 `[ ]` (TDn.1-TDn.4) que son la **plantilla** compartida de D1-D4; los estados por lote estan `[x]` para D1, D3 y D4; **falta la linea de estado de D2 (e-k)** aunque `progress/impl_f3-srd-data_D2.md` y los tests e-k existen (D14).
- **data:validate ante datos corruptos** (copia en el scratchpad con node_modules/.cache enlazados; el repo intacto). Tres alteraciones principales, todas con exit 1:
  1. `levels.cleric` de Cure Light Wounds 1 a 2: `spell-lists.level-mismatch` y `missing-from-list`.
  2. `book: "APG"` en Power Attack: `book.not-crb` (mas 9 `feats.prereq-ref`).
  3. Borrar la dote Cleave: `counts.count` 175 vs 176, `prereq-ref`, `summaries.orphan`, `glossary.orphan`.
  Extra, tambien detectadas con exit 1: BAB y salvacion alterados en el picaro (`class.table.bab/save`), evidencia ajena en Ring of Protection (`magic.evidence`), glosario modificado (`glossary.stale`), `range` de Magic Missile (`spells.structured-field`), `sourceRef` ajeno en Longsword, borrar una habilidad (`class.skill-ref` y recuento), `spellId` inexistente en un dominio (`domain.spell-ref`).
- **Capas e higiene**: `src/data` y `src/rules` no importan de `server`/`web` (grep y `layering.test.ts`); `src/rules` no usa `fs`; el cliente web no importa datos. Sin `console.log` de depuracion (solo salida de CLI en `scripts/srd`), sin TODO/FIXME, sin secretos. Dependencias con version exacta (cheerio 1.2.0 pineada). `.cache/` y `reports/` ignorados y no versionados.

## 4. Aviso OGL (R37-R39)

`LICENSE-OGL.md`: el cuerpo de la OGL v1.0a (clausulas 1-14) es **identico** (tras normalizar espacios, 6067 caracteres) al de `https://paizo.com/pathfinderRPG/prd/openGameLicense.html`. La Section 15 contiene los avisos pertinentes (OGL, SRD de WotC, PRD 2011, Core Rulebook 2009) con el mismo texto y orden que la pagina oficial (que ademas lista Bestiarios, APG, etc., no necesarios aqui). Falta, sin ser bloqueante, la declaracion de "Product Identity / Open Content" de Paizo que encabeza esa misma pagina (nombres propios y lugares no son contenido abierto), relevante porque `human` cita "Taldane/Chelaxians" y `pack-animal-donkey-mule` cita "Mwangi Expanse / Inner Sea / Katapesh" (Q6). `getLegalNotice()` coincide con el fichero (R38); R40 sigue pendiente de Q6.

## 5. Cambios del Lote Z

- **14 alias de slug**: son alias de la categoria `spells` usados por las paginas de dominio (`summon-monster-ix/v`, `summon-natures-ally-iv/viii`, `mass-cure-critical-wounds`, `mass-heal`, `mass-invisibility`, `greater-{shadow-evocation,dispel-magic,command,glyph-of-warding,teleport}`, `lesser-{confusion,planar-binding}`). Cada uno es **inequivoco**: apunta a un unico id existente cuyo nombre AoN es la forma invertida o numerica ("Teleport, Greater", "Summon Monster 9"), no choca con ningun id real y lo usa algun dominio. Verificado: las listas de conjuros de los 33 dominios coinciden con el PRD.
- **`parsers/domains.ts` y `domains.json`**: el diff `HEAD~1..HEAD` son exactamente 18 lineas `spellId` (slug viejo a id de `spells`); antes eran referencias colgantes. OK.
- **Override de Summon Monster 1**: elimina el parrafo "Nethys Note" (comentario editorial de AoN sobre otro libro), con `reason` y `evidence`. Correcto, pero queda la linea "*Note:* Antipaladins may only summon evil creatures." (D3).
- **Q11 (potion/oil/wand `expectedCount: 0`)**: justificado: el CRB solo trae formulas y tablas, no pociones/varitas con nombre (comprobado en el PRD: potions, wands, scrolls). Sigue pendiente de ratificacion humana; `intelligent: 0` tambien es correcto.
- **Schemas**: `WEAPON_CATEGORIES` anade `ammunition` y `siege` (E); `enhancement` opcional en objetos especificos (M) solo con `needsReview` (3 objetos con `baseItemId: null`). Razonable y cubierto por tests; no relaja R70 para el resto.

## Discrepancias ordenadas por gravedad (con reproduccion)

### Alta: texto o reglas de otros libros dentro de entradas CRB (afecta a clases del grupo)

- **D1. Capacidades de clase con contenido ajeno al CRB.** Reproduccion: comparar `src/data/class-features/{ranger,paladin,druid,bard}.json` con `https://paizo.com/pathfinderRPG/prd/coreRulebook/classes/<clase>.html` (o con d20pfsrd).
  - `ranger.hunters-bond`: lista de companeros animales de unos 37 animales (Antelope, Armorfish, Baboon, Bustard, Capybara, Hobbe Hound, Kangaroo, Marsupial Devil, Wolfdog..., con "Reef Snake" duplicado). CRB: badger, bird, camel, cat (small), dire rat, dog, horse, pony, snake (viper o constrictor), wolf; acuatico: shark.
  - `paladin.divine-bond`: la montura pasa a "Medium Paladins: Camel, Elk, Giraffe, Horse, Seahorse, Giant, Yak, Zebra / Small Paladins: Antelope, Boar, Capybara, Dog, Eohippus, Pony, Ram, Reindeer, Stag, Weasel, Giant, Wolfdog". CRB: heavy horse (Medium) o pony (Small), "aunque tambien boar, camel o dog".
  - `druid.nature-bond`: anade la tercera forma "druidic herbalism" (Ultimate Wilderness).
  - `ranger.combat-style.archery`: anade Crossbow Mastery (dote no CRB, no existe en `feats`) al nivel 6.
  - `bard.lore-master`: anade "even when threatened or distracted", que no esta en el PRD (posible fe de erratas de AoN, Q5).
- **D2. Dotes.** `rapid-reload` incluye armas de fuego (Ultimate Combat) y el prerrequisito "Exotic Weapon Proficiency (firearm)"; el CRB solo habla de ballestas. `extra-channel` anade la frase de warpriest. Ambas estan `needsReview` pero sin resolver; el prerrequisito estructurado de rapid-reload puede estar contaminado.
- **D3. Conjuros.** `summon-monster-1` conserva la nota "Antipaladins may only summon evil creatures" (clase de APG); el override solo quito la Nethys Note.
- **D5. Objetos magicos reimpresos con variantes de otros libros.** `feather-tokens` (14 variantes; CRB 6: anchor, bird, fan, swan boat, tree, whip; el texto cita Ultimate Combat), `figurines-of-wondrous-power` (22 variantes; CRB 9), `golem-manuals` (31; CRB 5: clay, flesh, iron, stone, stone guardian; ademas `sourceRef` "PRPG Core Rulebook pg. 1" es un error de AoN), `mace-of-smiting` (variante "lesser" ausente en el CRB). Ademas unos 420 objetos llevan descripcion ampliada de Ultimate Equipment (p. ej. Cloak of Resistance: "Flecks of silver or steel..."): la mecanica es identica en los 10 muestreados, pero cambian slot, peso o aura en 4 (armor-of-rage "armor" vs "body", bracers-of-defenselessness "wrists" vs "arms", net-of-snaring 1 lb vs 6 lb, poisonous-cloak aura). Reproduccion: contar `variants` de `src/data/magic-items/wondrous.json` frente a los enlaces "Feather Token (Anchor)...", "Figurine of Wondrous Power (...)", "Golem Manual (...)" de la lista Magic Items (Wondrous Items) de SourceDisplay.

### Media

- **D4. Equipo mundano** (`src/data/equipment/gear.json`) distinto del PRD (Goods and Services): `shovel-common` 2 cp / 3 lb (CRB "Shovel or spade" 2 gp / 8 lb); `soap` 1 cp / 1/2 lb (CRB "Soap (per lb.)" 5 sp / 1 lb); `wagon-light` 50 gp con peso corrupto "3 cp (heavy)..." (CRB "Wagon" 35 gp / 400 lb); `cart`, `carriage`, `rowboat`, `sled` sin peso (CRB 200/600/100/300 lb); caballos, perros y pack animal con pesos del Bestiario (CRB: guion); `holly-and-mistletoe` "0 gp" (CRB: guion). `pack-animal-donkey-mule` lleva un parrafo de Golarion (Inner Sea, Katapesh) que no es del CRB. Reproduccion: `gear.json` frente a `https://paizo.com/pathfinderRPG/prd/coreRulebook/equipment.html`.
- **D6. Modelado de dano (R78) erroneo si se consume tal cual.** `flaming-burst` (y probablemente icy/shocking burst) tiene tres `extraDamage` `onCritical` (1d10, 2d10, 3d10) sin discriminar por multiplicador: sumarlos da 6d10 en vez de uno solo segun x2/x3/x4. Ademas, al funcionar como flaming, el 1d6 `always` no aparece en la entrada ni hay enlace de implicacion. f6 necesita `critMultiplier` o `trigger: conditional` con `conditionText`.
- **D7.** `ranger.favored-terrain`: la lista de terrenos aparece en AoN como texto suelto fuera de la capacidad y no queda en `textEn`; menor, pero son datos de reglas del cazador del grupo.

### Baja

- **D8.** `descriptors: ["see-text"]`, `subschool: "creation-or-calling"`, `"figment-glamer"`, `fire-or-cold`: no son descriptores o subescuelas validos (align weapon, fire shield, planar binding/ally, summon monster, gate, mislead).
- **D9.** Marcas de cursiva dentro de `components`/`savingThrow`/`duration`/`targeting` de `raw` (control water, hallow, ironwood, scare, transformation...); `raw` deberia ser literal.
- **D10.** Resumenes ES (borrador): `paladin.smite-evil` dice "si es malvado... e ignora su RD"; en el CRB la RD se ignora siempre. Mezcla de idiomas ("fatigued", "Sense Motive").
- **D11.** Diferencias de redaccion de AoN frente al PRD (erratas): Soothing Performance, Inspire Greatness, Teleport, Detect Magic; sin impacto mecanico comprobado (Q5).
- **D12.** Maquinas de asedio y peso de Blowgun darts (datos y PRD guion, d20pfsrd 1 lb): no verificables con el PRD.
- **D13.** `data:parse` sin `--category` crea un `src/data/provenance/spells.json` duplicado (con `overridesApplied`) junto a `provenance/spells/*.json`; `validate` lo acepta, pero ensucia el arbol.
- **D14.** `tasks.md` sin linea de estado de D2; `progress/current.md` anticuado.

## Decisiones que debe tomar el humano

1. **Q13/Q5/Q8 (texto reimpreso, erratas y fuente):** D1-D5 muestran que usar el texto de AoN tal cual mete reglas de otros libros. Recomendacion: corregir con overrides (como el de Summon Monster 1) las 5 capacidades de D1, las 2 dotes de D2, la nota de antipaladines y las variantes de Feather Tokens, Figurines, Golem Manuals y Mace of Smiting; o aceptar el desvio de forma explicita. Considerar el PRD oficial de Paizo como fuente de verdad del texto (es el CRB y ya esta contrastado aqui).
2. **Equipo (D4):** valores del CRB (PRD) o de AoN. Por fidelidad al manual impreso: PRD.
3. **Q11:** ratificar pociones, aceites y varitas con `expectedCount: 0` (el CRB solo trae formulas) o elegir fuente para filas genericas.
4. **Q6:** quien monta `/legal` (R40), si se anade la declaracion de Product Identity de Paizo, y que hacer con "Taldane/Chelaxians" y el parrafo de Katapesh.
5. **Q14/Q7 y alcance:** Special Materials (adamantina, mithril, plata alquimica: cambian coste y estadisticas de armas y armaduras del grupo), venenos, companeros animales, monturas y familiares: dentro de f3 o en otra feature.
6. **Q2** (nombres ES, todo `draft`), **Q9** (otras 4 clases), **Q10** (recuentos contra el impreso; ya cuadran con PRD y SourceDisplay), **Q15** (sin listas de hechicero/mago; sus niveles estan en `levels` y coinciden con el PRD).
7. **D6:** modelo de `extraDamage` con multiplicador de critico antes de que f6 lo consuma.

## Trazabilidad requirements a tests (resumen)

R1-R39 y R41-R103: [x] (al menos un test que cita cada R; revisados en detalle los de la seccion 3). R40: [ ] (admitido, espera Q6).
No existe ningun test que impida que reaparezca contenido no-CRB en `textEn` fuera de `classes`/`class-features` (el de classes.test.ts solo busca tres cadenas): por eso D1-D5 pasaron en verde.

## Tasks completas

T0.x, TA, TB, TC, TD0, TD.6, TE, TM.x, TZ.1-TZ.5: [x]. TDn.1-TDn.4: plantilla (D1, D3 y D4 marcados [x] en el propio fichero; D2 sin linea, D14).

## Checkpoints

- C1: [x] archivos base y 4 docs; `./init.sh` exit 0.
- C2: [x] una sola feature `in_progress`; las `done` con tests verdes; `progress/current.md` algo anticuado.
- C3: [x] capas, interfaces `RulesDataSource`, dependencias pineadas; sin console.log de depuracion, TODO ni secretos.
- C4: [x] tests por modulo; sin red en tests unitarios; 1604 tests verdes.
- C5: [ ] cada R<n> cubierto por al menos un test: R40 sin test (admitido); resto [x]. EARS: [x].

## Cambios requeridos (para pasar a APROBADO)

1. Corregir o decidir expresamente D1-D3 y D5 (overrides con `reason` y `evidence` contra el PRD oficial) y anadir un test que fije las listas CRB (hunter bond, montura del paladin, archery, rapid reload, numero de variantes de feather tokens, figurines y golem manuals).
2. Corregir D4 (valores del CRB o decision documentada) y D6 (multiplicador de critico).
3. Resolver D13 y D14 (menores) y marcar D8-D12 como aceptados o corregidos.
