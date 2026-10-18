# Requirements — f1-auth-roles

> Feature: **Autenticación por nombre+PIN y roles (jugador/GM)** (`sdd: true`,
> depende de `f0-project-skeleton`). Notación EARS (ver `docs/specs.md`).
> Cada `R<n>` es estable y verificable con al menos un test. Los puntos abiertos
> están en `design.md` §13 (Q1–Q12) con su recomendación por defecto; **este
> documento asume esas recomendaciones**.

## 1. Contexto y alcance

Campaña de 7 jugadores + 1 GM. El GM crea las cuentas; el login es nombre + PIN
(corto, por tanto hay que limitar la fuerza bruta); la sesión viaja en cookie
`httpOnly`. El núcleo reutilizable por todas las features futuras (ficha, notas,
combate) es la **política de autorización centralizada** y el **filtrado por rol
de eventos en tiempo real (SSE)**.

**Dentro de alcance:** `src/shared` (tipos/schemas de auth), `src/server/auth`,
`src/server/authz`, `src/server/stores` (User/Session/LoginAttempt), rutas HTTP de
auth y cuentas, filtrado de eventos, CLI de bootstrap del primer GM.

**Fuera de alcance:** pantallas web de login y de gestión de cuentas (Q1: feature
aparte propuesta `f1b-auth-ui`), el transporte SSE y el `RealtimeBus` (f5; f1 solo
entrega el filtro puro que f5 DEBE usar), ficha/notas/combate (cada feature define
sus recursos y registra sus reglas de tipo, ver `design.md` §7), recuperación de
PIN por el propio jugador (lo hace el GM).

## 2. Glosario

- **Cuenta**: `{ id, name, role, disabled, createdAt }` + hash de PIN (nunca expuesto).
- **Rol**: `player` | `gm`.
- **Actor**: `{ userId, role }` resuelto desde una sesión válida.
- **Clave de nombre**: `name` normalizado (NFC, sin espacios exteriores, minúsculas).
- **Recurso**: `{ kind, ownerId? }`. Cada `kind` tiene una regla (`ResourceKindRule`,
  `design.md` §7) con `scope` `owned` | `shared`.
- **Vista**: variante del payload de un evento destinada a una audiencia
  (`gm` | `owner` | `others`).

## 3. Requisitos

### 3.1 Gestión de cuentas por el GM

- **R1.** CUANDO un GM autenticado envía `POST /api/accounts` con un nombre y un PIN
  válidos, el sistema DEBE crear una cuenta con rol `player` y habilitada.
  _Test:_ `tests/server/http/account-routes.test.ts`.
- **R2.** SI el nombre de la cuenta a crear tiene la misma clave de nombre que una cuenta
  existente, ENTONCES el sistema DEBE responder 409 con código `name_taken` y no crear
  la cuenta. _Test:_ `account-routes.test.ts`, `account-service.test.ts`.
- **R3.** SI el nombre no cumple 1–32 caracteres tras recortar espacios sin caracteres de
  control, o el PIN no cumple 4–8 dígitos (`^\d{4,8}$`), ENTONCES el sistema DEBE responder
  400 con código `validation_error` y no crear la cuenta. _Test:_ `src/shared` schema test +
  `account-routes.test.ts`.
- **R4.** CUANDO un GM autenticado envía `GET /api/accounts`, el sistema DEBE devolver todas
  las cuentas con `id`, `name`, `role`, `disabled` y `createdAt`. _Test:_ `account-routes.test.ts`.
- **R5.** CUANDO un GM autenticado envía `PUT /api/accounts/:id/pin` con un PIN válido, el
  sistema DEBE sustituir el hash de PIN de esa cuenta por el hash del nuevo PIN.
  _Test:_ `account-service.test.ts`.
- **R6.** CUANDO se restablece el PIN de una cuenta, el sistema DEBE revocar todas las
  sesiones de esa cuenta. _Test:_ `account-service.test.ts`.
- **R7.** CUANDO se restablece el PIN de una cuenta, el sistema DEBE borrar el estado de
  bloqueo por intentos de esa cuenta. _Test:_ `account-service.test.ts`.
- **R8.** CUANDO un GM autenticado envía `POST /api/accounts/:id/unlock`, el sistema DEBE
  borrar el estado de bloqueo por intentos de esa cuenta sin cambiar su PIN.
  _Test:_ `account-service.test.ts`, `account-routes.test.ts`.
- **R9.** CUANDO un GM autenticado deshabilita una cuenta con rol `player`
  (`PATCH /api/accounts/:id` con `{ "disabled": true }`), el sistema DEBE marcarla como
  deshabilitada y revocar todas sus sesiones. _Test:_ `account-service.test.ts`.
- **R10.** CUANDO un GM autenticado habilita una cuenta deshabilitada
  (`PATCH /api/accounts/:id` con `{ "disabled": false }`), el sistema DEBE marcarla como
  habilitada. _Test:_ `account-service.test.ts`.
- **R11.** SI un GM intenta deshabilitar una cuenta con rol `gm`, ENTONCES el sistema DEBE
  responder 409 con código `cannot_disable_gm` y no modificar la cuenta.
  _Test:_ `account-routes.test.ts`.
- **R12.** SI un endpoint de gestión de cuentas (`/api/accounts` y subrutas, salvo
  `GET /api/accounts/:id`, ver R63–R65) recibe un id de cuenta inexistente, ENTONCES el
  sistema DEBE responder 404 con código `not_found`. _Test:_ `account-routes.test.ts`.
- **R13.** SI una petición sin sesión válida invoca un endpoint de gestión de cuentas,
  ENTONCES el sistema DEBE responder 401 y no ejecutar la operación.
  _Test:_ `account-routes.test.ts`.
- **R14.** SI una petición con sesión de rol `player` invoca un endpoint exclusivo del GM
  (`GET /api/accounts`, `POST /api/accounts`, `PUT /api/accounts/:id/pin`,
  `POST /api/accounts/:id/unlock`, `PATCH /api/accounts/:id`), ENTONCES el sistema DEBE
  responder 403 con código `forbidden` y no ejecutar la operación.
  _Test:_ `account-routes.test.ts`.

### 3.2 Alta del primer GM (bootstrap)

- **R15.** CUANDO se invoca `bootstrapFirstGm` con un nombre y un PIN válidos y no existe
  ninguna cuenta con rol `gm`, el sistema DEBE crear una cuenta con rol `gm`.
  _Test:_ `account-service.test.ts`.
- **R16.** SI se invoca `bootstrapFirstGm` y ya existe una cuenta con rol `gm`, ENTONCES el
  sistema DEBE devolver el error `gm_exists` y no crear ninguna cuenta.
  _Test:_ `account-service.test.ts`.
- **R17.** SI el nombre o el PIN pasados a `bootstrapFirstGm` no cumplen el formato de R3,
  ENTONCES el sistema DEBE devolver el error `validation_error` y no crear ninguna cuenta.
  _Test:_ `account-service.test.ts`.

### 3.3 Login y sesión

- **R18.** CUANDO se recibe `POST /api/auth/login` con el nombre y el PIN correctos de una
  cuenta habilitada y no bloqueada, el sistema DEBE responder 200 con `{ id, name, role }`
  de la cuenta. _Test:_ `tests/server/http/auth-routes.test.ts`.
- **R19.** CUANDO el login es correcto, el sistema DEBE crear una sesión nueva en el
  `SessionStore` y establecer la cookie de sesión en la respuesta.
  _Test:_ `auth-routes.test.ts`, `auth-service.test.ts`.
- **R20.** CUANDO el nombre recibido en el login difiere del de la cuenta solo en
  mayúsculas/minúsculas o en espacios exteriores, el sistema DEBE tratarlo como el mismo
  nombre. _Test:_ `auth-service.test.ts`.
- **R21.** SI el login recibe un nombre desconocido, ENTONCES el sistema DEBE responder 401
  con código `invalid_credentials`. _Test:_ `auth-routes.test.ts`.
- **R22.** SI el login recibe un PIN incorrecto para una cuenta existente, ENTONCES el
  sistema DEBE responder 401 con el mismo código y el mismo cuerpo que en R21.
  _Test:_ `auth-routes.test.ts` (compara cuerpos).
- **R23.** SI el login recibe credenciales correctas de una cuenta deshabilitada, ENTONCES el
  sistema DEBE responder 401 con el mismo código y el mismo cuerpo que en R21 y no crear
  sesión. _Test:_ `auth-routes.test.ts`.
- **R24.** SI el cuerpo del login no es un objeto con `name` (1–64 caracteres) y `pin`
  (cadena de 1–64 caracteres), ENTONCES el sistema DEBE responder 400 con código
  `validation_error` y no evaluar credenciales. _Test:_ `auth-routes.test.ts`.
- **R25.** La cookie de sesión DEBE establecerse con los atributos `HttpOnly`,
  `SameSite=Strict`, `Path=/` y `Max-Age` igual a la vida absoluta de la sesión en segundos.
  _Test:_ `auth-routes.test.ts`.
- **R26.** DONDE la configuración `AUTH_COOKIE_SECURE` es `true`, el sistema DEBE añadir el
  atributo `Secure` a la cookie de sesión. _Test:_ `auth-routes.test.ts`.
- **R27.** El sistema DEBE generar cada token de sesión con 32 bytes aleatorios de
  `node:crypto`, distintos en cada login (codificados en base64url). _Test:_
  `tests/server/auth/session-token.test.ts`.
- **R28.** El sistema DEBE persistir en el `SessionStore` únicamente el SHA-256 (hex) del
  token de sesión y no el token. _Test:_ `auth-service.test.ts` (inspecciona el fake).
- **R29.** CUANDO una petición a `/api/*` lleva una cookie de sesión vigente, el sistema DEBE
  resolver el actor con el `userId` de la sesión y el rol leído de la cuenta almacenada
  (no de la cookie). _Test:_ `tests/server/http/auth-plugin.test.ts`.
- **R30.** SI una petición a una ruta protegida no lleva cookie de sesión o lleva un token
  desconocido, ENTONCES el sistema DEBE responder 401 con código `unauthenticated`.
  _Test:_ `auth-plugin.test.ts`.
- **R31.** SI han transcurrido 30 días desde la creación de la sesión, ENTONCES el sistema
  DEBE responder 401 `unauthenticated` y borrar la sesión del `SessionStore`.
  _Test:_ `auth-service.test.ts` (`FakeClock`).
- **R32.** SI han transcurrido 7 días desde la última actividad de la sesión, ENTONCES el
  sistema DEBE responder 401 `unauthenticated` y borrar la sesión del `SessionStore`.
  _Test:_ `auth-service.test.ts` (`FakeClock`).
- **R33.** SI la cuenta de una sesión está deshabilitada o ya no existe, ENTONCES el sistema
  DEBE responder 401 `unauthenticated`. _Test:_ `auth-service.test.ts`.
- **R34.** CUANDO se autentica una petición y han pasado más de 60 segundos desde el
  `lastSeenAt` de la sesión, el sistema DEBE actualizar `lastSeenAt` al instante actual.
  _Test:_ `auth-service.test.ts` (`FakeClock`).
- **R35.** CUANDO se recibe `POST /api/auth/logout` con una sesión vigente, el sistema DEBE
  borrar esa sesión del `SessionStore` y responder 204 con la cookie expirada
  (`Max-Age=0`). _Test:_ `auth-routes.test.ts`.
- **R36.** CUANDO se recibe `POST /api/auth/logout` sin sesión válida, el sistema DEBE
  responder 204 sin error. _Test:_ `auth-routes.test.ts`.
- **R37.** CUANDO una petición autenticada envía `GET /api/auth/me`, el sistema DEBE
  responder 200 con `{ id, name, role }` del actor. _Test:_ `auth-routes.test.ts`.
- **R38.** CUANDO una petición autenticada envía `PUT /api/auth/pin` con el PIN actual
  correcto y un PIN nuevo válido, el sistema DEBE sustituir el hash de PIN de su cuenta
  y revocar todas sus sesiones salvo la actual. _Test:_ `auth-service.test.ts`,
  `auth-routes.test.ts`.
- **R39.** SI `PUT /api/auth/pin` recibe un PIN actual incorrecto, ENTONCES el sistema DEBE
  responder 403 con código `invalid_current_pin` y no modificar el hash.
  _Test:_ `auth-routes.test.ts`.
- **R40.** SI `PUT /api/auth/pin` recibe un PIN actual incorrecto, ENTONCES el sistema DEBE
  contarlo como un intento fallido del mismo límite de intentos que el login (R41–R50).
  _Test:_ `auth-service.test.ts`.
- **R92.** SI `PUT /api/auth/pin` recibe un PIN nuevo con formato inválido (R3), ENTONCES el
  sistema DEBE responder 400 `validation_error` y no modificar el hash.
  _Test:_ `auth-routes.test.ts`.

### 3.4 Límite de intentos (anti fuerza bruta)

Parámetros por defecto (configurables, Q6): 5 fallos consecutivos, bloqueo base de 15 min,
duplicado en cada bloqueo sucesivo con tope de 24 h, olvido tras 48 h sin actividad.

- **R41.** El sistema DEBE contar los intentos fallidos consecutivos por clave de nombre,
  existan o no la cuenta. _Test:_ `tests/server/auth/login-throttle.test.ts`.
- **R42.** CUANDO se registra el 5.º intento fallido consecutivo de una clave de nombre, el
  sistema DEBE bloquear esa clave durante 15 minutos. _Test:_ `login-throttle.test.ts`
  (`FakeClock`).
- **R43.** MIENTRAS una clave de nombre está bloqueada, el sistema DEBE responder 429 con
  código `locked` y cabecera `Retry-After` (segundos restantes) sin verificar el PIN, aunque
  el PIN sea correcto. _Test:_ `auth-routes.test.ts`, `auth-service.test.ts` (el fake de
  `PinHasher` no recibe llamadas).
- **R44.** MIENTRAS una clave de nombre está bloqueada, el sistema NO DEBE incrementar su
  contador de fallos. _Test:_ `login-throttle.test.ts`.
- **R45.** CUANDO se produce un bloqueo sucesivo de la misma clave sin login correcto
  intermedio, el sistema DEBE duplicar la duración del bloqueo anterior hasta un máximo de
  24 horas. _Test:_ `login-throttle.test.ts` (15 min, 30 min, 60 min, … 24 h tope).
- **R46.** CUANDO transcurre la duración del bloqueo, el sistema DEBE permitir nuevos
  intentos con el contador de fallos a 0. _Test:_ `login-throttle.test.ts`.
- **R47.** CUANDO un login es correcto, el sistema DEBE reiniciar contador de fallos y nivel
  de bloqueo de esa clave de nombre. _Test:_ `login-throttle.test.ts`.
- **R48.** SI llegan simultáneamente más de 5 peticiones de login con PIN incorrecto para la
  misma clave de nombre, ENTONCES el sistema DEBE verificar el PIN como máximo 5 veces antes
  de bloquear. _Test:_ `auth-service.test.ts` (`Promise.all` + contador en el fake de
  `PinHasher`).
- **R49.** SI el login recibe un nombre desconocido o una cuenta deshabilitada, ENTONCES el
  sistema DEBE ejecutar igualmente una verificación de PIN contra un hash ficticio para
  igualar el coste de la respuesta. _Test:_ `auth-service.test.ts` (el fake de `PinHasher`
  recibe exactamente una llamada).
- **R50.** CUANDO transcurren 48 horas sin actividad de una clave de nombre, el sistema DEBE
  eliminar su estado de bloqueo en la siguiente purga. _Test:_ `login-throttle.test.ts`
  (`FakeClock`).

### 3.5 Almacenamiento del PIN

- **R51.** El sistema DEBE derivar el hash de PIN con `scrypt` de `node:crypto` con los
  parámetros por defecto `N=32768`, `r=8`, `p=3`, longitud de clave de 32 bytes y sal de 16
  bytes. _Test:_ `tests/server/auth/pin-hasher.test.ts`.
- **R52.** El sistema DEBE usar una sal aleatoria distinta en cada hash, de modo que dos hashes
  del mismo PIN sean distintos. _Test:_ `pin-hasher.test.ts`.
- **R53.** El sistema DEBE codificar el hash de forma autodescriptiva (versión, `N`, `r`, `p`,
  sal y clave), y `verify` DEBE usar los parámetros contenidos en el hash almacenado.
  _Test:_ `pin-hasher.test.ts` (hash creado con parámetros A se verifica en un hasher con
  parámetros B).
- **R54.** El sistema DEBE derivar el hash a partir del HMAC-SHA256 del PIN con el pepper
  `AUTH_PEPPER`, de modo que un hash verificado con un pepper distinto sea rechazado.
  _Test:_ `pin-hasher.test.ts`.
- **R55.** CUANDO `verify` recibe el PIN correcto, el sistema DEBE devolver `true`; CUANDO
  recibe uno incorrecto, `false`. _Test:_ `pin-hasher.test.ts`.
- **R56.** SI `verify` recibe un hash almacenado con formato inválido, ENTONCES el sistema
  DEBE devolver `false` sin lanzar excepción. _Test:_ `pin-hasher.test.ts`.
- **R57.** El sistema NO DEBE persistir el PIN en claro en ningún store ni fichero.
  _Test:_ `account-service.test.ts` (serializa el contenido completo del `InMemoryUserStore`
  y busca el PIN) + `sqlite-user-store.int.test.ts` (volcado de la BD).
- **R58.** El sistema NO DEBE incluir el PIN ni el hash de PIN en el cuerpo de ninguna
  respuesta HTTP. _Test:_ `account-routes.test.ts`, `auth-routes.test.ts` (recorre todas las
  respuestas buscando el PIN y el prefijo del hash).
- **R59.** El sistema NO DEBE escribir el PIN en los logs. _Test:_ `auth-routes.test.ts`
  (logger Fastify con destino capturado; login correcto e incorrecto).

### 3.6 Configuración y protección CSRF

- **R60.** CUANDO `parseAuthConfig` recibe un entorno válido, el sistema DEBE devolver un
  resultado `ok` con las claves `AUTH_PEPPER`, `AUTH_COOKIE_SECURE`, `AUTH_ALLOWED_ORIGINS`
  y los TTL/umbrales con sus valores por defecto (R25, R31, R32, R34, R42, R45, R50).
  _Test:_ `tests/server/auth/config.test.ts`.
- **R61.** SI `parseAuthConfig` recibe `AUTH_PEPPER` ausente o con menos de 32 caracteres, o
  `AUTH_ALLOWED_ORIGINS` vacío o con una entrada que no es un origen `http(s)://host[:puerto]`,
  ENTONCES el sistema DEBE devolver un resultado `err` que nombra la variable inválida sin
  incluir su valor. _Test:_ `config.test.ts`.
- **R62.** SI una petición con método distinto de GET, HEAD u OPTIONS lleva una cabecera
  `Origin` que no está en `AUTH_ALLOWED_ORIGINS`, ENTONCES el sistema DEBE responder 403 con
  código `bad_origin` sin ejecutar el manejador. _Test:_ `tests/server/http/origin-guard.test.ts`.

### 3.7 Autorización: acceso a recursos concretos (política central)

Modelo y reglas por tipo de recurso: `design.md` §7. Las pruebas de política usan tipos de
recurso de prueba definidos en el propio test (`test_sheet`, `test_private_note`,
`test_shared`).

- **R63.** CUANDO un actor `player` lee una cuenta propia (`GET /api/accounts/:id` con su id),
  el sistema DEBE responder 200 con `{ id, name, role }` de la cuenta.
  _Test:_ `account-routes.test.ts`.
- **R64.** SI un actor `player` pide `GET /api/accounts/:id` con el id de otro jugador,
  ENTONCES el sistema DEBE responder con el mismo estado y cuerpo que para un id inexistente
  (404 `not_found`). _Test:_ `account-routes.test.ts` (**jugador A no lee a jugador B**; compara
  la respuesta con la de un id inexistente).
- **R65.** CUANDO un actor `gm` pide `GET /api/accounts/:id` con el id de cualquier cuenta, el
  sistema DEBE responder 200 con `{ id, name, role }`. _Test:_ `account-routes.test.ts`.
- **R66.** CUANDO `canRead` evalúa un recurso de `scope` `owned` cuyo `ownerId` es el
  `userId` del actor (con cualquier rol), el sistema DEBE devolver `true`.
  _Test:_ `tests/server/authz/policy.test.ts`.
- **R67.** SI `canRead` o `canWrite` evalúan un recurso de `scope` `owned` y un actor `player`
  cuyo `userId` no es el `ownerId`, ENTONCES el sistema DEBE devolver `false`, sea cual sea la
  regla del tipo de recurso. _Test:_ `policy.test.ts` (**jugador A no lee ni escribe lo de B**,
  tabla parametrizada por regla).
- **R68.** CUANDO `canRead` evalúa un recurso de `scope` `owned` y un actor `gm` que no es el
  propietario, el sistema DEBE devolver el valor `gmRead` de la regla del tipo.
  _Test:_ `policy.test.ts` (`test_sheet` con `gmRead=true`; `test_private_note` con
  `gmRead=false`).
- **R69.** CUANDO `canWrite` evalúa un recurso de `scope` `owned` y el actor es el propietario,
  el sistema DEBE devolver el valor `ownerWrite` de la regla del tipo. _Test:_ `policy.test.ts`.
- **R70.** CUANDO `canWrite` evalúa un recurso de `scope` `owned` y un actor `gm` que no es el
  propietario, el sistema DEBE devolver el valor `gmWrite` de la regla del tipo.
  _Test:_ `policy.test.ts`.
- **R71.** CUANDO `canRead` evalúa un recurso de `scope` `shared`, el sistema DEBE devolver
  `true` para cualquier actor autenticado. _Test:_ `policy.test.ts`.
- **R72.** CUANDO `canWrite` evalúa un recurso de `scope` `shared`, el sistema DEBE devolver
  el valor `gmWrite` de la regla del tipo para un actor `gm` y `false` para un actor
  `player`. _Test:_ `policy.test.ts`.
- **R73.** SI `canRead` o `canWrite` reciben un recurso cuyo `kind` no está registrado, o de
  `scope` `owned` sin `ownerId`, ENTONCES el sistema DEBE devolver `false` para cualquier
  actor, incluido el GM. _Test:_ `policy.test.ts`.
- **R74.** SI se combinan conjuntos de reglas que registran el mismo `kind` dos veces,
  ENTONCES `mergeKindRules` DEBE lanzar un error que nombra el `kind` duplicado.
  _Test:_ `policy.test.ts`.
- **R75.** SI `authorizeOrDeny` evalúa una lectura que `canRead` deniega, ENTONCES el sistema
  DEBE devolver el estado 404 y el cuerpo `not_found` (idénticos a los de un recurso
  inexistente). _Test:_ `tests/server/authz/http-denial.test.ts`.
- **R76.** SI `authorizeOrDeny` evalúa una escritura que `canWrite` deniega sobre un recurso
  que `canRead` permite, ENTONCES el sistema DEBE devolver el estado 403 y el cuerpo
  `forbidden`. _Test:_ `http-denial.test.ts`.
- **R77.** SI `authorizeOrDeny` evalúa una escritura sobre un recurso que `canRead` deniega,
  ENTONCES el sistema DEBE devolver el estado 404 y el cuerpo `not_found`.
  _Test:_ `http-denial.test.ts`.
- **R78.** SI una petición sin sesión válida llega a una ruta bajo `/api` que no está en la
  lista de rutas públicas (`POST /api/auth/login`, `POST /api/auth/logout`, `GET /health`),
  ENTONCES el sistema DEBE responder 401 `unauthenticated` aunque la ruta no declare ninguna
  guarda propia. _Test:_ `auth-plugin.test.ts` (ruta ficticia registrada sin guarda).

### 3.8 Autorización: filtrado por rol de eventos en tiempo real (SSE)

Un evento lleva un recurso y hasta tres vistas del payload (`gm`, `owner`, `others`).
`projectEventFor(policy, actor, event)` devuelve el payload que ese actor puede recibir o
`null`. El transporte SSE (f5) DEBE emitir a cada conexión solo lo que devuelva esta función.

- **R79.** CUANDO el actor es el propietario de un recurso `owned` del evento, el sistema DEBE
  devolver la vista `owner`. _Test:_ `tests/server/authz/event-filter.test.ts`.
- **R80.** SI el actor es un `player` que no es el propietario de un recurso `owned` del evento,
  ENTONCES el sistema DEBE devolver `null` aunque el evento incluya las vistas `gm` y
  `others`. _Test:_ `event-filter.test.ts` (**el payload de A no llega a B**).
- **R81.** CUANDO el actor es `gm` sin ser el propietario de un recurso `owned` cuya regla tiene
  `gmRead=true`, el sistema DEBE devolver la vista `gm`. _Test:_ `event-filter.test.ts`.
- **R82.** SI el actor es `gm` sin ser el propietario de un recurso `owned` cuya regla tiene
  `gmRead=false`, ENTONCES el sistema DEBE devolver `null`. _Test:_ `event-filter.test.ts`
  (evento de nota privada no llega al GM).
- **R83.** CUANDO el recurso del evento es de `scope` `shared`, el sistema DEBE devolver la
  vista `gm` a un actor `gm` y la vista `others` a un actor `player`.
  _Test:_ `event-filter.test.ts`.
- **R84.** SI la vista que corresponde al actor no existe en el evento, ENTONCES el sistema
  DEBE devolver `null` y no usar otra vista como sustituta. _Test:_ `event-filter.test.ts`.
- **R85.** SI el `kind` del recurso del evento no está registrado, ENTONCES el sistema DEBE
  devolver `null` para cualquier actor. _Test:_ `event-filter.test.ts`.

### 3.9 Stores tras interfaz

- **R86.** El sistema DEBE definir las interfaces `UserStore`, `SessionStore` y
  `LoginAttemptStore` y, para cada una, una implementación SQLite y un fake en memoria.
  _Test:_ comprobación de tipos (`tsc`) + R87.
- **R87.** Cada implementación de `UserStore`, `SessionStore` y `LoginAttemptStore` DEBE
  superar la misma suite de contrato compartida. _Test:_
  `tests/server/stores/*.contract.ts` ejecutadas desde `in-memory-*.test.ts` (unit) y
  `sqlite-*.int.test.ts` (integración).
- **R88.** SI `UserStore.create` recibe una cuenta cuya clave de nombre ya existe, ENTONCES el
  store DEBE devolver `name_taken` sin lanzar excepción y sin modificar los datos
  (la unicidad la garantiza el store, no solo el servicio). _Test:_ contrato `UserStore`.
- **R89.** CUANDO `SessionStore.deleteAllForUser` se invoca con un `userId`, el store DEBE
  eliminar todas las sesiones de ese usuario y ninguna de otro usuario. _Test:_ contrato
  `SessionStore`.
- **R90.** CUANDO se aplican las migraciones sobre una base ya migrada, el sistema DEBE
  dejarla sin cambios. _Test:_ `tests/server/stores/sqlite/migrations.int.test.ts`.
- **R91.** CUANDO se reabre un fichero de base de datos SQLite, el sistema DEBE conservar las
  cuentas, sesiones y estados de bloqueo guardados. _Test:_ `sqlite-*.int.test.ts` (directorio
  temporal).

### 3.10 Enmiendas posteriores (revisión de f1b, 2026-10-18)

Añadidos sin renumerar los anteriores. Origen: `progress/review_f1b-auth-ui.md` (H3, H4.1).

- **R93.** SI el nombre de una cuenta a crear contiene algún carácter de las categorías Unicode
  `Cc` (control) o `Cf` (formato: RLO/LRO y demás marcas bidi, ancho cero, BOM interior, guion
  blando...), ENTONCES el sistema DEBE responder 400 `validation_error` y no crear la cuenta
  (amplía R3). Los nombres válidos existentes no cambian. _Test:_ `tests/shared/auth.test.ts`,
  `account-service.test.ts`, `account-routes.test.ts` (y R61 de f1b en la UI).
  _Nota:_ también se rechazan ZWJ/ZWNJ (U+200D/U+200C), por lo que no se admiten emoji compuestos
  por secuencias ZWJ ni palabras persas con ZWNJ en nombres de cuenta; un BOM (U+FEFF) en los
  extremos se recorta como cualquier espacio.
- **R94.** El sistema DEBE normalizar el nombre de cuenta a NFC (tras recortar y antes de medir
  los 32 caracteres) y almacenarlo así, de modo que dos nombres canónicamente equivalentes
  («Café» precompuesto y «Cafe» + acento combinante) tengan la misma clave y el segundo dé
  `name_taken` (R2). _Test:_ `tests/shared/auth.test.ts`, `account-service.test.ts`,
  `account-routes.test.ts`.
- **R95.** CUANDO `POST /api/auth/login` es correcto y la petición ya traía una cookie de sesión,
  el sistema DEBE revocar esa sesión del `SessionStore` antes de crear la nueva (la cookie
  anterior pasa a dar 401), sin error alguno si la cookie es inválida, desconocida o está
  caducada, y con la misma respuesta de siempre (R18-R23, sin filtrar la existencia de la
  sesión). Un login fallido NO revoca nada. _Test:_ `auth-service.test.ts`, `auth-routes.test.ts`.

## 4. Cobertura de los criterios de aceptación originales

| Criterio de `acceptance` (feature-list.json) | Requisitos |
|----------------------------------------------|------------|
| El GM crea y gestiona cuentas | R1–R17, R93, R94 |
| Login con nombre+PIN con sesión | R18–R40, R92, R95 |
| …y límite de intentos | R41–R50 (+ R40, R43, R48, R49) |
| PIN almacenado con hash | R51–R59 |
| Política de autorización centralizada: jugador solo lo propio, GM todo | R66–R78, R79–R85 |
| Tests que demuestran que un jugador no puede leer datos de otro | R64, R67, R80 |
| (Soporte transversal) seguridad de cookie/CSRF, config, stores | R25–R28, R60–R62, R86–R91 |
