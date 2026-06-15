# Convenciones

> Reglas de estilo, nombres y estructura. Léelo antes de escribir código.
> Plantilla neutra: rellena `<...>` con las decisiones reales del proyecto.

## Lenguaje y estilo

- Lenguaje: `<LENGUAJE/VERSIÓN>`. Tipado/anotaciones según convención del lenguaje.
- Formato y linting: `<FORMATTER>` + `<LINTER>` (line length `<N>`).
- Docstrings/comentarios breves donde el "por qué" no es obvio; no narres el "qué".
- Nada de `print()` para debug: usa el logging estándar del lenguaje, un logger
  por módulo.

## Nombres

- Sigue la convención idiomática del lenguaje para módulos, funciones, clases y
  constantes.
- Las **interfaces** describen la capacidad (`<Capacidad>Provider`,
  `<Cosa>Store`); las **implementaciones** nombran la tecnología concreta.

## Patrón de abstracción

- Cada servicio externo se define como **interfaz** y se implementa aparte. El
  resto del código depende de la interfaz, nunca de la implementación concreta.
- La selección de implementación ocurre en un **único punto de composición**
  (factory/config), no esparcida por el código.
- Esto permite (a) cambiar backend por configuración y (b) inyectar fakes en tests.

## Configuración

- Toda configuración via un mecanismo único (settings/env), leyendo de entorno y
  ficheros. Sin valores mágicos hardcodeados.
- **Secretos nunca en el repo.** `.env` está en `.gitignore`; se commitea un
  `.env.example`.

## Errores

- Modela los resultados esperados en el tipo de retorno, no con excepciones para
  flujo de control.
- Los errores de infraestructura sí son excepciones claras; no se enmascaran como
  respuestas vacías.

## Tests (resumen; detalle en `docs/verification.md`)

- Un fichero de test por módulo del código fuente.
- La lógica se testea con **fakes/dobles** — sin red ni servicios externos.
- Los tests que requieren servicios reales se marcan como `integration` y se
  pueden excluir por defecto.
- Usa directorios temporales; nada de escribir en el repo.
