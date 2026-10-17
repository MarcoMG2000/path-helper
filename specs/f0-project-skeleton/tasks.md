# Tasks — f0-project-skeleton

> Ejecutar en orden. Marcar `[x]` al completar. Cada task lista los `R<n>` que cubre.
> Tras cada bloque, ejecutar los tests afectados. No tocar `feature-list.json` (lo hace el leader).
> Prerrequisito: Node 22 y npm disponibles (design Q2).

## Bloque A — Paquete y herramientas

- [x] **T1.** Crear `.nvmrc` (`22`), `.npmrc` (`save-exact=true`, `engine-strict=true`),
  `.gitattributes` (`*.sh text eol=lf`), `.prettierrc.json` (`printWidth: 100`).
  Cubre: R10, R16, R6, R7.
- [x] **T2.** Crear `package.json` (`name`, `private: true`, `type: module`,
  `engines.node: ">=22"`, scripts del design §3) e instalar dependencias con versiones exactas
  (Q1). Generar y versionar `package-lock.json`; anotar la tabla de versiones en
  `progress/impl_f0-project-skeleton.md`. Cubre: R5, R6, R7, R8, R9, R35.
- [x] **T3.** Crear `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, resto del design §1).
  Cubre: R11, R12, R13.
- [x] **T4.** Crear `vitest.config.ts` y `vitest.int.config.ts` (include/exclude del design §3).
  Cubre: R17, R18.
- [x] **T5.** Crear `eslint.config.js` con `no-console` en `src/**` y `no-restricted-imports`
  por capas (design §6). Cubre: R3, R4, R14, R15.

## Bloque B — Layout y capa compartida

- [x] **T6.** Crear `src/shared/result.ts` + `src/shared/index.ts`; `src/rules/index.ts` y
  `src/data/index.ts` (solo `export {}` con comentario de capa); carpetas
  `tests/{shared,rules,data,server,web}` (con `.gitkeep` donde no haya tests). Cubre: R1, R2.
- [x] **T7.** Tests: `tests/project/layout.test.ts`, `tests/project/package-json.test.ts`,
  `tests/project/tsconfig.test.ts`, `tests/project/vitest-config.test.ts`,
  `tests/project/repo-files.test.ts`, `tests/project/lint-layers.test.ts`,
  `tests/shared/result.test.ts`. Cubre: R1–R12, R15–R18.

## Bloque C — Configuración

- [x] **T8.** Escribir primero `tests/server/config/schema.test.ts` y
  `tests/server/config/load.test.ts` (defectos, tipos numéricos, valores inválidos con nombres
  sin valores, `.env` presente/ausente, precedencia del entorno, `ConfigError`). Cubre: R19–R27.
- [x] **T9.** Implementar `src/server/config/{schema,load,index}.ts` (design §3). Cubre: R19–R27.
- [x] **T10.** Crear `.env.example` (todas las claves del schema con su defecto, comentarios en
  español, nota sobre `HOST=0.0.0.0`) y `tests/project/env-example.test.ts` (claves del ejemplo
  == `ENV_KEYS`, valores == defectos, `.gitignore` ignora `.env` y no `.env.example`).
  Cubre: R28, R29.

## Bloque D — Servidor API

- [x] **T11.** Tests `tests/server/app.test.ts` (`/health` 200 `{status:"ok"}`, 404 JSON,
  nivel de log) y `tests/server/start.test.ts` (entorno inválido rechaza con `ConfigError` y no
  hace `listen`). Cubre: R30, R31, R32, R33.
- [x] **T12.** Implementar `src/server/http/health.ts`, `app.ts`, `compose.ts`, `start.ts`,
  `main.ts`. Cubre: R30–R34.
- [x] **T13.** Test `tests/server/start.int.test.ts` (listen en `PORT=0`, `GET /health` real,
  `close()`). Cubre: R34.

## Bloque E — Cliente web y PWA

- [x] **T14.** Tests unitarios web: `tests/web/api/health.test.ts` (fake `fetch`: 200 válido,
  500, cuerpo inválido, fallo de red), `tests/web/components/health-status.test.tsx` (3 estados),
  `tests/web/app.test.tsx` (nombre de app, `lang`), `tests/project/vite-config.test.ts`
  (`strictPort`, proxy, manifest campos). Cubre: R36, R38, R39, R41–R44.
- [x] **T15.** Implementar `src/web/**` (index.html con `lang="es"`, `main.tsx`, `app.tsx`,
  `api/health.ts`, `hooks/use-health.ts`, `components/health-status.tsx`, `i18n/es.ts`,
  `pwa-manifest.ts`, `public/icon.svg`, `vite-env.d.ts`). Cubre: R36, R39, R41–R44.
- [x] **T16.** Implementar `vite.config.ts` (design §3) y confirmar que `npm run dev:web`
  arranca. Cubre: R36–R40.
- [x] **T17.** Test `tests/web/dev-server.int.test.ts` (Vite `createServer` + API en puerto 0:
  `GET /` HTML con `lang="es"`, `GET /health` vía proxy, `GET /manifest.webmanifest` con campos
  de R39). Cubre: R36, R37, R39.

## Bloque F — Pipeline y cierre

- [x] **T18.** Test `tests/project/pipeline.int.test.ts`: ejecutar `npm run typecheck`,
  `npm run lint` y `npm run build`; comprobar que `dist/web` contiene `index.html`, manifest y
  service worker (usar `execSync` multiplataforma; limpiar `dist` solo si es ignorado por git).
  Cubre: R13, R14, R40.
- [x] **T19.** Editar `README.md`: sección "Desarrollo" con prerrequisitos (Node 22), `npm ci`,
  `npm run dev`, URLs (`http://127.0.0.1:5173` web, `http://127.0.0.1:3000/health` API), copiar
  `.env.example` a `.env`, scripts disponibles. Cubre: R35 (documentación).
- [x] **T20.** Verificar `./init.sh` desde Git Bash: `npm ci` + `npm test` en verde, exit 0.
  Cubre: R8, R45, R46.
- [x] **T21.** Verificación manual final (humano-visible): `npm run dev` en una terminal; abrir la
  web en `http://127.0.0.1:5173` (ver título y "API conectada"), `http://127.0.0.1:3000/health`,
  `http://127.0.0.1:5173/manifest.webmanifest`; parar la API y comprobar el estado de error de
  la UI. Anotar el resultado en `progress/impl_f0-project-skeleton.md`. Cubre: R35, R37, R39.
- [x] **T22.** Ejecutar todo en verde: `npm test`, `npm run test:int`, `npm run lint`,
  `npm run build`. Dejar el repo limpio (sin `console.log`, sin temporales) y actualizar
  `progress/current.md`. Cubre: todos.
