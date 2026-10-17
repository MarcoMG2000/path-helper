# Design — f1-auth-roles

> CÓMO se construye lo descrito en `requirements.md`. Respeta `docs/architecture.md`
> (§4 swap points, §5 layout, §6 autorización) y `docs/conventions.md`. Las firmas son
> contrato; los cuerpos los escribe el implementer.
> Los comentarios sobre `f0-project-skeleton` son supuestos: si la firma real de f0
> difiere (`composeApp`, `Config`, `Result`), el implementer se adapta **sin modificar los
> requisitos de f0**.

## 1. Resumen de decisiones

| Tema | Decisión |
|------|----------|
| Hash de PIN | `scrypt` de `node:crypto` (sin dependencias) + pepper HMAC-SHA256 desde entorno |
| Sesión | Token aleatorio de 32 bytes en cookie `httpOnly`; en BD solo su SHA-256 |
| Fuerza bruta | Contador por clave de nombre, bloqueo exponencial (15 min ×2, tope 24 h), exclusión mutua por clave |
| Autorización | `AuthorizationPolicy` pura y central; reglas por `kind` de recurso; denegar por defecto |
| SSE | Filtro puro `projectEventFor` sobre eventos con vistas por audiencia; f5 lo usa obligatoriamente |
| Stores | `UserStore`, `SessionStore`, `LoginAttemptStore`; SQLite + fake en memoria; suite de contrato común |
| Rutas | Hook global "denegar por defecto" con lista de rutas públicas |

## 2. Archivos a crear o tocar

```
src/shared/auth.ts                         # Role, schemas zod (login, cuenta, PIN), DTOs, normalizeName
src/server/clock.ts                        # interface Clock + SystemClock   (+ tests/helpers/fake-clock.ts)
src/server/auth/config.ts                  # AuthConfig, parseAuthConfig(env)
src/server/auth/pin-hasher.ts              # interface PinHasher + ScryptPinHasher
src/server/auth/session-token.ts           # generateSessionToken(), hashSessionToken()
src/server/auth/keyed-mutex.ts             # exclusión mutua por clave (login concurrente)
src/server/auth/login-throttle.ts          # LoginThrottle (política de bloqueo sobre LoginAttemptStore)
src/server/auth/auth-service.ts            # login, logout, authenticate, changeOwnPin
src/server/auth/account-service.ts         # create/list/get/resetPin/unlock/setDisabled/bootstrapFirstGm
src/server/authz/policy.ts                 # Actor, Resource, ResourceKindRule, createAuthorizationPolicy, mergeKindRules
src/server/authz/http-denial.ts            # authorizeOrDeny (404/403 uniformes)
src/server/authz/event-filter.ts           # RealtimeEvent, projectEventFor
src/server/authz/kinds.ts                  # reglas de los tipos propios de f1 (solo `account`)
src/server/authz/index.ts                  # barrel
src/server/stores/user-store.ts            # interface UserStore (+ tipos)
src/server/stores/session-store.ts         # interface SessionStore
src/server/stores/login-attempt-store.ts   # interface LoginAttemptStore
src/server/stores/in-memory/*.ts           # InMemoryUserStore, InMemorySessionStore, InMemoryLoginAttemptStore
src/server/stores/sqlite/migrations.ts     # lista ordenada de migraciones + runMigrations(db)
src/server/stores/sqlite/*.ts              # SqliteUserStore, SqliteSessionStore, SqliteLoginAttemptStore
src/server/http/auth-plugin.ts             # plugin Fastify: cookie, onRequest (autenticación deny-by-default), requireRole
src/server/http/origin-guard.ts            # hook CSRF por cabecera Origin
src/server/http/routes/auth-routes.ts      # /api/auth/*
src/server/http/routes/account-routes.ts   # /api/accounts/*
src/server/cli/create-gm.ts                # CLI delgada sobre bootstrapFirstGm
src/server/compose.ts                      # (tocar) único punto de composición
.env.example                               # (tocar) claves AUTH_*
docs/architecture.md                       # (tocar) §6: referencia al contrato authz (ver tasks T20)
tests/...                                  # espejo de src/ (ver §12)
```

Dependencias nuevas (pineadas, solo si faltan tras f0): `@fastify/cookie`, `better-sqlite3` (+
`@types/better-sqlite3`). El hash usa `node:crypto`; `zod` y `fastify` ya son del stack.

## 3. Tipos compartidos (`src/shared/auth.ts`)

```ts
export const ROLES = ['player', 'gm'] as const;
export type Role = (typeof ROLES)[number];

export const nameSchema: z.ZodString;      // trim, 1–32, sin caracteres de control (R3)
export const pinSchema: z.ZodString;       // /^\d{4,8}$/ — SIEMPRE string (ceros a la izquierda)
export const loginBodySchema: z.ZodObject; // { name: string 1–64, pin: string 1–64 }   (R24)
export const createAccountBodySchema;      // { name, pin }
export const resetPinBodySchema;           // { pin }
export const changePinBodySchema;          // { currentPin: string 1–64, newPin }
export const patchAccountBodySchema;       // { disabled: boolean }

export interface UserDto { id: string; name: string; role: Role }                 // R18, R37, R63
export interface AccountDto extends UserDto { disabled: boolean; createdAt: string } // R4 (ISO-8601)
export interface ErrorBody { error: { code: ErrorCode; message: string } }
export type ErrorCode =
  | 'validation_error' | 'unauthenticated' | 'forbidden' | 'not_found' | 'invalid_credentials'
  | 'locked' | 'name_taken' | 'cannot_disable_gm' | 'invalid_current_pin' | 'bad_origin' | 'gm_exists';

export function normalizeName(name: string): string; // NFC → trim → toLowerCase()  (clave de nombre)
```

`message` es texto en español para depuración; la UI traduce por `code` (i18n en `src/web`).

## 4. Hash de PIN (`pin-hasher.ts`)

```ts
export interface PinHasher {
  hash(pin: string): Promise<string>;
  verify(pin: string, stored: string): Promise<boolean>;
}
export interface ScryptParams { N: number; r: number; p: number; keyLen: number; saltLen: number }
export const DEFAULT_SCRYPT_PARAMS: ScryptParams; // { N: 32768, r: 8, p: 3, keyLen: 32, saltLen: 16 }
export class ScryptPinHasher implements PinHasher {
  constructor(pepper: string, params?: ScryptParams);
}
```

- Entrada a scrypt: `HMAC-SHA256(key = pepper, msg = pin)` (32 bytes) — **R54**. Sal: `randomBytes(16)`
  por hash — **R52**.
- Formato almacenado: `scrypt$v1$<N>$<r>$<p>$<saltB64>$<keyB64>` — **R53**. `verify` parsea,
  recalcula con **los parámetros del hash** y compara con `timingSafeEqual`; cualquier fallo de
  parseo devuelve `false` — **R56**.
- `maxmem` explícito = `256 * N * r` (el límite por defecto de Node, 32 MiB, rechaza `N=32768`
  con `r=8`). Se usa la versión asíncrona de `scrypt` (pool de hilos de libuv, no bloquea el
  event loop).
- Parámetros: `N=2^15, r=8, p=3` (~32 MiB por hash) es la configuración equivalente de scrypt de
  la guía OWASP Password Storage Cheat Sheet que cabe en una máquina pequeña de Fly.io; el
  implementer DEBE verificar los valores contra esa guía al implementar y, si difieren, parar y
  anotarlo en `progress/` (no cambiarlos en silencio). Los tests usan un hasher con `N=16` para
  ser rápidos; solo el test de R51 comprueba las constantes de producción.
- **Límite honesto:** un PIN de 4–8 dígitos tiene como mucho 10⁸ candidatos; con la BD filtrada
  y sin pepper, cualquier KDF se rompe en minutos/horas. Mitigaciones: pepper fuera de la BD
  (R54), BD en volumen privado, y límite de intentos online (§6). Está recogido en Q8.

**Alternativa descartada — argon2 (`argon2` npm):** mejor KDF en abstracto, pero añade un
módulo nativo (binarios precompilados o `node-gyp`) que complica el build multi-stage de
Docker/Fly.io y viola "solo lo necesario" (`docs/architecture.md` §8). Con un espacio de PIN tan
pequeño, la diferencia scrypt/argon2 es irrelevante frente al pepper y al límite de intentos.
**bcrypt** descartado: dependencia nativa, trunca a 72 bytes y no es memory-hard.

## 5. Sesiones

```ts
// src/server/auth/session-token.ts
export function generateSessionToken(): string;     // randomBytes(32) → base64url      (R27)
export function hashSessionToken(token: string): string; // sha256 hex                  (R28)

// src/server/stores/session-store.ts
export interface Session { tokenHash: string; userId: string; createdAt: number; lastSeenAt: number; expiresAt: number } // epoch ms
export interface SessionStore {
  create(session: Session): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  touch(tokenHash: string, lastSeenAt: number): Promise<void>;
  delete(tokenHash: string): Promise<void>;
  deleteAllForUser(userId: string, exceptTokenHash?: string): Promise<void>;   // R6, R9, R38, R89
  deleteExpired(now: number, idleCutoff: number): Promise<number>;            // purga oportunista
}
```

- `expiresAt = createdAt + sessionAbsoluteTtlMs` (30 d). Caducidad por inactividad:
  `now - lastSeenAt > sessionIdleTtlMs` (7 d). Ambas comprobadas en `authenticate` (R31, R32).
- `touch` solo si `now - lastSeenAt > sessionTouchIntervalMs` (60 s) para no escribir en cada
  petición (R34).
- Cookie `ph_session` (nombre configurable): `HttpOnly; SameSite=Strict; Path=/;
  Max-Age=<absoluto en s>`; `Secure` si `AUTH_COOKIE_SECURE=true` (R25, R26). El rol **no** va en la
  cookie: se lee de `UserStore` en cada `authenticate` (R29), así deshabilitar o cambiar una
  cuenta surte efecto inmediato.

## 6. Servicios

```ts
// src/server/clock.ts
export interface Clock { now(): number }   // epoch ms
export class SystemClock implements Clock {}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }; // reutilizar el de f0 si existe

// src/server/auth/auth-service.ts
export interface AuthServiceDeps {
  users: UserStore; sessions: SessionStore; attempts: LoginAttemptStore;
  hasher: PinHasher; clock: Clock; config: AuthConfig;
}
export type LoginError =
  | { code: 'invalid_credentials' }
  | { code: 'locked'; retryAfterSeconds: number };
export class AuthService {
  constructor(deps: AuthServiceDeps);
  login(name: string, pin: string): Promise<Result<{ user: UserDto; token: string; maxAgeSeconds: number }, LoginError>>;
  logout(token: string | undefined): Promise<void>;                            // idempotente (R36)
  authenticate(token: string | undefined): Promise<Actor | null>;              // R29–R34
  changeOwnPin(actor: Actor, currentToken: string, currentPin: string, newPin: string):
    Promise<Result<void, { code: 'invalid_current_pin' } | { code: 'locked'; retryAfterSeconds: number }>>; // R38–R40
}
```

Flujo de `login(name, pin)`:

1. `key = normalizeName(name)`.
2. `mutex.runExclusive(key, ...)` (exclusión mutua por clave, `keyed-mutex.ts`; **supuesto:** un
   único proceso Node, que es el despliegue de `docs/architecture.md` §2 — una máquina Fly.io).
   Esto hace correcto el ciclo leer-contar-escribir bajo peticiones concurrentes (R48).
3. `throttle.check(key)`; si está bloqueado → `locked` con `retryAfterSeconds = ceil((lockedUntil-now)/1000)`;
   **no** se verifica el PIN (R43) ni se cuenta (R44).
4. `user = users.findByNameKey(key)`. Si `!user || user.disabled` → `hasher.verify(pin, DUMMY_HASH)`
   (hash ficticio calculado una vez en el arranque con el mismo hasher; R49) y registrar fallo.
5. Si existe y está habilitado: `hasher.verify(pin, user.pinHash)`. Fallo → `throttle.recordFailure(key)`
   y `invalid_credentials` (mismo cuerpo en los tres casos, R21–R23). Éxito → `throttle.reset(key)` (R47),
   crear sesión (R19, R28) y devolver token.
6. Cuando `recordFailure` alcanza el umbral, devuelve el bloqueo creado; la respuesta de **ese** intento
   sigue siendo `invalid_credentials` (el bloqueo se anuncia desde el siguiente intento).

`LoginThrottle` (`login-throttle.ts`) encapsula la política (parámetros de `AuthConfig.lockout`):

```ts
export interface LockoutConfig { maxFailures: 5; baseLockMs: 900_000; maxLockMs: 86_400_000; idleResetMs: 172_800_000 } // defaults
export class LoginThrottle {
  constructor(attempts: LoginAttemptStore, clock: Clock, cfg: LockoutConfig);
  check(key: string): Promise<{ locked: false } | { locked: true; lockedUntil: number }>;
  recordFailure(key: string): Promise<void>;   // failures++; al llegar a maxFailures: level++, lockedUntil = now + min(base*2^(level-1), max), failures = 0
  reset(key: string): Promise<void>;           // R47
  purgeIdle(): Promise<number>;                // R50: borra filas con updatedAt < now - idleResetMs
}
```

Una fila existe por **clave de nombre**, exista o no la cuenta (R41), para que el comportamiento de
bloqueo no revele qué nombres existen. Para acotar el crecimiento por nombres aleatorios: longitud
de nombre ≤ 64 en el login (R24) y `purgeIdle()` invocado en cada fallo registrado.

`changeOwnPin` usa la misma clave y el mismo `LoginThrottle` (R40); tras éxito llama a
`sessions.deleteAllForUser(userId, exceptTokenHash)` (R38).

```ts
// src/server/auth/account-service.ts
export type AccountError =
  | { code: 'name_taken' } | { code: 'validation_error' } | { code: 'not_found' }
  | { code: 'cannot_disable_gm' } | { code: 'gm_exists' };
export class AccountService {
  constructor(deps: Pick<AuthServiceDeps, 'users' | 'sessions' | 'attempts' | 'hasher' | 'clock'>);
  createPlayer(name: string, pin: string): Promise<Result<AccountDto, AccountError>>;      // R1–R3
  list(): Promise<AccountDto[]>;                                                           // R4
  get(id: string): Promise<AccountDto | null>;
  resetPin(id: string, pin: string): Promise<Result<void, AccountError>>;                  // R5–R7
  unlock(id: string): Promise<Result<void, AccountError>>;                                 // R8
  setDisabled(id: string, disabled: boolean): Promise<Result<AccountDto, AccountError>>;   // R9–R11
  bootstrapFirstGm(name: string, pin: string): Promise<Result<AccountDto, AccountError>>;  // R15–R17
}
```

`createPlayer` solo crea rol `player`; el rol `gm` solo nace por `bootstrapFirstGm` (Q10). Los ids son
`crypto.randomUUID()`. `AccountService` valida con los schemas de `src/shared` aunque la ruta ya
valide (defensa en profundidad y para el CLI).

## 7. Autorización central (`src/server/authz`)

Es el contrato que reutilizan f4 (ficha, notas), f5 (combate) y cualquier endpoint futuro.

```ts
// policy.ts
export type Action = 'read' | 'write';
export interface Actor { readonly userId: string; readonly role: Role }
export interface Resource { readonly kind: string; readonly ownerId?: string | null }

export interface ResourceKindRule {
  /** 'owned': pertenece a un jugador (ownerId obligatorio). 'shared': sin dueño, lo leen todos. */
  readonly scope: 'owned' | 'shared';
  readonly ownerWrite: boolean;  // owned: ¿puede el propietario escribir? (leer siempre puede)
  readonly gmRead: boolean;      // owned: ¿puede el GM leer lo ajeno? (shared: ignorado, todos leen)
  readonly gmWrite: boolean;     // ¿puede el GM escribir? (owned ajeno o shared)
}
export type KindRules = Readonly<Record<string, ResourceKindRule>>;
export function mergeKindRules(...sets: KindRules[]): KindRules;   // lanza si hay `kind` duplicado (R74)

export type ReadAudience = 'owner' | 'gm' | 'other' | 'none';
export interface AuthorizationPolicy {
  canRead(actor: Actor, resource: Resource): boolean;
  canWrite(actor: Actor, resource: Resource): boolean;
  /** Qué vista de un evento sobre `resource` puede ver `actor` (base de canRead y del filtro SSE). */
  readAudience(actor: Actor, resource: Resource): ReadAudience;
}
export function createAuthorizationPolicy(rules: KindRules): AuthorizationPolicy;
```

Algoritmo (orden fijo, **denegar por defecto**):

```
rule = rules[resource.kind]; si no existe → deny (R73)
scope 'owned':
  ownerId vacío/ausente → deny, incluso GM (R73)
  actor.userId === ownerId (cualquier rol) → read: allow (audience 'owner'); write: rule.ownerWrite   (R66, R69)
  actor.role === 'gm'     → read: rule.gmRead (audience 'gm'); write: rule.gmWrite                    (R68, R70)
  otro                    → deny                                                                      (R67)
scope 'shared':
  read: allow (audience 'gm' si role gm, si no 'other')            (R71)
  write: role gm && rule.gmWrite                                    (R72)
```

`readAudience` es la única fuente de verdad; `canRead = readAudience !== 'none'`.

**Reglas de tipo.** Cada feature declara las suyas en su propio fichero y `compose.ts` las une con
`mergeKindRules(ACCOUNT_KIND_RULES, ...)`. f1 solo define:

| kind | scope | ownerWrite | gmRead | gmWrite | Nota |
|------|-------|-----------|--------|---------|------|
| `account` (`ownerId` = id de la cuenta) | owned | false | true | true | R63–R65; el cambio de PIN propio va por `AuthService`, no por `canWrite` |

**Recomendación para features futuras (a decidir en sus specs, ver Q2):**

| kind | scope | ownerWrite | gmRead | gmWrite |
|------|-------|-----------|--------|---------|
| `character` (ficha, inventario) | owned | true | true | decide f4 |
| `private_note` (notas personales) | owned | true | **false** | false |
| `combat` (orden, ronda, enemigos visibles) | shared | — | — | true (vistas por rol vía eventos) |

**Denegación HTTP uniforme** (`http-denial.ts`), para que ningún endpoint decida por su cuenta:

```ts
export type Denial = { status: 403 | 404; body: ErrorBody };
export function authorizeOrDeny(policy: AuthorizationPolicy, actor: Actor, action: Action, resource: Resource):
  { ok: true } | { ok: false; denial: Denial };
// !canRead → 404 not_found (idéntico a "no existe") (R75, R77); canRead && !canWrite → 403 forbidden (R76)
```

Convención para handlers: cargar el recurso, y **antes de responder cualquier dato** llamar a
`authorizeOrDeny`; si el recurso no existe devolver el mismo 404 (`notFoundBody()` exportado desde
`http-denial.ts`) — R64.

**Guardas HTTP** (`auth-plugin.ts`):

- Hook `onRequest` global sobre `/api/*`: si la ruta no está en `PUBLIC_ROUTES`
  (`POST /api/auth/login`, `POST /api/auth/logout`, `GET /health`, ampliable solo desde
  `compose.ts`), exige sesión (401 `unauthenticated`) y deja `request.actor` (R30, R78). Una ruta
  nueva olvida su guarda → sigue protegida.
- `requireRole('gm')` como `preHandler` de las rutas de gestión → 403 `forbidden` (R14).
- `origin-guard.ts`: hook `onRequest` para métodos mutantes; compara `Origin` con
  `AUTH_ALLOWED_ORIGINS` (R62). Sin cabecera `Origin` (clientes no navegador, p. ej. `curl` o tests
  con `inject`) se permite: un navegador siempre la envía en peticiones cross-site mutantes. La
  cookie `SameSite=Strict` es la primera barrera; el guard es la segunda.

## 8. Filtrado de eventos SSE (`event-filter.ts`)

```ts
export interface RealtimeEvent<P = unknown> {
  readonly type: string;
  readonly resource: Resource;               // kind + ownerId: de aquí sale quién puede verlo
  readonly views: { readonly gm?: P; readonly owner?: P; readonly others?: P };
}
export interface ProjectedEvent<P = unknown> { readonly type: string; readonly payload: P }
export function projectEventFor<P>(policy: AuthorizationPolicy, actor: Actor, event: RealtimeEvent<P>): ProjectedEvent<P> | null;
```

`audience = policy.readAudience(actor, event.resource)`; mapa `owner→views.owner`, `gm→views.gm`,
`other→views.others`, `none→null`. Si la vista elegida es `undefined` → `null`, sin vista sustituta
(R84). Consecuencia importante: para un recurso `owned`, **nunca** se entrega `others`, aunque el
publicador lo rellene por error (R80); para un tipo con `gmRead=false`, el GM no recibe nada (R82).
Ejemplo de uso en f5: el evento de combate trae `views.gm` (PG exactos) y `views.others` (estado
cualitativo), con `resource = { kind: 'combat' }` (`shared`).

**Contrato para f5 (no implementado aquí):** la capa SSE DEBE (a) autenticar la conexión con la
misma cookie, (b) llamar a `projectEventFor` por cada conexión y evento, y (c) no emitir nada si
devuelve `null`. El reviewer de f5 debe exigir un test "el payload de A no llega a la conexión de B"
(patrón de `event-filter.test.ts`).

## 9. Stores

```ts
// user-store.ts
export interface User { id: string; name: string; nameKey: string; role: Role; pinHash: string; disabled: boolean; createdAt: number; updatedAt: number }
export interface UserStore {
  create(user: User): Promise<Result<User, 'name_taken'>>;       // unicidad por nameKey garantizada aquí (R88)
  findById(id: string): Promise<User | null>;
  findByNameKey(nameKey: string): Promise<User | null>;
  list(): Promise<User[]>;                                       // orden por createdAt, id
  update(id: string, patch: Partial<Pick<User, 'pinHash' | 'disabled'>>, updatedAt: number): Promise<User | null>;
  hasRole(role: Role): Promise<boolean>;                         // bootstrap (R15, R16)
}

// login-attempt-store.ts
export interface AttemptState { nameKey: string; failures: number; lockLevel: number; lockedUntil: number | null; updatedAt: number }
export interface LoginAttemptStore {
  get(nameKey: string): Promise<AttemptState | null>;
  put(state: AttemptState): Promise<void>;                       // upsert
  delete(nameKey: string): Promise<void>;                        // R7, R8, R47
  deleteIdleBefore(updatedAtCutoff: number): Promise<number>;    // R50
}
```

Las interfaces son asíncronas aunque `better-sqlite3` sea síncrono, para que los fakes y futuras
implementaciones no cambien la firma. `InMemory*` guardan copias (no referencias) para que un test
no pueda mutar el estado del store por accidente.

**SQLite** (`migrations.ts`, ids ordenados; `schema_migrations(id INTEGER PRIMARY KEY, applied_at)`;
cada migración en una transacción; las features siguientes **añaden** migraciones, no editan las
existentes; R90):

```sql
-- 001_auth
CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('player','gm')), pin_hash TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE TABLE login_attempts (
  name_key TEXT PRIMARY KEY, failures INTEGER NOT NULL, lock_level INTEGER NOT NULL,
  locked_until INTEGER, updated_at INTEGER NOT NULL);
```

Conexión: `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`. Las consultas son sentencias
preparadas con parámetros (nunca interpolación).

## 10. Rutas HTTP

| Método y ruta | Acceso | Éxito | Errores | Req. |
|---------------|--------|-------|---------|------|
| `POST /api/auth/login` | público | 200 `UserDto` + `Set-Cookie` | 400, 401 `invalid_credentials`, 429 `locked` + `Retry-After` | R18–R26, R41–R49 |
| `POST /api/auth/logout` | público (idempotente) | 204 + cookie expirada | — | R35, R36 |
| `GET /api/auth/me` | sesión | 200 `UserDto` | 401 | R37 |
| `PUT /api/auth/pin` | sesión | 204 | 400, 403 `invalid_current_pin`, 429 | R38–R40, R92 |
| `GET /api/accounts` | GM | 200 `AccountDto[]` | 401, 403 | R4, R13, R14 |
| `POST /api/accounts` | GM | 201 `AccountDto` | 400, 409 `name_taken` | R1–R3 |
| `GET /api/accounts/:id` | sesión + `authorizeOrDeny` | 200 `UserDto` | 404 (inexistente **o** denegado) | R63–R65 |
| `PUT /api/accounts/:id/pin` | GM | 204 | 400, 404 | R5–R7 |
| `POST /api/accounts/:id/unlock` | GM | 204 | 404 | R8 |
| `PATCH /api/accounts/:id` | GM | 200 `AccountDto` | 400, 404, 409 `cannot_disable_gm` | R9–R11 |

Todos los cuerpos de entrada se validan con los schemas zod de `src/shared`. Errores con la forma
`ErrorBody`. El 429 usa `Retry-After` en segundos enteros.

## 11. Configuración y composición

`parseAuthConfig(env): Result<AuthConfig, AuthConfigError>` — **esquema propio** en
`src/server/auth/config.ts`, independiente del de f0 (así no se alteran los requisitos R19–R29 de
f0 ni sus tests; el `.env.example` se amplía con las claves `AUTH_*`).

| Variable | Defecto | Notas |
|----------|---------|-------|
| `AUTH_PEPPER` | sin defecto, obligatoria, ≥ 32 caracteres | Secreto; nunca en el repo. `.env.example` lleva un marcador evidente (`change-me-…`) que el humano sustituye |
| `AUTH_COOKIE_SECURE` | `true` | En desarrollo local (http) se pone `false` en `.env` |
| `AUTH_ALLOWED_ORIGINS` | sin defecto, lista separada por comas | Dev típico: `http://localhost:5173,http://127.0.0.1:5173` |
| `AUTH_SESSION_IDLE_DAYS` / `AUTH_SESSION_ABSOLUTE_DAYS` | `7` / `30` | Q7 |
| `AUTH_LOCK_MAX_FAILURES` / `AUTH_LOCK_BASE_MINUTES` / `AUTH_LOCK_MAX_HOURS` | `5` / `15` / `24` | Q6 |

Los errores de config nombran la variable, nunca su valor (coherente con R23 de f0).

`compose.ts` es el **único** sitio que instancia `Sqlite*Store`, `ScryptPinHasher` y `SystemClock`,
y registra plugins, rutas y `mergeKindRules(...)`. Debe aceptar sobrescrituras (stores, clock,
hasher) para que los tests de ruta usen `app.inject` con fakes y `FakeClock`, sin red ni BD reales.
`src/server/cli/create-gm.ts` (`npm run create-gm`) abre la BD configurada, lee nombre desde
argumento y PIN desde stdin/`AUTH_BOOTSTRAP_PIN` (no por argumento, para no quedar en el historial
del shell) y llama a `bootstrapFirstGm`; es un envoltorio de ≤ 40 líneas sin lógica propia.

## 12. Estrategia de pruebas

| Qué | Cómo | Tipo |
|-----|------|------|
| `ScryptPinHasher` | Parámetros reducidos (`N=16`); un test fija las constantes de producción | unit |
| `LoginThrottle`, `AuthService`, `AccountService` | `InMemory*` + `FakeClock` (`tests/helpers/fake-clock.ts`) + `PinHasher` espía (cuenta llamadas) | unit |
| Rutas | `app.inject` sobre `composeApp` con fakes; logger capturado para R59 | unit |
| Política y filtro SSE | Tablas parametrizadas con reglas de prueba (`test_sheet`, `test_private_note`, `test_shared`) | unit |
| Stores | Suite de contrato en `tests/server/stores/*.contract.ts`: fake (unit) y SQLite `:memory:`/fichero temporal (`*.int.test.ts`) | unit + integration |
| Migraciones y reapertura | SQLite en directorio temporal | integration |

**Helper reutilizable para el mandato de `docs/architecture.md` §6** ("todo endpoint nuevo exige un
test jugador A no accede a B"): `tests/helpers/ownership-matrix.ts`, con
`describeOwnershipMatrix({ name, makeApp, seed, request })`, que crea jugadores A y B y un GM,
siembra un recurso de A y verifica: A accede, B recibe la misma respuesta que para un id
inexistente, GM accede según la regla, anónimo recibe 401. f1 lo usa con `GET /api/accounts/:id`
(R63–R65) y lo autotesta; f4/f5 lo reutilizan.

## 13. Preguntas abiertas (decide el humano; el spec asume la recomendación)

| # | Pregunta | Recomendación por defecto (asumida) | Si se decide lo contrario |
|---|----------|-------------------------------------|---------------------------|
| Q1 | ¿Entran las pantallas web (login, gestión de cuentas) en f1? | **No.** f1 = servidor + `src/shared`. Proponer feature `f1b-auth-ui` (depende de f1; toca solo `src/web`, por lo que puede ir en paralelo con f2/f3 según `parallel_policy`). Sin ella la app no es utilizable por los jugadores; el leader debe añadirla a `feature-list.json` | Añadir tasks de UI y requisitos mobile-first a este spec |
| Q2 | ¿Puede el GM leer las **notas personales** de un jugador? | **RESUELTA por el humano (2026-10-16): No.** El GM lee el resto de la ficha, no las notas privadas (`private_note`: `gmRead=false`). Coincide con `acceptance` de f4 ("notas privadas visibles solo para su autor") y con el encargo del humano ("el GM puede consultar datos de un jugador, pero los jugadores no pueden espiar a otros"). **Tensión:** `docs/architecture.md` §6 y el principio 3 de `feature-list.json` dicen "el GM lee todo"; habría que matizarlos ("…excepto notas personales"). La política ya lo soporta por regla, sin código especial (R68, R82) | Cambiar `gmRead` de `private_note` a `true` en el spec de f4; sin cambios en f1 |
| Q3 | ¿Cómo se crea el primer GM (la cuenta que crea las demás)? | CLI `npm run create-gm` sobre `bootstrapFirstGm` (R15–R17), ejecutable en local y con `fly ssh console` en producción | Variables `AUTH_BOOTSTRAP_*` consumidas al arrancar (deja el PIN en el entorno del despliegue) |
| Q4 | ¿Formato de PIN y lista de PIN débiles? | 4–8 dígitos; **sin** lista de prohibidos (lo asigna el GM a amigos; el límite de intentos es la defensa real) | Añadir lista (0000, 1234, repetidos) como requisito de `pinSchema` |
| Q5 | ¿Puede el jugador cambiar su propio PIN? | **Sí** (R38–R40, R92): evita que el GM conozca el PIN definitivo de todos | Eliminar `PUT /api/auth/pin` y R38–R40, R92 |
| Q6 | Parámetros de bloqueo | 5 fallos, 15 min, ×2 por bloqueo sucesivo, tope 24 h, olvido a 48 h (con 4 dígitos, 10⁴ combinaciones, esto limita a un atacante en línea a ~5 intentos/día tras unos pocos bloqueos). **Riesgo aceptado:** un tercero puede bloquear a un jugador intentando su nombre; el GM lo desbloquea (R8). Sin límite por IP | Añadir límite por IP (p. ej. `@fastify/rate-limit`, tras el proxy de Fly) como feature/requisito aparte |
| Q7 | TTL de sesión | 7 días de inactividad, 30 días absolutos | Ajustar `AUTH_SESSION_*` |
| Q8 | ¿Pepper de PIN en entorno? | **Sí** (R54, `AUTH_PEPPER` ≥ 32 car.). Sin pepper, una BD filtrada revela todos los PIN en segundos (10⁸ candidatos máx.) | Quitar R54 y `AUTH_PEPPER`; documentar el riesgo |
| Q9 | Estado HTTP al denegar el acceso a un recurso ajeno | **404** indistinguible de "no existe" (no revela qué ids existen); 403 solo cuando el recurso es legible pero no escribible, y en endpoints exclusivos del GM | Usar 403 siempre: cambiar R64, R75, R77 |
| Q10 | ¿Puede haber más de un GM / cambiar roles? | **No.** Un GM (por bootstrap); el GM solo crea `player`; el rol no se puede cambiar; el GM no se puede deshabilitar (R11) | Añadir `role` al alta, cambio de rol y regla "último GM habilitado" |
| Q11 | ¿Se pueden borrar cuentas? | **No** en f1: solo deshabilitar (R9). Borrar dejaría `ownerId` huérfanos en fichas/notas de futuras features | Definir borrado en cascada/archivado cuando existan f4/f5 |
| Q12 | ¿Qué pasa con conexiones SSE abiertas cuando se revoca una sesión? | Lo define f5; recomendación: cerrar el stream al revocar la sesión y revalidar la sesión en cada heartbeat. f1 expone `SessionStore.findByTokenHash` para ello | — |

## 14. Alternativas descartadas (resumen)

- **argon2 / bcrypt** — ver §4.
- **JWT sin estado en cookie** — no permite revocar (deshabilitar cuenta, reset de PIN, logout)
  sin lista de revocación; con 8 usuarios y SQLite la sesión en servidor es más simple y revocable.
- **Autorización repartida en cada ruta (`if (user.id === x.ownerId)`)** — justo lo que el
  principio 3 prohíbe; un solo lugar testeable evita olvidos. Se refuerza con el hook
  deny-by-default (R78) y el helper de matriz de propiedad.
- **Bloqueo solo en memoria** — se pierde al reiniciar la máquina (Fly puede reiniciar), lo que
  regalaría intentos; se persiste en `LoginAttemptStore`.
- **`rate-limit` por IP como único límite** — con 8 usuarios tras el proxy de Fly, la IP no
  identifica al atacante de forma fiable; el límite por nombre protege la cuenta objetivo.
