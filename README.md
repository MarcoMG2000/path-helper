# path-helper

Arnés (template) de **desarrollo multi-agente con Spec Driven Development** para
Claude Code. Plantilla **agnóstica del stack**: clónala, rellena los
placeholders `<...>` con las decisiones de tu proyecto y empieza a trabajar.

No contiene código de aplicación — solo el andamiaje que coordina a los agentes
y obliga a un flujo verificable.

## Qué incluye

```
.
├── CLAUDE.md                 # Carga al inicio: el agente actúa como "leader"
├── AGENTS.md                 # Mapa de navegación para cualquier agente de IA
├── CHECKPOINTS.md            # Criterios objetivos de "estado final correcto"
├── feature-list.json         # Roadmap con estados (pending → ... → done)
├── init.sh                   # Prepara entorno + corre tests; debe salir 0
├── .claude/
│   ├── settings.json         # Hooks de verificación (los ejecuta el harness)
│   └── agents/               # Subagentes: leader, spec_author, implementer, reviewer
├── docs/
│   ├── architecture.md       # Qué es "hacer un buen trabajo" aquí
│   ├── conventions.md        # Estilo, nombres, estructura
│   ├── specs.md              # Proceso SDD + notación EARS
│   └── verification.md       # Cómo verificar antes de declarar `done`
├── progress/
│   ├── current.md            # Estado de la sesión actual
│   └── history.md            # Bitácora append-only
└── specs/                    # specs/<feature>/{requirements,design,tasks}.md
```

## El flujo (SDD)

```
pending → [spec_author] → spec_ready → ⏸ HUMANO APRUEBA → in_progress → [implementer → reviewer] → done
```

- **leader** — orquesta; descompone y lanza subagentes, nunca implementa.
- **spec_author** — escribe el spec (requirements EARS / design / tasks) y para.
- **implementer** — implementa una feature aprobada, con tests.
- **reviewer** — valida trazabilidad `R<n>` ↔ test y aprueba o rechaza.

La **puerta de aprobación humana** entre `spec_ready` e `in_progress` es
obligatoria: no se escribe código hasta que un humano lee y aprueba el spec.

## Cómo empezar

1. Clona este repo como base de tu proyecto.
2. Rellena los placeholders `<...>` en `docs/`, `feature-list.json` e `init.sh`
   con tu stack real (lenguaje, framework, comando de tests…).
3. Define `TEST_CMD` en `init.sh` (o expórtalo) con el comando de tests.
4. Añade tus features a `feature-list.json` con `"sdd": true`.
5. Abre Claude Code y pídele: «implementa la siguiente feature pendiente».

## Desarrollo

`path-helper` es una app web/móvil (PWA) para una campaña de Pathfinder 1e (Core Rulebook):
API Fastify + cliente React/Vite, TypeScript estricto.

**Prerrequisitos:** Node >= 22.13 (`node:sqlite` sin flag; ver `.nvmrc`) y npm. En Windows, ejecuta `init.sh` desde Git Bash.

```bash
npm ci                      # instala las dependencias (versiones exactas, package-lock.json)
cp .env.example .env        # opcional: ajusta puertos/host/log (.env no se versiona)
npm run dev                 # arranca API y web con un único comando
```

| Servicio | URL por defecto                      |
| -------- | ------------------------------------ |
| Web      | http://127.0.0.1:5173                |
| API      | http://127.0.0.1:3000/health         |
| Manifest | http://127.0.0.1:5173/manifest.webmanifest |

Para probar desde el móvil en la red local, pon `HOST=0.0.0.0` en `.env`. Si `WEB_PORT` está
ocupado, Vite falla en lugar de elegir otro puerto.

Scripts disponibles:

| Script               | Qué hace                                                          |
| -------------------- | ----------------------------------------------------------------- |
| `npm run dev`        | API (`tsx watch`) + Vite en paralelo (`dev:server` y `dev:web`)   |
| `npm run build`      | `typecheck` + `vite build` (salida en `dist/web`, con PWA)        |
| `npm test`           | Tests unitarios (Vitest), sin los `*.int.test.*`                  |
| `npm run test:int`   | Solo los tests de integración (sockets locales, build, Vite)      |
| `npm run lint`       | ESLint (incluye reglas de capas y `no-console`)                   |
| `npm run typecheck`  | `tsc --noEmit`                                                    |
| `npm run format`     | Prettier                                                          |

### Operación: cuentas de GM

Estos comandos usan la base de datos de `DATABASE_PATH` y la configuración de `.env` (`AUTH_PEPPER` y `AUTH_ALLOWED_ORIGINS` son obligatorias):

| Comando | Qué hace |
| ------- | -------- |
| `npm run create-gm -- "<nombre>"` | Crea la primera (y única) cuenta de GM; el PIN se lee de `AUTH_BOOTSTRAP_PIN` o por stdin. |
| `npm run reset-gm-lock` | Recuperación: desbloquea la cuenta de GM si un tercero la bloqueó con intentos de login fallidos (borra su estado de bloqueo; no cambia el PIN). Falla con un mensaje claro si no hay ninguna cuenta de GM. |

En producción (`NODE_ENV=production`) el servidor rechaza un `AUTH_PEPPER` que contenga `change-me`: genera un secreto aleatorio propio.

### Interfaz web: primer uso (f1b)

1. `cp .env.example .env` y pon un `AUTH_PEPPER` propio (mínimo 32 caracteres; en desarrollo vale el marcador, en producción no). Deja `AUTH_COOKIE_SECURE=false` mientras uses http.
2. Crea el primer GM (no hay pantalla de registro): `npm run create-gm -- "Gandalf"` (pide el PIN, 4-8 dígitos).
3. `npm run dev` y abre **http://localhost:5173** (o http://127.0.0.1:5173). La web se sirve en el origen que DEBE figurar en `AUTH_ALLOWED_ORIGINS` (protección CSRF por `Origin`; los dos anteriores ya están en `.env.example`).
4. Entra con el GM, ve a **Cuentas** y crea a los jugadores (nombre + PIN inicial). Cada jugador puede cambiar su PIN y cerrar sesión en **Mi perfil**. Si un jugador olvida su PIN, el GM lo restablece desde su fila; si lo bloquean los intentos fallidos, pulsa **Desbloquear**.

**Probar desde el móvil por la red local:** pon `HOST=0.0.0.0` en `.env`, añade `http://<ip-de-tu-pc>:5173` a `AUTH_ALLOWED_ORIGINS` (si no, los envíos del login reciben `bad_origin`) y reinicia `npm run dev`. Con `HOST=0.0.0.0` el servidor de desarrollo queda accesible a toda la red local: usa un `AUTH_PEPPER` propio (no el marcador de `.env.example`) y solo en una red de confianza. Vite sirve únicamente `src/web`, `src/shared` y `src/data/legal` (`server.fs` estricto; ni la BD, ni `.env`, ni `specs/` ni `package.json` por `/@fs/...`; ver R88).

El **aviso legal** (OGL 1.0a, Section 15 y aviso de proyecto no oficial) es público en `/legal` y se enlaza desde el pie de todas las pantallas.

**Pendiente para f9 (despliegue):** hoy el servidor solo expone `/api` y `/health`; en producción alguien debe servir `dist/web` con *fallback* a `index.html` para las rutas del cliente (`/legal`, `/perfil`, `/cuentas`…) y `AUTH_ALLOWED_ORIGINS` debe contener el origen real de la app. El service worker ya no intercepta `/api` ni `/health` (`NAVIGATE_FALLBACK_DENYLIST` en `src/web/pwa-manifest.ts`).

## Origen

Plantilla genérica extraída de un proyecto real, con toda la información
específica del proyecto eliminada.
