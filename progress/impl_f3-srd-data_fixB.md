# Implementación - f3-srd-data, Corrección B (equipo, objetos mágicos de otros libros, modelo de `extraDamage`)

Estado: **implementado** (pendiente de reviewer). No se tocó `feature-list.json`, no se marcó `done`, no se hicieron commits, no se ejecutó `npm ci/install` ni `./init.sh`, no se editó `package.json`, no quedan procesos en segundo plano. No se tocaron `src/data/{classes,class-features,feats,spells,domains}` ni sus parsers/tests (trabajo de la Corrección A); el agregador de integridad solo recibe una regla nueva de `magic-refs.ts` (ver §4).

Criterio del humano aplicado: fuente de verdad de VALORES y TEXTO del CRB = **PRD oficial de Paizo** (`https://paizo.com/pathfinderRPG/prd/coreRulebook/...`; hoy redirige a `legacy.aonprd.com/coreRulebook/...`, copia oficial del PRD; consultado el 2026-10-17, 1 petición/s, User-Agent identificable). AoN sigue siendo la fuente del pipeline; todo desvío se corrige con **override** (`reason` + `evidence` con URL del PRD y cita literal) o, si es sistemático, con una mejora del parser. Ningún JSON generado se ha editado a mano sin override. Los scripts de extracción y de generación de overrides viven en el scratchpad de la sesión (fuera del repo); lo que queda versionado es el resultado: `src/data/overrides/{gear,weapons,magic-items}.json` y dos fixtures del PRD para los tests.

## 1. Resumen de lo corregido

| Defecto (reviewer) | Corrección |
|---|---|
| D4 equipo con valores distintos del PRD | 40 entradas de `gear` con override (120 campos), 6 de `weapons` marcadas `needsReview`; alias de id para 3 fichas; 8 recetas alquímicas de UE retiradas. Comparación sistemática de `gear` (161 filas + 3), armas (80), armaduras (12) y escudos (6) contra las tablas del PRD, ahora **fijada con un test** (`tests/data/equipment-prd.test.ts`, 251 tests) |
| D5 objetos mágicos de otros libros | `feather-tokens` 14 a 6 variantes, `figurines-of-wondrous-power` 22 a 9, `golem-manuals` 31 a 5, `mace-of-smiting` sin la variante «lesser»; sección `Resonance` de UE fuera de las 16 piedras ioun (mejora del parser); 21 entradas con override en total (55 campos) |
| D6 `extraDamage` sin multiplicador de crítico | Campo `critMultiplier`, regla de exclusión, `functionsAs` y API `getExtraDamage` / `getWeaponAbilitiesExtraDamage` (§4) |
| Defecto nuevo hallado | AoN escribe `×` como U+001F en 2 páginas (flaming burst, una armadura); ese carácter rompía la lectura de multiplicadores. Corregido en `loadHtml` (todas las categorías) |

## 2. Equipo (`gear`, `weapons`, `armor`, `shields`)

### 2.1 Método de comparación sistemática

Tablas del PRD (`equipment.html`: *Goods and Services*, *Weapons*, *Armor and Shields*) copiadas en `tests/data/fixtures/prd-equipment.json` (161 filas de bienes, 89 de armas, 21 de armaduras/escudos/extras) y contrastadas por un test no circular con los datos reales. Resultado:

| Categoría | Filas PRD | Resultado antes de corregir | Ahora |
|---|---|---|---|
| gear (Goods and Services) | 161 (+3 extras de armadura) | 131 coinciden en coste y peso; 30 difieren: **20 de valor o peso** (tabla de §2.2) y 10 solo de formato (§2.2, «aceptadas») | 161/161 + 3 extras |
| weapons | 89 filas (80 armas + munición repetida + 2 escudos-arma) | 80/80 coinciden en coste, daño P/M, crítico, alcance, peso y tipo | sin cambios |
| armor | 12 | 12/12 (bono, Des máx., ACP, fallo arcano, velocidad, peso, coste) | sin cambios |
| shields | 6 | 6/6 (incluido el escudo pavés: +4, Des máx. +2, -10, 50 %) | sin cambios |

Excepciones de `weapons` que NO son diferencias: filas de coste «special» en el PRD (`light-shield` 3 gp/9 gp, `heavy-shield` 7 gp/20 gp, `spiked-armor` +50 gp, `spiked-*-shield`): AoN da el desglose del coste del escudo y se acepta; la fila «Flail» del PRD es `light-flail` en los datos (nombre de AoN); munición y asedio: ver §2.4.

### 2.2 Diferencias encontradas en `gear` y su resolución

Cada una con override (`src/data/overrides/gear.json`); `evidence` = fila del PRD citada literalmente.

| Entrada | AoN (antes) | PRD (CRB) | Resolución |
|---|---|---|---|
| shovel-common | «Shovel, common» 2 cp / 3 lb | «Shovel or spade» **2 gp / 8 lb** | nombre, coste, peso y texto del PRD; id nuevo `shovel-or-spade` (alias) |
| soap | 1 cp / 1/2 lb | «Soap (per lb.)» **5 sp / 1 lb** | coste y peso |
| wagon-light | «Wagon (light)» 50 gp, peso corrupto «3 cp (heavy)...», variantes ligera/mediana/pesada de UE | «Wagon» **35 gp / 400 lb** | nombre, coste, peso, texto; id nuevo `wagon` (alias) |
| cart, carriage, rowboat, sled | sin peso; «Price of Passage (per mile)» de UE | **200 / 600 / 100 / 300 lb**; sin precio de pasaje | pesos y texto del PRD; stats sin el pasaje |
| coach-cab, ships-passage | precio «—»; el precio estaba en «Price of Passage» | «3 cp per mile», «1 sp per mile» | `costCp` 3 y 10 (misma convención que messenger/hireling) |
| holly-and-mistletoe | 0 gp | «—» (sin precio) | `costCp` null, `costRaw` «—» |
| locked-gauntlet | coste «+8 gp» (sumando) | «8 gp» (precio del guantelete); solo el peso es «+5 lbs.» | `costRaw` «8 gp» (`costCp` igual, 800) |
| dog-guard, dog-riding, donkey-or-mule (antes `pack-animal-donkey-mule`), horse-* (6) | pesos del Bestiario (25/50 lb, 600 lb, 800-3000 lb); variantes de otros libros en la ficha (perro faldero, buey, yak, «Bestiary 3»); párrafo de Golarion (Mwangi Expanse, Inner Sea, Katapesh) | peso «—» (los animales no pesan en el CRB); sin esas variantes | `weightLb` null, precio propio en `stats`, texto del PRD; `donkey-or-mule` (alias) |
| backpack-common, chest-small, grappling-hook-common, pot-common, inn-stay-* (3), whistle-signal, holy-symbol-silver/wooden, manacles-common/masterwork | la ficha agrupa variantes de UE: mochilas carrier/hydration/masterwork/weaponrack, cofres mediano/grande/enorme, gancho y olla de mithral (2.001 gp), suites (4/16/32 gp), silbato silencioso, símbolos de oro/hierro/platino, grilletes de mithral (1.000 gp) | solo la fila del CRB | `stats` y `textEn` con solo el objeto del CRB |
| acid, alchemists-fire, antitoxin, smokestick, sunrod, tanglefoot-bag, thunderstone, tindertwig | sección «Alchemical Recipe» (receta y CD de Ultimate Equipment) y frases como «Crafting this item is a DC 25 Craft (alchemy) check» | descripción sin receta | `textEn` = cabecera + descripción del PRD |

Diferencias aceptadas sin cambio (cosméticas): transportes de mar y servicios con `weightRaw` «» frente a «—» del PRD (ambos = sin peso, `weightLb` null); barding «×2»/«×1» (el «2» del PRD es la nota al pie); «Caster level × spell level × 10 gp» en minúscula.

Ids: se resuelven con `scripts/srd/config/slug-aliases.json` (categoría nueva `gear`: `shovel-common` a `shovel-or-spade`, `wagon-light` a `wagon`, `pack-animal-donkey-mule` a `donkey-or-mule`), de modo que `ids.slug` de la integridad sigue exigiendo id = slug del nombre. Resúmenes ES y glosario de esas 3 fichas renombrados; resúmenes de las 20 con cifras cambiadas reescritos desde el nuevo `textEn` (borrador); `glossary.es.json` regenerado con `data:glossary`.

### 2.3 Texto de equipo: lo que NO se ha unificado con el PRD

Aparte de lo anterior, el texto de AoN para el equipo es la edición de Ultimate Equipment. Comparación párrafo a párrafo con el PRD sobre las 164 fichas (estado final): 41 idénticas al PRD, 6 sin descripción en el PRD o en AoN, **117 con redacción distinta** (frases de ambientación añadidas, p. ej. «This leather knapsack...», «Tankards are commonly made out of clay or tin»). En las que el PRD da reglas (cargas, CD, bonos) las cifras coinciden (comparación de cifras de las descripciones: sin diferencia mecánica salvo lo ya corregido arriba). No se han reescrito porque no hay defecto de reglas; si el humano quiere el texto literal del CRB para todo, hace falta una importación del PRD (hoy `ALLOWED_SOURCE_HOSTS`/R6 solo admite AoN y d20pfsrd) o ~117 overrides más: **decisión del humano** (§7).

### 2.4 Armas: munición y asedio

- `blowgun-darts-10`: el PRD da peso «—» (igual que los datos); d20pfsrd lista 1 lb; no se ha podido cotejar con el impreso. Marcado `needsReview` con motivo (override en `overrides/weapons.json`). Nota: el encargo decía que el PRD no incluye los dardos; sí los incluye (fila «Darts, blowgun (10)» con peso «—»), lo que no resuelve la duda con el impreso.
- Máquinas de asedio (`ballista-light`, `catapult-heavy`, `catapult-light`, `ram-large`, `siege-tower-large`): el PRD del CRB no las incluye (AoN las etiqueta «Ultimate Combat pg. 160, PRPG Core Rulebook pg. 435»). Marcadas `needsReview` con motivo. No se inventa ningún valor.

## 3. Objetos mágicos

### 3.1 Variantes y objetos de otros libros dentro de entradas CRB

Patrón buscado en las 13 clases de objeto: (a) variantes de precio de AoN frente a las del PRD, (b) citas a otros libros en el texto, (c) secciones de otro libro, (d) objetos presentes en los datos y ausentes del PRD. Casos y resolución:

| Caso | Hallazgo | Resolución |
|---|---|---|
| `feather-tokens` | 14 variantes (CRB: 6); aura «varies», CL «varies», peso 1 lb frente a «strong conjuration», 12th, «—»; cita *Ultimate Combat* | override: 6 variantes del CRB (anchor, bird, fan, swan boat, tree, whip) con precio y construcción del PRD, texto, aura, CL 12, peso |
| `figurines-of-wondrous-power` | 22 variantes (CRB: 9); cita *Mythic*, *Bestiary* | override: 9 variantes (bronze griffon, ebony fly, golden lions, ivory goats, marble elephant, obsidian steed, onyx dog, serpentine owl, silver raven) |
| `golem-manuals` | 31 variantes (CRB: 5); sin construcción; cita *Construct Handbook*, *Lost Kingdoms*, *Ultimate Equipment*; `sourceRef` «PRPG Core Rulebook pg. 1» (error de AoN) | override: 5 variantes (clay, flesh, iron, stone, stone guardian), construcción y texto del PRD; `sourceRef` = «PRPG Core Rulebook» **sin página** (el PRD no numera páginas y no se inventa); `needsReview` false |
| `mace-of-smiting` | variantes «lesser» y «normal» (la lesser es de UE) | override: una sola versión (+3 adamantine heavy mace, 75.312 gp, CL 11); con la versión única `enhancement` +3 y `baseEvidence` quedan inequívocos y se quita `needsReview` |
| 16 piedras ioun | cada ficha lleva la sección **Resonance** (regla de UE/Adventurer's Guide; el PRD no la tiene) | **mejora del parser** (`OTHER_BOOK_SECTIONS` en `header.ts`): se lee pero se omite de `textEn` y se cuenta en el informe; los resúmenes ES dejan de hablar de Resonancia; `needsReview` de las 16 desaparece (precios y efectos coinciden con la tabla del PRD: test) |
| Variantes de precio restantes | `ring-of-protection`, cinturones, diademas, capas, manuales/tomos, `bracers-of-armor`, `crystal-ball`, `bag-of-holding`, `carpet-of-flying`, `pearl-of-power`, `strand-of-prayer-beads`, `ring-of-wizardry`, varas metamágicas, `slaying-arrow`, `necklace-of-fireballs`, `luck-blade`... | **coinciden con el PRD** en etiquetas y cifras; sin cambios |
| Objetos presentes en los datos y ausentes del PRD | ninguno (las 442 entradas se corresponden con fichas del PRD o con los 16 «Ioun Stone») | n/a |
| Objetos del PRD ausentes en los datos | `bag-of-tricks` (gray/rust/tan) y `lens-of-detection` (`knownGaps`: la fuente AoN no tiene texto CRB). **El PRD sí los trae** | no se añaden en esta corrección (el mecanismo de importación no admite el PRD); candidata clara para una entrega posterior, ver §7 |

### 3.2 Diferencias de cabecera y construcción frente al PRD (override, `overrides/magic-items.json`)

Comparación de aura, ranura, peso, precio y coste/requisitos de construcción de las 348 fichas del PRD (`tests/data/fixtures/prd-magic-items.json`) con los datos. Diferencias reales y resolución:

| Entrada | AoN (UE) | PRD | Resolución |
|---|---|---|---|
| net-of-snaring | peso 1 lb | 6 lbs. | override |
| poisonous-cloak | aura moderate transmutation | strong abjuration | override |
| armor-of-rage | ranura «armor» | «body» | override |
| bracers-of-defenselessness | ranura «wrists» | «arms» | override |
| berserking-sword | peso 8 lbs. | 12 lbs. | override |
| manual-of-bodily-health, -gainful-exercise, -quickness-of-action, tome-of-clear-thought, -leadership-and-influence, -understanding | aura «strong universal» | «strong evocation (if miracle is used)» | override |
| ring-of-energy-resistance | una aura y CL 11 para todas | faint/3.º (minor), moderate/7.º (major), moderate/11.º (greater) | override: aura y CL por variante |
| rod-of-enemy-detection | coste de construcción 23.500 gp (= el precio) | 11.750 gp | override |
| frost-brand, nine-lives-stealer, trident-of-fish-command, slaying-arrow | coste redondeado | «27,375 gp and 5 sp», «11,528 gp 5 sp», «9,482 gp and 5 sp», «1,144 gp 5 sp» | override (`costCp` con los 5 sp) |
| bracers-of-armor | cita «Table 3–3: Armor Special Abilities» | «Table: Armor Special Qualities» | sin cambio (referencia de texto, mismas reglas) |

**Aceptadas sin cambio (formato, no contenido):** ranura «wrist»/«wrists» (vocabulario de UE), «none» frente a «—», auras «varies/varied» frente a la lista de escuelas, etiquetas de alineamiento `[good]`/`[evil]`, orden de requisitos, `Weight 12 lbs. (for four)` y similares. Documentadas en `tests/data/magic-items-prd.test.ts` (`EXCEPTIONS`).

**Caso ambiguo NO resuelto, no se toca:** `staff-of-illumination`, coste de construcción AoN 25.750 gp (la mitad del precio 51.500 gp, como pide la regla general) frente a **20.750 gp** en el PRD. El PRD es internamente incoherente con su propia regla; sin el impreso no se decide. Excepción documentada en el test.

### 3.3 Texto de Ultimate Equipment en los objetos mágicos

Comparación párrafo a párrafo y por cifras con el PRD (323 fichas con contraparte): 310 tienen al menos un párrafo con redacción distinta (frases de ambientación añadidas por UE, p. ej. «Flecks of silver or steel are often sown amid the fabric of these magical cloaks», «This ring generates...»). La comparación de cifras de las descripciones deja **20** fichas con alguna diferencia numérica; revisadas una a una: ruido de formato del PRD (precios y tablas pegados), conversiones equivalentes (`broom-of-flying`: 900 pies = 300 yardas), referencias («Table 3–3»), y las ya corregidas arriba. Una redacción sí cambia una regla y queda como hallazgo: `chime-of-opening` (AoN: arcane lock «lanzado por un spellcaster de nivel menor que 15», PRD: «wizard»). No se corrige ficha a ficha (mismo motivo que §2.3); es el argumento principal para la decisión sobre una importación del PRD (§7).

Hallazgo menor: las fichas individuales de piedras ioun no traen el párrafo general del CRB (flotan a 1d3 pies, AC 24, 10 pg, dureza 5; coste de creación = mitad del precio).

## 4. Modelo de `extraDamage` con multiplicador de crítico (D6)

### 4.1 El defecto

`flaming-burst` guardaba tres entradas `onCritical` (1d10, 2d10, 3d10) sin distinguir el multiplicador del arma; un consumidor que las sumase daba **6d10** en vez de 1d10 (×2), 2d10 (×3) o 3d10 (×4). Texto del PRD (`magicItems/weapons.html#weapons-flaming-burst`): «deals an extra 1d10 points of fire damage on a successful critical hit. If the weapon's critical multiplier is ×3, add an extra 2d10 points of fire damage instead, and if the multiplier is ×4, add an extra 3d10 points of fire damage.» Mismo patrón en *icy burst* (frío), *shocking burst* (electricidad) y *thundering* (1d8/2d8/3d8 sónico). Los demás `extraDamage` (flaming, frost, shock, merciful, vicious, bane, holy/unholy/anarchic/axiomatic, dwarven thrower, oathbow, shifter's sorrow, sylvan scimitar) no dependen del multiplicador. Otros objetos que cambian el multiplicador sin dados (mace of smiting, oathbow, sun blade, staff of power) quedan solo en texto.

Desvío del spec: `design.md` §14.4 decía «f3 no afirma cómo se multiplica en crítico: eso lo decide f6». Con el modelo anterior eso permitía el error de suma; es un defecto de modelo (aprobado por el reviewer), no un requisito nuevo. R78 (dados, tipo, disparador, evidencia) se mantiene; se añade información, no se quita.

### 4.2 Cambios

- `src/data/schema/magic-item.ts`: `ExtraDamageSchema.critMultiplier?: 2 | 3 | 4`, solo válido con `trigger: "onCritical"`; `critAlternativeIssues` (exportada) exige que varias `onCritical` del mismo tipo de daño lleven todas multiplicador y distinto en cada una (el schema de la variante lo aplica: el defecto de sumar es ahora **irrepresentable**). Nuevo campo `functionsAs?: string[]` en `weapon-ability`.
- `scripts/srd/parsers/magic-items/effects.ts`: `extractExtraDamage` asigna `critMultiplier` a cada alternativa («×3», «×4» del texto; la base sin multiplicador es ×2 solo cuando el texto distingue multiplicadores). `index.ts`: `functionsAs` desde «functions as a *flaming* weapon» / «frost» / «shock» (nombre resuelto contra las habilidades de arma).
- `src/data/integrity/magic-refs.ts`: R84 para `functionsAs` (existe como `weapon-ability` y no se apunta a sí misma); R78: un `critMultiplier` ×3/×4 exige «×N» en `textEn`.
- `src/data/magic-items/extra-damage.ts` (nuevo): la API de consulta.
- Datos regenerados: `flaming-burst`, `icy-burst`, `shocking-burst`, `thundering` con `critMultiplier` 2/3/4; los tres *burst* con `functionsAs` (`flaming`, `frost`, `shock`).

### 4.3 API para f6 (calculadora de daño)

```ts
import {
  getExtraDamage, getWeaponAbilitiesExtraDamage, weaponCritMultiplier,
  type HitContext, type ResolvedExtraDamage,
} from "src/data/magic-items/extra-damage";

interface HitContext { critical: boolean; critMultiplier?: 2 | 3 | 4 }   // multiplicador OBLIGATORIO si critical
interface ResolvedExtraDamage { applied: ExtraDamage[]; conditional: ExtraDamage[] }

// 1) Una variante (p. ej. getEntry("flaming-burst").variants[0]):
getExtraDamage(variant, hit): ResolvedExtraDamage
// 2) Un arma con varias habilidades (abilityIds de un objeto específico, p. ej. Flame Tongue = ["flaming-burst"]):
getWeaponAbilitiesExtraDamage(abilityIds, lookup /* id -> weapon-ability */, hit, variantId?): ResolvedExtraDamage
// 3) Multiplicador del arma base (weapons.json); "secondary" = extremo ×4 de las armas dobles x3/x4:
weaponCritMultiplier(weapon, end = "primary"): 2 | 3 | 4 | undefined
```

Reglas: `applied` = daño `always` + `onCritical` que aplican (solo si `hit.critical`, y la alternativa cuyo `critMultiplier` iguala el del golpe, o las que no lo declaran); `conditional` = daño `conditional` (contra criaturas alineadas, solo al aire libre...): **nunca se suma solo**, la UI lo muestra como interruptor con `conditionText`. Un golpe crítico sin `critMultiplier` lanza `RangeError`. `getWeaponAbilitiesExtraDamage` expande `functionsAs` de forma transitiva y sin repetir (flaming burst incluye el 1d6 `always` de flaming; si llegan `flaming` y `flaming-burst` no se cuenta dos veces) y lanza si el id es desconocido. Ejemplos verificados por test contra el texto del PRD: espada con *flaming burst* normal 1d6 fuego; crítico ×2 1d6+1d10; ×3 1d6+2d10; ×4 1d6+3d10; *thundering* ×3 2d8 sónico; martillo gnomo de gancho con el extremo ×4 y *flaming burst* 3d10. f6 solo debe sumar `applied` (más los toggles `conditional` que active el usuario). Los dados de `applied` NO se multiplican por el crítico del arma: PRD `combat.html`, «Multiplying Damage», «Exception: Extra damage dice over and above a weapon's normal damage are never multiplied.» (consultado el 2026-10-17); el multiplicador solo cambia QUÉ dados extra se añaden (1d10/2d10/3d10), no cuántas veces se tiran.

## 5. Cambios de mecanismo (fuera de los datos)

- `scripts/srd/parsers/magic-items/header.ts`: `OTHER_BOOK_SECTIONS` / `isOtherBookSection` (hoy solo `Resonance`); `itemMarkdown` omite esas secciones; `index.ts` ya no marca `needsReview` por Resonance y cuenta «secciones de otro libro omitidas del texto (Resonance)» en el informe.
- `scripts/srd/lib/html.ts`: `loadHtml` restituye `×` donde AoN escribe U+001F (afectaba a `flaming-burst` y a una armadura de `armor.json`: «2d4 × 100»).
- `scripts/srd/config/slug-aliases.json`: categoría `gear` (3 alias).
- `src/data/overrides/{gear,weapons,magic-items}.json` (nuevos): 120 + 6 + 55 correcciones, todas con `reason` y `evidence`.
- Resúmenes ES (borrador, solo desde el nuevo `textEn`) y glosario: `summaries/gear/gear.json`, `summaries/magic-items/{wondrous,specific-weapon}.json`, `glossary/gear.es.json`; `glossary.es.json` regenerado (si la Corrección A lo regenera después, es determinista a partir de los shards).

## 6. Recuentos

- Entradas por categoría **sin cambio**: weapons 87, armor 12, shields 6, gear 164, magic-items 442 (por `kind`: weapon-ability 30, armor-ability 17, shield-ability 14, specific-weapon 30, specific-armor 12, specific-shield 8, ring 34, rod 24, staff 21, wondrous 190, cursed 29, artifact 12, general 21). Los `expectedCount`/`expectedCountByKind`/`magic-sections.json` no cambian porque las variantes no se cuentan (el cambio de variantes por entrada se documenta aquí: feather tokens 14 a 6, figurines 22 a 9, golem manuals 31 a 5, mace of smiting 2 a 1).
- `needsReview`: objetos mágicos 27 a 9 (`animated`, `ghost-touch-weapon`, `mithral-heavy-shield`, `adamantine-battleaxe`, `holy-avenger`, `javelin-of-lightning`, `screaming-bolt`, `shatterspike`, `sword-of-the-planes`; salen las 16 piedras ioun, `golem-manuals` y `mace-of-smiting`); weapons 0 a 6 (dardos de cerbatana y 5 máquinas de asedio, §2.4); gear sin cambio (0).
- `provenance/{gear,weapons,magic-items}.json`: `overridesApplied` con los overrides nuevos. `data:parse --category gear,weapons,armor,shields,magic-items` ejecutado dos veces: salida idéntica (md5).

## 7. Casos NO resueltos y decisiones para el humano

1. **Texto de UE en equipo y objetos mágicos** (§2.3, §3.3): 117 fichas de `gear` y 310 de `magic-items` con redacción distinta del PRD, mecánica igual en lo comprobado salvo `chime-of-opening`. Opciones: aceptar (reimpresión), importar el texto del PRD como fuente (ampliar R6 con `legacy.aonprd.com` / `paizo.com` y un parser del PRD, que además daría `bag-of-tricks` y `lens-of-detection`), o overrides ficha a ficha.
2. **`staff-of-illumination`**: coste 25.750 gp (AoN, regla general) o 20.750 gp (PRD, incoherente con su precio). Sin tocar.
3. **Dardos de cerbatana y máquinas de asedio**: `needsReview` hasta cotejar el impreso.
4. **`golem-manuals.sourceRef`** sin número de página (el PRD no numera páginas); el número real del CRB impreso no está verificado.
5. **Piedras ioun**: falta el párrafo general del CRB en las 16 fichas (§3.3).
6. Los goldens del spec no se modificaron. Sigue la discrepancia previa de Flame Tongue (`flaming` + `flaming-burst` frente a la fuente «+1 flaming burst longsword»); con `functionsAs` el 1d6 de fuego de Flame Tongue ya queda cubierto (`getWeaponAbilitiesExtraDamage(["flaming-burst"], ...)`).
7. `data:validate` y `tests/data/validate.test.ts`/`tests/data/spells*` fallan **solo por `spells`** (la Corrección A tiene la categoría a medias: descriptores nuevos sin schema); todas mis categorías (`weapons`, `armor`, `shields`, `gear`, `magic-items`, `glossary`) validan limpias.

## 8. Verificación (ejecutada al final)

| Comando | Resultado |
|---|---|
| `npx vitest run` (suite completa) | 126 ficheros; 12 tests fallan, **todos en `tests/data/spells*` y `tests/data/validate.test.ts` por `spells` (Corrección A en curso)**; el resto verde (1851 tests) |
| `npx vitest run tests/data/equipment-prd.test.ts tests/data/equipment.test.ts tests/data/magic-items.test.ts tests/data/magic-items-prd.test.ts tests/data/magic-extra-damage.test.ts tests/data/integrity/magic-refs.test.ts tests/scripts/srd/parse-magic-items.test.ts tests/scripts/srd/html.test.ts` | verde |
| `npx tsc --noEmit` | sin errores |
| `npx eslint scripts src/data tests` | sin errores; `prettier --check` limpio en los ficheros de código y de test tocados |
| `npm run -s data:validate` | solo hallazgos en `[spells]` (ajenos); `[gear] [weapons] [armor] [shields] [magic-items] [glossary]` sin errores |

## 9. Trazabilidad (R a test)

| R | Test |
|---|---|
| R24, R25 (equipo frente al PRD) | `tests/data/equipment-prd.test.ts` (251): 161 filas de bienes, 80 armas, 12 armaduras y 6 escudos contra `fixtures/prd-equipment.json`; casos corregidos; animales sin peso; sin variantes de otros libros; sin receta alquímica |
| R27 (nada de otros libros), R65, R86, R87 | `tests/data/magic-items-prd.test.ts` (10): 348 fichas del PRD contra `fixtures/prd-magic-items.json`; feather tokens 6, figurines 9, golem manuals 5, mace of smiting 1; sin Resonance ni citas de otros libros; 16 piedras ioun con precio y efecto del PRD |
| R70, R86 (golem-manuals) | `tests/data/magic-items.test.ts` (`sourceRef` sin página) |
| R78 (multiplicador, exclusión, suma 6d10 imposible) | `tests/data/magic-extra-damage.test.ts` (24): extracción con texto literal del PRD de flaming/icy/shocking burst y thundering, schema (`critMultiplier`, alternativas), `getExtraDamage` con datos reales, `functionsAs`, Flame Tongue, `weaponCritMultiplier` |
| R78, R84 (integridad) | `tests/data/integrity/magic-refs.test.ts` (3 nuevos: ×3 sin «×3» en el texto; `functionsAs` existente/inexistente/propia) |
| Parser: Resonance omitida, contador | `tests/scripts/srd/parse-magic-items.test.ts` (2 nuevos/ajustados) |
| Parser: U+001F a × | `tests/scripts/srd/html.test.ts` (1 nuevo) |
| R49 (overrides con reason/evidence, no obsoletos) | `tests/data/integrity/overrides.test.ts`, `data:parse` (falla si un override es obsoleto o huérfano) |

## 10. Ficheros

- Código: `scripts/srd/lib/html.ts`, `scripts/srd/parsers/magic-items/{header,index,effects}.ts`, `scripts/srd/config/slug-aliases.json`, `src/data/schema/magic-item.ts`, `src/data/integrity/magic-refs.ts`, `src/data/magic-items/extra-damage.ts` (nuevo).
- Overrides (nuevos): `src/data/overrides/gear.json`, `src/data/overrides/weapons.json`, `src/data/overrides/magic-items.json`.
- Datos regenerados con `data:parse` / `data:glossary`: `src/data/equipment/{gear,weapons,armor}.json`, `src/data/magic-items/{wondrous,cursed,ring,rod,specific-weapon,weapon-ability}.json`, `src/data/provenance/{gear,weapons,magic-items}.json`, `src/data/glossary.es.json`; editados con script reproducible (solo capa ES): `src/data/summaries/gear/gear.json`, `src/data/summaries/magic-items/{wondrous,specific-weapon}.json`, `src/data/glossary/gear.es.json`.
- Tests y fixtures: `tests/data/equipment-prd.test.ts`, `tests/data/magic-items-prd.test.ts`, `tests/data/magic-extra-damage.test.ts`, `tests/data/fixtures/prd-equipment.json`, `tests/data/fixtures/prd-magic-items.json` (nuevos); ajustes en `tests/data/{equipment,magic-items}.test.ts`, `tests/data/integrity/magic-refs.test.ts`, `tests/scripts/srd/{html,parse-magic-items}.test.ts`.
- Red: solo consultas al PRD (`equipment.html`, `magicItems/{wondrousItems,rings,rods,staves,armor,weapons,specificCursedItems,artifacts,potions,wands,scrolls,intelligentItems,cursedItems,magicItemCreation}.html`), 1 petición/s con User-Agent identificable, y ninguna al pipeline (`data:parse` se ejecutó offline desde `.cache`).
