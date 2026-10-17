# f3b-bestiary-data: Design

Cumple `docs/architecture.md` §5 (layout) y §7 (fidelidad). Es una EXTENSIÓN de
`specs/f3-srd-data/design.md` (en adelante "f3"): mismo pipeline (importar -> cachear -> parsear
offline -> validar -> muestrear), misma capa de procedencia, mismas bibliotecas, mismo aviso OGL.
Lo nuevo es el dataset (monstruos), su schema, las reglas de coherencia aritmética y el reparto en
lotes paralelos. La excepción al "solo Core" está acotada por diseño: carpeta, `book`, allowlist,
CLI y datasource propios; el Core no sabe que el Bestiario existe (R9-R11).

## 1. Principios

1. **Extender, no duplicar.** Todo lo reutilizable de f3 (rate limiter, `fetch-cache`, `html.ts`,
   `text.ts`, `slug.ts`, `prng.ts`, `overrides.ts`, `provenance.ts`, `glossary-build.ts`,
   `sample` y similitud de contraste, `IntegrityIssue`) se importa de `scripts/srd/lib/`
   parametrizado por raíz de datos. Si una función de f3 fija rutas de Core, el Lote 0 de f3b le
   añade un parámetro opcional con el valor por defecto actual (cambio aditivo; los tests de f3
   siguen verdes). Q15.
2. **Dataset aislado.** `src/data/bestiary/` es un árbol propio con su `categories.ts`, schemas,
   integridad, procedencia, overrides y glosario. El Core no lo importa (R10); el cliente web
   tampoco (R11, Q10): las estadísticas completas de los monstruos nunca deben llegar a un
   navegador de jugador.
3. **Estructurado donde importa, texto original siempre.** Los campos que usa el combate (CA,
   PG, salvaciones, ataques con bonificador y daño, velocidades, DR/SR) son estructurados; todo lo
   demás conserva el texto del SRD. Cada línea del bloque se guarda literal en `lines` y cada
   campo estructurado se deriva de una línea (R33); nada se descarta en silencio (R34, R35).
4. **Falla cerrado, avisa donde el SRD es ambiguo.** Línea/sección desconocida, libro ajeno,
   hash cambiado, recuento distinto: fallan. Incoherencias aritméticas con término libre: aviso +
   `needsReview` + muestra humana (R59), no se "corrigen" a mano en silencio (override con
   evidencia, R74).
5. **Verificación en capas independientes** (misma filosofía que f3): schema; recuento de
   páginas y de bloques con heurística independiente (R38-R40); invariantes aritméticas (R47-R58);
   valores de referencia aprobados por el humano (R61, R62); muestreo humano con contraste (R80-R84).

## 2. Qué se reutiliza de f3 y qué es nuevo

| Pieza | Tratamiento en f3b |
|---|---|
| `noHtmlTags`, `allowedHost`, `slugify`, `AbilityEnum`, `GlossaryEntrySchema`, `ProvenanceSchema` (`src/data/schema/*`) | **Se importan** (Lote 0 los exporta si f3 no lo hizo, solo `export`). No se copian. |
| `BaseEntrySchema` (`book: z.literal('CRB')`, `sourceRef` empieza por `PRPG Core Rulebook`) | **No se toca.** Se crea `BestiaryBaseEntrySchema` paralelo (R2-R6). |
| `scripts/srd/lib/*` (fetch-cache, rate-limiter, html, text, slug, prng, overrides, provenance, glossary-build, sample) | **Se importan** con raíz parametrizada. |
| `scripts/srd/cli.ts` | **No se toca.** `scripts/bestiary/cli.ts` registra `bestiary:*` y reutiliza las libs. `init.sh` ejecuta también `bestiary:validate`. |
| `IntegrityIssue`, `IntegrityRule`, `runIntegrity` | Se reutilizan los **tipos**; el Bestiario tiene su propio `runBestiaryIntegrity` (R9: el Core no cambia). Se añade `severity: 'error' \| 'warning'` en el tipo del Bestiario (`BestiaryIssue extends IntegrityIssue`). |
| `LICENSE-OGL.md`, `legal/section15.json`, `getLegalNotice()` | **Se amplían** de forma aditiva (R63, R64); un único aviso para toda la app. |
| `.cache/srd-raw/`, `reports/` | Mismos directorios (ya en `.gitignore` por f3). |
| `RulesDataSource` | **No se toca.** `BestiaryDataSource` es una interfaz hermana (§9). |
| `src/rules` (f2) | **Se importan** `ABILITY_IDS`, `BONUS_TYPES`, `Size`, `sizeModifier`, `abilityModifier`, `armorClass` (solo como oráculo de integridad, §6). `src/rules` no importa `src/data`. |

## 3. Layout

```
scripts/bestiary/
  cli.ts                               # import|parse|glossary|validate|sample
  config/{books.json,seeds.json,section-allowlist.json,slug-aliases.json,batches.json,
          xp-table.json,type-progression.json,attributions.json}
  lib/{discover.ts,lock.ts,statblock/{lexer.ts,lines.ts,header.ts,defense.ts,offense.ts,
       attacks.ts,spellcasting.ts,statistics.ts,special-abilities.ts,names.ts},
       review-flags.ts,sample.ts,index-file.ts,attribution.ts}
  parsers/{monsters.ts,monster-feats.ts,universal-rules.ts,creature-types.ts}
src/data/bestiary/
  categories.ts  index.ts  search.ts
  schema/{base,dice,monster-stats,monster,attack,spellcasting,support,index-entry,review}.ts
  monsters/b<NN>.json                  # un fichero por lote (R75); el ÚNICO escrito por su lote
  monsters/index.json                  # GENERADO (R85)
  monsters/shards.ts                   # GENERADO: lista estática de lotes para import() perezoso
  monster-feats.json  universal-rules.json  creature-types.json
  provenance/{monsters-b<NN>,monster-feats,universal-rules,creature-types}.json
  overrides/{b<NN>,support}.json
  review/b<NN>.json                    # reconocimientos humanos de avisos (R60)
  glossary/{monsters-b<NN>.es.json,terms.es.json}   # shards editables
  glossary.es.json                     # GENERADO (reutiliza glossary-build de f3)
  integrity/{index,ids,book-filter,counts,lines,references,cr-xp,armor-class,hit-points,
             type-progression,combat-maneuvers,saves,initiative,space,attacks,review-flags,
             reference-tables,batches,overrides,attribution}.ts
  bestiary-data-source.ts  json-bestiary-data-source.ts  in-memory-bestiary-data-source.ts
tests/data/bestiary/**  tests/scripts/bestiary/**  tests/fixtures/bestiary-html/**
tests/data/bestiary/fixtures/{monster-golden,xp-table-golden,type-progression-golden}.json
```

## 4. Schemas (zod), forma pública

### 4.1 Base y procedencia

```ts
// schema/base.ts
export const BestiaryBaseEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)?$/), // R12: '.' separa variante
  name: z.string().min(1),                                  // título del bloque (EN)
  textEn: z.string().min(1).refine(noHtmlTags),             // R8
  source: z.string().url().refine(allowedHost),             // R7
  sourceRef: z.string(),                                    // R6: prefijo validado contra books.json
  book: z.enum(BESTIARY_BOOKS),                             // R3, R4: de books.json ("B1")
  needsReview: z.boolean().optional(),                      // R59
  reviewFlags: z.array(ReviewFlagSchema).optional(),        // R35, R59
}).strict();
```
`books.json`: `{ "B1": { "title": "Pathfinder Roleplaying Game Bestiary", "sourceRefPrefixes":
["Bestiary", "PRPG Bestiary"] } }`. Los prefijos se fijan al ver las fixtures (Q8); `sourceRef`
conserva la etiqueta literal de la página. `refine` sobre `sourceRef` se aplica con la entrada
completa (superRefine).

### 4.2 Monstruo (bloque de estadísticas)

Líneas de estadística (cerrada, R34; orden del SRD): `Init, Senses, Aura, AC, hp, Saves, Defensive
Abilities, DR, Immune, Resist, SR, Weaknesses, Speed, Melee, Ranged, Space, Reach, Special Attacks,
Spell-Like Abilities, Spells Known, Spells Prepared, Abilities, Base Atk, Feats, Skills, Racial
Modifiers, Languages, SQ, Environment, Organization, Treasure`. (`Spell-Like Abilities` y
`Spells*` pueden repetirse; `Abilities` = la línea `Str ..., Dex ...`; `Base Atk` agrupa
`Base Atk; CMB; CMD`.) La lista vive en `schema/monster-stats.ts` como `STAT_LINE_KEYS`.

```ts
// schema/dice.ts
export const DIE_SIDES = [2, 3, 4, 6, 8, 10, 12, 20, 100] as const;
export const DiceSchema = z.object({ count: z.number().int().min(1),
  sides: z.union(DIE_SIDES.map(s => z.literal(s)) as any) }).strict();

// schema/monster-stats.ts  (SIN campos de procedencia; reutilizable por f5b, R37)
export const CR_LABELS = ['1/8','1/6','1/4','1/3','1/2','1','2',...,'25'] as const;   // tabla de PX del Core
export const CREATURE_TYPES = ['aberration','animal','construct','dragon','fey','humanoid',
  'magical-beast','monstrous-humanoid','ooze','outsider','plant','undead','vermin'] as const;

export const AcComponentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ability'), ability: z.enum(ABILITY_IDS), value: z.number().int() }),
  z.object({ type: z.enum(BONUS_TYPES), value: z.number().int(), label: z.string().optional() }),
]);   // 'natural' -> naturalArmor, 'Dex' -> ability/dex; etiqueta desconocida -> untyped + label + aviso

export const MonsterStatsSchema = z.object({
  pageId: slug, pageName: z.string(), variantLabel: z.string().optional(),            // R14, R36
  cr: z.enum(CR_LABELS), xp: z.number().int().nonnegative(),                          // R14
  alignment: z.enum(['LG','NG','CG','LN','N','CN','LE','NE','CE']).nullable(),        // R15
  size: SizeSchema, type: z.enum(CREATURE_TYPES), subtypes: z.array(slug),             // R15
  initiative: z.number().int(), initiativeNotes: z.string().optional(),               // R16
  senses: z.array(z.object({ name: z.string(), rangeFt: z.number().optional() })),
  perception: z.number().int().nullable(),
  auras: z.array(z.object({ name: z.string(), rangeFt: z.number().optional(),
    dc: z.number().int().optional(), raw: z.string() })),
  ac: z.object({ total: z.number().int(), touch: z.number().int(), flatFooted: z.number().int(),
    components: z.array(AcComponentSchema), notes: z.string().optional() }),          // R17
  hp: z.object({ total: z.number().int().min(1), dice: z.array(DiceSchema).min(1),
    bonus: z.number().int(), hd: z.number().int().min(1), notes: z.string().optional() }), // R18
  saves: z.object({ fort: int, ref: int, will: int, notes: z.string().optional() }),   // R19
  defense: z.object({                                                                  // R20
    dr: z.array(z.object({ amount: z.number().int(), bypass: z.array(z.string()),
      bypassMode: z.enum(['and','or','none']) })),
    sr: z.number().int().nullable(),
    resist: z.array(z.object({ type: z.string(), amount: z.number().int() })),
    immune: z.array(z.string()), weaknesses: z.array(z.string()),
    defensiveAbilities: z.array(z.string()) }),
  speeds: z.array(z.object({ mode: z.enum(['land','burrow','climb','fly','swim']),
    ft: z.number().int().nonnegative(),
    maneuverability: z.enum(['clumsy','poor','average','good','perfect']).optional(),
    notes: z.string().optional() })),                                                   // R21
  spaceFt: z.number().positive(), reachFt: z.number().nonnegative(),
  reachNotes: z.string().optional(),                                                   // R22
  melee: z.array(AttackRoutineSchema), ranged: z.array(AttackRoutineSchema),            // R23
  specialAttacks: z.array(z.object({ name: z.string(), detail: z.string().optional(),
    dc: z.number().int().optional() })),                                               // R25
  spellcasting: z.array(SpellcastingBlockSchema),                                      // R26
  abilityScores: z.object({ str: ab, dex: ab, con: ab, int: ab, wis: ab, cha: ab }),  // R27: ab = int>=0 | null
  bab: z.number().int(),
  cmb: z.object({ total: int.nullable(), notes: z.string().optional() }),
  cmd: z.object({ total: int.nullable(), notes: z.string().optional() }),              // R28
  feats: z.array(z.object({ name: z.string(), choice: z.string().optional(),
    featId: z.string().nullable(), source: z.enum(['core','bestiary','unresolved']) })), // R29
  skills: z.array(z.object({ name: z.string(), subject: z.string().optional(),
    skillId: z.string().nullable(), value: z.number().int(),
    conditional: z.array(z.string()).optional() })),                                    // R30
  racialModifiers: z.string().optional(),
  languages: z.object({ list: z.array(z.string()), special: z.array(z.string()) }),     // R31
  specialQualities: z.array(z.object({ name: z.string(), detail: z.string().optional() })),
  environment: z.string().optional(), organization: z.string().optional(),
  treasure: z.string().optional(),
  specialAbilities: z.array(z.object({ name: z.string(),
    abilityType: z.enum(['Ex','Su','Sp']).nullable(), textEn: z.string().min(1) })),    // R32
  lines: z.partialRecord(z.enum(STAT_LINE_KEYS), z.string()),                                  // R33
  leftovers: z.array(z.object({ line: z.enum(STAT_LINE_KEYS), text: z.string() })),     // R35
  descriptionEn: z.string().optional(),                                                // R36
  attribution: z.string().optional(),                                                  // R66
}).strict();

export const MonsterSchema = BestiaryBaseEntrySchema.merge(MonsterStatsSchema);        // R37
```

```ts
// schema/attack.ts — lo que consumirá la calculadora de f6 (R23, R24)
export const AttackSchema = z.object({
  name: z.string(),                                  // 'bite', 'longsword', 'slam'
  count: z.number().int().min(1),                    // '2 claws' -> 2
  enhancement: z.number().int().nullable(),          // '+1 longsword' -> 1
  masterwork: z.boolean(),
  attackBonuses: z.array(z.number().int()).min(1),   // '+10/+5' -> [10, 5]
  damage: z.object({
    dice: DiceSchema.nullable(),                     // null si solo hay efecto ("touch +9 (paralysis)")
    bonus: z.number().int(),                         // 1d8+4 -> 4 ; 1d6-1 -> -1
    critRange: z.number().int().min(15).max(20),     // 19-20 -> 19 ; por defecto 20
    critMultiplier: z.number().int().min(2).max(5),  // por defecto 2
    extras: z.array(z.object({ dice: DiceSchema, bonus: z.number().int(), text: z.string() })),
    effects: z.array(z.string()),                    // "plus grab, poison" -> ['grab','poison']
  }).nullable(),
  raw: z.string(),
}).strict();
export const AttackRoutineSchema = z.object({ attacks: z.array(AttackSchema).min(1),
  raw: z.string() });          // alternativas separadas por " or " en el SRD; la coma agrupa un ataque completo
```
Normalización de texto previa a cualquier regex (`scripts/srd/lib/text.ts`): `−`/`–` -> `-`,
`×` -> `x`, espacios duros, `+` pegado, `—` aislado = vacío. `+` Dex como `ability/dex`.

```ts
// schema/spellcasting.ts (R26)
SpellcastingBlockSchema = z.object({
  kind: z.enum(['spell-like','known','prepared']),
  source: z.string().optional(),                     // 'cleric', 'sorcerer', ...
  casterLevel: z.number().int().nullable(), concentration: z.number().int().nullable(),
  groups: z.array(z.object({
    usage: z.object({ kind: z.enum(['constant','at-will','per-day','per-week','per-month',
                                    'per-year','level','other']),
                      times: z.number().int().optional(), level: z.number().int().min(0).max(9).optional() }),
    spells: z.array(z.object({ name: z.string(), spellId: z.string().nullable(),
      dc: z.number().int().optional(), note: z.string().optional() })) })),
  raw: z.string() });
```

### 4.3 Categorías de apoyo (Q3)

`MonsterFeat` (`prerequisites: {raw: string}`, `benefit`, `normal?`, `special?`; `types`),
`UniversalRule` (`ruleType: Ex|Su|Sp|null`, `textEn`), `CreatureType` (`kind: 'type'|'subtype'`,
`hitDie?`, `bab?`, `goodSaves?`, `textEn`). Solo `BestiaryBaseEntrySchema` + estos campos; sin
estructura adicional.

### 4.4 Índice ligero generado (R85)

```ts
export const MonsterIndexEntrySchema = z.object({ id, name, nameEs: z.string().nullable(), pageId,
  variantLabel: z.string().optional(), cr: z.enum(CR_LABELS), xp: z.number().int(), type,
  subtypes: z.array(slug), size: SizeSchema, alignment: ..., hp: int, acTotal: int, shard: z.string(),
  sourceRef: z.string(), needsReview: z.boolean().optional() });
```
~150 B x ~400 entradas = ~60 KB: `list`/`search` no cargan lotes (R89).

## 5. Pipeline y parser

### 5.1 Comandos
```
npm run bestiary:import   [-- --category c] [-- --verify]   # RED, serie, con cerrojo (R67-R69, R72)
npm run bestiary:parse    -- --batch b03 [--accept-drift]    # offline (R70-R73)
npm run bestiary:plan                                        # índice -> batches.json (una vez, revisado)
npm run bestiary:glossary                                    # shards -> glossary.es.json
npm run bestiary:index                                       # lotes -> monsters/index.json + shards.ts
npm run bestiary:validate                                    # R78, R79
npm run bestiary:sample   -- --seed 42 --per-type 3 [--crosscheck]   # R80-R84
```

### 5.2 Descubrimiento y recuentos
- `seeds.json` apunta al índice de monstruos de Archives of Nethys (URL exacta fijada al ver la
  fuente; el ejemplo de f3 es `ClassDisplay.aspx?ItemName=...`, las páginas de monstruo son
  `MonsterDisplay.aspx?ItemName=...`) y a las páginas de apéndices (reglas universales, dotes de
  monstruo, tipos). `discover.ts` obtiene páginas y libro del índice; si el índice no informa del
  libro, descarga la página y filtra por su línea `Source` (R41). `expectedPages` = páginas de B1;
  se congela en `provenance/` y lo contrasta el humano (Q12).
- `expectedStatBlocks` NO sale del índice (no lo da): se congela tras el primer parseo completo, y
  cada página registra `statBlocks` (número de bloques) en su huella de procedencia. R39 impide que
  el parser y la fuente discrepen en silencio: una **heurística independiente**
  (`countStatBlocksRaw(html)`: ocurrencias de la pareja de encabezados `CR n` + `XP n` en el texto
  plano) debe coincidir con las entradas producidas.
- **Cerrojo** (R68): `.cache/srd-raw/.bestiary-import.lock` (creación exclusiva, con PID y
  fecha). Garantiza una única descarga a 1 petición/s aunque haya varios agentes. Los agentes de
  lote **no descargan nunca**: parsean desde la caché (R70).

### 5.3 Parser de bloque
1. `html.ts` (cheerio) extrae el cuerpo de la página a texto plano con marcas de `<b>` -> `**`;
   separa **bloques** por el encabezado `Name CR n` (R36) y la **descripción** de la página (R36).
2. `lexer.ts` parte cada bloque en **líneas de estadística** por etiqueta conocida
   (`STAT_LINE_KEYS`); etiqueta desconocida -> error (R34). Lo que sigue a `Special Abilities` se
   trocea por `Nombre (Ex|Su|Sp)` -> `specialAbilities[]` con texto íntegro (R32).
3. Un parser por línea devuelve `{ value, leftover }`; si `leftover` no está vacío -> `leftovers[]`
   + aviso `unparsed-fragment` (R35). Nunca se inventa un valor: ante duda, `null`/ausente +
   `leftovers`.
4. `names.ts` resuelve nombres contra el Core y el Bestiario: dotes (`feats` del Core +
   `monster-feats` -> `source: core|bestiary`, si no `unresolved`), habilidades (`skills` del Core;
   `Knowledge (arcana)` -> `knowledge-arcana`, id compuesto de f3 §4.2), conjuros (`spells` del
   Core, todo el capítulo 10; `null` solo si no es del Core). La resolución es **post-parseo** y determinista (R44-R46).
5. El texto original: `lines` (R33) y `textEn` (todo el bloque, Markdown restringido, R8).
6. `review-flags.ts` ejecuta las reglas de aviso de §6 y estampa `reviewFlags`/`needsReview` (R59).
7. Los **overrides** (`overrides/b<NN>.json`, `{ id, pointer, value, reason, evidence }`, puntero
   JSON RFC 6901) se aplican DESPUÉS del parseo y ANTES de estampar avisos, para que un override
   que corrige una incoherencia limpie su aviso (R74).

### 5.4 Trampas conocidas y su fixture
Una fixture HTML pequeña por trampa (`tests/fixtures/bestiary-html/`), descargada una sola vez en
el Lote 0 con `fetch-cache`:
- Página de **varios bloques** (dragón por edad, esqueleto/zombi de ejemplo, criatura con forma
  híbrida): R36.
- **Constructo sin Con**, **sin mente (Int "—")**, **incorpóreo (Fue "—")**: `null`, R27.
- **Ataques**: `or` entre rutinas, iterativos `+10/+5`, `2 claws`, daño con crítico `19-20/x3`,
  `plus` con efecto y dado extra, ataque de toque sin daño.
- **CA** con componentes no estándar (`+2 deflection`, `+1 insight`, `+4 Wis`), CA con nota.
- **DR** con `and`/`or`/`—`, **resistencias** múltiples, **debilidades** (vulnerabilidad a frío).
- **Conjuros**: capacidades sortílegas por frecuencia, conjuros conocidos por nivel, preparados.
- **Velocidad** con maniobrabilidad de vuelo; **espacio/alcance** con nota (10 ft. con tentáculos).
- Página de **otro libro** o plantilla (exclusión, R41) y **encabezado desconocido** (R73).

## 6. Coherencia aritmética (`src/data/bestiary/integrity/`)

Puras: reciben el dataset cargado (más el Core para referencias) y devuelven `BestiaryIssue[]`
con `severity`. Cada regla se testea con un caso verde y uno roto sintéticos.

Notación: `mod(x)` = `abilityModifier` de f2 (`null` -> 0; Con/Int "—" se tratan como +0, Q18);
`sz` = `sizeModifier(size)` de f2 (modificador de CA/ataque); `cmSz` = `-sz` (modificador especial
de tamaño de CMB/CMD; R61 comprueba la igualdad con la tabla literal del Core).

| Regla | Fórmula | Severidad | R |
|---|---|---|---|
| `cr-xp` | `xp == XP_TABLE[cr]` (`xp-table.json`) | error | R47 |
| `ac-sum` | `ac.total == 10 + Σ components.value` | error | R48 |
| `ac-oracle` | `armorClass({size, dexModifier: valor del componente dex (0 si no hay), modifiers: resto de componentes sin dex ni size})` devuelve `normal/touch/flatFooted`; deben coincidir con `ac.total/touch/flatFooted` | error (aviso en `flatFooted` si `uncanny dodge`) | R49 |
| `ac-component-mismatch` | componente `size == sz`; componente dex == `mod(dex)` | aviso | R50 |
| `hp-average` | `abs( Σ count*(sides+1)/2 + bonus - total ) <= 1` | error | R51 |
| `hp-bonus-residual` | `bonus - hd*mod(con)`; explicable por *Toughness* (bono según el texto de la dote en el dataset Core de f3), bono de constructo por tamaño (tabla del Bestiario) o nota en `hp.notes` | aviso | R52 |
| `type-progression-mismatch` | dado de golpe de `hp.dice` y `bab` contra `type-progression.json` (tipo y `hd`); se omite en `humanoid` y si `hp.notes` indica niveles de clase | aviso | R53 |
| `cm-residual` | `cmb.total - (bab + mod(str o dex) + cmSz)` y `cmd.total - (10 + bab + mod(str) + mod(dex) + cmSz)`; usa Des en lugar de Fue si `size <= tiny` o Fue es `null`; explicable por dotes *Improved ...* listadas | aviso | R54 |
| `save-residual` | `save - (base(tipo, hd, buena/mala) + mod(car.))`; buenas/malas de `type-progression.json`; explicable por *Great Fortitude/Iron Will/Lightning Reflexes* (+2) | aviso | R55 |
| `initiative-residual` | `initiative - mod(dex)`; explicable por *Improved Initiative* (+4) | aviso | R56 |
| `space-size-mismatch` | `spaceFt == SPACE_BY_SIZE[size]` (tabla de tamaños del Core) | aviso | R57 |
| `attack-residual` | iterativos descienden de 5 en 5; `attackBonuses[0] - (bab + mod(str o dex) + sz)` explicable por mejora del arma, *Weapon Focus*, *Weapon Finesse* (Des) o penalizador de ataque secundario natural (-5, o -2 con *Multiattack*) | aviso | R58 |

La **lista de causas explicativas** es datos (`integrity/explanations.ts`), no código disperso, y
una regla que solo "explica" un residuo cuando la dote figura en `feats` de la entrada. Los
residuos se guardan en el informe de muestreo (R82) aunque estén explicados.

Tablas de referencia (datos de `scripts/bestiary/config/`, contra goldens aprobados por el humano,
R61). **Lectura del autor, a confirmar contra la fuente** (principio de f2/f3: no afirmar reglas
dudosas):
- `xp-table.json` (tabla de PX del Core): 1/8=50, 1/6=65, 1/4=100, 1/3=135, 1/2=200, 1=400,
  2=600, 3=800, 4=1.200, 5=1.600, 6=2.400, 7=3.200, 8=4.800, 9=6.400, 10=9.600, 11=12.800,
  12=19.200, 13=25.600, 14=38.400, 15=51.200, 16=76.800, 17=102.400, 18=153.600, 19=204.800,
  20=307.200, 21=409.600, 22=614.400, 23=819.200, 24=1.228.800, 25=1.638.400.
- `type-progression.json` (tabla de tipos del Bestiario): dado de golpe / BAB / salvaciones buenas:
  aberration d8 / 3/4 / Will; animal d8 / 3/4 / Fort, Ref; construct d10 / 3/4 / ninguna;
  dragon d12 / completo / Fort, Ref, Will; fey d6 / 1/2 / Ref, Will; humanoid d8 / según clase /
  según clase; magical-beast d10 / completo / Fort, Ref; monstrous-humanoid d10 / completo / Ref,
  Will; ooze d8 / 3/4 / ninguna; outsider d10 / completo / Fort, Ref, Will; plant d8 / 3/4 / Fort;
  undead d8 / 1/2 / Will; vermin d8 / 3/4 / Fort. BAB y salvaciones usan las fórmulas ya fijadas
  en f2 (`baseAttackBonusFor`, `baseSaveFor`).
- `SPACE_BY_SIZE` (Core): fine 0,5; diminutive 1; tiny 2,5; small 5; medium 5; large 10; huge 15;
  gargantuan 20; colossal 30.

Si el golden y la fuente discrepan, el implementer **no cambia ninguno**: anota la discrepancia en
`progress/impl_f3b-bestiary-data_<lote>.md` y para (principio de fidelidad, como f3 §5).

### Avisos, reconocimientos y overrides
- `parse` estampa los `reviewFlags` (`{rule, message, residual?}`) y `needsReview` (R59);
  `validate` recalcula y exige igualdad (los datos no pueden quedar "obsoletos" respecto a las reglas).
- `review/b<NN>.json`: `{ id, rule, reviewedBy, reviewedAt, note }`. Un aviso reconocido sigue
  visible en el informe pero deja de entrar en el estrato `needsReview` del muestreo (R60, R80).
- Corregir un error de la fuente = override con `reason` y `evidence` (R74), nunca editar el JSON.

## 7. Lotes y paralelismo (R75, R76)

- `bestiary:plan` ordena las páginas por `pageId` y las corta en rangos contiguos de, como máximo,
  `maxPagesPerBatch` (por defecto **45**) respetando que una página no se parta. Resultado:
  `batches.json` `[{ id: "b01", from: "aboleth", to: "...", pages: n }]`, revisado y congelado
  por el humano. Con ~350 páginas salen ~8 lotes; con ~8 KB por bloque, ~360 KB por lote (< 400 KB, R76).
- Un lote **posee** (escritura exclusiva): `monsters/b<NN>.json`, `provenance/monsters-b<NN>.json`,
  `overrides/b<NN>.json`, `review/b<NN>.json`, `glossary/monsters-b<NN>.es.json`.
- Ningún agente de lote edita el parser, las reglas ni los schemas: si encuentra un fallo, lo
  anota en `progress/impl_f3b-bestiary-data_<lote>_bugs.md` y para; lo arregla el dueño del parser
  (Lote P1) y se relanza el lote. Así los lotes nunca se pisan.
- `monsters/index.json`, `monsters/shards.ts`, `glossary.es.json`, `attributions.json` los genera
  el Lote Z.
- **Alternativa descartada: partir por tipo de criatura.** El tipo solo se conoce tras parsear
  (no sirve para planificar antes de descargar), las familias (dragones, elementales) cruzan tipos
  y la búsqueda por nombre del GM iría peor. El rango alfabético por `pageId` es conocido desde el
  índice, estable y deja familias de variantes en el mismo lote.

## 8. Aviso legal (R63-R66)

- `LICENSE-OGL.md` y `src/data/legal/section15.json` (de f3) se amplían con la Section 15 del
  Bestiario, literal (copiada de la propia fuente; se anota de dónde en el informe del lote, como
  f3 §9). `getLegalNotice()` no cambia de firma; `legal.test.ts` de f3 sigue comparando contra
  `LICENSE-OGL.md`.
- Atribuciones de terceros: `attribution.ts` extrae de la Section 15 las líneas con forma
  `<Monstruo> from <fuente de terceros>...` y las asocia por `id` en `config/attributions.json`
  (generado, revisado). Regla `attribution` (R66): bidireccional. El campo `attribution` de la
  entrada contiene la línea literal.
- El aviso "no oficial y sin afiliación" de f3 no cambia. Product Identity: Q9.

## 9. Acceso: `BestiaryDataSource`

```ts
// src/data/bestiary/bestiary-data-source.ts   (swap point; lo consume f5b, solo en servidor)
export interface MonsterQuery {
  text?: string;                 // subcadena, sin mayúsculas ni acentos, sobre name y nameEs
  crMin?: CrLabel; crMax?: CrLabel;
  types?: CreatureType[]; subtypes?: string[]; sizes?: Size[];
  sort?: 'name' | 'cr';          // por defecto 'name'; desempate por id
  limit?: number; offset?: number;
}
export interface LocalizedMonster {
  entry: Monster; nameEs: string | null; nameEsVerified: boolean;
}
export const displayName = (m: { entry: { name: string }; nameEs: string | null }) =>
  m.nameEs ?? m.entry.name;       // política de nombres: sin traducción -> inglés

export interface BestiaryDataSource {
  get(id: string): Promise<LocalizedMonster | undefined>;
  list(): Promise<readonly MonsterIndexEntry[]>;
  search(q: MonsterQuery): Promise<readonly MonsterIndexEntry[]>;
  getUniversalRule(id: string): Promise<UniversalRule | undefined>;
  getMonsterFeat(id: string): Promise<MonsterFeat | undefined>;
  getCreatureType(id: string): Promise<CreatureType | undefined>;
}
```
- `JsonBestiaryDataSource`: `list/search` leen solo `monsters/index.json`; `get(id)` busca el `shard`
  en el índice y hace `import()` solo de `monsters/b<NN>.json` (a través de `shards.ts`); valida
  con zod al cargar y lanza error de infraestructura que nombra fichero, `id` y campo (R88). Cachea
  por lote. Devuelve entradas **congeladas en profundidad** (R91): la caché es compartida y f5b
  "edita una copia" (`structuredClone` + `MonsterStatsSchema.parse`), nunca el original del SRD.
- `InMemoryBestiaryDataSource(entries)`: fake para f5/f5b; ambos pasan un contrato compartido (R86-R92).
- Import restringido: `JsonBestiaryDataSource` solo se compone en `src/server/compose.ts` (R11, Q10).
- Qué ofrece a f5b para sus monstruos propios: `MonsterStatsSchema` (R37) y el esquema de
  ataque (R23, R24). Los monstruos creados a mano no necesitan `source`, `textEn` ni `lines`.
  Que f5b haga cumplir "los jugadores nunca ven las estadísticas" es de f5b/authz; aquí solo se
  garantiza que el dataset no viaje al cliente.

## 10. Glosario (política de nombres)

- Claves `monsters:<id>` y `term:<slug>`, mismo `GlossaryEntrySchema` de f3. Shards por lote;
  `glossary.es.json` se regenera con `glossary-build` de f3 (determinista).
- **No se redactan nombres ES de monstruos como borrador** (Q5): el shard de cada lote nace vacío y
  solo contiene lo que el humano aporte (`origin: human, verified: true`). La ausencia no es error (R94).
- `terms.es.json` contiene los `term` de tipos de criatura (13) y tamaños (9) como borrador
  (`verified: false`, `origin: draft`), para que la UI muestre el bloque en español.
- `LocalizedMonster.nameEs` sale del glosario; `displayName` aplica la política (R92).

## 11. Informe de muestreo (R80-R84)

`bestiary:sample` es una función pura `buildBestiarySample(data, { seed, perType })` con el PRNG
de f3 (`prng.ts`, mulberry32) y selección ordenada por `id` antes de barajar. Estratos: (1) toda
entrada con `needsReview` o override sin reconocer, (2) toda entrada de página multibloque,
(3) FP >= 15, (4) `k` aleatorias por cada uno de los 13 tipos. El Markdown muestra por entrada: las
`lines` literales, los campos estructurados al lado, los residuos de §6, `reviewFlags`, URL y
casillas `- [ ] OK  - [ ] Error`. `--crosscheck` usa la función `fetchText` inyectada y la
similitud de Jaccard de f3. El informe vive en `reports/` (ignorado por git).

## 12. Dependencias
Ninguna nueva respecto a f3 (`zod`, `cheerio`, `tsx`) y f2 (solo importación). `fetch` nativo,
`node:crypto`. Versiones pineadas ya por f0/f3.

## 13. Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Mezclar monstruos en los datasets del Core con `book: "B1"` | Rompe f3 R3/R27, contamina el recuento del Core y el compendio de f8. |
| Reutilizar `BaseEntrySchema` con `book: z.enum(['CRB','B1'])` | Debilita la regla del Core; un error de libro pasaría la validación. Dos schemas separados la mantienen. |
| Guardar solo el texto del bloque (sin estructura) | La calculadora de f6 y la vista de combate de f5b necesitan CA, PG y ataques como datos. |
| Guardar solo estructura (sin `lines`/`textEn`) | Pierde fidelidad: no hay forma de contrastar con la fuente ni de detectar lo no interpretado. |
| Hacer fallar toda incoherencia aritmética | El SRD tiene erratas y bonos legítimos no listados; bloquearía el import. Se separa error (sin término libre) de aviso (residuo). |
| Un único `monsters.json` | ~3 MB, cuello de botella para el trabajo paralelo y para la carga en el servidor. |
| Un LLM extrae los bloques | No determinista; un dígito mal rompe la prioridad nº1. El LLM, si se usa, solo ayuda al humano a revisar. |
| Descargar desde cada agente de lote | Multiplica el tráfico (viola 1 petición/s) y no es reproducible; se descarga una vez con cerrojo. |
| Traducir nombres con un LLM | Cientos de nombres no verificables; mejor inglés hasta que el humano aporte la traducción. |

## 14. Riesgos
- **Entorno:** como f3, Node y red pueden no estar disponibles para el agente; el humano ejecuta
  `bestiary:import` y commitea `provenance/` y los lotes.
- **Variabilidad del SRD:** bloques con formato irregular (criaturas con formas, plantillas,
  enjambres). Mitigación: `leftovers`, avisos, fixtures por trampa, lotes pequeños revisables.
- **Volumen de revisión humana:** cientos de bloques. Mitigación: invariantes automáticas,
  estratificación del muestreo y reconocimientos por aviso (no se pide releer los 350 bloques).
- **Acoplamiento a f2:** la integridad usa `armorClass()`. Si f2 cambia su contrato, el test
  `ac-oracle` lo detecta; el acoplamiento se limita al barril `src/rules/index.ts`.
- **Cobertura de conjuros:** f3 cubre todos los conjuros del Core (Q4 resuelta el 2026-10-16),
  así que `spellId` es `null` solo para conjuros de otros libros o nombres no resolubles; se
  cuentan en el informe.
- **Legal:** atribuciones de terceros y Product Identity (Q9).
