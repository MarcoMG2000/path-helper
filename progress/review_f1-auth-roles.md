# Review — feature f1-auth-roles

**Veredicto:** APROBADO

Sin defectos bloqueantes. Hay 5 hallazgos no bloqueantes (2 de gravedad media, 3 bajas) y 4 informativos; ninguno incumple un `R<n>` ni compromete la garantía "un jugador no puede espiar a otro". Los dos de gravedad media (pepper de ejemplo aceptado, GM bloqueable sin ruta de recuperación) deberían cerrarse antes del primer despliegue (f9); los recomiendo como micro-tareas de seguimiento al leader.

Alcance de la verificación (reglas de concurrencia de f3): NO he ejecutado `./init.sh`, `npm ci` ni `npm install`. He ejecutado por separado sus componentes relevantes (Node v24.20.0, Windows 11 + Git Bash):

| Comando | Resultado |
|---|---|
| `npx vitest run tests/server tests/shared` | 26 ficheros / 324 tests en verde |
| `npx vitest run --config vitest.int.config.ts tests/server` | 4 ficheros / 39 tests en verde |
| `npm run typecheck` | sin errores |
| `npx eslint .` (global; ya sin los 4 errores de f3) y `prettier --check src/server src/shared tests/server tests/helpers tests/shared docs/architecture.md package.json` | limpios |

El leader debe correr `./init.sh` al cerrar (no puedo darlo por verificado).

## Metodología adversarial (todo fuera del repo, en el scratchpad; el repo queda intacto)

1. **Servidor real** (`tsx src/server/main.ts` como proceso hijo, SQLite temporal, scrypt de producción, pepper aleatorio, `AUTH_COOKIE_SECURE=false`; GM creado con el CLI real `create-gm`). Script `scratchpad/f1review/attack.mjs`: 162 comprobaciones PASS, 0 FAIL.
2. **En proceso con `FakeClock`** (`attack2.mts`): ciclo de vida de sesión, escalado del bloqueo, matriz de política contra un oráculo independiente (144 combinaciones `owned` = 3 actores x 6 valores de dueño x 8 reglas, más `shared` y kinds raros) y parseo de configuración.
3. **Arranque real con entornos inválidos** (`cfg.mjs`).
4. **Mutación manual** de 40 puntos críticos sobre una copia en el scratchpad (el código real no se ha tocado): 39 mutantes muertos por la suite y 1 superviviente que es equivalente (ver N-1). Cubre política, `authorizeOrDeny` (404 a 403), `projectEventFor` (vista sustituta / audiencia none), hook deny-by-default, `GET /accounts/:id` sin `authorizeOrDeny` o con el `ownerId` del actor, `requireRole`, mutex, dummy-verify, throttle, Origin guard, caducidad, revocación de sesiones, flags de cookie, token en claro, pepper y sal fija.

## Resultados de las pruebas ofensivas

**1. Aislamiento A -> B (servidor real).**
- A pide a B por id: `404 {"error":{"code":"not_found","message":"Recurso no encontrado"}}`, byte a byte igual que para un UUID inexistente; el nombre de B no aparece. Mediana de latencia 15.59 ms vs 15.49 ms (40 muestras): indistinguibles (misma ruta de código: la política deniega antes de tocar el store).
- 24 variantes (barra final, `//api`, `/API`, id en mayúsculas, `?id=<A>`, `<A>/../<B>`, `%2e`, `%2f`, `%00`, `;x=1`, `%20`, id con un carácter percent-encoded, HEAD/OPTIONS/POST/PUT/DELETE/PATCH, `/pin`, `/unlock`, `/*`): ninguna devuelve 200/201/204 ni datos de B.
- Sin cookie: 22 rutas x 5 métodos (`/api`, `/api/`, `/api/nada`, `/api%2Fnada`, `/%61pi/nada`, `//api/nada`, `/API/nada`, `/api/auth/Login`, `/api/auth/login/`, `/.%2e/api/accounts`...): todo lo que cuelga de `/api` da 401 salvo las públicas declaradas (`POST /api/auth/login`, `POST /api/auth/logout` con 204, `GET /health`). Default-deny confirmado también para rutas no casadas.
- Cookies raras (vacía, basura, doble `ph_session` en ambos órdenes, 5000 caracteres, entrecomillada, otro nombre, `role=gm` en cookie): sin escalada (con dos `ph_session` gana la primera). Cabeceras `x-role: gm`, `x-user-id`, `Authorization: Bearer <token GM>`, `x-forwarded-user`, `x-original-url`, `x-http-method-override`: ignoradas (403 en `/api/accounts`).
- Revocación: deshabilitar a C da 401 al instante a su cookie, su login devuelve el mismo 401 y mismo cuerpo que un nombre desconocido, y re-habilitarlo no resucita la sesión vieja; el reset de PIN de B por el GM invalida su cookie vieja (401), el PIN viejo (401) y el nuevo entra (200); logout invalida la cookie; el cambio de PIN propio invalida las otras sesiones y mantiene la actual. Caducidad con `FakeClock`: 6d23h de inactividad sigue; 7d exactos da 401; 30d absolutos da 401 aunque haya actividad diaria.

**2. CSRF.** 7 endpoints mutantes (login, alta, logout, PUT pin propio, PATCH, PUT pin GM, unlock) x 7 `Origin` hostiles (`http://evil.example`, `null`, `http://localhost:5173/` con barra final, `http://localhost:5173.evil.com`, `HTTP://LOCALHOST:5173`, otro puerto, otro esquema): todos 403 `bad_origin` sin ejecutar nada (la sesión de A sigue viva y C no se deshabilitó). Sin cabeceras CORS permisivas en el preflight. `text/plain` y `application/x-www-form-urlencoded` (CSRF "simple") reciben 415/400.

**3. Fuerza bruta.**
- 5 fallos (401), el 6.o intento da 429 `locked` con `Retry-After: 900`; el PIN correcto también recibe 429. Un nombre inexistente produce la misma secuencia `401 x5, 429(ra=900)` y el mismo cuerpo 429 que uno existente. La variante con espacios y mayúsculas (`  DAVE `) comparte bloqueo. El GM desbloquea y el jugador entra.
- Escalado (FakeClock): 15, 30, 60, 120, 240, 480, 960, 1440, 1440 min (tope 24 h); tras un login correcto el nivel vuelve a 15 min.
- Concurrencia: 24 logins simultáneos con variantes de mayúsculas/espacios del mismo nombre dan exactamente 5 x 401 y 19 x 429. Con 10 malos + 1 bueno simultáneos: 5 x 401 y el resto 429 (no se cuela el correcto).
- Enumeración por tiempo (scrypt real, mediana de 15): desconocido 125.6 ms, conocido con PIN malo 127.7 ms, deshabilitado 133.1 ms (n=4). No distinguibles.

**4. Fugas.** Capturados stdout+stderr del proceso servidor tras unas 100 peticiones con PIN, token y JSON malformado (JSON truncado, `pin` numérico, `[]`, `null`, cuerpo de 20 KB que da 413, `__proto__`): ninguna respuesta refleja el PIN; los logs NO contienen el pepper, ningún PIN (de login, de reset o de cambio), ningún token de sesión, el prefijo `scrypt$`, `pinHash` ni la cabecera `cookie`. Cookie de login: `ph_session=TOKEN; Max-Age=2592000; Path=/; HttpOnly; SameSite=Strict` (sin `Domain`; `Secure` ausente solo porque el entorno tenía `AUTH_COOKIE_SECURE=false`; con `true` lo cubre el test R26 y su mutante muere). Los cuerpos no incluyen `pinHash`, `nameKey`, hash ni pepper; `AccountDto` tiene exactamente `id,name,role,disabled,createdAt`.

**5. Política y eventos.** Los 144 casos `owned` coinciden con el oráculo independiente (lectura, escritura y `projectEventFor`); nunca se entrega la vista `others` en un recurso `owned`; el GM con `gmRead=false` no recibe la nota privada; el GM propietario recibe la vista `owner`; sin ownerId (cadena vacía, `null`, `undefined`) nadie recibe nada, ni el GM; los `kind` `__proto__`, `constructor`, `toString`, `hasOwnProperty` y cadena vacía se deniegan; un rol manipulado (`GM` en mayúsculas) no obtiene vista; `authorizeOrDeny` da un 404 idéntico para ajeno y para kind desconocido, también en escritura.

**6. Escalada.** Un jugador no puede: crear cuentas (403 aunque lleve `role` gm en el cuerpo), hacer PATCH de su propia cuenta (403), usar `PUT /api/accounts/:id/pin` ni sobre B ni sobre sí mismo (403), ni cambiar el PIN de B por `PUT /api/auth/pin` con `id`/`userId` en el cuerpo (403 `invalid_current_pin`; el PIN de B sigue intacto). El GM que envía `role` gm al crear obtiene un `player`; `PATCH` con `disabled` como cadena da 400; deshabilitar al GM da 409 `cannot_disable_gm`; sigue habiendo un solo GM; nombres duplicados (`bob ` con espacio, `BOB`, `Gandalf`) dan 409. `create-gm` por segunda vez: exit 1 y "Ya existe una cuenta de GM".

**7. Configuración (procesos reales).** Sin `AUTH_PEPPER`, sin `AUTH_ALLOWED_ORIGINS` o con un pepper corto: exit 1, mensaje `Configuración inválida: AUTH_PEPPER (...)` sin el valor (el pepper de prueba `SECRETOCORTO` no aparece) y no se abre puerto. Orígenes `*`, `null`, vacío, con ruta o con coma final: rechazados. **Pero** el placeholder `change-me-this-is-not-a-secret-change-me` (41 caracteres, publicado en el repo) y un pepper de 32 espacios o de 32 letras iguales se ACEPTAN, también con `NODE_ENV=production` y `AUTH_COOKIE_SECURE=false` (ver M-1).

## Hallazgos por gravedad (ninguno bloqueante)

### Media

**M-1. El pepper de ejemplo (y cualquier valor de 32 o más caracteres) se acepta en producción.** Reproducción: en un directorio sin `.env`, `AUTH_PEPPER=change-me-this-is-not-a-secret-change-me AUTH_ALLOWED_ORIGINS=http://localhost:5173 NODE_ENV=production AUTH_COOKIE_SECURE=false node <repo>/node_modules/tsx/dist/cli.mjs <repo>/src/server/main.ts` imprime `Server listening at http://127.0.0.1:3918`. `src/server/auth/config.ts` solo exige `min(32)` (cumple R61 al pie de la letra). Si quien despliega copia `.env.example` tal cual (que además trae `AUTH_COOKIE_SECURE=false`), el pepper es público y la mitigación de Q8 queda anulada sin aviso. Recomendación (micro-tarea con su R y su test): rechazar en `parseAuthConfig` cualquier pepper que empiece por `change-me` (siempre, no solo en producción) y exigir con `NODE_ENV=production` que `AUTH_COOKIE_SECURE` sea `true` (o al menos avisar por log). No bloquea: el comportamiento es el especificado y f9 (deploy) es el sitio natural; hasta entonces vale la nota del implementer (el humano debe sustituir el pepper).

**M-2. Un tercero puede bloquear al GM y, sin sesión de GM viva, no hay vía de recuperación.** Q6 aceptó que un tercero bloquee a un jugador porque el GM lo desbloquea (R8), pero eso no sirve para la cuenta del propio GM. Reproducción (en proceso, `attack2.mts`): 5 logins con PIN erróneo para `gandalf`; después, el login con el PIN correcto devuelve 429. El atacante solo necesita el nombre del GM y puede repetirlo: el nivel no se resetea mientras haya actividad (llega a 24 h). Por lectura de código, un GM con sesión viva (7 d de inactividad / 30 d absolutos) sí puede desbloquearse con `POST /api/accounts/<su id>/unlock` (la ruta es solo-GM y no excluye su propio id), así que el riesgo real es el GM que pierde la sesión (móvil nuevo, cookies borradas). Hoy la única salida es editar la BD por `fly ssh`. Recomendación: un comando `npm run unlock-account -- <nombre>` (o `reset-gm-pin`), hermano de `create-gm`, y/o documentarlo en el runbook de f9. No bloquea.

### Baja

**B-1. `idleResetMs` (48 h) puede ser menor que la duración de un bloqueo configurable.** `AUTH_LOCK_BASE_MINUTES` y `AUTH_LOCK_MAX_HOURS` aceptan hasta 9999; `LoginThrottle.effectiveState` descarta el estado si `now - updatedAt > 48 h` aunque `lockedUntil` siga en el futuro. Reproducción (en proceso): `lockout` con `baseLockMs` y `maxLockMs` de 100 h, 5 fallos, avanzar 49 h; el login con el PIN correcto devuelve 200 (el bloqueo de 100 h se ha olvidado). Con los valores por defecto (máximo 24 h) no ocurre. Arreglo: `idleResetMs = max(48 h, maxLockMs)` o acotar `AUTH_LOCK_*` en `parseAuthConfig`.

**B-2. Crecimiento de `login_attempts` y purga O(n) sin límite por IP.** Cada nombre distinto (hasta 64 caracteres) crea una fila (R41) y `purgeIdle()` corre en cada fallo con `DELETE ... WHERE updated_at < ?` sobre una tabla sin índice en `updated_at`, en el hilo principal (`DatabaseSync` es síncrono). Medido: 1 millón de filas son 93 MB y 37 ms por purga. Con unos 125 ms de scrypt por intento y varios hilos de libuv, un inundador logra del orden de 30 req/s, es decir unos 2.6 millones de filas al día (unos 240 MB/día; con 48 h de retención, unos 0.5 GB) en un volumen pequeño de Fly. Q6 aceptó explícitamente la ausencia de límite por IP, pero no este crecimiento de almacenamiento. Mitigaciones baratas: índice `login_attempts(updated_at)` en una migración `002`, purgar como máximo una vez por minuto y/o poner un tope de filas; o el límite por IP de Q6 cuando se despliegue tras el proxy de Fly.

**B-3. La respuesta del login (200 con `Set-Cookie`) no lleva `Cache-Control: no-store`.** Un login correcto muestra la cabecera ausente: el hook global solo la añade a rutas protegidas y `/api/auth/login` y `/logout` son públicas. Las respuestas autenticadas sí la llevan (comprobado en `/api/auth/me`). Riesgo práctico muy bajo (HTTPS, `Set-Cookie` no se cachea), pero el cuerpo lleva datos de usuario; añadir la cabecera a toda la API bajo `/api` con un `onSend`.

### Informativo

**I-1. Se registra la query string en los logs** (una petición a `/api/accounts/x` con `pin=5559` en la query aparece completa en el log `incoming request`). Hoy ningún endpoint recibe secretos por query (los PIN van en el cuerpo y las cookies no se loguean), así que no hay fuga actual; si una feature futura acepta tokens por query, hay que redactar `req.url` en el serializer de pino.

**I-2. Las rutas no casadas bajo `/api` responden (con sesión) con el 404 por defecto de Fastify**, que repite la ruta pedida y no usa `ErrorBody`. No distingue ajeno de inexistente (la ruta no casa, es idéntico para B y para un UUID cualquiera) y no es una fuga, pero rompe el contrato de errores que usará la UI: `app.setNotFoundHandler` con `notFoundBody()`, por ejemplo al implementar `f1b-auth-ui`.

**I-3. (No verificado; solo lectura de código)** `DatabaseSync` abre con timeout de ocupado 0; el CLI `create-gm` ejecutado con el servidor en marcha (`fly ssh`) podría recibir database is locked en el raro instante de una escritura. Falla de forma clara y se reintenta; no requiere cambios ahora.

**N-1. Mutante superviviente (equivalente).** Cambiar en `src/server/http/errors.ts` el log `{ code, status }` por `{ err: error }` no rompe ningún test. Lo reproduje en una copia: con Fastify 5.12.7 el error del parser JSON tiene un mensaje genérico (Body is not valid JSON but content-type is set to application/json) y no incluye el fragmento del cuerpo, así que el log resultante no contiene el PIN; hoy es un mutante equivalente. La defensa del implementer es correcta y el test R59 de cuerpo mal formado es suficiente.

## Desviaciones declaradas: ¿son aceptables?

- `composeApp` async + `settings`/`overrides`: aceptable (registrar `@fastify/cookie` es asíncrono; el único llamador, `start()`, y los tests están adaptados). `compose.ts` sigue siendo el único sitio que instancia `Sqlite*Store`, `ScryptPinHasher` y `SystemClock`.
- `DATABASE_PATH` con esquema propio y valor por defecto: aceptable y necesaria (la BD configurada del CLI). Está en `.env.example`.
- `internal_error` en `ErrorCode`: aceptable (aditivo; el 500 no filtra detalles).
- 415 en el login con cuerpo no JSON: aceptable y deseable (cierra el vector de formulario cross-site; verificado 415/400 para `text/plain` y `x-www-form-urlencoded`). R24 se sigue cumpliendo para JSON inválido.
- Tests de f0 adaptados (`env-example` R28 = unión de claves de `ENV_KEYS`, `DATABASE_ENV_KEYS` y `AUTH_ENV_KEYS`; `app.test.ts` y `start.int.test.ts` a la firma async y a las variables obligatorias): aceptable, no se debilita ninguna aserción (siguen comprobando las mismas propiedades; el design de f1 sec. 11 anticipaba ampliar `.env.example`). Conviene que el leader anote la ampliación de f0 R28 en `progress/`.
- `node:sqlite` en lugar de `better-sqlite3` (decisión del leader): aceptable. Stores tras interfaz, suite de contrato común contra ambas implementaciones, migraciones idempotentes, WAL + `foreign_keys`, sentencias preparadas (no hay interpolación de SQL en `src/server/stores/sqlite`), y BD + WAL sin PIN ni token en claro (el test de integración escanea los bytes).
- Otras (`recordFailure` devuelve `{lockedUntil}`, `warmUp()`, inactividad con `>=`, olvido inmediato pasadas 48 h, el cambio de PIN propio reinicia el contador): aceptables y coherentes con R32/R47/R50; ver B-1 para la interacción del olvido inmediato con bloqueos de más de 48 h.

## `engines.node` (no bloqueante)

`package.json` declara `>=22`, pero `node:sqlite` solo existe sin flag desde 22.13; `.npmrc` tiene `engine-strict=true`, así que una versión 22.0 a 22.12 pasaría la comprobación y fallaría al importar. El test de f0 R6 exige literalmente `>=22`. Recomiendo, por este orden: (1) enmienda mínima de la spec de f0 (R6 a `>=22.13`) con su test, porque `engines` es la señal declarativa correcta y `engine-strict` la hace efectiva (spec_author + aprobación humana, una línea); (2) mientras tanto, o como defensa adicional, un guard de arranque en `openDatabase`/`start()` que falle con mensaje claro si `process.versions.node` es menor que 22.13, sin tocar f0; (3) fijar `.nvmrc` (hoy `22`) y el `FROM node:` del Dockerfile de f9 a una versión 22.13 o superior. No cambiar el test de f0 sin pasar por su spec.

## Trazabilidad requirements <-> tests

He localizado cada `R<n>` en un test concreto y leído los de privacidad; los marcados con (M) además se validaron con mutación (el mutante correspondiente muere). Todos los tests citan su `R<n>` en el nombre.

- R1: [x] `account-routes.test.ts` (R1: un GM crea una cuenta player; el cuerpo no puede elegir el rol), `account-service.test.ts`
- R2: [x] `account-routes.test.ts` (R2: nombre repetido), `account-service.test.ts`
- R3: [x] `tests/shared/auth.test.ts`, `account-routes.test.ts` (R3: nombre o PIN inválidos)
- R4: [x] `account-routes.test.ts` (R4: el GM recibe todas las cuentas)
- R5: [x] `account-service.test.ts` (resetPin), `account-routes.test.ts` (R5/R6/R7)
- R6: [x] `account-service.test.ts`, `account-routes.test.ts` (M)
- R7: [x] `account-service.test.ts`, `account-routes.test.ts` (M)
- R8: [x] `account-routes.test.ts` (R8: borra el bloqueo sin cambiar el PIN), `account-service.test.ts`
- R9: [x] `account-service.test.ts`, `account-routes.test.ts` (R9/R10) (M)
- R10: [x] `account-service.test.ts`, `account-routes.test.ts` (R9/R10)
- R11: [x] `account-routes.test.ts` (R11: deshabilitar al GM da 409) (M)
- R12: [x] `account-routes.test.ts` (PUT pin, unlock y PATCH con id inexistente dan 404)
- R13: [x] `account-routes.test.ts` (R13: sin sesión o con token falso, todos los endpoints dan 401)
- R14: [x] `account-routes.test.ts` (R14: un jugador recibe 403) (M: `requireRole` y rutas)
- R15, R16, R17: [x] `account-service.test.ts` (bootstrapFirstGm) (M), `cli/create-gm.test.ts`, `compose.int.test.ts` (CLI real)
- R18: [x] `auth-routes.test.ts` (R18/R19; R18: el GM entra)
- R19: [x] `auth-routes.test.ts`, `auth-service.test.ts`
- R20: [x] `auth-service.test.ts`, `tests/shared/auth.test.ts` (`normalizeName`)
- R21, R22, R23: [x] `auth-routes.test.ts` (R21-R23: mismo estado y mismo cuerpo), `auth-service.test.ts`
- R24: [x] `auth-routes.test.ts` (2 tests R24), `tests/shared/auth.test.ts`
- R25: [x] `auth-routes.test.ts` (R25) (M: httpOnly y SameSite)
- R26: [x] `auth-routes.test.ts` (R26) (M)
- R27: [x] `session-token.test.ts`
- R28: [x] `auth-service.test.ts` (inspecciona el fake) (M), `compose.int.test.ts` (bytes de la BD)
- R29: [x] `auth-plugin.test.ts` (R29: el rol se lee de la cuenta; la cookie no contiene ni el rol ni el id)
- R30: [x] `auth-plugin.test.ts` (R30: sin cookie o con token desconocido o manipulado)
- R31, R32: [x] `auth-service.test.ts` (`FakeClock`), `auth-plugin.test.ts` (M)
- R33: [x] `auth-service.test.ts`, `auth-plugin.test.ts` (R29/R33) (M)
- R34: [x] `auth-service.test.ts` (`FakeClock`, `touch` a 60 s)
- R35, R36, R37: [x] `auth-routes.test.ts` (R35, R36, R37)
- R38: [x] `auth-service.test.ts`, `auth-routes.test.ts` (M)
- R39: [x] `auth-routes.test.ts` (R39)
- R40: [x] `auth-service.test.ts`, `auth-routes.test.ts` (R40) (M)
- R41, R42, R44, R45, R46, R47, R50: [x] `login-throttle.test.ts` (M: `check`, escalado y reset tras login), `keyed-mutex.test.ts` de apoyo
- R43: [x] `auth-routes.test.ts` (R43) y `auth-service.test.ts` (espía sin llamadas)
- R48: [x] `auth-service.test.ts` (`Promise.all`, como máximo 5 verificaciones) (M sin mutex); confirmado además con 24 logins reales concurrentes
- R49: [x] `auth-service.test.ts` (M sin dummy-verify)
- R51 a R56: [x] `pin-hasher.test.ts` (M: sal fija y sin pepper)
- R57: [x] `account-service.test.ts` y `compose.int.test.ts` (escanea bytes de BD y WAL)
- R58: [x] `auth-routes.test.ts`, `account-routes.test.ts` (M: devolver hash)
- R59: [x] `auth-routes.test.ts` (4 tests; ver N-1)
- R60, R61: [x] `config.test.ts`
- R62: [x] `origin-guard.test.ts` (6 tests) (M)
- R63: [x] `account-routes.test.ts` (R63)
- R64: [x] `account-routes.test.ts` (R64: jugador A pidiendo a jugador B) y `describeOwnershipMatrix` (M: sin `authorizeOrDeny` y con el `ownerId` del actor)
- R65: [x] `account-routes.test.ts` (R65)
- R66 a R74: [x] `policy.test.ts` (tabla actor x dueño x regla) (M de política)
- R75, R76, R77: [x] `http-denial.test.ts` (M: 404 a 403)
- R78: [x] `auth-plugin.test.ts` (R78: ruta ficticia sin guarda y variantes de URL) (M del hook)
- R79 a R85: [x] `event-filter.test.ts` (M: vista sustituta y audiencia none)
- R86: [x] `tsc` (typecheck verde) y cableado en `compose.int.test.ts` y `app.test.ts` (la spec acepta `tsc` + R87; ningún test lleva la etiqueta R86)
- R87, R88, R89: [x] `stores/*.contract.ts` ejecutadas desde `in-memory-*.test.ts` y `sqlite-stores.int.test.ts` (M: `deleteAllForUser` en SQLite)
- R90: [x] `stores/sqlite/migrations.int.test.ts`
- R91: [x] `sqlite-stores.int.test.ts`, `compose.int.test.ts` (reinicio)
- R92: [x] `auth-routes.test.ts` (R92)

## Tasks completas

T1 a T21: [x] todas (22 marcas `[x]` y 0 `[ ]` en `specs/f1-auth-roles/tasks.md`). Verificado además que lo que dicen existe: T18 (`tests/helpers/ownership-matrix.ts` y su autotest `ownership-matrix.test.ts`), T19 (`compose.ts` como único punto de composición, `src/server/cli/create-gm.ts`, script `create-gm` ya presente en `package.json`), T20 (`docs/architecture.md` sec. 6 con el contrato `authz`, `projectEventFor` y `ownership-matrix`; la matización de que el GM lee todo salvo notas personales ya consta), T21 (sin `console.*`, TODO ni FIXME en `src/server`, `src/shared` ni `tests`; tabla R a test completa en `progress/impl_f1-auth-roles.md`).

## Arquitectura, convenciones, higiene

- Capas: `src/server` no importa de `web`; `src/shared`, `src/rules` y `src/data` no importan de `server` (grep limpio; solo comentarios). `src/shared/auth.ts` depende solo de `zod`. Interfaces `UserStore`, `SessionStore` y `LoginAttemptStore` con implementaciones `Sqlite*` e `InMemory*` según la convención de nombres; `Clock` y `PinHasher` tras interfaz.
- Errores como `Result` o unión discriminada en servicios y stores; los errores de infraestructura lanzan.
- Dependencias: la única nueva es `@fastify/cookie` 11.1.3, pineada y en el lock; sin rastro de `better-sqlite3` en `package.json` ni `package-lock.json`.
- Secretos: `.env` ignorado por git (`git check-ignore`); `.env.example` solo lleva el marcador evidente `change-me-...` (ver M-1); ningún secreto en `src/` ni `tests/`. Los tests usan `tmpdir`; el repo no contiene `data/` ni `*.sqlite` tras mis ejecuciones.
- Prettier y ESLint limpios.

## Checkpoints

- C1.1 Archivos base (`AGENTS.md`, `init.sh`, `feature-list.json`, `progress/current.md`): [x]
- C1.2 Los 4 docs: [x]
- C1.3 `./init.sh` exit 0: [ ] NO verificado por mí (prohibido por la regla de concurrencia de f3); sus componentes (tests unitarios y de integración, typecheck, eslint global, prettier) están verdes. Pendiente de que lo ejecute el leader al cerrar.
- C2.1 Como mucho una feature `in_progress`: [ ] literalmente no (f1, f2 y f3 están `in_progress`); lo ampara `rules.parallel_policy` de `feature-list.json` (decisión del humano, carpetas disjuntas). No imputable a f1.
- C2.2 Toda feature `done` tiene tests que pasan: [x] (f0 está `done` y sus tests pasan, incluidos los adaptados)
- C2.3 `progress/current.md` vacío o describe la sesión activa: [x] (describe la sesión de la oleada; algo desactualizado, lo actualizará el leader)
- C3.1 Capas respetadas: [x]
- C3.2 Servicios externos tras interfaz, sin acceso directo a infraestructura fuera de su capa: [x] (`node:sqlite` solo en `src/server/stores/sqlite`)
- C3.3 Dependencias pineadas y mínimas: [x]
- C3.4 Sin debug prints, secretos ni TODOs sin contexto: [x] (ver M-1 sobre el marcador del pepper)
- C4.1 Un test por módulo: [x] (`sqlite/database.ts` y `database-config.ts` se cubren con los `*.int.test.ts` y `compose.int.test.ts`)
- C4.2 Lógica con fakes; lo que necesita servicios reales es `integration`: [x]
- C4.3 Suite no-integration con más de 0 tests y verde: [x] (324 en `tests/server` y `tests/shared`)
- C5.1 Carpeta `specs/f1-auth-roles/` con los 3 ficheros: [x]
- C5.2 `requirements.md` en EARS: [x]
- C5.3 Tasks todas `[x]`: [x] (22 de 22; la feature sigue `in_progress` hasta que el leader la cierre)
- C5.4 Cada `R<n>` cubierto por al menos un test: [x] (R1 a R92)

## Cambios requeridos

Ninguno bloqueante. Seguimiento recomendado al leader, por orden: M-1 y M-2 antes del despliegue (f9) o como mini-tarea de endurecimiento de f1; B-1 y B-3 son cambios de pocas líneas; B-2 con el índice y la limitación de la purga; I-2 al implementar `f1b-auth-ui`; la enmienda de `engines.node` (R6 de f0) según la recomendación de arriba. Pasos de cierre del leader: ejecutar `./init.sh`, actualizar `progress/current.md` y `progress/history.md` y marcar `done` en `feature-list.json`.
