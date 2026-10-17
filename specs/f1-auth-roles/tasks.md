# Tasks — f1-auth-roles

> Orden obligatorio: cada task puede apoyarse en las anteriores. Marcar `[x]` al
> terminar (con su test en verde). El implementer NO empieza hasta que el humano
> apruebe el spec y el leader ponga la feature en `in_progress`. Rutas de test relativas
> a `tests/` (espejo de `src/`). `./init.sh` debe quedar verde al cerrar cada bloque.

## Bloque A — Fundamentos

- [x] **T1. Dependencias y tipos compartidos.** Añadir (pineadas, solo si faltan) `@fastify/cookie`,
  `better-sqlite3`, `@types/better-sqlite3`. Crear `src/shared/auth.ts` (`ROLES`, `Role`, `nameSchema`,
  `pinSchema`, schemas de cuerpos, DTOs, `ErrorCode`, `normalizeName`). Test:
  `shared/auth.test.ts` (nombre 1–32, PIN `^\d{4,8}$` incl. ceros a la izquierda, `normalizeName`).
  Cubre: R3, R20, R24.
- [x] **T2. Clock.** Crear `src/server/clock.ts` (`Clock`, `SystemClock`) y `tests/helpers/fake-clock.ts`
  (`advance(ms)`, `set(ms)`). Cubre: base de R31, R32, R34, R42, R45, R46, R50.
- [x] **T3. Config de auth.** Crear `src/server/auth/config.ts` (`AuthConfig`, `parseAuthConfig`) y añadir las
  claves `AUTH_*` a `.env.example` con marcador evidente para `AUTH_PEPPER`. Test: `server/auth/config.test.ts`.
  Cubre: R60, R61.

## Bloque B — Hash y sesiones

- [x] **T4. PinHasher.** Crear `src/server/auth/pin-hasher.ts` (`ScryptPinHasher`, `DEFAULT_SCRYPT_PARAMS`);
  verificar los parámetros contra la guía OWASP (anotar en `progress/` si difieren). Test:
  `server/auth/pin-hasher.test.ts` (parámetros por defecto, sal distinta, parámetros embebidos, pepper,
  hash malformado, `maxmem`). Cubre: R51–R56.
- [x] **T5. Token de sesión.** Crear `src/server/auth/session-token.ts`. Test:
  `server/auth/session-token.test.ts` (32 bytes, base64url, unicidad, SHA-256 hex). Cubre: R27, R28.

## Bloque C — Stores

- [x] **T6. Interfaces de stores y fakes.** Crear `src/server/stores/{user,session,login-attempt}-store.ts` y
  `src/server/stores/in-memory/*.ts` (copias defensivas). Cubre: R86.
- [x] **T7. Suites de contrato.** Crear `tests/server/stores/{user,session,login-attempt}-store.contract.ts` y
  ejecutarlas contra los fakes (`in-memory-*.test.ts`). Cubre: R87, R88, R89 (y base de R50, R91).
- [x] **T8. SQLite.** Crear `src/server/stores/sqlite/migrations.ts` (migración `001_auth`, `runMigrations`) y
  `Sqlite{User,Session,LoginAttempt}Store`; PRAGMAs WAL + foreign_keys; sentencias preparadas. Tests
  `*.int.test.ts`: suites de contrato, `migrations.int.test.ts` (idempotencia), reapertura de fichero temporal y
  volcado de la BD sin PIN en claro. Cubre: R57 (parte int.), R87, R90, R91.

## Bloque D — Autorización central (núcleo reutilizable)

- [x] **T9. Política.** Crear `src/server/authz/policy.ts` (`Actor`, `Resource`, `ResourceKindRule`,
  `mergeKindRules`, `createAuthorizationPolicy`, `readAudience`) y `src/server/authz/kinds.ts` (`account`).
  Test: `server/authz/policy.test.ts` con tipos de prueba `test_sheet`, `test_private_note`, `test_shared`;
  tabla parametrizada actor × propietario × regla × acción, incluyendo "jugador A no lee ni escribe lo de B",
  GM propietario de su propia nota, kind desconocido y `owned` sin `ownerId`. Cubre: R66–R74.
- [x] **T10. Denegación HTTP.** Crear `src/server/authz/http-denial.ts` (`authorizeOrDeny`, `notFoundBody`,
  `forbiddenBody`). Test: `server/authz/http-denial.test.ts`. Cubre: R75–R77 (y soporte de R64).
- [x] **T11. Filtro de eventos.** Crear `src/server/authz/event-filter.ts` (`RealtimeEvent`, `projectEventFor`) y
  `src/server/authz/index.ts` (barrel). Test: `server/authz/event-filter.test.ts` ("el payload de A no llega
  a B", GM con y sin `gmRead`, `shared`, vista ausente, kind desconocido). Cubre: R79–R85.

## Bloque E — Servicios de auth y cuentas

- [x] **T12. KeyedMutex y LoginThrottle.** Crear `src/server/auth/keyed-mutex.ts` y
  `src/server/auth/login-throttle.ts`. Tests: `server/auth/keyed-mutex.test.ts` (serialización por clave,
  claves independientes, limpieza) y `server/auth/login-throttle.test.ts` (5 fallos → 15 min, no cuenta
  bloqueado, escalado ×2 con tope 24 h, expiración, reset, purga a 48 h). Cubre: R41, R42, R44–R47, R50.
- [x] **T13. AuthService.** Crear `src/server/auth/auth-service.ts` (`login`, `logout`, `authenticate`,
  `changeOwnPin`) con hash ficticio de arranque. Test: `server/auth/auth-service.test.ts` con fakes,
  `FakeClock` y `PinHasher` espía: éxito, nombre normalizado, tres casos de `invalid_credentials`, bloqueo
  sin verificación, concurrencia (`Promise.all`, ≤ 5 verificaciones), hash ficticio, caducidad absoluta e
  inactividad, cuenta deshabilitada, `touch` a 60 s, solo hash del token en el store, cambio de PIN
  (revoca otras sesiones, cuenta como intento fallido). Cubre: R19, R20, R28, R31–R34, R38, R40, R43, R48, R49.
- [x] **T14. AccountService.** Crear `src/server/auth/account-service.ts`. Test:
  `server/auth/account-service.test.ts`: alta, `name_taken`, validación, reset de PIN (revoca sesiones y
  borra bloqueo), `unlock`, deshabilitar/habilitar, `cannot_disable_gm`, `bootstrapFirstGm` (R15–R17),
  y que ningún store contiene el PIN en claro. Cubre: R1, R2, R3, R5–R11, R15–R17, R57.

## Bloque F — HTTP

- [x] **T15. Plugin de autenticación y CSRF.** Crear `src/server/http/auth-plugin.ts` (cookie,
  `onRequest` deny-by-default con `PUBLIC_ROUTES`, `request.actor`, `requireRole`) y
  `src/server/http/origin-guard.ts`. Tests: `server/http/auth-plugin.test.ts` (ruta ficticia sin guarda → 401,
  token desconocido, rol leído del store) y `server/http/origin-guard.test.ts`. Cubre: R29, R30, R62, R78.
- [x] **T16. Rutas de auth.** Crear `src/server/http/routes/auth-routes.ts`. Test:
  `server/http/routes/auth-routes.test.ts` (`app.inject` + fakes): atributos de la cookie (con y sin
  `Secure`), 401 homogéneos (comparar cuerpos), 400, 429 + `Retry-After`, logout idempotente, `me`, `PUT /pin`,
  ausencia de PIN/hash en respuestas y logs. Cubre: R18, R19, R21–R26, R35–R37, R39, R92, R43, R58, R59.
- [x] **T17. Rutas de cuentas.** Crear `src/server/http/routes/account-routes.ts`. Test:
  `server/http/routes/account-routes.test.ts`: alta/listado/reset/unlock/deshabilitar, 401/403/404/409,
  y `GET /api/accounts/:id` con la matriz propia/ajeno/GM. Cubre: R1–R14, R58, R63–R65.
- [x] **T18. Helper de matriz de propiedad.** Crear `tests/helpers/ownership-matrix.ts`
  (`describeOwnershipMatrix`) con autotest y usarlo en T17. Cubre: R64, R67, R80 (evidencia de
  "jugador A no puede leer datos de B" reutilizable por f4/f5).

## Bloque G — Composición y cierre

- [x] **T19. Composición y CLI.** Tocar `src/server/compose.ts` (único sitio con `Sqlite*Store`,
  `ScryptPinHasher`, `SystemClock`; `mergeKindRules`; plugins y rutas; sobrescritura de dependencias para
  tests) y crear `src/server/cli/create-gm.ts` + script `npm run create-gm`. Test: arranque con stores
  fake sobrescritos; CLI probado a través de `bootstrapFirstGm` (T14). Cubre: R86 (cableado), R15–R17.
- [x] **T20. Documentación.** Añadir a `docs/architecture.md` §6 una referencia breve al contrato
  (`src/server/authz`, reglas por `kind`, `projectEventFor`, helper `ownership-matrix`) y matizar "GM lee todo"
  si el humano resuelve Q2 en el sentido recomendado. Sin cambios en `src/rules`.
- [x] **T21. Cierre.** `./init.sh` verde (tests unit al 100 %, `npm run test:int` verde para los
  `*.int.test.ts`), tabla de trazabilidad R↔test completa en `progress/impl_f1-auth-roles.md`, ningún
  `console.log`, sin secretos en el repo.

## Trazabilidad rápida (tasks → requisitos)

| Requisito | Task(s) | Requisito | Task(s) |
|-----------|---------|-----------|---------|
| R1, R2 | T14, T17 | R51–R56 | T4 |
| R3 | T1, T14, T17 | R57 | T8, T14 |
| R4, R12–R14 | T17 | R58, R59 | T16, T17 |
| R5–R11 | T14, T17 | R60, R61 | T3 |
| R15–R17 | T14, T19 | R62 | T15 |
| R18, R21–R26, R35–R37, R39, R92 | T16 | R63–R65 | T17, T18 |
| R19, R20, R28, R31–R34, R38, R40 | T13, T16 | R66–R74 | T9 |
| R27 | T5 | R75–R77 | T10 |
| R29, R30, R78 | T15 | R79–R85 | T11 |
| R41, R42, R44–R47, R50 | T12 | R86 | T6, T19 |
| R43, R48, R49 | T13, T16 | R87–R91 | T7, T8 |
