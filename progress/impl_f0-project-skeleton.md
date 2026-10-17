# Implementación — f0-project-skeleton

Estado: implementado, pendiente de reviewer. Tasks T1..T22 marcadas `[x]` en
`specs/f0-project-skeleton/tasks.md`. La feature NO se ha marcado `done` ni se ha tocado
`feature-list.json`.

## Verificación ejecutada (Node v24.20.0, npm 11.19.0, Windows 11 + Git Bash)

| Comando | Resultado |
|---|---|
| `bash ./init.sh` (`npm ci` + `npm test`) | exit 0; 16 ficheros / 71 tests unitarios en verde |
| `npm run test:int` | 3 ficheros / 7 tests en verde (start, dev-server Vite, pipeline typecheck+lint+build) |
| `npm run lint` | sin errores |
| `npm run typecheck` | sin errores |
| `npm run build` | OK: `dist/web` con `index.html`, `manifest.webmanifest`, `sw.js`, `workbox-*.js` |
| `npx prettier --check .` | OK (con `.prettierignore`) |
| `npm run dev` (en background, parado después) | API `GET http://127.0.0.1:3000/health` -> 200 `{"status":"ok"}`; Vite en `http://127.0.0.1:5173` (HTML con `<html lang="es">` y `#root`); `GET :5173/health` por proxy -> 200 `{"status":"ok"}`; `/manifest.webmanifest` correcto; `localhost:5173` -> 200; `/main.tsx` y `/app.tsx` se transforman (200). Procesos terminados con taskkill; solo quedan sockets TIME_WAIT. |

Nota T21: el paso "parar la API y ver el estado de error en la UI" no se hizo en un navegador (no hay
navegador en este entorno). El comportamiento está cubierto por `fetchHealth` (R42) y `HealthStatus`
(R43) en unit; queda para comprobación visual del humano.

## Cómo arrancar

```bash
npm ci
cp .env.example .env     # opcional
npm run dev              # API en 127.0.0.1:3000, web en 127.0.0.1:5173
```

En Windows, `init.sh` se ejecuta desde Git Bash. Para parar `npm run dev`: Ctrl+C.

## Versiones fijadas (save-exact, consultadas con `npm view` el 2026-10-16)

| Paquete | Versión | Tipo |
|---|---|---|
| fastify | 5.12.7 | dep |
| zod | 4.6.7 | dep |
| react | 19.3.1 | dep |
| react-dom | 19.3.1 | dep |
| typescript | 6.0.3 | dev (ver desviaciones) |
| @types/node | 22.20.5 | dev (ver desviaciones) |
| @types/react | 19.3.0 | dev |
| @types/react-dom | 19.3.0 | dev |
| vite | 8.3.4 | dev |
| @vitejs/plugin-react | 6.1.2 | dev |
| vite-plugin-pwa | 2.0.0 | dev |
| vitest | 5.0.5 | dev |
| tsx | 4.23.15 | dev |
| concurrently | 10.0.6 | dev |
| eslint | 10.12.0 | dev |
| @eslint/js | 10.0.1 | dev |
| typescript-eslint | 8.71.2 | dev |
| eslint-config-prettier | 10.1.8 | dev |
| prettier | 3.9.10 | dev |

`engines.node: ">=22"`, `.nvmrc` = 22, `.npmrc`: `save-exact=true`, `engine-strict=true`
(no rompe en Node 24 porque el rango es `>=22`).

## Desviaciones y decisiones menores respecto al spec

Ninguna cambia un requisito; todas son detalles de implementación dentro de lo que el design deja
a criterio del implementer (Q1 y otros).

1. **TypeScript 6.0.3 en vez de la última (7.0.2).** `typescript-eslint@8.71.2` (la última) declara el
   peer `typescript >=4.8.4 <6.1.0`; TS 7.0.2 es incompatible. Se fija la última 6.0.x (6.0.3). Revisar
   cuando typescript-eslint soporte TS 7.
2. **`@types/node` 22.20.5 (línea 22) en vez de 26.x.** El mínimo soportado es Node 22; tipar contra la
   línea 22 evita usar APIs que no existen en el mínimo. Vitest acepta `@types/node ^22 || >=24`.
3. **`.prettierignore` añadido** (no estaba en el design): evita que `npm run format` reescriba `specs/`,
   `docs/`, `progress/`, `.claude/`, `feature-list.json`, README y `package-lock.json`. Solo se
   formatearon los ficheros propios de la feature.
4. **`createViteConfig(config)` exportada desde `vite.config.ts`**, además del `export default`, para
   poder testear `strictPort`/proxy (unit) y arrancar Vite con puertos efímeros (int) sin duplicar
   config. `export default defineConfig(() => createViteConfig(loadConfig()))`.
5. **`ConfigError.message`** = `Configuración inválida: PORT (debe ser un entero entre 0 y 65535), ...`
   (nombre + regla incumplida, nunca el valor). Mensajes de zod sustituidos por mensajes propios para
   garantizar R23. Se usa `.prefault()` (zod 4) para que el defecto pase por el mismo pipeline, y
   `PORT`/`WEB_PORT` se validan con `^\d{1,5}$` + rango (rechaza vacío, decimales, signos, `1e3`).
6. **`tests/project/helpers.ts`** (utilidad de tests, no es un test) con `ROOT` y lectores de ficheros.
7. **Apagado limpio** en `main.ts` (SIGINT/SIGTERM -> `server.close()`); no estaba en el design, es
   trivial y no cambia requisitos.
8. **`src/web/main.tsx`** registra el service worker con `virtual:pwa-register` (tipos vía
   `vite-plugin-pwa/client` en `vite-env.d.ts`). `devOptions.enabled: true` (Q4 por defecto).
9. **`tsconfig.json`** añade `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck`,
   `esModuleInterop`, `resolveJsonModule`, `forceConsistentCasingInFileNames` y `target: ES2023`
   (no contradicen design §1). `include`: `src`, `tests`, `vite.config.ts`, `vitest*.config.ts`
   (`eslint.config.js` es JS y no entra en `tsc`; lo cubre ESLint con `eslint .`).

Preguntas abiertas Q1..Q8: resueltas con la recomendación por defecto (Q3 icon.svg placeholder, Q4 SW
en dev activado, Q5 diferido a f9, Q6 `HOST=127.0.0.1` documentado, Q7 `shared` como hoja NO reforzada
con lint aún, Q8 `/health` en raíz y `/api` proxeado).

## Observaciones para el reviewer / leader

- **Aviso de Vite al cargar `vite.config.ts`** ("features unsupported by configLoader: 'native'"):
  son imports sin extensión / a directorios index (convención de design §1, resolución Bundler). Es solo
  un aviso informativo de Vite 8 (futuro default); no afecta a dev/build/tests. Si molesta, se puede
  silenciar con `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` (no se puso en scripts por R9, sintaxis de shell).
- **`npm warn deprecated glob@11.1.0`**: dependencia transitiva de `workbox-build` (vite-plugin-pwa); no
  se puede arreglar sin `overrides`. 0 vulnerabilidades según `npm audit` en la instalación.
- **`npm warn install-scripts` (esbuild postinstall)**: aviso de npm 11.19 sobre `allowScripts`; esbuild
  funciona sin problemas (tsx, vitest y build verificados).
- **Concurrencia**: durante la implementación otro agente ejecutó `npm ci` sobre el mismo `node_modules`
  y provocó un fallo transitorio de `tsc/vitest no encontrado`; se resolvió reintentando. Conviene que los
  agentes en paralelo no ejecuten `init.sh`/`npm ci` a la vez.

## Trazabilidad R<n> -> test (rutas bajo `tests/`)

| R | Test |
|---|---|
| R1, R2 | `project/layout.test.ts` |
| R3, R4 | `project/lint-layers.test.ts` (`R3:`/`R4:` casos con `ESLint.lintText` + `filePath` simulado) |
| R5, R6, R7, R8, R9 | `project/package-json.test.ts` |
| R10, R16 | `project/repo-files.test.ts` |
| R11, R12 | `project/tsconfig.test.ts` |
| R13, R14 | `project/pipeline.int.test.ts` (`npm run typecheck`, `npm run lint`) y `bash ./init.sh` |
| R15 | `project/lint-layers.test.ts` (`console.log` en `src/server/x.ts`) |
| R17, R18 | `project/vitest-config.test.ts` (y efecto real: `npm test` 71 tests sin `*.int.test`; `npm run test:int` solo los 3 `*.int.test`) |
| R19, R20, R21, R22, R23 | `server/config/schema.test.ts` |
| R24, R25, R26, R27 | `server/config/load.test.ts` (R23/R27 también) |
| R28, R29 | `project/env-example.test.ts` |
| R30, R31, R32 | `server/app.test.ts` |
| R33 | `server/start.test.ts` |
| R34 | `server/start.int.test.ts` |
| R35 | `project/package-json.test.ts` (script `dev`) + verificación manual de `npm run dev` (ver tabla arriba) |
| R36, R37, R39 | `web/dev-server.int.test.ts` (+ `project/vite-config.test.ts` para `lang="es"`/`#root`/manifest) |
| R38 | `project/vite-config.test.ts` (`strictPort: true`) |
| R40 | `project/pipeline.int.test.ts` (+ `project/package-json.test.ts` para el script `build`) |
| R41, R42 | `web/api/health.test.ts` |
| R43 | `web/components/health-status.test.tsx`, `web/app.test.tsx` |
| R44 | `web/app.test.tsx` |
| R45 | `bash ./init.sh` (ejecutado, exit 0; `npm ci` + `npm test`) |
| R46 | Manual/opcional según spec: `init.sh` no modificado; sus comprobaciones de Node siguen intactas. No se ejecutó sin Node. |

## Ficheros creados / modificados

Creados: `.env.example`, `.gitattributes`, `.npmrc`, `.nvmrc`, `.prettierignore`, `.prettierrc.json`,
`eslint.config.js`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`,
`vitest.config.ts`, `vitest.int.config.ts`, `src/**` (shared, rules, data, server, web), `tests/**`.
Editados: `README.md` (sección "Desarrollo"), `progress/current.md`, `specs/f0-project-skeleton/tasks.md`
(solo marcas `[x]`).
