# Review — feature f0-project-skeleton

**Veredicto:** APROBADO (APPROVED)

Entorno de verificación: Node v24.20.0, npm 11.19.0, Windows 11 + Git Bash. Todo ejecutado por el
reviewer, no tomado del informe del implementer.

## Ejecución real

| Comando | Resultado |
|---|---|
| `bash ./init.sh` | exit 0 (`npm ci` + `npm test`: 16 ficheros / 71 tests en verde) |
| `npm run lint` | exit 0, sin errores |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; `dist/web` con `index.html`, `manifest.webmanifest`, `sw.js`, `workbox-*.js` |
| `npm run test:int` | exit 0; 3 ficheros / 7 tests en verde |
| `npx vite` (foreground, 20 s, terminado) | `GET /` 200; `/manifest.webmanifest` correcto; sin procesos residuales |

## Trazabilidad requirements <-> tests (rutas bajo `tests/`)

Todos los tests citados existen, tienen aserciones reales (leídos uno a uno) y llevan el R<n> en el nombre.

- R1, R2: [x] `project/layout.test.ts` (un `it` por capa y por R)
- R3: [x] `project/lint-layers.test.ts` (casos "R3": rules y data no importan de server/web) con `ESLint.lintText`
- R4: [x] `project/lint-layers.test.ts` (caso "R4": web no importa de server) + caso negativo de imports permitidos
- R5: [x] `project/package-json.test.ts` "R5"
- R6: [x] `project/package-json.test.ts` "R6" (`>=22`)
- R7: [x] `project/package-json.test.ts` "R7" (regex de semver exacto sobre deps y devDeps)
- R8: [x] `project/package-json.test.ts` "R8"
- R9: [x] `project/package-json.test.ts` "R9"
- R10: [x] `project/repo-files.test.ts` "R10"
- R11: [x] `project/tsconfig.test.ts` "R11"
- R12: [x] `project/tsconfig.test.ts` "R12"
- R13: [x] `project/pipeline.int.test.ts` "R13" (spawnea `npm run typecheck`; además ejecutado por mí)
- R14: [x] `project/pipeline.int.test.ts` "R14" (además ejecutado por mí)
- R15: [x] `project/lint-layers.test.ts` "R15" (`console.log` en `src/server/x.ts` produce `no-console`)
- R16: [x] `project/repo-files.test.ts` "R16"
- R17: [x] `project/vitest-config.test.ts` "R17" (efecto real: `npm test` no ejecuta los `*.int.test`)
- R18: [x] `project/vitest-config.test.ts` "R18" (efecto real: `test:int` ejecuta solo 3 ficheros)
- R19: [x] `server/config/schema.test.ts` (4 tests "R19": claves, defectos, enums, rangos de puerto)
- R20: [x] `server/config/schema.test.ts` "R20" (2 tests)
- R21: [x] `server/config/schema.test.ts` "R19/R21" y "R21"
- R22: [x] `server/config/schema.test.ts` "R22" (3 tests: lista de variables, valores inválidos, enteros no estrictos)
- R23: [x] `server/config/schema.test.ts` "R23" y `server/config/load.test.ts` "R23/R27"
- R24: [x] `server/config/load.test.ts` "R24"
- R25: [x] `server/config/load.test.ts` "R25" (2 tests)
- R26: [x] `server/config/load.test.ts` "R26"
- R27: [x] `server/config/load.test.ts` "R27" (2 tests) y "R23/R27"
- R28: [x] `project/env-example.test.ts` "R28" (2 tests: claves igual a ENV_KEYS, valores igual a defectos)
- R29: [x] `project/env-example.test.ts` "R29"; comprobado además con `git check-ignore`: `.env` ignorado, `.env.example` no
- R30: [x] `server/app.test.ts` "R30"
- R31: [x] `server/app.test.ts` "R31" (2 tests, `buildApp` y `composeApp`)
- R32: [x] `server/app.test.ts` "R32"
- R33: [x] `server/start.test.ts` "R33" (compose mockeado, no se llama)
- R34: [x] `server/start.int.test.ts` "R34" (puerto 0, `fetch` real)
- R35: [x] `project/package-json.test.ts` "R35" (script `dev`) + verificación manual de `npm run dev` (impl) y `npx vite` por mí
- R36: [x] `web/dev-server.int.test.ts` "R36" + `project/vite-config.test.ts` "R36"
- R37: [x] `web/dev-server.int.test.ts` "R37" + `project/vite-config.test.ts` "R37" (proxy)
- R38: [x] `project/vite-config.test.ts` "R38" (`strictPort: true`; el spec acepta este nivel de verificación)
- R39: [x] `web/dev-server.int.test.ts` "R39" + `project/vite-config.test.ts` "R39"
- R40: [x] `project/pipeline.int.test.ts` "R40" + `project/package-json.test.ts` "R40"
- R41: [x] `web/api/health.test.ts` "R41"
- R42: [x] `web/api/health.test.ts` "R42" (4 tests: no-200, forma, no-JSON, red)
- R43: [x] `web/components/health-status.test.tsx` "R43" (2 tests) + `web/app.test.tsx` "R43"
- R44: [x] `web/app.test.tsx` "R44"
- R45: [x] `bash ./init.sh` ejecutado por mí: exit 0 (verificación manual según tabla del spec)
- R46: [x] manual/opcional según spec; `init.sh` conserva las comprobaciones de Node (no instalado, menor que 22) y el skeleton no lo ha roto. No ejecutado sin Node.

Sin R huérfano. Ningún test vacío ni trivial.

## Tasks completas

T1..T22: todas `[x]` en `specs/f0-project-skeleton/tasks.md`; los entregables existen (comprobado en disco).
Matices (no bloqueantes):
- T21 (parar la API y ver el estado de error en un navegador): no hecho en navegador, documentado en
  `progress/impl_f0-project-skeleton.md`; el comportamiento está cubierto por R42/R43 en unit. Queda para el humano.
- T22 (actualizar `progress/current.md`): el fichero sigue con el texto previo de la oleada de specs, incluida la
  línea obsoleta "Bloqueo de entorno: Node.js no está instalado" (Node 24.20 ya está instalado y f0 ya está
  implementado). Es un fichero del leader; debe actualizarlo al cerrar la feature.

## Checkpoints aplicables

| Checkpoint | Estado | Evidencia |
|---|---|---|
| C1 El arnés está completo | [x] | Existen AGENTS.md, init.sh, feature-list.json, progress/current.md y los 4 docs; `./init.sh` exit 0 |
| C2 El estado es coherente | [x] | Una sola feature en `in_progress` (f0); ninguna `done` aún; `progress/current.md` existe (contenido a refrescar por el leader, ver T22) |
| C3 Respeta la arquitectura | [x] | Grep sin imports de server/web en `src/rules` y `src/data`, ni de server en `src/web`; `src/shared` es hoja; punto único de composición `src/server/compose.ts`; deps con versión exacta y lockfile; sin `console.*` en `src/` (único match: comentario en `src/server/main.ts:11`, que usa `process.stderr.write`); sin secretos; sin TODO/FIXME |
| C4 La verificación es real | [x] | Test por cada módulo con lógica; suite unitaria con dobles (fetch falso, `app.inject`, `vi.mock` de compose, directorios temporales); lo que usa red/Vite/build real es `*.int.test.ts`; 71 tests unitarios verdes |
| C5 Spec Driven Development | [x] | `specs/f0-project-skeleton/` con los 3 ficheros; EARS; tasks todas `[x]`; todo R<n> cubierto |

## Capas, higiene y estilo

- Capas (architecture §5): regla ESLint `no-restricted-imports` (patrones de server y web) verificada con tests, positivos y negativo. Grep manual sin violaciones.
- `.env` en `.gitignore` (línea 2); `.env.example` presente y no ignorado; `package-lock.json` no ignorado.
- Versiones: las 19 dependencias son exactas; `.npmrc` con `save-exact` y `engine-strict`.
- Textos de UI en `src/web/i18n/es.ts`; errores esperados como `Result`; `ConfigError` solo para configuración inválida al arrancar.

## Desviaciones declaradas por el implementer

1. TypeScript 6.0.3 (en vez de 7.x): aceptable. El motivo (peer de typescript-eslint 8.71.2 limitado a menos de 6.1.0) es coherente; `npm ci`, typecheck, lint y build limpios. Revisar cuando typescript-eslint soporte TS 7.
2. `@types/node` 22.20.5: aceptable y recomendable (tipa contra el mínimo soportado, `engines >=22`), aunque localmente se corra Node 24.
3. `.prettierignore`: aceptable (evita reformatear specs, docs, progress y lockfile).
4. `createViteConfig` exportada: aceptable y necesaria para testear R38 y arrancar Vite con puertos efímeros; el `export default` mantiene el comportamiento de `vite`.
5. Mensajes de `ConfigError` con nombre y regla incumplida, sin valor: aceptable; refuerza R23/R27 y está testeado.
6. Resto (helpers de test, apagado limpio en `main.ts`, `virtual:pwa-register`, opciones extra de tsconfig): aceptables; no contradicen requisitos.

## Aviso de npm ci: "1 package has install scripts not yet covered by allowScripts (esbuild postinstall)"

- Es solo un aviso de npm 11.19; `npm ci` termina en exit 0. No afecta al funcionamiento: el binario de esbuild llega por el
  paquete opcional de plataforma (`node_modules/@esbuild/win32-x64`); `npx esbuild --version` da 0.28.2, `tsx` ejecuta, vitest corre,
  `vite build` y `vite` (dev) funcionan (comprobado). El postinstall de esbuild es solo una verificación/optimización.
- Recomendación (no bloqueante): dejarlo como está, o dejar la decisión explícita con `npm install-scripts approve esbuild`
  (o `deny`) y commitear el resultado, para no depender del comportamiento por defecto de futuras versiones de npm. Si se hace,
  repetir `npm ci` y `npm test`. Decisión del humano o del leader.

## Observaciones menores (no bloquean)

1. `progress/current.md` obsoleto (ver T22); lo actualiza el leader.
2. `src/web/hooks/use-health.ts` no tiene fichero de test propio (convención de un test por módulo); queda cubierto indirectamente por `app.test.tsx` y `health.test.ts`. Tampoco los entrypoints `src/server/main.ts` y `src/web/main.tsx`. Añadir test si el hook crece.
3. `vite.config.ts`: el proxy usa `127.0.0.1` fijo para la API; fallaría si algún día HOST fuese una IP concreta distinta de loopback o 0.0.0.0. Irrelevante hoy.
4. Aviso informativo de Vite 8 sobre imports sin extensión (configLoader native) en dev/build: no afecta. `npm warn deprecated glob@11.1.0` (transitiva de workbox-build): sin acción salvo `overrides`.
5. README: tabla de URLs con columnas desalineadas (README está en `.prettierignore`); estético.

## Cambios requeridos

Ninguno.
