# Requirements — f0-project-skeleton

> Feature: **Project skeleton & configuration system** (`sdd: true`, sin dependencias).
> Notación EARS (ver `docs/specs.md`). Cada `R<n>` es estable y verificable; la
> columna "Verificación" de la tabla final indica el test (unit = `npm test`,
> int = `npm run test:int`, manual = paso explícito en `tasks.md`).
> Las decisiones no cerradas están en `design.md` § "Preguntas abiertas".

## Glosario

- **Config**: objeto tipado resultante de validar el entorno con zod.
- **API**: servidor Fastify (`src/server`). **Web**: cliente React+Vite (`src/web`).
- **Árbol limpio**: working tree sin cambios locales respecto al commit del spec.

## Estructura del repositorio

- **R1.** El sistema DEBE contener los directorios `src/shared`, `src/rules`,
  `src/data`, `src/server` y `src/web`, cada uno con al menos un fichero versionado.
- **R2.** El sistema DEBE contener los directorios `tests/shared`, `tests/rules`,
  `tests/data`, `tests/server` y `tests/web`, cada uno con al menos un fichero versionado.
- **R3.** SI un fichero de `src/rules` o `src/data` importa de `src/server` o de `src/web`,
  ENTONCES `npm run lint` DEBE fallar con un error de import restringido.
- **R4.** SI un fichero de `src/web` importa de `src/server`, ENTONCES `npm run lint`
  DEBE fallar con un error de import restringido.

## Paquete, scripts y dependencias

- **R5.** El `package.json` DEBE declarar los scripts `dev`, `build`, `test`, `test:int`,
  `lint` y `typecheck`.
- **R6.** El `package.json` DEBE declarar `engines.node` igual a `>=22`.
- **R7.** El `package.json` DEBE declarar todas las `dependencies` y `devDependencies`
  con versiones exactas (sin `^`, `~`, rangos, `*`, `latest` ni etiquetas).
- **R8.** El repositorio DEBE incluir `package-lock.json` versionado (no ignorado por git).
- **R9.** El sistema DEBE definir todos los scripts de `package.json` sin sintaxis
  específica de un shell (sin asignaciones `VAR=valor`, `export`, `rm`, `cp`, `$VAR`
  ni comillas simples), de modo que se ejecuten igual en Windows 11, macOS y Linux.
- **R10.** El repositorio DEBE incluir un `.gitattributes` que fuerce finales de línea LF
  para `*.sh`.

## TypeScript y herramientas de calidad

- **R11.** El `tsconfig.json` DEBE habilitar `strict: true`.
- **R12.** El `tsconfig.json` DEBE habilitar `noUncheckedIndexedAccess: true`.
- **R13.** CUANDO se ejecuta `npm run typecheck` sobre un árbol limpio, el sistema DEBE
  comprobar los tipos de `src`, `tests` y de los ficheros de configuración TypeScript y
  terminar con código 0.
- **R14.** CUANDO se ejecuta `npm run lint` sobre un árbol limpio, el sistema DEBE ejecutar
  ESLint sobre `src`, `tests` y los ficheros de configuración y terminar con código 0.
- **R15.** SI un fichero de `src` contiene una llamada `console.*`, ENTONCES
  `npm run lint` DEBE fallar.
- **R16.** El repositorio DEBE incluir una configuración de Prettier con `printWidth` igual a 100.

## Tests

- **R17.** CUANDO se ejecuta `npm test`, el sistema DEBE ejecutar con Vitest todos los
  ficheros `tests/**/*.test.{ts,tsx}` excluyendo los `*.int.test.{ts,tsx}`.
- **R18.** CUANDO se ejecuta `npm run test:int`, el sistema DEBE ejecutar con Vitest
  únicamente los ficheros `tests/**/*.int.test.{ts,tsx}`.

## Configuración (entorno + `.env`, validada con zod)

- **R19.** El sistema DEBE definir en `src/server/config` un schema zod con las variables
  `NODE_ENV` (`development`|`test`|`production`, defecto `development`), `HOST` (defecto
  `127.0.0.1`), `PORT` (entero 0–65535, defecto `3000`), `WEB_PORT` (entero 1–65535, defecto
  `5173`) y `LOG_LEVEL` (`fatal`|`error`|`warn`|`info`|`debug`|`trace`|`silent`, defecto `info`).
- **R20.** CUANDO `parseConfig` recibe un entorno válido, el sistema DEBE devolver un
  resultado `ok` con un `Config` tipado en el que `PORT` y `WEB_PORT` son números.
- **R21.** CUANDO `parseConfig` recibe un entorno sin alguna variable del schema, el sistema
  DEBE aplicar el valor por defecto de esa variable.
- **R22.** SI `parseConfig` recibe una variable con valor inválido (p. ej. `PORT=abc`,
  `PORT=70000`, `LOG_LEVEL=verbose`), ENTONCES el sistema DEBE devolver un resultado `err`
  que lista el nombre de cada variable inválida.
- **R23.** SI `parseConfig` devuelve `err`, ENTONCES los mensajes del error NO DEBEN contener
  los valores recibidos de las variables.
- **R24.** CUANDO existe un fichero `.env` en la ruta indicada, `loadConfig` DEBE incorporar
  sus variables al entorno que valida.
- **R25.** CUANDO una variable está definida a la vez en el entorno del proceso y en `.env`,
  `loadConfig` DEBE usar el valor del entorno del proceso.
- **R26.** CUANDO no existe fichero `.env`, `loadConfig` DEBE validar solo el entorno del
  proceso sin lanzar error por la ausencia del fichero.
- **R27.** SI el entorno resultante es inválido, ENTONCES `loadConfig` DEBE lanzar un
  `ConfigError` cuyo mensaje nombra las variables inválidas.
- **R28.** El repositorio DEBE incluir un `.env.example` que contenga exactamente las claves
  del schema de configuración, cada una con su valor por defecto.
- **R29.** El `.gitignore` DEBE ignorar `.env` y NO DEBE ignorar `.env.example`.

## Servidor API (Fastify)

- **R30.** CUANDO se recibe `GET /health`, el servidor DEBE responder 200 con cuerpo JSON
  `{"status":"ok"}`.
- **R31.** CUANDO `composeApp(config)` crea la aplicación, el sistema DEBE configurar el
  logger de Fastify con el nivel `config.LOG_LEVEL`.
- **R32.** CUANDO se recibe una petición a una ruta no registrada, el servidor DEBE responder 404
  con cuerpo JSON.
- **R33.** SI `start` recibe un entorno inválido, ENTONCES el sistema DEBE rechazar con
  `ConfigError` sin abrir ningún puerto.
- **R34.** CUANDO `start` recibe un entorno válido, el sistema DEBE escuchar en
  `HOST:PORT` y responder `GET /health` con 200 a través de la red.

## Cliente Web (React + Vite + PWA)

- **R35.** CUANDO se ejecuta `npm run dev`, el sistema DEBE arrancar con ese único comando
  el servidor API y el servidor de desarrollo de Vite.
- **R36.** CUANDO el servidor de desarrollo de Vite está en marcha, una petición `GET /` a
  `HOST:WEB_PORT` DEBE devolver el HTML de la aplicación con `<html lang="es">` y un
  contenedor de montaje de React.
- **R37.** CUANDO el servidor de desarrollo de Vite y la API están en marcha, una petición
  `GET /health` a `HOST:WEB_PORT` DEBE devolver la misma respuesta que `GET /health` de la API.
- **R38.** SI el puerto `WEB_PORT` está ocupado, ENTONCES el servidor de desarrollo de Vite DEBE
  terminar con error en lugar de elegir otro puerto.
- **R39.** CUANDO se solicita `/manifest.webmanifest` al servidor de desarrollo de Vite, el
  sistema DEBE devolver un Web App Manifest con `name`, `short_name`, `lang` igual a `es`,
  `start_url`, `display` igual a `standalone`, `theme_color`, `background_color` e `icons`
  no vacío.
- **R40.** CUANDO se ejecuta `npm run build` sobre un árbol limpio, el sistema DEBE comprobar
  los tipos (R13) y generar en `dist/web` el HTML de la app, el manifest y un service worker,
  terminando con código 0.
- **R41.** CUANDO `fetchHealth` recibe una respuesta HTTP 200 con cuerpo `{"status":"ok"}`,
  el sistema DEBE devolver un resultado `ok`.
- **R42.** SI `fetchHealth` recibe una respuesta no 200, un cuerpo no válido o un fallo de red,
  ENTONCES el sistema DEBE devolver un resultado `err` sin lanzar excepción.
- **R43.** MIENTRAS el estado de la API es `loading`, `ok` o `error`, la vista de estado DEBE
  mostrar respectivamente el texto español correspondiente definido en `src/web/i18n/es.ts`.
- **R44.** CUANDO se renderiza `App`, el sistema DEBE mostrar el nombre de la aplicación
  tomado de `src/web/i18n/es.ts`.

## Entorno y arranque de sesión

- **R45.** CUANDO existe `package.json` y se ejecuta `./init.sh` en un entorno con Node >= 22,
  el sistema DEBE ejecutar `npm ci` y `npm test` y terminar con código 0 si ambos pasan.
- **R46.** SI Node es menor que 22 o no está instalado, ENTONCES `./init.sh` DEBE terminar con
  código distinto de 0 y un mensaje claro (comportamiento ya implementado en `init.sh`; el
  skeleton NO debe romperlo).

## Cobertura del `acceptance` original

| Criterio de `feature-list.json` | Requisitos |
|---|---|
| Layout `src/` (rules, data, server, web, shared) existe | R1, R2, R3, R4 |
| Configuración desde entorno + ficheros | R19–R29, R33 |
| `init.sh` instala (`npm ci`), compila y corre tests en verde | R8, R13, R17, R40, R45, R46 |
| Servidor de desarrollo local (`npm run dev`) sirve la app en localhost | R30, R34–R39, R43, R44 |
| (añadido por el leader) scripts, TS strict, Vitest, lint, versiones pineadas, multiplataforma | R5–R7, R9–R12, R14–R18 |

## Tabla de verificación

| R | Tipo | Test / paso (ruta bajo `tests/`) |
|---|---|---|
| R1, R2 | unit | `project/layout.test.ts` |
| R3, R4 | unit | `project/lint-layers.test.ts` (API `ESLint.lintText` con `filePath` simulado) |
| R5, R6, R7, R8, R9, R35 (script) | unit | `project/package-json.test.ts` |
| R10 | unit | `project/repo-files.test.ts` |
| R11, R12 | unit | `project/tsconfig.test.ts` |
| R13, R14, R40, R45 | int | `project/pipeline.int.test.ts` (spawnea `npm run typecheck`, `lint`, `build`) y paso manual `./init.sh` |
| R15 | unit | `project/lint-layers.test.ts` (`console.log` en `src/server/x.ts`) |
| R16 | unit | `project/repo-files.test.ts` |
| R17, R18 | unit | `project/vitest-config.test.ts` |
| R19–R23 | unit | `server/config/schema.test.ts` |
| R24–R27 | unit | `server/config/load.test.ts` (directorio temporal) |
| R28, R29 | unit | `project/env-example.test.ts` |
| R30, R31, R32 | unit | `server/app.test.ts` (`app.inject`) |
| R33 | unit | `server/start.test.ts` |
| R34 | int | `server/start.int.test.ts` (puerto 0) |
| R35 (efecto real) | manual | `tasks.md` T-final: `npm run dev` y abrir URLs |
| R36, R37, R39 | int | `web/dev-server.int.test.ts` (Vite `createServer` + API real en puerto 0) |
| R38 | unit | `project/vite-config.test.ts` (`strictPort: true`) |
| R41, R42 | unit | `web/api/health.test.ts` (fake `fetch`) |
| R43, R44 | unit | `web/components/health-status.test.tsx`, `web/app.test.tsx` (`renderToString`) |
| R46 | manual | `tasks.md`: `./init.sh` sin Node (opcional) |
