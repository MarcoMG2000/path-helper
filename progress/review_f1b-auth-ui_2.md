# Review 2 — feature f1b-auth-ui (segunda revision, acotada)

**Veredicto:** APROBADO (APPROVED)

H1 (bloqueante de la primera revision) esta corregido y verificado de forma independiente contra un Vite
real con `HOST=0.0.0.0` y senuelos; H2 y H4 corregidos; los dos endurecimientos de f1 (R93/R94 nombres,
R95 revocacion de sesion previa) funcionan contra un servidor real. `init.sh`, `test:int`, `lint`,
`typecheck` y `build` en verde. No hay defectos bloqueantes. Quedan 5 observaciones menores (no bloquean)
y las decisiones para el humano al final.

Revisor: agente `reviewer`, 2026-10-18. Node v24.20.0, Windows 11 + Git Bash. Vite 8.3.4.

## Resultados reales de ejecucion

| Comando | Resultado |
|---|---|
| `bash ./init.sh` | **EXIT 0** a la primera (`npm ci` sin ENOTEMPTY; 0 vulnerabilidades), `npm test`: **155 ficheros / 2270 tests en verde**, `data:validate` "sin errores", "init OK" |
| `npm run test:int` | **10 ficheros / 84 tests en verde** (incluye `tests/web/vite-fs.int.test.ts`, 26 tests) |
| `npm run lint` | sin errores |
| `npm run typecheck` | sin errores |
| `npm run build` | OK: `index-*.js` 377,10 kB (116,96 kB gzip), CSS 6,93 kB, PWA precache 6 entradas (381,10 KiB), `sw.js` generado |
| Tests de f1 | incluidos en los 2270 (tests de `tests/server/auth`, `tests/server/http/routes`, `tests/shared`); los 4 ficheros tocados pasan 111/111 tambien en la copia |
| Procesos | ninguno vivo: `tasklist` sin `node.exe`, puertos 4173/5517/5518/5519 libres. Copia de pruebas y BD temporales en el scratchpad; el repo real no se edito (`git status`: los mismos 24 ficheros que al empezar) |

## 1. H1 verificado de forma independiente

Montaje: copia del repo en `scratchpad/r2/repo` (sin `.git`/`.cache`/`dist`, con `node_modules` copiado, no enlazado,
para no escribir en la cache real de Vite), con senuelos que contienen un centinela: `data/path-helper.sqlite`,
`data/otro.db`, `data/notes.txt`, `path-helper.sqlite` y `root.sqlite-wal` en la raiz, `.env` y `.env.local`
(con centinela), `.git/config`, `.cache/x.html`, `reports/r.json`, `src/server/secret.ts`, `src/web/leak.sqlite`,
`tests/`, `scripts/`, `docs/` y `.claude/` con `leak.txt`, mas `feature-list.json`, `package*.json`, `specs/`, `progress/`
reales. Se lanzo `vite.config.ts` REAL (sin tocar) con `HOST=0.0.0.0 WEB_PORT=5517` (`Network: http://192.168.1.135:5517`).
Sonda propia con `http.request` (sin normalizar `..`): 34 ficheros objetivo x 50 variantes = **1700 peticiones**. Variantes:
`/@fs/<abs>` con `?raw`, `?import`, `?inline`, `?url`, `?import&raw`, `?raw??`, `?html-proxy`, `?worker_file`; `//` y `%2f` en la ruta,
`C%3a`, minusculas, MAYUSCULAS, `/@FS/`, sin unidad (`/@fs//Users/...`), barra invertida y `%5c`, `..`, `%2e%2e`, `..%2f`, `.%2e`,
`%252e%252e`, `..%5c`, NUL (`%00`, `%00.ts`), `/.` final, `;.ts`, `::$DATA`; `/@id/<abs>` (+`?raw`); ruta directa
(`/data/...`, `/src/data/...`, `/../..`, `/%2e%2e/`, `/src/web/../../`) con `?raw/?import/?inline/?url`; y rutas con `..` repetidos.

Resultado global del dev server: 403 x651, SPA `index.html` x931 (200 con `<div id="root">`, sin contenido), 404 x2, 500 x4
(solo NUL en ficheros YA permitidos), 200 x94 (ficheros permitidos de `src/web`, `src/shared`, `src/data/legal`,
`node_modules/.vite/deps` y wrappers `export default "<url>"` de assets `.txt?import`, sin contenido), **LEAK x18 = solo via
una junction dentro de `src/web` (ver O1)**. Cero fugas del centinela en ningun fichero sensible.

| Ruta (relativa a la copia) | Codigo |
|---|---|
| `/@fs/<abs>/data/path-helper.sqlite` (y `?raw`, `?import`, `?inline`, `?url`, `?import&raw`, `?raw??`, `?html-proxy`) | 403 |
| idem desde la IP de la LAN `http://192.168.1.135:5517/@fs/.../data/path-helper.sqlite` | 403 |
| `/@fs/<abs>/path-helper.sqlite`, `root.sqlite-wal`, `data/otro.db`, `data/notes.txt` | 403 |
| `/@fs/<abs>/package.json`, `package-lock.json`, `feature-list.json` (LAN y local) | 403 |
| `/@fs/<abs>/.env`, `.env.local`, `.git/config`, `.cache/x.html`, `reports/r.json` | 403 |
| `/@fs/<abs>/specs/...`, `progress/current.md`, `tests/`, `scripts/`, `docs/`, `.claude/`, `README.md`, `vite.config.ts`, `tsconfig.json` | 403 |
| `/@fs/<abs>/src/server/secret.ts`, `src/server/main.ts`, `src/data/spells/a.json` | 403 |
| `/@fs/<abs>/src/web/leak.sqlite` (BD dentro de carpeta permitida) | 403 (deny `*.sqlite*`) |
| `/@fs/<abs>/node_modules/vite/package.json`, `node_modules/react/package.json`, `node_modules/.package-lock.json` | 403 |
| `/@fs/C:/Windows/win.ini`, `/@fs/C:/Windows/System32/drivers/etc/hosts` | 403 |
| `/@fs/etc/passwd`, `/@fs//Users/...` (sin unidad) | 200 pero es el `index.html` del fallback SPA |
| `/@fs/<abs>/data/path-helper.sqlite%00`, `.env%00`, `package.json%00.ts`, `package.json/.` | 200 `index.html` SPA o 403, nunca contenido |
| `/@fs/<root>/src/web/../../data/path-helper.sqlite`, `%2e%2e/%2e%2e/`, `..%5c..%5c`, `.%2e/.%2e/`, `%252e%252e` | 403 (o SPA index con `..%2f`) |
| `/@id/<abs>/package.json`, `/@id/<abs>/data/path-helper.sqlite` (+`?raw`) | 200 `index.html` SPA (no contenido) |
| `/data/path-helper.sqlite`, `/package.json`, `/specs/...`, `/../..`, `/%2e%2e/`, `/src/web/../../...` (+`?raw/?import/?inline/?url`) | SPA `index.html` o 403; `.txt?import` solo devuelve el wrapper `export default "/@fs/..."` (URL, no contenido) |
| `/node_modules/.vite/deps/_metadata.json` | 200 `index.html` SPA (via `/@fs/...?import` devuelve JSON de metadatos de la cache de deps: no sensible, ver O2) |
| Host `evil.example.com`, `attacker.test`, `127.0.0.1.nip.io:5517` (DNS rebinding) en `/`, `/main.tsx`, `/@fs/.../src/shared/auth.ts` | **403** (bloqueado por Vite) |
| Host `localhost:5517`, `192.168.1.135:5517`, `[::1]:5517` | 200 (IP/localhost permitidos; el flujo movil sigue funcionando) |

La app SIGUE funcionando (copia con config real): `/` 200, `/legal` 200, `/login` 200, `/cuentas` 200, `/main.tsx` 200,
`/@vite/client` 200, `/@react-refresh` 200, `/manifest.webmanifest` 200, `/dev-sw.js?dev-sw` 200,
`/api/services.tsx` y `/api/http-client.ts?t=1` 200 desde Vite (R89), `/shell/page.tsx` 200, `/@fs/<abs>/src/shared/auth.ts` 200,
`/@fs/<abs>/src/data/legal/index.ts` 200, `/@id/virtual:pwa-register` 200, y las rutas reales `/api/auth/me` y `/health` van al
proxy (502 con la API caida, como debe ser). `npm run build` real y en la copia: OK.

**`vite preview`** (copia construida, `HOST=0.0.0.0`, puerto por defecto 4173): las mismas 1700 peticiones dieron **1700 x 200 SPA
`index.html`, 0 fugas**; ademas `--path-as-is` con `data/path-helper.sqlite`, `dist/web/../../data/...`, `%2e%2e/`, `..%2f`, `..%5c`, `.env`:
todo `index.html`. Host `evil.example.com` -> 403. Preview sirve solo `dist/web`; no tiene `/@fs`.

**Revision de `allow`/`deny`**: la defensa real es la lista blanca (`strict: true` + `allow` = `src/web`, `src/shared`, `src/data/legal`);
todo lo demas del repo (`tests/`, `scripts/`, `docs/`, `.claude/`, `src/server`, `src/data/*` salvo `legal`, `node_modules`, ficheros de
la raiz, `data/` con cualquier ruta relativa) da 403 aunque no estuviera en `deny`. `deny` es defensa en profundidad y cubre BD (`*.sqlite*`,
`*.db`, `*.db-*`, tambien dentro de carpetas permitidas), `.env*`, `.git`, y rutas de la raiz con la ruta absoluta escapada de globs.
No encuentro huecos servibles con datos sensibles (salvo el caso de symlinks, O1). `allowedHosts` no se toca y el valor por defecto bloquea DNS-rebinding (verificado).
Mutaciones propias en la copia sobre `vite-fs.int.test.ts`: sin `fs` -> 17 fallos; `allow: [root]` (sin lista blanca) -> 2 fallos; `allow: [root]`
y sin `deny` de `data/**` -> 2 fallos; sin `*.sqlite*` en `deny` -> 1 fallo; con la config real 26/26. Los tests no son triviales.

## 2. Endurecimientos de f1 (servidor real, BD temporal, GM creado con la CLI `runCreateGm`, puerto efimero)

Script `scratchpad/r2/attack2.mts`. Nombres via `POST /api/accounts` como GM:

| Nombre | Resultado |
|---|---|
| RLO U+202E, LRO U+202D, RLI U+2067, LRM U+200E, ALM U+061C | 400 `validation_error` |
| zero-width U+200B (interior, inicio, final), ZWNJ U+200C, ZWJ U+200D, word joiner U+2060, soft hyphen U+00AD, tag char U+E0041 | 400 |
| BOM U+FEFF interior | 400 |
| BOM U+FEFF al inicio / al final | 201, **recortado** (`BomStart`, `BomEnd`), como documenta R93 |
| controles BEL, NUL, TAB, LF, NEL U+0085, DEL | 400 |
| solo espacios; 33 caracteres; 33 pares NFD (e + U+0301) | 400 |
| 32 caracteres; 32 pares NFD (= 32 tras NFC) | 201 (el largo se mide tras NFC) |
| tildes/enye (Nandu, Jose), Zoe con dieresis NFD (guardado NFC), emoji simple U+1F600, CJK, apostrofo, espacio interior, corazon + VS16 | 201, guardado en NFC |
| emoji ZWJ de familia | 400 (contrapartida documentada: Cf incluye ZWJ) |
| NFC vs NFD: `Cafe` con e-acute compuesto 201; `Cafe` + U+0301 -> **409 `name_taken`**; mayusculas compuesto y NFD -> 409; NFD primero (Muller con dieresis combinante) y compuesto despues -> 409 | **no hay duplicados**: 0 nombres no-NFC y 0 con Cc/Cf entre las cuentas finales |
| Login con NFD, minuscula compuesta, mayusculas NFD con espacios exteriores | 200 las tres; el nombre devuelto es el guardado en NFC |

Login con cookie previa (`POST /api/auth/login`):

| Caso | Resultado |
|---|---|
| Cookie GM valida + login correcto como Ana | 200; la cookie GM antigua da `GET /api/auth/me` **401**; la nueva 200 y es distinta; `Set-Cookie: ph_session=<tok>; Max-Age=2592000; Path=/; HttpOnly; SameSite=Strict` |
| Ana relogin con su propia cookie | 200; la vieja 401, la nueva 200 |
| PIN incorrecto con cookie valida | 401 `invalid_credentials`, sin `Set-Cookie`; la cookie previa **sigue viva** (200) |
| Usuario inexistente con cookie valida | 401, cuerpo **byte a byte igual** al de sin cookie y al de PIN erroneo (sin oraculo de existencia); cookie previa viva |
| Cuenta deshabilitada con cookie GM valida | 401, cuerpo igual que sin cookie; cookie GM viva |
| Cookie invalida: vacia, `garbage`, 8000 caracteres, entrecomillada, `%E2%80%AE`, `%00`, otra cookie, duplicadas basura+valida y valida+basura | 200 con la misma respuesta de siempre, `Set-Cookie` nuevo, sin errores |
| Cookie de Bea + login correcto como GM | la de Bea queda revocada (401), la de GM nueva funciona |
| Logout | 204; la cookie da 401 |
| 6 fallos con cookie GM presente | 429 `locked`; login correcto durante el bloqueo 429; la cookie GM no se revoca |

Mutaciones propias (copia): quitar `if (previousToken) ...` -> fallan 3 tests R95 (servicio y ruta); quitar la categoria `Cf` de la regex -> fallan 5 tests (R93 en schema,
servicio, ruta y 2 de la UI R61); quitar el `normalize("NFC")` -> fallan 3 tests R94. Ademas, el cambio de la tautologia
`normalizeName(x)==normalizeName(x)` por NFD vs NFC en `tests/shared/auth.test.ts` mejora ese test.

## 3. H2 / H4 (foco, titulo, autocomplete, landmarks)

- **Foco (R90), revision estatica de `src/web/features/accounts/account-row.tsx`:** refs a reset/toggle/unlock/confirm/pin y estado
  `wantFocus` aplicado por un efecto `[wantFocus, busy, mode]` que espera a `!busy` (un boton deshabilitado no puede recibir foco) y a que el
  destino este montado; `run()` hace `setBusy(false)` + `onDone` + `setWantFocus` en el mismo tick (batch), asi que el efecto corre con
  `mode` ya `idle`. Casos cubiertos: abrir reset -> campo PIN; abrir deshabilitar -> primer boton de confirmacion; cancelar -> boton de origen;
  exito -> boton de origen (el boton Habilitar comparte ref con Deshabilitar); error o PIN invalido -> campo PIN o confirmacion; desbloquear
  conserva su boton. No hay ruta que deje el foco en `<body>`. 7 tests `R90` con `document.activeElement`; mutacion (efecto inerte) -> **7 tests fallan**.
- **Titulo (R91):** `Page` admite `documentTitle`; Inicio usa "Inicio - Path Helper" (con el separador de `es.pageTitle`) y el `h1` saluda; `AppErrorBoundary.componentDidCatch` fija titulo
  sin registrar nada (R86). Mutacion (quitar `documentTitle`) -> falla `page.test.tsx` (comprueba `not.toContain(GM.name)`).
- **Landmarks (R92):** `<main>` contiene `<div role="alert">`; test en `error-boundary.test.tsx`.
- **autocomplete:** `new-password` en alta y restablecer (R48 solo fija el login: `current-password`); decision razonable, ver D3.

## Trazabilidad requirements <-> tests (R88+ y regresion)

- R88: [x] `tests/project/vite-config.test.ts` (2 tests R88: `fs` estricto, `allow` exacto, `deny` por patron, sin `allowedHosts: true`, escape de globs) y
  `tests/web/vite-fs.int.test.ts` (7 titulos R88: Vite real sobre copia temporal con senuelos y sobre la raiz real; `.sqlite` en carpeta servible; `vite preview`;
  app y grafo de modulos completo desde `/main.tsx`)
- R89: [x] `tests/project/vite-config.test.ts` (1) y `tests/web/vite-fs.int.test.ts` (`/api/services.tsx` desde Vite; `/api/auth/me`, `/api/accounts`, `/health` al proxy)
- R90: [x] 7 tests en `tests/web/features/accounts/accounts-page.test.tsx`
- R91: [x] `tests/web/shell/page.test.tsx` (2), `tests/web/shell/error-boundary.test.tsx` (1)
- R92: [x] `tests/web/shell/error-boundary.test.tsx`
- f1 R93: [x] `tests/shared/auth.test.ts` (3), `account-service.test.ts`, `account-routes.test.ts`, R61 UI
- f1 R94: [x] `tests/shared/auth.test.ts`, `account-service.test.ts`, `account-routes.test.ts`
- f1 R95: [x] `auth-service.test.ts` (4), `auth-routes.test.ts` (2)
- R1..R87 de f1b: [x] intactos: el `git diff` de `tests/` no elimina ningun `it/describe` (solo 5 lineas borradas: el `import` de `createViteConfig`, la comparacion de proxy de
  R37-f0 sustituida por claves+`target` en `vite-config.test.ts`, la tautologia de `normalizeName` y la asercion de titulo de `page.test.tsx`, endurecida con R91). Los 2270 tests
  pasan; los 84 de integracion pasan.
- R1..R92 de f1: [x] sin cambios en los tests existentes (solo se anaden); 111/111 en los 4 ficheros tocados.

## Tasks completas

- T1..T32: [x] (0 `[ ]` en `specs/f1b-auth-ui/tasks.md`; T29-T32 nuevas, con mapa R88-R92 -> T29-T31 y f1 R93-R95 -> T32)

## Checkpoints

- C1: [x] archivos base y 4 docs presentes; `./init.sh` exit 0
- C2: [x] una sola feature `in_progress` (f1b; f4 `spec_ready`); `progress/current.md` describe la sesion
- C3: [x] capas respetadas (`vite.config.ts` es fichero de herramienta que importa la config del servidor, ya existente de f0); sin dependencias nuevas; sin `console.*`, TODO ni secretos nuevos
- C4: [x] un test por modulo cambiado; lo real (Vite real, servidor real) marcado `.int.test.ts`
- C5: [x] spec con las enmiendas EARS R88-R92 (f1b) y R93-R95 (f1), todos con test; tasks `[x]`

## Observaciones (no bloquean)

- **O1 (BAJO, informativo): un symlink/junction dentro de las carpetas permitidas SI se sigue.** Reproduccion: en la copia, crear una junction `src/web/linkdata` que apunte a `data/` y
  `GET /@fs/<abs>/src/web/linkdata/notes.txt` -> 200 con el contenido (18 de las 1700 peticiones). Vite comprueba `allow` sobre la ruta pedida, no sobre su realpath. Requiere que alguien
  con acceso de escritura al arbol cree un enlace dentro de `src/web`, `src/shared` o `src/data/legal` (no hay ningun symlink en el repo: `find src tests -type l` y `git ls-files -s | grep ^120000` vacios).
  No es explotable por un jugador de la LAN. Sugerencia: documentarlo o anadir una regla de higiene que prohiba symlinks bajo esas tres carpetas (el test de integracion crea una junction solo para `node_modules`).
- **O2 (BAJO, informativo):** `/@fs/<abs>/node_modules/.vite/deps/_metadata.json?import` y `/deps/react.js` se sirven (cache de dependencias que Vite necesita; sin datos sensibles).
  Los assets fuera de `allow` con `?import` (p. ej. `data/notes.txt?import`, `tests/leak.txt?import`) devuelven un wrapper `export default "/@fs/..."` (solo la URL, que a su vez da 403) y confirman la existencia del
  fichero; sin consecuencia de confidencialidad.
- **O3 (BAJO, residual de R93):** siguen aceptandose nombres visualmente vacios o confundibles que no son `Cc/Cf`: U+3164 (Hangul filler) y U+2800 (Braille blank) como nombre entero, U+2028/U+2029 (Zl/Zp)
  y NBSP U+00A0 interiores (todos 201 en la prueba). Los crea solo el GM y se pintan como texto de React (sin XSS). Mejora posible en f1: rechazar tambien Zl, Zp y NBSP, y exigir al menos un
  caracter visible (letra, numero o emoji).
- **O4 (BAJO, proceso):** `progress/manual_f1b-auth-ui.md` NO incluye aun los pasos 16-26 propuestos en la primera revision ni pasos nuevos para R88/R89/R90/R93-R95; `impl_f1b-fixes.md` los menciona pero el fichero
  sigue con los 15 pasos originales (todos pendientes de humano). Ampliarlo antes de que el humano la ejecute.
- **O5 (informativo):** `vite preview` escucha en el puerto 4173 (no en `WEB_PORT`) con `HOST=0.0.0.0`; para f9 hay que repetir la bateria de `/@fs` y el resto de requisitos que el implementer anoto en `impl_f1b-fixes.md` (servidor que solo sirva `dist/web`, BD fuera de la raiz servida, CSP y `frame-ancestors`).

## Cambios requeridos

Ninguno bloqueante. Opcionales: O3 (endurecer R93 en f1) y O4 (ampliar la checklist manual) antes de marcar `done`.

## Decisiones para el humano

- D1: se acepta que ZWJ/ZWNJ queden prohibidos en nombres (sin emoji compuestos de familia/profesion ni palabras persas con ZWNJ)? Es la contrapartida documentada de R93; el revisor la considera aceptable.
- D2: se endurecen tambien Zl/Zp/NBSP y nombres "invisibles" (O3) en una enmienda f1, o se acepta el riesgo residual (solo crea cuentas el GM)?
- D3: `autocomplete="new-password"` en alta/restablecer: el navegador del GM puede ofrecer guardar el PIN de un jugador; se mantiene (estandar). Cambiar a `off` solo si molesta en la checklist manual.
- D4: H3 (sincronizacion entre pestanas con rol distinto) sigue sin cambios por decision del humano; no bloquea.
- D5: antes de marcar `done`: ejecutar la checklist manual en navegador real y movil, con el paso 1 (`npm run dev` carga la app: R89) y el 22 (desde otro dispositivo `http://IP:5173/@fs/.../package.json` y la BD NO se descargan: R88) como criticos.
- D6: marcar `done` corresponde al leader/humano; el revisor no lo hace.
