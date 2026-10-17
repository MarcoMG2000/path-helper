# Design — f2-rules-engine-core

> CÓMO se construye el núcleo puro de reglas. Respeta `docs/architecture.md`
> (§3 flujo de datos, §5 layout, §7 fidelidad) y `docs/conventions.md`.
> Dependencias de feature: solo `f0-project-skeleton` (layout `src/rules`,
> Vitest, tsconfig estricto). No depende de `f3-srd-data`: los datos de clases,
> armaduras y habilidades llegan como **parámetros**; aquí solo hay fixtures de test.

## 1. Alcance

**Dentro:** modificadores de característica; tamaño (CA/ataque); BAB y salvaciones
base por clase/nivel (monoclase y multiclase); total de salvación; CA normal/toque/
desprevenido/toque-desprevenido con límite de Des máx.; iniciativa; bonificador de
habilidad (rangos, habilidad de clase, característica, penalizador de armadura);
resolvedor de bonificadores con tipos y apilamiento; helper `applyD20`.

**Fuera (lo extenderán otras features, el resolvedor está preparado):**
- f4 (ficha): HP, puntos de habilidad por nivel, carga/inventario, conjuros por día / conjuros adicionales de característica, creación de `ClassLevel` desde datos.
- f5 (combate): orden de turnos y desempates de iniciativa (el desempate usa `modifier.total` del desglose que devuelve f2).
- f6 (ataque/daño): tirada de ataque, críticos, daño, CMB/CMD, ataque poderoso, flanqueo, ataques iterativos, 1/20 natural.
- f7 (capacidades de clase): furia, castigar el mal, gracia divina, esquiva asombrosa (conserva Des al estar desprevenido), etc. Se modelarán como `Modifier[]` activables o como nuevas opciones de las funciones de f2.

## 2. Archivos a crear (no existen aún)

```
src/rules/
  index.ts          # único punto de import público (re-exporta)
  types.ts          # AbilityId, AbilityScores, BonusType, ModifierType, Modifier, BreakdownLine, Breakdown, Size...
  result.ts         # Result<T>, RulesError, ok(), err()
  modifiers.ts      # resolveModifiers (resolvedor de bonificadores)
  ability.ts        # abilityModifier, abilityModifiers, effectiveAbility
  size.ts           # sizeModifier
  progression.ts    # baseAttackBonusFor, baseSaveFor, characterBaseAttackBonus, characterBaseSave
  saves.ts          # savingThrow
  armor-class.ts    # armorClass
  check.ts          # applyD20
  initiative.ts     # initiativeModifier
  skills.ts         # skillModifier, maxSkillRanks
tests/rules/
  result.test.ts  determinism.test.ts  json.test.ts  purity.test.ts
  modifiers.test.ts  ability.test.ts  size.test.ts  progression.test.ts
  saves.test.ts  armor-class.test.ts  check.test.ts  initiative.test.ts  skills.test.ts
```

No se toca `src/server`, `src/web`, `src/data`, ni `feature-list.json`.
Dependencias nuevas: **ninguna** (solo Vitest, ya aportado por f0).

## 3. Tipos (contrato público que f4–f7 extienden)

```ts
// types.ts
export const ABILITY_IDS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];
export type AbilityScores = Readonly<Record<AbilityId, number>>;
export type AbilityModifiers = Readonly<Record<AbilityId, number>>;

// Los 19 tipos de bonificador del Core (R7). 'untyped' = sin tipo.
export const BONUS_TYPES = [
  'alchemical', 'armor', 'circumstance', 'competence', 'deflection', 'dodge',
  'enhancement', 'inherent', 'insight', 'luck', 'morale', 'naturalArmor',
  'profane', 'racial', 'resistance', 'sacred', 'shield', 'size', 'untyped',
] as const;
export type BonusType = (typeof BONUS_TYPES)[number];

// 'base' (10 de la CA, BAB, salvación base, rangos) y 'ability' (modificador de
// característica) NO son tipos de bonificador del Core: son componentes del
// cálculo que siempre suman (R12). Es decisión de diseño (OQ-13), no regla del Core.
export type ModifierType = BonusType | 'base' | 'ability';

export interface Modifier {
  readonly id: string;     // identificador estable y único de la fuente, p. ej. "feat:improvedInitiative"
  readonly name: string;   // nombre SRD en inglés (la UI traduce por id); solo para mostrar
  readonly value: number;  // entero; < 0 = penalizador
  readonly type: ModifierType;
  readonly adjustment?: LineAdjustment; // metadatos de desglose (p. ej. Des limitada)
}

export type LineStatus = 'applied' | 'suppressed' | 'excluded';
export type ExcludedReason = 'touch' | 'lostDexBonus';
export interface LineAdjustment {
  readonly reason: 'maxDex';
  readonly originalValue: number;  // modificador de Des antes del límite
  readonly cappedBy: string;       // id de la fuente que impone el límite
}

export interface BreakdownLine {
  readonly id: string;
  readonly name: string;
  readonly type: ModifierType;
  readonly value: number;                 // valor efectivo de la línea (tras límite)
  readonly status: LineStatus;
  readonly suppressedBy?: string;         // id del modificador que lo suprimió (status 'suppressed')
  readonly excludedReason?: ExcludedReason; // (status 'excluded')
  readonly adjustment?: LineAdjustment;
}

export interface Breakdown {
  readonly stat: string;                  // "ac.normal", "save.fortitude", "skill.stealth", "initiative"...
  readonly total: number;                 // = Σ value de líneas 'applied'
  readonly lines: readonly BreakdownLine[]; // orden de entrada
}

export type Size = 'fine' | 'diminutive' | 'tiny' | 'small' | 'medium'
  | 'large' | 'huge' | 'gargantuan' | 'colossal';
```

```ts
// result.ts
export interface RulesError { readonly code: RulesErrorCode; readonly message: string; readonly field?: string }
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RulesError };
export type RulesErrorCode =
  | 'invalid_modifier_type' | 'invalid_modifier_value' | 'duplicate_modifier_id'
  | 'invalid_ability_score' | 'ability_score_below_one'
  | 'invalid_level' | 'duplicate_class'
  | 'invalid_max_dex' | 'invalid_d20'
  | 'invalid_ranks' | 'ranks_exceed_level' | 'invalid_armor_check_penalty';
```
(Los mensajes `message` son para desarrolladores, en inglés; la UI mapea por `code`.)

Las propiedades opcionales se **omiten** (no se asignan `undefined`) para cumplir R5.

## 4. Firmas públicas

```ts
// modifiers.ts — R7–R20
export interface ResolveOptions { readonly excluded?: ReadonlyMap<string, ExcludedReason> }
export function resolveModifiers(
  stat: string, modifiers: readonly Modifier[], options?: ResolveOptions,
): Result<Breakdown>;

// ability.ts — R21–R25
export function abilityModifier(score: number): Result<number>;
export function abilityModifiers(scores: AbilityScores): Result<AbilityModifiers>;
export function effectiveAbility(
  id: AbilityId, baseScore: number, modifiers?: readonly Modifier[],
): Result<{ score: Breakdown; modifier: number }>;

// size.ts — R26
export function sizeModifier(size: Size): number;

// progression.ts — R27–R32
export type BabProgression = 'good' | 'medium' | 'poor';   // Core: fast / medium / slow
export type SaveProgression = 'good' | 'poor';
export type SaveId = 'fortitude' | 'reflex' | 'will';
export interface ClassLevel {
  readonly classId: string;      // p. ej. "paladin"
  readonly level: number;        // 1..20
  readonly bab: BabProgression;
  readonly saves: Readonly<Record<SaveId, SaveProgression>>;
}
export function baseAttackBonusFor(p: BabProgression, level: number): Result<number>;
export function baseSaveFor(p: SaveProgression, level: number): Result<number>;
export function characterBaseAttackBonus(classes: readonly ClassLevel[]): Result<Breakdown>;
export function characterBaseSave(save: SaveId, classes: readonly ClassLevel[]): Result<Breakdown>;

// saves.ts — R33
export const SAVE_ABILITY: Readonly<Record<SaveId, AbilityId>>; // fortitude→con, reflex→dex, will→wis
export interface SavingThrowInput {
  readonly save: SaveId;
  readonly classes: readonly ClassLevel[];
  readonly abilityModifiers: AbilityModifiers;
  readonly modifiers?: readonly Modifier[];   // resistance, luck, morale, etc.
}
export function savingThrow(input: SavingThrowInput): Result<Breakdown>;

// armor-class.ts — R34–R43
export interface MaxDexCap { readonly id: string; readonly name: string; readonly value: number } // entero >= 0
export interface ArmorClassInput {
  readonly size: Size;
  readonly dexModifier: number;                // modificador de Des SIN limitar (de abilityModifiers/effectiveAbility)
  readonly maxDexCaps?: readonly MaxDexCap[];  // armadura, escudo, carga... se aplica el MENOR
  readonly modifiers?: readonly Modifier[];    // armor, shield, naturalArmor, deflection, dodge, ... (NO Des ni tamaño)
}
export interface ArmorClassResult {
  readonly normal: Breakdown; readonly touch: Breakdown;
  readonly flatFooted: Breakdown; readonly flatFootedTouch: Breakdown;
}
export function armorClass(input: ArmorClassInput): Result<ArmorClassResult>;

// check.ts — R44–R45
export interface CheckResult { readonly d20: number; readonly modifier: number; readonly total: number; readonly breakdown: Breakdown }
export function applyD20(breakdown: Breakdown, d20: number): Result<CheckResult>;

// initiative.ts — R46
export interface InitiativeInput { readonly dexModifier: number; readonly modifiers?: readonly Modifier[] }
export function initiativeModifier(input: InitiativeInput): Result<Breakdown>;
//   iniciativa completa = applyD20(initiativeModifier(...).value, d20)

// skills.ts — R47–R54
export interface SkillDefinition {
  readonly id: string;                 // "stealth"
  readonly ability: AbilityId;
  readonly trainedOnly: boolean;
  readonly armorCheckPenalty: boolean; // ¿le afecta el penalizador de armadura?
}
export interface ArmorCheckPenaltyEntry { readonly id: string; readonly name: string; readonly value: number } // magnitud entero >= 0
export interface SkillInput {
  readonly skill: SkillDefinition;
  readonly ranks: number;
  readonly classSkill: boolean;
  readonly abilityModifiers: AbilityModifiers;
  readonly armorCheckPenalties?: readonly ArmorCheckPenaltyEntry[];  // armadura + escudo (se suman)
  readonly characterLevel?: number;
  readonly modifiers?: readonly Modifier[];
}
export type SkillResult =
  | { readonly usable: true; readonly breakdown: Breakdown }
  | { readonly usable: false; readonly reason: 'trainedOnly' };
export function skillModifier(input: SkillInput): Result<SkillResult>;
export function maxSkillRanks(characterLevel: number): Result<number>;
```

Por qué `dexModifier`/`abilityModifiers` entran como **números ya calculados** y no como
`AbilityScores`: la característica efectiva puede venir alterada por efectos (R23) y f4
la calcula una vez; así AC/iniciativa/habilidades/salvaciones no recalculan ni divergen.

## 5. Algoritmos

### 5.1 Resolvedor (`resolveModifiers`) — R7–R20
1. Validar cada modificador: `type` ∈ catálogo (R17), `value` entero finito (R18), `id`s únicos (R19).
2. Marcar `excluded` los `id` de `options.excluded` (R20); no participan en nada más.
3. Para el resto, partir en:
   - **siempre suman**: `type ∈ {base, ability}` o `type ∈ {dodge, circumstance, racial, untyped}` (bonificadores y penalizadores por igual) → `applied`.
   - **no apilables**: los otros 15 tipos. Los bonificadores (`value >= 0`) y los penalizadores (`value < 0`) compiten **por separado** (ganador por tipo y signo):
     - Bonificadores: por cada tipo, el de mayor `value` queda `applied`; el resto `suppressed` con `suppressedBy` = id del ganador. Empate de valor → gana el primero en el orden de entrada (R13).
     - Penalizadores (R11): por cada tipo, el de menor `value` (el peor) queda `applied`; el resto `suppressed` con `suppressedBy` = id del ganador. Empate → gana el primero en el orden de entrada.
     - Un bonificador y un penalizador del mismo tipo no se suprimen entre sí: se suman (M8, M9).
   Fundamento (CRB p.206, Casting Spells > Bonus Types): "With the exception of dodge bonuses, most circumstance bonuses, and racial bonuses, only the better bonus of a given type works" y "a character taking two or more penalties of the same type applies only the worst one, although most penalties have no type and thus always stack. Bonuses without a type always stack, unless they are from the same source." Nota: el SRD dice "most" circumstance; el resolvedor apila todos los `circumstance` (riesgo residual aceptado, sin enumerar excepciones). Ver OQ-1 para "misma fuente".
4. `total` = Σ `value` de `applied`; `lines` en el orden de entrada (R15).
Sin estado, sin ordenación que dependa de `id` ni de `name` (R14).

### 5.2 Característica efectiva
`effectiveAbility(id, base, mods)`: valida `base` entero ≥ 1 (R22), resuelve `[{base: base}, ...mods]` (R23); si `score.total < 1` → `ability_score_below_one` (R24); `modifier = floor((total-10)/2)`.
Nota JS: `Math.floor((1 - 10) / 2) === -5` (suelo, no truncado).

### 5.3 Progresiones
Implementadas por fórmula entera (`Math.floor`) y **verificadas en tests contra las tablas literales de 20 niveles** (§8.2). `characterBaseAttackBonus` crea una línea `{id: "class:<classId>", name: "<classId> <level> (bab good|medium|poor)", type: 'base', value}` por clase y la suma con el resolvedor.

### 5.4 Clase de armadura
Para cada variante `v ∈ {normal, touch, flatFooted, flatFootedTouch}`:
1. `cap = min(maxDexCaps)` (si hay); `dexEff = (dexModifier > cap) ? cap : dexModifier` → si se recortó, la línea Des lleva `adjustment {reason:'maxDex', originalValue, cappedBy}` (R40). Un `dexModifier` negativo nunca se recorta.
2. Líneas: `ac.base` (`base`, 10), `ac.dex` (`ability`, `dexEff`), `ac.size` (`size`, `sizeModifier`), + `input.modifiers`. Se valida cada cap (R41) y los modificadores (R17–R19; los ids `ac.base`, `ac.dex`, `ac.size` están reservados: colisión → `duplicate_modifier_id`).
3. Exclusiones vía `options.excluded`:
   - `touch`/`flatFootedTouch`: `value > 0` y `type ∈ {armor, shield, naturalArmor}` → `excluded: 'touch'` (R36).
   - `flatFooted`/`flatFootedTouch`: `ac.dex` si `dexEff > 0` y todo `type === 'dodge'` con `value > 0` → `excluded: 'lostDexBonus'` (R37, R38).
4. `resolveModifiers("ac.<variant>", ...)`.

Los **bonos de mejora de armadura/escudo/armadura natural** (p. ej. cota de mallas +1,
escudo +1, amuleto de armadura natural) los pliega el llamador en el `value` del modificador
`armor`/`shield`/`naturalArmor` correspondiente (`name: "Chainmail +1"`). Lectura del Core: la mejora
incrementa ese bonificador, por lo que también se ignora en la CA de toque, y la mejora de armadura y
la de escudo se suman por pertenecer a bonificadores distintos (OQ-7, verificar contra SRD).

### 5.5 Habilidades
Líneas: `skill.ranks` (`base`, rangos), `skill.ability` (`ability`, mod de `skill.ability`), `skill.classSkill` (`untyped`, +3 si `classSkill && ranks >= 1`), `modifiers`, y si `skill.armorCheckPenalty`: una línea por entrada de ACP con `value = -entry.value` y `type: 'untyped'` (se apilan: R49). `trainedOnly && ranks === 0` → `{usable:false}` (R50) **antes** de calcular. Orden de validación: `invalid_ranks`, `ranks_exceed_level`, `invalid_armor_check_penalty`.

### 5.6 Iniciativa y `applyD20`
`initiativeModifier`: líneas `initiative.dex` (`ability`, `dexModifier` **sin recorte**) + `modifiers`. `applyD20` valida 1..20 y devuelve `total = d20 + breakdown.total`. El módulo NO interpreta 1/20 naturales (eso es de f6 para ataques y salvaciones).

## 6. Excepciones / errores

Ninguna función pública lanza por entrada inválida (R1); devuelven `Result` con los códigos de §3.
Solo un fallo de programación interno (invariante rota) puede lanzar `Error`. Los códigos son parte del contrato (los tests los comparan).

## 7. Alternativas descartadas

| Alternativa | Por qué se descarta |
|---|---|
| Un resolvedor por estadística (CA, salvaciones...) | Duplica la lógica de apilamiento, que es la parte con más riesgo de infidelidad. Un único `resolveModifiers` se testea a fondo una vez y f4–f7 solo añaden `Modifier`s. |
| Tablas BAB/salvación como datos en `src/data` | Haría depender f2 de f3 (que se redacta en paralelo) y `rules` no debe importar `data`. Son fórmulas exactas y se contrastan en test con la tabla literal. |
| Excepciones para entradas inválidas | Contradice `docs/conventions.md` ("resultados esperados en el tipo de retorno"). |
| Devolver solo la CA pedida (flag `flatFooted: boolean`) | f5/f6 necesitan varias variantes a la vez (p. ej. ataque de toque contra enemigo desprevenido); calcular las cuatro es barato y evita bugs de flags. |
| Deduplicar por "misma fuente" dentro del resolvedor (OQ-1) | No estoy 100 % seguro del texto del Core; en su lugar se rechazan `id` duplicados (R19), lo que impide añadir dos veces el mismo efecto sin afirmar una regla dudosa. |
| Tipos `base` y `ability` como `BonusType` normales | Les aplicaría el "mayor gana" y rompería la suma (rangos + mod). Se tratan como componentes siempre sumables (OQ-13). |
| Reglas de salvación fraccionarias (opcional del Unchained) | No es Core. |

## 8. Trazabilidad regla → implementación → casos de test

Leyenda: **[L]** = tabla/regla literal del Core; **[D]** = caso derivado inequívocamente de la regla (no es un ejemplo numérico literal del manual); **[F]** = fixture de dato del Core (el valor de f3 es la fuente de verdad; aquí solo se usa para el test).
Las referencias CRB se dan por capítulo/sección; el implementer/reviewer DEBE comprobar el texto exacto en el SRD (Archives of Nethys / d20pfsrd) antes de copiar citas a comentarios (OQ-3).

### 8.1 Mapa regla → módulo

| Regla del Core | Fichero | R |
|---|---|---|
| CRB Ch.1 Getting Started — Ability Scores: "Table: Ability Modifiers and Bonus Spells" (solo la columna de modificador) | `ability.ts` | R21–R25 |
| CRB Ch.1/Ch.9 — Bonus types y "Combining Magical Effects / Stacking Effects" | `modifiers.ts` | R7–R20 |
| CRB Ch.8 Combat — Armor Class (10 + armadura + escudo + Des + tamaño + natural + desvío + esquiva + otros) | `armor-class.ts` | R34–R43 |
| CRB Ch.8 Combat — Touch Attacks (ignora armadura, escudo y armadura natural) | `armor-class.ts` | R36 |
| CRB Ch.8 Combat — Flat-Footed (pierde bono de Des y de esquiva; "Dodge Bonuses") | `armor-class.ts` | R37–R39 |
| CRB Ch.6 Equipment — Armor: Maximum Dex Bonus (solo limita la CA) | `armor-class.ts` | R40–R41 |
| CRB Ch.8/9 — Size modifier ("Table: Size Modifiers") | `size.ts` | R26 |
| CRB Ch.3 Classes — Tablas Fast/Medium/Slow de BAB; Good/Poor de salvaciones; "Multiclass Characters" (BAB y salvaciones base se suman) | `progression.ts` | R27–R32 |
| CRB Ch.8 Combat — Saving Throws (Fort/Con, Ref/Des, Will/Sab) | `saves.ts` | R33 |
| CRB Ch.8 Combat — Initiative (prueba de Des) y dote Improved Initiative (+4) | `initiative.ts` | R46 |
| CRB Ch.4 Skills — Skill Checks, Class Skills (+3 con ≥1 rango), Trained Only, Armor Check Penalty, máx. rangos = Dados de Golpe | `skills.ts` | R47–R54 |
| CRB Ch.6 Equipment — Armor: "Armor Check Penalty" (armadura y escudo se suman) | `skills.ts` | R49 |

### 8.2 Tablas literales [L]

**Modificador de característica (R21):** 1 → −5 · 2–3 → −4 · 4–5 → −3 · 6–7 → −2 · 8–9 → −1 · 10–11 → 0 · 12–13 → +1 · 14–15 → +2 · 16–17 → +3 · 18–19 → +4 · 20–21 → +5 · 22–23 → +6 · 24–25 → +7 · 26–27 → +8 · 28–29 → +9 · 30–31 → +10 · 32–33 → +11 · 34–35 → +12 · 36–37 → +13 · 38–39 → +14 · 40–41 → +15 · 42–43 → +16 · 44–45 → +17.

**Tamaño (R26):** fine +8 · diminutive +4 · tiny +2 · small +1 · medium 0 · large −1 · huge −2 · gargantuan −4 · colossal −8.

**BAB por nivel 1–20 (R27):**
- good: 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20
- medium: 0,1,2,3,3,4,5,6,6,7,8,9,9,10,11,12,12,13,14,15
- poor: 0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10

**Salvación base por nivel 1–20 (R28):**
- good: 2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12
- poor: 0,0,1,1,1,2,2,2,3,3,3,4,4,4,5,5,5,6,6,6

### 8.3 Casos de test por módulo

**Resolvedor (R7–R20)** — todos [D] salvo el catálogo [L]

| Caso | Entrada (tipo valor) | total | Verifica |
|---|---|---|---|
| M1 | deflection +2, deflection +3 | 3 (+2 `suppressed` por +3) | R8 |
| M2 | armor +4 (armadura), armor +3 (brazales) | 4 | R8 |
| M3 | dodge +1, dodge +1, dodge +1 | 3 | R9 |
| M4 | circumstance +2, circumstance +1 | 3 | R9 |
| M5 | untyped +1, untyped +2 | 3 | R9 |
| M5b | racial +2, racial +1 | 3, ambos `applied` | R9 |
| M6 | enhancement +2, luck +1, morale +2 | 5 | R10 |
| M7 | morale −2, morale −2 | −2 (solo cuenta el peor; el segundo `suppressed`, `suppressedBy` = id del primero) | R11 |
| M7b | morale −1, morale −3 | −3; `untyped` −2 y −2 → −4; `circumstance` −2 y −1 → −3 | R11 |
| M8 | morale +2, morale −2 | 0, ambos `applied` | R11 |
| M9 | enhancement +2 (A), enhancement −1 (B), enhancement +4 (C) | 4 + (−1) = 3 | R8+R11 |
| M10 | base +3, base +2, ability +4 | 9 | R12 |
| M11 | armor +3 (A), armor +3 (B) | 3; A `applied`, B `suppressedBy: "A"` | R13 |
| M12 | cualquier permutación de M6+M7+M10 | total constante | R14 |
| M13 | `[]` | 0, `lines: []` | R16 |
| M14 | type `"trait"` | error `invalid_modifier_type` | R17 |
| M15 | value `1.5` / `NaN` | error `invalid_modifier_value` | R18 |
| M16 | dos modificadores con `id: "x"` | error `duplicate_modifier_id` | R19 |
| M17 | armor +5 excluida, armor +2 | total 2; la +5 `excluded`, la +2 `applied` | R20 |
| M18 | BONUS_TYPES | igual a la lista de R7 (19) | R7 |

**Características (R21–R25)**
- AB1 [L] tabla completa 1–45. AB2 [D] `0`, `-3`, `10.5`, `NaN` → `invalid_ability_score`.
- AB3 [D] Fue 14 + `enhancement` +4 (toro) + `enhancement` +2 → 18, mod +4. AB4 [D] Fue 10 + `untyped` −4 → 6, mod −2. AB5 [D] base 8 + −8 → `ability_score_below_one`.
- AB6 [D] `abilityModifiers({str:10,dex:14,con:12,int:8,wis:16,cha:7})` → `{0,+2,+1,−1,+3,−2}`; `wis:0` → error con `field:"wis"`.

**Progresión (R27–R32)**
- P1 [L] tablas §8.2. P2 [D] `level` 0, 21, 2.5 → `invalid_level`.
- P3 [F+D] Paladín 5 (bab good; Fort good, Ref poor, Will good): BAB 5, Fort 4, Ref 1, Vol 4.
- P4 [F+D] Pícaro 7 (bab medium; Fort poor, Ref good, Will poor): BAB 5, Fort 2, Ref 5, Vol 2.
- P5 [F+D] Bardo 10 (medium; Fort poor, Ref good, Will good): BAB 7, Fort 3, Ref 7, Vol 7.
- P6 [F+D] Druida 20 (medium; Fort good, Ref poor, Will good): BAB 15, Fort 12, Ref 6, Vol 12.
- P7 [D] Paladín 3 + Clérigo 2 (clérigo: medium; Fort good, Ref poor, Will good): BAB 3 + 1 = 4; Fort 3 + 3 = 6; Ref 1 + 0 = 1; Vol 3 + 3 = 6.
- P8 [D] Pícaro 1 + Bárbaro 1 (bárbaro: good; Fort good, Ref poor, Will poor): BAB 0 + 1 = 1; Fort 0 + 2 = 2; Ref 2 + 0 = 2; Vol 0 + 0 = 0.
- P9 [D] dos entradas `classId: "paladin"` → `duplicate_class`.
- Progresiones de las 7 clases de campaña usadas como fixtures [F]: Bárbaro/Paladín/Cazador = BAB good; Druida/Pícaro/Bardo/Clérigo = BAB medium. Salvaciones — Bárbaro F+, R−, W−; Paladín F+, R−, W+; Cazador F+, R+, W−; Druida F+, R−, W+; Pícaro F−, R+, W−; Bardo F−, R+, W+; Clérigo F+, R−, W+ (`+`=good, `−`=poor). f3 es la fuente de verdad de estos datos.

**Salvaciones (R33)** — SV1 [D] Paladín 5, Con 14 (+2), Sab 12 (+1), Des 10 (0): Fort 4+2 = +6, Ref 1+0 = +1, Vol 4+1 = +5. SV2 [D] + `resistance` +1 (capa A) y `resistance` +2 (capa B) → Fort +8 (solo cuenta +2; A `suppressed`). SV3 [D] + `morale` +2 y `morale` −2 → neto 0 (bonificador y penalizador del mismo tipo se suman). SV4 [D] cada salvación usa la característica correcta (Con/Des/Sab).

**CA (R34–R43)** — Todos [D] salvo que se indique; la fórmula literal del Core es `10 + armadura + escudo + Des + tamaño + natural + desvío + esquiva + otros`. Fixtures [F]: armadura completa +9 / Des máx. +1 / ACP −6; cota de mallas +6 / +2 / −5 (CRB p.151, Chainmail; corregido desde +5 tras verificación contra el SRD, D3); cuero +2 / +6 / 0; cuero tachonado ACP −1; escudo pesado de acero +2 / ACP −2.

| Caso | Entradas | normal | toque | desprevenido | toque desprev. |
|---|---|---|---|---|---|
| A1 | Medio, Des +2, armadura completa +9 (cap +1), escudo pesado +2 | 22 | 11 | 21 | 10 |
| A2 | A1 + desvío +2 + esquiva +1 | 25 | 14 | 23 | 12 |
| A3 | Pequeño (+1), Des −1, cuero +2 (cap +6) | 12 | 10 | 12 | 10 |
| A4 | Medio, Des +4, cota de mallas +6 (cap +2) | 18 | 12 | 16 | 10 |
| A5 | A4 + carga pesada (cap +1) | 17 | 11 | 16 | 10 |
| A6 | Grande (−1), Des +1, armadura natural +3 | 13 | 10 | 12 | 9 |
| A7 | Medio, Des 0, sin modificadores | 10 | 10 | 10 | 10 |
| A8 | Medio, Des +2, natural +2 y natural +4 (solo cuenta +4) | 16 | 12 | 14 | 10 |
| A9 | Medio, Des +2, esquiva +1 y esquiva +1 (se suman) | 14 | 14 | 10 | 10 |
| A10 | Medio, Des −1, límite de Des máx. +2 aportado, sin otros modificadores | 9 | 9 | 9 | 9 |

Derivaciones: A6 normal = 10 + 1 − 1 + 3; toque = 10 + 1 − 1; desprevenido = 10 − 1 + 3 (se pierde el Des positivo, se conservan tamaño y natural); toque desprevenido = 10 − 1. A4 normal = 10 + 2 (Des limitado) + 6; toque = 10 + 2; desprevenido = 10 + 6; toque desprevenido = 10. A5 normal = 10 + 1 + 6; toque = 10 + 1. A9 desprevenido = 10 (se pierden Des y esquiva). A10: un Des negativo no lo altera ningún límite (R40) y se conserva desprevenido (R38).

Comprobaciones adicionales: A4 muestra en la línea de Des `adjustment{originalValue:4, cappedBy:<id cota>}`; A5 `cappedBy` = carga; los `excluded` llevan `excludedReason` `touch` / `lostDexBonus` según R42; `maxDexCaps` con `-1` o `1.5` → `invalid_max_dex`; modificadores con id `ac.dex` → `duplicate_modifier_id`.

**d20 e iniciativa (R44–R46)** — I1 [L+D] Des 14 (+2) + Iniciativa mejorada `untyped` +4 → modificador +6; d20 13 → 19. I2 [D] Des 8 (−1), d20 1 → total 0. I3 [D] `applyD20(bd, 0|21|10.5)` → `invalid_d20`. I4 [D] Des +4 con armadura completa en la ficha: la iniciativa sigue siendo +4 (la API no recibe límites de Des, R46 / OQ-14).

**Habilidades (R47–R54)** — [D] salvo fixtures [F] (def. de habilidad: Stealth Des, ACP sí; Climb Fue, ACP sí; Acrobatics Des, ACP sí; Perception Sab, ACP no; Knowledge (arcana) Int, trained only, ACP no).

| Caso | Entradas | Resultado |
|---|---|---|
| S1 | Stealth, 4 rangos, Des +3, habilidad de clase, cuero tachonado ACP 1 | 4 + 3 + 3 − 1 = **9** |
| S2 | Climb, 0 rangos, Fue +2, habilidad de clase | **2** (sin +3); con 1 rango: 1 + 2 + 3 = **6** |
| S3 | Acrobatics, 5 rangos, Des +1, de clase, armadura completa (6) + escudo pesado (2) | 5 + 1 + 3 − 8 = **1** |
| S4 | Perception, 5 rangos, Sab +2, de clase, con ACP 6 en la lista | 5 + 2 + 3 = **10** (la habilidad no tiene ACP) |
| S5 | Knowledge (arcana), 0 rangos | `usable:false`; con 1 rango, Int +1, no de clase: **2** |
| S6 | Stealth 5 rangos, no de clase, Des +3 | 5 + 3 = **8** (sin +3) |
| S7 | Stealth + `competence` +2 y `competence` +4 | solo +4 cuenta; `circumstance` +2 y +1 sí suman |
| S8 | ranks `-1` / `2.5` | `invalid_ranks` |
| S9 | nivel 5, 6 rangos | `ranks_exceed_level` |
| S10 | ACP `-1` / `1.5` | `invalid_armor_check_penalty` |
| S11 | `maxSkillRanks(5)` = 5; `maxSkillRanks(0)` | 5; `invalid_level` |

**Propiedades generales (R1–R6)** — `result.test`: una entrada inválida por módulo no lanza; `determinism.test`: doble llamada y entradas congeladas; `json.test`: round-trip; `purity.test`: lectura de ficheros de `src/rules`, regex de `import`/`require` sin `server|web|data` ni módulos Node de I/O, y presencia de `CRB:` en cada fichero de regla.

## 9. Preguntas abiertas (verificar contra SRD antes de aprobar / durante la implementación)

> Cada una incluye mi mejor lectura y su efecto en el spec. El humano decide.

- **OQ-1 — Misma fuente.** ¿Los bonificadores que sí se apilan (esquiva, circunstancia, racial, sin tipo) o los penalizadores dejan de apilarse si proceden de la **misma fuente** (mismo conjuro lanzado dos veces)? *Mejor lectura:* sí, el Core indica que el mismo efecto no se apila consigo mismo (se aplica el mejor). *Efecto:* este spec NO lo afirma; en su lugar R19 rechaza `id` duplicados, de modo que el llamador (f4/f7) no puede añadir dos veces la misma fuente. Si el humano confirma otra lectura (p. ej. diferente `id` pero misma `sourceGroup`), se añade un campo a `Modifier` y un `R`.
- **OQ-2 — Bonificadores de raza. RESUELTA (verificada contra el SRD, 2026-10-16).** La lectura original ("`racial` no es excepción") era errónea. CRB p.206 (Casting Spells > Bonus Types): "With the exception of dodge bonuses, most circumstance bonuses, and racial bonuses, only the better bonus of a given type works (see Combining Magical Effects)." Por tanto los bonificadores `racial` SÍ se apilan entre sí; las excepciones al no-apilamiento son `dodge`, `circumstance`, `racial` y los sin tipo (`untyped`). R9 y §5.1 actualizados. Verificación y URLs (https://aonprd.com/Rules.aspx?Name=Casting%20Spells&Category=Magic , https://www.d20pfsrd.com/magic/ , https://www.d20pfsrd.com/basics-ability-scores/glossary/) en `progress/review_f2-rules-engine-core.md` (D1). Matiz: el SRD dice "most circumstance bonuses"; el resolvedor apila todos (riesgo residual aceptado).
- **OQ-3 — Ubicación exacta de las citas.** Los capítulos/secciones de §8.1 están dados de memoria (p. ej. dónde vive la lista de tipos de bonificador: ¿Cap. 1 "Bonus Types", Cap. 9 "Combining Magical Effects"?). Confirmar texto exacto en el SRD; verificar también que el Core no incluye `trait` en la lista de tipos (mi lectura: los rasgos son de APG, fuera de alcance) y que los 19 tipos de R7 son los de la lista. Si falta o sobra uno, cambia R7.
- **OQ-4 — Puntuación efectiva ≤ 0.** El Core indica que una característica a 0 deja al personaje muerto/inconsciente/incapacitado según cuál y no da un modificador numérico. *Decisión provisional (R24):* error `ability_score_below_one`; f4 deberá decidir cómo mostrar ese estado. Alternativa: devolver `ok` con un flag. Decide el humano.
- **OQ-5 — Armadura vs. carga (peor de las dos).** *Mejor lectura:* con armadura se usa la **peor** cifra entre armadura y carga para penalizador de armadura y Des máx., sin apilar. Verificar texto de Cap. 7 "Carrying Capacity". f2 aplica el menor de `maxDexCaps` (R40, inequívoco por definición de "máximo"), pero deja a f4 decidir qué entradas de ACP pasa (R49 suma lo que reciba). Si se confirma, f4 pasa solo la mayor entre (armadura + escudo) y carga.
- **OQ-6 — ACP armadura + escudo.** *Mejor lectura:* ambos penalizadores de armadura se suman. Verificar.
- **OQ-7 — Mejoras mágicas y CA de toque.** *Mejor lectura:* el bono de mejora de una armadura/escudo/armadura natural forma parte de ese bonificador (se ignora en CA de toque) y las mejoras de armadura y de escudo se suman porque cada una incrementa un bonificador de tipo distinto. Verificar. Tampoco se trata aquí el efecto de fuerza (*mage armor*/*shield*) frente a incorpóreos (regla especial; posible f7). Los *penalizadores* de tipo armor/shield/naturalArmor NO se excluyen en toque (solo `value > 0`); verificar.
- **OQ-8 — Nadar y penalizador de armadura.** *Mejor lectura:* en PF1e no se duplica (sí en 3.5). Verificar el texto de Swim.
- **OQ-9 — Lista de habilidades con ACP y trained-only.** *Mejor lectura* ACP: Acrobatics, Climb, Disable Device, Escape Artist, Fly, Ride, Sleight of Hand, Stealth, Swim. *Trained only:* Disable Device, Handle Animal, Knowledge (todas), Linguistics, Profession, Sleight of Hand, Spellcraft, Use Magic Device. Son **datos de f3**; f2 solo recibe el flag. Se anotan aquí para que f3 los verifique contra la tabla de habilidades.
- **OQ-10 — Nivel >20 / nivel total.** R29 limita cada nivel de clase a 1–20 (tablas del Core); no se valida el nivel total de personaje ni el nivel épico.
- **OQ-11 — Cobertura 100 %.** El principio dice "100 % testeado". Exigir umbral de cobertura (Vitest + `@vitest/coverage-v8`, dependencia pineada) para `src/rules` dependería de la configuración de f0; el implementer lo añade solo si f0 ya incluye el proveedor, si no lo anota en `progress/impl_f2-rules-engine-core.md` para decisión humana.
- **OQ-12 — 1 y 20 naturales en salvaciones.** El Core indica que un 1 natural en una salvación siempre falla y un 20 natural siempre tiene éxito. Fuera de f2 (`applyD20` no interpreta naturales); lo definirá la feature que resuelva salvaciones con dado (f6/f7).
- **OQ-13 — `base`/`ability` como "tipos".** Son una decisión de modelado (no una regla del Core) para que rangos, BAB, mod. de característica y el 10 de la CA se sumen sin pasar por el filtro de tipos.
- **OQ-14 — Límite de Des máx. fuera de la CA.** *Mejor lectura:* el Core dice que la restricción de Des máx. "no afecta a ninguna otra capacidad basada en Destreza" (iniciativa, Reflejos, habilidades). Por eso `initiativeModifier`, `savingThrow` y `skillModifier` no reciben límites de Des. Verificar la frase en Cap. 6.
- **OQ-15 — Esquiva con Des perdido.** *Mejor lectura:* "toda situación que te hace perder tu bonificador de Des a la CA te hace perder los bonificadores de esquiva" (Cap. 8, *Dodge Bonuses*); R37 lo implementa solo para `value > 0`. Verificar frase y que no hay excepción en el Core (la esquiva asombrosa de f7 conserva Des y, por tanto, esquiva).
- **OQ-16 — Modificador de tamaño especial de CMB/CMD y de Volar/Sigilo.** No están en f2 (CMB/CMD → f6). `sizeModifier` cubre solo CA/ataque.
