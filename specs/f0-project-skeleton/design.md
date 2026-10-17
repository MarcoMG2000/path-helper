# Design — f0-project-skeleton

> Respeta `docs/architecture.md` (stack, capas, swap points) y `docs/conventions.md`.
> Solo se añade lo necesario para esta feature: ninguna dependencia "por si acaso".
> Sin SQLite, sin auth, sin SSE: eso llega en features posteriores.

## 1. Decisiones generales

- **Un único paquete npm** (sin workspaces), `"type": "module"`, Node 22.
- **Imports relativos** (sin alias de paths): un solo mecanismo de resolución que funciona igual
  en `tsc`, Vite, Vitest y `tsx`. Los imports relativos usan especificadores **sin extensión**
  (`moduleResolution: "Bundler"`).
- **Un solo `tsconfig.json`** (`strict`, `noUncheckedIndexedAccess`, `noEmit`, `jsx: react-jsx`,
  `lib: ES2023 + DOM + DOM.Iterable`, `module: ESNext`, `moduleResolution: Bundler`,
  `types: ["node", "vite/client"]`). La separación de capas se garantiza con ESLint (§6), no
  con proyectos TS separados.
- **`build` = typecheck + `vite build`**. No se emite JS del servidor en esta feature: en
  desarrollo corre con `tsx`; el empaquetado de producción lo decide f9 (ver Preguntas abiertas).
- **Puerto/host**: la API escucha en `HOST:PORT` (defecto `127.0.0.1:3000`); Vite en
  `HOST:WEB_PORT` (defecto `127.0.0.1:5173`) con `strictPort: true`. Vite hace proxy de `/health`
  y `/api` a `http://127.0.0.1:<PORT>`. La app web siempre llama a rutas relativas (mismo origen).

## 2. Árbol de ficheros a crear

```
.env.example
.gitattributes                 # *.sh text eol=lf
.npmrc                         # save-exact=true, engine-strict=true
.nvmrc                         # 22
.prettierrc.json               # printWidth 100
eslint.config.js
package.json / package-lock.json
tsconfig.json
vite.config.ts
vitest.config.ts               # unit: tests/**/*.test.{ts,tsx}, excluye *.int.test.*
vitest.int.config.ts           # int: solo tests/**/*.int.test.{ts,tsx}
README.md                      # (editar) sección "Desarrollo": npm run dev + URLs
src/
  shared/
    index.ts                   # re-export
    result.ts                  # Result<T,E>, ok(), err()
  rules/index.ts               # solo `export {}` + comentario de capa (pura, sin I/O)
  data/index.ts                # solo `export {}` + comentario de capa
  server/
    config/
      schema.ts                # configSchema (zod), tipo Config, ENV_KEYS
      load.ts                  # parseConfig, loadConfig, ConfigError
      index.ts                 # re-export
    http/health.ts             # plugin Fastify: GET /health
    app.ts                     # buildApp(config): FastifyInstance
    compose.ts                 # composeApp(config): único punto de composición
    start.ts                   # start(env?, opts?): Promise<RunningServer>
    main.ts                    # entry: llama a start(); error fatal -> stderr + exit 1
  web/
    index.html                 # <html lang="es">, <div id="root">, <script type="module" src="/main.tsx">
    main.tsx                   # createRoot(...).render(<App />)
    app.tsx                    # App: título + <HealthStatus/>, usa useHealth
    api/health.ts              # fetchHealth(fetchFn?)
    hooks/use-health.ts        # estado loading|ok|error usando fetchHealth
    components/health-status.tsx   # presentacional: recibe state
    i18n/es.ts                 # textos ES
    pwa-manifest.ts            # objeto manifest exportado
    public/icon.svg            # icono placeholder
    vite-env.d.ts
tests/                         # ver §7
```

## 3. Interfaces y firmas

### `src/shared/result.ts`

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const ok: <T>(value: T) => Result<T, never>;
export const err: <E>(error: E) => Result<never, E>;
```

### `src/server/config/schema.ts`

```ts
export const configSchema: z.ZodObject<...>; // coerce a número para PORT y WEB_PORT
export type Config = z.infer<typeof configSchema>;
export const ENV_KEYS: readonly (keyof Config)[]; // derivado de configSchema.shape
```

Defectos: `NODE_ENV=development`, `HOST=127.0.0.1`, `PORT=3000`, `WEB_PORT=5173`, `LOG_LEVEL=info`.
`PORT` admite 0 (puerto efímero para tests); `WEB_PORT` 1–65535. Vacío (`PORT=`) se trata
como inválido (no como ausente).

### `src/server/config/load.ts`

```ts
export interface ConfigIssue { variable: string; message: string } // message SIN el valor recibido
export function parseConfig(env: Record<string, string | undefined>): Result<Config, ConfigIssue[]>;

export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];
}

export interface LoadConfigOptions {
  env?: Record<string, string | undefined>; // defecto: process.env
  envFile?: string;                         // defecto: ".env" en process.cwd()
}
export function loadConfig(opts?: LoadConfigOptions): Config; // lanza ConfigError
```

`loadConfig`: si `existsSync(envFile)`, lee el fichero con `util.parseEnv` (Node 22, sin
dependencia `dotenv`), y fusiona `{ ...fileVars, ...env }` (el entorno del proceso gana, R25).
No muta `process.env`. Si no existe el fichero, usa solo `env` (R26). Llama a `parseConfig`;
si `err`, lanza `ConfigError` con mensaje `Configuración inválida: PORT, LOG_LEVEL` (solo nombres
y la regla incumplida, nunca valores, R23/R27). Un `.env` ilegible (error de I/O distinto de
ausente) se propaga como excepción de infraestructura sin enmascarar.

### `src/server/http/health.ts`

```ts
export const healthRoutes: FastifyPluginAsync; // GET /health -> 200 { status: "ok" }
```

### `src/server/app.ts` y `compose.ts`

```ts
export function buildApp(config: Pick<Config, "LOG_LEVEL">): FastifyInstance; // logger pino de Fastify, registra rutas
export function composeApp(config: Config): FastifyInstance;                   // hoy delega en buildApp
```

`compose.ts` es el **único punto de composición** (convención): aquí se instanciarán las
implementaciones de `*Store`, `Clock`, etc. en features posteriores. Hoy solo crea la app.

### `src/server/start.ts` y `main.ts`

```ts
export interface RunningServer { app: FastifyInstance; address: string; close(): Promise<void> }
export function start(env?: Record<string, string | undefined>, opts?: { envFile?: string }): Promise<RunningServer>;
```

`start` llama a `loadConfig` (lanza `ConfigError` antes de abrir puerto, R33), `composeApp`, y
`app.listen({ host, port })`. `main.ts` hace `start()`; en error escribe el mensaje con
`process.stderr.write` (no existe aún el logger, y `console.*` está prohibido) y fija
`process.exitCode = 1`. Los errores de `listen` (p. ej. `EADDRINUSE`) se propagan igual.

### `src/web`

```ts
// api/health.ts
export type HealthError = "network" | "bad-status" | "bad-body";
export function fetchHealth(fetchFn?: typeof fetch): Promise<Result<{ status: "ok" }, HealthError>>;
// El cuerpo se valida con un schema zod (src/shared o local) — zod ya es dependencia.

// hooks/use-health.ts
export type HealthState = "loading" | "ok" | "error";
export function useHealth(): HealthState;

// components/health-status.tsx
export function HealthStatus(props: { state: HealthState }): JSX.Element;

// i18n/es.ts
export const es: { appName: string; health: { loading: string; ok: string; error: string } };

// pwa-manifest.ts  (consumido por vite.config.ts y por tests)
export const pwaManifest: ManifestOptions; // name "Path Helper", short_name, lang "es", ...
```

`fetchHealth` no lanza: captura el fallo de red y mapea a `err("network")`. `App` renderiza
título (`es.appName`) y `<HealthStatus state={useHealth()} />`. La UI no calcula reglas.

### `vite.config.ts` (fichero de herramienta, fuera de `src/web`)

- `root: "src/web"`, `publicDir: "src/web/public"` (relativo al root del repo: usar `resolve`),
  `build.outDir: "<repo>/dist/web"`, `emptyOutDir: true`.
- `server: { host: config.HOST, port: config.WEB_PORT, strictPort: true, proxy: { "/health": t, "/api": t } }`
  con `t = http://127.0.0.1:${config.PORT}`. `config` sale de `loadConfig()` (única fuente de
  verdad de puertos; evita defaults duplicados). Esto es tooling, no código de `src/web`, por lo
  que no viola "web no importa de server".
- Plugins: `@vitejs/plugin-react`, `vite-plugin-pwa` con `registerType: "autoUpdate"`,
  `manifest: pwaManifest`, `devOptions: { enabled: true }` (sirve `/manifest.webmanifest`
  en dev, R39) y `workbox.globPatterns` por defecto (SW en `dist/web`, R40).

### Scripts de `package.json`

| Script | Comando |
|---|---|
| `dev` | `concurrently --kill-others-on-fail --names api,web "npm:dev:server" "npm:dev:web"` |
| `dev:server` | `tsx watch src/server/main.ts` |
| `dev:web` | `vite` |
| `build` | `npm run typecheck && vite build` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |
| `test:int` | `vitest run --config vitest.int.config.ts` |
| `lint` | `eslint .` |
| `format` | `prettier --write .` |

Todo sin sintaxis de shell (R9). `vite` y `tsx` se ejecutan vía binarios de `node_modules/.bin`
que npm resuelve igual en Windows.

### Dependencias (todas exactas; versión concreta fijada por el implementer, ver Q1)

- dependencies: `fastify`, `zod`, `react`, `react-dom`.
- devDependencies: `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `vite`,
  `@vitejs/plugin-react`, `vite-plugin-pwa`, `vitest`, `tsx`, `concurrently`, `eslint`,
  `@eslint/js`, `typescript-eslint`, `eslint-config-prettier`, `prettier`.
- Sin `dotenv` (se usa `util.parseEnv` de Node), sin `@fastify/cors` (el proxy de Vite evita
  CORS), sin `@fastify/static` (producción es f9), sin jsdom/testing-library (la UI se
  testea con `react-dom/server`).

## 4. Excepciones y manejo de errores

- Configuración inválida: **excepción** `ConfigError` en `loadConfig`/`start` (fallo de arranque,
  no flujo de control); `parseConfig` y `fetchHealth` devuelven `Result` (resultado esperado).
- Puerto ocupado / `.env` ilegible: excepciones de infraestructura propagadas sin enmascarar.
- Rutas desconocidas: 404 JSON por defecto de Fastify (R32).

## 5. PWA

- Manifest: `name "Path Helper"`, `short_name "PathHelper"`, `lang "es"`, `start_url "/"`,
  `display "standalone"`, `theme_color` y `background_color` fijos en `pwa-manifest.ts`,
  `icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]`.
- Los nombres del manifest son literales en `pwa-manifest.ts` (vive fuera de componentes); el
  título visible en la UI sale de `i18n/es.ts`.
- Sin estrategia offline más allá del precache por defecto de Workbox (f4+ decidirá).

## 6. Lint y capas

`eslint.config.js` (flat config): `@eslint/js` recommended + `typescript-eslint` recommended
(type-aware solo si no ralentiza) + `eslint-config-prettier`. Reglas:

- `no-console: error` en `src/**` (R15).
- `no-restricted-imports` por bloques `files`:
  - `src/rules/**`, `src/data/**`: patrones `**/server/**`, `**/web/**` (R3).
  - `src/web/**`: patrón `**/server/**` (R4).
- Ignora `dist`, `node_modules`, `coverage`.

El test `lint-layers` usa `new ESLint({ cwd })` + `lintText(código, { filePath })` con rutas
simuladas (no escribe en el repo).

## 7. Tests (espejo de `src/`)

```
tests/shared/result.test.ts
tests/server/config/schema.test.ts
tests/server/config/load.test.ts          # tmpdir con fs.mkdtemp
tests/server/app.test.ts                  # app.inject
tests/server/start.test.ts                # ConfigError sin listen (fake env)
tests/server/start.int.test.ts            # listen en PORT=0
tests/web/api/health.test.ts              # fake fetch
tests/web/components/health-status.test.tsx
tests/web/app.test.tsx                    # renderToString; useHealth stub o estado inicial "loading"
tests/web/dev-server.int.test.ts          # vite.createServer + API en puerto 0
tests/rules/.gitkeep, tests/data/.gitkeep # capas sin módulos aún
tests/project/*.test.ts                   # meta-tests del repo (no hay módulo src equivalente):
  layout, package-json, tsconfig, vitest-config, vite-config, repo-files, env-example,
  lint-layers
tests/project/pipeline.int.test.ts        # typecheck + lint + build vía child_process
```

Fakes/dobles: `fetch` inyectado, objetos `env` literales, directorios temporales. No se usa red
ni BD en unit tests; `*.int.test.ts` abren sockets locales en puertos efímeros (`PORT=0`). Los
tests de Vite en dev (`dev-server.int`) fijan `WEB_PORT` a un puerto libre obtenido en el test.

`useHealth` no se prueba con efectos reales en unit; `App` se renderiza con `renderToString`
(los efectos no corren en SSR, estado `loading`), y `HealthStatus` se prueba en los tres estados.

## 8. Alternativas descartadas

- **Vite en modo middleware dentro de Fastify** (un solo proceso/puerto): descartado — acopla
  el servidor de dev al API, complica `tsx watch` (cada reinicio recrea Vite) y no replica el
  despliegue real. `concurrently` + proxy es más simple y robusto.
- **npm workspaces / monorepo**: descartado — arquitectura prevé un solo layout `src/`; añadiría
  complejidad (tsconfig por paquete, hoisting) sin beneficio.
- **`dotenv`**: descartado — Node 22 trae `util.parseEnv`/`process.loadEnvFile`; menos
  dependencias (política de dependencias §8). Se prefiere `parseEnv` porque no muta `process.env`
  y es testeable.
- **Alias de paths (`@shared/...`)**: descartado — habría que mantener cuatro configuraciones
  sincronizadas (tsc, Vite, Vitest, tsx).
- **`jsdom` + Testing Library para la UI**: descartado ahora — añade tres dependencias para
  probar un componente trivial; se reevalúa en f4 cuando haya interacción real.
- **`tsc` emitiendo JS del servidor para `npm start`**: descartado en f0 — exigiría extensiones
  `.js` en imports (NodeNext) incompatibles con la resolución Bundler que compartimos con Vite.
  Se resuelve en f9 (p. ej. bundling con esbuild).

## Preguntas abiertas

Cada una con la recomendación por defecto que seguirá el implementer si el humano no dice lo
contrario.

1. **Q1 — Versiones exactas.** No se fijan números en el spec: el entorno del spec_author no
   tiene Node/npm y no pudo consultar el registro. *Recomendación:* el implementer fija, con
   `npm view <pkg> version` el día de la implementación, la última versión **estable** de cada
   paquete compatible con Node 22 (Fastify 5.x, React 19.x, Vite, Vitest, TypeScript 5.x, zod
   en su mayor estable actual), las guarda exactas (`.npmrc save-exact=true`) y registra la tabla
   resultante en `progress/impl_f0-project-skeleton.md`. Subidas de mayor posteriores = otra
   tarea.
2. **Q2 — Node 22 en el entorno.** En las shells del agente (bash y PowerShell) `node`/`npm` no
   están en el PATH. *Recomendación:* el humano instala Node 22 LTS (o `fnm`/`nvm-windows` con
   `.nvmrc`) antes de aprobar el paso a `in_progress`; si no, el implementer queda bloqueado en
   el primer comando. Como `init.sh` usa bash, en Windows se ejecuta desde Git Bash.
3. **Q3 — Iconos PWA.** Android/Chrome suele exigir PNG 192/512 para el prompt de instalación;
   un SVG con `sizes: "any"` basta para ver el manifest y para esta feature. *Recomendación:*
   `icon.svg` placeholder ahora; PNG reales (y `purpose: maskable`) en una feature posterior o
   antes de f9, cuando el humano proporcione/apruebe el diseño del icono.
4. **Q4 — Service worker en desarrollo.** `devOptions.enabled: true` expone el manifest en dev
   (necesario para R39) pero también registra un SW que puede cachear y confundir al recargar.
   *Recomendación:* mantenerlo activado con `registerType: "autoUpdate"`; si da problemas, se
   cambia a servir solo el manifest en dev y el SW solo en build.
5. **Q5 — Servir el web desde Fastify en producción y bundle del servidor.** Fuera de f0.
   *Recomendación:* diferir a f9 (`@fastify/static`, bundling con esbuild, `npm start`).
6. **Q6 — `localhost` vs `127.0.0.1` en Windows.** `localhost` puede resolver a `::1` y la API
   escuchar solo en IPv4. *Recomendación:* `HOST=127.0.0.1` por defecto para API y Vite, y el
   README indica `http://127.0.0.1:5173` (en Chrome `localhost` suele funcionar también por
   fallback). Para probar desde el móvil en la LAN, poner `HOST=0.0.0.0` en `.env` (documentado
   en `.env.example` como comentario).
7. **Q7 — Capa `shared`.** La arquitectura no dice si `shared` puede importar de otras capas.
   *Recomendación:* tratarla como hoja (no importa de `rules`, `data`, `server`, `web`) y añadir
   esa regla de lint cuando el humano lo confirme; no está en los requisitos de f0.
8. **Q8 — Rutas de la API.** `/health` va en la raíz; el resto de endpoints de producto irán bajo
   `/api`. *Recomendación:* adoptar esa convención ya (el proxy de Vite cubre ambos prefijos);
   si el humano prefiere todo bajo `/api`, `/health` se mueve a `/api/health` y R30/R37 cambian.
