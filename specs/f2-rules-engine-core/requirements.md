# Requirements — f2-rules-engine-core

> **Revisado 2026-10-16:** R8/R9/R11 corregidos tras verificación contra el SRD (D1-D3); requiere re-aprobación humana.
> D1: los bonificadores `racial` se apilan entre sí (R9). D2: de varios penalizadores del mismo tipo con nombre solo cuenta el peor (R11). D3: cota de mallas = +6 armadura / Des máx. +2 / ACP −5 (fixtures de design §8.3). Detalle y citas en `design.md` §5.1, §8.3 y OQ-2; verificación en `progress/review_f2-rules-engine-core.md`.

> Motor de reglas Pathfinder 1e (núcleo puro). Módulo `src/rules`.
> "El sistema" en este documento = el módulo `src/rules` (funciones públicas
> exportadas desde `src/rules/index.ts`).
> Fuente única de reglas: Pathfinder 1e **Core Rulebook** (CRB / SRD). Las
> referencias "CRB: ..." se dan por capítulo/sección; el detalle y los ejemplos
> numéricos están en `design.md`. Las reglas que no son 100 % seguras están en
> `design.md` §9 "Preguntas abiertas" (marcadas "verificar contra SRD") y NO se
> afirman aquí salvo como requisito explícitamente provisional.

## Convenciones del documento

- Cada `R<n>` es una sola frase verificable por al menos un test (columna
  "Test" = fichero bajo `tests/rules/`).
- "Modificador" = entrada del resolvedor `{id, name, value, type}` (ver design §3).
  `value > 0` es un bonificador, `value < 0` un penalizador.
- Resultado de error = `{ ok: false, error: { code, message, field? } }`.

## Cobertura del `acceptance` original

| Criterio del acceptance | Requisitos |
|---|---|
| Módulo puro `src/rules`, sin I/O | R1–R6 |
| Modificadores de característica | R21–R25 |
| BAB y salvaciones por clase/nivel | R27–R33 |
| CA normal / toque / desprevenido | R34–R42 |
| Iniciativa | R44–R46 |
| Habilidades y penalizadores de armadura | R47–R54 |
| Resolvedor de bonificadores con tipos y apilamiento | R7–R20 |
| Tests contra ejemplos y reglas literales del manual | R6 + tabla de casos en design §8 |

---

## 1. Propiedades generales del módulo

**R1.** CUANDO una función pública del sistema tiene precondiciones sobre sus entradas,
el sistema DEBE devolver un `Result` (unión discriminada `{ ok: true, value }` |
`{ ok: false, error: { code, message, field? } }`) en lugar de lanzar excepciones.
_Test:_ `tests/rules/result.test.ts` — una entrada inválida de cada módulo devuelve `ok: false` y no lanza.

**R2.** CUANDO se invoca una función pública dos veces con entradas profundamente iguales,
el sistema DEBE devolver salidas profundamente iguales sin leer reloj, aleatoriedad ni estado global.
_Test:_ `tests/rules/determinism.test.ts` — doble llamada con `toStrictEqual`; `Date.now` y `Math.random` espiados lanzan si se llaman.

**R3.** CUANDO las entradas de una función pública están congeladas en profundidad (`Object.freeze` recursivo),
el sistema DEBE completar el cálculo sin lanzar y sin modificar las entradas.
_Test:_ `tests/rules/determinism.test.ts` — entradas congeladas para cada función pública.

**R4.** El sistema DEBE ser un módulo cuyos ficheros bajo `src/rules` no importen de `src/server`,
`src/web` ni `src/data`, ni de módulos de I/O de Node (`fs`, `net`, `http`, `https`, `child_process`, `node:*`).
_Test:_ `tests/rules/purity.test.ts` — escanea los `import`/`require` de cada fichero de `src/rules`.

**R5.** CUANDO una función pública devuelve `ok: true`, el sistema DEBE devolver un valor que sobreviva
a `JSON.parse(JSON.stringify(v))` con `toStrictEqual` (sin `undefined`, `NaN`, `±Infinity`, funciones, clases ni `Map`/`Set`).
_Test:_ `tests/rules/json.test.ts` — round-trip de la salida de cada función pública con entradas válidas.

**R6.** El sistema DEBE citar la regla del Core que implementa mediante un comentario que contenga
`CRB:` en cada fichero de `src/rules` que implemente una regla (todos salvo `types.ts`, `result.ts` e `index.ts`).
_Test:_ `tests/rules/purity.test.ts` — cada fichero esperado contiene `CRB:`.

## 2. Resolvedor de bonificadores (tipos y apilamiento)

**R7.** El sistema DEBE exponer el catálogo cerrado `BONUS_TYPES` con exactamente estos 19 tipos del Core:
`alchemical, armor, circumstance, competence, deflection, dodge, enhancement, inherent, insight, luck, morale, naturalArmor, profane, racial, resistance, sacred, shield, size, untyped`.
_Test:_ `tests/rules/modifiers.test.ts` — igualdad exacta del array.

**R8.** CUANDO varios bonificadores (`value >= 0`) del mismo tipo que NO sea `dodge`, `circumstance`, `racial` ni `untyped` se resuelven juntos,
el sistema DEBE contar solo el de mayor valor y marcar los demás como `suppressed`.
_Test:_ `tests/rules/modifiers.test.ts` — p. ej. dos `deflection` +2 y +3 → 3; armadura +4 y brazales +3 `armor` → 4.

**R9.** CUANDO varios bonificadores de tipo `dodge`, `circumstance`, `racial` o `untyped` se resuelven juntos,
el sistema DEBE sumarlos todos (CRB p.206: "With the exception of dodge bonuses, most circumstance bonuses, and racial bonuses, only the better bonus of a given type works"; los bonificadores sin tipo siempre se apilan).
_Test:_ `tests/rules/modifiers.test.ts` — `dodge` +1 y +1 → 2; `circumstance` +2 y +1 → 3; `racial` +2 y +1 → 3; `untyped` +1 y +2 → 3.

**R10.** CUANDO se resuelven bonificadores de tipos distintos, el sistema DEBE sumar el bonificador contado de cada tipo.
_Test:_ `tests/rules/modifiers.test.ts` — `enhancement` +2 con `luck` +1 → 3.

**R11.** CUANDO se resuelven varios penalizadores (`value < 0`) del mismo tipo que NO sea `dodge`, `circumstance`, `racial` ni `untyped`, el sistema DEBE contar solo el peor (el de menor valor; en empate, el primero en el orden de entrada) y marcar los demás como `suppressed`;
los penalizadores de tipo `dodge`, `circumstance`, `racial` o `untyped` (sin tipo) DEBEN sumarse todos, y un bonificador y un penalizador del mismo tipo DEBEN sumarse entre sí sin suprimirse (CRB p.206: "a character taking two or more penalties of the same type applies only the worst one, although most penalties have no type and thus always stack").
_Test:_ `tests/rules/modifiers.test.ts` — `morale` −2 y `morale` −2 → −2 (el segundo `suppressed`); `morale` −1 y −3 → −3; `untyped` −2 y −2 → −4; `circumstance` −2 y −1 → −3; `morale` +2 con `morale` −2 → 0 (ambos `applied`).

**R12.** CUANDO se resuelven componentes de tipo `base` o `ability`, el sistema DEBE sumarlos siempre y NO DEBE suprimirlos nunca por apilamiento.
_Test:_ `tests/rules/modifiers.test.ts` — dos `base` (+3, +2) y un `ability` (+4) → 9, todos `applied`.

**R13.** CUANDO dos bonificadores no apilables del mismo tipo tienen el mismo valor máximo,
el sistema DEBE contar el primero en el orden de entrada y marcar el posterior como `suppressed` con `suppressedBy` = `id` del primero.
_Test:_ `tests/rules/modifiers.test.ts` — dos `armor` +3 con ids distintos.

**R14.** CUANDO se permuta el orden de la lista de modificadores, el sistema DEBE devolver el mismo `total`.
_Test:_ `tests/rules/modifiers.test.ts` — todas las permutaciones de un conjunto mixto de 5–6 modificadores.

**R15.** El sistema DEBE devolver una línea de desglose por cada modificador de entrada, en el orden de entrada,
con `status` ∈ {`applied`, `suppressed`, `excluded`}, y `total` igual a la suma de los `value` de las líneas `applied`.
_Test:_ `tests/rules/modifiers.test.ts` — longitud/orden de `lines` y `total === Σ applied`.

**R16.** CUANDO se resuelve una lista vacía, el sistema DEBE devolver `total: 0` y `lines: []`.
_Test:_ `tests/rules/modifiers.test.ts`.

**R17.** SI un modificador tiene un `type` fuera de `BONUS_TYPES ∪ {base, ability}`, ENTONCES el sistema DEBE devolver el error `invalid_modifier_type`.
_Test:_ `tests/rules/modifiers.test.ts`.

**R18.** SI un modificador tiene un `value` que no es un entero finito, ENTONCES el sistema DEBE devolver el error `invalid_modifier_value`.
_Test:_ `tests/rules/modifiers.test.ts` — `1.5`, `NaN`, `Infinity`.

**R19.** SI dos modificadores de una misma resolución comparten `id`, ENTONCES el sistema DEBE devolver el error `duplicate_modifier_id`.
_Test:_ `tests/rules/modifiers.test.ts`.

**R20.** DONDE el llamador pasa una exclusión explícita para un `id` de modificador (`options.excluded`), el sistema DEBE devolver su línea con
`status: "excluded"` y `excludedReason` y NO DEBE contarla en el total ni dejar que suprima a otros.
_Test:_ `tests/rules/modifiers.test.ts` — un `armor` +5 excluido no suprime a un `armor` +2 (que queda `applied`).

## 3. Características

**R21.** CUANDO se pide el modificador de una puntuación entera `s >= 1`, el sistema DEBE devolver `floor((s − 10) / 2)`,
coincidiendo con la tabla del Core para 1–45 (1 → −5; 10–11 → 0; 20–21 → +5; 44–45 → +17).
_Test:_ `tests/rules/ability.test.ts` — tabla completa 1–45 literal.

**R22.** SI la puntuación no es un entero finito o es `< 1`, ENTONCES el sistema DEBE devolver el error `invalid_ability_score`.
_Test:_ `tests/rules/ability.test.ts` — `0`, `-3`, `10.5`, `NaN`.

**R23.** CUANDO se pide una característica efectiva con puntuación base y modificadores (mejoras, penalizadores, daño de característica),
el sistema DEBE resolver los modificadores con las reglas de apilamiento (R8–R12), devolver el desglose de la puntuación y derivar el modificador de la puntuación efectiva.
_Test:_ `tests/rules/ability.test.ts` — Fue 14 con `enhancement` +4 y +2 → 18, mod +4; Fue 10 con penalizador −4 → 6, mod −2.

**R24.** SI la puntuación efectiva resultante es `< 1`, ENTONCES el sistema DEBE devolver el error `ability_score_below_one` (ver OQ-4).
_Test:_ `tests/rules/ability.test.ts` — base 8 con penalizador −8.

**R25.** CUANDO se pide el conjunto de modificadores para las seis características (`str, dex, con, int, wis, cha`),
el sistema DEBE devolver el modificador de cada una; si alguna puntuación es inválida, el error de R22 DEBE llevar `field` = el id de esa característica.
_Test:_ `tests/rules/ability.test.ts` — puntuaciones válidas → seis modificadores; `wis: 0` → `invalid_ability_score` con `field: "wis"`.

## 4. Tamaño

**R26.** CUANDO se pide el modificador de tamaño para CA y ataque, el sistema DEBE devolver: fine +8, diminutive +4, tiny +2, small +1, medium 0, large −1, huge −2, gargantuan −4, colossal −8.
_Test:_ `tests/rules/size.test.ts` — los 9 valores literales.

## 5. BAB y salvaciones por clase y nivel

**R27.** CUANDO se pide el BAB de una progresión (`good`, `medium`, `poor`) para un nivel 1–20, el sistema DEBE devolver el valor de la tabla del Core
(`good` = nivel; `medium` = ⌊3·nivel/4⌋; `poor` = ⌊nivel/2⌋).
_Test:_ `tests/rules/progression.test.ts` — las tres tablas de 20 valores, literales.

**R28.** CUANDO se pide la salvación base de una progresión (`good`, `poor`) para un nivel 1–20, el sistema DEBE devolver el valor de la tabla del Core
(`good` = 2 + ⌊nivel/2⌋; `poor` = ⌊nivel/3⌋).
_Test:_ `tests/rules/progression.test.ts` — las dos tablas de 20 valores, literales.

**R29.** SI el nivel de clase no es un entero entre 1 y 20, ENTONCES el sistema DEBE devolver el error `invalid_level`.
_Test:_ `tests/rules/progression.test.ts` — `0`, `21`, `2.5`, `-1`.

**R30.** CUANDO se pide el BAB de un personaje con una o varias clases, el sistema DEBE devolver la suma de los BAB de cada clase calculados por separado, con una línea `base` por clase.
_Test:_ `tests/rules/progression.test.ts` — casos monoclase y multiclase de design §8.

**R31.** CUANDO se pide la salvación base (`fortitude`, `reflex`, `will`) de un personaje, el sistema DEBE devolver la suma de las salvaciones base de cada clase calculadas por separado, con una línea `base` por clase.
_Test:_ `tests/rules/progression.test.ts` — Paladín 3 / Clérigo 2 → Fort 6, Ref 1, Vol 6.

**R32.** SI la lista de clases contiene el mismo `classId` más de una vez, ENTONCES el sistema DEBE devolver el error `duplicate_class`.
_Test:_ `tests/rules/progression.test.ts`.

**R33.** CUANDO se pide el total de una salvación, el sistema DEBE devolver salvación base + modificador de la característica asociada
(Fortitude → Con, Reflex → Des, Will → Sab) + el resto de modificadores resueltos con R8–R12, con desglose.
_Test:_ `tests/rules/saves.test.ts` — Paladín 5, Con 14, Sab 12, Des 10 → Fort +6, Ref +1, Vol +5; con `resistance` +1 y +2 → sube solo +2.

## 6. Clase de armadura

**R34.** CUANDO se pide la CA de un personaje, el sistema DEBE devolver cuatro desgloses: `normal`, `touch`, `flatFooted` y `flatFootedTouch`.
_Test:_ `tests/rules/armor-class.test.ts` — presencia de las cuatro claves.

**R35.** CUANDO se calcula la CA normal, el sistema DEBE devolver 10 + modificador de Des efectivo (tras el límite de Des máx.) + modificador de tamaño + los modificadores restantes resueltos con R8–R12.
_Test:_ `tests/rules/armor-class.test.ts` — casos A1–A3 de design §8.

**R36.** CUANDO se calcula la CA de toque, el sistema DEBE excluir los bonificadores (`value > 0`) de tipo `armor`, `shield` y `naturalArmor` y conservar el resto (Des, tamaño, desvío, esquiva, etc.).
_Test:_ `tests/rules/armor-class.test.ts` — Guerrero con armadura completa: toque 11.

**R37.** CUANDO se calcula la CA desprevenido, el sistema DEBE excluir el modificador de Des efectivo si es positivo y todos los bonificadores (`value > 0`) de tipo `dodge`, y conservar el resto.
_Test:_ `tests/rules/armor-class.test.ts`.

**R38.** SI el modificador de Des es negativo, ENTONCES el sistema DEBE conservar ese penalizador en las CA `flatFooted` y `flatFootedTouch`.
_Test:_ `tests/rules/armor-class.test.ts` — Des 8 (−1).

**R39.** CUANDO se calcula la CA de toque desprevenido, el sistema DEBE aplicar a la vez las exclusiones de R36 y R37.
_Test:_ `tests/rules/armor-class.test.ts`.

**R40.** CUANDO el modificador de Des es positivo y mayor que el menor de los límites de Des máx. aportados (`maxDexCaps`), el sistema DEBE usar ese límite como modificador de Des efectivo en todas las variantes de CA y registrar el límite aplicado y su fuente en la línea de Des; un modificador de Des negativo NO DEBE alterarse por un límite.
_Test:_ `tests/rules/armor-class.test.ts` — Des 18 con cota de malla (máx. +2) → +2; con carga pesada (+1) y cota de malla → +1; Des 8 con cota de malla → −1.

**R41.** SI un límite de Des máx. no es un entero ≥ 0, ENTONCES el sistema DEBE devolver el error `invalid_max_dex`.
_Test:_ `tests/rules/armor-class.test.ts` — `-1`, `1.5`.

**R42.** CUANDO se calcula cualquier variante de CA, el sistema DEBE incluir en el desglose una línea `base` de valor 10, una línea `ability` de Des, una línea `size`, y una línea por cada modificador de entrada (con `status` `applied`, `suppressed` o `excluded` y `excludedReason` ∈ {`touch`, `lostDexBonus`}).
_Test:_ `tests/rules/armor-class.test.ts` — inspección de `lines` en las cuatro variantes.

**R43.** CUANDO se aportan varios modificadores de CA, el sistema DEBE aplicarles las reglas de apilamiento R8–R12 (armadura/escudo/natural/desvío no apilan con su mismo tipo; esquiva, circunstancia y racial sí).
_Test:_ `tests/rules/armor-class.test.ts` — dos `deflection` (+2, +3) → +3; dos `dodge` +1 → +2.

## 7. Tirada de d20 e iniciativa

**R44.** CUANDO se aplica un resultado de d20 a un desglose de modificador, el sistema DEBE devolver `total = d20 + desglose.total` junto con el d20 natural y el desglose.
_Test:_ `tests/rules/check.test.ts`.

**R45.** SI el d20 no es un entero entre 1 y 20, ENTONCES el sistema DEBE devolver el error `invalid_d20`.
_Test:_ `tests/rules/check.test.ts` — `0`, `21`, `10.5`.

**R46.** CUANDO se pide el modificador de iniciativa, el sistema DEBE devolver el modificador de Des completo (sin límite de Des máx.) + los modificadores resueltos con R8–R12 (p. ej. Iniciativa mejorada +4 `untyped`), con desglose.
_Test:_ `tests/rules/initiative.test.ts` — Des 14 + Iniciativa mejorada → +6; con d20 13 → 19.

## 8. Habilidades

**R47.** CUANDO se pide el bonificador de una habilidad utilizable, el sistema DEBE devolver rangos + modificador de la característica de la habilidad + bonificador de habilidad de clase + modificadores resueltos con R8–R12 − penalizador de armadura, con desglose.
_Test:_ `tests/rules/skills.test.ts` — casos S1–S6 de design §8.

**R48.** CUANDO la habilidad es de clase y tiene al menos 1 rango, el sistema DEBE añadir un bonificador `untyped` de +3; CUANDO tiene 0 rangos, NO DEBE añadirlo.
_Test:_ `tests/rules/skills.test.ts` — 0, 1 y 5 rangos con y sin habilidad de clase.

**R49.** DONDE la definición de la habilidad marca `armorCheckPenalty: true`, el sistema DEBE restar la suma de todos los penalizadores de armadura aportados (armadura y escudo se suman); DONDE no, NO DEBE restar nada.
_Test:_ `tests/rules/skills.test.ts` — Acrobacias con armadura completa (6) y escudo pesado de acero (2) → −8; Percepción → 0.

**R50.** SI la habilidad es `trainedOnly` y tiene 0 rangos, ENTONCES el sistema DEBE devolver `usable: false` con `reason: "trainedOnly"` y sin total.
_Test:_ `tests/rules/skills.test.ts` — Conocimiento (arcano) con 0 rangos; con 1 rango sí es utilizable.

**R51.** SI los rangos no son un entero ≥ 0, ENTONCES el sistema DEBE devolver el error `invalid_ranks`.
_Test:_ `tests/rules/skills.test.ts` — `-1`, `2.5`.

**R52.** SI se aporta el nivel de personaje y los rangos lo superan, ENTONCES el sistema DEBE devolver el error `ranks_exceed_level`.
_Test:_ `tests/rules/skills.test.ts` — nivel 5 con 6 rangos.

**R53.** CUANDO se pide el máximo de rangos por habilidad para un nivel de personaje entero ≥ 1, el sistema DEBE devolver ese nivel.
_Test:_ `tests/rules/skills.test.ts` — `maxSkillRanks(5) === 5`; `maxSkillRanks(0)` → error `invalid_level`.

**R54.** SI un penalizador de armadura aportado no es un entero ≥ 0, ENTONCES el sistema DEBE devolver el error `invalid_armor_check_penalty`.
_Test:_ `tests/rules/skills.test.ts` — `-1`, `1.5`.
