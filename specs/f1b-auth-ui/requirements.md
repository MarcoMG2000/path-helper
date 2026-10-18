# Requirements — f1b-auth-ui

> Feature: **Pantallas de login y gestión de cuentas** (`sdd: true`, depende de
> `f1-auth-roles`, ya `done`). Notación EARS (ver `docs/specs.md`). Cada `R<n>` es estable y
> verificable con al menos un test (columna _Test_; las rutas son relativas a `tests/web/`
> salvo que se indique otra cosa). Los puntos abiertos están en `design.md` §19 (Q1–Q16) con su
> recomendación por defecto; **este documento asume esas recomendaciones**.

## 1. Contexto y alcance

Es la **primera feature con interfaz real** y el **cimiento (app shell)** de f4 (ficha), f5
(combate), f8 (compendio), etc. Usuarios: 7 jugadores y 1 GM, desde móvil y web, en español.
La API de auth/cuentas ya existe (f1); esta feature solo consume `/api/auth/*` y
`/api/accounts/*` **sin cambios de backend** (`design.md` §2: `GET /api/auth/me` ya existe).

**Dentro de alcance** (`src/web`, más ajustes de herramientas):

- **App shell reutilizable:** enrutado, contexto de sesión, cliente HTTP único con manejo
  uniforme de errores, layout con navegación por rol, guardas de ruta, página 404/403,
  i18n en ficheros, accesibilidad básica, diseño mobile-first con tokens y modo oscuro.
- **Pantallas:** login, perfil (cambiar PIN y cerrar sesión), gestión de cuentas del GM,
  inicio, aviso legal `/legal` (cierra R40 y la pregunta Q6 de f3).
- Dependencias de enrutado y de test de componentes (`design.md` §4) y ajuste de la
  configuración PWA para no interceptar `/api` (R84).

**Fuera de alcance:** cambios en `src/server` o `src/shared`; pantalla de alta del primer GM
(sigue siendo `npm run create-gm`); recuperación de PIN por el propio jugador; mostrar el
estado de bloqueo de cada cuenta (la API no lo expone, Q2); servir `dist/web` desde el
servidor en producción (es de f9, Q11); SSE / tiempo real (f5); selector manual de tema
claro/oscuro; ficha, combate y compendio (cada feature añade su sección con el contrato de
`design.md` §8).

## 2. Glosario

- **Sesión (cliente):** estado `loading | anonymous | authenticated | error`; solo guarda
  `{ id, name, role }`. La cookie `ph_session` (httpOnly) la gestiona el navegador.
- **Cliente HTTP:** `createHttpClient`, el único código de `src/web` que llama a `fetch` sobre `/api`.
- **Sección:** unidad de navegación declarada por una feature (`AppSection`, `design.md` §8).
- **Shell:** layout, enrutado, guardas, contexto de sesión y cliente HTTP; no contiene
  conocimiento de ninguna feature concreta.
- **Espera de bloqueo:** `Retry-After` (segundos) de una respuesta 429 `locked`.

## 3. Requisitos

### 3.1 Cliente HTTP único

- **R1.** El sistema DEBE enviar todas las peticiones de `src/web` a `/api/*` exclusivamente a
  través de `createHttpClient`. _Test:_ `hygiene/web-sources.test.ts` (solo `api/http-client.ts` y
  `api/health.ts` contienen `fetch(`).
- **R2.** CUANDO una petición recibe una respuesta 2xx con cuerpo JSON que cumple el schema
  esperado, el cliente HTTP DEBE devolver `ok(valor)`; CUANDO recibe 204, `ok(undefined)`.
  _Test:_ `api/http-client.test.ts`.
- **R3.** SI una respuesta 2xx trae un cuerpo que no es JSON o no cumple el schema esperado,
  ENTONCES el cliente HTTP DEBE devolver `err` con `code: "unexpected"` y el `status` recibido.
  _Test:_ `api/http-client.test.ts`.
- **R4.** SI la respuesta es 4xx/5xx con un cuerpo `{ error: { code, message } }` de un código
  conocido de `ErrorCode`, ENTONCES el cliente HTTP DEBE devolver `err` con ese `code` y el
  `status`. _Test:_ `api/http-client.test.ts` (tabla con todos los `ErrorCode`).
- **R5.** SI la respuesta es 4xx/5xx sin un cuerpo de error válido o con un código desconocido,
  ENTONCES el cliente HTTP DEBE devolver `err` con `code: "unexpected"` y el `status`.
  _Test:_ `api/http-client.test.ts`.
- **R6.** SI `fetch` lanza una excepción, ENTONCES el cliente HTTP DEBE devolver `err` con
  `code: "network"` y `status: 0` sin propagar la excepción. _Test:_ `api/http-client.test.ts`.
- **R7.** SI la respuesta es 429 con cabecera `Retry-After` entera positiva, ENTONCES el error
  devuelto DEBE incluir `retryAfterSeconds` con ese valor; SI la cabecera falta o no es entera
  positiva, ENTONCES NO DEBE incluirlo. _Test:_ `api/http-client.test.ts`.
- **R8.** CUANDO la respuesta es 401 con código `unauthenticated`, el cliente HTTP DEBE invocar
  una vez el callback `onUnauthenticated`; SI es 401 con otro código (p. ej. `invalid_credentials`),
  ENTONCES NO DEBE invocarlo. _Test:_ `api/http-client.test.ts`.
- **R9.** CUANDO una petición lleva cuerpo, el cliente HTTP DEBE enviarlo como JSON con la cabecera
  `Content-Type: application/json`; CUANDO no lleva cuerpo, NO DEBE enviar `Content-Type` ni cuerpo.
  _Test:_ `api/http-client.test.ts` (inspecciona el `fetch` falso).
- **R10.** El cliente HTTP DEBE enviar `credentials: "same-origin"` y NO DEBE enviar ninguna cabecera
  `Authorization` ni leer tokens de ningún almacenamiento (la sesión es la cookie httpOnly).
  _Test:_ `api/http-client.test.ts`.

### 3.2 Módulos de API de dominio

- **R11.** El módulo `auth-api` DEBE invocar: `POST /api/auth/login` con `{name, pin}`;
  `GET /api/auth/me`; `POST /api/auth/logout`; `PUT /api/auth/pin` con `{currentPin, newPin}`.
  _Test:_ `api/auth-api.test.ts`.
- **R12.** El módulo `accounts-api` DEBE invocar: `GET /api/accounts`; `POST /api/accounts` con
  `{name, pin}`; `PUT /api/accounts/:id/pin` con `{pin}`; `PATCH /api/accounts/:id` con
  `{disabled}`; `POST /api/accounts/:id/unlock`; con el `id` codificado con `encodeURIComponent`.
  _Test:_ `api/accounts-api.test.ts`.

### 3.3 Sesión

- **R13.** CUANDO el `SessionProvider` se monta, el sistema DEBE consultar `GET /api/auth/me` una
  vez y exponer el estado `loading` (anunciado con `role="status"`) hasta recibir la respuesta.
  _Test:_ `session/session-context.test.tsx`.
- **R14.** CUANDO `me` responde 200, el sistema DEBE pasar al estado `authenticated` con el
  usuario `{ id, name, role }`. _Test:_ `session/session-context.test.tsx`.
- **R15.** CUANDO `me` responde 401 durante la carga inicial, el sistema DEBE pasar a `anonymous`
  sin mostrar aviso de sesión caducada. _Test:_ `session/session-context.test.tsx`.
- **R16.** SI `me` falla por red o con un estado 5xx, ENTONCES el sistema DEBE pasar a `error`
  (no a `anonymous`), mostrar un botón «Reintentar» y repetir la consulta al pulsarlo.
  _Test:_ `session/session-context.test.tsx`, `shell/routing.test.tsx`.
- **R17.** CUANDO `login` devuelve éxito, el sistema DEBE pasar a `authenticated` con el usuario
  de la respuesta. _Test:_ `session/session-context.test.tsx`.
- **R18.** CUANDO el cliente HTTP notifica una respuesta 401 `unauthenticated` MIENTRAS la sesión
  está `authenticated`, el sistema DEBE pasar a `anonymous` con el aviso `expired`.
  _Test:_ `session/session-context.test.tsx`.
- **R19.** CUANDO `logout` responde con éxito, el sistema DEBE pasar a `anonymous` y publicar el
  mensaje `logout` en el canal entre pestañas. _Test:_ `session/session-context.test.tsx`.
- **R20.** SI `logout` falla por red o con 5xx, ENTONCES el sistema DEBE mantener la sesión
  `authenticated` y mostrar un error («No se pudo cerrar la sesión»). _Test:_
  `session/session-context.test.tsx`, `features/profile/profile-page.test.tsx`.
- **R21.** CUANDO el canal entre pestañas recibe `logout` MIENTRAS la sesión está `authenticated`,
  el sistema DEBE pasar a `anonymous` con el aviso `signed-out-elsewhere` sin llamar al servidor.
  _Test:_ `session/session-context.test.tsx` (canal falso).
- **R22.** CUANDO el canal entre pestañas recibe `login` MIENTRAS la sesión está `anonymous`, el
  sistema DEBE volver a consultar `me`. _Test:_ `session/session-context.test.tsx`.
- **R23.** SI `BroadcastChannel` no está disponible, ENTONCES el sistema DEBE funcionar sin
  sincronización entre pestañas y sin lanzar. _Test:_ `session/session-channel.test.ts`.
- **R24.** El estado de sesión DEBE contener únicamente `id`, `name` y `role` del usuario y los
  avisos; NO DEBE contener el PIN ni ningún token. _Test:_ `session/session-context.test.tsx`
  (serializa el estado tras un login con un PIN centinela y no lo encuentra).

### 3.4 Enrutado, guardas y layout

- **R25.** MIENTRAS la sesión está `anonymous`, el sistema DEBE redirigir a `/login` cualquier
  ruta que no sea `/login` ni `/legal` (incluidas las rutas desconocidas), conservando el destino
  pedido en el estado de navegación (`from`). _Test:_ `shell/routing.test.tsx`.
- **R26.** MIENTRAS la sesión está `loading`, el sistema DEBE mostrar el indicador de carga en
  las rutas protegidas sin renderizar su contenido ni redirigir. _Test:_ `shell/routing.test.tsx`.
- **R27.** MIENTRAS la sesión está `authenticated`, el sistema DEBE redirigir `/login` al destino
  `from` si es válido, o a `/` si no hay destino. _Test:_ `shell/routing.test.tsx`.
- **R28.** SI el destino `from` no es una ruta interna (no empieza por `/` o empieza por `//`),
  ENTONCES el sistema DEBE ignorarlo y redirigir a `/`. _Test:_ `shell/routing.test.tsx`
  (tabla: `//evil.com`, `https://evil.com`, `javascript:...`, `""`, `/cuentas`).
- **R29.** El sistema DEBE mostrar `/legal` en cualquier estado de sesión (`loading`,
  `anonymous`, `authenticated`, `error`) sin redirigir. _Test:_ `shell/routing.test.tsx`.
- **R30.** MIENTRAS la sesión está `authenticated`, el sistema DEBE mostrar la página 404 dentro
  del layout, con un enlace a `/`, para cualquier ruta desconocida. _Test:_ `shell/routing.test.tsx`,
  `features/errors/error-pages.test.tsx`.
- **R31.** SI el rol del usuario no está en `roles` de la sección de la ruta, ENTONCES el sistema
  DEBE mostrar la página «Sin permiso» y NO DEBE renderizar el contenido de la sección.
  _Test:_ `shell/routing.test.tsx` (jugador en `/cuentas`).
- **R32.** El sistema DEBE listar en la navegación solo las secciones cuyo `roles` incluye el rol
  del usuario, ordenadas por `order`, precedidas del enlace a «Inicio» y marcando la ruta actual
  con `aria-current="page"`. _Test:_ `shell/nav.test.tsx`.
- **R33.** CUANDO se pasa al shell una sección adicional, el sistema DEBE crear su ruta (con guarda
  de sesión y de rol) y su entrada de navegación sin modificar ningún fichero del shell. _Test:_
  `shell/routing.test.tsx` y `shell/nav.test.tsx` (sección ficticia inyectada; subrutas `children`
  incluidas).
- **R34.** El sistema DEBE descubrir las secciones declaradas en `src/web/features/*/section.tsx`
  (incluidas `profile` y `accounts`). _Test:_ `shell/sections.test.ts` (`loadSections()`).
- **R35.** SI dos secciones comparten `id` o `path`, o una usa una ruta reservada (`/`, `/login`,
  `/legal`, `/api`, `/health` o subrutas), ENTONCES `validateSections` DEBE lanzar un error que
  nombra el `id` ofensor. _Test:_ `shell/sections.test.ts`.
- **R36.** El layout DEBE ofrecer un enlace «Saltar al contenido» como primer elemento enfocable
  y los landmarks `header`, `nav` (con `aria-label`), `main` (destino del enlace) y `footer`.
  _Test:_ `shell/app-layout.test.tsx`.
- **R37.** CUANDO cambia la ruta, el sistema DEBE actualizar `document.title` con el título de la
  página y mover el foco al `h1` de la nueva página. _Test:_ `shell/page.test.tsx`.
- **R38.** El sistema DEBE mostrar en el pie de todas las pantallas (login, legal, layout de la
  app y páginas de error) un enlace a `/legal`. _Test:_ `shell/app-layout.test.tsx`,
  `shell/public-layout.test.tsx`.
- **R39.** SI un componente lanza una excepción durante el renderizado, ENTONCES el sistema DEBE
  mostrar una pantalla de error con un botón «Recargar» en lugar de una página en blanco.
  _Test:_ `shell/error-boundary.test.tsx`.
- **R40.** MIENTRAS la sesión está `authenticated`, la ruta `/` DEBE mostrar el nombre del usuario,
  un acceso a cada sección visible para su rol y el indicador de estado de la API (`HealthStatus`).
  _Test:_ `features/home/home-page.test.tsx`.

### 3.5 Pantalla de login

- **R41.** El sistema DEBE mostrar en `/login` un formulario con un campo «Nombre» y un campo
  «PIN», cada uno con su `<label>` asociado, y un botón de envío. _Test:_
  `features/login/login-page.test.tsx`.
- **R42.** SI el usuario envía el formulario con el nombre o el PIN vacíos, ENTONCES el sistema
  DEBE mostrar un error junto al campo vacío y NO DEBE llamar a la API. _Test:_
  `features/login/login-page.test.tsx`.
- **R43.** CUANDO el usuario envía nombre y PIN no vacíos, el sistema DEBE llamar a `login` una
  sola vez con esos valores y, mientras la petición está en curso, deshabilitar el botón de envío
  y marcar el formulario con `aria-busy="true"`. _Test:_ `features/login/login-page.test.tsx`
  (doble envío → una llamada).
- **R44.** SI `login` devuelve `invalid_credentials`, ENTONCES el sistema DEBE mostrar el mensaje
  genérico «Nombre o PIN incorrectos» (el mismo para nombre desconocido, PIN erróneo y cuenta
  deshabilitada) en un `role="alert"`, conservar el nombre, vaciar el PIN y devolver el foco al
  campo PIN. _Test:_ `features/login/login-page.test.tsx`.
- **R45.** SI `login` devuelve `locked`, ENTONCES el sistema DEBE mostrar un mensaje de bloqueo
  temporal con la espera calculada a partir de `retryAfterSeconds` y vaciar el PIN.
  _Test:_ `features/login/login-page.test.tsx`.
- **R46.** El sistema DEBE formatear la espera de bloqueo así: segundos → minutos redondeando
  hacia arriba con mínimo 1 («1 minuto», «15 minutos»); desde 60 minutos, horas y minutos
  restantes («1 hora», «2 horas y 5 minutos»); sin `retryAfterSeconds`, un texto genérico
  («unos minutos»). _Test:_ `i18n/format.test.ts` (tabla: 1 s, 59 s, 60 s, 61 s, 900 s, 3 600 s,
  7 500 s, 86 400 s, `undefined`).
- **R47.** SI `login` devuelve `network`, `unexpected`, `validation_error` o `bad_origin`,
  ENTONCES el sistema DEBE mostrar el mensaje propio de ese código (`es.errors`) en un
  `role="alert"` y conservar el nombre. _Test:_ `features/login/login-page.test.tsx`.
- **R48.** El formulario de login DEBE usar: `method="post"`, campo nombre con
  `autocomplete="username"`, `autocapitalize="none"` y `spellcheck="false"`; campo PIN con
  `type="password"`, `inputmode="numeric"` y `autocomplete="current-password"`. _Test:_
  `features/login/login-page.test.tsx`.
- **R49.** El componente de campo PIN DEBE ofrecer un control (`button` con `aria-pressed`) para
  mostrar u ocultar el PIN, oculto por defecto, que alterna el `type` entre `password` y `text`
  conservando el valor. _Test:_ `components/pin-field.test.tsx`.
- **R50.** CUANDO la sesión pasa a `anonymous` con el aviso `expired` o `signed-out-elsewhere`,
  `/login` DEBE mostrar el aviso correspondiente en un `role="status"`, y DEBE retirarlo al enviar
  el formulario. _Test:_ `features/login/login-page.test.tsx`.
- **R51.** El sistema NO DEBE guardar el PIN en `localStorage`, `sessionStorage`, cookies del
  documento, URL, estado de navegación ni atributos del DOM tras un login correcto y tras uno
  fallido. _Test:_ `features/login/login-page.test.tsx` (PIN centinela; inspecciona almacenamiento
  de jsdom, `location`, `history.state` y el HTML serializado, salvo el `value` del propio campo).

### 3.6 Perfil: cambiar PIN y cerrar sesión

- **R52.** MIENTRAS la sesión está `authenticated`, `/perfil` DEBE mostrar el nombre del usuario y
  su rol traducido («Jugador» / «GM»). _Test:_ `features/profile/profile-page.test.tsx`.
- **R53.** SI el formulario de cambio de PIN se envía con el PIN actual vacío, un PIN nuevo que no
  cumple `^\d{4,8}$` o una repetición distinta del PIN nuevo, ENTONCES el sistema DEBE mostrar el
  error junto al campo afectado y NO DEBE llamar a la API. _Test:_
  `features/profile/profile-page.test.tsx`.
- **R54.** CUANDO `changePin` devuelve éxito, el sistema DEBE mostrar un mensaje de confirmación
  que indica que se cerraron las demás sesiones, vaciar los tres campos y mantener la sesión
  actual `authenticated`. _Test:_ `features/profile/profile-page.test.tsx`.
- **R55.** SI `changePin` devuelve `invalid_current_pin`, ENTONCES el sistema DEBE mostrar el error
  en el campo del PIN actual, vaciar los tres campos y mantener la sesión. _Test:_
  `features/profile/profile-page.test.tsx`.
- **R56.** SI `changePin` devuelve `locked`, ENTONCES el sistema DEBE mostrar el mensaje de
  bloqueo con la espera formateada (R46) y vaciar los tres campos. _Test:_
  `features/profile/profile-page.test.tsx`.
- **R57.** CUANDO el usuario pulsa «Cerrar sesión» en `/perfil`, el sistema DEBE llamar a `logout`
  y, si tiene éxito, mostrar `/login`. _Test:_ `features/profile/profile-page.test.tsx`.

### 3.7 Gestión de cuentas (solo GM)

- **R58.** MIENTRAS el usuario es GM, `/cuentas` DEBE cargar `GET /api/accounts` y mostrar una fila
  por cuenta con nombre, rol y estado («Activa» / «Deshabilitada»), con un indicador de carga
  durante la petición. _Test:_ `features/accounts/accounts-page.test.tsx`.
- **R59.** SI la carga de cuentas falla, ENTONCES el sistema DEBE mostrar el mensaje del código de
  error y un botón «Reintentar» que repite la carga. _Test:_ `features/accounts/accounts-page.test.tsx`.
- **R60.** CUANDO el GM envía el formulario de alta con un nombre y un PIN válidos, el sistema DEBE
  llamar a `create`, añadir la cuenta devuelta a la lista, mostrar una confirmación y vaciar el
  formulario. _Test:_ `features/accounts/accounts-page.test.tsx`.
- **R61.** SI el nombre no cumple `nameSchema` (1–32 caracteres tras recortar, sin caracteres de
  control) o el PIN no cumple `pinSchema`, ENTONCES el sistema DEBE mostrar el error junto al campo
  y NO DEBE llamar a la API. _Test:_ `features/accounts/accounts-page.test.tsx`.
- **R62.** SI `create` devuelve `name_taken`, ENTONCES el sistema DEBE mostrar el error en el campo
  nombre y conservar los valores del formulario salvo el PIN. _Test:_
  `features/accounts/accounts-page.test.tsx`.
- **R63.** CUANDO el GM abre «Restablecer PIN» en la fila de un jugador, introduce un PIN válido y
  confirma, el sistema DEBE llamar a `resetPin` con el id de esa cuenta y mostrar la confirmación
  en la fila (que indica que se cerraron sus sesiones y se quitó su bloqueo); CUANDO cancela, DEBE
  cerrar el panel sin llamar a la API. _Test:_ `features/accounts/accounts-page.test.tsx`.
- **R64.** CUANDO el GM pulsa «Deshabilitar» en la fila de un jugador habilitado, el sistema DEBE
  pedir confirmación en la propia fila y, solo al confirmar, llamar a `setDisabled(id, true)` y
  actualizar la fila a «Deshabilitada» con la acción «Habilitar». _Test:_
  `features/accounts/accounts-page.test.tsx`.
- **R65.** CUANDO el GM pulsa «Habilitar» en la fila de un jugador deshabilitado, el sistema DEBE
  llamar a `setDisabled(id, false)` y actualizar la fila a «Activa». _Test:_
  `features/accounts/accounts-page.test.tsx`.
- **R66.** CUANDO el GM pulsa «Desbloquear» en la fila de un jugador, el sistema DEBE llamar a
  `unlock` con el id de esa cuenta y mostrar la confirmación en la fila; la acción DEBE estar
  disponible en todas las filas de jugadores, estén o no bloqueadas. _Test:_
  `features/accounts/accounts-page.test.tsx`.
- **R67.** La fila de una cuenta con rol `gm` NO DEBE ofrecer acciones de restablecer, deshabilitar
  ni desbloquear, y DEBE indicar que su PIN se cambia desde «Mi perfil». _Test:_
  `features/accounts/accounts-page.test.tsx`.
- **R68.** SI una acción de fila devuelve `not_found`, ENTONCES el sistema DEBE mostrar el error en
  la fila y recargar la lista. _Test:_ `features/accounts/accounts-page.test.tsx`.
- **R69.** SI una acción de fila devuelve cualquier otro error (`network`, `forbidden`,
  `unexpected`, `validation_error`...), ENTONCES el sistema DEBE mostrar el mensaje de ese código
  en un `role="alert"` de la fila sin alterar el estado mostrado de la cuenta. _Test:_
  `features/accounts/accounts-page.test.tsx`.
- **R70.** MIENTRAS una acción de una fila está en curso, el sistema DEBE deshabilitar los botones
  de esa fila. _Test:_ `features/accounts/accounts-page.test.tsx`.

### 3.8 Aviso legal (`/legal`, cierra R40 de f3)

- **R71.** El sistema DEBE mostrar en `/legal` el aviso de proyecto no oficial, todas las entradas
  de la Section 15 y el texto íntegro de la OGL 1.0a, idénticos al resultado de `getLegalNotice()`.
  _Test:_ `features/legal/legal-page.test.tsx` (compara el texto renderizado, párrafo a párrafo,
  con `getLegalNotice()`).
- **R72.** El sistema DEBE renderizar el texto legal como nodos de texto de React, sin
  `dangerouslySetInnerHTML`. _Test:_ `hygiene/web-sources.test.ts`.
- **R73.** El código de `src/web` NO DEBE importar nada de `src/data` salvo `src/data/legal`
  (nunca el barrel `src/data/index.ts` ni los módulos de categorías). _Test:_
  `hygiene/web-sources.test.ts`.
- **R74.** DONDE se ejecute la suite de integración, el bundle de producción NO DEBE contener
  texto de los datasets de f3 (conjuros, dotes, objetos). _Test:_ `bundle.int.test.ts`.

### 3.9 i18n, accesibilidad y diseño

- **R75.** El sistema NO DEBE contener texto visible ni atributos accesibles (`aria-label`,
  `title`, `placeholder`, `alt`) literales en los componentes de `src/web`; todo sale de
  `src/web/i18n/es.ts`. _Test:_ `hygiene/web-sources.test.ts` (heurística sobre `*.tsx`).
- **R76.** El sistema DEBE tener un mensaje en español no vacío en `es.errors` para cada
  `ErrorCode` de `src/shared`, más `network` y `unexpected`. _Test:_ `i18n/es.test.ts`.
- **R77.** CUANDO un campo tiene un error de validación, el sistema DEBE marcar el campo con
  `aria-invalid="true"`, asociarlo al mensaje con `aria-describedby` y exponer el mensaje en un
  `role="alert"`. _Test:_ `components/form-field.test.tsx`.
- **R78.** El sistema DEBE definir en `src/web/styles/tokens.css` tokens (variables CSS `--ph-*`)
  para color, espaciado, radio, tipografía y tamaño mínimo táctil, y los componentes DEBEN usar
  esos tokens en lugar de colores hexadecimales literales. _Test:_ `styles/tokens.test.ts`.
- **R79.** DONDE el navegador prefiera el esquema oscuro (`prefers-color-scheme: dark`), el
  sistema DEBE redefinir todos los tokens de color de `tokens.css` para el modo oscuro y declarar
  `color-scheme: light dark`. _Test:_ `styles/tokens.test.ts`.
- **R80.** El sistema DEBE cumplir una relación de contraste mínima de 4,5:1 en los pares
  texto/fondo definidos en `design.md` §11.2, tanto en modo claro como en oscuro. _Test:_
  `styles/tokens.test.ts` (calcula la relación WCAG con los hex de `tokens.css`).
- **R81.** El sistema DEBE escribir las hojas de estilo mobile-first: las media queries de ancho
  usan solo `min-width`. _Test:_ `styles/tokens.test.ts` (ninguna `max-width` en `src/web/styles`).
- **R82.** Los botones y campos de formulario DEBEN tener `min-height: var(--ph-tap-min)` con
  `--ph-tap-min` ≥ 44 px. _Test:_ `styles/tokens.test.ts`.
- **R83.** Los campos de formulario DEBEN usar un `font-size` de al menos 1rem (16 px) para que
  los navegadores móviles no amplíen la página al enfocarlos. _Test:_ `styles/tokens.test.ts`.

### 3.10 PWA y seguridad transversal en el cliente

- **R84.** El sistema NO DEBE hacer que el service worker sirva `index.html` para navegaciones a
  `/api/*` ni a `/health` (`navigateFallbackDenylist`). _Test:_ `tests/project/pwa-options.test.ts`
  (regex exportadas; ruta desde la raíz de `tests/`) y verificación manual (checklist, paso 14).
- **R85.** El código de `src/web` NO DEBE usar `localStorage`, `sessionStorage`, `indexedDB` ni
  `document.cookie`. _Test:_ `hygiene/web-sources.test.ts`.
- **R86.** El sistema NO DEBE escribir en la consola durante los flujos de login, cambio de PIN y
  gestión de cuentas, ni siquiera ante errores. _Test:_ los tests de `login-page`, `profile-page`
  y `accounts-page` espían `console.*` y exigen cero llamadas.

### 3.11 Contrato con el servidor real

- **R87.** DONDE se ejecute la suite de integración, el cliente HTTP y los módulos de API DEBEN
  interoperar con el servidor real (`composeApp` con almacenes en memoria): login, `me`, cambio
  de PIN, logout, 401 tras el logout, 429 con `retryAfterSeconds`, y alta, restablecimiento de PIN,
  deshabilitación y desbloqueo de cuentas por el GM. _Test:_ `auth-ui.int.test.ts`.

### 3.12 Correcciones de la revisión (2026-10-18)

Añadidos sin renumerar los anteriores. Origen: `progress/review_f1b-auth-ui.md` (H1, H2, H4);
detalle en `progress/impl_f1b-fixes.md`.

- **R88.** El servidor de desarrollo NO DEBE servir (ni por `/@fs/<ruta absoluta>`, ni por rutas
  relativas con `..` o `%2e%2e`, ni con sufijos `?raw`/`?import&raw`/`?url`) ficheros del repo
  fuera de lo que la app necesita: `server.fs` DEBE ser `strict`, con `allow` limitado a
  `src/web`, `src/shared` y `src/data/legal`, y `deny` explícito para `.env*`, `*.sqlite*`, `*.db`,
  `data/`, `.git/`, `specs/`, `progress/`, `.cache/`, `reports/`, `feature-list.json` y
  `package*.json`; y NO DEBE usar `allowedHosts: true`. Una BD SQLite, `feature-list.json`,
  `package.json`, `.env` o un fichero de `specs/` DEBEN dar 403/404 (o el `index.html` de la SPA,
  nunca su contenido); `vite preview` tampoco los sirve; y la app (index, `/main.tsx`, todo su
  grafo de módulos, `/@vite/client`, `/legal`) DEBE seguir funcionando. _Test:_
  `tests/project/vite-config.test.ts` (configuración) y `tests/web/vite-fs.int.test.ts`
  (servidor Vite real en una copia temporal de la raíz con señuelos, y en la raíz real).
- **R89.** El proxy de desarrollo de `/api` NO DEBE interceptar los módulos fuente del cliente que
  Vite sirve en `/api/*.ts(x)` (`src/web/api/`): una URL `/api/<ruta>.<ext de código>` la sirve Vite;
  las rutas reales de la API (sin extensión de fichero) y `/health` siguen yendo a la API. _Test:_
  `tests/project/vite-config.test.ts`, `tests/web/vite-fs.int.test.ts`.
- **R90.** MIENTRAS el GM usa los paneles inline de una fila de cuenta, el sistema DEBE gestionar el
  foco: al abrir «Restablecer PIN» al campo de PIN y al abrir «Deshabilitar» al primer botón de la
  confirmación; al cancelar o terminar con éxito, al botón que abrió el panel (o al que lo
  sustituye: «Habilitar» tras deshabilitar); tras un error o un PIN inválido, al campo o botón
  de la acción fallida; y tras «Desbloquear» a ese mismo botón. _Test:_
  `features/accounts/accounts-page.test.tsx`.
- **R91.** El `document.title` NO DEBE contener datos personales (el nombre del usuario queda en
  el historial del navegador): la pantalla de inicio usa «Inicio · Path Helper» (el `h1` sigue
  saludando por el nombre); y la pantalla de error de `AppErrorBoundary` fija su propio título.
  _Test:_ `shell/page.test.tsx`, `shell/error-boundary.test.tsx`.
- **R92.** La pantalla de error de `AppErrorBoundary` NO DEBE anular la semántica del landmark
  `main` con `role="alert"`: el `main` contiene un contenedor `role="alert"`. _Test:_
  `shell/error-boundary.test.tsx`.

## 4. Cobertura de los criterios de aceptación originales

| Criterio de `acceptance` (feature-list.json) | Requisitos |
|----------------------------------------------|------------|
| UI mobile-first en español | R75–R83 (+ checklist manual) |
| Pantalla de login (nombre + PIN) con mensajes de error | R41–R44, R47–R48, R51 |
| …y de bloqueo temporal | R7, R45, R46 |
| El jugador puede cambiar su PIN | R53–R56 |
| …y cerrar sesión | R19, R20, R21, R57 |
| El GM puede crear cuentas | R58–R62 |
| …desactivar (y reactivar) cuentas | R64, R65 |
| …y restablecer el PIN | R63 |
| …(y desbloquear cuentas, la API lo ofrece) | R66 |
| Las rutas de la app redirigen a login si no hay sesión | R13–R15, R25–R28 |
| (Decisión del leader) app shell reutilizable | R1–R12, R30–R40 |
| (Decisión del leader) pantalla `/legal`, cierra R40 de f3 | R29, R38, R71–R74 |
| (Decisión del leader) seguridad en cliente | R8, R10, R24, R51, R84–R86 |
| (Decisión del leader) estrategia de tests | R87 + `design.md` §16 |
| (Revisión 2026-10-18) servidor de desarrollo, foco, título y landmarks | R88–R92 |
