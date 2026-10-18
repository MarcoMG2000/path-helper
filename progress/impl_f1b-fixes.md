# Correcciones de la revisión de f1b-auth-ui

Origen: `progress/review_f1b-auth-ui.md` (H1-H4). Estado: **implementado, pendiente de nueva revisión**. No se ha
marcado `done`, no se ha tocado `feature-list.json`, no hay commits, no se ejecutó `npm ci` ni `./init.sh`.
`node_modules` intacto (406 entradas; no hizo falta `rm -rf node_modules && npm ci`). Sin dependencias nuevas.
Ningún proceso en segundo plano; los servidores Vite de las pruebas usan puerto efímero, `cacheDir` temporal propio
(se borra al terminar) y se cierran en `afterAll`.

## Verificación (Node v24.20.0, Windows 11 + Git Bash)

| Comando | Resultado |
|---|---|
| `npx vitest run` | **155 ficheros / 2270 tests en verde** (antes 2242) |
| `npm run test:int` | **10 ficheros / 84 tests en verde** (antes 9 / 58; nuevo `tests/web/vite-fs.int.test.ts`, 26 tests) |
| `npm run typecheck`, `npm run lint` | sin errores |
| `npm run build` | OK (JS 377,10 kB, 116,96 kB gzip; PWA precache 6 entradas) |
| `prettier --check` | mis ficheros OK (los avisos son JSON de datos de f3, preexistentes) |

## H1 (bloqueante): `/@fs/` sirve cualquier fichero del repo

**Qué estaba mal.** `vite.config.ts` no tenía `server.fs`: con `HOST=0.0.0.0` Vite servía por `/@fs/<ruta>` cualquier
fichero del workspace salvo `.env*`, `*.crt/pem` y `.git` (BD SQLite con hashes de PIN, `feature-list.json`,
`package.json`, `specs/`...). Reproducido por el reviewer y por mí (sin `fs` fallan 17 de los tests nuevos).

**Corrección** (`vite.config.ts`, nueva función exportada `createFsOptions(root)` usada por `createViteConfig`):

- `server.fs.strict: true`.
- `allow` (lista blanca, reemplaza el workspace-root por defecto): `src/web`, `src/shared`, `src/data/legal`. Es todo
  lo que importa `src/web` fuera de sí mismo (comprobado con grep y con un crawler del grafo de módulos). **No** se
  permite `node_modules/` entero: las dependencias se sirven pre-empaquetadas desde la caché de Vite y el cliente de
  Vite (`/@vite/client`) lo añade Vite solo (`CLIENT_DIR`); la app funciona igual (ver test del grafo).
- `deny` (gana siempre a `allow`; al fijarlo Vite descarta su deny por defecto, así que se repiten sus cuatro
  patrones): `.env`, `.env.*`, `*.{crt,pem}`, `**/.git/**`, `*.sqlite*`, `*.db`, `*.db-*` (cualquier carpeta) y, con la
  ruta absoluta de la raíz (escapada de caracteres glob), `data/**`, `.git/**`, `specs/**`, `progress/**`, `.cache/**`,
  `reports/**`, `.env*`, `feature-list.json`, `package.json`, `package-lock.json`. No se usa `**/data/**` porque
  bloquearía `src/data/legal`.
- `createViteConfig(config, root = repoRoot)` admite una raíz alternativa (solo para probar con una copia temporal).
- `server.host`/`allowedHosts`: **sin cambio**. El valor por defecto de Vite ya rechaza cabeceras `Host` con nombres
  DNS desconocidos (anti DNS-rebinding) y admite IPs, que es lo que usa el flujo móvil (`http://<ip>:5173`); poner
  `allowedHosts` restrictivo rompería otros nombres sin ganar nada. El test exige que NO sea `true`.
- README: nota junto a `HOST=0.0.0.0` (usar `AUTH_PEPPER` propio, solo red de confianza, qué sirve ahora Vite).

**Tests (R88 en `specs/f1b-auth-ui/requirements.md`):**
- `tests/project/vite-config.test.ts`: `server.fs` estricto, `allow` exacto, `deny` con cada patrón, sin
  `allowedHosts: true`, escape de globs en rutas con `()`/`[]`.
- `tests/web/vite-fs.int.test.ts`: arranca Vite real (puerto efímero) sobre (1) una **copia temporal** de la raíz
  con señuelos (`data/path-helper.sqlite`, `data/otro.db`, `feature-list.json`, `package.json`, `package-lock.json`,
  `.env`, `.env.local`, `specs/`, `progress/`, `reports/`, `.cache/`, `.git/config`, `src/server/`,
  `src/data/spells/`, y `*.sqlite`/`*.db` dentro de `src/web`) y (2) la **raíz real** (sin escribir en el repo). Para cada
  fichero lanza 15 variantes (`/@fs/<abs>`, `?raw`, `?import&raw`, `?url`, `?raw??`, `encodeURI`, `..`, `%2e%2e`,
  `..%2f`, `/../../`, `/src/web/../../`, ruta directa...) con `http.request` (sin normalización de `..`) y exige 403/404
  o el `index.html` del fallback SPA, nunca el contenido (el señuelo lleva un centinela). Comprueba también que la app
  sigue sirviendo: `/`, `/legal`, `/cuentas`, `/@vite/client`, `/@react-refresh`, `/manifest.webmanifest`, `/main.tsx`,
  módulos de `src/web`, y **todo el grafo de módulos desde `/main.tsx`** (>30 módulos, incluidos `src/shared`,
  `src/data/legal` y dependencias) con 200. Mutación: quitando `fs` fallan 17 tests; con `fs` pasan todos.
- Nota: variantes con `..%2f` devuelven 200 pero es el `index.html` del fallback SPA (el test lo distingue por el
  centinela y por `<div id="root">`).

**¿Afecta a `vite preview`?** No. `preview` sirve solo el contenido de `dist/web` (sirv, sin `/@fs`, sin acceso a la
raíz); lo comprueba un test con un preview real sobre una build simulada (misma batería de ataques, todos 403/404/SPA).
**Producción (f9):** el vector `/@fs` es específico del servidor de desarrollo de Vite; no existe en un servidor
estático normal, pero el equivalente (servir ficheros fuera de `dist/web`) hay que cerrarlo en f9. **Requisitos para f9**
(anotados aquí por no tener spec todavía):
1. El servidor que sirva `dist/web` DEBE servir únicamente ese directorio (sin listados de directorio, sin dotfiles,
   resolución con `..`/`%2e%2e`/barras invertidas contenida en la raíz) y NO DEBE servir nunca `data/`, `*.sqlite*`,
   `.env*`, `specs/`, `package*.json`. Test de integración análogo a `vite-fs.int.test.ts` (rutas de ataque contra el
   servidor real y una BD señuelo).
2. La BD SQLite DEBE vivir fuera de la raíz servida (volumen de datos), con permisos restrictivos.
3. (Heredado del review H4.5) CSP con `default-src 'self'` y `frame-ancestors 'none'`, y demás cabeceras de seguridad
   para el HTML; `AUTH_ALLOWED_ORIGINS` con el origen real; fallback SPA que no capture `/api` ni `/health`.

### Hallazgo adicional descubierto al probar: el proxy de `/api` rompía la app en desarrollo (R89)

El código del cliente vive en `src/web/api/` y Vite lo sirve en `/api/services.tsx`, `/api/http-client.ts`... pero el
proxy de desarrollo `"/api"` (prefijo de cadena) los enviaba a la API: **`npm run dev` no habría cargado la app**
(`main.tsx` importa `./api/services`; el crawler recibió 502). Ni los tests de f1b ni el humo del implementer lo
detectaron porque no recorrían el grafo de módulos. Corrección mínima y localizada en `vite.config.ts`:
`proxy["/api"] = { target, bypass }` con `WEB_SOURCE_MODULE_RE = /^\/api\/[^?#]*\.(tsx?|jsx?|mts|css|map)(?:[?#]|$)/`
(las rutas reales de la API nunca llevan extensión; `/api/x?file=a.ts` sigue yendo al proxy). **Este es un cambio
fuera del alcance literal pedido** (requisito nuevo R89 en f1b): lo hice porque es una regresión que deja f1b inservible
en desarrollo y la mejor prueba de H1 (el crawler) la expone. Alternativa descartada: renombrar `src/web/api/` (toca
decenas de imports/tests/spec). Ajuste de test existente: `vite-config.test.ts` R37 (f0) comparaba el proxy con
`toEqual` de cadenas; ahora comprueba claves y `target` (misma semántica). Tests: unit en `vite-config.test.ts` y
int en `vite-fs.int.test.ts` (`/api/services.tsx` y `/api/http-client.ts?t=123` -> 200 desde Vite; `/api/auth/me`,
`/api/accounts`, `/health` -> proxy, 502 con la API caída). **Conviene que el humano confirme en un navegador real
(paso 1 de la checklist)**; yo no puedo ejecutar un navegador.

## H2: foco en los paneles inline de la fila de cuenta (R90)

**Qué estaba mal.** Al abrir «Deshabilitar», cancelar, o terminar una acción, los botones se desmontan o se
deshabilitan y el foco caía a `<body>` (solo «Restablecer PIN» enfocaba su campo).
**Corrección** (`src/web/features/accounts/account-row.tsx`): refs a los controles y un estado `wantFocus` que un
efecto aplica cuando el destino está montado y la fila ya no está `busy` (los botones deshabilitados no pueden
recibir foco). Al abrir reset -> campo de PIN; al abrir deshabilitar -> primer botón de la confirmación; cancelar ->
botón de origen (reset, o el de habilitar/deshabilitar); éxito -> botón de origen (tras deshabilitar, «Habilitar»;
tras habilitar, «Deshabilitar»); error o PIN inválido -> campo de PIN / confirmación; «Desbloquear» conserva su foco.
**Tests:** 7 nuevos `R90` en `tests/web/features/accounts/accounts-page.test.tsx` (activeElement tras cada paso).

## Seguimientos de f1 (enmienda a `specs/f1-auth-roles`, requisitos nuevos R93-R95 a continuación de R92, sin renumerar)

- **(a) R93 + R94: nombres de cuenta.** `src/shared/auth.ts`: `nameSchema` = `trim` -> NFC -> 1-32 caracteres -> sin
  `\p{Cc}` ni `\p{Cf}` (RLO/LRO/isolates, ancho cero, BOM interior, guion blando...). Se almacena y compara en NFC
  («Café» y «Cafe»+acento combinante colisionan: `name_taken`). `normalizeName` no cambia. No existe endpoint de
  renombrado hoy (el `PATCH` solo cambia `disabled`); cualquier futuro renombrado heredará `nameSchema`. Los
  nombres válidos existentes (con ñ, tildes, CJK, emoji simples, apóstrofos) no cambian (test). Cuentas ya
  guardadas con caracteres Cf siguen pudiendo entrar (el login no usa `nameSchema`, solo `normalizeName`).
  **Contrapartida a conocer:** `Cf` incluye ZWJ/ZWNJ, así que no se admiten emoji compuestos por secuencias ZWJ ni
  nombres persas con ZWNJ; un BOM en los extremos se recorta (JS lo trata como espacio), en el interior se rechaza.
  Tests: `tests/shared/auth.test.ts`, `account-service.test.ts`, `account-routes.test.ts` y R61 de la UI (RLO y ancho
  cero en la tabla de `accounts-page.test.tsx`).
- **(b) R95: fijación de sesión.** `AuthService.login(name, pin, previousToken?)` borra la sesión del token presentado
  (tras verificar el PIN y dentro de la exclusión por nombre) antes de crear la nueva; `auth-routes.ts` le pasa
  `request.cookies[cookieName]`. Cookie inválida/vacía/desconocida/enorme: sin error, misma respuesta 200/401 de
  siempre (404 idéntico y sin oráculo de existencia: no cambia ningún código ni cuerpo). Un login **fallido o
  bloqueado no revoca** la sesión previa (evita que un tercero con una cookie ajena la cierre fallando a propósito
  y mantiene el contrato R21-R23). El token previo de otra cuenta también se revoca. Tests: `auth-service.test.ts`
  (4) y `auth-routes.test.ts` (2).

## H4 (menores)

| Punto | Estado |
|---|---|
| `document.title` coherente | Todas las páginas ya fijaban su título vía `Page`. Corregido el dato personal: Inicio usaba «Hola, X · Path Helper»; ahora `Page` admite `documentTitle` y Inicio usa «Inicio · Path Helper» (el `h1` sigue saludando). `AppErrorBoundary` fija su título en error. R91; tests en `page.test.tsx`, `error-boundary.test.tsx`. |
| `autocomplete="new-password"` en PIN del GM | **Ya estaba**: `create-account-form.tsx` y el panel de restablecer de `account-row.tsx` lo usan (y el cambio de PIN). Sin cambios. El reviewer (H4.2) sugería `off` como alternativa si molesta; se mantiene `new-password` (estándar para forzar que no autorrellene con la contraseña del GM). |
| `role="alert"` fuera de `<main>` | `AppErrorBoundary`: `<main>` contiene `<div role="alert">` con h1 y mensaje (el botón queda fuera del alert). R92; tests. |
| H4.1 (RLO/zero-width) | Cerrado con R93/R94. |
| H4.3 | Cerrado (R91). |
| H4.4 (registro de errores) | No trivial, **no hecho**: `AppErrorBoundary` no registra nada por R86; cómo diagnosticar en producción (log del servidor / endpoint de reporte) es decisión para f9/observabilidad. |
| H4.5 (CSP, cabeceras) | Anotado como requisito de f9 (arriba). |
| H4.6, H4.7, H4.8 | Sin cambios (checklist manual / f3b / `lazy` al llegar ficha). |

H3 (sincronización entre pestañas): sin cambios, por decisión del humano. Lo único de H3 que cambia es la
observación de f1 (sesión huérfana al hacer login con cookie), cerrada con R95.

## Trazabilidad de los requisitos nuevos

| R | Test |
|---|---|
| R88 | `tests/project/vite-config.test.ts` (2 tests), `tests/web/vite-fs.int.test.ts` (copia temporal y raíz real, preview, `.sqlite`/`.db` en carpeta servible, app y grafo de módulos) |
| R89 | `tests/project/vite-config.test.ts`, `tests/web/vite-fs.int.test.ts` |
| R90 | `tests/web/features/accounts/accounts-page.test.tsx` (7 tests `R90`) |
| R91 | `tests/web/shell/page.test.tsx`, `tests/web/shell/error-boundary.test.tsx` |
| R92 | `tests/web/shell/error-boundary.test.tsx` |
| f1 R93 | `tests/shared/auth.test.ts`, `tests/server/auth/account-service.test.ts`, `tests/server/http/routes/account-routes.test.ts`, R61 en `accounts-page.test.tsx` |
| f1 R94 | `tests/shared/auth.test.ts`, `account-service.test.ts`, `account-routes.test.ts` |
| f1 R95 | `tests/server/auth/auth-service.test.ts`, `tests/server/http/routes/auth-routes.test.ts` |

## Ficheros

Modificados: `vite.config.ts`, `src/shared/auth.ts`, `src/server/auth/auth-service.ts`,
`src/server/http/routes/auth-routes.ts`, `src/web/features/accounts/account-row.tsx`,
`src/web/features/home/home-page.tsx`, `src/web/shell/{page,error-boundary}.tsx`, `README.md`,
`specs/f1-auth-roles/requirements.md` (R93-R95), `specs/f1b-auth-ui/{requirements,tasks}.md` (R88-R92, T29-T32),
tests: `tests/project/vite-config.test.ts`, `tests/shared/auth.test.ts`, `tests/server/auth/{account,auth}-service.test.ts`,
`tests/server/http/routes/{account,auth}-routes.test.ts`, `tests/web/features/accounts/accounts-page.test.tsx`,
`tests/web/shell/{page,error-boundary}.test.tsx`. Nuevo: `tests/web/vite-fs.int.test.ts`.

## Para el reviewer / humano

- Para la checklist manual (`progress/manual_f1b-auth-ui.md`): el paso 1 (`npm run dev`) ahora es crítico por R89;
  el paso 22 (descargar `/@fs/...package.json` y la BD desde otro dispositivo) debe dar 403/index.html.
- Aviso de edición: en este entorno la herramienta de edición decodifica los escapes `\uXXXX` de los textos a
  caracteres reales; los tests con caracteres invisibles (RLO, ancho cero, BOM, combinantes) se normalizaron a
  escapes `\uXXXX` explícitos (verificado con grep: ningún carácter `Cf` literal en `src/` ni `tests/`).
