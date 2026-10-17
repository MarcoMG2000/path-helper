# f3-srd-data: Design

Cumple `docs/architecture.md` §5 (layout) y §7 (fidelidad): `src/data` no importa de
`server` ni `web` (R62); cada dato lleva `source` y texto original; la ambigüedad se
convierte en pregunta abierta (ver `requirements.md`).

## 1. Principios de diseño

1. **Dos capas separadas.** La *capa SRD* (inglés, derivada de la fuente por script, nunca
   editada a mano) y la *capa ES* (resúmenes y nombres curados, en ficheros aparte). Así un
   re-import no destruye el trabajo de traducción y el humano revisa cada capa con criterio
   distinto: la SRD contra la página original; la ES contra el manual de Devir.
2. **Los datos se generan, no se teclean.** Un script descarga, cachea y parsea; el agente
   implementador escribe y prueba *parsers*, ejecuta el import y revisa informes. Transcribir a
   mano miles de entradas es la mayor fuente de errores y no es reproducible.
3. **Falla cerrado.** Encabezado desconocido, libro distinto de CRB, `sha256` cambiado, entrada
   sin resumen: todo detiene el proceso con mensaje accionable, nunca se incluye en silencio.
4. **Verificación en capas independientes:** schema, invariantes de reglas (fórmulas de BAB y
   salvaciones), consistencia cruzada entre dos páginas de la misma fuente (conjuro vs lista de
   clase), valores de referencia (goldens) y muestreo humano con contraste opcional contra una
   segunda web.

## 2. Fuente y adquisición

### Decisión
- **Fuente primaria: Archives of Nethys (`aonprd.com`).** Cada entrada lleva una línea
  `Source PRPG Core Rulebook pg. N`, lo que permite filtrar por libro de forma mecánica
  (R7, R46); las URLs son estables (`ClassDisplay.aspx?ItemName=Druid`,
  `FeatDisplay.aspx?ItemName=Power Attack`, `SpellDisplay.aspx?ItemName=...`) y los
  prerrequisitos de dotes van enlazados.
- **Contraste: `d20pfsrd.com`**, solo para el informe de muestreo (R56); no alimenta los datos.
- **Trampa conocida:** las páginas de AoN mezclan contenido de otros libros (secciones
  "Alternate Capstones", "Favored Class Options", variantes míticas, reimpresiones con
  `Source` múltiple). Por eso el parser usa **lista permitida de secciones por categoría**
  (R45) y trata como `needsReview` toda página con más de una etiqueta `Source`.
  **Conjuros (R97):** la línea `Level` de las páginas de conjuro de AoN mezcla clases de todos los
  libros (`alchemist`, `witch`, `oracle`, `magus`...) y usa abreviaturas (`sor/wiz`); el parser
  tiene un catálogo cerrado (`spell-class-ids.json`: ids CRB, abreviaturas, `nonCrbClassIds`) y
  falla ante un token desconocido en lugar de adivinar.
  **Excepción en `magic-items` (R86):** casi todos los objetos del cap. 15 están reimpresos en
  otros libros (comprobado en *Keen*: `Ultimate Equipment pg. 144, PRPG Core Rulebook pg. 469`),
  así que allí la reimpresión NO activa `needsReview` (inundaría el muestreo): se guarda
  `reprintedIn`, se cuenta en el informe (R90) y el riesgo de texto actualizado se trata con Q13.

### Alternativas descartadas
| Alternativa | Motivo |
|---|---|
| Transcribir a mano | Miles de entradas, errores no detectables, no reproducible, cuello de botella humano. |
| Extraer con un LLM desde la web | No determinista; un error de cifra rompe la prioridad nº1. El LLM solo se usa para redactar la capa ES (borrador), con la comprobación de cifras de R30. |
| Datasets JSON de terceros (dumps de Foundry, repos de GitHub) | Licencia dudosa, mezclan expansiones, sin procedencia por entrada, formato no controlado. |
| Paizo PRD como primaria | Fuente canónica y OGL, pero el HTML es menos regular y no etiqueta el libro por entrada de forma uniforme; queda como alternativa (Q8). |

### Caché cruda: fuera de git, con huella dentro
- Páginas crudas en `.cache/srd-raw/<host>/<sha1(url)>.html`, **ignorado por git**
  (~2.000 páginas x ~100 KB = cientos de MB: infla el repo sin valor porque el HTML ajeno no es
  el producto).
- Dentro de git: `src/data/provenance/<categoría>.json` con, por página, `url`, `sha256`,
  `bytes`, `fetchedAt`, y por categoría `expectedCount`, `importerVersion`, `humanReviewed`,
  `license`. Con esto el resultado es **verificable**: cualquiera reimporta (`--verify`, R48) y
  ve exactamente qué páginas cambiaron en la fuente (R47).
- Los datos *parseados* sí se commitean: la app y los tests no necesitan red ni caché.
- Para los tests del parser se commitean **fixtures pequeñas** (una decena de páginas HTML por
  categoría) en `tests/fixtures/srd-html/<categoría>/`, incluida una por cada trampa conocida
  (página con sección de otro libro, tabla con "—", dote con prerrequisito encadenado).

### Flujo de comandos
```
npm run data:import   [-- --category <c>] [-- --verify]   # red: semillas -> .cache + provenance
npm run data:parse    [-- --category <c>] [-- --accept-drift] # offline: .cache -> src/data/**
npm run data:glossary                                      # shards -> glossary.es.json
npm run data:validate                                      # reglas de integridad, exit != 0
npm run data:sample   -- --seed 42 --per-category 8 [--crosscheck]
```
- **Semillas** (`scripts/srd/config/seeds.json`): las 7 clases, y los *índices* de AoN por
  categoría (lista de dotes, **índice completo de conjuros** (R93), páginas de lista de las 5
  clases con lista para `spell-lists`, tablas de equipo). El import descubre
  las URLs de entradas desde esos índices filtrando por la etiqueta de libro, de modo que los
  recuentos se obtienen de la fuente y no de memoria: `expectedCount` = entradas del índice con
  libro CRB, congelado en `provenance` y revisable por el humano (Q10). El parseo comprueba
  además `parsed == índice`.
- **Cortesía de red:** `User-Agent` identificable, 1 petición/s, reintentos con backoff acotado
  (3), una sola pasada gracias a la caché (R41, R42).
- **Overrides** (`src/data/overrides/<cat>.json`): `{ id, field, value, reason, evidence }`.
  Se aplican tras el parseo; un override cuyo valor ya coincide con el parseado es "obsoleto" y
  falla (R49). Son la vía documentada para errores de la fuente.

## 3. Layout de ficheros

```
LICENSE-OGL.md                           # OGL 1.0a + Section 15 (R37)
scripts/srd/
  cli.ts                                 # subcomandos import|parse|glossary|validate|sample
  config/{seeds.json,slug-aliases.json,section-allowlist.json,
          spell-class-ids.json,spell-batches.json}   # catálogos cerrados de conjuros (R94, R97, R99)
  lib/{fetch-cache.ts,rate-limiter.ts,html.ts,text.ts,slug.ts,overrides.ts,
       provenance.ts,sample.ts,prng.ts,glossary-build.ts}
  parsers/{classes,class-features,domains,races,skills,feats,spells,spell-lists,equipment}.ts
  parsers/magic-items/{index,header,variants,effects,legal-for}.ts   # Lote M (§14)
src/data/
  categories.ts                          # registro de categorías (R1)
  schema/{common,class,class-feature,domain,race,skill,feat,spell,spell-list,
          equipment,magic-item,summary,glossary,provenance}.ts
  classes/<classId>.json                 # 7 ficheros
  class-features/<classId>.json
  domains.json  races.json  skills.json
  feats/<a..z>.json                      # shards por letra inicial
  spells/<a..z>.json  spells/lists.json     # un shard por inicial del id; lists.json = spell-lists
  spells/{fields.ts,query.ts}               # classifySpellFields (R96), spellsForClass (R100): puras
  equipment/{weapons,armor,shields,gear}.json
  magic-items/<kind>.json                # 17 ficheros, uno por `kind` (R63)
  magic-items/effects.ts                 # getItemEffects, getEnhancementEffects (R79, R80)
  summaries/<categoría>/<shard>.json     # capa ES: resúmenes (R28)
  glossary/<categoría>.es.json           # capa ES: shards editables
  glossary.es.json                       # GENERADO desde los shards (R31, R36)
  overrides/<categoría>.json             # o overrides/<categoría>/<lote>.json (R98: spells)
  provenance/<categoría>.json            # o provenance/<categoría>/<lote>.json (R98: spells)
  legal/{ogl-1.0a.ts,section15.json,index.ts}
  integrity/{index.ts,ids.ts,book-filter.ts,class-tables.ts,class-refs.ts,feat-prereqs.ts,
             spell-lists.ts,domain-refs.ts,magic-refs.ts,counts.ts,summaries.ts,glossary.ts,
             overrides.ts}
  rules-data-source.ts  json-rules-data-source.ts  in-memory-rules-data-source.ts
  <categoría>/index.ts                   # GENERADO: lista estática de shards para import() perezoso
  index.ts
tests/data/**, tests/scripts/srd/**, tests/fixtures/srd-html/**
```
`reports/` y `.cache/` se añaden a `.gitignore`.

## 4. Schemas (zod), forma pública

```ts
// src/data/schema/common.ts
export const CATEGORIES = ['classes','class-features','domains','races','skills','feats',
  'spells','spell-lists','weapons','armor','shields','gear','magic-items'] as const;
export type Category = (typeof CATEGORIES)[number];

export const BaseEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),          // R4
  name: z.string().min(1),                                     // EN del SRD
  textEn: z.string().min(1).refine(noHtmlTags),                // R8
  source: z.string().url().refine(allowedHost),                // R6
  sourceRef: z.string().startsWith('PRPG Core Rulebook'),      // R7
  book: z.literal('CRB'),                                      // R3
  needsReview: z.boolean().optional(),                         // R53 (varios Source, parseo dudoso)
}).strict();
```
La capa ES NO está en `BaseEntrySchema`:
```ts
export const SummaryFileSchema = z.record(z.string(), z.object({
  summaryEs: z.string().min(1).max(300),                       // R28
  status: z.enum(['draft','reviewed']),
}));
export const GlossaryEntrySchema = z.object({
  es: z.string().min(1), verified: z.boolean(),
  origin: z.enum(['human','draft']), kind: z.enum(['entry','term']),
  note: z.string().optional(),
}).refine(g => !g.verified || g.origin === 'human');            // R32
// glossary.es.json: { "<category>:<id>" | "term:<id>": GlossaryEntry }
```
Claves de glosario: `feats:power-attack`, `class-features:paladin.smite-evil`,
`term:flat-footed`.

### 4.1 Clases (R9-R14)
```ts
ClassSchema = BaseEntrySchema.extend({
  hitDie: z.union([z.literal(6),z.literal(8),z.literal(10),z.literal(12)]),
  skillRanksPerLevel: z.number().int().positive(),            // sin Int
  classSkills: z.array(z.string()),                           // ids de skills (Knowledge expandido)
  alignment: z.string(),                                       // texto SRD; p. ej. "Lawful good"
  startingWealthDice: z.string(),                              // "5d6" ; x10 gp
  proficiencies: z.object({
    weapons: z.array(z.string()),   // ids de armas o categorías: "simple","martial"
    armor: z.array(z.enum(['light','medium','heavy'])),
    shields: z.array(z.string()),
  }),
  progression: z.object({
    bab: z.enum(['full','threeQuarters','half']),
    fort: z.enum(['good','poor']), ref: z.enum(['good','poor']), will: z.enum(['good','poor']),
  }),
  casting: z.object({ ability: AbilityEnum, tradition: z.enum(['arcane','divine']),
    prepared: z.boolean(), spellListId: z.string() }).optional(),
  table: z.array(ClassLevelRowSchema).length(20),
});
ClassLevelRowSchema = z.object({
  level: z.number().int().min(1).max(20),
  bab: z.array(z.number().int()).min(1),        // [6,1] = +6/+1
  fort: z.number().int(), ref: z.number().int(), will: z.number().int(),
  special: z.array(z.string()),                  // nombres tal como en la tabla del SRD
  specialIds: z.array(z.string()),               // resueltos a class-features (R14)
  spellsPerDay: z.array(z.number().int().nullable()).length(10).optional(), // idx = nivel de conjuro
  spellsKnown: z.array(z.number().int().nullable()).length(10).optional(),  // bardo
});
```
La tabla se guarda **desnormalizada** (valores numéricos) y `progression` se **deriva y
contrasta** con las fórmulas de R11: son dos lecturas de la misma verdad y se vigilan entre sí.

`ClassFeatureSchema`: `classId`, `level` (primer nivel en que se obtiene), `abilityType`
(`Ex|Su|Sp|null`), `kind` (`feature|option`), `parentId?`. Ids: `<classId>.<slug>`
(p. ej. `paladin.smite-evil`, `rogue.talent.bleeding-attack`).

### 4.2 Razas, habilidades
- `RaceSchema`: `abilityModifiers: Partial<Record<Ability, number>>`, `abilityChoice?:
  {amount:number}` (humano y semielfo: +2 a una a elegir), `size`, `type`, `subtype?`,
  `baseSpeedFt`, `languages: {automatic:string[], bonus:string[]}`, `traits: {name,textEn}[]`.
- `SkillSchema`: `keyAbility`, `trainedOnly`, `armorCheckPenalty`, `knowledgeSubject?`.
  Knowledge: 10 ids `knowledge-arcana`... (expansión de "Knowledge (all)" en `classSkills`).

### 4.3 Dotes (R17-R19)
```ts
FeatSchema = BaseEntrySchema.extend({
  types: z.array(z.enum(['General','Combat','Metamagic','Item Creation','Critical'])).min(1),
  prerequisites: z.object({
    raw: z.string(),                                   // texto SRD literal
    abilities: z.partialRecord(AbilityEnum, z.number()).optional(),
    bab: z.number().optional(), casterLevel: z.number().optional(),
    featIds: z.array(z.string()).default([]),
    skills: z.array(z.object({ skillId: z.string(), ranks: z.number() })).default([]),
    other: z.array(z.string()).default([]),            // lo que el parser no sabe estructurar
  }),
  benefit: z.string(), normal: z.string().optional(), special: z.string().optional(),
});
```
`other` es la válvula de seguridad: el informe de import lista cuántas dotes la usan para que el
humano decida si merece estructurarse; **nunca** se descarta un prerrequisito sin estructurar
(siempre queda en `raw`).

### 4.4 Conjuros (R20-R23, R91-R103)

> Ampliado el 2026-10-16 (Q4 resuelta): `spells` contiene TODOS los conjuros del capítulo 10 del
> CRB. Cambian el universo de conjuros, la clave `levels` y los campos de la entrada; `spell-lists`
> no cambia de naturaleza (solo las clases con lista).

```ts
// src/data/schema/spell.ts
export const CRB_CLASS_IDS = ['barbarian','bard','cleric','druid','fighter','monk','paladin',
  'ranger','rogue','sorcerer','wizard'] as const;                    // catálogo cerrado (R92)
export const SPELL_SCHOOLS = ['abjuration','conjuration','divination','enchantment','evocation',
  'illusion','necromancy','transmutation','universal'] as const;      // R101
const Kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

SpellSchema = BaseEntrySchema.extend({
  school: z.enum(SPELL_SCHOOLS),                                      // R101
  subschool: z.string().optional(),                                   // 'healing', 'calling'...
  descriptors: z.array(z.string()),                                   // 'fire', 'mind-affecting'...
  // clave de nivel -> nivel de conjuro. Clave = id del catálogo CRB_CLASS_IDS (incluidas
  // 'sorcerer' y 'wizard' aunque no tengan entrada en `classes`) o id de dominio (R91, R92).
  levels: z.record(Kebab, z.number().int().min(0).max(9)),
  castingTime: z.object({ raw: z.string(),
    unit: z.enum(['free','immediate','swift','standard','full-round','round','minute','hour',
                  'other']),
    amount: z.number().int().positive().nullable() }),                // '1 standard action' -> standard, 1
  components: z.object({ verbal: z.boolean(), somatic: z.boolean(), material: z.boolean(),
    focus: z.boolean(), divineFocus: z.boolean(), xp: z.boolean(), raw: z.string(),
    details: z.object({ material: z.string().optional(), focus: z.string().optional(),
                        divineFocus: z.string().optional() }).optional() }),  // texto entre paréntesis
  range: z.object({ raw: z.string(),
    kind: z.enum(['personal','touch','close','medium','long','unlimited','fixed','other']),
    fixedFt: z.number().int().positive().optional() }),               // solo kind 'fixed'
  targeting: z.array(z.object({ kind: z.enum(['target','area','effect','other']),
    raw: z.string() })),                                              // [] si la página no lo trae
  duration: z.object({ raw: z.string(),
    kind: z.enum(['instantaneous','permanent','concentration','timed','other']),
    dismissible: z.boolean(),
    amount: z.number().int().positive().optional(),                   // solo kind 'timed' con
    unit: z.enum(['round','minute','hour','day']).optional(),         //  forma «N unidad[/level]»
    perLevel: z.boolean().optional() }),
  savingThrow: z.object({ raw: z.string(),
    kind: z.enum(['none','fortitude','reflex','will','multiple','other']),
    effect: z.enum(['negates','half','partial','disbelief','other']).optional(),
    harmless: z.boolean(), object: z.boolean() }),
  spellResistance: z.object({ raw: z.string(), applies: z.enum(['yes','no','other']),
    harmless: z.boolean(), object: z.boolean() }),
  shortDescriptionEn: z.string().optional(),                          // línea en cursiva de la fuente
});
SpellListsSchema = z.record(CasterClassId, z.record(z.string() /*"0".."9"*/, z.array(z.string())));
// CasterClassId = clases de `classes` con `casting` (hoy bard, cleric, druid, paladin, ranger).
```
Reglas del modelo:
- **`raw` siempre se conserva literal**; los campos estructurados son una lectura derivada por la
  función pura `classifySpellFields(raw)` de `src/data/spells/fields.ts`, que el parser y la regla
  de integridad R96 usan por igual (la regla recalcula y compara). Lo que no sabe clasificar sale
  como `kind: 'other'` (nunca se inventa) y se cuenta en el informe de importación. f3 **no**
  calcula alcances ni duraciones dependientes del nivel de lanzador: las fórmulas (`25 ft. + 5
  ft./2 levels`) quedan en `raw` y las evalúa quien las necesita (f6/f7).
- **`levels` en el modelo de datos:** sin `spell-lists` para `sorcerer` y `wizard`, la fuente de
  verdad de sus listas es `spells[].levels`; el helper puro `spellsForClass(spells, classKey,
  level?)` (`src/data/spells/query.ts`, R100) las expone a f7/f8 y, para las clases con lista,
  debe coincidir con `spell-lists` (mismo test que R22 desde el otro lado).
- **Línea `Level` de la fuente (R94, R97):** el parser tokeniza con el catálogo de
  `scripts/srd/config/spell-class-ids.json` = `{ crbClassIds (los 11), abbreviations
  (`sor/wiz` -> [sorcerer, wizard]), nonCrbClassIds (alchemist, antipaladin, inquisitor, magus,
  oracle, summoner, witch, ... lista a cerrar en TD.1 con las fixtures), }`. Tokens de
  `nonCrbClassIds` se descartan y se cuentan (los conjuros CRB reimpresos en otros libros traen
  sus clases); un token fuera de los tres grupos y de los dominios del CRB hace fallar el parseo.
  Si la línea `Level` no incluye claves de dominio, el implementer NO las inventa: lo anota en
  `progress/impl_f3-srd-data_D0.md` y la pertenencia a dominio se queda en `domains` (R23).
- **Universo (R93):** `data:import` descubre desde el **índice completo de conjuros** de la
  fuente filtrado por la etiqueta CRB, no desde las listas de clase. El `expectedCount` total (y
  por lote, R99) sale de ese índice y se congela en la procedencia (Q10).

**Verificación cruzada interna.** Antes la lectura de R22 (`levels` vs `spell-lists`) servía
también de segunda lectura del universo; ahora solo cubre las 5 clases con lista. Lo que NO tiene
segunda lectura (`sorcerer`, `wizard`, conjuros solo de ese par, dominios) se contrasta con:
(a) el recuento del índice congelado y contrastable con el impreso (R26, R99, Q10), (b) los
goldens de §5 con conjuros solo de mago/hechicero, (c) R96 (campos estructurados vs `raw`), (d)
el estrato de muestreo por escuela y el de «solo `sorcerer`/`wizard`» (R103) para ojo humano, y (e)
`--crosscheck` (R56). Si la lista de clase y la entrada difieren, o el parser falla o la fuente
tiene un error que se documenta con un override.

Alcance de conjuros (reescrito): todas las páginas de conjuro del índice de la fuente con
etiqueta CRB (R93); páginas de otro libro se excluyen y se listan (R46). Los conjuros de otras
clases del CRB (`fighter`, `monk`... no lanzan) y de `sorcerer`/`wizard` se registran en `levels`;
las clases de otros libros no (R97).

**Qué necesitan los consumidores** (los campos de arriba se eligen para esto; no se añade nada
sin consumidor):

| Consumidor | Usa | Campos |
|---|---|---|
| f3b (bestiario) | resolver `spellId` por nombre (slug) | `id`, `name`; ya no habrá `null` para conjuros del CRB |
| f6 (CD y daño de conjuros) | CD = 10 + nivel de conjuro + característica; tipo de efecto | `levels[claseDelLanzador]`, `savingThrow.{kind,effect}`, `spellResistance.applies`, `descriptors`, `school` (el daño en dados queda en `textEn`; f6 lo decide contra el texto, como con `extraDamage` en §14.4) |
| f7 (conjuros de la ficha: por día, preparados, componentes) | lista por clase y nivel, coste de lanzamiento | `spellsForClass`, `castingTime.unit`, `components.{material,focus,xp,details}`, `duration.{kind,perLevel}`, `range.kind` |
| f8 (compendio) | filtros y ficha completa | `school`, `subschool`, `descriptors`, `levels`, todos los `raw`, `shortDescriptionEn`, `textEn`, `nameEs`/`summaryEs` |

Alternativas descartadas para esta ampliación:

| Alternativa | Motivo |
|---|---|
| Mantener solo las listas de las 5 clases y guardar `spellId: null` para el resto | Rompe el uso por f3b/PNJ/f8 y obliga a un segundo mecanismo de referencia; decisión del humano (2026-10-16) en contra. |
| Importar el universo desde las páginas de lista de cada clase de las 11 | Exige las listas de las 4 clases fuera de alcance y pierde los conjuros que no estén en ninguna lista del CRB; el índice general es una fuente más simple y su recuento es contrastable (R93). |
| Exigir entrada de clase para toda clave de `levels` | Obligaría a importar `sorcerer`/`wizard` completos (Q9); el catálogo cerrado `CRB_CLASS_IDS` da la misma garantía de no admitir claves arbitrarias (R92). |
| Generar `spell-lists` de `sorcerer`/`wizard` desde ya | Segunda fuente de verdad sin consumidor; queda como Q15. |
| Dejar `range`, `duration` y `castingTime` como cadena | f7 tendría que reanalizar texto; la estructura con `raw` conservado y `kind: other` como válvula de escape (R96) evita ambas cosas. |

### 4.5 Equipo (R24, R25)
Unión discriminada por `kind` en ficheros separados:
- `weapon`: `category` (`simple|martial|exotic`), `handedness` (`unarmed|light|oneHanded|
  twoHanded|ranged`), `costCp`, `damage:{small,medium}` (cadenas de dados `1d8`),
  `critical:{range:19|20|18, multiplier:2|3|4}`, `rangeIncrementFt?`, `weightLb`,
  `damageTypes:('B'|'P'|'S')[]`, `special:string[]`, `ammunition?`.
- `armor`: `category` (`light|medium|heavy`), `costCp`, `armorBonus`, `maxDex: number|null`,
  `armorCheckPenalty` (<= 0), `arcaneSpellFailurePct`, `speed30`, `speed20`, `weightLb`.
- `shield`: igual con `shieldBonus` (los escudos de cuerpo/torre aplican reglas propias que
  se dejan en `textEn`).
- `gear`: `category` (`adventuring-gear|special-substance|tools|clothing|food-lodging|
  mounts|...`), `costCp`, `weightLb`.
Dinero: **siempre enteros en piezas de cobre** (`15 gp` -> 1500) más `costRaw` literal; evita
decimales de coma flotante en los cálculos de f4 (peso/carga) y f6.

## 5. Reglas de integridad (`src/data/integrity`)

Interfaz común:
```ts
export interface IntegrityIssue { category: Category; id?: string; rule: string; message: string }
export type IntegrityRule = (data: LoadedDataset, ctx: IntegrityContext) => IntegrityIssue[];
export function runIntegrity(data: LoadedDataset): IntegrityIssue[]; // agrega TODO (R52)
```
- Puras: reciben los datos cargados y devuelven una lista; sin I/O (la CLI lee ficheros).
- `integrity/index.ts` registra reglas en orden; el fundamento (Task 1) lo crea con todos los
  módulos como **stubs** que devuelven `[]`, para que cada lote solo reemplace "su" fichero y no
  haya conflictos de edición.
- Los tests de cada regla usan **datasets sintéticos rotos** (mínimo viable que provoque el fallo)
  y un caso verde; los tests de datos reales (`tests/data/<categoría>.test.ts`) ejecutan
  `runIntegrity` sobre los JSON reales de su categoría.
- Las reglas entre categorías (clase->habilidades, dominio->conjuros, claves de `levels` ->
  `domains` (R92), glosario->todo) se aplican en la integración final (Lote Z), cuando todas las
  categorías existen. Las partes de `spell-lists.ts` que no dependen de `domains` (R21, R22, R95,
  R96, clave contra `CRB_CLASS_IDS`) se prueban ya en el Lote D con datos sintéticos.

### Valores de referencia (goldens)
`tests/data/fixtures/*-golden.json`, escritos a mano a partir del CRB, aprobados por el humano
en la revisión del spec (son pocos y se leen a ojo):
- Clases (R12): `class-golden.json` con `class -> {hitDie, ranks, bab, fort, ref, will}`.
  Valores que el spec fija: druida d8, 4 rangos; pícaro d8, 8; cazador d10, 6; bárbaro d12, 4; paladín d10, 2;
  bardo d8, 6; clérigo d8, 2. BAB: completo (cazador, bárbaro, paladín), 3/4 (druida, pícaro,
  bardo, clérigo). Salvaciones buenas: druida Fort+Will; pícaro Ref; cazador Fort+Ref; bárbaro
  Fort; paladín Fort+Will; bardo Ref+Will; clérigo Fort+Will.
- Conjuros por día: clérigo y druida nivel 1 con `spellsPerDay[0] = 3` y `[1] = 1`; paladín y
  cazador niveles 1-3 con todo `null`/ausente y nivel 4 con `[1] = 0` (distinción `null` vs `0`).
- Dotes: *Power Attack* (Str 13, BAB +1), *Cleave* (Str 13, *Power Attack*), *Great Cleave*
  (Str 13, *Cleave*, *Power Attack*, BAB +4).
- Conjuros (`tests/data/fixtures/spell-golden.json`, a confirmar contra la página de origen):
  *Cure Light Wounds* (cleric 1, bard 1, druid 1, paladin 1, ranger 2; sin `sorcerer`/`wizard`;
  escuela conjuration, subescuela healing, tiempo `1 standard action`, salvación Will half
  (harmless), RC yes (harmless)); *Magic Missile* (solo `sorcerer` 1 y `wizard` 1 entre las
  claves CRB, escuela evocation, sin tirada de salvación, RC yes); *Burning Hands* (`sorcerer` 1,
  `wizard` 1, y miembro del dominio de Fuego en `domains`, ya no «solo vía dominio»); *Wish*
  (`sorcerer` 9 y `wizard` 9, componente material con coste en `raw`: caso de nivel 9).
  Los goldens solo comparan claves CRB; si la fuente trae además clases de otro libro (R97) se
  ignoran.
- Equipo: Longsword (15 gp, daño 1d6 pequeño y 1d8 mediano, 19-20/x2, 4 lb, S), Dagger (2 gp, 1d4, 19-20/x2, 10 ft,
  1 lb, P o S), Full plate (1.500 gp, +9, Max Dex +1, ACP -6, ASF 35%, 50 lb), Heavy steel
  shield (+2, ACP -2, ASF 15%, 15 lb).
  Todos los goldens se anotan "a confirmar contra la página de origen" si el implementer
  detecta discrepancia; el humano decide.

Si el golden y la fuente discrepan, el implementer **no cambia ninguno**: escribe la
discrepancia en `progress/impl_f3-srd-data.md` y para (principio de fidelidad).

## 6. Comprobación de cifras en resúmenes (R30)
`checkNumericFidelity(summaryEs, textEn)`: extrae con regex tokens numéricos (`\d+d\d+`, `[+-]\d+`,
`\d+`), normaliza (`−` -> `-`), y exige `tokens(summaryEs) ⊆ tokens(textEn)`. Palabras-número
("dos") quedan fuera por diseño; el informe de muestreo sirve para la revisión humana de lo que el
filtro no ve. Los resúmenes `draft` los redacta un agente exclusivamente a partir del `textEn` de la
misma entrada (instrucción explícita en tasks: "no añadir reglas que no estén en el texto").

## 7. Glosario y localización

- Dos tipos de clave: `entry` (nombre de una entrada) y `term` (vocabulario transversal que no es
  entrada: características, salvaciones, tipos de bonificador, tamaños, alineamientos, condiciones
  más usadas). Lista inicial de `term`: `strength`..`charisma`, `fortitude-save`, `reflex-save`,
  `will-save`, `base-attack-bonus`, `armor-class`, `touch-ac`, `flat-footed`, `initiative`,
  `enhancement-bonus`, `morale-bonus`, `luck-bonus`, `dodge-bonus`, `circumstance-bonus`,
  `deflection-bonus`, `resistance-bonus`, `competence-bonus`, `insight-bonus`, `armor-bonus`,
  `shield-bonus`, `natural-armor-bonus`, `sacred-bonus`, `profane-bonus`, `inherent-bonus`,
  `racial-bonus`, `alchemical-bonus` (los tipos de efecto de los objetos mágicos, R73),
  `smite-evil`, `power-attack`, `sneak-attack`, `rage`, `favored-enemy`, `bardic-performance`,
  `inspire-courage`, `wild-shape`, `channel-energy`, `lay-on-hands`, `animal-companion`.
- Todo lo que redacte un agente es `origin: draft, verified: false`. Solo el humano pasa a
  `origin: human, verified: true` (R32); editar un shard es el mecanismo, y `data:validate`
  impide el estado incoherente.
- `glossary.es.json` es un **artefacto generado** (fusión ordenada de los shards, claves
  ordenadas, `\n` final): el humano lo lee en un solo sitio, pero edita los shards. La
  validación falla si el commiteado difiere del generado (R36), evitando dos fuentes de verdad.
- Resolución: 
```ts
export interface LocalizedEntry<T extends BaseEntry> {
  entry: T;                       // capa SRD
  nameEs: string | null;          // glosario
  nameEsVerified: boolean;
  summaryEs: string;              // resumen
  summaryStatus: 'draft'|'reviewed';
}
```
  La UI decide cómo mostrar lo no verificado (Q2); los datos solo informan.

## 8. Acceso a datos: `RulesDataSource`

```ts
// src/data/rules-data-source.ts   (swap point de architecture.md §4)
export interface RulesDataSource {
  get<C extends Category>(category: C, id: string): Promise<LocalizedEntry<EntryOf<C>> | undefined>;
  list<C extends Category>(category: C): Promise<readonly LocalizedEntry<EntryOf<C>>[]>;
  getSpellList(classId: CasterClassId): Promise<SpellLists[CasterClassId]>;
  getLegalNotice(): LegalNotice;
}
```
- `JsonRulesDataSource`: import dinámico de `<categoría>/index.ts` (lista estática generada de
  shards -> bundlers y Node resuelven igual); cache por categoría; **valida con zod al cargar** y
  lanza error de infraestructura claro (R60). Perezosa (R61): clave para que la PWA no cargue
  los ~2 MB de conjuros (todo el capítulo 10, estimación a medir) para ver una dote.
- `InMemoryRulesDataSource(entries)`: fake para f4/f6/f8. Un **test de contrato compartido**
  (`runRulesDataSourceContract(factory)`) se ejecuta contra ambas (R58, R59).
- `src/rules` no usa `RulesDataSource`: recibe valores ya resueltos (clase, dote...) por
  parámetro, preservando la pureza de f2.
- Un id desconocido devuelve `undefined` (resultado esperado, no excepción, `docs/conventions.md`).

## 9. Aviso legal (R37-R40)
- `LICENSE-OGL.md`: texto íntegro de OGL v1.0a (texto oficial de Wizards) + sección "Section 15:
  Copyright Notice" con:
  `Pathfinder Roleplaying Game Core Rulebook. © 2009, Paizo Publishing, LLC; Author: Jason
  Bulmahn.` y `Pathfinder Roleplaying Game Reference Document. © 2011, Paizo Publishing, LLC;
  Authors: Jason Bulmahn, ...` (el texto exacto se copia de la propia página del SRD usado; el
  implementer lo reproduce literal y lo anota en `progress/impl_f3-srd-data.md` para revisión).
- `src/data/legal/ogl-1.0a.ts` exporta el mismo texto como constante (para el bundle del
  cliente, sin depender del filesystem); `legal.test.ts` comprueba igualdad con el `.md` (R38).
- Marca de producto: este proyecto no usa marcas ni Product Identity de Paizo y se declara
  "no oficial y sin afiliación" en el aviso.
- Contrato con la UI (R40): `getLegalNotice(): { oglText: string; section15: string[];
  unofficialNotice: string }`. El montaje de la pantalla se decide en Q6.

## 10. Informe de muestreo (R53-R57)
- `sample.ts` es una función pura `buildSample(data, {seed, perCategory}) -> SampleSet` con un
  PRNG determinista (mulberry32) y selección ordenada por `id` antes de barajar (estable ante
  reordenación de ficheros). Estratos: (1) todas las clases, (2) todo con `override` o
  `needsReview`, (3) `k` aleatorias por categoría restante. Para `spells` se añaden dos estratos
  fijos (R103): un conjuro por escuela y un conjuro solo `sorcerer`/`wizard` (si existe); para
  `magic-items`, uno por `kind` (R89).
- El renderizador produce Markdown con casillas `- [ ] OK  - [ ] Error` por entrada, y un
  resumen inicial con contadores (R57). Con `--crosscheck`, una función inyectada
  `fetchText(url)` (fake en tests) descarga la página equivalente de d20pfsrd (mapa de URL por
  categoría en `seeds.json`) y calcula la similitud de Jaccard sobre tokens normalizados
  (R56); las entradas sin equivalente se marcan "sin contraste".
- El informe vive en `reports/` (git-ignorado); el humano anota el resultado en
  `src/data/provenance/<cat>.json` (`humanReviewed`, `reviewedBy`, `reviewedAt`) al aprobar.

## 11. Partición para implementación paralela

Ficheros disjuntos por lote; solo el **Lote 0 (fundamentos)** y la **Integración final** tocan
ficheros compartidos. Detalle de pasos en `tasks.md`.

| Lote | Agente | Posee (escritura exclusiva) |
|---|---|---|
| 0 Fundamentos | 1 | `src/data/{categories,index}.ts`, `schema/common.ts`, `schema/{summary,glossary,provenance}.ts`, `integrity/index.ts` + stubs, `rules-data-source.ts`, `json-/in-memory-` impls, `legal/**`, `LICENSE-OGL.md`, `scripts/srd/{cli.ts,lib/**}`, `scripts/srd/config/**`, `.gitignore` (reports, .cache) |
| A Clases | 1 | `schema/{class,class-feature,domain}.ts`, `classes/**`, `class-features/**`, `domains.json`, `parsers/{classes,class-features,domains}.ts`, `integrity/{class-tables,class-refs,domain-refs}.ts`, `summaries/{classes,class-features,domains}/**`, `glossary/{classes,class-features,domains}.es.json`, `overrides`/`provenance` de esas categorías, fixtures y tests propios |
| B Razas y habilidades | 1 | análogo para `races`, `skills` |
| C Dotes | 1 | análogo para `feats`, más `integrity/feat-prereqs.ts` |
| D0 Conjuros: fundamentos | 1 (secuencial; bloquea a D1-D4) | `schema/{spell,spell-list}.ts`, `src/data/spells/{fields,query}.ts`, `parsers/spells.ts` y `parsers/spell-lists.ts`, `config/{spell-class-ids,spell-batches}.json`, claves `spells`/`spell-lists` de `seeds.json` y `section-allowlist.json`, `integrity/spell-lists.ts`, `tests/data/fixtures/spell-golden.json`, fixtures y tests propios |
| D1-D4 Conjuros por rango alfabético (R99) | 4 en paralelo, uno por lote | cada uno SOLO: `spells/<iniciales de su rango>.json`, `summaries/spells/<iniciales>.json`, `glossary/spells/<iniciales>.es.json`, `provenance/spells/<lote>.json`, `overrides/spells/<lote>.json`, `tests/data/spells/<lote>.test.ts`. Rangos iniciales: D1 `a-c`, D2 `d-h`, D3 `i-r`, D4 `s-z` (TD.3 los reajusta con los recuentos reales del índice para equilibrar carga) |
| D5 Conjuros: cierre | 1 (después de D1-D4) | `spells/lists.json` y `spells/index.ts` (generado), `provenance/{spell-lists,spells}.json` consolidados, `tests/data/spells.test.ts` |
| E Equipo | 1 | análogo para `weapons`, `armor`, `shields`, `gear` |
| M Objetos mágicos | 1 (parser + import por prioridad, §14.7); luego hasta 2 en paralelo solo para `summaries/magic-items/<kind>` | `schema/magic-item.ts`, `magic-items/**` (datos y `effects.ts`), `scripts/srd/parsers/magic-items/**`, `scripts/srd/config/magic-sections.json`, claves `magic-items` de `seeds.json` y `section-allowlist.json`, `integrity/magic-refs.ts`, `summaries/magic-items/**`, `glossary/magic-items.es.json` (o shards `glossary/magic-items/<kind>.es.json`), `overrides`/`provenance` de `magic-items`, fixtures y tests propios |
| Z Integración | 1 | `glossary.es.json`, `integrity/{counts,summaries,glossary,ids,book-filter,overrides}.ts`, cross-category, informe de muestreo semilla fija, `progress/impl_f3-srd-data.md` |

Los lotes A-C, E y M son independientes (cada uno trabaja con su `provenance/` y su `<cat>/index.ts`);
dependen del Lote 0 y de f0 (npm/tsx/vitest instalados). El Lote D es un grupo: D0 depende del
Lote 0; D1-D4 dependen de D0 y corren en paralelo entre sí y con A-C, E y M; D5 depende de D1-D4.
**Por qué rango alfabético y no por nivel de conjuro (0-3, 4-6, 7-9):** los shards de `spells` se
nombran por inicial del `id` y un lote por nivel escribiría en todos los shards a la vez
(conflicto de edición); con rangos de inicial, los ficheros de cada lote (datos, resúmenes,
glosario, procedencia, overrides) son disjuntos por construcción (R99), y la procedencia por
lote (R98) evita que dos agentes editen el mismo `provenance/spells.json`. El desequilibrio de
carga entre rangos se corrige en TD.3 con los recuentos reales del índice. El Lote M prueba sus reglas con
datasets sintéticos y fixtures; las referencias a datos reales de `weapons`/`armor`/`shields`
(Lote E), `skills` (Lote B) y `spells` (Lote D) se comprueban en el Lote Z, como el resto de
reglas entre categorías.

## 12. Dependencias (versiones pineadas, solo devDependencies salvo zod)
- `zod` (runtime; ya lo trae f0 para el servidor).
- `cheerio` (devDependency): parseo HTML en scripts. No entra en el bundle.
- `tsx` (devDependency): ejecutar `scripts/srd/cli.ts` (si f0 elige otro runner, se adapta).
- Sin librerías de scraping, de PRNG ni de hashing: `node:crypto` y fetch nativo de Node 22.

## 13. Riesgos
- **Entorno:** Node.js aún no está instalado en la máquina (ver `progress/current.md`); sin él no
  hay implementación. Además el import requiere red; si el agente no la tiene, el humano ejecuta
  `npm run data:import` localmente y commitea `provenance/`.
- **Calidad del parseo de tablas** (celdas "—", encabezados con subíndices): mitigado con
  fixtures, fórmulas de R11 y goldens.
- **Cambios en la web de la fuente:** `--verify` y el `sha256` lo detectan; los datos
  commiteados siguen siendo válidos.
- **Resúmenes ES alucinados:** R30 filtra cifras; el muestreo humano cubre el resto; estado
  `draft` visible en la UI de f8.
- **Tamaño:** estimación ~3 MB de JSON sin comprimir sin conjuros de mago/hechicero, más ~1 MB
  si los objetos mágicos son del orden de varios cientos de entradas, más el aumento de `spells`
  al capítulo 10 completo (decisión del 2026-10-16; varios centenares de conjuros con campos
  estructurados, del orden de 1-2 MB adicionales). Todo se mide en el primer import; carga
  perezosa por categoría (R61), `magic-items` por `kind` y `spells` por inicial.
- **Conjuros (ampliación):** (1) sin lista de clase que sirva de segunda lectura para
  `sorcerer`/`wizard` y dominios, la fidelidad descansa en el recuento del índice (Q10), los
  goldens y el muestreo por escuela (R103); (2) la línea `Level` mezcla libros y abreviaturas
  (R97), por lo que un token nuevo en la fuente detiene el parseo en vez de colarse; (3) volumen
  de ~4 lotes en paralelo con resúmenes ES de cada conjuro: el cuello de botella es la capa ES y
  su revisión humana (R30 filtra cifras; el borrador es `draft`).
- **Objetos mágicos (§14):** (1) las filas genéricas de pociones/varitas/pergaminos pueden no
  existir como páginas en la fuente primaria (Q11); (2) el texto de páginas reimpresas puede
  ser el actualizado (Q13); (3) la extracción de efectos desde prosa es heurística: se contiene
  con evidencia literal obligatoria (R75), informe de huecos (R88) y muestreo por `kind` (R89).

## 14. Objetos mágicos del capítulo 15 (Lote M)

Decisión del humano del 2026-10-16 (resuelve Q3): entran en la primera entrega porque los
jugadores (nivel 5-6) ya los tienen. Todo el contenido es del CRB (R3, R27). Cumple los
principios de §1: capa SRD generada por script, nunca tecleada; falla cerrado; verificación en
capas.

### 14.1 Alcance

Todo lo que el índice de la fuente etiquete como CRB en las secciones del capítulo 15, sin
recortar por nivel: armaduras y escudos mágicos (habilidades especiales y objetos
específicos), armas mágicas (habilidades especiales y armas específicas), pociones y aceites,
anillos, varas, bastones, varitas, objetos maravillosos de todas las ranuras, objetos malditos,
objetos inteligentes y las secciones de reglas generales (pergaminos, precios por bono,
creación de objetos) como entradas `general`. Si una sección no tiene entradas CRB (p. ej.
artefactos), `magic-sections.json` lo declara con `expectedCount: 0` y `reason` (R66): el
silencio no es válido. El **orden** de trabajo prioriza lo útil a nivel 5-6 (§14.7), pero el
alcance final es el capítulo completo.

### 14.2 Fuente: observaciones del 2026-10-16 (a revalidar en la tarea TM.0)

Comprobado con peticiones corteses a `aonprd.com` durante la redacción del spec:
- Familias de URL: `MagicArmorDisplay.aspx` (cualidades de armadura y escudo, armaduras y
  escudos únicos), `MagicWeaponsDisplay.aspx` (cualidades y armas únicas),
  `MagicRingsDisplay.aspx`, `MagicRodsDisplay.aspx`, `MagicStavesDisplay.aspx`,
  `MagicPotionsDisplay.aspx`, `MagicWondrousDisplay.aspx` (por ranura: Belts, Body, Chest,
  Eyes, Feet, Hands, Head, Headband, Neck, Shoulders, Wrist, None/Other), más `MagicCursed`,
  `MagicIntelligent`, `MagicArtifacts`, `MagicOther`. Índices en `Magic<Familia>.aspx`.
- Cabecera de página de objeto: `Source`, `Aura`, `CL`, `Slot`, `Price`, `Weight`,
  `Description`, `Construction Requirements`, `Cost`. En habilidades de arma el precio es
  `+1 bonus` y el slot `weapon quality` (p. ej. *Keen*, *Seeking*).
- **Varias etiquetas `Source`:** *Keen* y *Seeking* muestran `Ultimate Equipment pg. N, PRPG
  Core Rulebook pg. 469`. De ahí R86 y Q13. *Flame Tongue* se describe como «+1 flaming burst
  longsword» (de ahí R70).
- **Posible hueco (Q11):** los índices de pociones/bastones de AoN listan objetos con nombre
  propio (muchos de otros libros) y no las filas genéricas del CRB; no hay «Wands» en su
  navegación y la búsqueda de *wand of cure light wounds* devuelve monstruos. La tarea TM.0
  documenta, por sección, qué página de qué host aporta los datos; lo que falte espera a Q11.
- Los índices mezclan libros: el descubrimiento filtra por la etiqueta CRB de cada página (R87),
  y `expectedCountByKind` se congela del índice filtrado, no de memoria (Q10).

### 14.3 Schema (`schema/magic-item.ts`), forma pública

```ts
export const MAGIC_ITEM_KINDS = ['armor-ability','shield-ability','weapon-ability',
  'specific-armor','specific-shield','specific-weapon','potion','oil','ring','rod','staff',
  'wand','wondrous','cursed','intelligent','artifact','general'] as const;

// Idéntico a BONUS_TYPES de f2 (src/rules/types.ts, design f2 §3). Si f2 cambia el catálogo,
// el test de R73 falla.
export const BONUS_TYPES = ['alchemical','armor','circumstance','competence','deflection',
  'dodge','enhancement','inherent','insight','luck','morale','naturalArmor','profane','racial',
  'resistance','sacred','shield','size','untyped'] as const;

export const MagicEffectSchema = z.object({
  target: z.union([
    z.enum(['attack','damage','ac','initiative','save.fortitude','save.reflex','save.will',
            'save.all','ability.str','ability.dex','ability.con','ability.int','ability.wis',
            'ability.cha']),
    z.string().regex(/^skill\.[a-z0-9-]+$/),               // id de `skills` (R84)
  ]),
  bonusType: z.enum(BONUS_TYPES),                           // R73
  value: z.number().int().refine(v => v !== 0),             // < 0 = penalizador
  appliesTo: z.enum(['wearer','item']),                     // 'item': solo ese arma/armadura/escudo
  conditional: z.boolean(),                                 // R76
  conditionText: z.string().min(1).optional(),
  foldInto: z.enum(['armor','shield','naturalArmor']).optional(),  // R77; solo con target 'ac'
  evidence: z.string().min(1),                              // R75: subcadena literal de textEn
}).strict();

export const ExtraDamageSchema = z.object({                 // R78
  dice: z.string().regex(/^\d+d\d+$/), damageType: z.string().min(1),
  trigger: z.enum(['always','onCritical','conditional']),
  conditionText: z.string().min(1).optional(), evidence: z.string().min(1),
}).strict();

export const MagicVariantSchema = z.object({
  variantId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), // 'default' si es única; 'plus-2'...
  label: z.string().min(1),
  casterLevel: z.number().int().positive().nullable(),
  priceRaw: z.string(), priceCp: z.number().int().nonnegative().nullable(),   // R68
  bonusEquivalent: z.number().int().min(1).max(5).optional(),                  // R69
  effects: z.array(MagicEffectSchema), extraDamage: z.array(ExtraDamageSchema),
}).strict();

// Base común + unión discriminada por `kind`:
MagicItemBase = BaseEntrySchema.extend({
  kind, slot: z.string(), aura: z.string(), weightLb: z.number().nonnegative().nullable(),
  construction: z.object({ requirements: z.string(), costRaw: z.string(),
                           costCp: z.number().int().nonnegative().nullable() }),
  sourceRefAll: z.string().optional(), reprintedIn: z.array(z.string()),   // R86
  variants: z.array(MagicVariantSchema).min(1),
});
// campos propios por kind:
//  weapon-ability | armor-ability | shield-ability: legalFor (R81)
//  specific-weapon | specific-armor | specific-shield: baseItemId | null + baseItemRaw?,
//      enhancement {on:'weapon'|'armor'|'shield', bonus 1..5}, abilityIds[], baseEvidence (R70)
//  potion | oil | wand | staff (los de conjuro): spellRefs [{name, spellId|null, spellLevel?}] (R85)
//      spellId enlaza SIEMPRE si el conjuro es del CRB (todo el cap. 10 está en `spells`); null solo para otro libro
//  general (armas/armaduras/escudos mágicos): enhancementPrices [{bonus, priceCp}] (R71)
//  ring | rod | wondrous | cursed | intelligent | artifact: solo la base
```
`legalFor`: arma `{ range: 'melee'|'ranged'|'any', damageTypes?: ('B'|'P'|'S')[],
weaponIds?: string[], raw: string }`; armadura/escudo `{ categories?:
('light'|'medium'|'heavy')[], raw: string }` (`kind` ya distingue armadura de escudo). Si la
frase de restricción no se puede estructurar, `range: 'any'` y `needsReview: true` (R81), nunca
una restricción inventada.

Ids: slug del nombre (R4). Si dos `kind` producen el mismo slug, R5 falla y se resuelve con un
alias declarado en `slug-aliases.json` del tipo `<kind>.<slug>` (misma vía que las clases). Las
páginas con tabla de variantes (*Ring of Protection +1..+5*) producen **una** entrada con
varias `variants`, no una entrada por fila; el `name` es el título de la página de la fuente.

JSON: igual que f2 R5, las propiedades opcionales ausentes se **omiten** (no `undefined`).

### 14.4 Efectos numéricos y alineación con el resolvedor de f2

f2 (`design.md` §3-§5) calcula con `Modifier { id, name, value, type }`, donde `type` es uno de
los 19 `BonusType` (más `base`/`ability`, que f3 nunca emite). f3 **no importa** `src/rules`
(f2 y f3 se hacen en paralelo): replica el catálogo (R73, comprobado por test) y entrega los
efectos con forma de `Modifier` (`getItemEffects`, R79). La traducción a llamadas de f2 es
cosa de f4/f6:

| Efecto (ejemplos ilustrativos; el contenido real sale de la fuente) | `target` | `bonusType` | `foldInto` | `appliesTo` | Lo consume |
|---|---|---|---|---|---|
| Anillo de protección +n | `ac` | `deflection` | | wearer | `armorClass({ modifiers })` de f2 |
| Brazales de armadura +n (bono de armadura propio) | `ac` | `armor` | | wearer | `armorClass`; compite con la armadura vestida por «el mayor gana» del resolvedor |
| Amuleto de armadura natural +n | `ac` | `enhancement` | `naturalArmor` | wearer | f4 suma n al `value` del modificador `naturalArmor` (f2 §5.4) |
| Armadura mágica +n (`getEnhancementEffects('armor', n)`) | `ac` | `enhancement` | `armor` | item | f4 suma n al `value` del modificador `armor` (f2 §5.4, OQ-7) |
| Escudo mágico +n | `ac` | `enhancement` | `shield` | item | idem para `shield` |
| Arma mágica +n | `attack` y `damage` | `enhancement` | | item | f6, solo en ataques con esa arma |
| Capa de resistencia +n | `save.all` | `resistance` | | wearer | `savingThrow({ modifiers })` |
| Cinturón / diadema de característica +n | `ability.str`... | `enhancement` | | wearer | `effectiveAbility(id, base, modifiers)` |
| Bonos a habilidad (p. ej. +n competencia a una habilidad) | `skill.<id>` | `competence` | | wearer | `skillModifier({ modifiers })` |
| Bonos a iniciativa | `initiative` | según el texto | | wearer | `initiativeModifier({ modifiers })` |

Reglas de modelado:
- `getItemEffects(entry, variantId)` produce `id = magic:<entryId>:<variantId>:<n>` (n = índice del
  efecto; `save.all` se expande a tres con sufijo `:fortitude|reflex|will`). Los ids son únicos
  por estadística, como exige f2 R19. `name` es el nombre SRD en inglés; la UI traduce por id.
- `type` = `bonusType`; los apilamientos («el mayor gana» por tipo; esquiva, circunstancia y sin
  tipo se apilan; los penalizadores siempre) los resuelve f2, **no** f3: los datos no deciden el
  apilamiento.
- `getEnhancementEffects(on, bonus)` (R80) es la derivación de la regla de mejora: arma = ataque
  y daño; armadura/escudo = pliegue en `armor`/`shield` (f2 §5.4). No se duplican como efectos en
  cada objeto específico: el objeto declara `enhancement` y el consumidor llama a la función, así
  la regla vive en un solo sitio.
- Un efecto **condicional** (p. ej. «contra miedo», «solo con ataques sin armas») lleva
  `conditional: true` y `conditionText`; f4/f7 lo muestran como interruptor y nunca lo suman
  automáticamente.
- El daño extra de armas (`extraDamage`, R78) se entrega como datos (dados, tipo, disparador)
  para el desglose por fuente y tipo de f6; f3 no afirma cómo se multiplica en crítico: eso lo
  decide f6 contra el texto (`textEn`).
- Objetos cuyo bono depende de una elección del propietario (p. ej. «a elegir») o cuyo efecto el
  parser no sabe estructurar quedan sin `effects`, con el texto completo; aparecen en el informe
  de huecos (R88) y el humano decide si se estructuran con un override (R49: `reason` +
  `evidence`).
- **Extracción:** patrón determinista sobre `textEn` (`[+-]N <tipo> bonus ... on/to <objetivo>`,
  con tipo del catálogo y objetivo del vocabulario de R74). Cada efecto guarda la frase literal
  en `evidence`; R75 la comprueba. Es una barrera contra efectos inventados; el informe de
  huecos (R88) lo es contra efectos omitidos. La detección es una función pura
  `findEffectGaps(entries)` en `parsers/magic-items/effects.ts`, usada por el informe de
  importación (R88) y por el muestreo (R90), que recalcula desde los datos.

### 14.5 Legalidad y topes (R81-R83)

- Decisión del spec para `weapon-ability`: un arma es *cuerpo a cuerpo* si `handedness !==
  'ranged'`; es *a distancia* si `handedness === 'ranged'` o tiene `rangeIncrementFt` (las
  arrojadizas cuentan para ambas). Una habilidad es legal si cumple `range`, la intersección de
  `damageTypes` con los del arma base es no vacía (cuando se declara) y `weaponIds` incluye el
  arma (cuando se declara). Los casos ambiguos se anotan en el informe de TM.0; no se resuelven
  en silencio (principio de fidelidad).
- Ejemplos verificados en la fuente el 2026-10-16: *Keen* «Only piercing or slashing melee
  weapons can be keen»; *Seeking* «can only be placed on ranged weapons».
- Armaduras: `categories` limita por ligera/intermedia/pesada; la distinción armadura/escudo la
  da el `kind` (R84 exige que `abilityIds` apunte al `kind` de habilidad que corresponde al
  objeto base).
- Topes (R83): mejora máxima +5 y bonificador efectivo (mejora + equivalentes) máximo +10, según
  la lectura del spec_author del capítulo 15. **Se confirman contra el texto en TM.0**; si
  difieren, el implementer anota la discrepancia en `progress/impl_f3-srd-data_M.md` y para.
  Otros mínimos (p. ej. exigir al menos +1 de mejora para añadir una habilidad) solo se
  codifican si el texto de la sección los declara.

### 14.6 Integridad (`integrity/magic-refs.ts`, regla pura como las demás)

Entradas: `LoadedDataset` con `magic-items`, `weapons`, `armor`, `shields`, `skills`, `spells`.
Comprueba R75 (evidencias), R82 (legalidad), R83 (topes), R84 (referencias) y R85 (conjuros).
Las reglas R66 y R67 viven también en `magic-refs.ts` (no en `counts.ts`, que es del Lote Z;
TZ.1 hace que `counts.ts` delegue `magic-items` en ellas). Se prueban con datasets sintéticos
rotos y un caso verde; contra datos reales solo en el Lote Z (dependen de los lotes B, D y E). `provenance/magic-items.json` añade
`expectedCountByKind` e `importedKinds` (lista de `kind` ya importados): mientras no estén todos
los de `magic-sections.json`, `data:validate` emite `magic.sections-complete` (R66), que es el
único fallo aceptable durante el Lote M y debe estar a cero en el Lote Z. R67 compara solo los
`kind` ya importados.

### 14.7 Orden de importación (prioridad nivel 5-6)

El lote M avanza en este orden y cada paso deja sus `kind` importados, con resumen ES y
muestra para el humano, para que lo más usado esté revisable antes:
1. **Armas y armaduras mágicas:** entradas `general` (precios por bono), habilidades especiales
   de arma, armadura y escudo, y objetos específicos.
2. **Defensa y características:** anillos (empezando por *Ring of Protection*) y objetos
   maravillosos de ranura Shoulders (capas de resistencia), Belts y Headband (cinturones y
   diademas de característica), Neck (amuleto de armadura natural) y Wrist (brazales de armadura).
3. **Consumibles y cargas comunes:** pociones y aceites, y varitas (sujeto a Q11).
4. **Resto del capítulo:** objetos maravillosos de las demás ranuras, varas, bastones,
   malditos, inteligentes, artefactos si los hubiera y secciones `general` (pergaminos, creación).
El orden solo afecta a la secuencia de trabajo y entrega: el alcance es el mismo y la feature no
se cierra hasta que `magic.sections-complete` esté a cero. Para poder importar por partes,
`--category` de la CLI acepta `categoría:subconjunto` (p. ej. `magic-items:ring`), que el parser
de la categoría interpreta como `kind` o ranura; sin subconjunto procesa toda la categoría.

### 14.8 Goldens (`tests/data/fixtures/magic-golden.json`, a confirmar contra la página de origen)

- *Keen*: `weapon-ability`, `bonusEquivalent` 1, `legalFor.range` `melee`, tipos `P` y `S`,
  aura moderate transmutation, CL 10, `sourceRef` con `PRPG Core Rulebook pg. 469` y
  `reprintedIn` con Ultimate Equipment.
- *Seeking*: `weapon-ability`, `bonusEquivalent` 1, `legalFor.range` `ranged`, CL 12.
- *Flaming*: `extraDamage` `1d6` `fire` `always`.
- *Flame Tongue*: `specific-weapon`, `baseItemId` `longsword`, `enhancement` de arma 1,
  `abilityIds` `flaming` y `flaming-burst`.
- *Ring of Protection* (+1 a +5): efecto `ac`, `deflection`, valor = bono; +1 cuesta 2.000 gp
  (`bonus² × 2.000`).
- *Cloak of Resistance* (+1 a +5): `save.all`, `resistance`; +1 cuesta 1.000 gp
  (`bonus² × 1.000`).
- *Belt of Giant Strength* (+2/+4/+6): `ability.str`, `enhancement`; +2 cuesta 4.000 gp.
- *Amulet of Natural Armor* (+1 a +5): `ac`, `enhancement`, `foldInto: naturalArmor`.
- *Bracers of Armor* (+1 a +8): `ac`, `armor`.
- Precios de mejora: armadura y escudo +1 1.000 gp ... +5 25.000 gp; arma +1 2.000 gp ... +5
  50.000 gp.
- Una poción y una varita de *cure light wounds* (50 gp y 750 gp), si Q11 lo permite.
Si un golden y la fuente discrepan, aplica la regla de §5: no se cambia ninguno, se anota y se
para.

### 14.9 Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Guardar los objetos mágicos en `gear` | Mezcla objetos mundanos con datos que alimentan el cálculo; `gear` solo tiene `costCp` y `weightLb`, sin variantes ni efectos. |
| Una entrada por cada variante (*Ring of Protection +1*, *+2*...) | Duplica texto y rompe el recuento contra el índice; una entrada con `variants` conserva el texto una vez y los precios por fila. |
| Efectos tecleados a mano en un fichero curado | Contradice §1.2 y no es reproducible; se prefiere extracción determinista con `evidence` y overrides con `reason`/`evidence` para lo no estructurable. |
| Que f3 importe `BonusType` de `src/rules` | Acopla f3 a f2 (se redactan en paralelo) y bloquearía tests de f3 hasta que f2 esté hecha; se replica el catálogo con un test de igualdad. |
| Modelar el apilamiento en los datos (p. ej. «no apila con armadura») | Es responsabilidad del resolvedor de f2 por tipo de bonificador; duplicarlo crearía dos fuentes de verdad. |
| Estructurar todo el texto de cada objeto (activaciones, usos diarios) | El `acceptance` pide el texto completo y los efectos de cálculo; el resto queda en `textEn` y se estructurará en f7 si hace falta. |
| Incluir artefactos y objetos de otros libros «por completitud» | Rompe R27; los de otro libro se excluyen (R87). |
