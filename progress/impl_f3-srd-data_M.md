# Implementación - f3-srd-data, Lote M (objetos mágicos, capítulo 15)

Estado: **en curso** (se actualiza al terminar). No se toca `feature-list.json`; no se marca la feature `done`.

## TM.0: sondeo de la fuente (hecho el 2026-10-16/17, solo vía pipeline: `createFetchCache` de `scripts/srd/lib`, 1 req/s, UA identificable, caché `.cache/srd-raw/`)

### Universo CRB (página de fuente de AoN, `SourceDisplay.aspx?FixedSource=PRPG Core Rulebook`)

| Tabla de la página de fuente | Filas (= enlaces = páginas) |
|---|---|
| Magic Items (Armor) | 48 |
| Magic Items (Weapons) | 64 |
| Magic Items (Rings) | 43 |
| Magic Items (Rods) | 36 |
| Magic Items (Staves) | 21 |
| Magic Items (Wondrous Items) | 300 |
| Magic Items (Cursed Items) | 29 |
| Magic Items (Artifacts) | 12 |
| **Total** | **553** |

No hay tabla de pociones, aceites, varitas, pergaminos ni objetos inteligentes en el universo CRB de la fuente.

### Hallazgos que cambian el modelo del design (todos verificados contra las 553 páginas descargadas)

1. **Una fila de la página de fuente no es una entrada.** AoN lista una fila por variante de precio (`Ring of Protection (+1)` ... `(+5)`, `Spell Resistance (13)` ... `(19)`, `Luck Blade (0 wishes)`...) y cada fila enlaza a una página (`FinalName=Ring of Protection1`...) cuyo **contenido es idéntico** (comprobado: 0 grupos con contenido distinto entre páginas del mismo título) y trae todos los precios en `Price`. Por eso hay 553 filas pero 415 títulos distintos. La entrada de `magic-items` es el **título de la página** (design §14.3: una entrada con varias `variants`).
2. **Pociones, aceites, varitas y pergaminos genéricos (Q11):** no existen como páginas en AoN (los índices `MagicPotions.aspx` solo traen objetos con nombre propio de otros libros; no hay índice de varitas). Pero el texto del capítulo 15 sí está en AoN, en **una sola página de reglas con etiqueta CRB**: `https://aonprd.com/Rules.aspx?ID=365` (`Magic Items`, `Source PRPG Core Rulebook pg. 458`), con 21 secciones `h1` (Magic Items, Magic Items and Detect Magic, Using Items, Magic Items on the Body, Saving Throws Against Magic Item Powers, Damaging Magic Items, Purchasing Magic Items, Magic Item Descriptions, Magic Armor, Magic Weapons, Potions, Rings, Rods, Scrolls, Staves, Wands, Wondrous Items, Intelligent Items, Cursed Items, Artifacts, Magic Item Creation) y sus tablas (15-1 ... 15-29, p. ej. 15-3 precios de armadura/escudo, 15-12 pociones, «Potion Costs», «Wand Costs»). En el CRB impreso las pociones y varitas son **solo reglas de precio por fórmula y tablas de coste** (no hay lista de pociones con nombre), así que esas filas «genéricas» solo existen como filas de tablas dentro de las entradas `general` `Potions`/`Wands`/`Scrolls`. Los `kind` `potion`, `oil`, `wand` quedan **pendientes de la decisión de Q11** (no los he declarado `expectedCount: 0`; ver `magic-sections.json`). Mi recomendación: declararlos `expectedCount: 0` con ese motivo.
3. **Objetos inteligentes:** el índice `MagicIntelligent.aspx` solo trae objetos de otros libros y el universo CRB no tiene ninguno: `intelligent` -> `expectedCount: 0` con `reason` (las reglas del CRB están en el `general` «Intelligent Items»).
4. **Clasificación de `kind` con segunda lectura independiente:** los índices por categoría de AoN (`MagicArmor.aspx?Category=ArmorQuality|ShieldQuality|SpecificArmor|SpecificShield`, `MagicWeapons.aspx?Category=MeleeWeaponQuality|RangedWeaponQuality|SpecificWeapon`) clasifican cada título; el `kind` sale del campo `Slot` de la página y se contrasta con esos índices (discrepancia = error). Las 13 habilidades de armadura que el índice lista como calidad de armadura **y** de escudo (`Slot: armor/shield quality`: Energy Resistance x3, Fortification, Ghost Touch, Spell Resistance, Undead Controlling, Wild...) producen **dos entradas** (`armor-ability` y `shield-ability`) con alias `<kind>.<slug>` (design §14.3 ya prevé alias por kind).
5. **Pestañas con varios libros:** casi todas las páginas llevan `Source` múltiple (`Ultimate Equipment pg. N, PRPG Core Rulebook pg. M`): R86 -> `sourceRef` = la etiqueta CRB, `reprintedIn` = las demás, `sourceRefAll` = línea literal. 548 de las 553 páginas tienen etiqueta CRB; las demás páginas/secciones sin ella se excluyen (R87). Las páginas de los 16 `Ioun Stone` traen 3 secciones (Normal/Flawed/Cracked): solo la `(Normal)` tiene etiqueta CRB.
6. **Huecos de la fuente:** la fila `Lens of Detection` (objeto maravilloso, ranura Eyes) enlaza a una página **sin contenido** en AoN (`MagicWondrousDisplay.aspx?FinalName=Lens of Detection`; también con `ItemName=`). La variante «Lenses of Detection» que existe es de Ultimate Equipment. Se declara hueco conocido (no se inventa el texto).
7. **Texto con contenido de otros libros** (Q13): p. ej. `Golem Manuals` mezcla variantes de Construct Handbook; las páginas `Ioun Stone` traen `Resonance` (regla de Ultimate Equipment). Se conserva el texto de AoN (por defecto del spec) y se marca `needsReview` en las entradas cuyo texto cita otro libro.
8. **Topes (R83), texto literal** (`Rules.aspx?ID=365`, sección Magic Armor, CRB pg. 461): «Magic armor bonuses are enhancement bonuses, never rise above +5, and stack with regular armor bonuses (and with shield and magic shield enhancement bonuses).» y «A suit of armor cannot have an effective bonus (enhancement plus special ability bonus equivalents, including from character abilities and spells) higher than +10. A suit of armor with a special ability must also have at least a +1 enhancement bonus.» (igual para escudos). Confirma +5 de mejora y +10 de bonificador efectivo del design §14.5, y declara el mínimo +1 de mejora con habilidad.

## Estado intermedio (se reescribe en el informe final)

Hecho: schema real, `effects.ts`/`evidence.ts` de datos, regla `magic-refs.ts` (R66/R67/R75/R82-R85), parser `scripts/srd/parsers/magic-items/{index,catalog,header,variants,legal-for,effects,specific,rules,seeds-cli}.ts`, config (`magic-sections.json`, `seeds.json`, `section-allowlist.json`, `slug-aliases.json`), import + parse de TODOS los kinds con página (442 entradas, 13 ficheros), tests (schema, efectos, integridad, parser). En curso: capa ES (summaries por kind) y glosario draft; después tests de datos reales con goldens, informe final y `tasks.md`.
