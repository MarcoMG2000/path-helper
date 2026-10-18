# Implementación — f1b-auth-ui

Estado: **implementado, pendiente de reviewer y de la checklist manual del humano**. Tasks T1..T28 marcadas
`[x]` en `specs/f1b-auth-ui/tasks.md`. NO se ha marcado `done`, no se ha tocado `feature-list.json`, no se
han hecho commits, no se ha ejecutado `npm ci` ni `./init.sh` (lo hará el reviewer). Sin cambios en
`src/server`, `src/shared`, `src/data`, `src/rules` ni `scripts/srd`.

## Verificación ejecutada (Node v24.20.0, npm 11.19, Windows 11 + Git Bash)

| Comando | Resultado |
|---|---|
| `npx vitest run` (suite unitaria completa) | **155 ficheros / 2242 tests en verde** |
| `npm run test:int` | **9 ficheros / 58 tests en verde** (incluye `tests/web/auth-ui.int.test.ts` y `tests/web/bundle.int.test.ts`, `pipeline.int`, `dev-server.int`, etc.) |
| `npm run typecheck` | sin errores |
| `npm run lint` | sin errores |
| `npx prettier --check src/web tests/web tests/project/pwa-options.test.ts vite.config.ts` | OK (se formatearon con `--write`) |
| `npm run build` | OK. `dist/web/assets/index-*.js` **376,49 kB (116,73 kB gzip)**, CSS 6,93 kB (1,80 kB gzip), PWA precache 6 entradas (380,51 KiB). El bundle contiene la OGL y NO contiene texto de conjuros/dotes de f3 (R74) |
| `vite preview` (puerto 4179, proceso de vida corta con `timeout`) | `/legal` y `/cuentas` -> `index.html` 200; `/api/auth/me` y `/health` -> proxy a la API (502 al no estar la API arriba; NO el HTML); `sw.js` servido |
| Dev real (`tsx src/server/main.ts` + `vite`, BD temporal en el scratchpad, `timeout 40`) | `create-gm` OK; vía el proxy de Vite (`:5188`): `/health` 200, `me` sin sesión 401 `no-store`, login desde origen no permitido 403 `bad_origin`, login 200 + cookie, `me` 200, alta de cuenta 201, listado, logout 204, `me` tras logout 401 |
| `vite` dev (puerto 5181/5182) | `/legal`, `/perfil` -> `index.html`; `/main.tsx`, CSS, `shell/routes.tsx` y `legal-page.tsx` se transforman (200); `/@fs/.../src/data/legal/*` accesible (200) |

No se dejó ningún proceso en marcha (comprobado con `tasklist`). `node_modules` no se corrompió; no hizo falta
`rm -rf node_modules && npm ci`.

## Dependencias (versiones exactas reconfirmadas con `npm view` el 2026-10-18)

| Paquete | Versión | Tipo | Notas |
|---|---|---|---|
| `react-router` | 7.18.4 | dependencia | `engines.node >=20`; peer `react >=18`. Imports (`BrowserRouter`, `MemoryRouter`, `useRoutes`, `NavLink`, `Navigate`, `Outlet`, `parsePath`...) todos desde `"react-router"` |
| `jsdom` | 29.1.1 | dev | `engines ^20.19 \|\| ^22.13 \|\| >=24` (la 30.x pide Node >= 22.22) |
| `@testing-library/react` | 16.3.3 | dev | |
| `@testing-library/dom` | 10.4.2 | dev | peer de la anterior |
| `@testing-library/user-event` | 14.6.8 | dev | |

Coinciden con las del design (sin diferencias). Latest del registro: react-router 8.4.0 (exige Node >= 22.22) y
jsdom 30.1.3: descartadas como decide el spec. **Desviación menor:** la instalación fue en **dos** operaciones
(`npm install --save-exact react-router@7.18.4` y luego `npm install --save-dev --save-exact` con las otras
cuatro) en lugar de una; ambas en serie, sin otros agentes. `engine-strict` pasa; el lockfile solo suma
paquetes.

## Cómo arrancar y probar con el GM de ejemplo

```bash
cp .env.example .env        # ya existe en esta máquina; pon un AUTH_PEPPER propio (en dev vale el marcador)
npm run create-gm -- "Gandalf"     # pide el PIN (4-8 dígitos) por stdin / prompt
npm run dev                         # API :3000 + Vite :5173
# abrir SIEMPRE http://localhost:5173 o http://127.0.0.1:5173 (ambos en AUTH_ALLOWED_ORIGINS)
```

Entra con el GM, ve a Cuentas y crea jugadores. Para el móvil por LAN: `HOST=0.0.0.0` y añade
`http://<ip>:5173` a `AUTH_ALLOWED_ORIGINS`. Si se bloquea al GM: `npm run reset-gm-lock`. Checklist manual
rellenada (con lo que NO se pudo ejecutar) en `progress/manual_f1b-auth-ui.md`. README y
`docs/architecture.md` §5 actualizados (T26), incluida la nota para f9.

## Qué se hizo (por tasks)

- **T1-T2** dependencias y helpers `tests/web/helpers/{fake-fetch,fake-services,fake-session-channel,render-app,sentinel}`
  (+ `deferred.ts`, `console-spy.ts`, `harness.test.tsx` que prueba que jsdom + RTL + `no-network` conviven).
- **T3-T6** `api/{schemas,http-client,auth-api,accounts-api,services}`; `useHealth(check)`.
- **T7-T8** `i18n/{es,format,error-message}`; `styles/{tokens,base,layout,components}.css`.
- **T9-T10** `session/{session-channel,session-context}`.
- **T11-T14** `shell/{sections,load-sections,guards,splash,page,skip-link,footer,nav,public-layout,app-layout,error-boundary,routes}`, `components/{alert,form-field,text-input,pin-field}`, `app.tsx`.
- **T15-T20** pantallas `errors`, `home`, `login`, `profile` (+ `section.tsx`), `accounts` (+ `section.tsx`), `legal`.
- **T21** `tests/web/hygiene/web-sources.test.ts` (AST de `typescript`, con autotest del analizador).
- **T22-T23** `main.tsx` (BrowserRouter + `createServices` + `createBroadcastSessionChannel` + CSS + `registerSW`),
  `NAVIGATE_FALLBACK_DENYLIST` + `vite.config.ts` (`workbox.navigateFallbackDenylist`), `tests/project/pwa-options.test.ts`.
- **T24-T25** `tests/web/auth-ui.int.test.ts`, `tests/web/bundle.int.test.ts`.
- **T26-T28** docs, verificación, checklist manual.

## Enmiendas a features cerradas (declaradas en el spec)

- **f0 R43/R44:** `App` ya no es la pantalla de salud (ahora recibe `services`, `sections?`, `channel?` y necesita
  router). `tests/web/app.test.tsx` reescrito con RTL: R44 (la cabecera de login y la del layout autenticado
  muestran `es.appName`) y R43 (`HealthStatus` en Inicio muestra `loading` y luego `ok`). `HealthStatus`, `fetchHealth`
  y sus tests de f0 no se tocan. `useHealth(check = fetchHealth)` es retrocompatible.
- **`navigateFallbackDenylist`** en `vite.config.ts`; `tests/project/vite-config.test.ts` no necesitó cambios.

## Desviaciones y decisiones menores respecto al design (ninguna cambia un requisito)

1. **`loadSections` vive en `src/web/shell/load-sections.ts`** (el design lo situaba en `sections.ts`): los
   `features/*/section.tsx` importan `defineSection` de `sections.ts` y `import.meta.glob` eager los importa a su vez,
   lo que habría creado un ciclo de módulos. `sections.ts` queda como hoja (tipos, `defineSection`, `RESERVED_PATHS`,
   `validateSections`, más `sortSections`/`visibleSections`).
2. **Ficheros extra** no listados en §3: `components/text-input.tsx`, `i18n/error-message.ts` (`errorMessage(error)` que
   resuelve `es.errors[code]` con la espera de `formatWait`), `shell/skip-link.tsx`.
3. **`AppErrorBoundary` acepta `onReload?`** (por defecto `window.location.reload()`) para poder probar R39 en jsdom,
   donde `location.reload` no es sustituible.
4. **`es.errors` usa `satisfies Record<ClientErrorCode, ...>`** (en vez de una anotación): conserva el fallo de `tsc`
   si `ErrorCode` crece (R76) y permite llamar a `es.errors.locked(...)` con tipos precisos.
5. **`ERROR_CODES` en `api/schemas.ts`** se deriva de un `Record<ErrorCode, true>` (compilación exhaustiva); lo reusan
   los tests de R4/R76.
6. **R81 (test de `max-width`)**: el test valida las condiciones de `@media` (solo `min-width`, nunca `max-*`) y no
   prohíbe la *propiedad* `max-width`, que se usa legítimamente para centrar el contenido (`--ph-content-max`).
7. **Foco tras un login fallido**: el foco va al PIN en todos los errores (el spec lo exige para `invalid_credentials`);
   y el PIN se vacía tras toda respuesta, también en errores de red.
8. **Reintento de sesión (`error`)**: `Splash` muestra un texto neutro («No se pudo contactar con el servidor…») porque el
   estado `error` agrupa red y 5xx.
9. **Recarga por `not_found` (R68)** es silenciosa (sin pasar por «Cargando…»), de modo que las filas que siguen
   existiendo conservan su mensaje de error.
10. **El panel «Restablecer PIN» enfoca su campo** al abrirse, y el campo de nombre de «Nueva cuenta» usa
    `autocomplete="off"`.
11. **Botones de la fila de cuenta con `aria-label`** que incluye el nombre («Restablecer PIN de Marta») además del
    texto visible (label-in-name); los tests los buscan así.
12. **Dev SW:** `devOptions.enabled: true` (f0 Q4) se deja tal cual; el comportamiento del SW de desarrollo frente a
    navegaciones a `/api` NO se pudo comprobar sin navegador (la comprobación de producción sí: `sw.js` contiene el
    `denylist`). Queda en el paso 14 de la checklist.
13. **Tamaño del bundle:** 376 kB (117 kB gzip) de JS; el grueso es React + react-router + zod. Sin datasets.

## Observaciones para el reviewer / leader

- **Tras un cierre de sesión voluntario**, `RequireAuth` guarda como `from` la ruta en la que estaba el usuario (no se
  distingue de una visita sin sesión, R25). En un móvil compartido, si el siguiente usuario tiene otro rol puede
  aterrizar en «Sin permiso» (p. ej. un jugador tras un GM que salió desde `/cuentas`). Es inocuo (la guarda lo
  resuelve); si molesta, es un cambio pequeño de `ProfilePage`/`RequireAuth` que requeriría un requisito nuevo.
- La **Q3 del spec de f3 (revisión legal de Product Identity)** sigue siendo una decisión humana ajena a esta feature.
- **Pendiente para f9:** servir `dist/web` con fallback SPA y fijar `AUTH_ALLOWED_ORIGINS` al origen real (anotado en
  README y `docs/architecture.md`).
- `.env` ya existía en la máquina: no se tocó (los smoke tests usaron variables de entorno y una BD temporal en el
  scratchpad).
- Mejoras de backend opcionales NO hechas (fuera de alcance): `lockedUntil` en `AccountDto` (Q2) y `setNotFoundHandler`
  para `/api` (review I-2 de f1).

## Trazabilidad R<n> -> test (rutas bajo `tests/`)

Todos los R1..R87 tienen al menos un test con `R<n>` en el título (comprobado con un script que extrae los `R<n>` de
los títulos de `tests/web/**` y `tests/project/pwa-options.test.ts`, excluyendo los tests de f0).

| R | Test |
|---|---|
| R1 | `web/hygiene/web-sources.test.ts`, `web/api/http-client.test.ts`, `web/api/services.test.ts` |
| R2-R7, R9, R10 | `web/api/http-client.test.ts` |
| R8 | `web/api/http-client.test.ts`, `web/api/services.test.ts` |
| R11 | `web/api/auth-api.test.ts` |
| R12 | `web/api/accounts-api.test.ts` |
| R13-R15, R17, R19 | `web/session/session-context.test.tsx` |
| R16 | `web/session/session-context.test.tsx`, `web/shell/routing.test.tsx` |
| R18 | `web/session/session-context.test.tsx`, `web/api/services.test.ts` |
| R20 | `web/session/session-context.test.tsx`, `web/features/profile/profile-page.test.tsx` |
| R21, R22 | `web/session/session-channel.test.ts`, `web/session/session-context.test.tsx` |
| R23 | `web/session/session-channel.test.ts` |
| R24 | `web/session/session-context.test.tsx`, `web/session/session-channel.test.ts` |
| R25-R28 | `web/shell/routing.test.tsx` (R28 incluye la tabla de `safeRedirectTarget`) |
| R29 | `web/shell/routing.test.tsx`, `web/features/legal/legal-page.test.tsx` |
| R30, R31 | `web/shell/routing.test.tsx`, `web/features/errors/error-pages.test.tsx` |
| R32 | `web/shell/nav.test.tsx`, `web/shell/sections.test.ts` |
| R33 | `web/shell/routing.test.tsx`, `web/shell/nav.test.tsx` |
| R34, R35 | `web/shell/sections.test.ts` |
| R36, R38 | `web/shell/app-layout.test.tsx`, `web/shell/public-layout.test.tsx` |
| R37 | `web/shell/page.test.tsx` |
| R39 | `web/shell/error-boundary.test.tsx` |
| R40 | `web/features/home/home-page.test.tsx` |
| R41-R45, R47, R48, R50, R51 | `web/features/login/login-page.test.tsx` (R41 también `web/components/form-field.test.tsx`; R48 también `web/components/pin-field.test.tsx`) |
| R46 | `web/i18n/format.test.ts` |
| R49 | `web/components/pin-field.test.tsx` |
| R52-R57 | `web/features/profile/profile-page.test.tsx` |
| R58-R70 | `web/features/accounts/accounts-page.test.tsx` |
| R71 | `web/features/legal/legal-page.test.tsx` |
| R72, R73, R75, R85 | `web/hygiene/web-sources.test.ts` |
| R74 | `web/bundle.int.test.ts` (integración) |
| R76 | `web/i18n/es.test.ts` |
| R77 | `web/components/form-field.test.tsx` |
| R78-R83 | `web/styles/tokens.test.ts` |
| R84 | `project/pwa-options.test.ts`, `web/bundle.int.test.ts` (el `sw.js` generado) |
| R86 | `web/features/login/login-page.test.tsx`, `profile-page.test.tsx`, `accounts-page.test.tsx` (espías de `console.*`) |
| R87 | `web/auth-ui.int.test.ts` (integración) |

## Ficheros

Creados: `src/web/api/{schemas,http-client,auth-api,accounts-api,services}`, `src/web/session/*`, `src/web/shell/*`,
`src/web/components/{alert,form-field,text-input,pin-field}.tsx`, `src/web/features/{home,login,profile,accounts,legal,errors}/*`,
`src/web/i18n/{format,error-message}.ts`, `src/web/styles/*.css`, `tests/web/**` (helpers, api, session, shell, features,
components, i18n, styles, hygiene, `auth-ui.int.test.ts`, `bundle.int.test.ts`), `tests/project/pwa-options.test.ts`,
`progress/manual_f1b-auth-ui.md`.
Modificados: `package.json`, `package-lock.json`, `vite.config.ts`, `src/web/{app,main}.tsx`, `src/web/hooks/use-health.ts`,
`src/web/i18n/es.ts`, `src/web/pwa-manifest.ts`, `tests/web/app.test.tsx`, `README.md`, `docs/architecture.md`,
`specs/f1b-auth-ui/tasks.md` (solo marcas `[x]`), `progress/current.md`.
