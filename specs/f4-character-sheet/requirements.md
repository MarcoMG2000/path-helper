# Requirements — f4-character-sheet

> Feature: **Ficha de personaje, inventario y notas privadas** (`sdd: true`; `depends_on` en
> `feature-list.json`: f1, f2, f3; **dependencia adicional de facto: f1b-auth-ui**, ver `design.md` §21).
> Notación EARS (ver `docs/specs.md`). Cada `R<n>` es estable y verificable con al menos un test (columna
> _Test_; las rutas son relativas a `tests/` salvo que se indique otra cosa). Los puntos abiertos están en
> `design.md` §19 (Q1–Q22) con su recomendación por defecto; **este documento asume esas recomendaciones**.
> Las reglas de Pathfinder 1e que esta feature añade a `src/rules` están en `design.md` §9.3 con su cita del
> Core y su grado de certeza («verificar contra SRD» = el implementer DEBE contrastarla con el SRD antes de
> fijar el test, y anotar el resultado en `progress/impl_f4-character-sheet_<lote>.md`).

## 1. Contexto y alcance

Cada uno de los 7 jugadores (druida, pícaro, cazadora, bárbaro, paladín, bardo, clérigo; nivel 5, casi 6, con
objetos mágicos del Core ya poseídos) necesita **su** información accesible y resumida en el móvil, con el
texto del manual a un toque, para ver rápido en combate sus opciones (dotes, conjuros, habilidades, usos), y
poder modificarla al subir de nivel o por cualquier cambio. El GM puede consultar cualquier ficha, **no** las
notas privadas (decisión del humano, 2026-10-16).

**Dentro de alcance:**

- Modelo de datos del personaje (`src/shared`), persistencia SQLite tras `CharacterStore`/`NoteStore` con fakes
  y suites de contrato, endpoints REST `/api/characters…` y `/api/notes…` con la política de f1.
- Catálogo de reglas **de solo lectura** (`/api/rules/…`) sobre el `RulesDataSource` de f3, paginado y con
  búsqueda, sin descargar el texto largo hasta que se pide.
- Extensión **pura** de `src/rules`: carga y velocidad, PG, conjuros por día / CD, CMB/CMD, ataque base por
  arma, avance de nivel, advertencias, y el ensamblador `deriveSheet` que produce todos los derivados con su
  `Breakdown`.
- UI en español mobile-first sobre el app shell de f1b (sección `features/character` y `features/notes`):
  vista resumida («de combate») y detallada, inventario con peso/carga y equipo, objetos mágicos con efectos,
  conjuros y usos diarios, creación y subida de nivel editable, notas privadas.
- Contrato de evento `character.hp` (solo el contrato y su filtro con `projectEventFor`).

**Fuera de alcance:** calculadora de ataque/daño con modificadores activos (f6: ataque poderoso, flanqueo,
daño total, críticos), capacidades de clase como modificadores activables (f7: furia, castigar el mal…; aquí
solo contadores de usos y su texto), combate/iniciativa en tiempo real y SSE (f5), compendio (f8), despliegue
(f9), clases/dotes de otros libros, hechicero/mago y su libro de conjuros (no existen en f3, Q15 de f3),
pociones/varitas/aceites como entradas de catálogo (no existen en f3, Q11 de f3: se registran como objetos
personalizados), compañeros animales/familiares/monturas y materiales especiales (Q14 de f3), puntos de
experiencia, tiradas de dados dentro de la app, y almacenamiento en el navegador (f1b R85).
**Puntos de enganche reservados** para f5/f6/f7: sección `modifiers` (modificadores manuales/efectos con
interruptor `active`), contadores de uso (`features.counters` + `daily.counters`) y el evento `character.hp`.

## 2. Glosario

- **Sección:** unidad de guardado y de control de versión del personaje (`identity`, `abilities`, `levels`,
  `hp`, `skills`, `feats`, `features`, `spellcasting`, `inventory`, `daily`, `modifiers`).
- **Revisión:** entero que crece en 1 con cada guardado que cambia algo; `sectionRevs[s]` es la revisión en
  que cambió por última vez la sección `s` (control de versión optimista por sección).
- **Derivado:** valor calculado por `src/rules` (CA, salvaciones, PG máximos…); nunca se guarda.
- **Core / vista `core`:** proyección estructurada y sin texto largo de una entrada del catálogo (lo que
  necesita la lógica); **Detalle:** la entrada con el `textEn` del manual.
- **Hoja resumida / detallada:** vista «de combate» de una pantalla / ficha completa por pestañas.
- **Hueco:** posición de equipo del Core (`armor`, `shield`, `ring1`, `ring2`, `belt`…, `mainHand`, `offHand`).
- **Modificador manual:** modificador tipado que el jugador añade a mano (objeto sin efectos estructurados,
  conjuro temporal, estado); puede vincularse a un objeto.
- **Descanso:** reinicio de conjuros usados y de contadores con `resetOn: "rest"`.

## 3. Requisitos

### 3.1 Modelo de datos compartido (`src/shared`)

- **R1.** El sistema DEBE definir el documento de personaje como un esquema zod estricto de versión 1 formado
  exactamente por las secciones `identity`, `abilities`, `levels`, `hp`, `skills`, `feats`, `features`,
  `spellcasting`, `inventory`, `daily` y `modifiers`, y rechazar cualquier clave desconocida en cualquier
  nivel. _Test:_ `shared/character.test.ts`.
- **R2.** El sistema DEBE referenciar los datos de reglas únicamente por id (kebab-case de f3, o id de
  capacidad `<clase>.<slug>`) y NO DEBE almacenar copias del texto de reglas: ningún campo del esquema se
  llama como un campo de texto de f3 (`textEn`, `benefit`, `normal`, `special`, `summaryEs`, `shortDescriptionEn`)
  y todo texto libre tiene longitud máxima declarada. _Test:_ `shared/character.test.ts` (recorre el esquema).
- **R3.** El sistema DEBE acotar el documento: nombre de personaje de 1 a 64 caracteres sin caracteres de
  control, como máximo 20 niveles, 80 habilidades, 60 dotes, 300 objetos, 120 conjuros preparados y 120 conocidos
  por clase, 40 contadores y 60 modificadores manuales, y rechazar un documento cuyo JSON canónico supere
  256 KiB. _Test:_ `shared/character.test.ts` (cada límite en el límite y en el límite + 1).
- **R4.** El sistema DEBE validar las puntuaciones base de característica como enteros de 1 a 45, los PG
  actuales como entero (admite negativos hasta −99) y los PG temporales y no letales como enteros ≥ 0.
  _Test:_ `shared/character.test.ts`.
- **R5.** Cada entrada de `levels` DEBE llevar una `classId` de las 7 clases de la campaña (`PARTY_CLASS_IDS`),
  `hp` entero de 0 a 99 o `null` (= estimado), `hpMethod` ∈ {`max`, `rolled`, `average`, `manual`},
  `favoredBonus` ∈ {`hp`, `skill`, `none`} y `abilityIncrease` (id de característica o `null`). _Test:_
  `shared/character.test.ts`.
- **R6.** Todo id de entidad propia del personaje (objeto, dote, contador, hueco de conjuro preparado,
  modificador manual) DEBE ser un UUID, y `validateCharacterIntegrity` DEBE rechazar ids repetidos dentro de
  cada tipo con el error `duplicate_id`. _Test:_ `shared/character-integrity.test.ts`.
- **R7.** SI un modificador manual referencia un `itemId` que no existe en el inventario, ENTONCES
  `validateCharacterIntegrity` DEBE devolver el error `modifier_item_missing`. _Test:_
  `shared/character-integrity.test.ts`.
- **R8.** El sistema DEBE definir `PARTY_CLASS_IDS`, `ALIGNMENTS`, `EQUIP_SLOTS` y el vocabulario de objetivos y
  tipos de los modificadores manuales de modo que coincidan con los de f3 (`CLASS_IDS`, `FIXED_EFFECT_TARGETS`,
  `BONUS_TYPES`) y f2 (`ABILITY_IDS`, `BONUS_TYPES`). _Test:_ `shared/character-consistency.test.ts` (importa
  ambos lados; vive en `tests/`, donde está permitido).
- **R9.** CUANDO un documento almacenado declara `schemaVersion` 1, `migrateCharacterSections` DEBE devolver las
  secciones sin cambios; SI la versión es mayor que la soportada o inválida, ENTONCES DEBE devolver
  `err("unsupported_version")`. _Test:_ `shared/character-migrations.test.ts`.
- **R10.** CUANDO se invoca `applyLongRest`, el sistema DEBE devolver `daily` sin huecos de conjuro usados, sin
  gasto espontáneo y con a 0 los contadores cuyo `resetOn` es `rest`, dejando intactos los de `manual`, y NO
  DEBE alterar ninguna otra sección. _Test:_ `shared/character-ops.test.ts`.
- **R11.** El sistema DEBE ofrecer `canonicalJson` (claves ordenadas, determinista) y `foldText` (NFD sin
  diacríticos, minúsculas y espacios colapsados) en `src/shared`, usados por cliente y servidor. _Test:_
  `shared/text.test.ts`.
- **R12.** El esquema de notas DEBE exigir título de 1 a 80 caracteres, cuerpo de hasta 20 000 caracteres y un
  `characterId` UUID o `null`, y rechazar claves desconocidas (incluido `ownerId`). _Test:_
  `shared/notes.test.ts`.

### 3.2 Persistencia (stores, migraciones)

- **R13.** El sistema DEBE definir las interfaces `CharacterStore` y `NoteStore` en `src/server/stores/` y
  proveer `InMemory*` y `Sqlite*` que superen la MISMA suite de contrato. _Test:_
  `server/stores/character-store.contract.ts` y `note-store.contract.ts`, ejecutadas desde
  `in-memory-character-store.test.ts`, `in-memory-note-store.test.ts` y, con SQLite temporal,
  `sqlite-character-store.int.test.ts`, `sqlite-note-store.int.test.ts`.
- **R14.** CUANDO se crea un personaje, el store DEBE persistirlo con `revision` 1 y todas las `sectionRevs` a 1
  y comprobar de forma atómica el máximo de fichas activas del propietario. _Test:_ contrato de
  `CharacterStore`.
- **R15.** SI `applyPatch` recibe una `baseRevision` menor que `sectionRevs[s]` de una sección `s` del parche
  cuyo contenido difiere del almacenado, ENTONCES el store DEBE devolver las secciones en conflicto sin
  modificar nada (operación atómica). _Test:_ contrato de `CharacterStore`.
- **R16.** CUANDO `applyPatch` no encuentra conflictos, el store DEBE aplicar todas las secciones, incrementar
  `revision` en 1, fijar `sectionRevs` de las secciones cambiadas a la nueva revisión y actualizar
  `updatedAt`. _Test:_ contrato de `CharacterStore`.
- **R17.** CUANDO el contenido de una sección del parche es canónicamente igual al almacenado, el store NO DEBE
  considerarla cambio ni conflicto; SI ninguna sección cambia, ENTONCES NO DEBE incrementar `revision`
  (reintento idempotente). _Test:_ contrato de `CharacterStore`.
- **R18.** El store DEBE devolver copias: mutar un registro devuelto no cambia el almacenado. _Test:_ contratos
  de ambos stores.
- **R19.** El store DEBE listar personajes por propietario y estado (`active`/`archived`) ordenados por
  `updatedAt` descendente y `id`, y contar los activos de un propietario. _Test:_ contrato de `CharacterStore`.
- **R20.** SI `NoteStore.update` recibe una `baseRevision` distinta de la actual, ENTONCES DEBE devolver
  conflicto sin cambiar la nota; si coincide, DEBE incrementar `revision` en 1. _Test:_ contrato de `NoteStore`.
- **R21.** CUANDO se elimina un personaje, sus notas DEBEN conservarse con `characterId` nulo. _Test:_
  contratos de ambos stores (en SQLite, por `ON DELETE SET NULL`; en memoria, por el fake).
- **R22.** Las migraciones `002_characters` y `003_notes` DEBEN añadirse a `MIGRATIONS` sin modificar la `001`,
  ser idempotentes y conservar los datos al reabrir el fichero. _Test:_
  `server/stores/sqlite/character-migrations.int.test.ts`.
- **R23.** SI un documento almacenado tiene JSON corrupto o una `schemaVersion` desconocida, ENTONCES el
  servicio DEBE lanzar un error de infraestructura claro y la ruta DEBE responder 500 `internal_error` sin
  datos del personaje. _Test:_ `server/characters/character-service.test.ts`, `server/http/routes/character-routes.test.ts`.
- **R24.** El almacenamiento DEBE guardar el nombre del personaje desnormalizado para los listados y NO DEBE
  guardar ningún derivado (PG máximos, CA…). _Test:_ `server/stores/sqlite/sqlite-character-store.int.test.ts`
  (inspecciona las columnas y el JSON).

### 3.3 Autorización y propiedad

- **R25.** El sistema DEBE registrar las reglas de recurso `character` (`owned`, `ownerWrite: true`,
  `gmRead: true`, `gmWrite: false`) y `private_note` (`owned`, `ownerWrite: true`, `gmRead: false`,
  `gmWrite: false`) uniéndolas con `mergeKindRules` en `compose.ts`. _Test:_ `server/characters/kinds.test.ts`
  (tabla actor × dueño × acción con `createAuthorizationPolicy`).
- **R26.** CUANDO se lee o escribe un personaje o una nota, el handler DEBE decidir con `authorizeOrDeny` antes
  de devolver datos o mutar, y lo no legible DEBE responder 404 idéntico (estado y cuerpo) al de un id
  inexistente. _Test:_ las matrices R27–R30 y `server/http/routes/character-routes.test.ts`.
- **R27.** `GET /api/characters/:id` DEBE superar `describeOwnershipMatrix` con `gmCanRead: true` (el jugador B
  recibe lo mismo que para un id inexistente y ningún dato de A; el GM accede; el anónimo recibe 401). _Test:_
  `server/http/routes/character-ownership.test.ts`.
- **R28.** `GET /api/notes/:id` DEBE superar `describeOwnershipMatrix` con `gmCanRead: false` (el GM recibe lo
  mismo que para un id inexistente y ningún dato de la nota). _Test:_ `server/http/routes/note-ownership.test.ts`.
- **R29.** CUANDO un jugador B o el anónimo intentan `PATCH`, `POST …/archive`, `POST …/restore` o `DELETE` sobre
  el personaje de A, el sistema DEBE responder 404 idéntico al de un id inexistente (o 401) y NO DEBE cambiar el
  personaje; CUANDO lo intenta el GM, DEBE responder 403 `forbidden` sin cambiarlo. _Test:_
  `server/http/routes/character-ownership.test.ts` (compara el registro antes y después).
- **R30.** CUANDO un jugador B o el GM intentan `PUT` o `DELETE` sobre la nota de A, el sistema DEBE responder
  404 idéntico al de un id inexistente y NO DEBE cambiar la nota. _Test:_
  `server/http/routes/note-ownership.test.ts`.
- **R31.** `GET /api/characters` DEBE devolver a un jugador solo sus personajes, y al GM todos con el nombre de
  su propietario. _Test:_ `server/http/routes/character-routes.test.ts` (3 jugadores y un GM).
- **R32.** `GET /api/notes` DEBE devolver a cualquier usuario, incluido el GM, solo sus propias notas, y NO DEBE
  incluir título, fragmento ni número de notas de otros usuarios en ninguna respuesta. _Test:_
  `server/http/routes/note-routes.test.ts` («GM no lee notas»: busca los textos de las notas de un jugador en
  todas las respuestas del GM, incluidos `GET /api/characters/:id` y los listados).
- **R33.** Los cuerpos de creación y actualización NO DEBEN aceptar `ownerId`; el propietario DEBE ser siempre el
  actor autenticado. _Test:_ `server/http/routes/character-routes.test.ts`, `note-routes.test.ts`.
- **R34.** CUANDO un jugador (rol `player`) ya tiene un personaje activo, el sistema DEBE rechazar crear otro con
  409 `limit_reached`; el GM NO tiene límite; CUANDO se archiva un personaje, DEBE liberar el cupo; CUANDO se
  restaura uno archivado que superaría el límite, DEBE rechazarlo con 409 `limit_reached`. _Test:_
  `server/characters/character-service.test.ts`, `server/http/routes/character-routes.test.ts`.
- **R35.** CUANDO un jugador intenta asociar una nota a un `characterId` que no es suyo o no existe, el sistema
  DEBE responder 400 `unknown_reference` sin revelar si existe. _Test:_ `server/http/routes/note-routes.test.ts`.
- **R36.** Todos los endpoints nuevos (`/api/characters…`, `/api/notes…`, `/api/rules…`) DEBEN exigir sesión:
  sin cookie válida DEBEN responder 401 `unauthenticated`. _Test:_ `server/http/routes/auth-required.test.ts`
  (recorre la lista de rutas registradas).
- **R37.** Las respuestas de `/api/characters…` y `/api/notes…` DEBEN llevar `Cache-Control: no-store`. _Test:_
  `server/http/routes/character-routes.test.ts`, `note-routes.test.ts`.

### 3.4 API REST de personajes

- **R38.** CUANDO un usuario autenticado envía un cuerpo de creación válido, el sistema DEBE crear el personaje
  y responder 201 con `CharacterDto` (`ownerId` = actor, `status: "active"`, `revision: 1`, `sectionRevs`).
  _Test:_ `server/http/routes/character-routes.test.ts`.
- **R39.** SI el cuerpo de creación o de parche no cumple el esquema, ENTONCES el sistema DEBE responder 400
  `validation_error` y NO DEBE persistir nada. _Test:_ `server/http/routes/character-routes.test.ts`.
- **R40.** SI el cuerpo referencia un id que no existe en los datasets de f3 (raza, habilidad, dote, dominio,
  opción de clase, conjuro, objeto, variante, habilidad especial), ENTONCES el sistema DEBE responder 400
  `unknown_reference` nombrando el campo, salvo en los objetos personalizados (`ref: null`). _Test:_
  `server/characters/references.test.ts` (con `InMemoryRulesDataSource`).
- **R41.** `GET /api/characters/:id` DEBE devolver el documento completo con `ownerName`, `revision`,
  `sectionRevs` y `status`. _Test:_ `server/http/routes/character-routes.test.ts`.
- **R42.** `GET /api/characters` DEBE aceptar `status` ∈ {`active` (por defecto), `archived`, `all`} y devolver
  `CharacterSummaryDto` (id, nombre, propietario, raza, clases con nivel, nivel total, estado, revisión,
  `updatedAt`) sin derivados. _Test:_ `server/http/routes/character-routes.test.ts`.
- **R43.** `PATCH /api/characters/:id` DEBE aceptar `{ baseRevision, sections }` con al menos una sección
  conocida y rechazar con 400 una sección desconocida o un cuerpo vacío. _Test:_
  `server/http/routes/character-routes.test.ts`.
- **R44.** CUANDO un `PATCH` no tiene conflictos, el sistema DEBE responder 200 con el documento actualizado y
  `revision` incrementada en 1. _Test:_ `server/http/routes/character-routes.test.ts`.
- **R45.** SI un `PATCH` toca una sección modificada por otro guardado posterior a su `baseRevision`, ENTONCES
  el sistema DEBE responder 409 `revision_conflict` sin aplicar ninguna sección del parche; un parche que solo
  toca secciones no modificadas por otros DEBE aplicarse aunque la revisión global haya avanzado. _Test:_
  `server/http/routes/character-routes.test.ts`.
- **R46.** CUANDO se reenvía un `PATCH` cuyas secciones ya están aplicadas (contenido idéntico), el sistema DEBE
  responder 200 sin incrementar la revisión. _Test:_ `server/http/routes/character-routes.test.ts`.
- **R47.** CUANDO el documento resultante del parche tiene ids repetidos o un `modifier_item_missing`, el sistema
  DEBE responder 400 `validation_error` sin aplicar nada. _Test:_ `server/characters/character-service.test.ts`.
- **R48.** `POST /api/characters/:id/archive` y `POST …/restore` DEBEN cambiar el estado del personaje y
  responder 200 con el documento; `restore` DEBE respetar el límite de R34. _Test:_
  `server/http/routes/character-routes.test.ts`.
- **R49.** `DELETE /api/characters/:id` DEBE borrar un personaje archivado (204) y rechazar con 409
  `invalid_state` uno activo sin borrarlo. _Test:_ `server/http/routes/character-routes.test.ts`.
- **R50.** El sistema DEBE aceptar en `POST`/`PATCH /api/characters` cuerpos de hasta 256 KiB y en
  `POST`/`PUT /api/notes` de hasta 64 KiB, y mantener el límite de 16 KiB en el resto de rutas; un cuerpo mayor
  DEBE responder 413 con `ErrorBody` `validation_error`. _Test:_ `server/http/routes/character-body-limit.test.ts`, `note-body-limit.test.ts`.
- **R51.** `ErrorCode` DEBE ampliarse (aditivamente) con `revision_conflict`, `limit_reached`,
  `unknown_reference` e `invalid_state`, y la web DEBE traducirlos. _Test:_ `shared/auth.test.ts`,
  `web/i18n/es.test.ts` (exhaustividad de `es.errors`, R76 de f1b).
- **R52.** El servidor NO DEBE registrar en sus logs el cuerpo de las peticiones a `/api/characters` ni a
  `/api/notes` (ni títulos ni textos de notas). _Test:_ `server/http/routes/note-routes.test.ts` (logger
  capturado, como R59 de f1).
- **R53.** SI el `:id` de la ruta no tiene formato de UUID, ENTONCES el sistema DEBE responder el mismo 404
  `not_found` (estado y cuerpo) que para un UUID inexistente, sin pasar por el store. _Test:_
  `server/http/routes/character-routes.test.ts`, `note-routes.test.ts`.
- **R54.** CUANDO se crea un personaje, el servicio DEBE validar además la integridad entre secciones (R6, R7)
  del documento completo. _Test:_ `server/characters/character-service.test.ts`.
- **R55.** El servidor NO DEBE calcular ni devolver valores derivados en `/api/characters…`: los derivados los
  calcula `src/rules` en el cliente (o en el consumidor que los necesite). _Test:_
  `server/http/routes/character-routes.test.ts` (el DTO no contiene `ac`, `derived` ni `hpMax`).

### 3.5 Catálogo de reglas de solo lectura (`/api/rules`)

- **R56.** `GET /api/rules/:category` DEBE devolver `{ items, total, offset, limit }` con `IndexItemDto` para
  cualquiera de las 12 categorías con entradas (`classes`, `class-features`, `domains`, `races`, `skills`,
  `feats`, `spells`, `weapons`, `armor`, `shields`, `gear`, `magic-items`) y responder 404 `not_found` a una
  categoría desconocida. _Test:_ `server/http/routes/rules-routes.test.ts`.
- **R57.** Ninguna respuesta de índice ni de vista `core` DEBE contener texto largo del manual: sus esquemas
  son estrictos y no definen `textEn`, `benefit`, `normal`, `special`, `construction` ni `shortDescriptionEn`.
  _Test:_ `shared/rules-catalog.test.ts`, `server/catalog/views.test.ts` (recorre todas las entradas reales).
- **R58.** CUANDO se pasa `q`, el sistema DEBE devolver solo entradas en cuyo nombre inglés, nombre español,
  id o resumen aparezcan todos los términos ignorando mayúsculas y diacríticos, ordenadas por relevancia
  (nombre exacto, prefijo del nombre, prefijo de palabra, subcadena) y después alfabéticamente. _Test:_
  `server/catalog/search.test.ts`.
- **R59.** El sistema DEBE ofrecer los filtros de `design.md` §8.3 por categoría (p. ej. `classId` + `level`
  para conjuros) y rechazar con 400 `validation_error` un filtro desconocido o con valor inválido. _Test:_
  `server/http/routes/rules-routes.test.ts`.
- **R60.** El sistema DEBE paginar con `limit` (1–100, 30 por defecto) y `offset` y rechazar con 400 un `limit`
  fuera de rango; el orden DEBE ser estable entre páginas. _Test:_ `server/http/routes/rules-routes.test.ts`.
- **R61.** CUANDO se pasa `ids` (hasta 60, separados por comas) con `view=core`, el sistema DEBE devolver las
  proyecciones `core` en el orden pedido e informar de los ids inexistentes en `missing`; SI `view=core` se pide
  sin `ids` en una categoría que no es de las pequeñas (`skills`, `races`, `classes`, `domains`, `weapons`,
  `armor`, `shields`), ENTONCES DEBE responder 400. _Test:_ `server/http/routes/rules-routes.test.ts`.
- **R62.** Cada categoría DEBE tener una proyección `core` tipada con exactamente los campos de `design.md`
  §8.4, construida por mapeo explícito (nunca por copia del objeto de f3). _Test:_
  `server/catalog/views.test.ts` (compila contra el tipo y compara las claves).
- **R63.** `GET /api/rules/:category/:id` DEBE devolver el `DetailDto` (índice + `source`, `sourceRef`, `textEn`
  y proyección `core`) o 404 `not_found` si el id no existe. _Test:_ `server/http/routes/rules-routes.test.ts`.
- **R64.** `GET /api/rules/spell-lists/:classId` DEBE devolver los ids de conjuros por nivel de la clase y 404 si
  la clase no tiene lista. _Test:_ `server/http/routes/rules-routes.test.ts`.
- **R65.** La proyección `core` de un objeto mágico DEBE incluir, por variante, los efectos ya resueltos con
  `getItemEffects` (incluida la expansión de `save.all`) y el daño adicional, el hueco (`slot`) y `effectsStatus`
  ∈ {`structured`, `none`, `incomplete`}; los 26 objetos de R88 del informe de f3 (lote M) DEBEN ser `incomplete`.
  _Test:_ `server/catalog/views.test.ts`, `server/catalog/known-gaps.test.ts` (los ids existen en el dataset).
- **R66.** Las respuestas del catálogo DEBEN llevar `ETag` y `Cache-Control: private, no-cache`, y CUANDO la
  petición trae `If-None-Match` coincidente, DEBEN responder 304 sin cuerpo; el resto de rutas de `/api` DEBEN
  seguir con `Cache-Control: no-store`. _Test:_ `server/http/routes/rules-routes.test.ts`.
- **R67.** El catálogo DEBE transportar sin alterarlos `nameEs`, `nameEsVerified`, `summaryEs` y
  `summaryStatus` de f3, y NO DEBE inventar traducciones. _Test:_ `server/catalog/views.test.ts`.
- **R68.** El catálogo DEBE responder igual a jugadores y a GM, y 401 al anónimo. _Test:_
  `server/http/routes/rules-routes.test.ts`.
- **R69.** El servicio de catálogo DEBE depender solo de la interfaz `RulesDataSource` de f3 (inyectable) y
  cargar cada categoría una sola vez. _Test:_ `server/catalog/catalog-service.test.ts` (fuente espía: una
  llamada a `list` por categoría).
- **R70.** CUANDO se sirve el dataset real, una página de índice por defecto (30 entradas) DEBE pesar como máximo
  30 KB y la vista `core` de 30 dotes como máximo 40 KB serializadas. _Test:_
  `server/catalog/payload-budget.test.ts` (dataset real, sin red).
- **R71.** El sistema DEBE mantener `GET /api/rules/meta` con el número de entradas por categoría. _Test:_
  `server/http/routes/rules-routes.test.ts`.
- **R72.** Los errores de datos del dataset (`DataValidationError`) DEBEN responder 500 `internal_error` sin
  detalles internos. _Test:_ `server/http/routes/rules-routes.test.ts`.

### 3.6 Extensión pura de `src/rules`

> Cada regla nueva cita el Core en el comentario del código y en el test. «Verificar» = ver `design.md` §9.3.
> Todas devuelven `Result` (sin lanzar), son deterministas, no mutan sus entradas y su salida sobrevive a JSON
> (propiedades R1–R6 de f2, extendidas a los módulos nuevos).

- **R73.** Los módulos nuevos de `src/rules` DEBEN cumplir las propiedades de f2: no lanzar ante entrada
  inválida, ser deterministas, no mutar entradas, no importar de `server`/`web`/`data`/`shared` ni módulos de E/S
  y tener salida serializable a JSON. _Test:_ `rules/determinism.test.ts`, `rules/purity.test.ts`,
  `rules/json.test.ts`, `rules/result.test.ts` (ampliados).
- **R74.** `carryingCapacity(strength, size)` DEBE devolver `{ light, medium, heavy }` según la Tabla de
  capacidad de carga del Core para Fuerza 1–29 de una criatura mediana bípeda, donde `heavy` es la carga máxima,
  `light = ⌊heavy/3⌋` y `medium = ⌊2·heavy/3⌋`, y para Fuerza ≥ 30 tomar la fila 20–29 con la misma cifra de unidades
  y multiplicar sus **tres** cifras por 4 por cada +10 de Fuerza. _Test:_ `rules/carry.test.ts` (tabla literal de 1 a 29;
  30 = 4 × la fila de 20 = 532/1064/1600; 39 = 4 × la fila de 29).
- **R75.** `carryingCapacity` DEBE aplicar el multiplicador de tamaño de criaturas bípedas del Core y redondear
  hacia abajo (verificar). _Test:_ `rules/carry.test.ts` (Pequeña ×¾, Grande ×2…).
- **R76.** `loadCategory(weight, capacity)` DEBE devolver `light` si `weight ≤ light`, `medium` si `≤ medium`,
  `heavy` si `≤ heavy` y `overloaded` por encima, con los límites inclusivos. _Test:_ `rules/carry.test.ts`.
- **R77.** `loadEffects(category)` DEBE devolver Des máx. +3 / penalizador −3 / carrera ×4 para carga media y
  Des máx. +1 / −6 / ×3 para carga pesada y para `overloaded` (que además marca `overloaded: true`), y nada para
  carga ligera. _Test:_ `rules/carry.test.ts`.
- **R78.** `reducedSpeed(baseFt)` DEBE aplicar la reducción por armadura o carga del Core (20→15, 30→20,
  40→30, 50→35, 60→40, 70→50, 80→55, 90→60) y devolver `err("invalid_speed")` para otro valor (verificar la
  tabla). _Test:_ `rules/speed.test.ts`.
- **R79.** `characterSpeed(input)` DEBE combinar velocidad base de la raza, velocidad de armadura, carga,
  movimiento rápido y la excepción del enano, usando «la peor cifra» entre armadura y carga sin acumularlas, y
  devolver `{ baseFt, armorFt, loadFt, bonusFt, finalFt, reasons }`. _Test:_ `rules/speed.test.ts` (humano 30 con
  placas → 20; enano 20 con placas → 20; bárbaro 30 con cota de mallas → 30; bárbaro con placas → 20; humano con
  carga media y sin armadura → 20).
- **R80.** `hitPoints(input)` DEBE devolver un `Breakdown` con una línea `base` por nivel (PG ganados), una línea
  de Constitución por nivel, una línea de mínimo 1 PG por nivel cuando `PG + Con < 1`, la línea de clase predilecta
  (+1 por nivel con `favoredBonus: "hp"`) y la de la dote `toughness` (+3 y +1 por Dado de Golpe por encima de 3),
  y marcar `estimated: true` si algún nivel tiene `hp: null` (se usa el promedio). _Test:_ `rules/hit-points.test.ts`
  (druida 5 Con +2 → 28 + 10 = 38; con `toughness` → 43; Con −2 con d6 → mínimo 1 por nivel).
- **R81.** `averageHitDie(die)` DEBE devolver `die/2 + 1` (d6 → 4, d8 → 5, d10 → 6, d12 → 7) y el nivel 1 de un
  personaje DEBE usar el máximo del dado (verificar que el Core no impone el promedio). _Test:_
  `rules/hit-points.test.ts`.
- **R82.** `hpStatus(input)` DEBE clasificar al personaje como `healthy`, `staggered` (no letal = actuales),
  `unconscious` (no letal > actuales), `disabled` (0 PG), `dying` (negativos sin llegar a −Con) o `dead` (≤ −puntuación
  de Constitución). _Test:_ `rules/hit-points.test.ts` (límites exactos).
- **R83.** `bonusSpells(abilityModifier, spellLevel)` DEBE devolver `0` para nivel 0 o modificador menor que el nivel
  y `⌊(mod − nivel)/4⌋ + 1` en otro caso (Tabla de modificadores y conjuros adicionales). _Test:_
  `rules/spellcasting.test.ts` (puntuaciones 12–45 contra la tabla literal).
- **R84.** `spellsPerDay(row, abilityScore, domainRow?)` DEBE devolver por nivel 0–9: ninguno si la tabla trae «—»
  (`null`), `0` si la puntuación es menor que `10 + nivel`, y base + adicionales (+1 de dominio donde la tabla de
  clérigo lo indica) en otro caso, separando `domain`. _Test:_ `rules/spellcasting.test.ts` (clérigo 5 con Sab 16 →
  [4, 4, 3, 2], dominio en 1–3; paladín 5 con Car 16; bardo 5).
- **R85.** `spellSaveDc(spellLevel, abilityModifier)` DEBE devolver `10 + nivel + modificador`. _Test:_
  `rules/spellcasting.test.ts` (Sab 16, nivel 2 → 15).
- **R86.** `casterLevel(classId, classLevel)` DEBE restar 3 al nivel de paladín y de explorador (mínimo 0) y usar el
  nivel de clase en el resto. _Test:_ `rules/spellcasting.test.ts`.
- **R87.** `concentrationBonus(input)` DEBE devolver un `Breakdown` con nivel de lanzador y modificador de la
  característica de lanzamiento más modificadores. _Test:_ `rules/spellcasting.test.ts`.
- **R88.** `arcaneSpellFailure(input)` DEBE sumar el fallo de armadura y de escudo (máx. 100) solo para clases
  arcanas, con la excepción del bardo con armadura ligera (el escudo sí cuenta) (verificar). _Test:_
  `rules/spellcasting.test.ts`.
- **R89.** `consumesSlot(spellLevel)` DEBE ser `false` para el nivel 0 y `true` para 1–9 (los trucos no se
  gastan; verificar). _Test:_ `rules/spellcasting.test.ts`.
- **R90.** `iterativeAttacks(bab)` DEBE devolver `[bab, bab−5, bab−10, bab−15]` conservando solo los valores ≥ 1
  (el primero siempre) con un máximo de cuatro. _Test:_ `rules/combat.test.ts` (0, 5, 6, 10, 11, 15, 16, 20).
- **R91.** `combatManeuverBonus` y `combatManeuverDefense` DEBEN devolver `Breakdown` con BAB, modificador de
  Fuerza (CMB) o Fuerza y Destreza más 10 (CMD), modificador especial de tamaño (Fino −8 … Colosal +8) y los
  modificadores aplicables (en CMD, los de desvío, esquiva, circunstancia, intuición, suerte, moral, profano y
  sagrado de la CA; verificar). _Test:_ `rules/combat.test.ts` (paladín del §16.2: CMB 8, CMD 19).
- **R92.** `weaponAttackBonus(input)` DEBE devolver un `Breakdown` con BAB, modificador de característica (Fuerza
  cuerpo a cuerpo, Destreza a distancia o con Esgrima con armas), tamaño, mejora o maestría (tipo `enhancement`),
  −4 sin competencia y los modificadores aplicables. _Test:_ `rules/combat.test.ts`.
- **R93.** `weaponProficiency(weapon, grants)` DEBE devolver `proficient`, `not-proficient` o `unverified` según
  las competencias de clase (`simple`, `martial`, ids, arma predilecta de la deidad) y las dotes de competencia, y
  `unverified` para armas marciales o exóticas con una raza que podría tener familiaridad. _Test:_
  `rules/proficiency.test.ts`.
- **R94.** `armorProficiency(category, grants)` y `shieldProficiency(shieldId, grants)` DEBEN devolver
  `proficient` o `not-proficient` según las competencias de clase y las dotes. _Test:_
  `rules/proficiency.test.ts`.
- **R95.** `featSlotsAtLevel(level, human)` DEBE devolver `⌈nivel/2⌉` (+1 si es humano) y
  `abilityIncreasesAtLevel(level)` `⌊nivel/4⌋`. _Test:_ `rules/advancement.test.ts`.
- **R96.** `skillRankBudget(input)` DEBE devolver `max(1, rangos de clase + mod. de Inteligencia)` más 1 si es
  humano más 1 si el bonificador de clase predilecta es de rango. _Test:_ `rules/advancement.test.ts` (pícaro 8,
  Int +2, humano, predilecta de rango → 12).
- **R97.** `featPrerequisiteIssues(prerequisites, state)` DEBE comprobar características, BAB, nivel de lanzador,
  dotes y rangos de habilidad estructurados y devolver un aviso `unverifiable` por cada requisito de `other` o
  sin estructurar. _Test:_ `rules/feats.test.ts` (Ataque poderoso: Fue 13 y BAB +1; Esquiva: Des 13).
- **R98.** El sistema DEBE ofrecer una tabla curada `FEAT_EFFECTS` con los efectos numéricos de `toughness`,
  `improved-initiative`, `great-fortitude`, `lightning-reflexes`, `iron-will`, `dodge`, `skill-focus` y las diez
  dotes de +2/+4 en dos habilidades (`acrobatic`, `alertness`, `animal-affinity`, `athletic`, `deceitful`,
  `deft-hands`, `magical-aptitude`, `persuasive`, `self-sufficient`, `stealthy`), y un test DEBE contrastar cada
  fila con el `benefit` de la dote en el dataset de f3. _Test:_ `rules/feat-effects.test.ts` (importa el dataset
  en `tests/`).
- **R99.** El sistema DEBE ofrecer una tabla curada `PASSIVE_FEATURES` para `paladin.divine-grace`,
  `druid.nature-sense`, `bard.bardic-knowledge`, `barbarian.fast-movement`, `barbarian.uncanny-dodge` y
  `rogue.uncanny-dodge`, contrastada en test con el texto de f3. _Test:_ `rules/class-features.test.ts`.
- **R100.** `armorClass` DEBE aceptar la opción `keepsDexWhenFlatFooted` (esquiva asombrosa) que conserva Des y
  esquiva en las variantes desprevenidas, sin cambiar el comportamiento previo cuando falta. _Test:_
  `rules/armor-class.test.ts` (casos de f2 intactos + casos nuevos).
- **R101.** `dailyUses(featureId, context)` DEBE devolver los usos diarios de castigar el mal, imposición de manos,
  vínculo divino, furia (rondas), interpretación de bardo (rondas), maestro del saber, canalizar energía del clérigo
  y forma salvaje, o `null` si no conoce la capacidad (verificar cada fórmula). _Test:_
  `rules/class-features.test.ts` (paladín 5: castigar 2, imposición 5 con Car +3; bárbaro 5 Con +2: 14 rondas; bardo
  5 Car +3: 15 rondas).
- **R102.** `levelUpPreview(input)` DEBE devolver, para subir un nivel de una clase, el nuevo nivel de clase, el
  dado de golpe, los PG de promedio y máximo, si toca aumento de característica o dote, el presupuesto de rangos
  de ese nivel, las capacidades de clase nuevas (`specialIds` de la fila) y la variación de conjuros por día y
  conocidos. _Test:_ `rules/level-up.test.ts` (druida 5→6, pícaro 3→4, nueva clase).
- **R103.** El sistema DEBE ofrecer `baseFromFinal(finalScore, racial, increases)` que invierta el cálculo de la
  puntuación para convertir «puntuación final sin objetos» en base de generación. _Test:_
  `rules/advancement.test.ts`.
- **R104.** `sheetWarnings` DEBE ser una función pura que devuelva `SheetWarning` con `code`, `severity`
  (`warning`|`info`), `params` y `path`; el conjunto de códigos DEBE ser un tipo cerrado y cada código DEBE tener
  un test que lo provoca y otro que no. _Test:_ `rules/sheet/warnings.test.ts`.

### 3.7 Hoja derivada (`deriveSheet`)

- **R105.** `deriveSheet(input)` DEBE devolver `Result<DerivedSheet>` y ser puro, determinista, no mutar la entrada
  y serializable a JSON. _Test:_ `rules/sheet/derive.test.ts`, `rules/determinism.test.ts`, `rules/json.test.ts`.
- **R106.** `deriveSheet` DEBE calcular las puntuaciones efectivas con `effectiveAbility` sumando base, raza
  (modificadores fijos y elección), aumentos de nivel, efectos de objetos equipados y modificadores manuales, y
  tratar una puntuación efectiva menor que 1 como 1 marcando `status: "zero"` y la advertencia
  `ability_zero` (Q7). _Test:_ `rules/sheet/derive.test.ts`.
- **R107.** `deriveSheet` DEBE calcular CA normal, de toque, desprevenido y toque-desprevenido con `armorClass`,
  con la armadura y el escudo equipados (mejora plegada en su bonificador), la armadura natural, el desvío, la
  esquiva y los demás efectos, y los límites de Des de armadura y carga. _Test:_ `rules/sheet/derive.test.ts`
  (paladín del §16.2: 24 / 11 / 24 / 11).
- **R108.** `deriveSheet` DEBE calcular las tres salvaciones con `savingThrow`, mapeando las progresiones de f3
  (`full`/`threeQuarters`/`half`, `good`/`poor`) a las de f2 (`good`/`medium`/`poor`), e incluir efectos de
  objetos, dotes, rasgos pasivos y modificadores manuales. _Test:_ `rules/sheet/derive.test.ts`
  (paladín: 9 / 5 / 8).
- **R109.** `deriveSheet` DEBE calcular iniciativa, BAB (con ataques iterativos), CMB y CMD. _Test:_
  `rules/sheet/derive.test.ts`.
- **R110.** `deriveSheet` DEBE calcular todas las habilidades de f3 (y las especialidades de Artesanía,
  Interpretación y Profesión) con `skillModifier`: habilidades de clase por unión de las clases del personaje,
  bonificadores de dotes y rasgos pasivos, y el penalizador de armadura como la peor cifra entre armadura+escudo y
  carga. _Test:_ `rules/sheet/derive.test.ts`.
- **R111.** `deriveSheet` DEBE producir una fila de ataque por arma equipada (y una de ataque sin armas) con
  bonificador y sus ataques iterativos, dados de daño por tamaño, rango y multiplicador de crítico y la
  competencia. _Test:_ `rules/sheet/derive.test.ts`.
- **R112.** `deriveSheet` DEBE incluir velocidad, peso total, categoría de carga y sus efectos. _Test:_
  `rules/sheet/derive.test.ts`.
- **R113.** `deriveSheet` DEBE calcular, por clase lanzadora, conjuros por día, CD por nivel, nivel de lanzador,
  concentración y fallo arcano. _Test:_ `rules/sheet/derive.test.ts`.
- **R114.** `deriveSheet` DEBE listar las capacidades de clase por clase y nivel (de `specialIds` de la tabla de
  clase) y proponer contadores para las que `dailyUses` conoce. _Test:_ `rules/sheet/derive.test.ts`.
- **R115.** `deriveSheet` DEBE aplicar los modificadores manuales con `active: true` (y, si llevan `itemId`, solo
  con el objeto equipado) mediante el mismo resolvedor de f2, de modo que el apilamiento por tipo sea el del Core.
  _Test:_ `rules/sheet/derive.test.ts`.
- **R116.** `deriveSheet` NO DEBE aplicar automáticamente los efectos condicionales de objetos, ni los de daño
  (f6), salvo los condicionales activados explícitamente por el jugador; DEBE listarlos en `unapplied` con su
  texto de condición. _Test:_ `rules/sheet/derive.test.ts`.
- **R117.** SI dos objetos equipados ocupan el mismo hueco por encima de su capacidad (un hueco; dos para anillos),
  ENTONCES `deriveSheet` DEBE contar solo los primeros por orden del inventario y emitir la advertencia
  `slot_conflict`. _Test:_ `rules/sheet/derive.test.ts`.
- **R118.** `deriveSheet` DEBE aplicar el apilamiento del Core a efectos de distintas fuentes (dos bonificadores de
  mejora no se suman; dos de esquiva sí; el brazalete de armadura no se suma a la armadura). _Test:_
  `rules/sheet/derive.test.ts`.
- **R119.** `toSheetInput(character, catalog)` DEBE construir la entrada de `deriveSheet` desde el documento y las
  proyecciones `core`, devolviendo qué entradas del catálogo faltan (`missing`) en lugar de calcular con datos
  parciales. _Test:_ `shared/character-sheet.test.ts`.
- **R120.** `deriveSheet` DEBE ser exacta frente a los casos dorados del §16.2 del diseño (paladín y druida, más un arquetipo por cada clase restante de la campaña) y
  cada caso dorado DEBE citar la aritmética del Core. _Test:_ `rules/sheet/golden.test.ts`.

### 3.8 Inventario, equipo y objetos mágicos

- **R121.** El inventario DEBE admitir objetos de catálogo (`weapons`, `armor`, `shields`, `gear`, `magic-items`
  con `variantId`) y objetos personalizados (nombre libre, peso, hueco opcional), con cantidad 1–9999 y nota.
  _Test:_ `shared/character.test.ts`, `web/features/character/inventory/inventory-tab.test.tsx`.
- **R122.** El peso total DEBE sumar `peso × cantidad` (el peso manual manda sobre el del dataset, y este sobre
  0 con aviso agregado de «objetos sin peso») más las monedas a 50 por libra (verificar). _Test:_
  `rules/sheet/derive.test.ts`, `rules/carry.test.ts`.
- **R123.** CUANDO el jugador equipa un objeto, el sistema DEBE ofrecer solo los huecos válidos para él (armas:
  mano principal/secundaria; armadura; escudo; objetos mágicos según su `slot`; anillos en dos huecos); SI el
  hueco está ocupado, ENTONCES DEBE pedir confirmación de intercambio. _Test:_
  `web/features/character/inventory/equip.test.tsx`, `rules/sheet/slots.test.ts`.
- **R124.** `slotsFor(entry)` DEBE traducir el `slot` literal de f3 (`armor`, `shield`, `ring`, `belt`, `body`,
  `chest`, `eyes`, `feet`, `hands`, `head`, `headband`, `neck`, `shoulders`, `wrist`, `arms`; `none`/vacío →
  `carried`) a huecos de equipo y rechazar las habilidades especiales (`weapon quality`…) como objeto
  equipable. _Test:_ `rules/sheet/slots.test.ts` (todos los valores reales del dataset).
- **R125.** MIENTRAS una armadura o escudo está equipado, `deriveSheet` DEBE usar su bonificador base más su mejora
  como un único modificador de tipo `armor`/`shield`, y su penalizador de armadura reducido en 1 (mínimo 0) si
  es obra maestra o mágico. _Test:_ `rules/sheet/derive.test.ts`.
- **R126.** MIENTRAS un objeto mágico está equipado, `deriveSheet` DEBE aplicar sus efectos estructurados no
  condicionales con su tipo de bonificador (p. ej. anillo de protección +1 → desvío +1 a la CA; capa de resistencia
  +1 → resistencia +1 a las tres salvaciones; cinturón de fuerza de gigante +2 → mejora +2 a Fuerza). _Test:_
  `rules/sheet/derive.test.ts`.
- **R127.** Los efectos `foldInto` (armadura, escudo, armadura natural) DEBEN plegarse en el bonificador
  correspondiente, tomando el mayor de los de mejora de la misma diana, y NO DEBEN contar en la CA de toque.
  _Test:_ `rules/sheet/derive.test.ts` (amuleto de armadura natural +2).
- **R128.** El inventario DEBE admitir armas, armaduras y escudos genéricos con mejora 0–5 y hasta 6 habilidades
  especiales; el sistema DEBE advertir (`enhancement_cap`) cuando la mejora supere +5 o el bonificador efectivo
  (mejora + equivalentes de habilidades) supere +10, y (`ability_not_legal`) cuando una habilidad no sea legal
  para el arma o armadura según `legalFor`. _Test:_ `rules/sheet/warnings.test.ts`.
- **R129.** SI un objeto mágico tiene `effectsStatus` `none` o `incomplete`, ENTONCES la UI DEBE mostrar un aviso
  («Este objeto no modifica tus números automáticamente») y un botón para añadir un modificador manual vinculado
  al objeto; con `incomplete` el aviso DEBE ser más destacado. _Test:_
  `web/features/character/inventory/item-card.test.tsx`.
- **R130.** SI un objeto mágico o dato referenciado tiene `needsReview`, ENTONCES la UI DEBE mostrarlo con la marca
  «Revisar texto» y permitir usarlo. _Test:_ `web/components/entry-chip.test.tsx`.
- **R131.** CUANDO se elimina un objeto, la UI DEBE eliminar también sus modificadores manuales vinculados y los
  efectos condicionales activados en un único guardado coherente. _Test:_
  `web/features/character/inventory/inventory-tab.test.tsx`.
- **R132.** El selector de objetos mágicos NO DEBE ofrecer como objeto las habilidades especiales
  (`weapon-ability`, `armor-ability`, `shield-ability`) ni las secciones de reglas (`general`). _Test:_
  `web/features/character/inventory/add-item.test.tsx`.
- **R133.** La pestaña de equipo DEBE mostrar el peso total, los umbrales de carga ligera/media/pesada, la
  categoría actual y su efecto (Des máx., penalizador, velocidad). _Test:_
  `web/features/character/inventory/load-meter.test.tsx`.
- **R134.** Los efectos condicionales de un objeto equipado DEBEN mostrarse con su texto de condición y un
  interruptor «Aplicar»; CUANDO se activa, `deriveSheet` DEBE aplicarlo. _Test:_
  `web/features/character/inventory/item-card.test.tsx`, `rules/sheet/derive.test.ts`.

### 3.9 Creación y subida de nivel

- **R135.** CUANDO el jugador sin personaje activo abre «Crear personaje», la UI DEBE guiarle por nombre, raza,
  alineamiento, deidad, clase predilecta, puntuaciones base (con elección racial si la raza la tiene y el
  ayudante «puntuación final → base»), clase y PG de cada nivel, y enviar un único `POST` con PG actuales =
  máximos. _Test:_ `web/features/character/create/create-wizard.test.tsx`.
- **R136.** SI el nivel 1 no usa el máximo del dado o falta la elección racial de una raza que la exige, ENTONCES
  el sistema DEBE emitir las advertencias `level1_hp_not_max` y `racial_choice_missing` sin bloquear el
  guardado. _Test:_ `rules/sheet/warnings.test.ts`.
- **R137.** CUANDO el propietario pulsa «Subir de nivel», la UI DEBE mostrar los pasos de `levelUpPreview`: clase,
  PG (promedio prerrellenado, máximo, tirada o valor manual), aumento de característica si toca, dote si toca,
  reparto de rangos con su presupuesto, capacidades de clase nuevas y cambios en conjuros. _Test:_
  `web/features/character/levelup/levelup-wizard.test.tsx`.
- **R138.** El flujo de subida de nivel NO DEBE bloquear al jugador: «Confirmar» DEBE estar siempre disponible y
  las infracciones de reglas (rangos por encima del nivel o del presupuesto, dote con prerrequisitos sin cumplir,
  conjuros por encima de los disponibles) DEBEN mostrarse como advertencias. _Test:_
  `web/features/character/levelup/levelup-wizard.test.tsx`.
- **R139.** CUANDO el jugador confirma, la UI DEBE enviar un único `PATCH` con las secciones cambiadas (`levels`,
  `skills`, `feats`, `features`, `spellcasting`, `hp`) y sumar los PG ganados a los PG actuales; SI hay conflicto,
  ENTONCES DEBE aplicar el flujo de R169 sin perder el borrador. _Test:_
  `web/features/character/levelup/levelup-wizard.test.tsx`.
- **R140.** CUANDO se cancela el asistente, la UI NO DEBE enviar ningún cambio. _Test:_
  `web/features/character/levelup/levelup-wizard.test.tsx`.
- **R141.** La UI DEBE mostrar el historial de niveles (clase, PG y método, clase predilecta, aumento) y permitir
  editar cualquier nivel pasado, y quitar el último nivel tras confirmar con la lista de lo que NO se revierte
  (rangos, dotes, conjuros). _Test:_ `web/features/character/levelup/level-history.test.tsx`.
- **R142.** CUANDO se añade una clase distinta de las del personaje (multiclase), la UI DEBE permitirlo y mostrar
  las capacidades de primer nivel de la nueva clase. _Test:_ `web/features/character/levelup/levelup-wizard.test.tsx`.
- **R143.** CUANDO el jugador elige una capacidad con opciones en f3 (talentos, poderes de ira, estilo de combate,
  misericordias…), la UI DEBE ofrecer las opciones cuyo `parentId` es esa capacidad y cuyo nivel es ≤ al de clase,
  y guardar las elegidas en `features.optionIds`. _Test:_ `web/features/character/levelup/feature-options.test.tsx`.

### 3.10 Conjuros y usos diarios

- **R144.** MIENTRAS una clase del personaje tiene `casting` en f3, la pestaña de conjuros DEBE mostrar, por
  nivel de conjuro, los espacios totales (con adicionales por característica y de dominio), CD, nivel de lanzador y
  concentración procedentes de `deriveSheet`. _Test:_ `web/features/character/spells/spells-tab.test.tsx`.
- **R145.** CUANDO el jugador añade un conjuro conocido o preparado, la UI DEBE ofrecer el selector filtrado por la
  lista de la clase y el nivel y permitir elegir otro (con advertencia `spell_not_on_list`). _Test:_
  `web/features/character/spells/add-spell.test.tsx`.
- **R146.** Un hueco preparado DEBE tener `slotLevel` ≥ nivel del conjuro y una marca `domain`, y el mismo conjuro
  PUEDE prepararse varias veces. _Test:_ `shared/character.test.ts`, `web/features/character/spells/spells-tab.test.tsx`.
- **R147.** CUANDO el jugador usa un hueco preparado de nivel ≥ 1, el sistema DEBE marcarlo usado en `daily`;
  CUANDO el conjuro es de nivel 0, NO DEBE gastarlo. _Test:_ `web/features/character/spells/spells-tab.test.tsx`.
- **R148.** Para clases espontáneas (bardo), el sistema DEBE llevar el gasto por nivel en `daily.spent`, sin superar
  el total en la UI y mostrando la advertencia `spent_over_total` si el documento lo supera. _Test:_
  `web/features/character/spells/spells-tab.test.tsx`, `rules/sheet/warnings.test.ts`.
- **R149.** SI hay más conjuros preparados por nivel que huecos, o más conocidos que la tabla de la clase, ENTONCES
  el sistema DEBE emitir `prepared_over_slots` o `known_over_table` sin bloquear. _Test:_
  `rules/sheet/warnings.test.ts`.
- **R150.** CUANDO el jugador pulsa «Descanso» y confirma, la UI DEBE enviar `applyLongRest` sobre `daily` como un
  único guardado. _Test:_ `web/features/character/spells/rest-button.test.tsx`.
- **R151.** El sistema DEBE permitir crear, editar, borrar y gastar contadores de usos diarios (`label`, máximo
  automático o manual, `resetOn`), proponer los de `suggestedCounters` con un toque y mostrar el texto de la
  capacidad vinculada. _Test:_ `web/features/character/uses/counters.test.tsx`.
- **R152.** Los contadores NO DEBEN modificar ningún valor derivado (la activación numérica es de f7). _Test:_
  `rules/sheet/derive.test.ts` (derivados idénticos con y sin contadores gastados).
- **R153.** Para los dominios del clérigo, la UI DEBE permitir elegir dos dominios (`features.domainIds`), mostrar
  sus poderes y listar los conjuros de dominio por nivel para los huecos `domain`; SI un hueco de dominio contiene
  un conjuro ajeno a los dominios elegidos, ENTONCES `deriveSheet` DEBE emitir `domain_slot_mismatch`. _Test:_
  `web/features/character/spells/domains.test.tsx`, `rules/sheet/warnings.test.ts`.

### 3.11 Notas privadas

- **R154.** `POST /api/notes` DEBE crear una nota del actor (título, cuerpo, `characterId` opcional) y responder
  201 con `NoteDto` (`revision: 1`); SI el jugador ya tiene 200 notas, ENTONCES DEBE responder 409
  `limit_reached`. _Test:_ `server/http/routes/note-routes.test.ts`.
- **R155.** `PUT /api/notes/:id` DEBE actualizar título, cuerpo y vínculo con `baseRevision` y responder 409
  `revision_conflict` si no coincide, sin cambiar la nota. _Test:_ `server/http/routes/note-routes.test.ts`.
- **R156.** `GET /api/notes` DEBE listar `NoteSummaryDto` (id, título, fragmento de 120 caracteres, `characterId`,
  `updatedAt`) del actor, ordenados por `updatedAt` descendente, con filtro `characterId` y búsqueda `q`
  insensible a mayúsculas y diacríticos sobre título y cuerpo. _Test:_ `server/http/routes/note-routes.test.ts`,
  `server/notes/note-service.test.ts`.
- **R157.** `GET /api/notes/:id` y `DELETE /api/notes/:id` DEBEN seguir R28 y R30; borrar DEBE responder 204.
  _Test:_ `server/http/routes/note-routes.test.ts`.
- **R158.** La UI de notas DEBE mostrar la lista con buscador, abrir una nota para editarla con guardado
  automático (mismo mecanismo que la ficha), alternar vista previa y borrar con confirmación. _Test:_
  `web/features/notes/notes-page.test.tsx`.
- **R159.** La vista previa DEBE renderizar Markdown simple (párrafos, **negrita**, *cursiva*, encabezados `#`,
  listas con `-` o numeradas) como nodos de React, sin HTML, sin enlaces activos y sin
  `dangerouslySetInnerHTML`. _Test:_ `web/components/markdown-lite.test.tsx` (entradas hostiles).
- **R160.** Las notas NO DEBEN aparecer en `CharacterDto` ni en ninguna respuesta que no sea de `/api/notes`.
  _Test:_ `server/http/routes/character-routes.test.ts`.

### 3.12 Cliente: servicios, datos y guardado

- **R161.** El sistema DEBE añadir a `AppServices` los módulos `characters`, `notes` y `rules`
  (`CharacterApi`, `NotesApi`, `RulesCatalogApi`), implementados sobre el cliente HTTP único de f1b y sustituibles
  por fakes en los tests, sin llamar a `fetch` fuera de `http-client.ts`. _Test:_
  `web/api/character-api.test.ts`, `notes-api.test.ts`, `rules-catalog-api.test.ts`,
  `web/hygiene/web-sources.test.ts`.
- **R162.** Los módulos de API DEBEN invocar exactamente las rutas, métodos y cuerpos de `design.md` §7 y §8 y
  validar las respuestas con los esquemas de `src/shared`. _Test:_ los tres anteriores.
- **R163.** El código de `src/web` NO DEBE importar de `src/data` (salvo `src/data/legal`) ni de `src/server`; la
  UI obtiene los datos de reglas solo del puerto `RulesCatalogApi`. _Test:_ `web/hygiene/web-sources.test.ts`.
- **R164.** `CatalogCache` DEBE agrupar en una petición los ids pendientes por categoría, deduplicar peticiones en
  curso, no repetir lo ya cargado y permitir reintentar un fallo. _Test:_ `web/features/character/data/catalog-cache.test.ts`.
- **R165.** MIENTRAS falten datos de catálogo necesarios para los derivados (raza, clases, habilidades,
  objetos del inventario), la UI DEBE mostrar un estado de carga (`role="status"`) en lugar de números
  parciales; SI la carga falla, ENTONCES DEBE mostrar el error con «Reintentar». _Test:_
  `web/features/character/data/use-derived-sheet.test.tsx`.
- **R166.** El sistema DEBE guardar con autoguardado: CUANDO el jugador cambia una sección, la UI DEBE esperar
  800 ms sin nuevos cambios, agrupar las secciones pendientes en un solo `PATCH` con la `baseRevision` conocida y
  mantener como máximo una petición en vuelo. _Test:_ `web/features/character/data/character-editor.test.tsx`
  (temporizadores falsos).
- **R167.** La UI DEBE mostrar el estado de guardado (`Guardado`, `Guardando…`, `Cambios sin guardar`,
  `Sin conexión`, `Conflicto`, `Error`) en una región `role="status"`. _Test:_
  `web/components/save-status.test.tsx`.
- **R168.** CUANDO el navegador pierde la conexión o el guardado falla por red, la UI DEBE conservar los cambios
  pendientes en memoria, mostrar «Sin conexión», reintentar con espera creciente y al evento `online`, y avisar al
  intentar cerrar la pestaña con cambios pendientes. _Test:_ `web/features/character/data/character-editor.test.tsx`.
- **R169.** CUANDO el servidor responde 409 `revision_conflict`, la UI DEBE recargar el personaje, indicar qué
  secciones chocan y ofrecer «Usar la versión del servidor» o «Conservar mis cambios» (reenvío con la nueva
  revisión), sin sobrescribir en silencio. _Test:_ `web/features/character/data/character-editor.test.tsx`.
- **R170.** MIENTRAS el actor no es el propietario (GM), la UI DEBE mostrar la ficha en solo lectura sin controles
  de edición, y NO DEBE enviar jamás un `PATCH`. _Test:_ `web/features/character/sheet-page.test.tsx`.
- **R171.** El sistema DEBE registrar las secciones `character` (`/ficha`, orden 10, roles jugador y GM, ruta
  perezosa) y `notes` (`/notas`, orden 15) con el contrato `AppSection` de f1b sin modificar ficheros del shell, y
  superar `validateSections`. _Test:_ `web/features/character/section.test.tsx`, `web/features/notes/section.test.tsx`.
- **R172.** Las rutas DEBEN ser `/ficha` (jugador: su ficha activa o «Crear personaje»; GM: lista de todas
  agrupada por jugador), `/ficha/nuevo`, `/ficha/:id` (resumen), `/ficha/:id/detalle/:tab`, `/ficha/:id/nivel` y
  `/notas`, y el texto del manual DEBE abrirse con el parámetro `?ver=<categoría>:<id>` para que atrás lo cierre y
  el enlace sea compartible. _Test:_ `web/features/character/routes.test.tsx`,
  `web/features/character/character-list-page.test.tsx`.
- **R173.** SI el personaje no existe o no es legible, ENTONCES la UI DEBE mostrar «Ficha no encontrada» (404 del
  servidor) sin distinguir entre ambos casos. _Test:_ `web/features/character/sheet-page.test.tsx`.
- **R174.** El código de la ficha y de las notas NO DEBE usar `localStorage`, `sessionStorage`, `indexedDB` ni
  `document.cookie` (R85 de f1b). _Test:_ `web/hygiene/web-sources.test.ts`.
- **R175.** La sección `character` DEBE cargarse de forma perezosa: el bundle inicial NO DEBE incluir su código ni
  texto de datasets de f3. _Test:_ `web/bundle.int.test.ts` (ampliado).

### 3.13 Cliente: vistas

- **R176.** La hoja resumida DEBE mostrar nombre, raza, clases con nivel, y un control de PG con actuales,
  máximos y temporales, botones de −1, −5, +1, +5, entrada numérica directa y el estado (`hpStatus`). _Test:_
  `web/features/character/summary/hp-control.test.tsx`.
- **R177.** La hoja resumida DEBE mostrar CA, CA de toque, CA desprevenido, salvaciones, iniciativa, velocidad, BAB,
  CMB y CMD. _Test:_ `web/features/character/summary/summary-view.test.tsx`.
- **R178.** CUANDO el jugador pulsa cualquier número derivado, la UI DEBE abrir el desglose con cada línea
  (nombre, tipo de bonificador, valor y estado: aplicada, suprimida con su causa o excluida con su motivo) y el
  total. _Test:_ `web/components/breakdown-view.test.tsx`.
- **R179.** La hoja resumida DEBE listar las armas equipadas con su bonificador de ataque (y los iterativos), dados
  de daño y crítico, más el ataque sin armas. _Test:_ `web/features/character/summary/attacks.test.tsx`.
- **R180.** La hoja resumida DEBE mostrar los conjuros restantes por nivel (restantes/totales), los conjuros
  preparados por nivel y los contadores de usos, con gasto de un toque. _Test:_
  `web/features/character/summary/spell-slots-strip.test.tsx`, `counter-strip.test.tsx`.
- **R181.** La hoja resumida DEBE mostrar los modificadores manuales activos como interruptores y el número de
  advertencias con acceso a su lista. _Test:_ `web/features/character/summary/effects-strip.test.tsx`.
- **R182.** La hoja resumida DEBE ofrecer secciones plegables de dotes, habilidades (por defecto solo con rangos) y
  capacidades de clase, cuyas entradas abren el texto del manual. _Test:_
  `web/features/character/summary/quick-lists.test.tsx`.
- **R183.** CUANDO el jugador toca una dote, conjuro, capacidad de clase, rasgo racial, poder de dominio u objeto, el
  sistema DEBE abrir `EntryDrawer` con el resumen en español, los datos estructurados, el texto del manual en
  inglés (pedido en ese momento, no antes), la fuente y las marcas `Borrador`/`Revisar texto`. _Test:_
  `web/components/entry-drawer.test.tsx`.
- **R184.** `EntryDrawer` DEBE ser un diálogo accesible (`role="dialog"`, foco atrapado, Escape y botón para
  cerrar, foco de vuelta al origen) enlazado a `?ver=`. _Test:_ `web/components/entry-drawer.test.tsx`.
- **R185.** La vista detallada DEBE tener las pestañas Personaje, Habilidades, Dotes, Conjuros y Equipo
  (`role="tablist"`, navegación por flechas) y la ruta de cada pestaña. _Test:_
  `web/features/character/detail/detail-view.test.tsx`.
- **R186.** La pestaña Personaje DEBE permitir editar identidad, puntuaciones base y elección racial, mostrar por
  característica base, raza, aumentos, objetos, total y modificador con su desglose, los rasgos raciales (con su
  texto) y los idiomas. _Test:_ `web/features/character/detail/character-tab.test.tsx`.
- **R187.** La pestaña Habilidades DEBE listar todas las habilidades con rangos editables (±), marca de habilidad de
  clase, total con desglose, indicadores de penalizador de armadura y «solo entrenada», filtro y búsqueda, y
  advertir de rangos por encima del nivel. _Test:_ `web/features/character/detail/skills-tab.test.tsx`.
- **R188.** La pestaña Dotes DEBE permitir añadir (selector con búsqueda y filtro por tipo), quitar y anotar dotes con
  elección de texto («Soltura con un arma (espada larga)»), mostrar advertencias de prerrequisitos, y listar
  las capacidades de clase automáticas, las opciones elegidas y los poderes de dominio. _Test:_
  `web/features/character/detail/feats-tab.test.tsx`.
- **R189.** `EntryPicker` DEBE buscar con espera de 250 ms, filtrar por las facetas de la categoría, paginar con
  «Cargar más» y mostrar estados de carga, vacío y error. _Test:_ `web/components/entry-picker.test.tsx`.
- **R190.** La navegación entre pestañas y la vista resumida DEBE funcionar sin scroll horizontal a 360 px de ancho
  y con objetivos táctiles de al menos 44 px. _Test:_ `web/styles/character-styles.test.ts` (reglas CSS) y checklist
  manual.

### 3.14 Fidelidad, i18n, accesibilidad y estilo

- **R191.** La UI DEBE mostrar siempre el nombre inglés del SRD como principal y el nombre español solo cuando
  existe y difiere del inglés, con la marca «Borrador» si `nameEsVerified` es falso; los resúmenes españoles con
  `summaryStatus` `draft` DEBEN llevar la marca «Borrador». _Test:_ `web/components/entry-chip.test.tsx`.
- **R192.** El texto del manual DEBE rotularse «Texto original del SRD (inglés)» y mostrarse como nodos de texto
  (Markdown simple de tablas y negritas), sin HTML. _Test:_ `web/components/entry-drawer.test.tsx`,
  `web/components/markdown-lite.test.tsx`.
- **R193.** Todos los textos visibles y atributos accesibles de la ficha y las notas DEBEN salir de ficheros
  `src/web/i18n/**`, y cada `SheetWarning.code` y cada código de error nuevo DEBE tener texto (registro tipado
  exhaustivo). _Test:_ `web/hygiene/web-sources.test.ts`, `web/i18n/character-es.test.ts`.
- **R194.** Los estilos nuevos DEBEN usar solo los tokens `--ph-*` de f1b (sin colores literales), solo
  `min-width` en consultas de medios, `min-height: var(--ph-tap-min)` en controles interactivos y `font-size ≥ 1rem`
  en campos. _Test:_ `web/styles/character-styles.test.ts`.
- **R195.** Los indicadores de estado (aplicada/suprimida/excluida, advertencia, solo lectura) NO DEBEN depender solo
  del color: DEBEN llevar texto o icono con texto accesible. _Test:_ `web/components/breakdown-view.test.tsx`,
  `web/components/warning-list.test.tsx`.
- **R196.** Los cambios de estado relevantes (guardado, conflicto, uso de conjuro, PG) DEBEN anunciarse en regiones
  `role="status"`/`role="alert"`. _Test:_ `web/components/save-status.test.tsx`,
  `web/features/character/summary/hp-control.test.tsx`.
- **R197.** El sistema NO DEBE escribir en la consola durante los flujos de ficha y notas. _Test:_ los tests de
  pantallas espían `console.*` (R86 de f1b).

### 3.15 Privacidad y eventos

- **R198.** El sistema DEBE definir el evento `character.hp` (`buildCharacterHpEvent`) con el recurso
  `{ kind: "character", ownerId }`, vistas `owner` y `gm` con `{ characterId, name, hp }` y SIN vista `others`.
  _Test:_ `server/characters/events.test.ts`.
- **R199.** CUANDO se aplica `projectEventFor` al evento `character.hp`, el propietario y el GM DEBEN recibir el
  payload y cualquier otro jugador `null`. _Test:_ `server/characters/events.test.ts`.
- **R200.** El sistema NO DEBE definir ningún evento para `private_note`; `projectEventFor` sobre un recurso
  `private_note` DEBE devolver `null` al GM y a otros jugadores. _Test:_ `server/characters/events.test.ts`.
- **R201.** Esta feature NO DEBE implementar el bus ni la capa SSE (es de f5). _Test:_ `server/characters/events.test.ts`
  (no existe `RealtimeBus` importado) y revisión.

### 3.16 Calidad transversal

- **R202.** Cada `R<n>` DEBE tener al menos un test cuyo título lo cite. _Test:_ `project/traceability-f4.test.ts`
  (lee `requirements.md` y los títulos de los tests).
- **R203.** Los tests unitarios NO DEBEN usar red ni base de datos reales: usan `InMemory*`, `InMemoryRulesDataSource`,
  fakes de `AppServices` y reloj falso; lo que necesita SQLite o el dataset completo es `*.int.test.ts`. _Test:_
  suite completa con el preparador `no-network` de f0.
- **R204.** DONDE se ejecute la suite de integración, la ficha DEBE funcionar de extremo a extremo contra
  `composeApp` con SQLite temporal: login, crear, parchear con conflicto, archivar, notas privadas y catálogo con
  el dataset real. _Test:_ `server/characters/character-flow.int.test.ts`.
- **R205.** DONDE se ejecute la suite de integración, el cliente HTTP real DEBE interoperar con el servidor real
  para `CharacterApi`, `NotesApi` y `RulesCatalogApi`. _Test:_ `web/character-ui.int.test.ts`.
- **R206.** El implementer DEBE rellenar `progress/manual_f4-character-sheet.md` con la checklist de `design.md` §17
  indicando qué pasos no pudo ejecutar por falta de navegador. _Test:_ revisión del reviewer (fichero presente).

## 4. Cobertura de los criterios de aceptación originales

| Criterio de `acceptance` (feature-list.json) | Requisitos |
|----------------------------------------------|------------|
| CRUD de ficha propia (características, raza, clase/nivel, dotes, habilidades con rangos, equipo, conjuros y usos diarios, PG) | R1–R12, R38–R49, R135, R141, R176–R188 |
| …con valores derivados calculados por `src/rules` | R73–R120, R55, R165 |
| Flujo de subida de nivel editable | R102, R137–R143 |
| Inventario con peso/carga | R74–R79, R121–R134 |
| Notas privadas visibles solo para su autor | R25, R28, R30, R32, R154–R160 |
| El GM puede consultar cualquier ficha (y no las notas) | R25, R27, R29, R31, R32, R170 |
| Vista resumida y vista detallada con el texto del manual | R176–R189, R183, R191–R192 |
| Mobile-first | R190, R194, R195 |
| (Decisión del leader) catálogo sin inflar el bundle | R56–R72, R175 |
| (Decisión del leader) fidelidad al Core | R74–R103, R120, R191–R192 |
| (Decisión del leader) guardado robusto multi-dispositivo | R15–R17, R45–R46, R166–R169 |
| (Decisión del leader) privacidad y eventos | R198–R201 |
| (Decisión del leader) estrategia de tests | R202–R206 |
