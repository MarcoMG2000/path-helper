# Tasks — f1b-auth-ui

> Pasos discretos y ordenados. Marca `[x]` al completar. Cada task cita los `R<n>` que ayuda a
> cumplir (`requirements.md`). Tras cada bloque, ejecuta `npm test`, `npm run typecheck` y
> `npm run lint` sobre lo tocado; al cerrar, `./init.sh` completo. No toques `src/server` ni
> `src/shared`. Un test por requisito, con `R<n>` en el título. Textos visibles solo en `es.ts`.
> Los tests de DOM empiezan con `// @vitest-environment jsdom`.

## A. Preparación

- [x] **T1.** Reconfirmar versiones con `npm view` (§4 del design) e instalar con versiones
  exactas: `react-router@7.18.4` (dependencia) y `jsdom@29.1.1`, `@testing-library/react@16.3.3`,
  `@testing-library/dom@10.4.2`, `@testing-library/user-event@14.6.8` (dev). Verificar que
  `npm ci` y `engine-strict` pasan con Node 22.13 como mínimo (ver `engines` de cada paquete). Si
  alguna versión difiere de la del design, anotarlo en `progress/impl_f1b-auth-ui.md`. No
  ejecutar instalaciones en paralelo con otros agentes. _(soporte de todos los R)_
- [x] **T2.** Crear los helpers de test `tests/web/helpers/{fake-fetch,fake-services,
  fake-session-channel,render-app,sentinel}.ts(x)` (§16): `render-app` registra `afterEach(cleanup)`
  y monta `MemoryRouter` + `ServicesProvider` + `SessionProvider`; `fake-services` devuelve `ok`
  por defecto; `sentinel` exporta `SENTINEL_PIN`. Un test mínimo que renderice un componente de
  prueba confirma que jsdom + RTL + `no-network` conviven. _(soporte)_

## B. Cliente HTTP y módulos de API

- [x] **T3.** Tests y luego `src/web/api/schemas.ts` (`userDtoSchema`, `accountDtoSchema`,
  `errorBodySchema` ancladas con `satisfies` a los tipos de `src/shared`). _(R2–R5)_
- [x] **T4.** Tests y luego `src/web/api/http-client.ts`: éxito con schema/204, cuerpo inválido,
  tabla de todos los `ErrorCode`, código desconocido, fallo de red, `Retry-After`,
  `onUnauthenticated` solo con `unauthenticated`, cabeceras (`Content-Type` solo con cuerpo),
  `credentials: "same-origin"`, sin `Authorization`; `fetchFn` por defecto leído en cada llamada.
  _(R2–R10)_
- [x] **T5.** Tests y luego `src/web/api/auth-api.ts` y `src/web/api/accounts-api.ts` (rutas,
  métodos, cuerpos, `encodeURIComponent(id)`). _(R11, R12)_
- [x] **T6.** `src/web/api/services.tsx`: `AppServices`, `createServices` (emisor
  `onUnauthenticated` conectado al cliente), `ServicesProvider`, `useServices`; `useHealth(check =
  fetchHealth)` en `hooks/use-health.ts`. _(R8, R18, soporte de R40)_

## C. i18n y estilos

- [x] **T7.** Ampliar `src/web/i18n/es.ts` (secciones de §10; `es.errors` tipado como
  `Record<ClientErrorCode, …>`) manteniendo `es.appName` y `es.health`. Crear `i18n/format.ts`
  (`formatWait`, `plural`). Tests `i18n/es.test.ts` y `i18n/format.test.ts` (tabla de R46). _(R46, R76)_
- [x] **T8.** Crear `src/web/styles/{tokens,base,layout,components}.css` (§11): tokens de color
  (hex de 6 dígitos) / espaciado / radio / tipografía / `--ph-tap-min`, bloque
  `prefers-color-scheme: dark` con los mismos tokens, `color-scheme: light dark`, sin colores
  literales fuera de `tokens.css`, solo `min-width`, `min-height: var(--ph-tap-min)` y `font-size ≥ 1rem`
  en controles. Test `styles/tokens.test.ts` (paridad claro/oscuro, contraste ≥ 4,5 de los pares de
  §11.2, sin `max-width`, sin hex fuera de tokens, tap-min ≥ 44 px, font-size ≥ 1rem). Importar los CSS
  desde `main.tsx` (T22). _(R78–R83)_

## D. Sesión

- [x] **T9.** Tests y luego `src/web/session/session-channel.ts` (`SessionChannel`,
  `createBroadcastSessionChannel` con canal nulo si no hay `BroadcastChannel`; test en entorno `node`
  con dos instancias reales y otro con `BroadcastChannel` borrado). _(R21–R23)_
- [x] **T10.** Tests y luego `src/web/session/session-context.tsx`: estados
  `loading/authenticated/anonymous/error`, `login`, `logout` (fallo mantiene sesión), `reload`,
  `clearNotice`, suscripción a `onUnauthenticated` (solo desde `authenticated`), mensajes del canal,
  ignorar respuestas obsoletas (StrictMode), estado sin PIN (PIN centinela). _(R13–R24)_

## E. Shell

- [x] **T11.** Tests y luego `src/web/shell/sections.ts`: `AppSection`, `defineSection`,
  `RESERVED_PATHS`, `validateSections` (id/path duplicados, rutas reservadas y subrutas; error con el
  `id`), `loadSections` con `import.meta.glob("../features/*/section.tsx", { eager: true })` (acepta
  default `AppSection | AppSection[]`; ordena por `order`). _(R34, R35)_
- [x] **T12.** Tests y luego `src/web/shell/guards.tsx` (`RequireAuth`, `RequireRole`, `PublicOnly`,
  `safeRedirectTarget`) y `shell/splash.tsx` (carga con `role="status"`, error de sesión con «Reintentar»).
  Tabla de destinos peligrosos de R28. _(R16, R25–R28, R31)_
- [x] **T13.** Tests y luego `src/web/shell/{page,footer,nav,public-layout,app-layout,
  error-boundary}.tsx` y `components/{alert,form-field,pin-field}.tsx`: `Page` (h1 enfocable +
  `document.title`), enlace «Saltar al contenido», landmarks, `Nav` por rol/orden con `aria-current`,
  pie con enlace a `/legal`, `AppErrorBoundary`, `FormField` (label, `aria-invalid`,
  `aria-describedby`, `role="alert"`), `PinField` (mostrar/ocultar con `aria-pressed`). _(R36–R39, R49, R77)_
- [x] **T14.** Tests y luego `src/web/shell/routes.tsx` (`buildRoutes(sections)` + `AppRoutes` con
  `useRoutes`, árbol de §8.1) y `app.tsx` (`App({ services, sections?, channel? })` con
  `AppErrorBoundary > ServicesProvider > SessionProvider > AppRoutes`). Prueba con una sección ficticia
  inyectada (con `children`) que aparece en rutas y navegación sin tocar el shell. _(R25–R33)_

## F. Pantallas

- [x] **T15.** Tests y luego `features/errors/{not-found-page,forbidden-page}.tsx`. _(R30, R31, R38)_
- [x] **T16.** Tests y luego `features/home/home-page.tsx` (saludo, accesos por rol sin las
  `hidden`, `HealthStatus` con `services.checkHealth`). _(R40)_
- [x] **T17.** Tests y luego `features/login/login-page.tsx`: campos y labels, validación de vacíos,
  envío único con `aria-busy`, errores de R44/R45/R47 (nombre conservado, PIN vaciado, foco al PIN),
  atributos de R48, avisos `expired`/`signed-out-elsewhere`, PIN centinela no persistido (R51) y cero
  llamadas a `console.*` (R86). _(R41–R51, R86)_
- [x] **T18.** Tests y luego `features/profile/{section.tsx,profile-page.tsx,change-pin-form.tsx}`:
  datos del usuario, validación local con `pinSchema`, éxito/errores (`invalid_current_pin`, `locked`),
  «Cerrar sesión» con fallo (R20), sin `console.*`. Sección `/perfil`, `["player","gm"]`, order 90.
  _(R20, R52–R57, R86)_
- [x] **T19.** Tests y luego `features/accounts/{section.tsx,accounts-page.tsx,
  create-account-form.tsx,account-row.tsx}`: carga/error/reintento, alta (validación con
  `nameSchema`/`pinSchema`, `name_taken`), fila con restablecer PIN (panel inline, cancelar), deshabilitar
  con confirmación inline, habilitar, desbloquear siempre disponible, fila del GM sin acciones,
  `not_found` → recarga, otros errores, botones deshabilitados en curso, sin `console.*`. Sección
  `/cuentas`, `["gm"]`, order 50. _(R58–R70, R86)_
- [x] **T20.** Tests y luego `features/legal/legal-page.tsx`: importa **solo** `src/data/legal`,
  aviso no oficial + Section 15 + OGL en `<details>` con un `<p>` por párrafo; el texto renderizado
  coincide con `getLegalNotice()`. _(R71, R29, R38)_

## G. Integración con la app y herramientas

- [x] **T21.** Test `hygiene/web-sources.test.ts` (AST de `typescript`): `fetch(` solo en
  `api/http-client.ts` y `api/health.ts`; ningún `dangerouslySetInnerHTML`; imports de `src/data` solo
  hacia `src/data/legal`; ninguna importación de `src/server`; sin `localStorage`/`sessionStorage`/
  `indexedDB`/`document.cookie`; sin literales de texto en JSX ni en `aria-label`/`title`/`placeholder`/`alt`.
  _(R1, R72, R73, R75, R85)_
- [x] **T22.** `main.tsx`: `createServices()`, `createBroadcastSessionChannel()`, `BrowserRouter`,
  imports de CSS y `registerSW`; reescribir `tests/web/app.test.tsx` (enmienda a f0 R43/R44, design §18):
  el encabezado muestra `es.appName` y se redirige a `/login` sin sesión. _(R25, enmienda f0)_
- [x] **T23.** PWA: `NAVIGATE_FALLBACK_DENYLIST` en `src/web/pwa-manifest.ts`, usarla en
  `vite.config.ts` (`workbox.navigateFallbackDenylist`); test `tests/project/pwa-options.test.ts` (las
  regex niegan `/api/auth/me` y `/health` y aceptan `/legal`, `/cuentas`); actualizar si procede
  `tests/project/vite-config.test.ts`. Comprobar `npm run build` y `npx vite preview`. _(R84)_

## H. Integración (opcional pero recomendada)

- [x] **T24.** `tests/web/auth-ui.int.test.ts`: `composeApp` con stores `InMemory*` y hasher espía,
  `listen({port:0})`; cliente HTTP real con `baseUrl`, *cookie jar* y `Origin` en métodos mutantes.
  Flujo: login → `me` → `changePin` → logout → `me` da 401 (callback invocado); 5 logins fallidos → 429
  con `retryAfterSeconds`; GM: crear, resetPin, setDisabled, unlock; jugador recibe `forbidden` en
  `/api/accounts`. _(R87)_
- [x] **T25.** `tests/web/bundle.int.test.ts`: `vite.build` a directorio temporal con
  `createViteConfig`; el JS contiene `OPEN GAME LICENSE Version 1.0a` y no un fragmento de texto de un
  conjuro/dote leído del dataset de f3. _(R74)_

## I. Cierre

- [x] **T26.** Documentación: `docs/architecture.md` §5 (estructura de `src/web` y contrato
  `AppSection`), `README.md` (sección «Interfaz web»: primer uso, `AUTH_ALLOWED_ORIGINS` para móvil por
  LAN, `create-gm`), y nota para f9 (servir estáticos con fallback SPA y orígenes reales, Q11).
- [x] **T27.** `./init.sh` en verde; `npm run test:int` (al menos `auth-ui` y `bundle`); `npm run lint`;
  `npm run typecheck`; `npm run build`. Comprobar trazabilidad R1–R87 ↔ tests y dejar la tabla en
  `progress/impl_f1b-auth-ui.md`, indicando versiones instaladas y desviaciones.
- [x] **T28.** Preparar `progress/manual_f1b-auth-ui.md` con la checklist de 15 pasos de `design.md`
  §17, marcando todos como «pendiente de humano (requiere navegador)», salvo lo que el implementer haya
  podido verificar por otros medios (p. ej. `curl` contra `npm run dev`). No marcar la feature como
  `done`: lo decide el leader tras el reviewer y la checklist.

## Mapa de cobertura R → task

| R | Task | R | Task | R | Task |
|---|------|---|------|---|------|
| R1 | T21 | R30 | T14, T15 | R59 | T19 |
| R2–R7 | T3, T4 | R31 | T12, T14, T15 | R60–R62 | T19 |
| R8 | T4, T6 | R32 | T13, T14 | R63–R66 | T19 |
| R9, R10 | T4 | R33 | T14 | R67 | T19 |
| R11, R12 | T5 | R34, R35 | T11 | R68–R70 | T19 |
| R13–R20 | T10 (R16: T12) | R36–R39 | T13 | R71 | T20 |
| R21–R23 | T9, T10 | R40 | T16 | R72, R73 | T21 |
| R24 | T10 | R41–R45 | T17 | R74 | T25 |
| R25–R28 | T12, T14 | R46 | T7 | R75 | T21 |
| R29 | T14, T20 | R47, R48 | T17 | R76 | T7 |
| R49 | T13 | R50, R51 | T17 | R77 | T13 |
| R52–R57 | T18 | R58 | T19 | R78–R83 | T8 |
| R84 | T23 | R85 | T21 | R86 | T17, T18, T19 |
| R87 | T24 | | | | |
