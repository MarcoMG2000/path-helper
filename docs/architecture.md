# Arquitectura

> Qué significa "hacer un buen trabajo" en este proyecto. Léelo antes de
> redactar specs o implementar.

## 1. Objetivo

`path-helper` es una mini-app web/móvil (PWA) para una campaña de **Pathfinder
1ª edición, solo Core Rulebook**. Cada jugador (7) tiene su ficha, inventario y
notas privadas; el GM gestiona enemigos y combate; la app agiliza el combate
calculando iniciativa, ataque y daño a partir de los dados que introducen los
jugadores.

**Prioridad nº1: corrección respecto al manual.** Un cálculo incorrecto es peor
que una función ausente. **No hace:** tirar dados por el jugador (se tiran en
la mesa y se introducen), contenido de expansiones/homebrew, ni un VTT/mapa.

## 2. Stack (decidido)

| Capa            | Elección                                                        |
|-----------------|-----------------------------------------------------------------|
| Lenguaje        | TypeScript estricto, Node 22 LTS                                |
| Framework/API   | Fastify + zod (validación); tiempo real con SSE                 |
| Frontend        | React + Vite, PWA, mobile-first, UI en español                  |
| Almacenamiento  | SQLite (`node:sqlite`, integrado en Node; sin módulos nativos) tras interfaces `*Store`                |
| Dependencias    | Versiones pineadas; solo lo necesario                           |
| Tests           | Vitest, fakes in-memory                                         |
| Despliegue      | Dockerfile + Fly.io (1 máquina + volumen)                       |

## 3. Flujo de datos

```
Jugador/GM (navegador/móvil)
   │  introduce d20 / dados / ediciones
   ▼
 src/web ──HTTP/SSE──▶ src/server ──▶ política de autorización ──▶ *Store (SQLite)
                           │
                           └──▶ src/rules (motor puro) ◀── src/data (SRD Core)
```

El motor de reglas recibe estado + dados y devuelve un **desglose** (cada
número con su fuente y tipo de bonificador). La UI muestra el desglose; nunca
recalcula reglas por su cuenta.

## 4. Componentes y puntos de intercambio (swap points)

Todo componente externo vive **detrás de una interfaz**; las implementaciones se
eligen por configuración en un único punto de composición.

- `UserStore`, `SessionStore`, `CharacterStore`, `NoteStore`, `CombatStore` →
  impl SQLite; fake in-memory en tests.
- `Clock` / `RandomSource` (si hiciera falta) → impl real; fake determinista.
- `RealtimeBus` (publicación de eventos de combate) → impl SSE; fake en tests.
- `RulesDataSource` (datos del SRD) → impl JSON empaquetado; fake en tests.

## 5. Layout del código fuente

```
src/
  shared/    # tipos y schemas zod compartidos cliente/servidor
  rules/     # motor Pathfinder 1e PURO: sin I/O, sin red, sin BD
  data/      # datasets del Core Rulebook (JSON) + schemas + validador
  server/    # http (rutas), auth, authz (políticas), stores, realtime, config
  web/       # cliente React (páginas, componentes, i18n ES)
tests/       # espejo de src/: un fichero de test por módulo
```

### Estructura de `src/web` (f1b) y contrato `AppSection`

```
src/web/
  api/        # cliente HTTP único (Result<T, ApiError>), módulos por dominio (auth, accounts…) y
              # AppServices (inyección de dependencias de la UI; los tests inyectan fakes)
  session/    # SessionProvider (me/login/logout, 401 -> login), canal BroadcastChannel entre pestañas
  shell/      # rutas, guardas (RequireAuth/RequireRole/PublicOnly), layouts, nav, Page, error boundary
  components/ # piezas reutilizables (FormField, PinField, Alert…)
  features/   # una carpeta por feature: pantallas + section.tsx
  i18n/       # es.ts (todos los textos), format.ts, error-message.ts
  styles/     # tokens.css (únicos valores), base/layout/components.css
```

**Añadir una pantalla sin tocar el shell:** crear `src/web/features/<x>/section.tsx` con
`export default defineSection({ id, path, label, roles, order, Component, children?, hidden? })`
(o un array). `loadSections()` (`import.meta.glob`) las descubre, `validateSections` rechaza ids/rutas
duplicados y rutas reservadas (`/`, `/login`, `/legal`, `/api`, `/health`), y el shell crea la ruta con
guarda de sesión y de rol y la entrada de navegación. Orden sugerido: ficha 10, combate 20, compendio 30,
cuentas 50, perfil 90. Los módulos de API nuevos (`createCharacterApi(http)`…) se exponen ampliando
`AppServices`; no se reimplementa el cliente HTTP ni el manejo de 401/429. Las guardas de rol son solo
UX: la autorización real es la del servidor (§6). Textos solo en `es.ts`; colores solo en `tokens.css`.
`src/web` solo importa de `src/shared` y de `src/data/legal` (nunca del barrel `src/data`: arrastraría
los datasets al bundle; lo vigilan `tests/web/hygiene` y `tests/web/bundle.int.test.ts`).

Reglas de dependencia: `rules` y `data` no importan de `server` ni `web`;
`server` y `web` pueden importar de `rules`, `data` y `shared`; `web` nunca
importa de `server`. Un revisor rechaza código que mezcle capas.

## 6. Autorización (crítica)

- Se decide **siempre en el servidor**, en una política central
  (`authz`), nunca solo ocultando cosas en la UI.
- Jugador: lee/escribe solo recursos cuyo `ownerId` es el suyo.
- GM: lee todo **salvo las notas personales de los jugadores** (decisión del humano); escribe lo que el spec de cada feature defina.
- Los eventos SSE se filtran por rol antes de emitirse (el payload de un jugador
  no se envía a otro).
- Todo endpoint nuevo exige un test "jugador A no accede a recurso de B".
- Contrato reutilizable (f1, `src/server/authz`): cada feature declara las reglas de sus tipos de
  recurso (`ResourceKindRule`: `scope` owned/shared, `ownerWrite`, `gmRead`, `gmWrite`) y
  `compose.ts` las une con `mergeKindRules`; todo lo no registrado se deniega. Los handlers
  responden con `authorizeOrDeny` (lo ilegible es 404, indistinguible de "no existe"; 403 solo si
  es legible pero no escribible). Los eventos en tiempo real llevan un recurso y vistas
  `gm`/`owner`/`others`, y la capa SSE (f5) DEBE emitir a cada conexión solo lo que devuelva
  `projectEventFor(policy, actor, event)`. Las rutas bajo `/api` están protegidas por defecto
  (hook global; la lista de rutas públicas vive en `src/server/http/auth-plugin.ts`). Para el
  test "A no accede a B" usa el helper `tests/helpers/ownership-matrix.ts`
  (`describeOwnershipMatrix`). Recomendación de reglas futuras: `character` (owned, GM lee),
  `private_note` (owned, `gmRead=false`), `combat` (shared, vistas por rol).

## 7. Fidelidad a las reglas

- Fuente única de reglas: Core Rulebook (SRD, licencia OGL). Única excepción decidida por el humano: los monstruos del Bestiario para el GM, en un dataset aparte (f3b). Nada de
  Advanced Player's Guide, etc.
- Cada dato de `src/data` lleva `source` (URL SRD) y texto original; cada regla
  de `src/rules` cita en comentario/test la regla del Core que implementa.
- Si una regla es ambigua, el agente **no la inventa**: la anota como pregunta
  abierta en el spec para que decida el humano.

## 8. Política de dependencias

- Versiones **pineadas** (lockfile commiteado).
- Solo lo necesario para la feature en curso (no añadas libs "por si acaso").
- Nada de claves/secretos en el código: van por entorno (`.env`, no commiteado).
