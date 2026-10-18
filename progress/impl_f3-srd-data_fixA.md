# Implementación - f3-srd-data, Corrección A (texto no-CRB en entradas CRB + test guardián)

Estado: **implementada**, pendiente de reviewer. No se tocó `feature-list.json`, ni `package.json`, ni los goldens del spec; no se ejecutó `npm ci/install` ni `./init.sh`; no se hicieron commits. No se tocó `src/data/equipment`, `src/data/magic-items`, ni sus parsers/tests (Corrección B). Un único cambio compartido: la línea de la nueva regla en `src/data/integrity/index.ts` y en su test.

Criterio de la decisión del humano (fidelidad al manual impreso): la fuente de verdad del texto es el PRD oficial de Paizo (`https://paizo.com/pathfinderRPG/prd/coreRulebook/...`; hoy redirige a `legacy.aonprd.com/coreRulebook/...`, mismo contenido) contrastado con d20pfsrd. AoN sigue siendo la fuente del pipeline y cada desvío se corrige con un **override documentado** (`reason` + `evidence` con URL del PRD y cita literal), nunca editando a mano los JSON generados. Los JSON se regeneraron con `data:parse` (idempotente: dos pasadas dan el mismo hash).

## Verificación

| Comando | Resultado |
|---|---|
| `npx vitest run tests/data tests/scripts` | 76 ficheros / 1330 tests en verde |
| `npx vitest run` (suite completa del repo, con el estado actual de B) | 128 ficheros / 1926 tests en verde |
| `npx tsc --noEmit` | sin errores |
| `npx eslint .` | sin errores; `prettier --check` limpio sobre mis ficheros |
| `npm run -s data:validate` | `data:validate: sin errores.` (incluye la nueva regla `foreign-text` sobre las 12 categorías) |
| `data:parse --category class-features,feats,races,spells,skills,classes,domains` dos veces | mismo hash de los ficheros de datos y procedencia (R44) |

Red: solo para consultar el PRD de Paizo (unas 590 páginas: 550 de conjuros y 40 de clases, dotes, razas, habilidades y entorno, `User-Agent` identificable, ~1 petición/s) y 9 páginas de d20pfsrd. Las descargas viven en el scratchpad (fuera del repo). Sin procesos en segundo plano. `data:import` no hizo falta (todo se reparsea desde la caché).

## 1. Defectos del encargo: qué estaba mal y cómo se corrigió

Todos los overrides están en `src/data/overrides/` (formato R49, uno por capacidad/campo). Resumen:

| Entrada | Qué estaba mal (AoN) | Corrección | Evidencia (PRD + d20pfsrd) |
|---|---|---|---|
| `ranger.hunters-bond` | Lista de ~37 compañeros animales de otros libros (Antelope, Armorfish, Hobbe Hound, Marsupial Devil, Wolfdog..., Reef Snake repetido) y lista acuática ampliada | Lista del CRB: badger, bird, camel, cat (small), dire rat, dog, horse, pony, snake (viper or constrictor), wolf; acuático: shark | `classes/ranger.html` Hunter's Bond; d20pfsrd ranger (misma lista) |
| `paladin.divine-bond` | Dos listas de monturas por tamaño de otros libros (Camel, Elk, Giraffe, Eohippus, Wolfdog...) | «heavy horse (Medium) or pony (Small), although more exotic mounts, such as a boar, camel, or dog» | `classes/paladin.html` Divine Bond; d20pfsrd paladin |
| `druid.nature-bond` | Tercera forma «druidic herbalism» (Ultimate Wilderness) | Eliminado el párrafo; «one of two forms» | `classes/druid.html`; d20pfsrd la lista como «Nature Bond Variant (Optional)», fuente PZO9446 |
| `ranger.combat-style.archery` | Añade Crossbow Mastery al nivel 6 | «adds Improved Precise Shot and Manyshot» | `classes/ranger.html` Combat Style Feat |
| `rapid-reload` | Texto reimpreso de Ultimate Combat/Inner Sea (armas de fuego, `Exotic Weapon Proficiency (firearm)`), `needsReview` | Texto, prerrequisito (`raw` y `other`), `benefit`, `normal`, `special` del PRD (solo ballestas); `needsReview: false` | `feats.html` Rapid Reload |
| `extra-channel` | Frase del warpriest (Advanced Class Guide) | Eliminada en `textEn` y `special`; `needsReview: false` | `feats.html` Extra Channel; d20pfsrd |
| `summon-monster-1` | Quedaba «*Note:* Antipaladins may only summon evil creatures.» | Recortada con el override que ya existía (se amplía `reason`/`evidence`); el resto literal | `spells/summonMonster.html` (no tiene ninguna de las dos notas) |

Resúmenes ES (borrador, solo desde `textEn`) que citaban lo eliminado, reescritos: `ranger.combat-style.archery`, `rapid-reload`, `extra-channel`, `bard.lore-master`, y `paladin.smite-evil` (D10: ahora dice que la RD se ignora siempre y que el castigo se desperdicia si no es malvado; 300 caracteres, R30 en verde).

## 2. Búsqueda sistemática: encontrados vs corregidos

Método (reproducible, scripts en el scratchpad, no en el repo):
1. **Comparación frase a frase contra el PRD** (cada frase del `textEn` de ≥4 palabras, normalizada, debe aparecer en el PRD): 7 páginas de clase del PRD contra 240 class-features y 7 classes; `feats.html` contra las 176 dotes; las **540 páginas de conjuros del PRD** (+10 complementarias: Detect Evil/Good/Law, Dispel Good/Law, Protection from Good/Law, Magic Circle against Good/Law/Chaos) como corpus contra los 623 conjuros (también las celdas de las tablas); `races.html` contra las 7 razas; las 26 páginas de habilidad del PRD contra las 35 habilidades; la página de clérigo contra los 33 dominios.
2. Barrido de palabras guía sobre `textEn` de **todas** las categorías (antipaladin, warpriest, gunslinger, firearm, Advanced Class Guide, Ultimate *, Bestiary N, Inner Sea, archetype, hybrid class, mythic, Nethys, Golarion...). Es el origen de la regla `foreign-text` (sección 3).

| Hallazgo | Corregido |
|---|---|
| 5 del encargo en class-features/feats (hunters-bond, divine-bond, nature-bond, archery, rapid-reload, extra-channel) y summon-monster-1 | Sí (sección 1) |
| `bard.lore-master`: «even when threatened or distracted» no está en el PRD ni en d20pfsrd (la mecánica cambia: tomar 10 amenazado) | Sí, override con ambas fuentes |
| `planar-ally-lesser`: párrafo final sobre clérigos con «outsider subdomain» (los subdominios son del APG; el PRD termina en la nota de «calling spell») | Sí, override nuevo en `overrides/spells/l-r.json` |
| `improved-familiar`: la tabla de familiares mejorados del CRB estaba sustituida por «You can find the full list ... here.» (pérdida de contenido CRB) | Sí: tabla del PRD (10 criaturas + 3 notas) en `textEn` y `benefit` |
| Frases de navegación de la web de AoN (enlace colgante `**here**`) en `ranger.combat-style-feat`, `paladin.mercy`, `cleric.domains` y `barbarian.rage-powers` («a full list of Rage Powers from all sources») | Sí: se elimina solo la frase |
| **Razas (7)**: AoN muestra el texto ampliado de Advanced Race Guide / Inner Sea Races (párrafos de ambientación añadidos, listas de nombres, «inquisitors» y «alchemists» en half-orc, «Taldane»/«Chelaxians» y el «idioma étnico» en human) | Sí: el `textEn` descriptivo (hasta «Racial Traits») se sustituye por el del PRD (intro + Physical Description, Society, Relations, Alignment and Religion, Adventurers; sin listas de nombres); human: la frase de Languages (`textEn` y `traits.5.textEn`) del PRD; resumen ES de human corregido. Los rasgos raciales quedan como los muestra AoN (misma mecánica) y las 7 siguen `needsReview` |
| `diplomacy`: sección «Directing Crowds» (no está en la página de la habilidad del PRD) | **No se corrige a propósito**: es regla del CRB (pg. 436, Environment > Urban adventures; verificado en `environment.html` del PRD) y AoN la lista como «Skill Use» del CRB; un test del Lote B ya lo fijaba. Un primer override que la quitaba se descartó |
| Domains, classes (textos), resto de dotes/conjuros/habilidades | Sin contenido de otros libros |

Diferencias AoN frente al PRD **sin contenido de otros libros** que NO se han corregido (redacción, erratas, o fuentes que discrepan; para decisión humana, Q5):
- Erratas de redacción/tipográficas: `barbarian.uncanny-dodge` («Dex» por «Dexterity»), `bard.bardic-knowledge`, `cleric.domain.luck.good-fortune`, `cleric.domains` («activating» por «using»), `elemental-channel` («no affect»), `improved-overrun` («overrrun»), `penetrating-strike`/`greater-penetrating-strike`, `shield-master`, `improved-vital-strike`, `cats-grace-mass`, `cure-critical-wounds`(+mass), `inflict-serious-wounds`, `daze-monster`, `detect-magic` («eminates»), `glyph-of-warding`, `gust-of-wind`, `light`, `limited-wish`, `mages-private-sanctum` (género), `reincarnate`, `power-word-blind/stun`, `spell-turning`, `teleport`, `create-greater-undead`, `giant-vermin`, `contact-other-plane` (filas de tabla), y la redacción de los rasgos raciales de las 7 razas.
- **Mecánica distinta entre PRD y AoN, sin poder decidir cuál es la del impreso** (no se tocan; el PRD es de 2011 y AoN trae las erratas posteriores): los 8 `symbol-of-*` («A rogue (only) can use the Perception skill...» en AoN; «any character can use Perception ... only a character with the trapfinding class feature can use Disable Device» en el PRD; d20pfsrd no trae la nota) y `unhallow` («+4 profane bonus» en AoN frente a «+4 sacred bonus» en el PRD; el lógico es «profane»). Propongo que decida el humano con el libro.
- `ranger.favored-terrain` (D7 del review): la tabla de terrenos sí está en `textEn`; no era un defecto.

## 3. Test guardián: `foreign-text` (R27, texto)

- `src/data/integrity/foreign-text.ts`: regla `foreignTextRule` registrada en `INTEGRITY_RULES` (tras `book-filter`), por tanto en `data:validate` y `runIntegrity`. Recorre cada entrada de las 12 categorías de entradas y escanea **todo `textEn` anidado** (también `variants[].textEn` de objetos mágicos y `traits[].textEn` de razas). Hallazgos `foreign-text.<patrón>` con la coincidencia, el campo y un extracto.
- Patrones (`FOREIGN_PATTERNS`): `other-book` (títulos: Advanced Player's/Class/Race Guide, Ultimate *, Bestiary 2-6, Inner Sea *, Occult/Mythic Adventures, Monster Summoner's Handbook...), `other-book-abbreviation` (APG, ACG, ARG, UM, UC, UE...), `other-class` (antipaladin, warpriest, gunslinger, arcanist, bloodrager, skald, swashbuckler, magus, inquisitor, cavalier, kineticist, witch, summoner...), `other-rule` (hybrid class, archetype, subdomain, mythic tier/path..., alternate racial trait, favored class option, teamwork feat), `firearms`, `other-book-content` (nombres concretos hallados en esta revisión: Crossbow Mastery, druidic herbalism, Hobbe Hound, Marsupial Devil, Armorfish, Wolfdog...), `aon-editorial` (Nethys, `**here**`, «full list of ... here»...) y `setting` (Golarion, Taldane, Chelaxian, Katapesh, Mwangi...).
- **Lista de excepciones explícita** (`FOREIGN_TEXT_ALLOWLIST`, entradas `{category,id,pattern,match?,reason}`): **vacía hoy** porque no hay ninguna coincidencia legítima en los datos (las palabras de uso común del CRB —alchemist's fire, «treasure hunters», «the staff of the magi», «the tribe's shaman», «(see the Pathfinder RPG Bestiary)», «mythic history»— se evitaron afinando los patrones, no con excepciones). La regla exige motivo y patrón existente y marca como `foreign-text.allowlist-stale` la excepción que deje de hacer falta.
- Limitación asumida: es una red por palabras guía; el contenido ajeno sin palabra guía (listas de animales, variantes) se cubre con los pines de `tests/data/crb-text-fidelity.test.ts` y con la comparación contra el PRD hecha aquí.
- **Demostración de fallo y de pase** (`tests/data/integrity/foreign-text.test.ts`): inyección sintética en las 12 categorías (falla con `firearms`, `other-book`, `other-class`); cada patrón con un ejemplo; variantes y rasgos anidados; caso verde; excepciones (match, sin match, obsoleta, sin motivo); sobre los **datos reales**: 0 hallazgos en todas las categorías, y una inyección sobre una entrada real de cada categoría falla. Aplicada a los datos de `HEAD` (antes de esta corrección) la regla marcaba 20 entradas: las de este informe más `dog-guard`, `dog-riding`, `pack-animal-donkey-mule`, `feather-tokens`, `figurines-of-wondrous-power` y `golem-manuals` (equipo/objetos mágicos: ya corregidos por la Corrección B, hoy 0).

## 4. Defectos de gravedad baja

- **D8 descriptores y subescuelas** (`scripts/srd/parsers/spells.ts` `parseSchoolLine`): «[see text]» y «[see text for lesser planar ally]» ya no producen descriptor (`descriptors: []`, contador «descriptores see text omitidos» en el informe de parseo); «[fire or cold]» -> `["fire","cold"]`; «(calling or creation)» -> `subschool: "creation"` + `additionalSubschools: ["calling"]`; «(figment, glamer)» -> `figment` + `["glamer"]`. Un valor fuera del catálogo del CRB detiene el parseo. **Extensión del schema a ratificar** (`src/data/schema/spell.ts`): catálogos cerrados `SPELL_SUBSCHOOLS` (14) y `SPELL_DESCRIPTORS` (25), `subschool` y `descriptors` pasan de `Kebab` a enum, y campo opcional `additionalSubschools`. No cambia ningún golden ni ningún valor válido anterior; cambia 28 conjuros en total (los 17 con «[see text...]» —align weapon, summon monster 1-9, planar ally/binding y sus versiones lesser/greater—, fire shield, gate, mislead y los 9 con cursivas en `raw`; summon monster 1 y planar ally lesser, además, por su override de texto).
- **D9 cursivas en `raw`**: `stripEmphasis` en el parser de conjuros (sin tocar `lib/html.ts`, que usa también Corrección B); 10 `raw`/`details` corregidos (control water, energy drain, fire shield, hallow, ironwood, major/minor creation, scare, transformation, unhallow). Test: ningún `raw` de los 623 conjuros contiene `*`.
- **D10**: resumen ES de smite evil reescrito (sección 1).
- **D13** (`scripts/srd/cli.ts`): `data:parse` de una categoría por lotes sin subconjunto ya no crea `provenance/spells.json`; anota cada override en la procedencia de **su** lote (`overrides/<cat>/<lote>.json`); falla con mensaje si el override no está en un fichero de lote o si hay `importedKinds`. El duplicado no existía en el árbol (comprobado: `ls src/data/provenance`); tras `data:parse --category spells` completo sigue sin existir. Tests en `tests/scripts/srd/cli.test.ts`.
- **D14**: añadida la línea de estado de D2 (`e-k`) en `specs/f3-srd-data/tasks.md`.

## 5. Decisiones y desviaciones a ratificar

1. Extensión del schema de conjuros (D8) descrita arriba (el design §4.4 tenía `subschool: z.string().optional()`).
2. Overrides de razas, hechos por la misma regla que el resto (texto de otro libro dentro de una entrada CRB) aunque la categoría no figuraba en la lista del encargo; los rasgos raciales NO se tocan.
3. `needsReview` pasa a `false` por override en `extra-channel` y `rapid-reload` (su texto ya es el del PRD). Las 7 razas siguen `needsReview: true` (redacción de rasgos pendiente de decisión). El test R17 de `tests/data/feats.test.ts` se actualizó para comprobar que el parser las marcó y el override las cierra.
4. Evidencia: las URLs `paizo.com/pathfinderRPG/prd/...` redirigen (301) a `legacy.aonprd.com/coreRulebook/...`; se citan las de Paizo como pidió el humano.

## 6. Casos que no se han podido resolver / quedan abiertos

- Los 8 `symbol-of-*` y `unhallow` (sección 2): PRD y AoN discrepan en mecánica y no hay forma de saber cuál es el impreso sin el libro.
- Redacción de los rasgos raciales y erratas listadas: sin cambio mecánico comprobado, no se tocan (Q5).
- Fuera de mi alcance y de la regla (cubierto por Corrección B): equipo mundano y objetos mágicos (D4, D5, D6).

## 7. Trazabilidad R -> test (lo tocado en esta corrección)

| R | Test |
|---|---|
| R27 (texto sin otros libros, cualquier categoría) | `tests/data/integrity/foreign-text.test.ts` (inyección sintética y real, patrones, excepciones), `tests/data/crb-text-fidelity.test.ts` (pines contra el PRD: hunters-bond, divine-bond, nature-bond, archery, lore-master, rapid-reload, extra-channel, improved-familiar, summon-monster-1, planar-ally-lesser, razas), `tests/data/integrity/index.test.ts` (regla registrada) |
| R49 (overrides con `reason` y `evidence`) | `tests/data/crb-text-fidelity.test.ts` (cada override cita el PRD), `tests/data/feats.test.ts` (override de `needsReview` registrado en la procedencia), `validate` (`overrides.not-applied`/obsoleto) |
| R96, R101 (descriptores y subescuelas) | `tests/scripts/srd/parse-spells.test.ts` (`parseSchoolLine`, `stripEmphasis`), `tests/data/crb-text-fidelity.test.ts` (catálogos y casos reales, `raw` sin cursivas) |
| R98 (procedencia por lotes) | `tests/scripts/srd/cli.test.ts` («categoría por lotes sin subconjunto») |
| R30 (resúmenes) | `data:validate` y `runIntegrity` sobre datos reales en los tests de categoría |

## 8. Ficheros

- Nuevos: `src/data/integrity/foreign-text.ts`, `src/data/overrides/{class-features,feats,races}.json`, `src/data/overrides/spells/l-r.json`, `tests/data/integrity/foreign-text.test.ts`, `tests/data/crb-text-fidelity.test.ts`.
- Modificados: `scripts/srd/cli.ts`, `scripts/srd/parsers/spells.ts`, `src/data/schema/spell.ts`, `src/data/integrity/index.ts`, `src/data/overrides/spells/s-z.json`, datos regenerados por `data:parse` (`class-features/{barbarian,bard,cleric,druid,paladin,ranger}.json`, `feats/{e,i,r}.json`, `races.json`, `spells/{a,c,e,f,g,h,i,m,p,s,t,u}.json`, `provenance/{class-features,feats,races}.json`, `provenance/spells/l-r.json`), resúmenes (`summaries/class-features/{bard,paladin,ranger}.json`, `summaries/feats/{e,r}.json`, `summaries/races/races.json`), `specs/f3-srd-data/tasks.md` (línea D2), `progress/current.md`, y los tests `tests/data/feats.test.ts`, `tests/data/integrity/index.test.ts`, `tests/scripts/srd/{cli,parse-spells}.test.ts`.
- `src/data/glossary.es.json` no se regeneró (no hay claves nuevas en mi parte; el cambio que figura en el árbol es de la Corrección B).
