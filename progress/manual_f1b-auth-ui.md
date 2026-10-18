# Checklist manual — f1b-auth-ui (design.md §17)

Rellenada por el implementer (sin navegador). **Pendiente de humano** = requiere navegador real.
«Verificado por otros medios» indica lo que sí se pudo comprobar sin navegador y cómo; no sustituye
la comprobación visual/táctil.

Prerrequisitos: `.env` con `AUTH_PEPPER` propio y `AUTH_COOKIE_SECURE=false`; `npm run create-gm -- "GM"`;
`npm run dev`. Abre siempre `http://localhost:5173` (o `127.0.0.1`).

| # | Paso | Estado | Verificado por otros medios |
|---|------|--------|-----------------------------|
| 1 | Redirección sin sesión (`/`, `/cuentas`, `/perfil`, `/no-existe` -> `/login`; pie con «Aviso legal») | Pendiente de humano (navegador) | `tests/web/shell/routing.test.tsx` (R25, tabla de rutas) y `public-layout.test.tsx` (R38) en jsdom. Con `vite` en marcha, `curl` a `/legal` y `/perfil` devuelve el `index.html` (200) |
| 2 | Aviso legal público (`/legal` sin sesión: aviso no oficial, Section 15, OGL desplegable, «Volver») | Pendiente de humano (navegador) | `legal-page.test.tsx` (R71) compara el texto con `getLegalNotice()`; `routing.test.tsx` (R29); el bundle contiene la OGL (`bundle.int.test.ts`, R74) |
| 3 | Credenciales erróneas (mensaje genérico, PIN vacío, nombre conservado, foco al PIN) | Pendiente de humano (navegador) | `login-page.test.tsx` (R44) con `document.activeElement`; API real con `curl` y la API de integración (`auth-ui.int.test.ts`) |
| 4 | Bloqueo temporal (6.º intento con nombre inventado -> «15 minutos»; el 5.º aún «incorrectos») | Pendiente de humano (navegador) | `auth-ui.int.test.ts` (R87): 5 fallos `invalid_credentials` y el 6.º `429 locked` con `retryAfterSeconds` = 900; texto en `login-page.test.tsx` (R45) |
| 5 | Login del GM y navegación (Inicio/Cuentas/Mi perfil, `aria-current`, recargar mantiene sesión) | Pendiente de humano (navegador) | `nav.test.tsx` (R32); contra el stack real (`tsx src/server/main.ts` + `vite` con proxy, temp DB): `create-gm`, `POST /api/auth/login` desde `Origin` permitido -> 200 + cookie, `GET /api/auth/me` con cookie -> 200 (sesión persistente) |
| 6 | Alta de cuentas (Marta/1234 Activa; nombre repetido en mayúsculas -> error; PIN de 3 dígitos -> error sin enviar) | Pendiente de humano (navegador) | `accounts-page.test.tsx` (R60-R62); `curl` real: `POST /api/accounts` 201 y `GET /api/accounts` lista GM + Marta; `auth-ui.int.test.ts` (`name_taken` con `pedro` vs `Pedro`) |
| 7 | Rol jugador (sin «Cuentas» en la nav; `/cuentas` -> «Sin permiso») | Pendiente de humano (navegador, ventana privada) | `nav.test.tsx`, `routing.test.tsx` (R31) |
| 8 | Cambiar PIN (actual erróneo -> error; correcto -> confirmación; reentrar con el PIN nuevo) | Pendiente de humano (navegador) | `profile-page.test.tsx` (R53-R56); `auth-ui.int.test.ts` (cambio de PIN real y relogin) |
| 9 | Acciones del GM (restablecer PIN con Marta logueada -> su siguiente acción vuelve a `/login` con aviso de sesión caducada; deshabilitar/habilitar; desbloquear; fila del GM sin botones) | Pendiente de humano (navegador, dos ventanas) | `accounts-page.test.tsx` (R63-R70), `routing.test.tsx` (401 -> `/login` con aviso), `auth-ui.int.test.ts` (reset revoca la sesión de Pedro; deshabilitar -> `invalid_credentials`) |
| 10 | Dos pestañas (cerrar sesión en una -> la otra va a `/login` sin recargar, con aviso) | Pendiente de humano (navegador, `BroadcastChannel` real entre pestañas) | `session-channel.test.ts` (dos instancias reales de `BroadcastChannel` en Node, R21-R23) y `session-context.test.tsx` (canal falso) |
| 11 | Móvil 360x640 / teléfono real (teclado numérico, sin zoom al enfocar, sin scroll horizontal, barra inferior sin tapar contenido ni notch, botones cómodos) | Pendiente de humano (DevTools / teléfono; no verificable sin navegador) | Solo atributos y CSS: `inputmode="numeric"`/`pattern`, `font-size >= 1rem` en inputs y `min-height: var(--ph-tap-min)` (`login-page.test.tsx`, `tokens.test.ts`, R48/R82/R83). Para el teléfono: `HOST=0.0.0.0` y añadir `http://<ip>:5173` a `AUTH_ALLOWED_ORIGINS` |
| 12 | Modo oscuro (texto legible, bordes/avisos distinguibles, foco visible) | Pendiente de humano (navegador) | `tokens.test.ts` (R79/R80): bloque `prefers-color-scheme: dark` con los mismos tokens y contraste >= 4,5:1 en claro y oscuro para los 11 pares |
| 13 | Teclado y accesibilidad (Tab -> «Saltar al contenido», orden lógico, foco visible, foco al h1 al cambiar de página; lector de pantalla anuncia errores) | Pendiente de humano (navegador + NVDA/VoiceOver) | `app-layout.test.tsx` (R36, el primer Tab enfoca el enlace de salto), `page.test.tsx` (R37, foco al `h1`), `form-field.test.tsx` (R77, `role="alert"`/`aria-describedby`) |
| 14 | PWA y API (`npm run build` + `npx vite preview`: `/api/auth/me` en la barra de direcciones NO devuelve el HTML de la app; instalar la PWA y abrir `/legal` sin red) | Pendiente de humano (navegador; el service worker y la instalación no se pueden probar sin él) | `npm run build` OK; `vite preview` (puerto 4179, proceso de vida corta): `/legal` y `/cuentas` -> `index.html` 200, `/api/auth/me` y `/health` -> proxy (502 sin API, no HTML), `sw.js` servido; `pwa-options.test.ts` y `bundle.int.test.ts` (R84) comprueban que el `sw.js` generado contiene `denylist` con `^\/api(\/|$)` y `^\/health$` |
| 15 | Apariencia general (coherencia visual, espaciado, legibilidad en móvil y escritorio; ajustes de estilo) | Pendiente de humano (valoración visual) | Ninguno posible sin navegador |

## Notas para el humano

- Ningún paso de navegador real se ha ejecutado. Todo lo de la columna «Verificado por otros medios» es
  evidencia indirecta (jsdom, integración con servidor real y `curl`), no sustituye a los 15 pasos.
- Anota aquí fallos o ajustes de estilo al revisar (sección libre):

  (pendiente)
