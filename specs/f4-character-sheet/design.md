# Design — f4-character-sheet

> CÓMO se construye lo descrito en `requirements.md`. Respeta `docs/architecture.md` (§3 flujo de datos: la UI
> no recalcula reglas por su cuenta; §5 layout; §6 autorización; §7 fidelidad) y `docs/conventions.md`.
> Las firmas son contrato; los cuerpos los escribe el implementer. Esta es la feature más grande del producto
> hasta ahora: §21 la parte en lotes con ficheros disjuntos y en tres olas.
> Convención de este documento: **«[V]»** = dato contrastado leyendo el repo (con fichero); **«verificar»** = regla
> o cifra del Core que el implementer DEBE contrastar con el SRD antes de fijar el test (`design.md` §9.3).

## 1. Resumen de decisiones

| Tema | Decisión | Alternativas descartadas (§20) |
|------|----------|--------------------------------|
| Modelo | Documento **versionado** (`schemaVersion: 1`) de **11 secciones**; solo **ids** de f3, nunca texto; PG máximos y demás **no se guardan** (se derivan). `levels[]` es la fuente de clase/PG/aumentos; habilidades, dotes y conjuros son **totales** editables | Guardar derivados; copiar texto de reglas; historial de eventos como única fuente |
| Persistencia | `CharacterStore` / `NoteStore` (interfaz) + `InMemory*` + `Sqlite*` con suite de contrato; migraciones **002** y **003** añadidas a la lista de f1; JSON por documento con `name` desnormalizado | Una tabla por sección; ORM; guardar solo en el cliente |
| Control de versión | **Optimista por sección**: `revision` global + `sectionRevs`; `PATCH {baseRevision, sections}`; 409 si una sección tocada cambió después; reintento idempotente | Último-que-escribe-gana; revisión global única; CRDT |
| Guardado en cliente | **Autoguardado** (800 ms), 1 petición en vuelo, cola en memoria, estado visible, conflicto con elección explícita. **Sin** almacenamiento del navegador (f1b R85) | Botón «Guardar»; IndexedDB para offline |
| Autorización | `character` = owned, ownerWrite, **gmRead**, **sin gmWrite**; `private_note` = owned, ownerWrite, **sin gmRead**, sin gmWrite; 404 idéntico; helper `describeOwnershipMatrix` | GM edita fichas; GM lee notas |
| Límite de fichas | **1 activa** por jugador + archivadas ilimitadas; GM sin límite (fichas de PNJ aliados) | Sin límite; límite configurable por entorno |
| Derivados | `src/rules` puro: `deriveSheet(SheetInput)` calcula **todo** con `Breakdown`; se ejecuta en el **cliente** (edición con respuesta inmediata) y puede ejecutarse en el servidor (f5) | Calcular en el servidor y devolver en la API; recalcular en componentes |
| Reglas nuevas | Extensión pura de `src/rules` (carga, velocidad, PG, conjuros, CMB/CMD, ataque por arma, avance, advertencias, usos), cada una con cita del Core y marca «verificar» | Meterlas en `src/web` o `src/shared`; esperar a f6 |
| Objetos mágicos | Efectos por `getItemEffects` **resueltos en el servidor** (vista `core`); fold de mejoras; condicionales sin aplicar salvo interruptor; sin estructura → aviso + **modificador manual vinculado** | Parsear texto en el cliente; ignorar los 26 incompletos |
| Datos de reglas al cliente | **Catálogo de solo lectura** `/api/rules/*` (índice paginado + vista `core` por ids + detalle con texto bajo demanda), `ETag`; puerto `RulesCatalogApi` + fake; la UI no importa `src/data` | Servir el dataset como JSON estático; chunks por categoría en el bundle; importar `src/data` en `src/web` |
| Texto del manual | Solo en el **detalle**, pedido al abrir `EntryDrawer`; inglés rotulado; resumen ES con marca «Borrador» | Precargar textos; traducir en el cliente |
| Subida de nivel | Asistente **guiado y nunca bloqueante** (`levelUpPreview` + advertencias); un único `PATCH`; historial = `levels[]` editable | Asistente que impide pasos inválidos; subir de nivel solo por edición |
| PG por nivel | **Promedio prerrellenado** (`dado/2 + 1`), nivel 1 = máximo; el jugador puede poner la tirada o un valor; se registra el método | Tirar dados en la app; solo promedio fijo sin edición |
| Conjuros y usos | Conocidos/preparados por clase, huecos preparados con `used`, gasto espontáneo por nivel; contadores simples; **descanso** = una operación pura sobre `daily` | Modelar conjuros lanzados con efecto (f7) |
| Notas | Entidad propia (`private_note`), Markdown simple renderizado sin HTML, `characterId` opcional, búsqueda en servidor | Notas dentro de la ficha (el GM las leería); librería Markdown + sanitizador |
| UI | Secciones `character` y `notes` con `AppSection` (perezosas); resumen + detalle por pestañas; `EntryDrawer` con `?ver=`; desglose en un toque | Router o shell propio; modal por ruta |
| Eventos | Solo el **contrato** `character.hp` (+ `projectEventFor`); sin bus ni SSE | Implementar SSE aquí |
| Dependencias | **Ninguna nueva** (UUID con `crypto.randomUUID`, Markdown propio, sin librería de estado ni de fechas) | `uuid`, `marked`, `immer`, TanStack Query |

## 2. Contratos reutilizados (leídos del repo)

**f1 [V]** (`src/server/authz/*`, `src/server/compose.ts`, `src/server/stores/sqlite/migrations.ts`,
`tests/helpers/ownership-matrix.ts`, `tests/helpers/test-app.ts`):

- `createAuthorizationPolicy(rules)`: `scope owned|shared`, `ownerWrite`, `gmRead`, `gmWrite`; `readAudience` →
  `owner|gm|other|none`; denegar por defecto; `mergeKindRules` lanza si un `kind` se repite.
  `authorizeOrDeny(policy, actor, action, {kind, ownerId})`: `!canRead` → 404 `notFoundBody()`; legible y no
  escribible → 403 `forbiddenBody()`. `projectEventFor(policy, actor, event)` filtra por audiencia.
- `composeApp(config, settings, overrides)` es el único punto de composición; `ComposeOverrides` ya admite
  `stores`, `clock`, `hasher`, `logStream`, `extraKindRules`, `extraPublicRoutes`. **Con `stores` inyectados no se
  abre ninguna BD** (los tests de f1 dependen de ello). Las migraciones son una lista ordenada `MIGRATIONS`
  (`id`, `name`, `sql`) y `runMigrations` ejecuta cada una en su transacción; solo se **añaden** al final.
- Hook global `onRequest` bajo `/api`: pone `Cache-Control: no-store` y exige sesión salvo `PUBLIC_ROUTES`;
  `request.actor` (`{userId, role}`). El manejador de errores convierte los 4xx de Fastify en `validation_error`
  conservando el estado. `bodyLimit` global **16 KiB** (`src/server/app.ts`); Fastify admite `bodyLimit` por ruta.
- `describeOwnershipMatrix({name, makeApp, seed, request, secrets, gmCanRead, ownerStatus?})` crea jugadores A/B,
  GM y anónimo, comprueba 200 para A, **misma respuesta que un id inexistente** para B (y para el GM si
  `gmCanRead: false`) y 401 al anónimo; `makeTestApp({overrides})` mezcla `ComposeOverrides`.
- `ErrorCode` es **solo un tipo** en `src/shared/auth.ts`; f1b crea la lista en tiempo de ejecución en
  `src/web/api/schemas.ts` y un registro tipado exhaustivo `es.errors` (se rompe `tsc` si falta un código).
- `UserStore.findById/list` (nombre del propietario). No hay borrado de cuentas (Q11 de f1): sin huérfanos.

**f1b [V, spec_ready]** (`specs/f1b-auth-ui/design.md`): `AppSection {id, path, label, roles, order, Component,
children?, hidden?}` + `import.meta.glob('../features/*/section.tsx')` (R33–R35: añadir una pantalla = un fichero);
`createHttpClient` devuelve `Result<T, ApiError>` y **solo conoce `GET|POST|PUT|PATCH`** (f4 añade `DELETE`, §18);
`AppServices` se amplía por feature; `SessionProvider/useUser`; `Page`, `Alert`, `FormField`; tokens `--ph-*`,
`min-width`, `--ph-tap-min`; **R85 prohíbe almacenamiento del navegador**; R73 prohíbe importar `src/data` salvo
`src/data/legal`; bundle test R74 (sin texto de f3).

**f2 [V]** (`src/rules/*`, `progress/impl_f2-rules-engine-core.md`): `resolveModifiers(stat, Modifier[], {excluded})`;
tipos de bonificador (19) con `base`/`ability` como componentes; `racial`, `dodge`, `circumstance`, `untyped` se apilan;
penalizadores del mismo tipo: solo el peor (D2); `effectiveAbility`, `abilityModifier(s)`, `sizeModifier`,
`characterBaseAttackBonus`, `savingThrow` (progresiones `good|medium|poor`), `armorClass(input)` (normal, toque,
desprevenido, toque-desprevenido; `maxDexCaps` toma el menor), `initiativeModifier`, `skillModifier`
(`usable:false` si «solo entrenada» con 0 rangos; ACP solo si la habilidad lo marca; `+3` de clase con ≥1 rango),
`maxSkillRanks`, `applyD20`. Decisiones D1–D3 aceptadas. OQ-4 (puntuación < 1) y OQ-5 (peor cifra armadura/carga:
**f4 pasa la mayor entre armadura+escudo y carga**) se resuelven aquí (R106, R110).

**f3 [V]** (`src/data/*`, informes `progress/impl_f3-srd-data_*.md`, `review_f3-srd-data_2.md`):
`RulesDataSource {get, list, getSpellList, getLegalNotice}` devuelve `LocalizedEntry {entry, nameEs, nameEsVerified,
summaryEs, summaryStatus}` (nombres ES = marcador del inglés, **todos `draft`**; resúmenes ES `draft`). Datos:
`classes` (7; tabla de 20 filas con BAB, salvaciones, `specialIds`, `spellsPerDay` indexado 0–9 con `null`=«—»,
`domainSpellsPerDay`, `spellsKnown`; progresión `full|threeQuarters|half`), `class-features` (240; `kind
feature|option`, `parentId`), `domains` (33), `races` (7), `skills` (35, Conocimiento expandido), `feats` (176;
prerrequisitos estructurados + `other`), `spells` (623), `spell-lists` (bardo, clérigo, druida, paladín,
explorador: **sin mago/hechicero**), `weapons` (87), `armor` (12), `shields` (6), `gear` (164), `magic-items`
(442; 13 `kind`, `slot` literal, `variants[].effects/extraDamage`; `getItemEffects(entry, variantId)`,
`getEnhancementEffects`, `getExtraDamage`; pociones/aceites/varitas = 0 entradas). 61 objetos tienen efectos
estructurados; 9 `needsReview`; **26** con bonificador tipado sin estructurar (lista en
`progress/impl_f3-srd-data_M.md`, «R88»). Tamaño de `src/data` ≈ 3,1 MB de JSON (≈ 5,5 MB con glosario y
resúmenes): **no entra en el bundle** de la web.

## 3. Archivos a crear o tocar

```
# --- contratos compartidos (Lote 0) ---
src/shared/character.ts                 # esquemas zod del documento (11 secciones), constantes, límites
src/shared/character-api.ts             # CharacterDto, CharacterSummaryDto, cuerpos de creación/parche
src/shared/character-ops.ts             # emptySections, applyLongRest, validateCharacterIntegrity
src/shared/character-migrations.ts      # migrateCharacterSections
src/shared/character-sheet.ts           # toSheetInput(character, catalog) → SheetInput (+ missing)
src/shared/notes.ts                     # NoteDto, NoteSummaryDto, cuerpos
src/shared/rules-catalog.ts             # IndexItemDto, vistas core, DetailDto, ItemEffect, esquemas
src/shared/text.ts                      # foldText, canonicalJson
src/shared/auth.ts                      # (tocar) ErrorCode += revision_conflict, limit_reached, unknown_reference, invalid_state
src/shared/index.ts                     # (tocar) reexporta lo anterior

# --- reglas puras (Lote R; Lote 0 deja tipos y stubs) ---
src/rules/carry.ts  speed.ts  hit-points.ts  spellcasting.ts  combat.ts  proficiency.ts
src/rules/advancement.ts  feats.ts  feat-effects.ts  class-features.ts  level-up.ts
src/rules/sheet/types.ts                # SheetInput, DerivedSheet, SheetWarning (Lote 0)
src/rules/sheet/derive.ts  slots.ts  warnings.ts
src/rules/armor-class.ts                # (tocar) opción keepsDexWhenFlatFooted
src/rules/result.ts                     # (tocar) RulesErrorCode += invalid_speed, invalid_weight, invalid_input
src/rules/index.ts                      # (tocar) exporta lo nuevo

# --- servidor ---
src/server/stores/character-store.ts  note-store.ts
src/server/stores/in-memory/in-memory-character-store.ts  in-memory-note-store.ts  (+ index)
src/server/stores/sqlite/sqlite-character-store.ts  sqlite-note-store.ts  (+ index)
src/server/stores/sqlite/migrations.ts  # (tocar) añade 002_characters y 003_notes
src/server/characters/character-service.ts  references.ts  kinds.ts  events.ts
src/server/notes/note-service.ts
src/server/catalog/catalog-service.ts  views.ts  search.ts  known-gaps.ts
src/server/http/routes/character-routes.ts  note-routes.ts  rules-routes.ts
src/server/compose.ts                   # (tocar) stores, servicios, rutas, reglas, RulesDataSource

# --- web ---
src/web/api/character-api.ts  notes-api.ts  rules-catalog-api.ts
src/web/api/http-client.ts              # (tocar, f1b) método DELETE
src/web/api/schemas.ts                  # (tocar, f1b) ERROR_CODES += 4 códigos
src/web/api/services.tsx                # (tocar, f1b) AppServices += characters, notes, rules
src/web/i18n/es.ts                      # (tocar) una línea por bloque; textos en ficheros propios:
src/web/i18n/character/{common,summary,detail,spells,inventory,levelup}.ts  notes.ts  rules.ts  (agregados en character-es.ts)
src/web/components/{markdown-lite,breakdown-view,entry-drawer,entry-picker,entry-chip,
                    save-status,warning-list,stepper,tabs,chip}.tsx
src/web/styles/{character-summary,character-detail,character-inventory,character-levelup,notes}.css
src/web/features/character/section.tsx  routes.tsx  sheet-page.tsx  character-list-page.tsx
src/web/features/character/data/{catalog-cache,character-editor,use-derived-sheet,use-character}.ts(x)
src/web/features/character/summary/*    detail/*    spells/*    uses/*    inventory/*    levelup/*    create/*
src/web/features/notes/{section,notes-page,note-editor}.tsx

# --- tests / docs ---
tests/**                                 # espejo; ver §16
tests/helpers/{character-fixtures,fake-character-store...}.ts  tests/web/helpers/{fake-character-api,fake-notes-api,fake-rules-catalog,derived-fixtures}.ts
docs/architecture.md                     # (tocar al cerrar) §4 CharacterStore/NoteStore, §6 reglas character/private_note, §5 web
README.md                                # (tocar) sección «Ficha de personaje»
progress/manual_f4-character-sheet.md    # (crear al cerrar) checklist rellenada
```

`src/rules` y `src/data` siguen sin importar de `server`, `web` ni `shared`. `src/shared` puede importar **tipos y
funciones** de `src/rules` (no al revés) y NO importa `src/data`. `src/web` solo importa `src/rules`, `src/shared` y
`src/data/legal`.

## 4. Modelo de datos (`src/shared/character.ts`)

### 4.1 Constantes y secciones

```ts
export const CHARACTER_SCHEMA_VERSION = 1;
export const SECTION_NAMES = ["identity","abilities","levels","hp","skills","feats","features",
  "spellcasting","inventory","daily","modifiers"] as const;               // R1
export type SectionName = (typeof SECTION_NAMES)[number];
export const PARTY_CLASS_IDS = ["barbarian","bard","cleric","druid","paladin","ranger","rogue"] as const; // R8
export const ALIGNMENTS = ["LG","NG","CG","LN","N","CN","LE","NE","CE"] as const;
export const EQUIP_SLOTS = ["armor","shield","mainHand","offHand","belt","body","chest","eyes","feet",
  "hands","head","headband","neck","ring1","ring2","shoulders","wrist","arms","carried"] as const;
export const LIMITS = { levels: 20, skills: 80, feats: 60, items: 300, prepared: 120, known: 120,
  counters: 40, modifiers: 60, maxDocBytes: 256 * 1024 } as const;       // R3
```

### 4.2 Secciones (forma; los nombres de campo son contrato)

| Sección | Forma | Notas |
|---------|-------|-------|
| `identity` | `{ name (1–64), raceId (kebab de `races`), alignment, deity (≤64)\|null, favoredClassId\|null, languages: string[≤20] (≤32 c/u), description (≤500)\|null }` | `name` se desnormaliza en la tabla |
| `abilities` | `{ base: {str,dex,con,int,wis,cha} (1–45), racialChoice: AbilityId\|null }` | `base` = generación (compra de puntos/tirada) **antes** de raza y aumentos; el ayudante `baseFromFinal` (R103) convierte «puntuación final sin objetos» |
| `levels` | `LevelEntry[]` (1–20): `{ classId, hp (0–99)\|null, hpMethod, favoredBonus, abilityIncrease\|null, note (≤200)\|null }` | nivel de personaje = longitud; nivel de clase = nº de entradas de esa clase; `hp:null` = estimado con promedio (R80) |
| `hp` | `{ current (−99..9999), temporary (≥0), nonlethal (≥0) }` | los **máximos se derivan**; sección aparte porque es la que más se toca |
| `skills` | `SkillEntry[]`: `{ skillId, subtype (≤32)\|null, ranks (0–99), classSkill: boolean\|null }` | totales; `classSkill:null` = automático por clases; `subtype` para Artesanía/Interpretación/Profesión; solo se guardan filas con rangos u override |
| `feats` | `FeatEntry[]`: `{ id (uuid), featId, choice (≤64)\|null, slot: "level"\|"human"\|"class"\|"other", level (1–20)\|null, note (≤200)\|null }` | «Soltura con un arma (espada larga)» = `featId`+`choice` |
| `features` | `{ domainIds: string[≤2], optionIds: string[≤60], notes: Record<featureId, string≤200>, counters: CounterDef[≤40] }` | `optionIds` = `class-features` de `kind: option` elegidas; `notes` p. ej. «Enemigo predilecto: no-muertos» |
| `spellcasting` | `Partial<Record<PartyClassId, { known: spellId[≤120], prepared: PreparedSlot[≤120] }>>` | `PreparedSlot = { id (uuid), spellId, slotLevel (0–9), domain: boolean, note (≤60)\|null }` |
| `inventory` | `{ items: InventoryItem[≤300], coins: {cp,sp,gp,pp} (0–9 999 999) }` | ver §4.3 |
| `daily` | `{ usedPrepared: uuid[], spent: Partial<Record<PartyClassId, Record<"0".."9", int 0–99>>>, counters: Record<uuid, int 0–999> }` | todo lo que reinicia el **descanso**; sección aparte para que gastar un conjuro no choque con editar el inventario |
| `modifiers` | `ManualModifier[≤60]`: `{ id, label (≤64), target, type, value (≠0), active, itemId (uuid)\|null }` | `target` ∈ vocabulario de `MagicEffectTarget` (+ `save.all`); `type` ∈ 19 tipos de f2 (sin `base`/`ability`) |

`CounterDef = { id, label (≤48), featureId\|null, max: {mode:"auto"} \| {mode:"manual", value 0–99}, resetOn:
"rest"\|"manual" }`.

### 4.3 `InventoryItem`

```ts
interface InventoryItem {
  id: string;                                   // uuid
  ref: { category: "weapons"|"armor"|"shields"|"gear"|"magic-items"; id: string; variantId?: string } | null;
  custom: { name: string /*1–64*/; weightLb: number|null; slotHint: EquipSlot|null } | null;  // exactamente uno de ref/custom
  quantity: number;                             // 1–9999
  weightLbOverride: number|null;                // el peso manual manda (materiales especiales, Q15)
  enhancement: number;                          // 0–5; solo arma/armadura/escudo genéricos
  abilityIds: string[];                         // ≤6 ids de weapon-ability / armor-ability / shield-ability
  masterwork: boolean;
  equipped: EquipSlot | null;                   // null = guardado
  appliedConditional: string[];                 // ids de ItemEffect condicionales activados por el jugador
  note: string|null;                            // ≤200
}
```

Los objetos **específicos** (p. ej. *Flame Tongue*, `kind: specific-weapon`) llevan su propia mejora y habilidades
en f3 (`enhancement`, `abilityIds`, `baseItemId`): la instancia no las repite. Pociones, pergaminos y varitas son
objetos `custom` (Q13). Armaduras de material especial (mithral): objeto de catálogo + `weightLbOverride` + nota (Q15).

### 4.4 Integridad (`validateCharacterIntegrity`, R6, R7)

Función pura sobre el documento completo (se usa en servidor tras fusionar un parche y en el cliente antes de
enviar): ids únicos por tipo (`items`, `feats`, `counters`, `prepared`, `modifiers`); `modifiers[].itemId` ∈
inventario. Devuelve una lista de `{code, path}`. **No** valida existencia de ids de reglas (eso es
`references.ts`, §5.3) ni reglas del juego (eso son advertencias, §9.5): el documento puede violar reglas del
Core y seguir siendo válido (nunca se bloquea al jugador).

### 4.5 Versionado del esquema (R9)

`schemaVersion` va en la fila, no en las secciones. `migrateCharacterSections(raw, fromVersion)` es hoy la
identidad para 1; cuando se suba la versión se **añade** un paso `n → n+1` y su test con fixtures de la versión
anterior (los fixtures v1 se conservan). El servicio migra al leer y persiste la nueva versión en el siguiente
guardado; una versión mayor que la soportada es un error de infraestructura (R23), no un dato vacío.

### 4.6 Operaciones puras (`character-ops.ts`)

```ts
export function emptySections(identity, abilities, levels, hp): CharacterSections;       // resto vacío
export function applyLongRest(daily: Daily, counters: readonly CounterDef[]): Daily;     // R10
export function validateCharacterIntegrity(s: CharacterSections): IntegrityIssue[];      // R6, R7
export function removeItem(s: CharacterSections, itemId: string): Partial<CharacterSections>; // R131: inventory+modifiers
```

`foldText(s)` = `s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/\s+/g," ").trim()`;
`canonicalJson(v)` = `JSON.stringify` con claves ordenadas recursivamente (R11, R17).

## 5. Persistencia y servicios (servidor)

### 5.1 Interfaces

```ts
// src/server/stores/character-store.ts
export interface CharacterRecord {
  id: string; ownerId: string; status: "active" | "archived"; name: string;
  schemaVersion: number; revision: number; sectionRevs: Record<SectionName, number>;
  sections: CharacterSections; createdAt: number; updatedAt: number;       // epoch ms (Clock)
}
export type PatchOutcome =
  | { kind: "applied" | "unchanged"; record: CharacterRecord }
  | { kind: "conflict"; sections: SectionName[]; record: CharacterRecord }
  | { kind: "not_found" };
export interface CharacterStore {
  create(record: CharacterRecord, maxActivePerOwner: number | null): Promise<Result<CharacterRecord, "limit_reached">>;
  findById(id: string): Promise<CharacterRecord | null>;
  list(filter: { ownerId?: string; status?: "active" | "archived" }): Promise<CharacterRecord[]>;
  countActive(ownerId: string): Promise<number>;
  applyPatch(id: string, baseRevision: number, patch: Partial<CharacterSections>, now: number): Promise<PatchOutcome>;
  setStatus(id: string, status: "active" | "archived", now: number, maxActivePerOwner: number | null):
    Promise<Result<CharacterRecord, "not_found" | "limit_reached">>;
  delete(id: string): Promise<boolean>;
}

// src/server/stores/note-store.ts
export interface NoteRecord { id; ownerId; characterId: string | null; title; body; revision; createdAt; updatedAt }
export interface NoteStore {
  create(note: NoteRecord, maxPerOwner: number): Promise<Result<NoteRecord, "limit_reached">>;
  findById(id: string): Promise<NoteRecord | null>;
  listByOwner(ownerId: string, filter?: { characterId?: string }): Promise<NoteRecord[]>;   // updatedAt desc, id
  update(id: string, baseRevision: number, patch: { title: string; body: string; characterId: string | null }, now: number):
    Promise<Result<NoteRecord, "not_found" | "revision_conflict">>;
  delete(id: string): Promise<boolean>;
  clearCharacterLink(characterId: string): Promise<void>;   // solo para el fake; en SQLite lo hace ON DELETE SET NULL
}
```

`applyPatch` es **síncrono por dentro** (en SQLite, `BEGIN IMMEDIATE … COMMIT` con `DatabaseSync`; en memoria, un
bloque sin `await`), de modo que la comprobación de conflictos y la escritura son atómicas en el único proceso
(mismo supuesto de f1: una máquina). Algoritmo (R14–R17):

```
rec = find(id) o not_found
changed = [s ∈ patch | canonicalJson(patch[s]) ≠ canonicalJson(rec.sections[s])]
if changed = ∅ → unchanged
conflicts = [s ∈ changed | rec.sectionRevs[s] > baseRevision]
if conflicts ≠ ∅ → conflict(conflicts)           // nada se escribe
rec.revision += 1; para s ∈ changed: sections[s] = patch[s]; sectionRevs[s] = rec.revision
if "identity" ∈ changed: rec.name = identity.name; rec.updatedAt = now → applied
```

Los `InMemory*` y `Sqlite*` devuelven **copias** (R18). El límite de fichas activas se comprueba dentro de `create` y
`setStatus` (R14, R34) con `maxActivePerOwner` (`null` = sin límite, para el GM).

### 5.2 SQLite: migraciones 002 y 003 (R22)

```sql
-- 002_characters
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active','archived')),
  name TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  section_revs TEXT NOT NULL,      -- JSON {identity:1,...}
  data TEXT NOT NULL,              -- JSON de las 11 secciones
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX characters_owner_status ON characters(owner_id, status, updated_at DESC);
-- 003_notes
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
  title TEXT NOT NULL, body TEXT NOT NULL, revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX notes_owner_updated ON notes(owner_id, updated_at DESC);
```

Sentencias preparadas con parámetros; `PRAGMA foreign_keys = ON` ya lo activa `openDatabase`. No se guarda ningún
derivado (R24). El tamaño típico del JSON es < 40 KiB; el tope de documento es 256 KiB (R3).

### 5.3 Servicios

```ts
// src/server/characters/character-service.ts
export interface CharacterServiceDeps { characters: CharacterStore; users: UserStore; rules: RulesDataSource; clock: Clock;
  limits?: { maxActivePlayer: number /* 1 */ } }
export type CharacterError =
  | { code: "validation_error" } | { code: "unknown_reference"; field: string } | { code: "limit_reached" }
  | { code: "revision_conflict"; sections: SectionName[] } | { code: "not_found" } | { code: "invalid_state" };
export class CharacterService {
  create(actor: Actor, body: CreateCharacterBody): Promise<Result<CharacterDto, CharacterError>>;
  get(id: string): Promise<CharacterDto | null>;               // sin autorización: la hacen las rutas
  list(actor: Actor, status): Promise<CharacterSummaryDto[]>;  // jugador: solo suyas; GM: todas
  patch(id: string, body: PatchCharacterBody): Promise<Result<CharacterDto, CharacterError>>;
  archive(id): …; restore(id): …; remove(id): Promise<Result<void, CharacterError>>;
}
```

- **Referencias** (`references.ts`, R40): `validateReferences(sections, rules): Promise<ReferenceIssue[]>` consulta
  `RulesDataSource.get` por cada `(categoría, id)` distinto: `identity.raceId`→`races`; `skills[].skillId` y
  `modifiers[].target = skill.<id>`→`skills`; `feats[].featId`→`feats`; `features.domainIds`→`domains`;
  `features.optionIds`→`class-features` con `kind: option`; `features.notes` (claves) y `counters[].featureId`→
  `class-features`; `spellcasting[*].known/prepared[].spellId`→`spells`; `inventory.items[].ref`→ su categoría,
  `variantId` ∈ `variants` y `abilityIds` ∈ `magic-items` de `kind` `weapon-ability|armor-ability|shield-ability`.
  Se valida **solo lo que viene en el parche** (más lo necesario del documento para la integridad), no el documento
  entero cada vez.
- **Parche:** valida cuerpo → referencias → fusiona con el documento actual → `validateCharacterIntegrity` sobre el
  documento resultante (R47) → `store.applyPatch`. Mapea `conflict` a `revision_conflict`.
- **Propietario y límite:** la creación fija `ownerId = actor.userId`; `maxActive = actor.role === "player" ? 1 : null`.
- **Cero derivados** (R55): el servicio no calcula PG ni CA; quien los necesite (f5) usa `deriveSheet` con los
  datos del catálogo.

`NoteService` (`create/list(q)/get/update/remove`): cuerpo ≤ 20 000, título ≤ 80, ≤ 200 notas por usuario (R154),
`characterId` debe ser del propio usuario (si no, `unknown_reference` sin revelar existencia, R35), búsqueda por
`foldText` sobre título+cuerpo en memoria (≤ 200 notas por usuario: más simple que `LIKE`, que en SQLite no ignora
diacríticos).

### 5.4 Composición (`compose.ts`)

Un único sitio instancia los stores y servicios (convención de f0/f1):

```ts
interface ComposeOverrides {                      // (ampliación)
  characterStores?: { characters: CharacterStore; notes: NoteStore };
  rulesData?: RulesDataSource;
}
// composeStores: si overrides.stores está presente y characterStores no → InMemory* (no se abre BD)
// si no hay overrides → openDatabase + Sqlite* (mismas migraciones)
// policy = createAuthorizationPolicy(mergeKindRules(ACCOUNT_KIND_RULES, CHARACTER_KIND_RULES, ...extraKindRules))
// rules = overrides.rulesData ?? new JsonRulesDataSource()
// registra: characterRoutes({characters, policy}), noteRoutes({notes, policy, characters}), rulesRoutes({catalog})
```

`CHARACTER_KIND_RULES` (en `src/server/characters/kinds.ts`, R25):
`{ character: {scope:"owned", ownerWrite:true, gmRead:true, gmWrite:false}, private_note: {scope:"owned",
ownerWrite:true, gmRead:false, gmWrite:false} }`.

## 6. Autorización y propiedad (decisiones)

- **Propiedad:** `ownerId` lo fija el servidor; los esquemas de cuerpo son estrictos (R33).
- **Lectura del GM:** sí a toda ficha (R25, R27, R31). **Escritura del GM:** **no** (`gmWrite=false`) — recomendación
  y razón: el GM no necesita editar fichas para dirigir (los PG de combate de los PJ los gestiona f5 con su propio
  contrato), evita pisar la ficha de un jugador mientras la edita y simplifica el modelo de conflictos. Si el
  humano decide lo contrario (Q2): cambiar `gmWrite` a `true`, añadir al cliente el modo de edición del GM con
  aviso «Estás editando la ficha de X» y ampliar R29/R170; la política no necesita más cambios.
- **Respuesta uniforme:** el handler carga el registro y llama a `authorizeOrDeny(policy, actor, action,
  {kind:"character", ownerId: record.ownerId})` **antes** de serializar nada. Si no hay registro → el mismo
  `notFoundBody()`. Un `:id` que no es UUID → mismo 404 sin tocar el store (R53).
- **Notas:** `{kind:"private_note", ownerId: note.ownerId}`; para el GM, `readAudience` = `none` → 404 idéntico (R28,
  R30). El listado de notas filtra por `ownerId = actor.userId` **en la consulta** y, además, por `canRead` (cinturón y
  tirantes, R32). `GET /api/characters/:id` no contiene notas (R160).
- **Límite de fichas activas (R34):** 1 por jugador. Recomendación por defecto (Q1) y razón: la campaña tiene un PJ
  por jugador; permitir archivar y crear otro cubre la muerte o el cambio de personaje sin ambigüedad sobre «cuál es
  mi ficha» en `/ficha`. El GM puede crear fichas propias sin límite (PNJ aliados). Constante en
  `src/server/characters/character-service.ts` (`MAX_ACTIVE_PLAYER = 1`), **no** variable de entorno (es una regla
  de producto, y añadir claves al `.env.example` obliga a tocar el test de f0).
- **Cuentas deshabilitadas:** sus fichas se conservan y el GM las lee; el servidor no borra nada al deshabilitar.
- **SSE:** ver §15.

## 7. API REST de personajes y notas

Todas bajo `/api`, con sesión (hook de f1) y `Cache-Control: no-store`. Errores con `ErrorBody` (`{error:{code,message}}`).
Rutas exportadas como constantes (`CHARACTER_ROUTES`, `NOTE_ROUTES`, `RULES_ROUTES`: `"MÉTODO patrón"`) para el test
«todo exige sesión» (R36).

| Método y ruta | Cuerpo | Éxito | Errores | R |
|---------------|--------|-------|---------|---|
| `GET /api/characters?status=active\|archived\|all` | — | 200 `CharacterSummaryDto[]` | 400 | R31, R42 |
| `POST /api/characters` | `CreateCharacterBody` ≤ 256 KiB | 201 `CharacterDto` | 400 `validation_error`/`unknown_reference`; 409 `limit_reached` | R34, R38–R40 |
| `GET /api/characters/:id` | — | 200 `CharacterDto` | 404 | R27, R41 |
| `PATCH /api/characters/:id` | `{baseRevision, sections}` ≤ 256 KiB | 200 `CharacterDto` | 400; 403 (GM); 404; 409 `revision_conflict` | R43–R47 |
| `POST /api/characters/:id/archive` | — | 200 `CharacterDto` | 403; 404 | R48 |
| `POST /api/characters/:id/restore` | — | 200 `CharacterDto` | 403; 404; 409 `limit_reached` | R34, R48 |
| `DELETE /api/characters/:id` | — | 204 | 403; 404; 409 `invalid_state` (no archivado) | R49 |
| `GET /api/notes?q=&characterId=` | — | 200 `NoteSummaryDto[]` | 400 | R32, R156 |
| `POST /api/notes` | `{title, body, characterId?}` ≤ 64 KiB | 201 `NoteDto` | 400; 400 `unknown_reference`; 409 `limit_reached` | R154 |
| `GET /api/notes/:id` | — | 200 `NoteDto` | 404 | R28 |
| `PUT /api/notes/:id` | `{baseRevision, title, body, characterId}` | 200 `NoteDto` | 404; 409 `revision_conflict` | R155 |
| `DELETE /api/notes/:id` | — | 204 | 404 | R30, R157 |

```ts
interface CharacterDto extends CharacterSections {
  id: string; ownerId: string; ownerName: string; status: "active"|"archived"; schemaVersion: number;
  revision: number; sectionRevs: Record<SectionName, number>; createdAt: string; updatedAt: string; // ISO-8601
}
interface CharacterSummaryDto { id; name; ownerId; ownerName; raceId; classes: {classId; level}[]; level: number;
  status; revision; updatedAt: string }
type CreateCharacterBody = { identity; abilities; levels; hp } & Partial<Omit<CharacterSections, "identity"|"abilities"|"levels"|"hp">>;
type PatchCharacterBody = { baseRevision: number /*≥1*/; sections: Partial<CharacterSections> /*≥1 clave*/ };
interface NoteDto { id; characterId: string|null; title; body; revision; createdAt: string; updatedAt: string }
interface NoteSummaryDto { id; characterId: string|null; title; snippet: string /*≤120*/; updatedAt: string }
```

**Control de versión (decisión):** el cliente guarda `baseRevision` = la `revision` del último documento que vio
(o que le devolvió su último `PATCH`). Dos dispositivos que editan **secciones distintas** no chocan (p. ej. uno
gasta un conjuro en `daily` y otro edita el inventario); dos que editan la **misma** sección sí (409). Un reintento
tras fallo de red cuyo `PATCH` sí se aplicó es **idempotente** (R17, R46): contenido idéntico ⇒ 200 sin cambio.
El 409 lleva solo `ErrorBody`: el cliente recarga con `GET` y comprueba `sectionRevs[s] > baseRevision` para saber
qué secciones propias chocan (no se amplía el cliente HTTP de f1b con cuerpos de error extra).

**Límites de cuerpo (R50):** `bodyLimit` por ruta: 256 KiB en `POST`/`PATCH /api/characters`, 64 KiB en `POST`/`PUT
/api/notes`; el resto sigue en 16 KiB. El 413 sale como `validation_error` (manejador de f1).

**No-logging (R52):** los logs de f1 ya no registran cuerpos; el test lo comprueba con una nota centinela.

## 8. Catálogo de reglas de solo lectura (`/api/rules`)

### 8.1 Por qué un catálogo y no «chunks» en el bundle

El dataset pesa ≈ 5,5 MB (con glosario y resúmenes; ≈ 3 MB de JSON de reglas): meterlo en el bundle, aunque sea
en trozos perezosos, obliga a descargar categorías enteras (623 conjuros ≈ 1,5 MB) para mostrar tres, rompe R73/R74
de f1b (la web no importa `src/data`) y duplica la validación. Con el catálogo, el cliente descarga **solo lo que
muestra**: una página de 30 entradas de índice (≤ 30 KB, R70), las proyecciones `core` de los ids que necesita la hoja
(unos KB) y el **texto largo únicamente al abrir `EntryDrawer`** (R183). El servidor ya carga el dataset de forma
perezosa por categoría (`JsonRulesDataSource`).

### 8.2 Endpoints (todos `GET`, sesión de cualquier rol, R36, R68)

| Ruta | Respuesta | Notas |
|------|-----------|-------|
| `/api/rules/meta` | `{ counts: Record<Category, number> }` | R71 |
| `/api/rules/:category?q&limit&offset&<filtros>` | `{ items: IndexItemDto[], total, offset, limit }` | R56–R60 |
| `/api/rules/:category?ids=a,b&view=core` | `{ items: CoreDto[], missing: string[] }` | ≤ 60 ids; R61 |
| `/api/rules/:category?view=core` (sin ids) | todas las entradas `core` | solo `skills`, `races`, `classes`, `domains`, `weapons`, `armor`, `shields` |
| `/api/rules/:category/:id` | `DetailDto` | R63; incluye `textEn` |
| `/api/rules/spell-lists/:classId` | `{ classId, levels: Record<"0".."9", string[]> }` | R64 |

Categorías (12): las de `EntryCategory` de f3 (`spell-lists` solo por su ruta). Respuestas con `ETag` (SHA-1 del
cuerpo serializado, 16 hex, entre comillas) y `Cache-Control: private, no-cache` (R66): el navegador revalida con
`If-None-Match` y recibe 304 sin cuerpo. **Excepción deliberada y acotada** al `no-store` de f1: el catálogo es el
mismo SRD público para todos (no hay dato privado), y el `handler` sobrescribe la cabecera que puso el hook global
(`reply.header` posterior); un test de control comprueba que cualquier otra ruta sigue en `no-store`.

### 8.3 Búsqueda, filtros y paginación

| Categoría | Filtros admitidos |
|-----------|-------------------|
| `classes`, `domains`, `races`, `shields` | — |
| `class-features` | `classId`, `kind` (`feature`\|`option`), `parentId`, `maxLevel` |
| `skills` | `ability`, `trainedOnly` |
| `feats` | `type` (`General`\|`Combat`\|`Metamagic`\|`Item Creation`\|`Critical`) |
| `spells` | `classId` (+ `level` 0–9; `level` sin `classId` es inválido), `school` |
| `weapons` | `category`, `handedness` |
| `armor` | `category` |
| `gear` | `category` |
| `magic-items` | `kind`, `slot`, `addable=true` (excluye `weapon-ability`, `armor-ability`, `shield-ability`, `general`) |

`q`: `foldText` de la consulta partido en términos; una entrada coincide si **todos** los términos son subcadena de
`searchKey = foldText(id + " " + name + " " + (nameEs ?? "") + " " + (summaryEs ?? ""))`. Puntuación: nombre exacto
100, prefijo del nombre 60, prefijo de palabra del nombre 40, subcadena en nombre 25, resto 10; desempate por
nombre alfabético y luego `id` (orden estable, R58–R60). `limit` 1–100 (30), `offset` ≥ 0. El índice por categoría
se construye una vez (R69) con `source.list(category)`.

### 8.4 DTOs (`src/shared/rules-catalog.ts`; esquemas zod estrictos, sin texto largo, R57, R62)

```ts
interface IndexItemDto { category; id; name /*EN*/; nameEs: string|null; nameEsVerified: boolean;
  summaryEs: string|null; summaryStatus: "draft"|"reviewed"|null; needsReview: boolean;
  facets: Record<string, string|number|boolean|string[]|Record<string, number>> }   // §8.3: p. ej. spells {school, levels{druid:3}}
interface DetailDto extends IndexItemDto { source: string; sourceRef: string; textEn: string;
  parts?: { name: string; textEn: string }[];          // rasgos de raza, poderes de dominio
  core: CoreDto }
```

Proyecciones `core` (mapeo explícito en `views.ts`; `satisfies` contra estos tipos):

| Categoría | Campos |
|-----------|--------|
| `classes` | `id,name,hitDie,skillRanksPerLevel,classSkills,proficiencies{weapons,armor,shields},progression{bab,fort,ref,will},casting?{ability,tradition,prepared,spellListId},table[{level,bab[],fort,ref,will,special[],specialIds[],spellsPerDay?,domainSpellsPerDay?,spellsKnown?}]` |
| `class-features` | `id,name,classId,level,abilityType,kind,parentId?` |
| `domains` | `id,name,grantedPowers[{name,abilityType,level}],spells[{level,spellId,name,note?}]` |
| `races` | `id,name,abilityModifiers,abilityChoice?,size,baseSpeedFt,traits[{name}]` (el texto de cada rasgo va en `DetailDto.parts`) |
| `skills` | `id,name,keyAbility,trainedOnly,armorCheckPenalty,knowledgeSubject?` |
| `feats` | `id,name,types,prerequisites{raw,abilities?,bab?,casterLevel?,featIds,skills[{skillId,ranks}],other[]}` |
| `spells` | `id,name,school,subschool?,descriptors,levels,castingTime{raw},components{verbal,somatic,material,focus,divineFocus,xp,raw},range{raw},targeting[{kind,raw}],duration{raw},savingThrow{raw},spellResistance{raw}` |
| `weapons` | `id,name,category,handedness,weightLb,costCp,damage,critical,rangeIncrementFt,damageTypes,special,weaponGroups` |
| `armor` | `id,name,category,weightLb,costCp,armorBonus,maxDex,armorCheckPenalty,arcaneSpellFailurePct,speed30,speed20` |
| `shields` | `id,name,weightLb,costCp,shieldBonus,maxDex,armorCheckPenalty,arcaneSpellFailurePct` |
| `gear` | `id,name,category,weightLb,costCp` |
| `magic-items` | `id,name,kind,slot,aura,weightLb,effectsStatus,baseItemId?,enhancement?{on,bonus},abilityIds?,legalFor?,functionsAs?,variants[{variantId,label,casterLevel,priceRaw,priceCp,bonusEquivalent?,effects: ItemEffect[],extraDamage[]}]` |

`ItemEffect` es el tipo de `src/data/magic-items/effects.ts` redeclarado en `shared` (`id,name,value,type,target,appliesTo,
conditional,conditionText?,foldInto?`); un test de `tests/` comprueba que ambos tipos son asignables entre sí (R8).
`effectsStatus`: `structured` si alguna variante tiene efectos; `incomplete` si el id está en `KNOWN_INCOMPLETE_EFFECTS`
(los 26 de f3 R88, en `known-gaps.ts`, con un test que comprueba que existen) o tiene `needsReview`; `none` en otro
caso (R65). **Los datos de f3 no se tocan.**

### 8.5 Presentación fiel (R191, R67)

El servidor devuelve `nameEs`/`summaryEs` tal cual; **la UI decide**: nombre inglés principal; nombre español solo si
`nameEs !== null && nameEs !== name`, con marca «Borrador» si `!nameEsVerified` (Q2 de f3 sigue abierta: los nombres
españoles son marcadores); resumen español siempre con «Borrador» si `summaryStatus === "draft"`; el texto del manual
se rotula «Texto original del SRD (inglés)»; `needsReview` → marca «Revisar texto».

## 9. Extensión pura de `src/rules`

### 9.1 Principios

- Mismas reglas que f2 (R73): funciones puras, `Result` sin lanzar, `// CRB: <regla>` en cada fichero, salida
  serializable, sin importar `server|web|data|shared`. Los **datos** llegan como parámetros con tipos propios de
  `src/rules` (estructuralmente compatibles con los de f3; un test de `tests/` comprueba la asignabilidad, R8).
- `src/rules/result.ts` amplía `RulesErrorCode` con `invalid_speed`, `invalid_weight`, `invalid_input` (aditivo).
- Se reutiliza todo lo de f2; **no** se duplica el resolvedor: cada derivado nuevo es una lista de `Modifier` que
  pasa por `resolveModifiers` (así el desglose y el apilamiento son los de f2).
- Lo nuevo **no** invade f6/f7: `weaponAttackBonus` es el ataque base sin modificadores activos de combate (ataque
  poderoso, flanqueo, dos armas…); `dailyUses`/`PASSIVE_FEATURES` solo cubren contadores y bonos pasivos siempre
  activos (los activables son f7).

### 9.2 Firmas públicas (ficheros nuevos de `src/rules`, exportados por `index.ts`)

```ts
// carry.ts — CRB Cap. 7 «Carrying Capacity» (tabla), tamaños, cargas
export interface CarryingCapacity { light: number; medium: number; heavy: number }       // heavy = carga máxima
export function carryingCapacity(strength: number, size: Size): Result<CarryingCapacity>;
export type LoadCategory = "light" | "medium" | "heavy" | "overloaded";
export function loadCategory(weightLb: number, capacity: CarryingCapacity): Result<LoadCategory>;
export interface LoadEffects { maxDex: number | null; armorCheckPenalty: number; runMultiplier: 3 | 4; overloaded: boolean }
export function loadEffects(category: LoadCategory): LoadEffects;
export const COINS_PER_POUND = 50;

// speed.ts — CRB Cap. 7 (velocidad con armadura/carga) + rasgos de enano y bárbaro
export function reducedSpeed(baseFt: number): Result<number>;
export interface SpeedInput { raceBaseFt: number; armorCategory: "none" | "light" | "medium" | "heavy";
  load: LoadCategory; fastMovement: boolean; ignoresArmorAndLoad: boolean }
export interface SpeedResult { baseFt: number; bonusFt: number; armorFt: number; loadFt: number; finalFt: number; reasons: string[] }
export function characterSpeed(input: SpeedInput): Result<SpeedResult>;

// hit-points.ts — CRB Cap. 3 (dados de golpe), Cap. 1 (Con), Cap. 8 (heridas), dote Toughness
export function averageHitDie(die: 6 | 8 | 10 | 12): number;
export interface HitPointsInput { levels: { hitDie: 6|8|10|12; hp: number | null; favoredBonus: "hp"|"skill"|"none" }[];
  conModifier: number; toughness: boolean }
export function hitPoints(input: HitPointsInput): Result<{ breakdown: Breakdown; estimated: boolean }>;
export type HpStatus = "healthy" | "staggered" | "unconscious" | "disabled" | "dying" | "dead";
export function hpStatus(i: { current: number; nonlethal: number; constitutionScore: number }): Result<HpStatus>;

// spellcasting.ts — CRB Cap. 1 (tabla de conjuros adicionales), Cap. 3, Cap. 9
export function bonusSpells(abilityModifier: number, spellLevel: number): number;
export interface SpellSlotLevel { level: number; base: number | null; bonus: number; domain: number; total: number; castable: boolean }
export function spellsPerDay(row: { spellsPerDay?: readonly (number|null)[]; domainSpellsPerDay?: readonly (number|null)[] },
  abilityScore: number): Result<SpellSlotLevel[]>;                         // 10 entradas (0–9)
export function spellSaveDc(spellLevel: number, abilityModifier: number): number;
export function casterLevel(classId: string, classLevel: number): number;
export function concentrationBonus(i: { casterLevel: number; abilityModifier: number; modifiers?: readonly Modifier[] }): Result<Breakdown>;
export function arcaneSpellFailure(i: { tradition: "arcane"|"divine"; classId: string; armorCategory: "none"|"light"|"medium"|"heavy";
  armorPct: number; shieldPct: number }): number;
export function consumesSlot(spellLevel: number): boolean;

// combat.ts — CRB Cap. 8 (ataque, maniobras, ataques múltiples), Cap. 6 (obra maestra, competencia)
export function iterativeAttacks(bab: number): number[];
export function specialSizeModifier(size: Size): number;                    // CMB/CMD
export function combatManeuverBonus(i: { bab: number; strModifier: number; size: Size; modifiers?: readonly Modifier[] }): Result<Breakdown>;
export function combatManeuverDefense(i: { bab: number; strModifier: number; dexModifier: number; size: Size; modifiers?: readonly Modifier[] }): Result<Breakdown>;
export interface WeaponAttackInput { bab: number; abilityUsed: "str"|"dex"; abilityModifier: number; size: Size;
  enhancement: number; masterwork: boolean; proficiency: ProficiencyState; modifiers?: readonly Modifier[] }
export function weaponAttackBonus(i: WeaponAttackInput): Result<Breakdown>;

// proficiency.ts
export type ProficiencyState = "proficient" | "not-proficient" | "unverified";
export interface ProficiencyGrants { raceId: string; weapons: readonly string[]; armor: readonly ("light"|"medium"|"heavy")[];
  shields: readonly string[]; feats: readonly { featId: string; choice: string | null }[]; deityFavoredWeaponId: string | null }
export function weaponProficiency(w: { id: string; name: string; category: "simple"|"martial"|"exotic"|"ammunition"|"siege" }, g: ProficiencyGrants): ProficiencyState;
export function armorProficiency(category: "light"|"medium"|"heavy", g: ProficiencyGrants): ProficiencyState;
export function shieldProficiency(shieldId: string, g: ProficiencyGrants): ProficiencyState;

// advancement.ts, feats.ts, feat-effects.ts, class-features.ts, level-up.ts — ver §9.3 y §11
export function featSlotsAtLevel(level: number, human: boolean): number;
export function abilityIncreasesAtLevel(level: number): number;
export function skillRankBudget(i: { classRanksPerLevel: number; intModifier: number; human: boolean; favoredSkillBonus: boolean }): number;
export function baseFromFinal(i: { finalScore: number; racial: number; increases: number }): Result<number>;
export function featPrerequisiteIssues(p: FeatPrereqInput, s: FeatPrereqState): PrereqIssue[];
export const FEAT_EFFECTS: readonly FeatEffectRow[];
export const PASSIVE_FEATURES: readonly PassiveFeatureRow[];
export function dailyUses(featureId: string, ctx: { classLevel: number; abilityModifiers: AbilityModifiers }): number | null;
export function levelUpPreview(input: LevelUpInput): Result<LevelUpPreview>;

// armor-class.ts (tocar): ArmorClassInput += keepsDexWhenFlatFooted?: boolean   (R100)
```

### 9.3 Tabla de reglas nuevas: cita, certeza, ejemplo

> «Cita» = capítulo/sección del Core (SRD en AoN/d20pfsrd). «Certeza»: **A** = la regla y las cifras están en
> el repo o en informes de f2/f3 ya contrastados con el SRD; **B** = alta confianza pero el implementer DEBE
> contrastar la tabla/cifra con el SRD (marca **verificar**) y anotar el resultado y la URL en
> `progress/impl_f4-character-sheet_<lote>.md`; **C** = convención de mesa, no regla del Core (decisión humana).
> Si una cifra **B** no coincide, el implementer corrige el test y la regla, y lo anota; si la regla es ambigua,
> NO la inventa: la deja como pregunta (docs/architecture.md §7).

| # | Regla | Cita | Cert. | Ejemplo / test |
|---|-------|------|-------|----------------|
| 1 | Capacidad de carga por Fuerza 1–29 (carga máxima: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 230, 260, 300, 350, 400, 460, 520, 600, 700, 800, 920, 1040, 1200, 1400); ligera = ⌊máx/3⌋, media = ⌊2·máx/3⌋ (así salen las tres cifras de cada fila de 1 a 29); Fuerza ≥ 30: fila 20–29 con la misma cifra de unidades y sus **tres** cifras ×4 por cada +10 | Cap. 7 Equipment, «Carrying Capacity» (Tabla de capacidad de carga) | **B** verificar toda la tabla | Fue 10 → 33/66/100; Fue 16 → 76/153/230; Fue 18 → 100/200/300; Fue 30 → 532/1064/1600 |
| 2 | Multiplicador de tamaño para bípedos: Fino ×⅛, Diminuto ×¼, Menudo ×½, Pequeño ×¾, Mediano ×1, Grande ×2, Enorme ×4, Gargantuesco ×8, Colosal ×16; redondeo hacia abajo | Cap. 7, «Carrying Capacity» | **B** verificar multiplicadores **y redondeo (Q6)** | Pequeño, Fue 10 → 24/49/75 |
| 3 | Efectos de la carga: media: Des máx. +3, penalizador −3, carrera ×4; pesada: +1, −6, ×3; ligera: nada, ×4 | Cap. 7, «Table: Carrying Loads» | **A** (Des y penalizador verificados en f2); carrera **B** | R77 |
| 4 | Velocidad reducida por armadura o carga: 20→15, 30→20, 40→30, 50→35, 60→40, 70→50, 80→55, 90→60 | Cap. 7, «Table: Armor and Load: Speed» | **B** verificar | Datos de f3: `speed30`/`speed20` de cada armadura coinciden con la tabla (test cruzado) |
| 5 | Armadura y carga: «se usa la peor cifra, no se acumulan» (Des máx., penalizador de armadura, velocidad) | Cap. 7, «Carrying Capacity» (verificada en f2, OQ-5) | **A** | Placas + carga media: Des máx. 1, penalizador −6, velocidad 20 |
| 6 | Enano: velocidad base 20 «nunca modificada por armadura ni carga» | Raza enano, «Slow and Steady» (texto en f3) | **A** (test lee el rasgo del dataset) | R79 |
| 7 | Movimiento rápido del bárbaro: +10 pies sin armadura o con ligera/media y sin carga pesada | Bárbaro, «Fast Movement» (texto en f3) | **A** (test lee el texto) | bárbaro 30 + cota de mallas → 40 → 30 |
| 8 | PG: dado completo al nivel 1 (convención del Core para PJ); Con por nivel con **mínimo 1 PG por nivel**; clase predilecta +1 PG o +1 rango por nivel; `toughness` +3 y +1 por DG por encima de 3 | Cap. 1 (Con), Cap. 2 (clase predilecta), Cap. 3, dote Toughness (texto en f3) | **B** nivel 1 y mínimo 1 **verificar**; Toughness **A** | Druida 5, Con +2, promedios → 38 (43 con `toughness`) |
| 9 | Promedio de un dado = `dado/2 + 1` (d6=4, d8=5, d10=6, d12=7) | **No es regla del Core**: convención de mesa/Pathfinder Society | **C** (Q3) | `averageHitDie` |
| 10 | Estados por PG: 0 = incapacitado; negativos = inconsciente y muriendo; muerte al llegar a −(puntuación de Con); daño no letal = PG actuales → tambaleante; mayor → inconsciente | Cap. 8, «Injury and Death», «Nonlethal Damage» | **A/B** verificar umbrales | límites exactos |
| 11 | Conjuros adicionales: `0` si nivel 0 o mod < nivel; si no `⌊(mod − nivel)/4⌋ + 1`; hace falta puntuación ≥ 10 + nivel para lanzar | Cap. 1, «Table: Ability Modifiers and Bonus Spells»; Cap. 9 | **A** (fórmula contrastada con la tabla) | mod +5: 2/1/1/1/1 para niveles 1–5 |
| 12 | Tabla de clase: «—» = sin conjuros de ese nivel (y sin adicionales); `0` = solo adicionales; +1 de dominio del clérigo donde `domainSpellsPerDay` | Cap. 3 (tablas de clase), f3 `class.ts` | **A** | clérigo 5, Sab 16 → [4,4,3,2] + dominio en 1–3 |
| 13 | CD de conjuro = 10 + nivel + mod. de la característica de lanzamiento; concentración = d20 + nivel de lanzador + mod. | Cap. 9, «Saving Throws», «Concentration» | **A** | Sab 16, nivel 2 → 15 |
| 14 | Nivel de lanzador de paladín y explorador = nivel de clase − 3 | Clases paladín/explorador, «Spells» | **A** (texto en f3) | paladín 5 → 2 |
| 15 | Fallo arcano de armadura/escudo; el bardo lanza sin fallo con armadura ligera pero no con media/pesada ni con escudo | Cap. 6 «Arcane Spell Failure»; bardo | **B** verificar | bardo con cota de mallas 30 % |
| 16 | Los trucos/oraciones (nivel 0) no se gastan | Clérigo/druida/bardo, «Orisons/Cantrips» | **B** verificar | `consumesSlot(0)=false` |
| 17 | Ataques iterativos: BAB ≥ 6 da un 2.º ataque a −5, ≥ 11 un 3.º a −10, ≥ 16 un 4.º a −15 | Cap. 8, «Attack Roll»/«Full-Attack» | **A** | BAB 11 → +11/+6/+1 |
| 18 | CMB = BAB + Fue + mod. especial de tamaño; CMD = 10 + BAB + Fue + Des + mod. especial + bonificadores de desvío, esquiva, circunstancia, intuición, suerte, moral, profano y sagrado de la CA; mod. especial: Fino −8, Diminuto −4, Menudo −2, Pequeño −1, Mediano 0, Grande +1, Enorme +2, Gargantuesco +4, Colosal +8 | Cap. 8, «Combat Maneuvers» | **B** verificar fórmula y tabla | paladín §16.2: CMB 8, CMD 19 |
| 19 | Ataque = BAB + mod. (Fue cuerpo a cuerpo, Des a distancia; Des con Weapon Finesse y arma ligera/estoque/látigo/cadena con pinchos) + tamaño + mejora; obra maestra +1 de mejora al ataque (no se apila con la mágica); sin competencia −4 | Cap. 8 «Attack Roll», Cap. 6 «Masterwork», «Weapon Proficiency»; texto de la dote en f3 | **A/B** | +1 espada larga: 5+3+1 = 9 |
| 20 | Competencias de arma: clase (`simple`, `martial`, ids, arma de la deidad), dotes de competencia (la exótica por arma); las razas con «familiaridad» (enano, elfo, gnomo, semiorco, mediano) hacen `unverified` lo marcial/exótico no cubierto | Cap. 6/Cap. 2, f3 | **B** (la familiaridad racial no está estructurada) | pícaro con ballesta pesada |
| 21 | Dotes: 1 al nivel 1 y 1 más en cada nivel impar (⌈nivel/2⌉); humano +1; aumento de característica cada 4 niveles | Cap. 2, «Table: Character Advancement»; raza humano (texto en f3) | **A** | nivel 5 → 3 dotes (4 humano), 1 aumento |
| 22 | Rangos por nivel = máx(1, rangos de clase + mod. de Int) + 1 humano (+1 si la predilecta da rango); máx. por habilidad = nivel | Cap. 4, Cap. 2 (clase predilecta), raza humano | **A** | pícaro 8, Int +2, humano, predilecta → 12 |
| 23 | Retroactividad del mod. de Int en rangos | Cap. 4 | **Pendiente** | el presupuesto usa la Int actual y es solo advertencia (Q9) |
| 24 | Prerrequisitos de dotes: los estructurados de f3 se comprueban; `other` y lo no estructurado → aviso «no verificable» | f3 `feat.ts` | **A** | Power Attack: Fue 13, BAB +1 |
| 25 | Efectos de dotes (`FEAT_EFFECTS`) y rasgos pasivos (`PASSIVE_FEATURES`), cada fila contrastada en test con su texto de f3 | texto de la dote/capacidad en f3 | **A** (el test lo impone) | `improved-initiative` +4 |
| 26 | Usos diarios: castigar el mal 1 + ⌊(nivel−1)/3⌋; imposición de manos ⌊nivel/2⌋ + mod. de Car; vínculo divino 1 (nivel 5) +1 en 8, 11, 14, 17; furia 4 + mod. de Con + 2·(nivel−1) rondas; interpretación de bardo 4 + mod. de Car + 2·(nivel−1) rondas; maestro del saber 1 +1 por cada 6 niveles tras el 5; canalizar energía del clérigo 3 + mod. de Car; forma salvaje 1 al nivel 4, +1 en 6 y cada 2 niveles (8 en 18) | clases correspondientes (texto en f3) | **B** verificar cada una contra el texto | paladín 5: castigar 2, imposición 2+3 = 5; bárbaro 5 Con +2: 14; bardo 5 Car +3: 15 |
| 27 | Esquiva asombrosa: conserva Des (y por tanto la esquiva) al ser sorprendido | Bárbaro/pícaro, «Uncanny Dodge» (texto en f3) | **A** | R100 |
| 28 | Armadura/escudo de obra maestra o mágicos: penalizador de armadura −1 (mínimo 0) | Cap. 6 «Masterwork Armor»; Cap. 15 | **A/B** | placas +1 → −5 |
| 29 | Monedas: 50 por libra | Cap. 6, «Coins» | **B** | 100 po = 2 lb |
| 30 | Un objeto por hueco (dos anillos) | Cap. 15, «Magic Items on the Body» (entrada `magic-items-on-the-body` en f3) | **A** | R117 |
| 31 | Más allá de la carga máxima («sobrecargado») | Cap. 7, «Lifting and Dragging» | **B** verificar | se trata como carga pesada y se avisa; sin cifras nuevas |

### 9.4 `deriveSheet`

```ts
export function deriveSheet(input: SheetInput): Result<DerivedSheet>;

export interface SheetInput {                       // tipos propios de rules; los fija el Lote 0
  race: { id: string; size: Size; baseSpeedFt: number; abilityModifiers: Partial<Record<AbilityId, number>>;
          abilityChoice: { amount: number } | null; naturalArmor: number };
  abilities: { base: AbilityScores; racialChoice: AbilityId | null };
  levels: { classId: string; hp: number | null; hpMethod: string; favoredBonus: "hp"|"skill"|"none"; abilityIncrease: AbilityId | null }[];
  classes: Record<string, SheetClassInfo>;           // proyección core de f3 (progresiones ya mapeadas en toSheetInput)
  skillDefs: readonly (SkillDefinition & { name: string; knowledgeSubject?: string })[];
  skills: readonly { skillId: string; subtype: string | null; ranks: number; classSkill: boolean | null }[];
  feats: readonly { featId: string; choice: string | null; slot: string; level: number | null }[];
  featCatalog: Record<string, { name: string; types: string[]; prerequisites: FeatPrereqInput }>;
  hp: { current: number; temporary: number; nonlethal: number };
  items: readonly SheetItem[];                       // inventario resuelto (datos de arma/armadura/escudo, efectos, mejoras)
  coins: { cp: number; sp: number; gp: number; pp: number };
  manualModifiers: readonly ManualModifierInput[];
  spellcasting: Record<string, { known: string[]; prepared: { id: string; spellId: string; slotLevel: number; domain: boolean }[] }>;
  spellCatalog: Record<string, { name: string; levels: Record<string, number>; somatic: boolean }>;
  daily: { usedPrepared: string[]; spent: Record<string, Record<string, number>> };
  features: { domainIds: string[]; optionIds: string[]; counters: readonly CounterDef[] };
  domains: Record<string, { spells: { level: number; spellId: string }[] }>;
  identity: { alignment: string; favoredClassId: string | null };
}

export interface DerivedSheet {
  characterLevel: number; classLevels: { classId: string; level: number }[]; size: Size;
  abilities: Record<AbilityId, { score: Breakdown; modifier: number; status: "ok" | "zero" }>;
  hp: { max: Breakdown; estimated: boolean; status: HpStatus; deathAt: number };
  ac: ArmorClassResult; initiative: Breakdown;
  saves: Record<SaveId, Breakdown>;
  bab: Breakdown; iterative: number[]; cmb: Breakdown; cmd: Breakdown;
  skills: SkillRow[];                                // todas las de f3 + especialidades
  attacks: AttackRow[];                              // armas equipadas + ataque sin armas
  speed: SpeedResult | null; load: { weightLb: number; unknownWeightItems: number; capacity: CarryingCapacity; category: LoadCategory; effects: LoadEffects };
  armorCheckPenalty: { value: number; sources: string[] };   // la peor entre armadura+escudo y carga (R110)
  spellcasting: Record<string, ClassSpellSummary>;
  classFeatures: { classId: string; featureId: string; name: string; level: number }[];
  suggestedCounters: { featureId: string; label: string; max: number; resetOn: "rest" }[];
  unapplied: { itemId: string | null; effect: ItemEffect; reason: "conditional" | "damage" }[];
  warnings: SheetWarning[];
}
```

Orden de cálculo (determinista):

1. **Objetos equipados válidos**: por hueco, los primeros hasta su capacidad (R117); el resto genera `slot_conflict`.
2. **Modificadores por diana** (todos `Modifier` con id estable `item:<itemId>:<n>`, `feat:<featId>`, `class:<featureId>`,
   `manual:<id>`): efectos estructurados no condicionales de objetos equipados (+ condicionales activados), dotes
   (`FEAT_EFFECTS`), rasgos pasivos, modificadores manuales activos (vinculados: solo con el objeto equipado).
3. **Características** → `effectiveAbility` con base + raza (+ elección) + aumentos de nivel + efectos `ability.*`
   (R106). Una puntuación efectiva < 1 se trata como 1 con `status:"zero"` (Q7, resuelve OQ-4).
4. **PG máximos** (`hitPoints`), **peso/carga/velocidad** (`carryingCapacity` con la Fue efectiva, `loadCategory`,
   `characterSpeed`).
5. **CA** (`armorClass`): `maxDexCaps` = [armadura equipada, escudo (`tower-shield` +2), carga]; modificadores:
   `armor` = base + mejora (plegada), `shield` = base + mejora, `naturalArmor` = raza + amuleto (mayor mejora),
   efectos `ac` restantes por su tipo, esquiva (`dodge`), manuales; `keepsDexWhenFlatFooted` si hay
   `barbarian.uncanny-dodge` (nivel ≥ 2) o `rogue.uncanny-dodge` (nivel ≥ 4). El jugador **no** puede recibir en la
   CA de toque los bonificadores `armor|shield|naturalArmor` (lo hace f2).
6. **Salvaciones/iniciativa/habilidades**: `savingThrow`, `initiativeModifier`, `skillModifier` con
   `armorCheckPenalties` = [{id:"acp", value: |peor cifra|}] según R110.
7. **BAB/iterativos/CMB/CMD/ataques** (`characterBaseAttackBonus` con progresiones mapeadas: `full→good`,
   `threeQuarters→medium`, `half→poor`; `weaponAttackBonus` por arma equipada; ataque sin armas con `unarmed-strike`).
8. **Conjuros** por clase con `casting`: `spellsPerDay`, CD por nivel, `casterLevel`, `concentrationBonus`,
   `arcaneSpellFailure` (bardo), comprobaciones de gasto/preparados.
9. **Capacidades y contadores sugeridos**, **advertencias** (`sheetWarnings`).

**Aplicación de efectos de objetos (tabla, R126, R127):**

| `target` del efecto | `appliesTo` | Dónde entra |
|---------------------|-------------|-------------|
| `ac` con `foldInto` | cualquiera | se **pliega** en el bonificador `armor`/`shield`/`naturalArmor` (mayor mejora por diana); no cuenta en toque |
| `ac` sin `foldInto` | cualquiera | `Modifier` de su `type` en `armorClass` (desvío, armadura de *bracers of armor*, esquiva…) |
| `attack` | `wearer` | todas las filas de ataque |
| `attack` | `item` | solo la fila de esa arma |
| `damage` | cualquiera | **no se aplica** (f6); aparece en `unapplied` con motivo `damage` |
| `initiative`, `save.*`, `ability.*`, `skill.<id>` | `wearer` | su estadística; `save.all` ya viene expandido |
| cualquiera con `conditional: true` | cualquiera | solo si el id está en `appliedConditional` del objeto; si no, `unapplied` con motivo `conditional` |

### 9.5 Catálogo cerrado de advertencias (R104)

`SheetWarning = { code: SheetWarningCode; severity: "warning" | "info"; params: Record<string, string | number>; path: string }`
(`path` = enlace de edición: `abilities`, `skills.perception`, `inventory.<id>`…). **Nunca bloquean.**

| Código | Sev. | Condición |
|--------|------|-----------|
| `ability_zero` | warning | puntuación efectiva < 1 (R106) |
| `racial_choice_missing` | warning | raza con elección y `racialChoice` nulo (R136) |
| `level1_hp_not_max` | info | PG del nivel 1 distintos del máximo del dado (R136) |
| `hp_estimated` | info | algún nivel con `hp: null` (R80) |
| `ability_increase_missing` / `ability_increase_extra` | info | aumentos registrados ≠ `⌊nivel/4⌋` |
| `ranks_over_level` | warning | rangos > nivel de personaje |
| `ranks_over_budget` | info | rangos totales > presupuesto estimado (Q9) |
| `feat_count` | info | dotes de ranura `level`/`human` ≠ `featSlotsAtLevel` |
| `feat_prerequisite` | warning | prerrequisito estructurado sin cumplir |
| `feat_unverifiable` | info | prerrequisito en `other` |
| `armor_not_proficient` / `shield_not_proficient` / `weapon_not_proficient` | warning | sin competencia (`unverified` → `weapon_unverified`, info) |
| `slot_conflict` | warning | hueco por encima de su capacidad (R117) |
| `two_handed_offhand` | warning | arma a dos manos con la mano secundaria ocupada |
| `enhancement_cap` / `ability_not_legal` | warning | R128 |
| `overloaded` | warning | carga > máxima |
| `weight_unknown` | info | objetos sin peso en el manual (agregado) |
| `needs_review_data` | info | se usa una entrada con `needsReview` |
| `effects_incomplete` | info | objeto con `effectsStatus` `incomplete`/`none` sin modificador manual vinculado |
| `spell_not_on_list` / `spell_level_too_high` | warning | conjuro fuera de la lista de la clase / nivel no lanzable |
| `spell_ability_too_low` | warning | puntuación < 10 + nivel con conjuros de ese nivel |
| `prepared_over_slots` / `known_over_table` / `spent_over_total` | warning | R148, R149 |
| `domain_slot_mismatch` | warning | R153 |
| `paladin_alignment` | warning | paladín con alineamiento ≠ LG |
| `speed_unsupported` | info | velocidad fuera de la tabla de reducción |

Cada código tiene texto en `src/web/i18n/character/common.ts` (registro `Record<SheetWarningCode, (p) => string>`,
R193) y dos tests (provoca / no provoca, R104).

### 9.6 Ensamblador `toSheetInput` (`src/shared/character-sheet.ts`)

```ts
export interface CatalogLookup { get(category: Category, id: string): CoreDto | undefined }
export function requiredEntries(c: CharacterSections): { category: Category; id: string }[];   // qué pedir al catálogo
export function toSheetInput(c: CharacterSections, catalog: CatalogLookup):
  { ok: true; input: SheetInput } | { ok: false; missing: { category: Category; id: string }[] };
```

`requiredEntries` incluye: la raza; las clases de `levels`; las 35 habilidades (vista `core` completa); cada objeto del
inventario y su objeto base (`baseItemId`) y habilidades especiales; las dotes (para prerrequisitos y nombres); los
conjuros de `spellcasting` (nombre, niveles, somático); los dominios elegidos. `toSheetInput` devuelve `missing`
en lugar de calcular con datos parciales (R119, R165). Convierte progresiones (`full|threeQuarters|half` →
`good|medium|poor`), valores absolutos de penalizador de armadura (f3 los guarda ≤ 0; f2 espera magnitudes ≥ 0) y
resuelve los objetos específicos (`baseItemId` + `enhancement` de la entrada).

## 10. Inventario, equipo y objetos mágicos

- **Hueco permitido (`slotsFor(entry)`, `src/rules/sheet/slots.ts`, R124):** armas → `mainHand|offHand`; armaduras →
  `armor`; escudos → `shield`; objetos mágicos por el `slot` literal de f3: `armor`→`armor`, `shield`→`shield`,
  `ring`→`ring1|ring2`, `belt|body|chest|eyes|feet|hands|head|headband|neck|shoulders|wrist|arms`→ el mismo,
  `none`/vacío →`carried`; `weapon quality|armor quality|shield quality|armor/shield quality` → no equipable
  (`null`). Objetos personalizados: `slotHint` o `carried`. Un test recorre **todos los valores reales** de `slot`
  del dataset (hoy: 22 valores distintos) y falla si aparece uno sin mapear.
- **Equipar (R123):** la UI ofrece solo `slotsFor`; si el hueco está ocupado pide confirmación de intercambio («Quitar
  X y equipar Y»). Un arma a dos manos en `mainHand` con `offHand` ocupada deja el aviso `two_handed_offhand`.
- **Peso (R122):** `peso × cantidad`; prioridad: `weightLbOverride` > dato de f3 > 0 (cuenta como «sin peso»). El
  objeto específico usa su peso de f3 (`weightLb`) o el del objeto base. Monedas: `(cp+sp+gp+pp)/50`.
- **Mejoras e instancias genéricas (R128):** `enhancement` 0–5 y `abilityIds` solo para armas, armaduras y escudos de
  catálogo; el bonificador efectivo = mejora + Σ `bonusEquivalent` de las habilidades (`variants[0]`); advertencias
  `enhancement_cap` (mejora > 5 o efectivo > 10) y `ability_not_legal` (según `legalFor`). Precio/coste: no se
  calcula (fuera de alcance).
- **Armadura y escudo:** `armor`/`shield` modifier = base + mejora; ACP reducido en 1 (mínimo 0) si `masterwork` o
  `enhancement > 0` (R125); `maxDex` y fallo arcano de la entrada; los objetos específicos (cota de mallas +1, etc.)
  usan `baseItemId` + su `enhancement`.
- **Efectos (R126, R127):** ver tabla de §9.4. Tipos y apilamiento los decide `resolveModifiers` de f2: dos
  mejoras no se suman, un anillo de protección (desvío) sí se suma a la armadura y el escudo, *bracers of armor* (tipo
  `armor`) no se suman a la armadura.
- **Sin estructura (R129):** `effectsStatus ∈ {none, incomplete}` ⇒ la tarjeta muestra «Este objeto no modifica tus
  números automáticamente. Si tiene un bonificador, añádelo como modificador manual» (más destacado en `incomplete`:
  los 26 de f3) y el botón «Añadir modificador» crea un `ManualModifier` con `itemId` (solo cuenta con el objeto
  equipado). Objetos con **elección del dueño** (cinturón de poder físico, diadema de prodigio mental) se tratan igual.
- **`needsReview` (R130):** se pueden añadir y usar; la tarjeta lleva «Revisar texto». Pociones, pergaminos, varitas,
  aceites: `custom` con peso y cantidad (Q13).
- **Borrado (R131):** `removeItem` (shared) devuelve las secciones `inventory` y `modifiers` ya limpias; la UI las
  envía en el mismo guardado (el servidor rechazaría un `itemId` huérfano, R7).
- **Selector (R132):** `magic-items?addable=true` + filtros `kind`/`slot`. Las habilidades especiales se eligen desde la
  tarjeta de un arma/armadura/escudo genérico, no como objeto.

## 11. Creación y subida de nivel

### 11.1 Creación (`/ficha/nuevo`, R135)

Pasos: 1 identidad (nombre, raza del catálogo, alineamiento, deidad, clase predilecta) → 2 puntuaciones (base de
generación; elección racial si la raza tiene `abilityChoice`; ayudante «tengo la puntuación final»: `baseFromFinal`,
R103) → 3 niveles (una fila por nivel: clase, PG con el promedio prerrellenado y el nivel 1 en el máximo, clase
predilecta, aumento de característica en 4, 8…) → 4 revisión con los derivados calculados y las advertencias → «Crear»
(un `POST`, `hp.current` = PG máximos derivados). Dotes, habilidades, equipo y conjuros se rellenan después en la ficha
(los jugadores ya existentes tienen nivel 5: la creación debe ser rápida, no un cuestionario exhaustivo). La ficha
acepta cualquier estado intermedio.

### 11.2 Subida de nivel (`/ficha/:id/nivel`, R137–R143)

`levelUpPreview` (puro) calcula; el asistente (UI) guarda un **borrador en memoria** (no toca el servidor hasta
«Confirmar», R140):

| Paso | Contenido | Advertencias |
|------|-----------|--------------|
| 1 Clase | clase actual o nueva (multiclase); resumen del nuevo nivel de clase y de personaje | — |
| 2 PG | opciones: promedio (prerrellenado, `averageHitDie`), máximo, «he tirado: [ ]», manual; método guardado en `hpMethod`; clase predilecta: +1 PG o +1 rango | `hp_estimated` si se omite |
| 3 Característica | solo si `abilityIncreasesAtLevel` aumenta: elegir característica (`abilityIncrease`) | `ability_increase_missing` |
| 4 Dote | solo si `featSlotsAtLevel` aumenta (o capacidad de clase que concede dote): `EntryPicker` de dotes con prerrequisitos ya evaluados; `slot` `level`/`class`/`human` | `feat_prerequisite`, `feat_unverifiable` |
| 5 Habilidades | reparto con `Stepper` y presupuesto (`skillRankBudget`, máx. por habilidad = nivel) | `ranks_over_level`, `ranks_over_budget` |
| 6 Capacidades | `specialIds` nuevos de la fila de la tabla (tocar = texto); para capacidades con opciones (`parentId`) → selector de opciones con `level ≤ nivel de clase` (R143) | — |
| 7 Conjuros | huecos nuevos por día y conjuros conocidos nuevos (bardo); atajo a la pestaña Conjuros | `known_over_table` |
| 8 Revisión | resumen de cambios, advertencias, **«Confirmar» siempre activo** | — |

«Confirmar» (R139) construye **un** `PATCH` con `levels` (+1 entrada), `skills`, `feats`, `features`, `spellcasting` y
`hp` (`current += PG ganados`, convención: al subir de nivel los PG actuales aumentan en lo ganado); un 409 conserva el
borrador y abre el flujo de conflicto de §14.3. El **historial** (R141) es la propia tabla `levels[]`: se edita nivel
a nivel; «Quitar último nivel» lista lo que no se revierte (rangos, dotes, conjuros, aumento). No hay registro de
cambios por campo (alternativa descartada: coste de almacenamiento y de UI sin necesidad).

## 12. Conjuros y usos diarios

- **Datos por clase** (`spellcasting[classId]`): `known` (espontáneos y, opcionalmente, favoritos), `prepared`
  (huecos). Clases del dataset con `casting`: bardo (espontáneo, arcano, Car), clérigo/druida (preparados, divino,
  Sab), paladín/explorador (preparados, Car/Sab, desde el nivel 4). **No hay libro de conjuros** (hechicero/mago no
  existen en f3, Q19); un futuro «libro» sería una versión 2 del esquema.
- **Selector (R145):** `EntryPicker` de `spells` con `classId` y `level` (≤ máx. lanzable), buscando por nombre; permite
  conjuros fuera de lista (advertencia `spell_not_on_list`). Domina el rendimiento la paginación del catálogo.
- **Huecos preparados (R146, R147):** cada elemento es un hueco independiente (el mismo conjuro varias veces); `slotLevel`
  ≥ nivel del conjuro (metamagia: nota libre en `note`, sin cálculo); `domain:true` solo en clérigo. «Usar» añade el
  `id` a `daily.usedPrepared` salvo nivel 0 (R89).
- **Espontáneo (R148):** `daily.spent[class][nivel]` con «−/+» limitado a `[0, total]` en la UI; si el documento lo
  supera, `spent_over_total`.
- **Dominios (R153):** `features.domainIds` (máx. 2) elegidos del catálogo; los conjuros de dominio de la clase salen de
  `DomainCore.spells`; los poderes (`grantedPowers`) aparecen en Dotes y capacidades con su texto en `DetailDto.parts`.
- **Descanso (R10, R150):** botón con confirmación («Descansar: recupera conjuros y usos que se reinician con el
  descanso»); operación pura y **un** guardado de `daily`; los PG no se tocan (curación natural: el jugador los
  introduce).
- **Contadores (R151, R152):** `CounterDef` (etiqueta, `featureId` opcional para abrir su texto, máximo `auto` o
  `manual`, `resetOn`); gasto en `daily.counters[id]`. «Añadir contadores sugeridos» crea los de
  `DerivedSheet.suggestedCounters` (castigar el mal, imposición de manos, furia, interpretación de bardo, forma salvaje,
  canalizar energía, vínculo divino, maestro del saber) con un toque. Ningún contador altera derivados (la activación
  numérica es de f7; punto de enganche: el `featureId` y el interruptor `modifiers[].active`).
- **Estados/efectos temporales:** `modifiers` con `active` (p. ej. «Bendición +1 ataque», «Fatigado −2 Fue/Des»); la hoja
  resumida los muestra como interruptores (R181). Es el enganche para buffs de f6/f7.

## 13. Notas privadas

- **Entidad** `Note` (`private_note`), independiente de la ficha (sobrevive a la muerte del personaje). `characterId`
  opcional para filtrar «notas de este personaje».
- **Texto:** Markdown simple (párrafos, `**negrita**`, `*cursiva*`, `# encabezados`, listas `-` y `1.`), renderizado por
  `markdown-lite` (§14.5) sin HTML ni enlaces activos. Límite 20 000 caracteres; 200 notas por usuario.
- **Búsqueda (R156):** servidor, `foldText` sobre título+cuerpo del propio usuario (no se indexa nada compartido).
- **UI (`/notas`):** lista (título, fragmento, fecha) con buscador y filtro por personaje; editor con título,
  cuerpo, alternar vista previa, vincular a la ficha activa, borrar con confirmación; autoguardado con el mismo
  motor que la ficha (`NoteEditorEngine` reutiliza `SaveEngine`, §14.3) y control `revision` por nota (409 → recargar y
  elegir).
- **Privacidad (R28, R30, R32, R52, R160):** matriz con `gmCanRead:false`; logs sin cuerpos; nunca viajan en
  eventos (R200); el GM ni siquiera ve cuántas notas tiene un jugador.

## 14. Cliente web

### 14.1 Servicios y datos

```ts
export interface CharacterApi {
  list(status?: "active"|"archived"|"all"): Promise<ApiResult<CharacterSummaryDto[]>>;
  get(id: string): Promise<ApiResult<CharacterDto>>;
  create(body: CreateCharacterBody): Promise<ApiResult<CharacterDto>>;
  patch(id: string, baseRevision: number, sections: Partial<CharacterSections>): Promise<ApiResult<CharacterDto>>;
  archive(id: string): Promise<ApiResult<CharacterDto>>;
  restore(id: string): Promise<ApiResult<CharacterDto>>;
  remove(id: string): Promise<ApiResult<void>>;
}
export interface NotesApi { list(p?: {q?: string; characterId?: string}): …; get(id); create(b); update(id, b); remove(id) }
export interface RulesCatalogApi {                 // el «RulesDataSource del cliente» (nombre distinto: ya existe el de src/data)
  meta(): Promise<ApiResult<{ counts: Record<string, number> }>>;
  search(category: CatalogCategory, p: { q?: string; limit?: number; offset?: number; filters?: Record<string, string> }): Promise<ApiResult<Page<IndexItemDto>>>;
  core(category: CatalogCategory, ids?: readonly string[]): Promise<ApiResult<{ items: CoreDto[]; missing: string[] }>>;
  detail(category: CatalogCategory, id: string): Promise<ApiResult<DetailDto>>;
  spellList(classId: string): Promise<ApiResult<Record<string, string[]>>>;
}
// AppServices += { characters: CharacterApi; notes: NotesApi; rules: RulesCatalogApi }
```

Se llama `RulesCatalogApi` (no `RulesDataSource`) porque `RulesDataSource` ya designa la interfaz **del servidor/de
`src/data`** (f3, `docs/architecture.md` §4) y la web tiene prohibido importar `src/data` (f1b R73); el servidor
implementa el catálogo **sobre** ese `RulesDataSource`. Fakes: `tests/web/helpers/fake-rules-catalog.ts`
(`InMemory`: construido desde un puñado de entradas `core` de fixtures) y `fake-character-api.ts` (almacén en memoria
con `revision` real para probar conflictos).

**`CatalogCache`** (`features/character/data/catalog-cache.ts`, R164): `ensure(requests)` agrupa ids por categoría
(≤ 60 por llamada, varias llamadas si hay más), omite los ya cargados o en vuelo, guarda en un `Map` de la pestaña
y notifica a los suscriptores; `get(category,id)` síncrono; los fallos no se cachean. Proveedor de contexto por página
de ficha. **No** usa almacenamiento del navegador.

**`useDerivedSheet(character)`** (R165): calcula `requiredEntries`, llama a `ensure`, y cuando no faltan datos
ejecuta `deriveSheet(toSheetInput(...))` (memoizado por el contenido canónico de las secciones y la versión de la
caché). Estados: `loading` (esqueleto con `role="status"`), `error` (mensaje + «Reintentar»), `ready` (`DerivedSheet`).
Mientras falte algo **no se muestran números parciales** («peor un número incorrecto que ninguno»).

### 14.2 Rutas y secciones (R171, R172)

```
section character   path /ficha   roles [player,gm]  order 10   Component: CharacterOutlet (lazy, <Suspense><Outlet/>)
  index              → CharacterHome   jugador: <Navigate> a su ficha activa o CTA «Crear personaje» (+ archivadas)
                                       GM: lista de todas agrupada por jugador (solo lectura)
  nuevo              → CreateWizard
  :id                → SheetPage (cabecera + selector Resumen | Detalle + SaveStatus)
      index          → SummaryView
      detalle/:tab   → DetailView   tab ∈ personaje | habilidades | dotes | conjuros | equipo
      nivel          → LevelUpWizard (+ historial en detalle/personaje)
section notes       path /notas   roles [player,gm]  order 15
```

`EntryDrawer` se abre con `?ver=<categoría>:<id>` (se conserva el resto de la URL); cerrar = quitar el parámetro (atrás
funciona). El parámetro se ignora si la categoría/id no existen (muestra «No encontrado» dentro del diálogo).

### 14.3 Guardado: `SaveEngine` / `CharacterEditor` (R166–R170)

Motor TS puro y testable (`character-editor.ts`), envuelto por `useCharacterEditor`:

```ts
interface EditorDeps { api: CharacterApi; timers?: { setTimeout; clearTimeout }; online?: OnlineSource; debounceMs?: 800 }
type SaveStatus = "saved"|"dirty"|"saving"|"offline"|"conflict"|"error"|"readonly";
interface Editor { doc: CharacterDto; status: SaveStatus; pending: SectionName[]; conflicts: SectionName[];
  update<S extends SectionName>(s: S, f: (cur: CharacterSections[S]) => CharacterSections[S]): void;
  flush(): Promise<void>; reload(): Promise<void>; resolveConflict(choice: "server" | "mine"): Promise<void>; retry(): void }
```

| Evento | Comportamiento |
|--------|----------------|
| `update` | aplica el cambio **al instante** en el documento local, marca la sección pendiente y reinicia el temporizador de 800 ms |
| temporizador / `visibilitychange: hidden` / `blur` | `flush`: si hay una petición en vuelo espera a que termine; si no, `PATCH {baseRevision: doc.revision, sections: pendientes}` |
| 200 | `baseRevision` = `response.revision`; las secciones enviadas y no modificadas desde entonces dejan de estar pendientes (las modificadas en vuelo siguen pendientes); estado `saved` o `dirty` |
| error de red | estado `offline`; los pendientes se **conservan en memoria**; reintento con espera 2 s, 5 s, 15 s, 30 s (tope) y al evento `online`; `beforeunload` avisa mientras haya pendientes (R168) |
| 409 `revision_conflict` | `GET` del servidor; `conflicts` = pendientes con `sectionRevs[s] > baseRevision`; estado `conflict`; panel con dos acciones por sección: **«Usar la del servidor»** (descarta lo mío en esa sección) o **«Conservar la mía»** (reenvía con la revisión nueva). Las pendientes sin choque se reenvían solas (R169) |
| 400/403/500 | estado `error` con el mensaje de `es.errors`; los pendientes se conservan; «Reintentar» |
| 401 | lo maneja el shell (sesión caducada → login). Se pierden los pendientes en memoria: el aviso de sesión caducada lo dice |
| propietario ≠ actor | estado `readonly`: `update` no hace nada y no se envía nunca un `PATCH` (R170) |

Alternativas rechazadas: «botón Guardar» (se olvida; en combate es fatal), `localStorage`/IndexedDB para la cola offline
(prohibido por f1b R85; se deja como pregunta Q5), fusión automática dentro de una sección (puede mezclar estados
incoherentes de reglas). El **modo sin conexión es básico**: el sistema avisa, no pierde lo escrito mientras la pestaña
siga abierta y reintenta; recargar la página con cambios pendientes los pierde (de ahí el aviso al salir).

### 14.4 Pantallas (mobile-first)

**Hoja resumida** (una columna a 360 px; tarjetas colapsables con `<details>`, abiertas las de combate):

```
┌ Aldric · Humano · Paladín 5 ───────── ●Guardado ┐   cabecera fija: nombre, clase/nivel, estado de guardado
│ PG  39 / 39   +temp 0     [−5][−1] [ 39 ] [+1][+5]│   HpControl (R176): entrada numérica; estado hpStatus
│ ─ Defensa ─────────────────────────────────────── │
│ CA 24   Toque 11   Despr. 24    Inic +0   Vel 20  │   cada número es un botón → BreakdownView (R178)
│ Fort +9  Ref +5  Vol +8     BAB +5   CMB +8 CMD 19│
│ ─ Ataques ─────────────────────────────────────── │
│ Espada larga +1   +9   1d8  19-20/x2              │   dados del arma (el daño total es de f6)
│ Sin armas         +8   1d3 nl.                    │
│ ─ Conjuros ────  N1 2/2 ○○    (tocar para gastar) │   SpellSlotsStrip (R180) + lista de preparados por nivel
│ ─ Usos ────────  Castigar 2/2  Imposición 5/5     │   CounterStrip
│ ─ Efectos activos ─ [Bendición +1 ✓] [Fatigado ✗] │   interruptores de `modifiers`
│ ▸ Dotes (3)   ▸ Habilidades (con rangos)  ▸ Capacidades (7)    ⚠ 2 avisos │   plegables, tocar = EntryDrawer
│ [ Subir de nivel ]  [ Detalle ]  [ Descanso ]     │
└───────────────────────────────────────────────────┘
```

**Hoja detallada:** `tablist` (Personaje | Habilidades | Dotes | Conjuros | Equipo) con barra de pestañas desplazable
horizontalmente (la página no); cada pestaña es una ruta. Contenido y requisitos: R185–R188 (Personaje: identidad y
puntuaciones con desglose y rasgos; Habilidades: 35 filas con `Stepper` de rangos; Dotes: lista + selector + capacidades;
Conjuros: ver §12; Equipo: inventario, carga, equipar, objetos mágicos).

**Escritorio (≥ 48 rem, `min-width`):** las tarjetas de la hoja resumida pasan a dos columnas (defensa/ataques a la izquierda,
conjuros/usos/efectos a la derecha) y el `EntryDrawer` es un panel lateral en vez de una hoja inferior.

**GM:** `/ficha` muestra la lista de todas las fichas (agrupadas por jugador, con clase/nivel); al abrir una, banner
«Solo lectura (GM)» y ningún control de edición (R170, R172). Las notas no existen para el GM.

### 14.5 Componentes compartidos (`src/web/components`)

| Componente | Contrato resumido | R |
|------------|-------------------|---|
| `markdown-lite` | `renderMarkdownLite(text): ReactNode` — bloques: párrafo, `#`/`##`, listas `-`/`1.`, tablas con tuberías; inline: `**b**`, `*i*`; el resto, texto; nunca HTML ni `href` | R159, R192 |
| `BreakdownView` | `{ breakdown, title }` — diálogo con líneas (nombre, tipo, valor con signo, estado con texto: «aplicada», «no se apila con X», «no cuenta en toque/desprevenido») y total | R178, R195 |
| `EntryDrawer` | `{ category, id }` — carga `detail` al abrirse; resumen ES (+«Borrador»), datos estructurados por categoría, texto EN rotulado, fuente, «Revisar texto» | R183, R184, R192 |
| `EntryChip` | nombre EN + ES si difiere + marcas | R130, R191 |
| `EntryPicker` | `{ category, filters, onPick, disabledIds? }` — búsqueda (250 ms), facetas, «Cargar más», estados | R189 |
| `SaveStatus` | región `role="status"` con el estado del motor | R167, R196 |
| `WarningList` | lista de `SheetWarning` con texto, severidad con etiqueta y enlace `path` | R104, R195 |
| `Stepper` | −/+ con valor, límites y `aria-label`s; objetivo táctil 44 px | R187 |
| `Tabs` | `tablist` con flechas, `aria-selected`, rutas | R185 |

### 14.6 i18n, estilo, accesibilidad

- Textos en `src/web/i18n/character/*.ts`, `notes.ts`, `rules.ts`, agregados en `es.ts` con una línea cada uno (así
  los lotes de UI no editan el mismo fichero). `es.errors` gana `revision_conflict`, `limit_reached`,
  `unknown_reference`, `invalid_state`. Los nombres de dotes/conjuros/objetos **no** se traducen en la UI de la app: salen
  del catálogo.
- CSS por lote en `src/web/styles/character-*.css` y `notes.css`, **solo con tokens `--ph-*`**; nada de colores
  literales (R194); estados con texto/icono (R195). Un test propio de la feature repite las comprobaciones de
  tokens de f1b sobre los CSS nuevos (R194) para no depender de que el de f1b recorra el directorio.
- A11y: pestañas con `role=tablist/tab/tabpanel`, diálogo con foco atrapado, regiones `status`/`alert`, objetivos de 44 px,
  teclado completo en `Stepper` y `HpControl`, sin información solo por color.
- Fidelidad: nombre EN principal, ES si difiere + «Borrador», texto EN rotulado, `needsReview` visible, enlace al aviso
  legal en el pie del shell.

## 15. Privacidad y eventos (contrato, sin implementar f5)

```ts
// src/server/characters/events.ts
export const CHARACTER_HP_EVENT = "character.hp";
export interface CharacterHpPayload { characterId: string; name: string;
  hp: { current: number; temporary: number; nonlethal: number; max: number | null } }
export function buildCharacterHpEvent(c: { id: string; ownerId: string; name: string; hp: HpSection }, max: number | null):
  RealtimeEvent<CharacterHpPayload>;   // resource {kind:"character", ownerId}; views {owner, gm}; SIN others
```

- `max` lo aporta quien publique (f5 lo calculará con `deriveSheet` y el catálogo en el servidor); el evento no calcula.
- `projectEventFor(policy, actor, event)`: propietario → vista `owner`; GM → vista `gm` (`gmRead=true`); otro jugador → `null`
  (no hay vista `others`, R199). Para `private_note` no se define ningún evento y `readAudience(gm, note)` es `none` (R200).
- No hay `RealtimeBus` ni SSE aquí (R201); f5 debe usar `projectEventFor` por conexión (contrato de f1).
- Nunca se filtran datos entre jugadores: ninguna ruta de lista de personajes devuelve fichas ajenas a un jugador (R31) ni
  hay endpoints «de grupo» para jugadores.

## 16. Estrategia de pruebas

### 16.1 Matriz

| Capa | Cómo | Fakes / dobles |
|------|------|----------------|
| `src/shared` (esquemas, ops, integridad, migraciones, `toSheetInput`) | unitarios puros; fixtures de `tests/helpers/character-fixtures.ts` | — |
| `src/rules` nuevo | tablas literales del Core + casos dorados (§16.2); propiedades de f2 (R73) | — |
| Stores | **suite de contrato** compartida: `InMemory*` (unit) y SQLite temporal (`*.int.test.ts`) | `tests/helpers/temp-db.ts` |
| Servicios | `CharacterService`/`NoteService`/`CatalogService` con stores en memoria, `FakeClock`, `InMemoryRulesDataSource` | de f1 y f3 |
| Rutas | `app.inject` sobre `composeApp` con `characterStores` en memoria y `rulesData` fake; **matriz de propiedad** con `describeOwnershipMatrix` (R27, R28) + variantes de escritura (R29, R30) | `makeTestApp` |
| Catálogo con datos reales | `JsonRulesDataSource` real en un test unitario sin red (R65, R70) | — |
| Motor de guardado | temporizadores y `online` falsos, `FakeCharacterApi` con revisión real (conflictos) | `tests/web/helpers/fake-character-api.ts` |
| Componentes | Testing Library + `user-event` (jsdom) con `AppServices` falsos y `derived-fixtures` (un `DerivedSheet` construido a mano); **no** invocan el motor real salvo en `wiring.test.tsx` | `fake-services.ts` ampliado |
| CSS / higiene | lectura de ficheros: tokens, `min-width`, 44 px, 1 rem; AST de TS: sin `src/data`, sin storage, sin textos literales | — |
| Trazabilidad | `project/traceability-f4.test.ts`: cada `R<n>` aparece en el título de algún test (R202) | — |
| Integración | `character-flow.int.test.ts` (servidor + SQLite + dataset real), `web/character-ui.int.test.ts` (cliente HTTP real contra servidor real), `web/bundle.int.test.ts` ampliado | `fx` de f1 |

Cada `it` lleva `R<n>` en el título (convención de f0/f1). Los tests de DOM empiezan con `// @vitest-environment jsdom`
(f1b). Ningún test unitario usa red ni BD real (R203).

### 16.2 Casos dorados de `deriveSheet` (aritmética del Core; R120)

Los resultados se calcularon a mano con las reglas del Core y los datos de f3 (leídos del repo). El implementer los
convierte en fixtures (`tests/rules/fixtures/sheet-golden.ts`) **conservando la aritmética en comentarios**; si un dato
real discrepa, lo anota y NO ajusta el test sin explicación. Además añade un arquetipo por cada clase restante
(bárbaro: movimiento rápido y esquiva asombrosa; bardo: espontáneo y fallo arcano; pícaro: penalizador de armadura;
cazadora; clérigo con dominio) con la misma disciplina; el reviewer los contrasta.

**G1 — Aldric, humano, paladín 5, LG** (R91, R107, R108)

- Base 15/10/12/8/10/14 (Fue/Des/Con/Int/Sab/Car); elección racial Car (+2); aumento de nivel 4: Fue → efectivas
  **16 (+3) / 10 (0) / 12 (+1) / 8 (−1) / 10 (0) / 16 (+3)**.
- PG: nivel 1 = 10 (máx. d10), niveles 2–5 = 6 (promedio) → 34; Con +1 × 5 → **39**.
- Equipo: `full-plate` +1 (armadura), `heavy-steel-shield` +1 (escudo), `longsword` +1 (mano principal), `ring-of-protection`
  `plus-1` (anillo 1), `cloak-of-resistance` `plus-1` (hombros, 1 lb), mochila personalizada 20 lb, 100 po (2 lb).
  Pesos: 50 + 15 + 4 + 0 + 1 + 20 + 2 = **92 lb**; Fue 16 → 76/153/230 ⇒ **carga media** (Des máx. +3, −3).
- Armadura: bonificador 9 + 1 = **10**, Des máx. +1, penalizador −6 → **−5** (mágica); escudo 2 + 1 = **3**, −2 → **−1**.
  Penalizador de armadura de habilidades = peor(armadura+escudo = 6, carga = 3) = **−6**.
- **CA 24** (10 + 0 Des + 10 + 3 + 1 desvío), **toque 11**, **desprevenido 24**, **toque-desprevenido 11**.
- Salvaciones: Fort = 4 + 1 + 3 (gracia divina) + 1 (resistencia) = **9**; Ref = 1 + 0 + 3 + 1 = **5**; Vol = 4 + 0 + 3 + 1 =
  **8**. Iniciativa **+0**. BAB **+5**; CMB = 5 + 3 = **8**; CMD = 10 + 5 + 3 + 0 + 1 = **19**.
- Ataque espada larga +1 = 5 + 3 + 1 = **+9** (competente: marcial); 1d8, 19–20/×2. Sin armas = 5 + 3 = **+8**, 1d3 no letal.
- Velocidad: base 30; armadura pesada → 20; carga media → 20 ⇒ **20**.
- Habilidades: Diplomacia (de clase) 5 rangos + Car 3 + 3 = **11**; Trepar 0 rangos: Fue 3 − 6 = **−3**.
- Conjuros (paladín 5): nivel 1 base 1 + adicional 1 (Car +3) = **2**; NL = 5 − 3 = **2**; CD = 10 + 1 + 3 = **14**;
  concentración = 2 + 3 = **+5**. Contadores sugeridos: castigar el mal **2**, imposición de manos **5** (⌊5/2⌋ + 3).

**G2 — Mirel, humana, druida 5, N** (R84, R98, R110)

- Base 10/12/14/12/16/8; elección racial Sab; aumento de nivel 4: Sab → efectivas **10 (0) / 12 (+1) / 14 (+2) / 12 (+1) /
  19 (+4) / 8 (−1)**. Dotes: `toughness` (humano) y `alertness`.
- PG: 8 + 4 × 5 = 28; Con +2 × 5 = +10 → 38; `toughness` +3 + (5 − 3) = +5 ⇒ **43**.
- BAB (3/4) **+3**; salvaciones base 4 / 1 / 4 → con `cloak-of-resistance` `plus-1`: Fort 4 + 2 + 1 = **7**, Ref 1 + 1 + 1 = **3**,
  Vol 4 + 4 + 1 = **9**.
- Equipo: `leather` (+2, Des máx. +6, penalizador 0, 15 lb), `light-wooden-shield` (+1, −1, 5 lb), `scimitar` 4 lb, capa 1 lb,
  mochila 5 lb ⇒ 30 lb ⇒ **carga ligera** (Fue 10 → 33/66/100). **CA 14** (10 + 1 + 2 + 1), **toque 11**, **desprevenido 13**,
  **toque-desprevenido 10**. Penalizador de armadura **−1** (solo el escudo). Velocidad **30**.
- Habilidades: Percepción 5 rangos + Sab 4 + 3 (de clase) + 2 (`alertness`) = **14**; Supervivencia 5 + 4 + 3 + 2
  (sentido de la naturaleza) = **14**; Sigilo (no de clase) 2 + Des 1 − 1 = **2**; Averiguar intenciones 0 + 4 + 2 = **6**;
  Conocimiento (naturaleza) 5 + 1 + 3 + 2 = **11**; `spellcraft` (solo entrenada) con 0 rangos: **no usable**.
- Conjuros (Sab 19, +4): base [4, 3, 2, 1] + adicionales (nivel 1: 1; 2: 1; 3: 1) = **[4, 4, 3, 2]**; CD nivel 1/2/3 =
  **15 / 16 / 17**; NL 5; concentración **+9**. Forma salvaje: **1/día**.
- **Variante G2b:** añadir 10 lb de equipo (40 lb) ⇒ **carga media**: penalizador de armadura = peor(1, 3) = **−3** (no −4:
  no se acumulan), velocidad 30 → **20**, Des máx. min(6, 3) = 3 (sin efecto: Des +1).

### 16.3 Otros casos de prueba imprescindibles

- **Propiedad:** A crea → B 404 (idéntico a inexistente) en `GET/PATCH/archive/restore/DELETE`; GM lee (200) y no escribe (403);
  anónimo 401; nota de A → B y GM 404 idéntico; el listado del GM no contiene ninguna nota de jugador.
- **Conflicto:** dos clientes con la misma `baseRevision`; el primero edita `inventory`, el segundo `daily` (ambos se
  aplican); el segundo edita `inventory` (409); reintento idéntico (200 sin bump).
- **Catálogo:** `q` con diacríticos («pocion», «Pocion»), prefijos, filtros de conjuros (`classId=druid&level=3`), paginación
  estable, `ids` con huecos, ETag/304, ningún `textEn` en índice y `core` recorriendo **todas** las entradas reales.
- **Objetos:** los 26 incompletos devuelven `incomplete`; `cloak-of-resistance` expande `save.all`; `amulet-of-natural-armor`
  pliega; `bracers-of-armor` +1 con armadura +10 queda suprimido por el tipo `armor`; cinturón de fuerza +2 sube la Fue y la carga.
- **Reglas:** tabla de carga 1–29; conjuros adicionales 12–45; límites de `hpStatus`; `iterativeAttacks`; `dailyUses`; filas de
  `FEAT_EFFECTS`/`PASSIVE_FEATURES` contrastadas con los textos del dataset; cada código de `SheetWarning` con caso positivo
  y negativo; `armorClass` de f2 intacta sin la opción nueva.
- **UI:** escenarios de R135–R190 con fakes; accesibilidad de pestañas y diálogo; textos solo en i18n; sin `console`.

### 16.4 Qué NO puede verificarse sin humano en navegador

Estética real, responsive en pantallas reales, teclado numérico en móvil, tacto de los botones ±, comportamiento de la hoja
inferior sobre el notch, modo oscuro percibido, anuncios de lectores de pantalla, conflicto real entre dos pestañas, pérdida
de red real, lentitud en 3G, y la fidelidad percibida de los números frente a una hoja en papel. Va a §17.

## 17. Checklist de verificación manual (humano; ~30 min)

Prerrequisitos: f1 y f1b funcionando (`npm run create-gm`, `npm run dev`, cuentas de dos jugadores A y B creadas por el
GM); abrir `http://localhost:5173`; dos perfiles de navegador (A y B) y una ventana para el GM. Datos reales de f3.

1. **Crear (A).** `/ficha` → «Crear personaje»: el asistente calcula PG y CA; «Crear» abre la hoja. Comparar los números
   con una hoja en papel del jugador (CA, salvaciones, iniciativa, ataque).
2. **Resumen.** Cambiar PG con ±1/±5 y a mano; llegar a 0 y a negativo (estado «incapacitado/muriendo»); PG temporales.
   Tocar CA/Fort/ataque: el desglose muestra cada línea, tipo y por qué una línea no cuenta.
3. **Manual a un toque.** Tocar una dote, un conjuro y una capacidad de clase: el panel muestra el resumen en español (con
   «Borrador»), el texto del manual en inglés y la fuente; «atrás» cierra; recargar con `?ver=` lo reabre.
4. **Equipo.** Añadir armadura, escudo, arma, anillo de protección, capa de resistencia, un objeto «sin efectos
   automáticos» (p. ej. *Manual of Bodily Health*) y uno personalizado; equipar/desequipar y cambiar de hueco; comprobar CA,
   salvaciones, peso, carga (barra y umbrales) y velocidad; ocupar los dos anillos y probar un tercero.
5. **Conjuros.** Preparar, usar (el nivel 0 no se gasta), «Descanso»; en el bardo, gasto por nivel. Contadores sugeridos y
   su reinicio.
6. **Subida de nivel.** Subir un nivel con PG por promedio, tirada manual y máximo; provocar advertencias (rangos de más,
   dote sin prerrequisito) y comprobar que se puede confirmar igual; editar el historial; quitar el último nivel.
7. **Autoguardado y offline.** Observar «Guardando…/Guardado»; DevTools → Offline: editar, ver «Sin conexión» y que, al volver
   la red, se guarda; intentar cerrar la pestaña con cambios pendientes.
8. **Conflicto.** Dos pestañas de A: editar la **misma** sección en ambas; la segunda muestra el panel y las dos salidas
   funcionan; editar **secciones distintas**: no hay conflicto.
9. **Privacidad.** B abre la URL de la ficha de A: «Ficha no encontrada». Notas: A crea una; B no la ve; el GM entra en
   `/notas` (vacío o solo las suyas) y, con la URL de la API de la nota de A en la barra de direcciones, recibe 404.
10. **GM.** `/ficha` lista todas las fichas; abrir la de A: banner «Solo lectura», sin controles; cambiar a otro jugador.
11. **Móvil** (360×640 en DevTools y teléfono real vía LAN, `AUTH_ALLOWED_ORIGINS`): sin scroll horizontal, objetivos de 44 px,
    teclado numérico en PG y rangos, hoja inferior y pestañas desplazables, barra de navegación no tapa contenido.
12. **Escritorio** (≥ 768 px): dos columnas en el resumen, panel lateral para el manual.
13. **Modo oscuro** y **teclado/lector:** foco visible, pestañas con flechas, diálogo con foco atrapado, anuncios de estado.
14. **Red.** Pestaña Network: el bundle inicial no contiene datos de reglas; el índice y `core` no incluyen texto del manual;
    el texto solo se pide al abrir el panel; los repetidos devuelven 304; la hoja carga en 3G rápido en un tiempo razonable.
15. **Fidelidad.** Contrastar 5 números al azar con el SRD; revisar que los nombres españoles solo aparecen si difieren y con
    «Borrador»; revisar las marcas «Revisar texto» de objetos `needsReview`.
16. **Apariencia.** Valorar a ojo coherencia visual, densidad de información en combate y legibilidad.

**Quién verifica qué:** el implementer de cada lote de UI rellena `progress/manual_f4-character-sheet.md` indicando lo que **no**
pudo ejecutar (todos los pasos de navegador). Antes de proponer el cierre, el **leader** repasa los pasos 1–10 y 14 con un
navegador si dispone de herramienta (no es obligatorio: los agentes del repo no tienen navegador), y entrega la lista
completa al humano, que confirma o anota fallos. El reviewer exige la presencia del fichero (R206), no su contenido visual.

## 18. Enmiendas a features cerradas o en spec

| Feature | Enmienda | Motivo |
|---------|----------|--------|
| f1 (`done`) | `src/shared/auth.ts`: `ErrorCode += revision_conflict \| limit_reached \| unknown_reference \| invalid_state` (aditivo); `compose.ts`: stores/servicios/rutas nuevos, `ComposeOverrides += characterStores, rulesData`; `migrations.ts`: 002 y 003; `docs/architecture.md` §4 (CharacterStore/NoteStore ya listados) y §6 (reglas `character`/`private_note`) | contratos previstos por f1 para futuras features |
| f1b (`spec_ready`) | `http-client.ts`: método `DELETE`; `schemas.ts`: lista de códigos de error ampliada; `services.tsx` y `fake-services.ts`: módulos nuevos; `es.ts`: bloques nuevos; el test de higiene/tokens debe recorrer también `features/character|notes` y `styles/character-*.css` | f1b ya anuncia que «las features futuras añaden sus módulos de API» |
| f2 (`done`) | `armor-class.ts`: opción `keepsDexWhenFlatFooted`; `result.ts`: códigos de error aditivos; **resuelve** OQ-4 (clamp a 1 + aviso) y OQ-5 (peor cifra) para f4 | aditivo; los tests de f2 siguen verdes |
| f3 (`done`) | **Ninguna.** `known-gaps.ts` vive en el servidor; los datos no se editan | no reabrir f3 |
| `feature-list.json` | **Lo hace el leader:** añadir `f1b-auth-ui` a `depends_on` de f4 | la UI de f4 no puede implementarse sin el shell |

## 19. Preguntas abiertas (decide el humano; el spec asume la recomendación)

| # | Pregunta | Recomendación por defecto (asumida) | Si se decide lo contrario |
|---|----------|-------------------------------------|---------------------------|
| Q1 | ¿Cuántas fichas activas por jugador? | **1** activa + archivadas; GM sin límite | Subir `MAX_ACTIVE_PLAYER`; ajustar R34 y la pantalla `/ficha` (selector de ficha) |
| Q2 | ¿Puede el GM editar fichas? | **No** (`gmWrite=false`); f5 definirá cómo toca PG de combate | `gmWrite=true` + modo edición del GM (R29, R170) |
| Q3 | PG por nivel: ¿promedio o tirada? | **Promedio prerrellenado** (`dado/2+1`) editable por tirada o valor; nivel 1 = máximo; se guarda el método. Razón: la app no tira dados y el promedio evita errores; el jugador que tiró en mesa lo teclea | Preseleccionar «tirada» o solo promedio |
| Q4 | ¿Autoguardado o botón? | **Autoguardado** con estado visible y control de versión por sección | Botón «Guardar» (se pierde con facilidad en combate) |
| Q5 | ¿Cola offline persistente (IndexedDB)? | **No** (f1b R85); aviso al cerrar la pestaña | Enmendar R85 para datos no sensibles y persistir la cola |
| Q6 | Redondeo del multiplicador de tamaño de la carga | **Hacia abajo** (verificar con el SRD) | Redondeo al más cercano |
| Q7 | Puntuación efectiva < 1 (OQ-4 de f2) | **Se trata como 1** con aviso `ability_zero` (la ficha no calcula «muerto/inconsciente») | Estado propio con valores derivados vacíos |
| Q8 | Armadura vs. carga (OQ-5 de f2) | **La peor cifra, sin acumular** (verificada en f2) | — |
| Q9 | Presupuesto de rangos e Int retroactiva | **Aviso informativo** con la Int actual; sin bloqueo | Regla exacta cuando el humano la confirme |
| Q10 | Nombres en español (Q2 de f3) | **Nombre inglés principal**; español solo si difiere y con «Borrador» | Mostrar el español cuando se revise el glosario |
| Q11 | Objetos `needsReview` | **Se pueden usar** con marca «Revisar texto» | Ocultarlos hasta revisión |
| Q12 | ¿f4 depende de f1b? | **Sí** (el leader lo añade a `depends_on`) | Implementar la UI sobre un shell provisional (no recomendado) |
| Q13 | Pociones/pergaminos/varitas/aceites (Q11 de f3) | **Objetos personalizados** | Cuando f3 los incorpore, entrarán como catálogo sin cambiar el modelo |
| Q14 | Experiencia (XP) | **No se modela** | Campo `xp` en `identity` |
| Q15 | Materiales especiales, compañeros animales, familiares, monturas (Q14 de f3) | **Fuera**; peso manual y notas | Feature propia tras ampliar f3 |
| Q16 | Trucos/oraciones no se gastan | **Sí** (verificar con el SRD) | Seguimiento por lanzamiento |
| Q17 | Dotes y capacidades con efecto automático | **Tabla curada** (≈ 17 dotes y 6 capacidades, R98/R99); el resto, modificador manual | Ampliar la tabla o esperar a f7 |
| Q18 | Contadores con máximo automático | **8 capacidades** (R101); el resto, manual | Ampliar `dailyUses` |
| Q19 | Libro de conjuros / hechicero / mago | **Fuera** (no existen en f3) | Versión 2 del esquema + ampliar f3 |
| Q20 | PG actuales al subir de nivel | **Aumentan en lo ganado** | No tocar los PG actuales |
| Q21 | Borrado de fichas | **Archivar** siempre; **borrar** solo archivadas | Sin borrado |
| Q22 | Excepción al `no-store` para el catálogo | **Sí** (`private, no-cache` + `ETag`), acotada a `/api/rules` | Mantener `no-store` y servir siempre el cuerpo |
| Q23 | Competencia racial con armas (familiaridad) | **`unverified` + aviso suave**, no penaliza | Estructurar los rasgos raciales en f3 |
| Q24 | Notas: ¿una o varias? | **Varias** (≤ 200) con vínculo opcional a la ficha | Una nota única por ficha |

## 20. Alternativas descartadas

- **Guardar derivados (PG máximos, CA…) en la BD.** Se desincronizan al cambiar un dato o al corregir una regla en `src/rules`;
  calcularlos siempre garantiza que un arreglo de reglas corrige todas las fichas (prioridad nº1: corrección).
- **Calcular los derivados en el servidor y devolverlos en la API.** Cada edición exigiría una ida y vuelta antes de ver el
  número, no funcionaría con la red caída y obligaría al servidor a conocer la entrada completa de cada edición no guardada.
  Con una función pura compartida, el servidor *puede* calcular (f5) sin que la UI dependa de él.
- **Copiar el texto de reglas en la ficha.** Duplica 5 MB, congela erratas y rompe «un dato, una fuente» (R2).
- **Una tabla SQL por sección o ORM.** 7 jugadores y documentos de < 40 KiB: JSON por documento con control por sección es
  más simple de migrar y de probar; las consultas necesarias (por propietario y estado) las cubre el índice.
- **Revisión global única.** Obligaría a recargar y reintentar cada vez que otro dispositivo toca *cualquier* cosa (p. ej. gasta un
  conjuro mientras se edita el inventario). **Último-que-escribe-gana:** pierde cambios en silencio. **CRDT/OT:** desproporcionado.
- **Botón «Guardar».** En combate se olvida; el autoguardado con estado visible y conflicto explícito es más seguro.
- **IndexedDB/localStorage para la cola offline.** Contradice f1b R85 (que protege el PIN) y añade invalidación de caché; se deja
  como pregunta (Q5).
- **Servir el dataset como chunks de JSON dentro del bundle.** Descarga categorías enteras para mostrar unas pocas entradas,
  duplica validación y rompe R73 de f1b; el catálogo paginado con texto bajo demanda lo evita.
- **Importar `src/data` en `src/web`.** Prohibido por f1b R73 y arrastra 5 MB al bundle.
- **Un endpoint que devuelva la ficha con todos los datos de reglas incrustados.** Acopla la forma de la ficha al catálogo y
  no sirve para el selector (que necesita búsqueda); `ids` + `view=core` da el mismo resultado con una caché reutilizable.
- **Nombrar `RulesDataSource` al puerto del cliente.** Ya existe con ese nombre en `src/data` (servidor); se usa
  `RulesCatalogApi` para evitar confusión y mantener la prohibición de importar `src/data`.
- **Que el GM edite fichas.** Riesgo de pisar la edición del jugador y de confundir la autoría; no lo pide `acceptance`.
- **Notas dentro de la ficha.** El GM leería las notas al leer la ficha; una entidad aparte permite `gmRead=false` sin código
  especial en la política.
- **Librería de Markdown + sanitizador.** Dependencia y superficie XSS para 5 construcciones de sintaxis; el renderizador propio
  produce nodos de React sin HTML.
- **Historial de cambios por campo (log de auditoría).** Coste de almacenamiento y de UI sin necesidad: `levels[]` ya es el
  historial por nivel y `revision` protege la concurrencia.
- **Bloquear pasos inválidos en la subida de nivel.** El humano pidió «editable y nunca bloquear»; las reglas se comunican como
  advertencias y el jugador decide (la mesa puede tener reglas de la casa).
- **Aplicar automáticamente todos los efectos de dotes/capacidades.** Es el trabajo de f7; aquí solo una tabla curada y
  contrastada, y el modificador manual para el resto.
- **Variable de entorno para el límite de fichas.** Es regla de producto, no de despliegue; añadir claves al `.env.example`
  obliga a tocar tests de f0/f1.
- **Un solo gran lote de implementación.** Imposible de revisar; se parte en lotes disjuntos (§21).

## 21. Estimación, lotes y coordinación

**Tamaño: XL** (≈ 2,5× f1 + f2 juntas): ≈ 206 requisitos; ≈ 110 ficheros nuevos en `src/` (≈ 12 shared, ≈ 20 rules, ≈ 20 server,
≈ 60 web) y ≈ 140 ficheros de test; ≈ 4 000 líneas de tests de reglas con tablas del Core. Sin dependencias nuevas.
**Debe implementarse en tres olas** con revisión entre ellas (el reviewer valida cada ola contra sus R antes de seguir).

**Reglas de coordinación (`parallel_policy`):** cada lote toca **solo** sus ficheros; los ficheros compartidos
(`compose.ts`, `migrations.ts`, `es.ts`, `services.tsx`, `rules/index.ts`, `shared/index.ts`, `auth.ts`) los modifica **únicamente el Lote 0**,
que deja *stubs que compilan* (los tests de cada lote los hacen pasar). Ningún lote ejecuta `npm ci`/`npm install` (no hay
dependencias nuevas); cada uno escribe `progress/impl_f4-character-sheet_<lote>.md` (qué hizo, R→test, reglas verificadas con
URL, dudas) y devuelve solo la referencia (regla anti-teléfono-descompuesto).

| Lote | Contenido | Ficheros propios | Depende de | En paralelo con | R |
|------|-----------|------------------|------------|-----------------|---|
| **L0** Cimientos (secuencial) | Esquemas y DTO compartidos, `ErrorCode`, interfaces de stores **y sus suites de contrato**, tipos `rules/sheet/types.ts` + stubs de todas las firmas, migraciones 002/003, cableado de `compose.ts` con stubs, módulos de API web (interfaz + implementación sobre `HttpClient`), `DELETE` en el cliente HTTP, `AppServices`, fakes base, `es.ts` y esqueletos de i18n/CSS, fixtures de personaje | `src/shared/**` (salvo `character-sheet.ts`), `src/server/stores/{character,note}-store.ts`, `tests/server/stores/*.contract.ts`, `migrations.ts`, `compose.ts`, `src/server/characters/kinds.ts`, `src/rules/sheet/types.ts` + stubs, `src/web/api/*.ts`, `src/web/i18n/**` (esqueletos), `tests/helpers/**`, `tests/web/helpers/**` | f1, f2, f3 (f1b para lo web) | — | R1–R12, R13–R21 (interfaces + suites), R22, R25, R36 (cableado), R51, R57 (esquemas), R73 (base), R104 (tipo), R119 (firma), R161, R162 |
| **LR** Reglas | Todo `src/rules` nuevo, `deriveSheet`, `toSheetInput`, advertencias, casos dorados | `src/rules/**`, `src/shared/character-sheet.ts`, `tests/rules/**`, `tests/shared/character-sheet.test.ts` | L0 | LS*, LW* | R73–R120, R122, R124–R128, R134 (parte de reglas), R136, R148–R149 y R153 (advertencias), R152 |
| **LS1** Personajes (servidor) | Stores InMemory/SQLite de personajes, servicio, referencias, rutas, autorización, eventos | `src/server/stores/{in-memory,sqlite}/*character*`, `src/server/characters/**`, `src/server/http/routes/character-routes.ts`, tests | L0 | LR, LS2, LS3, LW* | R13–R19, R21–R27, R29, R31, R33, R34, R37–R50 (cuerpos de personajes), R53–R55, R198–R201 |
| **LS2** Notas (servidor) | Stores de notas, servicio, rutas | `src/server/stores/{in-memory,sqlite}/*note*`, `src/server/notes/**`, `note-routes.ts`, tests | L0 | LS1, LS3, LR, LW* | R12 (uso), R13 (contrato de notas), R20, R28, R30, R32, R35, R50 (cuerpos de notas), R52, R154–R157, R160 |
| **LS3** Catálogo (servidor) | Servicio, búsqueda, vistas `core`, known-gaps, rutas, ETag | `src/server/catalog/**`, `rules-routes.ts`, tests | L0 | LS1, LS2, LR, LW* | R56–R72 |
| **LW0** Base web | `CatalogCache`, `useDerivedSheet`, `CharacterEditor`, secciones y rutas, páginas `SheetPage`/`CharacterHome`, modo solo lectura, higiene | `src/web/features/character/{section,routes,sheet-page,character-list-page}.tsx`, `data/**`, `features/notes/section.tsx`, `tests/web/hygiene/**` (ampliación), tests | L0, f1b | todos los de servidor y LR | R163–R174 |
| **LW1** Componentes | `markdown-lite`, `BreakdownView`, `EntryDrawer`, `EntryChip`, `EntryPicker`, `SaveStatus`, `WarningList`, `Stepper`, `Tabs`, estilos base | `src/web/components/**` (los de §14.5), `src/web/styles/character-common.css`, tests | L0, f1b | LW0, servidor, LR | R130, R159, R178, R183, R184, R189, R191, R192, R194–R196 |
| **LU1** Hoja resumida | `HpControl`, defensas, ataques, tiras de conjuros y contadores, efectos, listas rápidas, `SummaryView` | `features/character/summary/**`, `styles/character-summary.css`, i18n `summary.ts`, tests | LW0, LW1 | LU2, LU4, LU5, LU6 | R176–R182, R190 (resumen) |
| **LU2** Detalle A | Pestañas Personaje, Habilidades, Dotes (+ capacidades de clase y dominios) | `features/character/detail/**`, `styles/character-detail.css`, i18n `detail.ts`, tests | LW0, LW1 | LU1, LU4, LU5, LU6 | R185–R188 |
| **LU3** Conjuros y usos | Pestaña Conjuros, selector de conjuros, huecos, dominios, descanso, contadores | `features/character/spells/**`, `features/character/uses/**`, i18n `spells.ts`, tests | LU1 (tiras compartidas), LW0, LW1 | LU4, LU5, LU6 | R144–R153 |
| **LU4** Inventario | Pestaña Equipo, tarjetas, equipar, peso/carga, objetos mágicos, modificadores vinculados | `features/character/inventory/**`, `styles/character-inventory.css`, i18n `inventory.ts`, tests | LW0, LW1 | LU1–LU3, LU5, LU6 | R121, R123, R129–R134 (UI) |
| **LU5** Creación y nivel | Asistente de creación, asistente de nivel, historial, opciones de capacidades | `features/character/{create,levelup}/**`, `styles/character-levelup.css`, i18n `levelup.ts`, tests | LW0, LW1, LR (preview real en `wiring`) | LU1–LU4, LU6 | R135–R143 |
| **LU6** Notas (UI) | Página y editor de notas | `features/notes/**` (salvo `section.tsx`), `styles/notes.css`, i18n `notes.ts`, tests | LW0, LW1 | LU1–LU5 | R158, R159 (uso) |
| **LZ** Integración y cierre (secuencial) | Tests de integración, bundle, trazabilidad, docs, checklist, cierre | `tests/**/*.int.test.ts`, `tests/project/traceability-f4.test.ts`, `docs/**`, `README.md`, `progress/manual_f4-character-sheet.md` | todos | — | R36, R175, R190 (revisión global), R193, R197, R202–R206 |

**Olas recomendadas (puertas de revisión humana opcionales entre ellas):**

1. **Ola 1 — servidor y reglas:** L0 → {LR, LS1, LS2, LS3} en paralelo. Entrega: API completa, catálogo y reglas probadas (utilizable con
   `curl`); el reviewer valida R1–R72 y R73–R120.
2. **Ola 2 — UI base y resumen:** {LW0, LW1} → {LU1, LU2, LU6}. Entrega: ver y editar la ficha, resumen de combate y notas.
3. **Ola 3 — resto de la UI y cierre:** {LU3, LU4, LU5} → LZ. Entrega: conjuros/usos, inventario/objetos, creación/nivel, integración y checklist.

La Ola 2 y la 3 requieren **f1b implementada** (shell, cliente HTTP, `AppServices`). Si f1b no está lista, la Ola 1 puede avanzar sola.

**Riesgos y mitigaciones:** (1) cifras del Core de la tabla §9.3 marcadas «verificar»: se verifican en la Ola 1, antes de que la UI las
muestre; (2) tamaño de los lotes de UI: cada uno tiene un tope de ficheros y un único `section`/ruta; (3) deriva entre
`toSheetInput` y `deriveSheet`: test de extremo a extremo con los casos dorados desde un `CharacterSections` completo y un catálogo
fake construido con datos reales (`wiring.test.ts`); (4) SQLite `DatabaseSync` síncrono: `applyPatch` atómico, probado con
interleavings simulados; (5) crecimiento del documento: tope 256 KiB y límites por colección.

