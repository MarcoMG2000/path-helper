# Implementación — f1-auth-roles

Estado: implementado, pendiente de reviewer. Tasks T1..T21 marcadas `[x]` en
`specs/f1-auth-roles/tasks.md`. NO se ha marcado `done` ni se ha tocado `feature-list.json`.

## Acciones pendientes para el leader (bloqueantes menores)

1. **Añadir el script `create-gm` a `package.json`** (el último mensaje me prohibió tocar `package.json`):
   `"create-gm": "tsx src/server/cli/create-gm.ts"`. Verificado a mano con `node_modules/.bin/tsx`
   (ver "Cómo crear el primer GM").
2. **`engines.node`**: `node:sqlite` sin flag exige Node >= 22.13; hoy `package.json` dice `>=22`
   (y `tests/project/package-json.test.ts` R6 exige exactamente `">=22"`; si se sube a `>=22.13` hay que
   actualizar ese test de f0).
3. **`.env`**: el servidor ya NO arranca sin `AUTH_PEPPER` y `AUTH_ALLOWED_ORIGINS` (config obligatoria).
   `.env.example` los trae (con marcador `change-me-...` para el pepper); el humano debe copiarlo a `.env`
   y poner un pepper aleatorio propio. Un `npm run dev` ya en marcha sin esas variables fallará al reiniciar.

## Dependencias

- Se añadieron al inicio `@fastify/cookie` 11.1.3, `better-sqlite3` 13.0.3 y `@types/better-sqlite3`
  9.6.0 (exactas, consultadas con `npm view`). **`better-sqlite3` se sustituyó después por `node:sqlite`**
  por indicación del leader (el `node-gyp rebuild` falla en esta máquina). Resultado neto: **solo queda
  `@fastify/cookie` 11.1.3** como dependencia nueva (el leader ya retiró las otras dos de `package.json`).
  No se usó `fastify-plugin` (el hook global se registra con una función `registerAuth(app, opts)` que se
  llama sobre la instancia raíz, y `composeApp` pasa a ser `async`).
- Desviación del design §2: `better-sqlite3` -> `node:sqlite` (`DatabaseSync`, Node 24 del entorno). Los
  Stores están tras interfaz, así que el cambio queda en `src/server/stores/sqlite/*`. Diferencias de API
  absorbidas: no hay `db.pragma()`/`db.transaction()` (PRAGMA por `exec`, transacciones manuales
  `BEGIN/COMMIT/ROLLBACK` en `runMigrations`), `changes` puede ser bigint (se convierte con `Number`), y la
  violación UNIQUE se detecta por el mensaje del error.

## Verificación ejecutada (Node v24.20.0, Windows 11 + Git Bash; sin `npm ci`/`init.sh` por la regla de concurrencia)

| Comando | Resultado |
|---|---|
| `npx vitest run` (toda la suite unitaria, incluye trabajo del otro agente) | 67 ficheros / 696 tests en verde |
| `npx vitest run --config vitest.int.config.ts tests/server` | 4 ficheros / 39 tests en verde (start, stores SQLite, migraciones, compose con SQLite real + CLI en proceso real) |
| `npm run typecheck` | sin errores |
| `npx eslint src/server src/shared tests/server tests/helpers tests/shared tests/project` | sin errores. `npm run lint` global falla por 4 errores en ficheros de f3 (`scripts/srd/lib/text.ts`, `tests/data/...`, `tests/scripts/srd/overrides.test.ts`), NO de f1 |
| `npx prettier --check` sobre mis rutas | OK |
| Mutación manual: quitar el `KeyedMutex` del login | los 2 tests de R48 fallan (restaurado) |

No ejecuté `./init.sh` (prohibido por concurrencia); el leader debe correrlo al cerrar.

Coste de scrypt con los parámetros de producción medido: ~120 ms por hash/verify (N=32768, r=8, p=3).

## Verificación del hash de PIN contra OWASP

Parámetros: scrypt `N=2^15, r=8, p=3`, clave 32 B, sal 16 B, pepper HMAC-SHA256 previo.
Según mi conocimiento de la *OWASP Password Storage Cheat Sheet* (sección "scrypt"), la configuración
mínima es `N=2^17 (128 MiB), r=8, p=1` y se listan como equivalentes `N=2^16,r=8,p=2`,
**`N=2^15,r=8,p=3`**, `N=2^14,r=8,p=5` y `N=2^13,r=8,p=10`. **PENDIENTE DE VERIFICACIÓN**: no tengo acceso
a la web desde este entorno, así que esa afirmación es de memoria y debe contrastarse contra la versión
vigente de la guía. Los valores coinciden con los del design, por lo que no hay desviación que anotar.
`maxmem = 256*N*r` explícito (el límite por defecto de Node rechaza N=32768 con r=8). Hay un test que
recalcula la clave de forma independiente con `scryptSync` + HMAC y otro que fija las constantes (R51).
Límite honesto ya recogido en el design (Q8): un PIN de 4-8 dígitos se rompe offline si se filtran BD y pepper.

## Cómo crear el primer GM (`npm run create-gm`, una vez el leader añada el script)

```bash
# .env con AUTH_PEPPER, AUTH_ALLOWED_ORIGINS (y opcional DATABASE_PATH)
npm run create-gm -- "Nombre del GM"     # pide el PIN (4-8 dígitos) por stdin / prompt
printf '%s\n' "$PIN" | npm run create-gm -- "Nombre"   # no interactivo (el PIN no va en argv)
AUTH_BOOTSTRAP_PIN=... npm run create-gm -- "Nombre"   # alternativa por entorno
```

- Verificado hoy con `node_modules/.bin/tsx src/server/cli/create-gm.ts Gandalf` (exit 0) y un segundo
  intento (exit 1, "Ya existe una cuenta de GM"); y en `compose.int.test.ts` con proceso real.
- Usa la BD de `DATABASE_PATH` (por defecto `./data/path-helper.sqlite`, ignorada por git vía `*.sqlite`).
  En producción: `fly ssh console` y ejecutar lo mismo. Nunca imprime el PIN.
- El GM crea después a los jugadores con `POST /api/accounts` (cuerpo `{name, pin}`).

## Cambios de comportamiento/arquitectura relevantes

- `composeApp(config, settings, overrides?)` ahora es **async** y recibe `settings = { auth, database }`
  (config parseada de `AUTH_*` y `DATABASE_PATH`). `overrides` permite inyectar `stores`, `clock`, `hasher`,
  `logStream`, `extraKindRules` y `extraPublicRoutes` (para tests y futuras features).
  `composeAccountService(settings)` lo usa el CLI. `compose.ts` sigue siendo el único sitio que instancia
  `Sqlite*Store`, `ScryptPinHasher` y `SystemClock`.
- `start()` lee el entorno una vez (`readEnv`, nuevo en `config/load.ts`; `loadConfig` sigue igual) y valida
  config principal + auth + base de datos juntas; un error lista todas las variables inválidas, sin valores.
- `buildApp(config, { logStream? })` y `bodyLimit` de 16 KiB.
- Rutas bajo `/api` protegidas por defecto (hook `onRequest`); se decide por el patrón de ruta casado, y
  para rutas no casadas (404) por la ruta decodificada en minúsculas y con barras colapsadas (test de
  variantes `/API/..`, `/%61pi/..`, `//api/..`). `Cache-Control: no-store` en respuestas protegidas.
- Manejador de errores común: errores 4xx de Fastify (JSON mal formado, 415, 413) salen como `ErrorBody`
  `validation_error` conservando el estado y **sin registrar el mensaje original** (V8 cita un fragmento
  del cuerpo, que podría contener un PIN; test de R59). 5xx -> `internal_error` genérico.

## Desviaciones menores del spec (ninguna cambia un requisito)

1. `ErrorCode` añade `internal_error` (para el 500 genérico). Aditivo.
2. Una petición con cuerpo no JSON (p. ej. `text/plain`) a login recibe **415** (con cuerpo
   `validation_error`) en vez de 400; el 400 de R24 se cumple para cualquier JSON que no sea el objeto
   esperado y para JSON mal formado.
3. `DATABASE_PATH` (por defecto `./data/path-helper.sqlite`) no está en el design: hacía falta para "la BD
   configurada". Vive en `src/server/stores/sqlite/database-config.ts` (esquema propio, como `AUTH_*`).
4. `tests/project/env-example.test.ts` (f0 R28) se ajustó: `.env.example` debe contener exactamente la unión
   de claves de `ENV_KEYS`, `DATABASE_ENV_KEYS` y `AUTH_ENV_KEYS`, y los defectos se comparan solo para las
   claves del schema principal. `tests/server/app.test.ts` y `tests/server/start.int.test.ts` (f0) se
   adaptaron a la nueva firma async de `composeApp` / a las variables obligatorias. Sin cambiar sus R.
5. `recordFailure` devuelve `{ lockedUntil }` (el design decía `void`); `AuthService` añade `warmUp()` (hash
   ficticio al arrancar, vía `onReady`) y `toUserDto`.
6. Caducidad: sesión absoluta `now >= expiresAt` e inactividad `now - lastSeenAt >= 7 d` (el design escribía
   `>` para la inactividad; R32 dice "han transcurrido 7 días"). `touch` solo si `> 60 s` (exacto, R34).
7. Un estado de bloqueo con más de 48 h de inactividad se trata como olvidado de inmediato (además de
   borrarse en la purga), para que R50 no dependa de que la purga haya corrido.
8. Un cambio de PIN propio correcto también reinicia el contador de fallos (la spec no lo pide; coherente
   con R47).
9. Test de R57 con SQLite está en `tests/server/compose.int.test.ts` (no en `sqlite-user-store.int.test.ts`):
   escanea los bytes de la BD y del WAL buscando los PIN y el token en claro. R87/R90/R91 en
   `tests/server/stores/sqlite/*.int.test.ts`.
10. Advertencia `ExperimentalWarning` de `node:sqlite`: no apareció en la salida de vitest ni de tsx en
    este Node 24.20; si apareciera en otra versión, silenciar con `--disable-warning=ExperimentalWarning`.
11. `testOnlySetRole`/`testOnlyRemove` en `InMemoryUserStore`: solo para tests (no hay API pública para
    cambiar rol o borrar cuentas, Q10/Q11).
12. Q1..Q12: resueltas con la recomendación por defecto; Q2 resuelta por el humano (GM no lee notas
    personales): `docs/architecture.md` §6 ya lo decía; añadido allí el contrato `authz` (T20).

## Trazabilidad R<n> -> test (rutas bajo `tests/`)

| R | Test |
|---|---|
| R1 | `server/http/routes/account-routes.test.ts` (POST), `server/auth/account-service.test.ts` |
| R2 | `account-routes.test.ts`, `account-service.test.ts` |
| R3 | `shared/auth.test.ts`, `account-routes.test.ts`, `account-service.test.ts` |
| R4 | `account-routes.test.ts` (GET /api/accounts), `account-service.test.ts` |
| R5, R6, R7 | `server/auth/account-service.test.ts` (resetPin), `account-routes.test.ts` (PUT pin vía HTTP) |
| R8 | `account-service.test.ts` (unlock), `account-routes.test.ts` |
| R9, R10 | `account-service.test.ts` (setDisabled), `account-routes.test.ts` (PATCH) |
| R11 | `account-routes.test.ts`, `account-service.test.ts` |
| R12 | `account-routes.test.ts` (PUT pin / unlock / PATCH / GET con id inexistente -> 404) |
| R13 | `account-routes.test.ts` ("sin sesión ... 401", todos los endpoints) |
| R14 | `account-routes.test.ts` ("un jugador recibe 403", todos los endpoints exclusivos del GM) |
| R15, R16, R17 | `server/auth/account-service.test.ts` (bootstrapFirstGm), `server/cli/create-gm.test.ts`, `server/compose.int.test.ts` (CLI real) |
| R18, R19 | `server/http/routes/auth-routes.test.ts`, `server/auth/auth-service.test.ts` |
| R20 | `auth-service.test.ts`, `shared/auth.test.ts` (normalizeName) |
| R21, R22, R23 | `auth-routes.test.ts` (compara cuerpos), `auth-service.test.ts` |
| R24 | `auth-routes.test.ts`, `shared/auth.test.ts` |
| R25, R26 | `auth-routes.test.ts` (atributos de cookie, con y sin Secure) |
| R27 | `server/auth/session-token.test.ts` |
| R28 | `auth-service.test.ts`, `server/compose.int.test.ts` (BD real) |
| R29, R30 | `server/http/auth-plugin.test.ts` |
| R31, R32, R33, R34 | `server/auth/auth-service.test.ts` (`FakeClock`), `auth-plugin.test.ts` |
| R35, R36, R37 | `auth-routes.test.ts` |
| R38 | `auth-service.test.ts`, `auth-routes.test.ts` |
| R39, R92 | `auth-routes.test.ts` |
| R40 | `auth-service.test.ts`, `auth-routes.test.ts` (429 tras 5 PIN actuales erróneos) |
| R41, R42, R44, R45, R46, R47, R50 | `server/auth/login-throttle.test.ts` (+ `keyed-mutex.test.ts` de soporte) |
| R43 | `auth-routes.test.ts` (429 + `Retry-After`), `auth-service.test.ts` (el espía de `PinHasher` no recibe llamadas) |
| R48 | `auth-service.test.ts` (`Promise.all`, exactamente 5 verificaciones; falla si se quita el mutex) |
| R49 | `auth-service.test.ts` (una verificación contra hash ficticio, desconocido y deshabilitado) |
| R51, R52, R53, R54, R55, R56 | `server/auth/pin-hasher.test.ts` |
| R57 | `account-service.test.ts` (hasher real, volcado de stores), `server/compose.int.test.ts` (bytes de BD+WAL) |
| R58 | `auth-routes.test.ts`, `account-routes.test.ts` |
| R59 | `auth-routes.test.ts` (logger capturado: login ok/ko, JSON mal formado, cambio/reset de PIN) |
| R60, R61 | `server/auth/config.test.ts` |
| R62 | `server/http/origin-guard.test.ts` |
| R63, R64, R65 | `account-routes.test.ts` + matriz `describeOwnershipMatrix` (`tests/helpers/ownership-matrix.ts`) |
| R66-R74 | `server/authz/policy.test.ts` (tabla actor x dueño x regla, matriz exhaustiva 2^3 reglas, kind/ownerId ausentes, `mergeKindRules`) |
| R75, R76, R77 | `server/authz/http-denial.test.ts` |
| R78 | `server/http/auth-plugin.test.ts` (ruta ficticia sin guarda + variantes de URL) |
| R79-R85 | `server/authz/event-filter.test.ts` ("el payload de A no llega a B", GM con/sin `gmRead`, shared, vista ausente, kind desconocido) |
| R86 | `tsc` + `server/compose.int.test.ts` y `server/app.test.ts` (cableado) |
| R87, R88, R89 | `server/stores/{user,session,login-attempt}-store.contract.ts` ejecutadas desde `in-memory-*.test.ts` y `stores/sqlite/sqlite-stores.int.test.ts` |
| R90 | `server/stores/sqlite/migrations.int.test.ts` |
| R91 | `server/stores/sqlite/sqlite-stores.int.test.ts`, `server/compose.int.test.ts` (reinicio) |
| Autotest del helper de matriz | `server/authz/ownership-matrix.test.ts` (detecta 403 distinguible, lectura abierta, GM bloqueado/permitido, ruta pública) |

## Ficheros

Creados (src): `src/shared/auth.ts`; `src/server/clock.ts`; `src/server/auth/{config,pin-hasher,session-token,
keyed-mutex,login-throttle,auth-service,account-service}.ts`; `src/server/authz/{policy,kinds,http-denial,
event-filter,index}.ts`; `src/server/stores/{user,session,login-attempt}-store.ts`;
`src/server/stores/in-memory/*`; `src/server/stores/sqlite/{database,database-config,migrations,
sqlite-*-store,index}.ts`; `src/server/http/{auth-plugin,origin-guard,errors}.ts`;
`src/server/http/routes/{auth,account}-routes.ts`; `src/server/cli/create-gm.ts`.
Modificados (src): `src/shared/index.ts`, `src/server/{app,compose,start}.ts`, `src/server/config/load.ts`
(`readEnv`), `.env.example`, `docs/architecture.md` (§6).
Tests: `tests/shared/auth.test.ts`, `tests/server/**` (ver tabla), `tests/helpers/{fake-clock,spy-pin-hasher,
auth-fixture,test-app,temp-db,ownership-matrix}.ts`; ajustados `tests/project/env-example.test.ts`,
`tests/server/{app.test.ts,start.int.test.ts}`.

## Cierre (2026-10-16) — hallazgos del review resueltos y pendientes

Detalle en [impl_closure_f1_f2.md](impl_closure_f1_f2.md). Esta sección sustituye a "Acciones pendientes para el leader" (ya hechas: script `create-gm`, `engines.node` `>=22.13`, `.env.example`).

Resueltos:
- **M-1** (pepper de ejemplo en producción): `parseAuthConfig` rechaza, con `NODE_ENV=production`, un `AUTH_PEPPER` que contenga `change-me` sin distinguir mayúsculas (cubre el marcador de `.env.example`). Tests `R61 (review M-1)` en `tests/server/auth/config.test.ts`.
- **M-2** (GM bloqueado sin recuperación): `npm run reset-gm-lock` (`src/server/cli/reset-gm-lock.ts`). Tests en `tests/server/cli/reset-gm-lock.test.ts` y `reset-gm-lock.int.test.ts`. Documentado en el README.
- **B-1** (`idleResetMs` < bloqueo máximo): `idleResetMs = max(48 h, AUTH_LOCK_MAX_HOURS)`. Test `R50 (review B-1)`.
- **B-3** (`Cache-Control: no-store` en login/logout): el hook global lo pone en toda ruta bajo `/api`, también las públicas. Test `review B-3` en `tests/server/http/auth-plugin.test.ts`.
- `engines.node` `>=22.13` (+ test de f0 R6 y `package-lock.json`).

Pendientes (mejoras futuras, no implementadas):
- **B-2**: índice `login_attempts(updated_at)` en una migración 002, purga como máximo una vez por minuto y/o tope de filas, o límite por IP tras el proxy de Fly (crecimiento de almacenamiento por nombres distintos).
- **I-1**: redactar `req.url` (query string) en el serializer de pino si una feature futura acepta secretos por query.
- **I-2**: `app.setNotFoundHandler` con `notFoundBody()` para las rutas no casadas bajo `/api` (contrato de errores para `f1b-auth-ui`).
- **I-3** (informativo): `DatabaseSync` abre con timeout de ocupado 0; el CLI con el servidor en marcha podría recibir "database is locked" (se reintenta).
