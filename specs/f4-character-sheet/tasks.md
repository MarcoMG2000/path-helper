# Tasks — f4-character-sheet

> Orden: **L0** (secuencial, un agente) → **LR, LS1, LS2, LS3** (en paralelo, ficheros disjuntos) → **LW0, LW1** (en paralelo;
> necesitan f1b implementada) → **LU1, LU2, LU6** (en paralelo) → **LU3** (tras LU1), **LU4, LU5** (en paralelo con LU3) →
> **LZ** (secuencial, cierre). Tres olas: **Ola 1** = L0 + LR + LS1–LS3; **Ola 2** = LW0 + LW1 + LU1 + LU2 + LU6;
> **Ola 3** = LU3 + LU4 + LU5 + LZ (`design.md` §21). El reviewer valida cada ola contra sus `R<n>` antes de seguir.
>
> Reglas comunes a todos los lotes:
> - TDD: el test (con `R<n>` en el título) se escribe antes o junto con el código. Rutas de test relativas a `tests/`.
> - Cada lote toca **solo** sus ficheros (`design.md` §21). Los compartidos (`compose.ts`, `migrations.ts`, `es.ts`, `services.tsx`,
>   `rules/index.ts`, `shared/index.ts`, `auth.ts`) son de **L0**: si otro lote necesita un cambio ahí, lo anota y para.
> - Cada lote escribe `progress/impl_f4-character-sheet_<lote>.md` (hecho, `R<n>` → test, reglas del Core verificadas con URL,
>   dudas) y devuelve **solo la referencia** (no el contenido).
> - Ninguna instalación de dependencias (no hay nuevas). Nada de `console.*`, ni almacenamiento del navegador, ni texto de UI
>   fuera de `src/web/i18n/**`. Una cifra marcada «verificar» en `design.md` §9.3 se contrasta con el SRD (AoN/d20pfsrd) y se
>   anota; si discrepa o es ambigua, **no se inventa**: se anota como pregunta y se para.
> - Al cerrar cada lote: `npm test`, `npm run typecheck`, `npm run lint` sobre lo tocado (y los `*.int.test.ts` del lote).
>   `./init.sh` completo solo en **L0** y **LZ** (evita instalaciones/`npm ci` concurrentes).
> - Ningún lote cambia `status` en `feature-list.json`; el leader lo hace.

## Lote L0 — Cimientos (secuencial; bloquea a todos)

- [ ] **T0.1 Preflight.** Verificar `f1`, `f2`, `f3` en `done` con la suite verde y que f1b está implementada (si no, L0 hace solo
  la parte de servidor y deja la web para después: anotar). Releer `design.md` §2 y comprobar los hechos marcados [V]
  (firmas de `authz`, `ComposeOverrides`, `MIGRATIONS`, `AppSection`). _(soporte)_
- [ ] **T0.2 Texto y JSON canónico.** `src/shared/text.ts` (`foldText`, `canonicalJson`) y `shared/text.test.ts`. _Cubre:_ R11.
- [ ] **T0.3 Esquemas del documento.** `src/shared/character.ts` (constantes `SECTION_NAMES`, `PARTY_CLASS_IDS`, `ALIGNMENTS`,
  `EQUIP_SLOTS`, `LIMITS`; esquemas de las 11 secciones, `CharacterSectionsSchema`, parche parcial) y
  `shared/character.test.ts` (estricto, sin campos de texto de reglas, límites en el borde y +1, 256 KiB, puntuaciones, PG, entradas
  de nivel, inventario `ref` xor `custom`, hueco preparado). _Cubre:_ R1, R2, R3, R4, R5, R121 (esquema), R146 (esquema).
- [ ] **T0.4 Operaciones e integridad.** `src/shared/character-ops.ts` (`emptySections`, `applyLongRest`,
  `validateCharacterIntegrity`, `removeItem`) y `shared/character-ops.test.ts`, `shared/character-integrity.test.ts`. _Cubre:_ R6, R7, R10,
  R131 (parte de datos).
- [ ] **T0.5 Migraciones del esquema.** `src/shared/character-migrations.ts` y `shared/character-migrations.test.ts`. _Cubre:_ R9.
- [ ] **T0.6 DTO de API, notas y catálogo.** `src/shared/{character-api,notes,rules-catalog}.ts` (esquemas zod estrictos de §7 y
  §8.4, `ItemEffect` redeclarado, facetas) y `shared/{notes,rules-catalog}.test.ts` (no existe campo de texto largo en índice ni
  `core`; `ownerId` rechazado). `src/shared/index.ts`. _Cubre:_ R12, R57 (esquemas), R33 (esquemas estrictos).
- [ ] **T0.7 Códigos de error.** `src/shared/auth.ts`: `ErrorCode += revision_conflict | limit_reached | unknown_reference |
  invalid_state`; `shared/auth.test.ts`. _Cubre:_ R51 (servidor/shared).
- [ ] **T0.8 Coherencia entre capas.** `tests/shared/character-consistency.test.ts`: `PARTY_CLASS_IDS` = `CLASS_IDS` de f3, vocabulario
  de objetivos/tipos = `FIXED_EFFECT_TARGETS`/`BONUS_TYPES` (f2 y f3), `ItemEffect` asignable entre `shared` y `src/data`, `ABILITY_IDS`.
  _Cubre:_ R8.
- [ ] **T0.9 Interfaces de stores y suites de contrato.** `src/server/stores/{character-store,note-store}.ts` (§5.1) y
  `tests/server/stores/{character-store,note-store}.contract.ts` (creación con límite atómico, `applyPatch` aplicado/sin cambios/
  conflicto, idempotencia, copias, listados, `update` con revisión, desvinculación al borrar personaje). Las implementaciones las hacen
  LS1/LS2. _Cubre:_ R13 (interfaces + suites), R14, R15, R16, R17, R18, R19, R20, R21.
- [ ] **T0.10 Migraciones SQLite.** Añadir `002_characters` y `003_notes` a `MIGRATIONS` (sin tocar la `001`) y
  `server/stores/sqlite/character-migrations.int.test.ts` (idempotencia, reapertura, índices, `ON DELETE SET NULL`). _Cubre:_ R22.
- [ ] **T0.11 Tipos y stubs de `src/rules`.** `src/rules/sheet/types.ts` (`SheetInput`, `DerivedSheet`, `SheetWarning`,
  `SheetWarningCode`, `SkillRow`, `AttackRow`, `ClassSpellSummary`), stubs de TODAS las firmas de §9.2 y `deriveSheet` (devuelven
  `err("invalid_input", "no implementado")`, nunca lanzan), `RulesErrorCode += invalid_speed | invalid_weight | invalid_input`,
  `src/rules/index.ts`, `src/shared/character-sheet.ts` (firmas de `requiredEntries`/`toSheetInput`). Test de compilación y de que
  los stubs no lanzan. _Cubre:_ R73 (base), R119 (firma), R104 (tipo).
- [ ] **T0.12 Cableado del servidor.** `compose.ts`: `ComposeOverrides += characterStores, rulesData`; stores en memoria cuando hay
  `stores` inyectados sin `characterStores`; `CHARACTER_KIND_RULES` (`src/server/characters/kinds.ts`) unidas con
  `mergeKindRules`; plugins stub `characterRoutes`, `noteRoutes`, `rulesRoutes` registrados (sin rutas aún) con `bodyLimit` por ruta
  declarado; constantes `CHARACTER_ROUTES`/`NOTE_ROUTES`/`RULES_ROUTES`. Tests: `server/characters/kinds.test.ts` (tabla actor ×
  dueño × acción), los tests de f1 siguen verdes. _Cubre:_ R25, R36 (cableado), R50 (declaración).
- [ ] **T0.13 API web y servicios.** `src/web/api/{character-api,notes-api,rules-catalog-api}.ts` (interfaces de §14.1 y su
  implementación sobre `HttpClient`, validando con los esquemas de `shared`), `http-client.ts` con método `DELETE`, `schemas.ts` con
  los 4 códigos nuevos, `services.tsx` (`AppServices += characters, notes, rules`), y tests `web/api/{character-api,notes-api,
  rules-catalog-api}.test.ts` con `fetch` falso. _Cubre:_ R161, R162.
- [ ] **T0.14 Fakes y fixtures.** `tests/web/helpers/{fake-character-api,fake-notes-api,fake-rules-catalog,derived-fixtures}.ts`
  (el fake de personajes implementa `revision`/`sectionRevs` reales), ampliar `fake-services.ts`, `tests/helpers/character-fixtures.ts`
  (los arquetipos del §16.2 como `CharacterSections`). _Cubre:_ soporte de R166–R170.
- [ ] **T0.15 i18n y CSS (esqueletos).** `es.ts` (una línea por bloque; `es.nav.character = "Ficha"` y `es.nav.notes = "Notas"` para las `AppSection`), `src/web/i18n/character/{common,summary,detail,spells,
  inventory,levelup}.ts`, `notes.ts`, `rules.ts` y su agregado `character-es.ts` con la clave mínima; `es.errors` para los 4 códigos;
  ficheros CSS vacíos con cabecera de tokens. Test `web/i18n/es.test.ts` ampliado (exhaustividad de errores). _Cubre:_ R51 (web),
  R193 (esqueleto).
- [ ] **T0.16 Cierre de L0.** `./init.sh` verde; lista en `progress/impl_f4-character-sheet_L0.md` de los contratos publicados y de
  cualquier ajuste respecto al diseño. _(soporte)_

## Lote LR — Reglas puras (`src/rules`; paralelo con LS1–LS3)

- [ ] **T-R.1 Carga.** `carry.ts` + `rules/carry.test.ts`: tabla literal Fue 1–29, ×4 por +10, tamaños, redondeo (Q6),
  `loadCategory`, `loadEffects`, monedas. Verificar tabla y multiplicadores con el SRD. _Cubre:_ R74, R75, R76, R77, R122 (monedas).
- [ ] **T-R.2 Velocidad.** `speed.ts` + `rules/speed.test.ts` (tabla de reducción, enano, bárbaro, peor cifra; contraste con
  `speed30`/`speed20` de las armaduras de f3). _Cubre:_ R78, R79.
- [ ] **T-R.3 Puntos de golpe.** `hit-points.ts` + `rules/hit-points.test.ts` (promedio, nivel 1, Con, mínimo 1, predilecta,
  `toughness`, estimación, estados). _Cubre:_ R80, R81, R82.
- [ ] **T-R.4 Conjuros.** `spellcasting.ts` + `rules/spellcasting.test.ts` (adicionales 12–45 contra la tabla, `spellsPerDay` con
  `null`/`0`/dominio, CD, nivel de lanzador, concentración, fallo arcano, trucos). Verificar con el SRD. _Cubre:_ R83, R84, R85, R86,
  R87, R88, R89.
- [ ] **T-R.5 Combate y competencias.** `combat.ts`, `proficiency.ts` + `rules/combat.test.ts`, `rules/proficiency.test.ts`
  (iterativos, CMB/CMD y tabla de tamaño, ataque por arma, competencias por clase/dotes/raza). _Cubre:_ R90, R91, R92, R93, R94.
- [ ] **T-R.6 Avance y dotes.** `advancement.ts`, `feats.ts` + `rules/advancement.test.ts`, `rules/feats.test.ts`. _Cubre:_ R95, R96,
  R97, R103.
- [ ] **T-R.7 Efectos de dotes y capacidades.** `feat-effects.ts`, `class-features.ts` (`PASSIVE_FEATURES`, `dailyUses`), opción
  `keepsDexWhenFlatFooted` en `armor-class.ts` + `rules/feat-effects.test.ts`, `rules/class-features.test.ts` (cada fila contrastada con
  el texto del dataset de f3), `rules/armor-class.test.ts` ampliado (f2 intacto). _Cubre:_ R98, R99, R100, R101.
- [ ] **T-R.8 Vista previa de nivel.** `level-up.ts` + `rules/level-up.test.ts`. _Cubre:_ R102.
- [ ] **T-R.9 Huecos.** `sheet/slots.ts` + `rules/sheet/slots.test.ts` (todos los `slot` reales del dataset). _Cubre:_ R124.
- [ ] **T-R.10 Advertencias.** `sheet/warnings.ts` + `rules/sheet/warnings.test.ts` (un caso positivo y uno negativo por código del §9.5).
  _Cubre:_ R104, R128, R136, R148 (advertencia), R149, R153 (advertencia).
- [ ] **T-R.11 `deriveSheet` (a): características, PG, carga, velocidad.** `sheet/derive.ts` parte 1 + tests. _Cubre:_ R105, R106, R112,
  R122.
- [ ] **T-R.12 `deriveSheet` (b): CA, salvaciones, iniciativa, habilidades.** Efectos de objetos, `fold`, esquiva asombrosa, peor
  cifra de penalizador de armadura. _Cubre:_ R107, R108, R109, R110, R125, R126, R127.
- [ ] **T-R.13 `deriveSheet` (c): ataques, conjuros, capacidades.** _Cubre:_ R111, R113, R114.
- [ ] **T-R.14 `deriveSheet` (d): modificadores manuales, condicionales, conflictos de hueco, apilamiento.** _Cubre:_ R115, R116,
  R117, R118, R134 (parte de reglas), R152.
- [ ] **T-R.15 Ensamblador.** `src/shared/character-sheet.ts` (`requiredEntries`, `toSheetInput`, mapeos de progresiones y signos) +
  `shared/character-sheet.test.ts`. _Cubre:_ R119.
- [ ] **T-R.16 Casos dorados y propiedades.** `rules/sheet/golden.test.ts` (G1, G2, G2b y un arquetipo por cada clase restante, con
  aritmética en comentarios), ampliar `determinism`, `purity`, `json`, `result` a los módulos nuevos, `wiring.test.ts` (documento →
  `toSheetInput` → `deriveSheet`). _Cubre:_ R120, R73.
- [ ] **T-R.17 Informe de verificación.** En `progress/impl_f4-character-sheet_LR.md`, tabla de las reglas «verificar» del §9.3 con
  URL y resultado (coincide / discrepa / ambigua). _(soporte de la fidelidad)_

## Lote LS1 — Personajes (servidor; paralelo con LR, LS2, LS3)

- [ ] **T-S1.1 Store en memoria.** `in-memory-character-store.ts` + `in-memory-character-store.test.ts` ejecutando la suite de
  contrato de L0. _Cubre:_ R13, R14, R15, R16, R17, R18, R19.
- [ ] **T-S1.2 Store SQLite.** `sqlite-character-store.ts` (transacción `BEGIN IMMEDIATE` en `applyPatch`) +
  `sqlite-character-store.int.test.ts` (contrato, reapertura, columnas y JSON sin derivados). _Cubre:_ R13, R21, R24.
- [ ] **T-S1.3 Referencias.** `references.ts` + `server/characters/references.test.ts`. _Cubre:_ R40.
- [ ] **T-S1.4 Servicio.** `character-service.ts` + `character-service.test.ts` (crear con límite, listas por rol, parche con integridad
  del documento fusionado, archivar/restaurar/borrar, error por versión desconocida o JSON corrupto). _Cubre:_ R23, R34, R47, R54.
- [ ] **T-S1.5 Rutas.** `character-routes.ts` + `character-routes.test.ts`, `character-body-limit.test.ts` (cuerpos, estados, ETag no,
  `no-store`, UUID inválido, sin derivados, sin notas, sin `ownerId`). _Cubre:_ R26, R31, R33, R37, R38, R39, R41, R42, R43, R44, R45,
  R46, R48, R49, R50, R53, R55, R160.
- [ ] **T-S1.6 Matriz de propiedad.** `character-ownership.test.ts` con `describeOwnershipMatrix` (`gmCanRead: true`) y las variantes de
  escritura (B → 404 idéntico, GM → 403, anónimo → 401, el registro no cambia). _Cubre:_ R27, R29.
- [ ] **T-S1.7 Logs y eventos.** Test de logger capturado (sin cuerpos de personajes) y `events.ts` + `server/characters/events.test.ts`.
  _Cubre:_ R52 (personajes), R198, R199, R200, R201.

## Lote LS2 — Notas (servidor; paralelo con LR, LS1, LS3)

- [ ] **T-S2.1 Store en memoria.** `in-memory-note-store.ts` + test de contrato. _Cubre:_ R13, R20.
- [ ] **T-S2.2 Store SQLite.** `sqlite-note-store.ts` + `sqlite-note-store.int.test.ts` (contrato, FK, `SET NULL`). _Cubre:_ R13, R21.
- [ ] **T-S2.3 Servicio.** `note-service.ts` + `note-service.test.ts` (límite 200, vínculo propio, búsqueda con `foldText`, orden).
  _Cubre:_ R35, R154, R156.
- [ ] **T-S2.4 Rutas.** `note-routes.ts` + `note-routes.test.ts`, `note-body-limit.test.ts` (CRUD, 409, `no-store`, UUID inválido,
  logs sin cuerpos con nota centinela, listado del GM sin notas ajenas, `GET /api/characters/:id` sin notas). _Cubre:_ R32, R33,
  R37, R50, R52, R53, R155, R157, R160.
- [ ] **T-S2.5 Matriz.** `note-ownership.test.ts` con `describeOwnershipMatrix` (`gmCanRead: false`) y variantes de escritura (B y GM →
  404 idéntico). _Cubre:_ R28, R30.

## Lote LS3 — Catálogo de reglas (servidor; paralelo con LR, LS1, LS2)

- [ ] **T-S3.1 Búsqueda.** `search.ts` + `server/catalog/search.test.ts` (diacríticos, términos, puntuación, desempate estable, paginación).
  _Cubre:_ R58, R60 (lógica).
- [ ] **T-S3.2 Vistas.** `views.ts` (índice, `core` por categoría con mapeo explícito, detalle con `parts`) + `views.test.ts` (recorre
  todas las entradas reales: ningún campo de texto largo; claves exactas del §8.4; nombres/resúmenes sin alterar). _Cubre:_ R57, R62, R67.
- [ ] **T-S3.3 Objetos incompletos.** `known-gaps.ts` (los 26 ids de R88 de f3) + `known-gaps.test.ts`; `effectsStatus` y efectos por variante
  con `getItemEffects`. _Cubre:_ R65.
- [ ] **T-S3.4 Servicio.** `catalog-service.ts` + `catalog-service.test.ts` (una lectura por categoría, `ids`, `missing`). _Cubre:_ R69.
- [ ] **T-S3.5 Rutas.** `rules-routes.ts` + `rules-routes.test.ts` (categorías, filtros por categoría y errores 400, límites,
  `ids`/`view=core`, detalle, listas de conjuros, `meta`, `ETag`/304 y excepción de `Cache-Control` acotada con ruta de control en
  `no-store`, rol indiferente, 401, `DataValidationError` → 500). _Cubre:_ R56, R59, R60, R61, R63, R64, R66, R68, R71, R72.
- [ ] **T-S3.6 Presupuesto de carga.** `payload-budget.test.ts` con el dataset real. _Cubre:_ R70.

## Lote LW0 — Base web (necesita f1b; paralelo con LW1)

- [ ] **T-W0.1 `CatalogCache`.** `features/character/data/catalog-cache.ts` + test (agrupa, deduplica, no repite, reintenta). _Cubre:_ R164.
- [ ] **T-W0.2 `useDerivedSheet`.** `data/use-derived-sheet.tsx` + test (carga, error, listo; sin números parciales). _Cubre:_ R165.
- [ ] **T-W0.3 Motor de guardado.** `data/character-editor.ts` y `use-character.ts` + `character-editor.test.tsx` (debounce 800 ms, una
  petición en vuelo, agrupación, offline con reintentos y `online`, `beforeunload`, 409 con las dos salidas, solo lectura sin `PATCH`).
  _Cubre:_ R166, R168, R169, R170 (motor).
- [ ] **T-W0.4 Secciones y rutas.** `features/character/{section,routes,sheet-page,character-list-page}.tsx`,
  `features/notes/section.tsx` (perezosas) y tests (validan con `validateSections`, rutas, 404 uniforme, vista del GM, solo lectura).
  _Cubre:_ R170, R171, R172, R173.
- [ ] **T-W0.5 Higiene.** Ampliar `hygiene/web-sources.test.ts` (sin `src/data`, sin almacenamiento del navegador, sin `fetch` fuera del
  cliente). _Cubre:_ R163, R174.
- [ ] **T-W0.6 Cierre de LW0.** Los tests de pantalla de otros lotes usarán `renderApp` + estos módulos; documentar en el informe cómo
  montar una ficha con fakes. _(soporte)_

## Lote LW1 — Componentes compartidos (necesita f1b; paralelo con LW0)

- [ ] **T-W1.1 `markdown-lite`.** `components/markdown-lite.tsx` + test con entradas hostiles (HTML, `javascript:`, tablas, listas).
  _Cubre:_ R159, R192 (render).
- [ ] **T-W1.2 `BreakdownView`.** `components/breakdown-view.tsx` + test (líneas aplicadas, suprimidas con causa, excluidas con motivo,
  texto además de color). _Cubre:_ R178, R195.
- [ ] **T-W1.3 `EntryChip`.** `components/entry-chip.tsx` + test (nombre EN, ES si difiere, «Borrador», «Revisar texto»). _Cubre:_ R130, R191.
- [ ] **T-W1.4 `EntryDrawer`.** `components/entry-drawer.tsx` + test (texto pedido al abrir, rotulado, foco atrapado, Escape, `?ver=`).
  _Cubre:_ R183, R184, R192.
- [ ] **T-W1.5 `EntryPicker`.** `components/entry-picker.tsx` + test (espera 250 ms, facetas, «Cargar más», estados). _Cubre:_ R189.
- [ ] **T-W1.6 Estado y utilidades.** `save-status.tsx`, `warning-list.tsx`, `stepper.tsx`, `tabs.tsx`, `chip.tsx` + tests. _Cubre:_ R167,
  R195, R196.
- [ ] **T-W1.7 Estilos base.** `styles/character-common.css` y `web/styles/character-styles.test.ts` (tokens, `min-width`, 44 px, 1 rem para
  todos los `character-*.css` y `notes.css`). _Cubre:_ R194.

## Lote LU1 — Hoja resumida

- [ ] **T-U1.1 `HpControl`.** `summary/hp-control.tsx` + test (±1/±5, entrada directa, temporales, estado, anuncio). _Cubre:_ R176, R196.
- [ ] **T-U1.2 Defensas.** `summary/defenses.tsx` (CA/toque/desprevenido, salvaciones, iniciativa, velocidad, BAB, CMB/CMD, desglose al tocar) +
  test. _Cubre:_ R177, R178 (uso).
- [ ] **T-U1.3 Ataques.** `summary/attacks.tsx` + test. _Cubre:_ R179.
- [ ] **T-U1.4 Tiras de conjuros y contadores.** `summary/{spell-slots-strip,counter-strip}.tsx` + tests (gasto de un toque, nivel 0 sin gasto en la
  tira). _Cubre:_ R180.
- [ ] **T-U1.5 Efectos y avisos.** `summary/effects-strip.tsx` + test. _Cubre:_ R181.
- [ ] **T-U1.6 Listas rápidas.** `summary/quick-lists.tsx` + test (dotes, habilidades con rangos, capacidades; abren `EntryDrawer`). _Cubre:_ R182.
- [ ] **T-U1.7 `SummaryView`.** Composición, columnas en escritorio, `styles/character-summary.css`, textos en `i18n/character/summary.ts` y
  test de no desbordamiento (reglas CSS). _Cubre:_ R190 (resumen).

## Lote LU2 — Hoja detallada A: Personaje, Habilidades, Dotes

- [ ] **T-U2.1 `DetailView` y pestañas.** `detail/detail-view.tsx` + test (tablist, flechas, rutas). _Cubre:_ R185.
- [ ] **T-U2.2 Pestaña Personaje.** `detail/character-tab.tsx` (identidad, puntuaciones con desglose y `baseFromFinal`, rasgos y idiomas) + test.
  _Cubre:_ R186.
- [ ] **T-U2.3 Pestaña Habilidades.** `detail/skills-tab.tsx` + test (±, clase, ACP, solo entrenada, filtro, advertencia). _Cubre:_ R187.
- [ ] **T-U2.4 Pestaña Dotes.** `detail/feats-tab.tsx` (+ capacidades de clase automáticas, opciones, poderes de dominio) + test. _Cubre:_ R188.
- [ ] **T-U2.5 Estilos y textos.** `styles/character-detail.css`, `i18n/character/detail.ts`. _(soporte de R185–R188)_

## Lote LU3 — Conjuros y usos (tras LU1)

- [ ] **T-U3.1 Pestaña Conjuros.** `spells/spells-tab.tsx` (espacios, CD, NL, concentración, preparados/conocidos, uso, gasto espontáneo) + test.
  _Cubre:_ R144, R146, R147, R148.
- [ ] **T-U3.2 Añadir conjuro.** `spells/add-spell.tsx` (selector por clase y nivel, fuera de lista con aviso) + test. _Cubre:_ R145.
- [ ] **T-U3.3 Descanso.** `spells/rest-button.tsx` + test (confirmación, un solo guardado). _Cubre:_ R150.
- [ ] **T-U3.4 Contadores.** `uses/counters.tsx` (CRUD, sugeridos, gasto, texto de la capacidad) + test. _Cubre:_ R151.
- [ ] **T-U3.5 Dominios.** `spells/domains.tsx` + test. _Cubre:_ R153.
- [ ] **T-U3.6 Avisos de conjuros en pantalla.** Mostrar `prepared_over_slots`, `known_over_table`, `spent_over_total`. _Cubre:_ R149 (UI).

## Lote LU4 — Inventario y equipo

- [ ] **T-U4.1 Pestaña Equipo.** `inventory/inventory-tab.tsx` (lista, cantidades, notas, objetos personalizados, borrado coherente) + test.
  _Cubre:_ R121, R131.
- [ ] **T-U4.2 Añadir objeto.** `inventory/add-item.tsx` (`EntryPicker` con `addable=true`) + test. _Cubre:_ R132.
- [ ] **T-U4.3 Equipar.** `inventory/equip.tsx` (huecos válidos, intercambio, anillos) + test. _Cubre:_ R123.
- [ ] **T-U4.4 Tarjeta de objeto.** `inventory/item-card.tsx` (efectos, aviso de sin estructura, modificador manual vinculado, condicionales con
  interruptor, mejora y habilidades de armas/armaduras genéricas) + test. _Cubre:_ R129, R134 (UI).
- [ ] **T-U4.5 Medidor de carga.** `inventory/load-meter.tsx` + test. _Cubre:_ R133.
- [ ] **T-U4.6 Estilos y textos.** `styles/character-inventory.css`, `i18n/character/inventory.ts`. _(soporte)_

## Lote LU5 — Creación y subida de nivel

- [ ] **T-U5.1 Asistente de creación.** `create/create-wizard.tsx` + test (pasos, `baseFromFinal`, un solo `POST`). _Cubre:_ R135.
- [ ] **T-U5.2 Asistente de nivel.** `levelup/levelup-wizard.tsx` (pasos de §11.2, borrador en memoria, advertencias no bloqueantes, un solo
  `PATCH`, conflicto sin perder el borrador, cancelar) + test. _Cubre:_ R137, R138, R139, R140, R142.
- [ ] **T-U5.3 Historial.** `levelup/level-history.tsx` + test (editar niveles, quitar el último). _Cubre:_ R141.
- [ ] **T-U5.4 Opciones de capacidades.** `levelup/feature-options.tsx` + test. _Cubre:_ R143.
- [ ] **T-U5.5 Estilos y textos.** `styles/character-levelup.css`, `i18n/character/levelup.ts`. _(soporte)_

## Lote LU6 — Notas (UI)

- [ ] **T-U6.1 Página y editor.** `features/notes/{notes-page,note-editor}.tsx` (lista, buscador, filtro por ficha, editor con autoguardado y
  conflicto, vista previa, borrado confirmado) + `notes-page.test.tsx`; `styles/notes.css`, `i18n/notes.ts`. _Cubre:_ R158.

## Lote LZ — Integración y cierre (secuencial)

- [ ] **T-Z.1 Rutas con sesión.** `server/http/routes/auth-required.test.ts` recorriendo `CHARACTER_ROUTES`, `NOTE_ROUTES`, `RULES_ROUTES`. _Cubre:_ R36.
- [ ] **T-Z.2 Flujo de extremo a extremo.** `server/characters/character-flow.int.test.ts` (login, crear, parchear, conflicto, archivar, notas
  privadas, catálogo real). _Cubre:_ R204.
- [ ] **T-Z.3 Contrato cliente-servidor.** `web/character-ui.int.test.ts` (cliente HTTP real, cookie jar, `Origin` simulado). _Cubre:_ R205.
- [ ] **T-Z.4 Bundle.** Ampliar `web/bundle.int.test.ts`: sin texto de f3 en ningún trozo, la sección de la ficha en un trozo perezoso. _Cubre:_ R175.
- [ ] **T-Z.5 Higiene global.** i18n exhaustivo (cada `SheetWarningCode` y error), sin `console`, sin textos literales, CSS de todos los
  `character-*.css`, ancho a 360 px, red/BD en unitarios (R203). _Cubre:_ R190 (global), R193, R197, R203.
- [ ] **T-Z.6 Trazabilidad.** `project/traceability-f4.test.ts` (cada `R<n>` en el título de un test). _Cubre:_ R202.
- [ ] **T-Z.7 Documentación.** `docs/architecture.md` (§4 stores, §5 web, §6 reglas), `README.md` (sección «Ficha de personaje»), y
  `progress/manual_f4-character-sheet.md` con la checklist de `design.md` §17 (qué no pudo ejecutarse sin navegador). _Cubre:_ R206.
- [ ] **T-Z.8 Cierre.** `./init.sh` y `npm run test:int` verdes; resumen en `progress/impl_f4-character-sheet_LZ.md` con la tabla `R<n>` → test y las
  verificaciones del Core pendientes de humano. _(soporte; el reviewer aprueba o rechaza)_
