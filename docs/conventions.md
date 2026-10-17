# Convenciones

> Reglas de estilo, nombres y estructura. Léelo antes de escribir código.

## Lenguaje y estilo

- TypeScript `strict` (sin `any` implícito), módulos ES, Node 22 LTS.
- Formato y linting: Prettier + ESLint (line length 100).
- Comentarios breves donde el "por qué" no es obvio; no narres el "qué". En
  `src/rules`, cita la regla del Core que implementa (p. ej. `// CRB: Power Attack`).
- Nada de `console.log` de debug: usa el logger del servidor (`pino` vía Fastify).
- Identificadores de código en inglés; textos de UI en español (en ficheros i18n,
  no hardcodeados en componentes).

## Nombres

- Ficheros `kebab-case.ts`; tipos/clases `PascalCase`; funciones/variables `camelCase`;
  constantes `UPPER_SNAKE_CASE`.
- Las **interfaces** describen la capacidad (`CharacterStore`, `RealtimeBus`); las
  **implementaciones** nombran la tecnología (`SqliteCharacterStore`,
  `InMemoryCharacterStore`).
- Términos de reglas: usa el nombre inglés del SRD como identificador
  (`smiteEvil`, `powerAttack`, `baseAttackBonus`) y guarda el nombre español en datos/i18n.

## Patrón de abstracción

- Cada servicio externo se define como **interfaz** y se implementa aparte.
- La selección de implementación ocurre en un **único punto de composición**
  (`src/server/compose.ts`), no esparcida por el código.
- Esto permite cambiar backend por configuración e inyectar fakes en tests.

## Configuración

- Un único mecanismo (`src/server/config`) que lee de entorno y ficheros, validado
  con zod. Sin valores mágicos hardcodeados.
- **Secretos nunca en el repo.** `.env` está en `.gitignore`; se commitea `.env.example`.

## Errores

- Resultados esperados en el tipo de retorno (`Result<T, E>` o unión discriminada), no
  con excepciones para flujo de control.
- Errores de infraestructura sí son excepciones claras; no se enmascaran como vacíos.

## Tests (resumen; detalle en `docs/verification.md`)

- Un fichero de test por módulo del código fuente (`tests/` espeja `src/`).
- Lógica con **fakes in-memory** — sin red ni BD reales en unit tests.
- Tests de integración: sufijo `.int.test.ts`, excluidos por defecto.
- Usa directorios temporales; nada de escribir en el repo.
- Tests de reglas: cada caso cita la regla del Core o el ejemplo del manual que verifica.
