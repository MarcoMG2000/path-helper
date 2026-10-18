# Review — feature f1b-auth-ui

**Veredicto:** RECHAZADO (CHANGES_REQUESTED) — un unico hallazgo bloqueante (H1: el servidor de desarrollo de Vite sirve ficheros del repo, incluida la BD SQLite, a toda la LAN en el modo `HOST=0.0.0.0` que el propio README de f1b recomienda). Todo lo demas cumple: `init.sh` verde, R1..R87 con test real, tasks T1..T28 `[x]`, cliente sin tokens ni PIN persistido, autorizacion correcta contra servidor real, OGL verbatim. Corregido H1 (un bloque `server.fs` en `vite.config.ts` + un test) la feature es aprobable sin mas rondas.

Revisor: agente `reviewer`, 2026-10-18. Node v24.20.0, Windows 11 + Git Bash.

## Resultados reales de ejecucion

| Comando | Resultado |
|---|---|
| `bash ./init.sh` (1.a vez) | `npm ci` fallo con `ENOTEMPTY` (`node_modules\rxjs\src`, bloqueo de Windows) -> se borro `node_modules` y se repitio una vez, como se indico |
| `bash ./init.sh` (2.a vez) | **EXIT 0**: `npm ci` OK (0 vulnerabilidades), `npm test`: **155 ficheros / 2242 tests en verde**, `data:validate` "sin errores", "init OK" |
| `npm run test:int` | **9 ficheros / 58 tests en verde** (incluye `auth-ui.int.test.ts` y `bundle.int.test.ts`) |
| `npm run lint` | sin errores |
| `npm run typecheck` | sin errores |
| `npm run build` | OK: `index-*.js` 376,49 kB (116,73 kB gzip), CSS 6,93 kB, PWA precache 6 entradas, `sw.js` generado |
| `npx prettier --check src/web tests/web tests/project vite.config.ts` | OK |
| `npm audit` | 0 vulnerabilidades |
| Procesos | ninguno en segundo plano (`tasklist` sin `node.exe`); BD temporales borradas; la junction de `node_modules` usada en la copia de pruebas se elimino sin tocar el `node_modules` real (406 entradas intactas) |

`git status` confirma que NO se toco `src/server`, `src/shared`, `src/data`, `src/rules`.

## Trazabilidad requirements <-> tests

Verificada con un script propio que extrae los `R<n>` de los titulos de `it(...)` de `tests/web/**` y `tests/project/pwa-options.test.ts` (R28 y R61 solo escapaban a mi regex por usar `it.each([...])("R28: ...")`; localizados a mano en `shell/routing.test.tsx:108,113` y `features/accounts/accounts-page.test.tsx:138`). Ademas lei el contenido de los tests de seguridad (no solo el titulo) y comprobe con mutaciones que fallan de verdad (ver punto 1 y punto 5 de la lista de seguridad).

- R1: [x] `hygiene/web-sources.test.ts` (AST: `fetch` solo en `api/http-client.ts` y `api/health.ts`), `api/http-client.test.ts`, `api/services.test.ts`
- R2-R7: [x] `api/http-client.test.ts` (tabla de todos los `ErrorCode`; `Retry-After` con 6 valores invalidos)
- R8: [x] `api/http-client.test.ts`, `api/services.test.ts`
- R9, R10: [x] `api/http-client.test.ts` (R10 incluye "no lee almacenamiento ni cookies")
- R11: [x] `api/auth-api.test.ts`
- R12: [x] `api/accounts-api.test.ts` (id codificado)
- R13-R20, R24: [x] `session/session-context.test.tsx` (R20 tambien `features/profile/profile-page.test.tsx`; R24 serializa el estado con PIN centinela)
- R21-R23: [x] `session/session-channel.test.ts` (dos `BroadcastChannel` reales en Node; un objeto `{name,pin}` se descarta) y `session/session-context.test.tsx`
- R25-R28: [x] `shell/routing.test.tsx` (R28: tabla con `//evil.com`, `https://evil.com`, `javascript:`, vacio, `/\evil.com`, `/<TAB>/evil.com`, `/login`, numero, `undefined`)
- R29-R31, R33: [x] `shell/routing.test.tsx`, `features/errors/error-pages.test.tsx`, `features/legal/legal-page.test.tsx`
- R32: [x] `shell/nav.test.tsx`, `shell/sections.test.ts`
- R34, R35: [x] `shell/sections.test.ts`
- R36-R39: [x] `shell/app-layout.test.tsx`, `shell/public-layout.test.tsx`, `shell/page.test.tsx`, `shell/error-boundary.test.tsx`
- R40: [x] `features/home/home-page.test.tsx`
- R41-R45, R47, R48, R50, R51: [x] `features/login/login-page.test.tsx` (R41 tambien `components/form-field.test.tsx`; R48 tambien `components/pin-field.test.tsx`)
- R46: [x] `i18n/format.test.ts`
- R49: [x] `components/pin-field.test.tsx`
- R52-R57: [x] `features/profile/profile-page.test.tsx`
- R58-R70: [x] `features/accounts/accounts-page.test.tsx`
- R71: [x] `features/legal/legal-page.test.tsx`
- R72, R73, R75, R85: [x] `hygiene/web-sources.test.ts` (con autotest del analizador)
- R74: [x] `bundle.int.test.ts` (integracion)
- R76: [x] `i18n/es.test.ts`
- R77: [x] `components/form-field.test.tsx`
- R78-R83: [x] `styles/tokens.test.ts`
- R84: [x] `tests/project/pwa-options.test.ts` + `bundle.int.test.ts` + inspeccion manual de `dist/web/sw.js` (ver punto 6)
- R86: [x] `login-page`, `profile-page`, `accounts-page` (espias de `console.*`)
- R87: [x] `auth-ui.int.test.ts` (servidor real `composeApp`, cookie jar, `Origin`)

Observaciones de calidad de tests (no bloqueantes): R74 "no incluye datasets" solo muestrea un fragmento de `spells/f.json` y otro de `feats/a.json` (mas un tope de 1024 KiB), aunque su titulo dice "ni de objetos magicos"; basta porque el tope de tamano falla igualmente (ver mutacion). R81: el test valida condiciones `@media` (solo `min-width`) y no prohibe la propiedad `max-width` (usada para centrar); el texto del requisito dice "media queries ... solo min-width" y la nota entre parentesis ("ninguna `max-width`") es mas estricta; desviacion 6 del implementer, razonable (aceptada).

## Tasks completas

- T1..T28: [x] (28 `[x]`, 0 `[ ]` en `specs/f1b-auth-ui/tasks.md`)

## Checkpoints

- C1: [x] archivos base y 4 docs presentes; `./init.sh` exit 0
- C2: [x] una sola feature `in_progress` (f1b; f4 esta `spec_ready`); `progress/current.md` describe la sesion activa
- C3: [x] capas OK (`src/web` solo importa de `src/shared` y `src/data/legal`; nada de `src/server`; comprobado por AST y por mutacion); servicios tras interfaz (`AppServices`); dependencias nuevas pineadas exactas (react-router 7.18.4, jsdom 29.1.1, RTL 16.3.3, dom 10.4.2, user-event 14.6.8; el lockfile solo suma paquetes; `npm audit` 0); sin `console.*`, TODO/FIXME ni secretos en `src/web`
- C4: [x] un test por modulo; logica con fakes; lo real marcado `.int.test.ts`
- C5: [x] spec completo (EARS), R1..R87 con test, todas las tasks `[x]`

## Hallazgos por gravedad

### H1 — MEDIO-ALTO (bloqueante): el servidor de desarrollo de Vite sirve cualquier fichero del repo (incluida la BD SQLite con los hashes de PIN) a toda la LAN con `HOST=0.0.0.0`

Origen: `vite.config.ts` (de f0, sin bloque `server.fs`, líneas 26-31). Lo agrava f1b: `README.md:108` y el paso 11 de la checklist instruyen a poner `HOST=0.0.0.0` para probar desde el móvil, que es exactamente el modo de uso real de la mesa (7 jugadores en la misma wifi) hasta que f9 sirva producción. La BD por defecto vive en `./data/path-helper.sqlite` (`.env.example:23`), dentro de la raíz del workspace.

Reproducción (servidor Vite real en proceso, puerto 5391, cerrado al terminar; script `vitefs.mts` en el scratchpad):

    GET /@fs/C:/dev/personal/path-helper/feature-list.json               -> 200 (contenido)
    GET /@fs/C:/dev/personal/path-helper/node_modules/.package-lock.json -> 200
    GET /@fs/C:/dev/personal/path-helper/.env                            -> 403 Restricted (solo por el deny por defecto de Vite)
    GET /@fs/C:/Windows/win.ini                                          -> 403 Restricted

Y con una copia del repo en el scratchpad con un `data/path-helper.sqlite` falso (`vitefs2.mts`): `GET /@fs/<copia>/data/path-helper.sqlite` -> **200** con el contenido. El deny por defecto de Vite solo cubre `.env`, `.env.*`, `*.{crt,pem}` y `**/.git/**`. Un jugador conectado a la misma red podría descargar la BD (hashes scrypt de los PIN de todos, tabla de sesiones) y, si el `AUTH_PEPPER` es el marcador de `.env.example` (que el README declara válido en desarrollo), atacar offline PIN de 4-8 dígitos. Contradice la prioridad nº1 (privacidad entre jugadores). Es un defecto heredado de f0, pero f1b es quien documenta y empuja el modo LAN, y toca `vite.config.ts`.

Cambio requerido: restringir el sistema de ficheros del dev server en `createViteConfig`, p. ej. `server.fs: { allow: [src/web, src/shared, src/data/legal, node_modules], deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/*.sqlite*", "**/data/**"] }` (o solo ampliar `deny` si `allow` rompe el HMR), mantener `strictPort`, y añadir un test que lo verifique: mínimo una aserción sobre la configuración en `tests/project/vite-config.test.ts`; idealmente un `.int.test.ts` que levante `createServer` y exija 403/404 para `/@fs/.../data/x.sqlite` y `/@fs/.../package.json`. Documentar además en el README que con `HOST=0.0.0.0` debe usarse un `AUTH_PEPPER` propio; esto no sustituye al fix.

### H2 — BAJO (a11y): se pierde el foco al abrir/cerrar paneles inline en la fila de cuenta

`src/web/features/accounts/account-row.tsx`: al pulsar «Deshabilitar» el botón se desmonta y aparece el grupo de confirmación sin mover el foco (solo «Restablecer PIN» enfoca su campo, líneas 36-38); lo mismo al «Cancelar» (`closePanel`) y tras el éxito de restablecer/deshabilitar. El foco cae a `<body>` y los usuarios de teclado/lector de pantalla pierden la posición. Ningún R lo exige, no bloquea; conviene enfocar el primer botón de la confirmación y devolver el foco al botón de origen tras cancelar. Añadido a la checklist (paso 21).

### H3 — BAJO (sesión entre pestañas y hallazgo declarado `from`): evaluación

- **`from` tras logout voluntario: inocuo.** `RequireAuth` (`shell/guards.tsx:35`) guarda solo `pathname+search+hash`, nunca PIN ni datos. El siguiente usuario con otro rol aterriza en «Sin permiso» (`RequireRole` no renderiza la sección ni llama a la API; probado en R31). Lo único que revela es el último path visitado. Aceptado.
- **Datos en memoria tras logout: no persisten.** El estado `user` pasa a `anonymous` y `AccountsPage`/`AccountRow` (lista, mensajes, PIN en curso) se desmontan con `AppLayout`; no hay caché global (el cliente HTTP no cachea, el SW no cachea `/api`, `history.state` solo lleva `from`). Las respuestas de `/api` llevan `Cache-Control: no-store` (verificado en vivo).
- **Divergencia de rol entre pestañas (menor).** `session-context.tsx:94`: un mensaje `login` solo se atiende si la pestaña está `anonymous`. Si una pestaña autenticada como GM sigue abierta y en otra se inicia sesión como jugador (solo posible sin `BroadcastChannel` o con una carrera), la primera sigue mostrando la UI/lista del GM ya cargada, pero el servidor responde 403 a sus acciones (comprobado en vivo con la cookie nueva: `GET /api/accounts` -> 403). No hay filtración nueva (esos datos ya los vio ese navegador). Mejora propuesta: ante `login` con sesión activa, forzar `me` y volver a `anonymous` si cambia el `id`. Requeriría ampliar R22 (el test "R22: login recibido con sesión ya activa no consulta me" fija hoy lo contrario).
- **Observación de f1 (no de f1b):** `login` con una cookie válida presente emite una cookie nueva pero NO revoca la sesión de la cookie presentada (comprobado: la cookie del GM sigue válida tras iniciar sesión como Ana con ella adjunta). Sesiones huérfanas hasta su caducidad. Seguimiento de f1.

### H4 — BAJO / informativos

1. Nombres con caracteres de formato Unicode (RLO U+202E, zero-width U+200B) y HTML (`<img src=x onerror=alert(1)>`) se aceptan en el servidor (`nameSchema` solo rechaza controles C0/C1; probado: 201). En la UI se renderizan como nodos de texto de React (sin `innerHTML`; hygiene R72), así que no hay XSS, pero `Ana` y `Ana` + U+200B coexisten (`normalizeName` no elimina la categoría Cf) y un nombre con RLO puede confundir visualmente la lista. Solo lo crea el GM. Propuesta para f1: rechazar la categoría Unicode `Cf`. Nombre de 33 caracteres rechazado (400), 32 aceptado.
2. Gestores de contraseñas: el alta de cuenta del GM y el panel de restablecer usan `autocomplete="new-password"`, por lo que el navegador del GM puede ofrecer guardar el PIN de un jugador. Es estándar; si molesta, valorar `autocomplete="off"` en esos dos campos (R48 solo fija el login).
3. `document.title` incluye el nombre del usuario («Hola, X · Path Helper») y queda en el historial; dato de privacidad menor en dispositivos compartidos.
4. `AppErrorBoundary` usa `<main role="alert">` (anula la semántica del landmark `main`); preferible `<main>` con un `<div role="alert">` interior. No registra el error (por R86): documentar cómo se diagnosticará en producción.
5. Sin CSP ni cabeceras de seguridad para el HTML: corresponde a f9 (servir estáticos). Anotar allí `default-src` restringido al propio origen y `frame-ancestors` en `none`.
6. El comportamiento del SW de desarrollo (`devOptions.enabled: true`) frente a navegaciones a `/api` no se pudo verificar sin navegador (ya declarado); entra en el paso 23 de la checklist.
7. La Section 15 incluye CRB y PRD; cuando entre el Bestiario (f3b) habrá que añadir su entrada (la fuente de Paizo la lista).
8. Las secciones se cargan con `import.meta.glob` eager: todo va al chunk principal (376 kB). Aceptable ahora; considerar `lazy` al llegar ficha/compendio.

## Verificación de la lista de seguridad pedida

1. **PIN (nunca persistido ni logueado): CORRECTO.** `grep` en `src/web`: cero `console.*`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `URLSearchParams`, `history.*State`. El PIN solo vive en `useState` del formulario (login, cambio de PIN, alta, restablecer) y se vacía tras cada respuesta; viaja solo en el cuerpo JSON (`auth-api.ts`, `accounts-api.ts`), nunca en la URL (probado en vivo: `POST /api/auth/login?pin=...` ignora el query). `<form method="post">` sin `name` en los inputs: sin JS, un envío nativo no pondría el PIN en la URL. Campo PIN: `type=password`, `inputmode=numeric`, `pattern=[0-9]*`, `autocomplete=current-password` (login) / `new-password` (alta, cambio, restablecer), `autocapitalize=none`, `spellcheck=false`, mostrar/ocultar con `aria-pressed`. **Los tests R51/R86 son reales**: mutaciones en una copia del repo (scratchpad): (a) `window.localStorage.setItem` con el PIN en `login-page.tsx` -> falla R51; (b) `console.log(pin)` -> falla R86; (c) `history.replaceState` con el PIN tras el login -> falla R51. Sin mutación pasan.
2. **Sesión: CORRECTO.** Sin tokens en cliente: cookie `ph_session` `HttpOnly; SameSite=Strict; Path=/` (verificado en vivo), `credentials: "same-origin"`, ninguna cabecera `Authorization`; `userDtoSchema` descarta claves desconocidas y `toUser` copia solo id, name y role. 401 `unauthenticated` -> `anonymous` con aviso; 403 -> «Sin permiso»/mensaje `forbidden`. El `BroadcastChannel("ph-session")` solo transmite las cadenas `"login"`/`"logout"` (cualquier otro dato se descarta; el test R24 envía un objeto con nombre y PIN y no llega). Reutilizar la cookie tras logout da 401 (revocada en servidor, verificado). Resto en H3.
3. **Autorización: CORRECTA (servidor real, BD temporal, puerto efímero, GM creado con la CLI `runCreateGm`).** Un jugador (Ana) recibe **403 `forbidden`** en `GET/POST /api/accounts`, `PUT /api/accounts/:id/pin` (del GM y de otro jugador), `PATCH /api/accounts/:id` (propio y ajeno), `POST /api/accounts/:id/unlock`, y 403 también para un id inexistente (sin oráculo de existencia); variantes `?x=1`, `/%2e%2e/`, `HEAD`: 403; mayúsculas, doble barra, `DELETE`, `OPTIONS`: 404 sin datos. Sin cookie: 401 en todo. Orígenes `http://evil.com` y `null` en métodos mutantes: 403 `bad_origin`. `GET /api/auth/me` solo devuelve id, name y role. Las acciones del GM funcionan solo con sesión GM. Deshabilitar a un jugador revoca su sesión (401 inmediato) y su login devuelve el mismo cuerpo que un nombre desconocido (comparado byte a byte). Bloqueo: 5 fallos `invalid_credentials`, el 6.º 429 `locked` con `Retry-After: 900` (coincide con el paso 4 de la checklist). No existe ninguna ruta de cliente que muestre datos de otro usuario: la única lista (`/cuentas`) está tras `RequireRole` de GM y, aunque se saltara, el servidor devuelve 403.
4. **XSS/inyección: CORRECTO.** Cero `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`document.write`; los únicos `href` son `#contenido` (constante) y `to=` internos de `Link`; sin `target=_blank` ni enlaces externos; `safeRedirectTarget` rechaza `//`, esquemas, barra invertida y controles (y `Navigate` es `pushState` interno, no puede salir del origen). El texto legal se pinta con nodos `<p>`/`<li>`. Nombres con HTML/RTL/zero-width solo llegan a nodos de texto y a `aria-label` mediante React (escapado). Ver H4.1 para la suplantación visual.
5. **/legal: CORRECTO.** Pública (R29) y enlazada desde el pie de todas las pantallas. La OGL de `src/data/legal/ogl-1.0a.ts` está **contenida literalmente** (normalizando comillas y espacios) en `https://paizo.com/pathfinderRPG/prd/openGameLicense.html` descargada hoy (script `cmp-ogl.mjs`; incluye la errata original «potation»); la Section 15 contiene las 4 entradas correctas (WotC OGL, SRD, PRD, CRB; el listado completo de Paizo añade los Bestiarios, fuera de alcance, ver H4.7). **R73/R74 fallan de verdad con una modificación temporal** (copia en el scratchpad con `legal-page.tsx` importando `../../../data`): `hygiene/web-sources.test.ts` falla en «R73» con `importa de src/data fuera de src/data/legal`; `bundle.int.test.ts` falla en 2 tests (el JS contiene el texto de conjuros y pesa 3909 KiB frente al tope de 1024).
6. **Service worker/PWA: CORRECTO.** `dist/web/sw.js` tras el build: `precacheAndRoute` con 6 recursos estáticos (index.html, JS, CSS, icon, manifest, workbox-window) y una `NavigationRoute` hacia `index.html` con `denylist` de `^/api(/|$)` y `^/health$`. **Ningún `registerRoute` de runtime caching**: ni `/api` ni datos de sesión se cachean. Sin datasets en el precache (380 KiB).
7. **Enmiendas a f0: sin pérdida de cobertura.** `tests/web/app.test.tsx` reescrito con RTL: R44 (cabecera en login y en layout autenticado) y R43 (`HealthStatus` loading -> ok); `components/health-status.test.tsx` y `api/health.test.ts` (R41/R42/R43 de f0) intactos; `useHealth(check = () => fetchHealth())` es retrocompatible; `vite.config.ts` solo añade `workbox.navigateFallbackDenylist` y `tests/project/vite-config.test.ts` pasa sin cambios; `dev-server.int.test.ts` (R34-R39 de f0) sigue verde.
8. **Calidad: CORRECTO.** Sin literales en español en `src/web` fuera de `es.ts` (grep de acentos y signos de apertura solo da comentarios; hygiene R75 vía AST con autotest; los mensajes de `validateSections` son de desarrollador); a11y estática: labels asociados, `aria-invalid`/`aria-describedby`/`role=alert` (FormField), `role=status` para carga y avisos, landmarks y skip link, foco al `h1`, `aria-current`, `aria-pressed`, `aria-busy`, `lang="es"`, viewport sin bloqueo de zoom, contrastes calculados por el test con los hex de `tokens.css` (par por par, claro y oscuro), `min-height: var(--ph-tap-min)` (2,75 rem), inputs de al menos 1 rem. Capas: sin imports de `src/server` ni del barrel `src/data`. Higiene: sin `console`/TODO/secretos; `.env` ignorado por git (no se tocó).

## Evaluación de la checklist manual (`progress/manual_f1b-auth-ui.md`)

Es fiel a `design.md` §17, honesta (todos los pasos de navegador figuran como pendientes de humano; la columna "verificado por otros medios" es evidencia indirecta correcta y ahora confirmada por mis pruebas con servidor real) y ejecutable por un humano en unos 15 minutos. Faltan, y propongo añadir antes de cerrar (ordenados por valor):

16. **Inspección de privacidad del PIN (DevTools):** en Application comprobar que Local/Session Storage, IndexedDB y Cookies no contienen el PIN y que `ph_session` está marcada `HttpOnly` y `SameSite=Strict`; en Network, el login es un `POST /api/auth/login` con el PIN solo en el cuerpo y ningún PIN en la URL; Console vacía durante login, cambio de PIN y alta (también con errores).
17. **Cierre de sesión y "atrás":** tras cerrar sesión, pulsar Atrás varias veces y recargar: nunca se ve contenido autenticado (ni la lista de cuentas). Con dos usuarios de distinto rol en el mismo navegador (el GM cierra sesión desde `/cuentas` y entra un jugador): aterriza en «Sin permiso» y no hay ninguna petición a `/api/accounts` en Network.
18. **Acceso directo por URL y por API:** como jugador abrir `/cuentas` por URL: «Sin permiso» y ninguna petición a `/api/accounts`; con la cookie de jugador, `GET /api/accounts` devuelve 403.
19. **Nombres raros en Cuentas:** crear cuentas con `<b>x</b>`, un nombre de 32 caracteres, emoji y caracteres RTL o zero-width: se ven como texto literal y no rompen el ancho en móvil 360 px (sin scroll horizontal).
20. **Gestor de contraseñas y autorrelleno:** en Chrome y en un móvil real, comprobar que al iniciar sesión el navegador propone guardar/rellenar, que el teclado numérico aparece en todos los campos PIN y anotar si ofrece guardar la contraseña al crear cuenta o restablecer PIN (H4.2).
21. **Teclado en Cuentas (ampliación del paso 13):** recorrer solo con teclado Restablecer, Deshabilitar, Cancelar y Confirmar y anotar dónde queda el foco tras cada acción (H2).
22. **Acceso por IP de la LAN:** abrir la app por `http://IP:5173` SIN añadir ese origen a `AUTH_ALLOWED_ORIGINS`: el login muestra el mensaje de `bad_origin` y, tras añadirlo y reiniciar, funciona. Con `HOST=0.0.0.0`, comprobar desde otro dispositivo que `http://IP:5173/@fs/.../package.json` y la BD NO se descargan (cierra H1).
23. **PWA y caché (ampliación del paso 14):** con `vite preview` y la PWA instalada: en modo avión `/legal` abre y `/login` sin red muestra «No se pudo conectar con el servidor» (no una pantalla en blanco); tras un nuevo `npm run build` la app se actualiza sola (autoUpdate) sin quedarse con una versión antigua; en `npm run dev` (SW de desarrollo activo) navegar a `/api/auth/me` en la barra de direcciones devuelve el JSON 401 y no el HTML de la app.
24. **Tamaño de texto y orientación:** con el texto del sistema al 200 % y en horizontal, el login y la lista de cuentas siguen siendo usables.
25. **Cierre de sesión con la API caída:** parar la API y pulsar «Cerrar sesión» en Mi perfil: aparece «No se pudo cerrar la sesión» y la sesión sigue; al arrancar la API y reintentar funciona.
26. **Pestaña obsoleta:** abrir dos pestañas autenticadas, cerrar sesión en una, entrar en ella como otro usuario y comprobar el estado de la otra (H3).

## Cambios requeridos

1. **(H1, obligatorio)** Restringir `server.fs` del dev server en `vite.config.ts` para que no se sirvan `data/**`, `*.sqlite*` ni el resto del repo fuera de lo necesario, y añadir un test que lo verifique (ver H1). Actualizar el README (`README.md:108`) si cambia el procedimiento.
2. **(H2, recomendado)** Gestionar el foco en `account-row.tsx` al abrir y cerrar paneles inline.
3. **(H3, opcional)** Decidir si un `login` recibido por el canal con sesión activa debe forzar `me` (requeriría ampliar R22).

## Decisiones para el humano

- ¿Se corrige H1 en esta feature (recomendado: cambio mínimo en `vite.config.ts` y única razón del rechazo) o se abre una tarea aparte desaconsejando `HOST=0.0.0.0` mientras tanto?
- H3: ¿se endurece la sincronización entre pestañas (nuevo requisito) o se acepta el comportamiento actual?
- Seguimiento de f1: rechazar caracteres Unicode de formato en nombres de cuenta y/o revocar la sesión presentada al hacer `login` (H3 y H4.1).
- Tras corregir H1: ejecutar la checklist manual (pasos 1-15 más los añadidos 16-26) en un navegador real y en un móvil antes de marcar `done`.
