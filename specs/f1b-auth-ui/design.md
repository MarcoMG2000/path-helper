# Design — f1b-auth-ui

> CÓMO se construye lo descrito en `requirements.md`. Respeta `docs/architecture.md` (§5 layout:
> `web` nunca importa de `server`; §6 la autorización vive en el servidor, la UI solo la refleja) y
> `docs/conventions.md` (textos de UI en ficheros i18n, `Result` en lugar de excepciones, sin
> `console.*`). Las firmas son contrato; los cuerpos los escribe el implementer.
> Esta feature es la base de f4/f5/f8/…: lo que aquí se decide como «shell» se reutiliza sin tocarlo.

## 1. Resumen de decisiones

| Tema | Decisión | Alternativas descartadas (§20) |
|------|----------|--------------------------------|
| Backend | **Sin cambios.** `GET /api/auth/me` ya existe (f1 R37) y da la sesión actual; `POST /api/accounts/:id/unlock` ya permite desbloquear | Endpoint nuevo de sesión; exponer `lockedUntil` en `AccountDto` (Q2) |
| Enrutado | `react-router` **7.18.4** (exacta), modo declarativo (`BrowserRouter` + `useRoutes`) | v8.4.0 (exige Node ≥ 22.22), wouter, TanStack Router |
| Sesión | `SessionProvider` (contexto React) que consulta `me` al montar; estado `loading/anonymous/authenticated/error`; cookie httpOnly, **ningún token en JS** | JWT/token en `localStorage`; Redux/Zustand |
| HTTP | Un único `createHttpClient` (fetch) con `Result<T, ApiError>`, 401 → login, 429 → minutos | axios/ky/TanStack Query |
| Extensión | Contrato `AppSection` + descubrimiento con `import.meta.glob('../features/*/section.tsx')`; f4/f5/f8 añaden **un fichero** y no tocan el shell | Registro central editado a mano |
| Guardas | `RequireAuth` (sesión), `RequireRole` (rol → página «Sin permiso»), `PublicOnly` (`/login`) | Redirigir a `/` al fallar el rol |
| i18n | Objeto `es` tipado + helpers de formato (plural, espera); sin librería | react-i18next, FormatJS |
| Estilo | CSS plano con **tokens** (`--ph-*`), mobile-first (`min-width`), modo oscuro por `prefers-color-scheme` | Tailwind, MUI/Chakra, CSS-in-JS, CSS Modules |
| Aviso legal | Ruta pública `/legal`, enlazada desde el pie; el texto se importa de `src/data/legal` (módulo pequeño, sin tocar el barrel de datos) | Endpoint `/api/legal`; importar `src/data` completo; ruta solo con sesión |
| Seguridad cliente | PIN solo en estado local de formulario; `type=password`, `inputmode=numeric`, `autocomplete` correctos; sin storage; logout sincronizado entre pestañas con `BroadcastChannel` | Guardar «recordar usuario»; `localStorage` como señal de logout |
| Tests | Vitest + `jsdom` + Testing Library con fakes de los módulos de API / `fetch`; red real solo en `*.int.test.ts` | happy-dom, Playwright (los agentes no tienen navegador) |

## 2. Contrato exacto de la API que consume la UI (solo lectura de f1)

Verificado en `src/server/http/{auth-plugin,errors,origin-guard}.ts`, `src/server/http/routes/*.ts`
y `src/shared/auth.ts`.

**Convenciones comunes**

- Todas las rutas bajo `/api` responden con `Cache-Control: no-store`. Errores con la forma
  `{ "error": { "code": ErrorCode, "message": string } }` (`message` en español, **la UI usa `code`**).
- `ErrorCode` = `validation_error | unauthenticated | forbidden | not_found | invalid_credentials |
  locked | name_taken | cannot_disable_gm | invalid_current_pin | bad_origin | gm_exists | internal_error`.
- Cookie de sesión `ph_session`: `HttpOnly; SameSite=Strict; Path=/; Max-Age=<30 días en s>`; `Secure`
  si `AUTH_COOKIE_SECURE=true`. El navegador la envía sola; la UI no la lee ni la escribe.
- **Protección CSRF por `Origin`:** toda petición POST/PUT/PATCH/DELETE que lleve cabecera `Origin`
  fuera de `AUTH_ALLOWED_ORIGINS` recibe `403 bad_origin`. Los navegadores envían siempre `Origin` en
  esas peticiones, así que **el origen desde el que se sirve la web debe estar en esa lista** (dev:
  `http://localhost:5173` y `http://127.0.0.1:5173`; móvil por LAN: añadir `http://<ip>:5173`).
  La UI no puede ni debe manipular `Origin`; solo traduce `bad_origin` a un mensaje.
- Cuerpo máximo 16 KiB. Un `Content-Type: application/json` con cuerpo vacío es un 400 de Fastify:
  **el cliente no envía `Content-Type` cuando no hay cuerpo** (R9; aplica a `logout` y `unlock`).
- Todas las rutas salvo `POST /api/auth/login`, `POST /api/auth/logout` y `GET /health` exigen
  sesión: sin ella, `401 unauthenticated`.

| Método y ruta | Cuerpo de la petición | Éxito | Errores relevantes para la UI |
|---------------|-----------------------|-------|-------------------------------|
| `POST /api/auth/login` | `{ name: string(1–64), pin: string(1–64) }` | `200 UserDto` + `Set-Cookie` | `400 validation_error`; `401 invalid_credentials` (idéntico para nombre desconocido, PIN erróneo y cuenta deshabilitada); `429 locked` + `Retry-After: <segundos>`; `403 bad_origin` |
| `POST /api/auth/logout` | — | `204` (siempre; cookie expirada) | `403 bad_origin` |
| `GET /api/auth/me` | — | `200 UserDto` | `401 unauthenticated` |
| `PUT /api/auth/pin` | `{ currentPin: string(1–64), newPin: /^\d{4,8}$/ }` | `204` (revoca las **demás** sesiones) | `400 validation_error`; `401`; `403 invalid_current_pin`; `429 locked` + `Retry-After` |
| `GET /api/accounts` | — | `200 AccountDto[]` | `401`; `403 forbidden` (jugador) |
| `POST /api/accounts` | `{ name: 1–32 tras recortar, sin ctrl; pin: /^\d{4,8}$/ }` | `201 AccountDto` (rol `player`) | `400 validation_error`; `409 name_taken`; `403 forbidden` |
| `PUT /api/accounts/:id/pin` | `{ pin: /^\d{4,8}$/ }` | `204` (revoca todas las sesiones de la cuenta y borra su bloqueo) | `400`; `404 not_found`; `403 forbidden` |
| `POST /api/accounts/:id/unlock` | — | `204` (borra el bloqueo; no cambia el PIN) | `404 not_found`; `403 forbidden` |
| `PATCH /api/accounts/:id` | `{ disabled: boolean }` | `200 AccountDto` (al deshabilitar revoca sus sesiones) | `400`; `404 not_found`; `409 cannot_disable_gm`; `403 forbidden` |
| `GET /api/accounts/:id` | — | `200 UserDto` | **No se usa en esta feature** |

Tipos (de `src/shared/auth.ts`, que `src/web` puede importar):
`UserDto = { id, name, role: "player" | "gm" }`; `AccountDto = UserDto & { disabled: boolean;
createdAt: string /* ISO-8601 */ }`; `Result`, `ok`, `err` de `src/shared/result.ts`.

**Semántica del bloqueo que la UI debe respetar**

- Se bloquea por **clave de nombre** (5 fallos consecutivos → 15 min, duplicando, tope 24 h). El
  intento que alcanza el umbral sigue respondiendo `401 invalid_credentials`; **el bloqueo se anuncia
  desde el siguiente intento** (`429`). La UI no puede avisar antes («te quedan N intentos» no es
  posible: la API no lo expone).
- Un PIN actual erróneo en `PUT /api/auth/pin` cuenta para el mismo límite, así que el cambio de PIN
  también puede devolver `429 locked` (y bloquea además el login de ese usuario).
- `AccountDto` **no** indica si una cuenta está bloqueada (Q2). Por eso «Desbloquear» se ofrece
  siempre para los jugadores (R66).
- Restablecer el PIN de una cuenta revoca **todas** sus sesiones, y deshabilitarla también: la UI de
  ese usuario recibirá `401 unauthenticated` en su siguiente petición (R18). El GM no puede
  deshabilitarse; la fila del GM no ofrece acciones (R67). Si el propio GM queda bloqueado, la
  recuperación es `npm run reset-gm-lock` (CLI de f1), no la UI.

**Cambios de backend necesarios:** **ninguno.** Lo que la UI necesita (sesión actual, desbloqueo,
listado, alta, reset, deshabilitar) existe. Mejoras opcionales fuera de alcance (Q2): `lockedUntil`
en `AccountDto`; `setNotFoundHandler` para rutas `/api` no casadas (review I-2 de f1). Si el
humano elige alguna, se trata como cambio de backend con la misma política de authz (`gm`-only para
datos de bloqueo) y test en `tests/server/http/routes/account-routes.test.ts`.

## 3. Archivos a crear o tocar

```
package.json / package-lock.json            # (tocar) deps de §4, versiones exactas
vite.config.ts                              # (tocar) workbox.navigateFallbackDenylist (R84)
src/web/pwa-manifest.ts                     # (tocar) exporta NAVIGATE_FALLBACK_DENYLIST (R84)
src/web/main.tsx                            # (tocar) BrowserRouter + createServices + estilos
src/web/app.tsx                             # (reescribir) <App services sections? channel?>
src/web/vite-env.d.ts                       # (sin cambios; vite/client ya tipa import.meta.glob)

src/web/api/http-client.ts                  # createHttpClient, ApiError, ApiResult
src/web/api/schemas.ts                      # zod de UserDto, AccountDto, ErrorBody (web-local)
src/web/api/auth-api.ts                     # createAuthApi(http)
src/web/api/accounts-api.ts                 # createAccountsApi(http)
src/web/api/services.tsx                    # AppServices, createServices(), ServicesProvider, useServices
src/web/api/health.ts                       # (sin cambios)

src/web/session/session-context.tsx         # SessionProvider, useSession, SessionState
src/web/session/session-channel.ts          # SessionChannel + createBroadcastSessionChannel

src/web/shell/sections.ts                   # AppSection, defineSection, loadSections, validateSections, RESERVED_PATHS
src/web/shell/routes.tsx                    # AppRoutes (useRoutes), buildRoutes(sections)
src/web/shell/guards.tsx                    # RequireAuth, RequireRole, PublicOnly, safeRedirectTarget
src/web/shell/app-layout.tsx                # header + nav + main + footer (autenticado)
src/web/shell/public-layout.tsx             # layout sin nav (login, legal)
src/web/shell/nav.tsx                       # Nav (por rol) 
src/web/shell/footer.tsx                    # pie con enlace a /legal
src/web/shell/page.tsx                      # <Page title> : h1 enfocable + document.title
src/web/shell/error-boundary.tsx            # AppErrorBoundary
src/web/shell/splash.tsx                    # indicador de carga (role=status) y pantalla de error de sesión

src/web/components/form-field.tsx           # etiqueta + control + error accesible
src/web/components/pin-field.tsx            # campo PIN con mostrar/ocultar
src/web/components/alert.tsx                # <Alert kind="error|success|info"> (role alert|status)
src/web/components/health-status.tsx        # (sin cambios)
src/web/hooks/use-health.ts                 # (tocar) useHealth(check = fetchHealth)

src/web/features/home/home-page.tsx
src/web/features/login/login-page.tsx
src/web/features/profile/{section.tsx, profile-page.tsx, change-pin-form.tsx}
src/web/features/accounts/{section.tsx, accounts-page.tsx, create-account-form.tsx, account-row.tsx}
src/web/features/legal/legal-page.tsx
src/web/features/errors/{not-found-page.tsx, forbidden-page.tsx}

src/web/i18n/es.ts                          # (ampliar) textos
src/web/i18n/format.ts                      # formatWait(seconds), plural(n, one, many)
src/web/styles/{tokens.css, base.css, layout.css, components.css}

tests/web/...                               # §16
tests/project/pwa-options.test.ts           # R84
tests/web/app.test.tsx                      # (reescribir; enmienda a f0 R43/R44, §18)
docs/architecture.md                        # (tocar) §5: estructura de src/web y contrato AppSection
README.md                                   # (tocar) sección «Interfaz web / primer uso»
progress/manual_f1b-auth-ui.md              # (crear al cerrar) checklist manual rellenada (§17)
```

`src/web` solo importa de `src/shared` y de `src/data/legal` (R73). Ningún fichero de `src/web`
importa de `src/server` (ya lo impone `eslint.config.js`).

## 4. Dependencias nuevas (pineadas, `save-exact` por `.npmrc`)

Versiones consultadas con `npm view` el 2026-10-18; el implementer DEBE reconfirmarlas con
`npm view <pkg> version engines peerDependencies` antes de instalar y compatibilizarlas con
`engines.node: ">=22.13"` + `engine-strict=true`.

| Paquete | Versión | Tipo | Motivo / compatibilidad |
|---------|---------|------|-------------------------|
| `react-router` | `7.18.4` | dependencia | Enrutado. `engines` `>=20`, peer `react >=18` (hay 19.3.1). En v7 el paquete `react-router` es el único necesario (`react-router-dom` es un reexport). Si algún import (p. ej. `RouterProvider` de `react-router/dom`) difiere, el implementer sigue los tipos de la versión instalada |
| `jsdom` | `29.1.1` | dev | Entorno DOM de Vitest (`// @vitest-environment jsdom` por fichero). `engines` `^20.19 \|\| ^22.13 \|\| >=24` (compatible con el mínimo del repo); la 30.x exige Node ≥ 22.22 |
| `@testing-library/react` | `16.3.3` | dev | Render de componentes. Peer `@testing-library/dom ^10` |
| `@testing-library/dom` | `10.4.2` | dev | Peer obligatorio de la anterior (instalar explícitamente) |
| `@testing-library/user-event` | `14.6.8` | dev | Interacción realista (teclado, foco) |

No se añade `@testing-library/jest-dom` (los asserts usan propiedades del DOM) ni librería de UI, de
estado, de i18n ni de formularios. Cada paquete queda justificado por una necesidad del spec
(`docs/architecture.md` §8).

## 5. Cliente HTTP (`src/web/api/http-client.ts`)

```ts
import type { ErrorCode } from "../../shared";
import type { Result } from "../../shared";

export type ClientErrorCode = ErrorCode | "network" | "unexpected";
export interface ApiError { status: number /* 0 = red */; code: ClientErrorCode; retryAfterSeconds?: number }
export type ApiResult<T> = Result<T, ApiError>;

export interface RequestSpec<T> {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;                       // "/api/..."
  body?: unknown;                     // se serializa a JSON (R9)
  /** Schema del cuerpo de éxito; `null` = se espera 204 sin cuerpo (devuelve ok(undefined)). */
  schema: z.ZodType<T> | null;
}
export interface HttpClient { request<T>(spec: RequestSpec<T>): Promise<ApiResult<T>> }

export interface HttpClientDeps {
  fetchFn?: typeof fetch;             // por defecto, lee globalThis.fetch EN CADA LLAMADA (los tests unitarios lo prohíben, R50 de f3)
  baseUrl?: string;                   // "" por defecto (mismo origen); los tests de integración pasan la URL del servidor
  onUnauthenticated?: () => void;     // 401 con code "unauthenticated" (R8)
}
export function createHttpClient(deps?: HttpClientDeps): HttpClient;
```

Reglas de implementación:

- No lanza nunca (R6): `fetch` rechazado → `err({ status: 0, code: "network" })`.
- Éxito (2xx): con `schema === null` → `ok(undefined)` (ignora el cuerpo); si no, `response.json()` +
  `schema.safeParse`; fallo → `err({ status, code: "unexpected" })` (R3).
- Error (no 2xx): intenta `json()` y valida `{ error: { code, message } }` con el schema de
  `schemas.ts`; el `code` debe pertenecer a la lista de `ErrorCode`; si no → `unexpected` (R4, R5).
  `retryAfterSeconds` solo si el estado es 429 y `Retry-After` casa `^\d+$` y es > 0 (R7).
- Antes de devolver, si `status === 401 && code === "unauthenticated"` invoca `onUnauthenticated`
  (R8). `invalid_credentials` (401 del login) **no** lo invoca: es un error de formulario, no una
  sesión caducada.
- Cabeceras: `Accept: application/json`; `Content-Type: application/json` **solo** si hay cuerpo (R9);
  `credentials: "same-origin"`; nada más (R10). Sin `Authorization`.
- `schemas.ts` define con zod `userDtoSchema`, `accountDtoSchema`, `errorBodySchema` y los tipa con
  `satisfies z.ZodType<UserDto>` etc., de modo que si `src/shared` cambia, `tsc` falla. Se mantienen en
  `src/web` (y no en `src/shared`) para no modificar archivos de una feature ya cerrada (§20).

## 6. Módulos de API de dominio

```ts
// auth-api.ts
export interface AuthApi {
  login(name: string, pin: string): Promise<ApiResult<UserDto>>;       // POST /api/auth/login
  me(): Promise<ApiResult<UserDto>>;                                    // GET  /api/auth/me
  logout(): Promise<ApiResult<void>>;                                   // POST /api/auth/logout
  changePin(currentPin: string, newPin: string): Promise<ApiResult<void>>; // PUT /api/auth/pin
}
// accounts-api.ts
export interface AccountsApi {
  list(): Promise<ApiResult<AccountDto[]>>;                             // GET   /api/accounts
  create(name: string, pin: string): Promise<ApiResult<AccountDto>>;    // POST  /api/accounts
  resetPin(id: string, pin: string): Promise<ApiResult<void>>;          // PUT   /api/accounts/:id/pin
  setDisabled(id: string, disabled: boolean): Promise<ApiResult<AccountDto>>; // PATCH /api/accounts/:id
  unlock(id: string): Promise<ApiResult<void>>;                         // POST  /api/accounts/:id/unlock
}
export function createAuthApi(http: HttpClient): AuthApi;
export function createAccountsApi(http: HttpClient): AccountsApi;
```

```ts
// services.tsx — inyección de dependencias de la UI
export interface AppServices {
  auth: AuthApi;
  accounts: AccountsApi;
  checkHealth: () => ReturnType<typeof fetchHealth>;
  /** Suscripción al evento «el servidor dijo 401 unauthenticated». */
  onUnauthenticated(handler: () => void): () => void;
}
export function createServices(deps?: HttpClientDeps): AppServices;  // real; main.tsx lo usa
export const ServicesProvider: React.FC<{ services: AppServices; children: ReactNode }>;
export function useServices(): AppServices;
```

`createServices` crea un pequeño emisor, lo pasa como `onUnauthenticated` al cliente HTTP y lo
expone como suscripción, de modo que el cliente (creado antes que React) y el `SessionProvider`
(dentro de React) se conecten sin dependencia circular. **Las features futuras añaden sus módulos
de API (`createCharacterApi(http)`, …) y los exponen vía `AppServices` ampliado**; el cliente HTTP y
el manejo de 401/429 no se reimplementan. Los tests inyectan `AppServices` falsos (`vi.fn()`), sin
`fetch`.

## 7. Sesión (`src/web/session`)

```ts
export type SessionNotice = "expired" | "signed-out-elsewhere";
export type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; user: UserDto }
  | { status: "anonymous"; notice?: SessionNotice }
  | { status: "error" };                 // no se pudo comprobar la sesión (red/5xx)

export interface SessionValue {
  state: SessionState;
  login(name: string, pin: string): Promise<ApiResult<UserDto>>;   // actualiza state; avisa al canal
  logout(): Promise<ApiResult<void>>;                               // 204 → anonymous; fallo → se mantiene (R20)
  reload(): void;                                                   // reintentar `me` desde `error`
  clearNotice(): void;
}
export const SessionProvider: React.FC<{ channel?: SessionChannel; children: ReactNode }>;
export function useSession(): SessionValue;
export function useUser(): UserDto;         // solo dentro de RequireAuth: lanza si no hay usuario
```

- Al montar: `auth.me()` (R13). 200 → `authenticated` (R14); 401 → `anonymous` **sin** aviso (R15); otro
  fallo → `error` (R16). Se ignoran respuestas obsoletas con un contador de peticiones (React
  StrictMode monta dos veces en desarrollo; la segunda respuesta prevalece y no hay estados
  incoherentes).
- `login`: si ok → `authenticated` + `channel.post("login")` (R17). El PIN **no** entra en el estado,
  contexto ni canal: es un argumento que viaja del formulario al cliente HTTP y se descarta (R24).
- `onUnauthenticated` (de `useServices`): si el estado es `authenticated` → `anonymous` + aviso
  `expired` (R18). Si es `loading`/`anonymous` no hace nada (evita avisar durante el arranque).
- `logout`: 204 → `anonymous` + `channel.post("logout")` (R19). Si falla, el estado **no** cambia y la
  página muestra el error (R20): en un móvil compartido es peor creer que la sesión está cerrada
  cuando la cookie sigue viva que mostrar un error.
- Canal entre pestañas (R21–R23):

```ts
export type SessionMessage = "login" | "logout";            // sin datos: nunca viaja nombre, rol ni PIN
export interface SessionChannel {
  post(message: SessionMessage): void;
  subscribe(handler: (m: SessionMessage) => void): () => void;
  close(): void;
}
export function createBroadcastSessionChannel(name?: string /* "ph-session" */): SessionChannel;
```

  Implementación con `BroadcastChannel`; si no existe (Safari antiguo) devuelve un canal nulo (R23).
  `logout` recibido con sesión `authenticated` → `anonymous` + aviso `signed-out-elsewhere` **sin**
  llamar al servidor (la otra pestaña ya lo hizo); `login` recibido con sesión `anonymous` → `reload()`
  (R22). Se descartó `localStorage` + evento `storage`: R85 prohíbe el almacenamiento y un canal sin
  persistencia no deja rastro.
- Revalidar la sesión al volver a la pestaña no se hace (Q16): cualquier petición posterior que falle con
  401 lleva al login por R18; f5 revalidará en su capa SSE.

## 8. Enrutado, guardas y contrato de secciones

### 8.1 Árbol de rutas (`routes.tsx`, `useRoutes`)

```
<AppErrorBoundary>
 <ServicesProvider> <SessionProvider> <AppRoutes sections={...}/>
```
```
element: PublicLayout                       # sin navegación; cabecera simple + pie
  /login   -> PublicOnly(LoginPage)         # autenticado → redirige (R27); loading → Splash
  /legal   -> LegalPage                     # siempre visible (R29)
element: RequireAuth(AppLayout)             # anonymous → /login con state.from (R25); loading → Splash (R26); error → reintentar (R16)
  index    -> HomePage                      # R40
  <una ruta por AppSection>                 # RequireRole(section.roles): rol insuficiente → ForbiddenPage (R31)
  *        -> NotFoundPage                  # dentro del layout (R30); sin sesión se redirigió antes (R25)
```

Las rutas desconocidas sin sesión caen en el grupo protegido y por tanto redirigen a `/login`
(R25): no se distingue «no existe» de «necesita login» para un anónimo, y el criterio de aceptación
(«las rutas de la app redirigen a login») se cumple de forma uniforme.

`safeRedirectTarget(from: unknown): string` (R28): devuelve `from` solo si es `string` que empieza por
`/`, no por `//`, no contiene `\` ni esquema, y no apunta a `/login`; si no, `"/"`. El destino viaja en
`location.state` (no en la query) para no exponer parámetros manipulables en la URL.

### 8.2 `AppSection` — cómo se añade una pantalla sin tocar el shell

```ts
// src/web/shell/sections.ts
export interface AppSection {
  id: string;                          // kebab-case único: "accounts", "character-sheet"
  path: string;                        // ruta absoluta de primer nivel: "/cuentas"
  label: string;                       // texto de navegación YA traducido (viene de es.*)
  roles: readonly Role[];              // quién la ve y puede entrar: ["gm"], ["player","gm"]
  order: number;                       // posición en la navegación (menor = antes)
  Component: ComponentType;            // o React.lazy(...); si tiene children, renderiza <Outlet/>
  children?: RouteObject[];            // subrutas relativas ("/ficha/:id" → path "/ficha", child ":id")
  hidden?: boolean;                    // true = ruta sin entrada en la navegación
}
export function defineSection(section: AppSection): AppSection;      // identidad tipada
export const RESERVED_PATHS: readonly string[];                      // "/", "/login", "/legal", "/api", "/health"
export function validateSections(sections: readonly AppSection[]): void; // R35: lanza con el id ofensor
export function loadSections(): AppSection[];                        // import.meta.glob (eager) + validate + orden por `order`
```

- **Descubrimiento (R34):** `loadSections` usa
  `import.meta.glob("../features/*/section.tsx", { eager: true })`; cada módulo exporta por defecto una
  `AppSection` o un array. Cada feature futura aporta `src/web/features/<feature>/section.tsx` y sus
  páginas; **no se edita `shell/`, `app.tsx` ni `main.tsx`** (R33). `App` recibe `sections` por props
  (por defecto `loadSections()`), lo que permite inyectar secciones ficticias en los tests.
- Esta feature se «autoaplica» el contrato: `profile` (`/perfil`, `["player","gm"]`, order 90, «Mi perfil») y
  `accounts` (`/cuentas`, `["gm"]`, order 50, «Cuentas») son secciones. Orden sugerido para las
  futuras (convención, no regla): ficha 10, combate 20, compendio 30, cuentas 50, perfil 90.
- La navegación y las guardas son solo **experiencia de usuario**: la autorización real sigue en el
  servidor (`docs/architecture.md` §6). Un jugador que fuerce `/cuentas` solo vería una pantalla sin
  permiso, y cualquier llamada a la API devolvería 403 igualmente.
- Las secciones con subrutas necesitan que `Component` renderice `<Outlet />`.

## 9. Layout, navegación y accesibilidad

```
AppLayout (autenticado)                       PublicLayout (login, legal)
┌───────────────────────────────┐             ┌───────────────────────────────┐
│ [Saltar al contenido]  (oculto hasta foco)  │ Path Helper                    │
│ header: Path Helper · <nombre>│             │ main (h1, formulario/legal)   │
│ main#contenido (h1 + página)  │             │ footer: Aviso legal           │
│ footer: Aviso legal · estado  │             └───────────────────────────────┘
│ nav (inferior en móvil):      │
│  Inicio | Ficha… | Cuentas |… │
└───────────────────────────────┘
```

- **Móvil (por defecto):** barra de navegación fija inferior (alto ≥ `--ph-tap-min`), con
  `padding-bottom: env(safe-area-inset-bottom)`, y `main` con padding inferior para no quedar tapado;
  si hay más entradas que ancho, la barra hace scroll horizontal. **≥ 48 rem** (`@media (min-width)`): la
  navegación pasa a la cabecera como lista horizontal y el contenido se centra (`max-width: 40rem` para
  formularios, `64rem` para contenido ancho; token `--ph-content-max`).
- **Accesibilidad (R36–R37, R77):**
  - Primer elemento enfocable: `<a class="ph-skip" href="#contenido">` (visible solo con foco).
  - Landmarks: `<header>`, `<nav aria-label={es.nav.label}>`, `<main id="contenido" tabIndex={-1}>`,
    `<footer>`. Entrada actual con `aria-current="page"` (`NavLink`).
  - `Page` (`shell/page.tsx`): `<Page title={string}>` pinta el `<h1 tabIndex={-1} ref>`; al montar o
    cambiar `title` hace `document.title = "<título> · Path Helper"` y `h1.focus()` (anuncio de cambio
    de ruta para lectores de pantalla). Un `h1` por pantalla.
  - Estados: `role="status"` (carga, confirmaciones, avisos), `role="alert"` (errores). Foco visible
    (`:focus-visible` con anillo de 3 px), objetivos táctiles ≥ 44 px, no se transmite información solo
    por color (el estado de cuenta lleva texto «Activa/Deshabilitada»).
  - Formularios: `FormField` enlaza `label[for]`, `aria-describedby` (error + ayuda) y `aria-invalid`
    (R77); el botón de envío se deshabilita durante la petición con `aria-busy` en el `<form>` (R43).
- `AppErrorBoundary` (R39): clase React con `getDerivedStateFromError`; muestra mensaje y botón
  «Recargar» (`location.reload()`); no registra en consola (R86).

## 10. i18n (`src/web/i18n`)

`es.ts` se amplía manteniendo `es.appName` y `es.health` (tests de f0). Estructura propuesta:

```ts
export const es = {
  appName: "Path Helper",
  health: { loading, ok, error },                    // existente
  common: { loading, retry, cancel, confirm, save, reload, show, hide, back, backHome },
  roles: { player: "Jugador", gm: "GM" },
  a11y: { skipToContent: "Saltar al contenido", mainNav: "Navegación principal", pinToggleShow, pinToggleHide },
  nav: { home: "Inicio", profile: "Mi perfil", accounts: "Cuentas" },
  session: { checking: "Comprobando la sesión…", checkFailed: "No se pudo comprobar la sesión", expired: "Tu sesión ha caducado. Vuelve a entrar.", signedOutElsewhere: "Has cerrado sesión en otra pestaña.", logoutFailed: "No se pudo cerrar la sesión. Inténtalo de nuevo." },
  errors: { /* Record<ClientErrorCode, string | ((espera?: string) => string)> */ },
  login: { title: "Entrar", name: "Nombre", pin: "PIN", submit: "Entrar", submitting: "Entrando…", required: "…" },
  profile: { … }, accounts: { … }, legal: { title: "Aviso legal", … },
  notFound: { title, message, home }, forbidden: { title, message }, crash: { title, message, reload },
  home: { greeting: (name) => `Hola, ${name}`, … },
};
```

- `es.errors` se tipa como `Record<ClientErrorCode, …>`: si `ErrorCode` crece, **`tsc` falla** hasta
  añadir el texto (R76); el test lo comprueba también en ejecución. Mensajes propuestos: `invalid_credentials`
  «Nombre o PIN incorrectos. Si el problema continúa, habla con el GM.»; `locked` (función de la espera)
  «Demasiados intentos fallidos. Vuelve a intentarlo en {espera}.»; `invalid_current_pin` «El PIN actual
  no es correcto.»; `name_taken` «Ya existe una cuenta con ese nombre.»; `forbidden` «No tienes permiso
  para esta operación.»; `bad_origin` «Petición rechazada por seguridad. Abre la app desde la dirección
  habitual y recarga la página.»; `network` «No se pudo conectar con el servidor. Comprueba tu conexión.»;
  `unexpected`/`internal_error` «Ha ocurrido un error inesperado.». El texto de `invalid_credentials` es
  **el mismo** para nombre desconocido, PIN erróneo y cuenta deshabilitada (no revela cuál) y no cita
  «deshabilitada».
- `format.ts` (R46): `formatWait(seconds?: number): string` y `plural(n, one, many)`. `minutes =
  max(1, ceil(seconds / 60))`; `< 60` → «N minuto(s)»; `≥ 60` → «H hora(s)» y, si sobran, «y M minuto(s)».
  Sin segundos → «unos minutos». Los plurales del español solo distinguen 1 / resto: no se necesita ICU.
- Los componentes solo referencian `es.*`; `hygiene/web-sources.test.ts` lo vigila con el AST de
  TypeScript (R75, §16).

## 11. Diseño visual: tokens, modo oscuro y mobile-first

### 11.1 Hojas de estilo (`src/web/styles`, importadas desde `main.tsx`)

- `tokens.css`: únicas definiciones de valores. `:root { color-scheme: light dark; … }` con tokens:
  - Color: `--ph-color-bg`, `-surface`, `-text`, `-text-muted`, `-primary` (`#1f3a5f`, coherente con
    `theme_color`), `-on-primary`, `-border`, `-danger`, `-success`, `-focus`.
  - Espaciado (base 4 px): `--ph-space-1`…`--ph-space-6`; radio `--ph-radius`; tipografía
    `--ph-font-family` (pila del sistema), `--ph-font-size-base: 1rem`, `-sm`, `-lg`, `-xl`;
    `--ph-tap-min: 2.75rem` (44 px); `--ph-content-max`.
  - Los colores son **hexadecimales de 6 dígitos** (el test los parsea). Un único bloque
    `@media (prefers-color-scheme: dark) { :root { …los mismos tokens de color… } }` los redefine (R79).
- `base.css` (reset ligero, tipografía, `:focus-visible`, `.ph-skip`, `.ph-sr-only`), `layout.css`
  (shell, navegación, pie) y `components.css` (botón, campo, alerta, tarjeta, lista de cuentas).
  Clases con prefijo `ph-` (sin CSS Modules: su tratamiento en Vitest es incierto y no aporta aquí).
  Sin colores literales fuera de `tokens.css` (R78); `min-height: var(--ph-tap-min)` en botones, enlaces
  de navegación y controles (R82); `font-size: var(--ph-font-size-base)` (≥ 1rem) en inputs (R83); solo
  `@media (min-width: …)` (R81).
- **Modo oscuro (barato, R79):** automático según el sistema; no hay conmutador manual (Q5). Coste: un
  bloque de ~12 variables. El `background_color` del manifest sigue siendo blanco (afecta solo a la
  pantalla de arranque de la PWA instalada; aceptable, anotado).

### 11.2 Pares de contraste verificados (R80), ≥ 4,5:1 en claro y oscuro

`text`/`bg`, `text`/`surface`, `text-muted`/`bg`, `text-muted`/`surface`, `on-primary`/`primary`,
`primary`/`bg` (enlaces y texto de acento), `danger`/`bg`, `danger`/`surface`, `success`/`bg`,
`success`/`surface`. Los valores concretos los elige el implementer; el test calcula la relación WCAG
`(L1 + 0,05) / (L2 + 0,05)` con luminancia sRGB y falla si algún par no llega a 4,5.

### 11.3 Estilo

Sobrio y legible a pie de mesa: tarjetas con borde fino sobre fondo `surface`, una acción primaria por
pantalla, botones de ancho completo en móvil. No se usan imágenes ni fuentes web (la PWA debe cargar rápido y
funcionar sin red para las pantallas estáticas). La valoración estética final es **visual y humana** (§17).

## 12. Pantallas

**Login (`/login`)** — `PublicLayout`, `Page` «Entrar»; `<form method="post" noValidate onSubmit>`
(el `method="post"` evita que, si el envío ocurre antes de hidratar, el navegador ponga el PIN en la
query de un GET). Campos: Nombre (`autocomplete="username"`, `autocapitalize="none"`,
`spellcheck="false"`) y `PinField` (`type=password`, `inputmode="numeric"`, `autocomplete="current-password"`,
`pattern="[0-9]*"`, `enterkeyhint="go"`). Validación mínima de cliente: no vacíos (R42); **no** se exige
4–8 dígitos en el login (el servidor solo acota la forma, f1 R24, y el formato no se revela). Al enviar:
`session.login(name, pin)`; éxito → `PublicOnly` redirige a `safeRedirectTarget(from)`; error → R44–R47
(PIN vaciado, nombre conservado, `Alert` de error y foco al PIN en credenciales inválidas). Avisos
`expired` / `signed-out-elsewhere` encima del formulario (R50).

```
Entrar
 [aviso de sesión caducada]
 Nombre   [____________]
 PIN      [••••]  (Mostrar)
 [ Entrar ]            ← errores: «Nombre o PIN incorrectos…» / «Demasiados intentos… 15 minutos»
 Aviso legal
```

**Mi perfil (`/perfil`)** — Nombre y rol; `ChangePinForm` con tres `PinField` (PIN actual
`autocomplete="current-password"`; nuevo y repetir `autocomplete="new-password"`), validación local con
`pinSchema` de `src/shared` + coincidencia (R53); llamadas vía `services.auth.changePin`; éxito (R54):
«PIN cambiado. Se han cerrado tus otras sesiones.»; errores R55–R56 (los tres campos se vacían siempre
tras la respuesta). «Cerrar sesión» (R57, R20) debajo, separado visualmente.

**Cuentas (`/cuentas`, GM)** — carga `accounts.list()` (R58, R59). Encima, formulario «Nueva cuenta»
(nombre + PIN inicial con `PinField`; el GM puede mostrar lo que escribe para comunicárselo al jugador);
validación con `nameSchema`/`pinSchema` de `src/shared` (R61); éxito → fila añadida + confirmación (R60);
`name_taken` (R62). Lista de tarjetas (una por cuenta, `<ul>`):

```
Marta                Jugador · Activa
  [Restablecer PIN] [Deshabilitar] [Desbloquear]
  └ (panel inline) Nuevo PIN [____] [Guardar] [Cancelar]
Gandalf (tú)         GM · Activa
  Cambia tu PIN en «Mi perfil».
```

Confirmaciones **en la propia fila** (R63, R64), no en diálogos modales: más simples de operar con el pulgar,
accesibles por foco natural y testables en jsdom (`<dialog>` modal tiene soporte incompleto en jsdom). Estado
por fila: `idle | confirm-disable | reset-pin | busy`, con mensaje propio `role="status"|"alert"` (R63,
R66, R68–R70). Tras éxito se actualiza la fila con el `AccountDto` devuelto (no se recarga la lista salvo
`not_found`, R68). No se muestra nunca ningún PIN existente (la API no lo expone).

**Inicio (`/`)** — saludo con el nombre, tarjetas de acceso a cada sección visible para el rol (excluye
las `hidden`) y `HealthStatus` (R40). Sin contenido propio de reglas: lo llenan f4/f5.

**Aviso legal (`/legal`)** — ver §14. **404 / «Sin permiso»** — `Page` con título, texto y enlace a `/`.

## 13. Seguridad en el cliente

| Medida | Cómo | R |
|--------|------|---|
| El PIN no se persiste ni se loguea | Vive solo en el estado local del formulario; se vacía tras cada respuesta; nunca en contexto, `location.state`, URL, canal, storage ni consola; sin `console.*` en los flujos | R24, R51, R85, R86 |
| Sin tokens en JS | La sesión es la cookie httpOnly; el cliente no envía `Authorization` ni lee almacenamiento | R10, R85 |
| Autocompletado correcto | `autocomplete=username/current-password/new-password`, `inputmode="numeric"`, `type=password`, `method="post"` | R48 |
| 401 uniforme | Cliente HTTP → `onUnauthenticated` → sesión `anonymous` → guardas redirigen a `/login` con aviso | R8, R18, R25 |
| Mensajes que no filtran información | Mismo texto para nombre desconocido, PIN erróneo y cuenta deshabilitada | R44 |
| Open redirect | `from` solo si es ruta interna y por `state`, no por query | R28 |
| Sin HTML inyectado | Texto legal y mensajes como nodos de texto; prohibido `dangerouslySetInnerHTML` | R72 |
| Logout coherente | Si el servidor no confirma, la UI no finge cerrar sesión; el cierre se propaga a otras pestañas sin datos | R19–R22 |
| La UI no es la barrera | Guardas de rol = UX; el servidor decide (403/404) | §8.2 |
| Service worker | No cachea ni intercepta `/api` ni `/health`; no hay `runtimeCaching` de datos (regla para features futuras: nada privado en caché del SW) | R84 |
| Origen | La web debe servirse desde un origen de `AUTH_ALLOWED_ORIGINS`; `bad_origin` tiene mensaje propio | §2 |

## 14. Aviso legal (`/legal`): decisiones

**Ruta pública (decidido).** El aviso OGL/Section 15 y la declaración de «proyecto no oficial» deben
poder leerse sin credenciales: lo ve cualquiera que llegue a la app, no depende de que el usuario
recuerde su PIN, y no contiene datos privados (es texto estático ya empaquetado en el JS). Se enlaza
desde el pie de **todas** las pantallas (R38), incluida la de login. Con la sesión `loading` o `error`
también se muestra (R29), porque no consulta la API.

**Fuente del texto (decidido): módulo pequeño importado directamente.** `legal-page.tsx` hace
`import { getLegalNotice } from "../../../data/legal"` (ruta al fichero `src/data/legal/index.ts`,
que solo arrastra `ogl-1.0a.ts` ≈ 6,6 KB y `section15.json` ≈ 0,5 KB). **No** se importa el barrel
`src/data/index.ts` (arrastraría `JsonRulesDataSource`, esquemas zod y los shards de datos) ni
ninguna categoría. R73 lo impone con un test estático y R74 con una comprobación del bundle de
producción (integración). Motivos frente a un endpoint `GET /api/legal` público: sin cambio de backend ni de
política de authz, funciona sin red (PWA) y no puede divergir del contenido servido; el texto cambia
solo cuando cambia el repo (`LICENSE-OGL.md` ↔ `getLegalNotice()` ya los iguala `tests/data/legal.test.ts`,
f3 R38).

**Presentación:** `Page` «Aviso legal» → aviso no oficial (párrafo) → «Section 15: Copyright Notice»
(lista, una entrada por `<li>`, literal) → `<details>` «Texto íntegro de la Open Game License v1.0a»
(cerrado por defecto en móvil: son ~6,6 KB) con un `<p>` por párrafo (`oglText.split("\n\n")`, que es como
`ogl-1.0a.ts` los une) y enlace «Volver». Texto del SRD en inglés tal cual (no se traduce: es texto
legal literal). El `<details>` se renderiza siempre en el DOM, de modo que R71 compara el texto completo.

**Cierre de R40 y Q6 de f3:** esta feature monta la pantalla; la propuesta de Q6 («f0 reserva /legal, f8
la implementa, f4 enlaza») queda superada. La revisión legal de Product Identity de Paizo (segunda mitad
de Q6) sigue siendo una decisión humana pendiente, ajena a esta feature.

## 15. PWA / herramientas

- `src/web/pwa-manifest.ts` exporta `NAVIGATE_FALLBACK_DENYLIST: RegExp[] = [/^\/api(\/|$)/, /^\/health$/]`;
  `vite.config.ts` lo pasa a `VitePWA({ workbox: { navigateFallbackDenylist: … } })` (R84). Así una
  navegación directa a `/api/...` o `/health` no recibe el `index.html` del service worker. Las rutas del
  cliente (`/legal`, `/perfil`…) sí caen en el fallback y funcionan offline. El implementer comprueba el
  comportamiento en `vite preview` (en dev el SW está activo por f0 Q4; si el plugin necesita
  `devOptions.navigateFallbackAllowlist` para igualar, lo anota).
- Vite sirve `index.html` para cualquier ruta cliente en desarrollo. **En producción no hay aún quien sirva
  `dist/web`** (el servidor solo expone `/api` y `/health`): f9 DEBE servir estáticos con fallback a
  `index.html` y fijar `AUTH_ALLOWED_ORIGINS` al origen real (Q11). Queda anotado como dependencia de f9.

## 16. Estrategia de pruebas

Entorno: la suite sigue en `environment: "node"` (`vitest.config.ts` sin cambios). Los tests de DOM
llevan la cabecera `// @vitest-environment jsdom`. El `setupFiles` de `no-network.ts` (R50 de f3) sigue
activo: **cualquier `fetch` real en un test unitario falla**, así que todo test inyecta fakes.

| Capa | Cómo se prueba | Fakes |
|------|----------------|-------|
| `http-client`, `auth-api`, `accounts-api` | Funciones puras sobre un `fetchFn` falso que registra `(url, init)` y devuelve `Response` preparadas (patrón de `tests/web/api/health.test.ts`) | `tests/web/helpers/fake-fetch.ts` |
| `SessionProvider`, guardas, rutas, layout, nav | `render` con `MemoryRouter` + `ServicesProvider` con `AppServices` falsos + `SessionChannel` falso | `fake-services.ts`, `fake-session-channel.ts` |
| Pantallas (login, perfil, cuentas, legal, home, errores) | Testing Library + `user-event`; los métodos de `AppServices` son `vi.fn()` con `ok(...)`/`err(...)` | idem |
| `i18n`, `format`, `tokens.css` | Unitarios sin DOM (lee ficheros con `node:fs`, calcula contraste) | — |
| Higiene del código | `hygiene/web-sources.test.ts`: recorre `src/web/**/*.{ts,tsx}`, parsea con la API de `typescript` (devDependency existente) y comprueba R1, R72, R73, R75, R85 | — |
| Contrato con servidor real | `tests/web/auth-ui.int.test.ts` (integración, **opcional pero recomendado**): `composeApp` con stores `InMemory*`, `listen({port:0})`, el **cliente HTTP real** con `baseUrl` y un `fetchFn` con *cookie jar* mínimo que añade `Origin: http://localhost:5173` en métodos mutantes (imita al navegador) | `tests/helpers/auth-fixture.ts` |
| Bundle | `tests/web/bundle.int.test.ts` (integración): `vite.build` a un directorio temporal con `createViteConfig`; comprueba que el JS incluye `OPEN GAME LICENSE Version 1.0a` y **no** un fragmento de texto de un conjuro/dote de f3 (lo lee del dataset dentro del test) | — |

Helpers (`tests/web/helpers/`): `render-app.tsx` (`renderApp({ route, state?, services?, sections?, channel? })`
→ `{ user, services, ...RTL }`; registra `afterEach(cleanup)` porque no hay globals de Vitest);
`fake-services.ts` (`makeServices(overrides)`: todas las llamadas devuelven `ok` por defecto);
`fake-fetch.ts`; `sentinel.ts` (`SENTINEL_PIN = "58392"`, para R24/R51/R86).

**Un test por requisito:** cada `it` lleva `R<n>` en el título (convención de f0/f1). Tabla de ficheros:
`api/{http-client,auth-api,accounts-api}.test.ts` (R1–R12), `session/{session-context.test.tsx,
session-channel.test.ts}` (R13–R24), `shell/{routing,nav,sections,app-layout,public-layout,page,
error-boundary}.test.ts(x)` (R16, R25–R39), `features/home/…` (R40), `features/login/…` (R41–R51 salvo
R46, R49), `i18n/{format,es}.test.ts` (R46, R76), `components/{pin-field,form-field}.test.tsx` (R49,
R77), `features/profile/…` (R52–R57), `features/accounts/…` (R58–R70), `features/legal/…` (R71),
`hygiene/…` (R1, R72, R73, R75, R85), `styles/tokens.test.ts` (R78–R83), `tests/project/pwa-options.test.ts`
(R84), R86 (espías de `console.*` en los tests de pantallas), `*.int.test.ts` (R74, R87).

**Qué NO pueden verificar los tests automáticos (requiere humano en navegador):** apariencia y estética real,
responsive en pantallas reales, teclado numérico y comportamiento del gestor de contraseñas en móvil, sensación
táctil, barra inferior sobre el notch, modo oscuro percibido, foco visible, lectores de pantalla, sincronización
real entre pestañas, el service worker/PWA instalada y el flujo completo contra `npm run dev`. Los agentes no
tienen navegador; todo esto va a la checklist de §17. Los tests automáticos sí cubren el *contenido*, los
atributos, las clases de error, el contraste calculado y la estructura del DOM.

## 17. Checklist de verificación manual (para el humano, ~15 min)

Prerrequisitos: `.env` con `AUTH_PEPPER` propio y `AUTH_COOKIE_SECURE=false`; `npm run create-gm -- "GM"`;
`npm run dev`. Abre **siempre** `http://localhost:5173` (o `127.0.0.1`): ambos están en `AUTH_ALLOWED_ORIGINS`.

1. **Redirección sin sesión.** Sin sesión abre `/`, `/cuentas`, `/perfil` y `/no-existe`: todas acaban en `/login`. El pie muestra «Aviso legal».
2. **Aviso legal público.** Sin sesión abre `/legal`: se ve el aviso no oficial, la Section 15 y, al desplegar, la OGL completa; el enlace «Volver» funciona y no pide login.
3. **Credenciales erróneas.** Entra con un nombre inventado: mensaje genérico, el PIN queda vacío, el nombre se conserva y el foco está en el PIN.
4. **Bloqueo temporal.** Con **un nombre inventado** (no el del GM), falla 6 veces: el 6.º intento muestra el bloqueo con «15 minutos» (el 5.º aún dice «incorrectos», comportamiento esperado, §2). Si bloqueas al GM por error: `npm run reset-gm-lock`.
5. **Login del GM y navegación.** Entra con el GM: aterrizas en Inicio; la navegación muestra Inicio, Cuentas y Mi perfil; el enlace de la barra marca la página actual; recargar la página mantiene la sesión.
6. **Alta de cuentas.** En Cuentas crea «Marta» con PIN `1234`; aparece como Activa. Repite el nombre (también en mayúsculas): error de nombre en uso. Prueba un PIN de 3 dígitos: error sin enviar.
7. **Rol jugador.** En una ventana privada entra como Marta: la navegación no muestra Cuentas; escribir `/cuentas` en la URL muestra «Sin permiso».
8. **Cambiar PIN.** Como Marta, en Mi perfil: PIN actual erróneo → error; correcto → confirmación; cierra sesión y entra con el PIN nuevo.
9. **Acciones del GM.** Restablecer el PIN de Marta (con Marta logueada en la otra ventana): al pulsar cualquier acción en la ventana de Marta, vuelve a `/login` con el aviso de sesión caducada. Deshabilitar a Marta → su login da el mismo mensaje genérico; Habilitar → entra. Desbloquear responde con confirmación. La fila del GM no tiene botones.
10. **Dos pestañas.** Abre la app con la misma sesión en dos pestañas; cierra sesión en una: la otra pasa a `/login` sin recargar, con el aviso correspondiente.
11. **Móvil (360×640 en DevTools y, si puedes, un teléfono real).** Para el teléfono: `HOST=0.0.0.0` y añade `http://<tu-ip>:5173` a `AUTH_ALLOWED_ORIGINS`. Comprueba: teclado numérico en el PIN, la página no hace zoom al enfocar, sin scroll horizontal, la barra inferior no tapa contenido ni el notch, botones fáciles de pulsar con el pulgar.
12. **Modo oscuro.** Cambia el esquema del sistema/DevTools a oscuro: texto legible, bordes y avisos distinguibles, foco visible; vuelve a claro.
13. **Teclado y accesibilidad.** Solo con teclado: Tab (aparece «Saltar al contenido»), el orden es lógico, el foco se ve, al cambiar de página el foco va al título. Con un lector de pantalla (NVDA/VoiceOver) los errores se anuncian.
14. **PWA y API.** `npm run build` y `npx vite preview` (proxea `/api`): navega a `/api/auth/me` en la barra de direcciones y comprueba que **no** devuelve el HTML de la app (R84); instala la PWA y comprueba que `/legal` abre sin red.
15. **Apariencia general.** Valora a ojo coherencia visual, espaciado y legibilidad en móvil y en escritorio, y anota cualquier ajuste de estilo que quieras.

El implementer rellena el resultado en `progress/manual_f1b-auth-ui.md` indicando qué pasos **no** pudo
ejecutar por falta de navegador (todos los de navegador real); el humano confirma o anota fallos.

## 18. Enmiendas a features cerradas

- **f0 R43/R44** (`tests/web/app.test.tsx`): `App` deja de ser la pantalla de salud. `HealthStatus` y
  `fetchHealth` (R41–R43 de f0, con sus tests) se conservan; el indicador pasa a `HomePage`. R44 sigue
  cumpliéndose (todas las cabeceras muestran `es.appName`), pero el test se reescribe porque `App` ahora
  necesita router, servicios y sesión (renderToString sin ellos ya no es posible). El leader/humano
  aprueba esta enmienda con el spec.
- `useHealth` pasa a `useHealth(check = fetchHealth)` para poder inyectar un fake (compatible hacia atrás).
- `docs/architecture.md` §5 (estructura de `src/web`) y el contrato `AppSection` se documentan en la fase de cierre.

## 19. Preguntas abiertas (decide el humano; el spec asume la recomendación)

| # | Pregunta | Recomendación por defecto (asumida) | Si se decide lo contrario |
|---|----------|-------------------------------------|---------------------------|
| Q1 | ¿Qué endpoint da el usuario de la sesión actual? | **Existe** `GET /api/auth/me` (f1 R37): `200 {id,name,role}` / `401`. Ningún cambio de backend | — |
| Q2 | ¿Se muestra qué cuentas están bloqueadas? | **No.** La API no lo expone; «Desbloquear» se ofrece siempre en las filas de jugadores (R66) | Cambio de backend opcional: añadir `lockedUntil: string \| null` a `AccountDto` (solo GM; test en `account-routes.test.ts`) y marcar el bloqueo en la fila |
| Q3 | ¿Librería de enrutado? | `react-router` 7.18.4, modo declarativo | `react-router` 8.4.0 (exige subir `engines.node` a `>=22.22` y `.nvmrc`, lo que toca f0/f1); `wouter` |
| Q4 | ¿Entorno DOM para los tests de componentes? | `jsdom` 29.1.1 + Testing Library | `happy-dom` 21.0.3 (más rápido, menos fiel); sin cambios en el resto |
| Q5 | Estilo visual | CSS plano + tokens, azul `#1f3a5f`, modo oscuro automático, sin conmutador manual | Conmutador manual claro/oscuro/sistema (requeriría persistir preferencia: ¿`localStorage`? choca con R85 salvo excepción explícita) |
| Q6 | ¿Quién crea el primer GM? | **Sigue siendo el CLI** `npm run create-gm`; no hay pantalla de registro. El login no menciona el CLI | Pantalla de bootstrap protegida (nueva feature de backend + UI) |
| Q7 | ¿`/legal` público? | **Sí** (§14) | Solo con sesión: mover la ruta al grupo protegido y cambiar R29 |
| Q8 | ¿De dónde sale el texto legal? | Import directo de `src/data/legal` (≈ 7 KB) | Endpoint público `GET /api/legal` (cambio de backend + estado de carga/errores; no funciona offline) |
| Q9 | ¿Cierre de sesión en todas las pestañas? | `BroadcastChannel` sin datos (R19–R23) | Solo recarga al volver a la pestaña (peor UX) |
| Q10 | ¿Puede el GM operar sobre su propia fila? | **No** (R67): su PIN se cambia en Mi perfil; si se bloquea, `npm run reset-gm-lock` | Permitir «Desbloquear» propio (inútil: no puede entrar si está bloqueado) |
| Q11 | ¿Quién sirve `dist/web` en producción? | **f9** (servir estáticos + fallback SPA + `AUTH_ALLOWED_ORIGINS` real). Se anota como requisito de f9 | Servirlo desde esta feature (amplía el alcance a `src/server`) |
| Q12 | ¿Botón mostrar/ocultar PIN? | **Sí**, oculto por defecto (R49): ayuda en móvil y al GM al asignar PIN | Quitarlo (más estricto) |
| Q13 | ¿Recordar el nombre de usuario entre visitas? | **No** persistimos nada; el gestor de contraseñas del navegador lo rellena (`autocomplete=username`) | `localStorage` con el nombre (no es secreto, pero choca con R85) |
| Q14 | ¿Descubrimiento de secciones por `import.meta.glob`? | **Sí** (R34): añadir una sección = añadir un fichero | Registro explícito (una línea por feature en `features/index.ts`): más visible, pero toca un fichero compartido |
| Q15 | ¿Confirmaciones inline o diálogos? | **Inline** en la fila (R63–R64) | `<dialog>` modal (peor soporte en jsdom, más foco que gestionar) |
| Q16 | ¿Revalidar la sesión al volver a la pestaña? | **No**; basta el 401 de la siguiente petición (R18) | `visibilitychange` + `me` si pasaron > 5 min (feature futura o f5) |

## 20. Alternativas descartadas

- **Token/JWT en `localStorage` o cabecera `Authorization`.** Legible por cualquier XSS y obliga a
  gestionar caducidad y revocación en el cliente. f1 ya entrega cookie httpOnly + sesión revocable en el
  servidor; la UI no necesita tocar credenciales. (R10, R85.)
- **`react-router` 8.4.0.** Es la última, pero exige Node ≥ 22.22 (`engines`), por encima del mínimo del
  repo (`>=22.13`), y habría que tocar `engines`, `.nvmrc` y el test de f0 R6. La 7.18.4 cubre todo lo
  necesario y es compatible. **wouter / TanStack Router:** wouter es minúsculo pero no ofrece rutas
  anidadas con layouts ni `useRoutes` con objetos (clave para `AppSection`); TanStack Router añade
  generación de rutas tipadas que no compensa para ~10 pantallas.
- **Router de datos (`createBrowserRouter` + loaders).** No hay carga de datos por ruta (la sesión vive en
  un contexto y cada pantalla pide lo suyo); el modo declarativo es más simple de probar con `MemoryRouter`.
- **axios / ky / TanStack Query.** Dependencias nuevas para ~10 endpoints; el cliente propio es ~100 líneas,
  devuelve `Result` como exige `docs/conventions.md` y concentra el 401/429. TanStack Query puede
  reconsiderarse en f5 (tiempo real/caché) sin cambiar el contrato de `AppServices`.
- **Redux / Zustand para la sesión.** Un contexto con un `useReducer` basta para un único estado global.
- **Registro central de secciones editado a mano.** Obliga a cada feature a tocar un fichero compartido
  (conflictos entre features en paralelo, `parallel_policy`); el glob reduce el acoplamiento (Q14).
- **Redirigir a `/` cuando el rol no basta.** Oculta por qué no se muestra la pantalla; «Sin permiso» es
  más claro y evita bucles de redirección.
- **Guardar `from` en la query (`/login?next=…`).** Superficie de open redirect y URL manipulable; el
  `state` de navegación no es editable desde un enlace externo (y se valida igualmente, R28).
- **Libraries de UI (MUI/Chakra), Tailwind, CSS-in-JS, CSS Modules.** Peso, build y tooling extra para
  8 usuarios; CSS Modules además tiene comportamiento incierto bajo Vitest. Tokens + CSS plano cumplen
  mobile-first, contraste y modo oscuro con ~200 líneas.
- **i18n con librería (react-i18next / FormatJS).** Una sola lengua (`es`); el objeto tipado + `formatWait`
  da seguridad de tipos sin dependencia. Si algún día hay un segundo idioma, `es.ts` se convierte en un
  diccionario por locale con la misma forma.
- **Endpoint `/api/legal` o importar `src/data` entero para el aviso.** Ver §14: cambia el backend, no
  funciona offline o arrastra los datasets pesados al bundle.
- **Ruta `/legal` solo para usuarios autenticados.** El aviso debe poder leerse antes de usar la app (§14).
- **Esquemas de respuesta (`userDtoSchema`…) en `src/shared`.** Más limpio en abstracto, pero modifica una
  feature cerrada (f1) y sus tests; se mantienen en `src/web/api/schemas.ts` anclados a los tipos de
  `shared` con `satisfies`.
- **`localStorage` + evento `storage` para propagar el logout.** Choca con R85 y con la idea de no
  dejar rastro en almacenamiento; `BroadcastChannel` no persiste.
- **Diálogos modales nativos para confirmar.** Ver Q15.
- **Playwright/Cypress en CI.** Los agentes no tienen navegador y añadiría un binario pesado al
  `init.sh`; el valor se obtiene con RTL + el contrato de integración + la checklist humana. Puede
  plantearse en f9 si se quiere E2E de humo.
- **happy-dom en lugar de jsdom.** Más rápido pero con huecos de fidelidad (foco, `<details>`, formularios);
  los tests dependen de foco y de semántica de formulario.

## 21. Notas de coordinación

- Toca `package.json`/`package-lock.json`, `vite.config.ts`, `src/web/**`, `tests/web/**`, `tests/project/`
  y docs. Es disjunta de f3b (`src/data`, `scripts`), pero **comparte `package.json`/lockfile**: si ambas
  se implementan a la vez, las instalaciones de dependencias se serializan (`parallel_policy`, y el
  aviso de f0 sobre `npm ci` concurrente).
- f4, f5, f8 y f9 dependen de esta base: f4/f5/f8 añaden `features/<x>/section.tsx` y módulos de API
  vía `AppServices`; f9 sirve los estáticos y fija los orígenes (Q11).
