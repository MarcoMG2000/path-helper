# Arquitectura

> Qué significa "hacer un buen trabajo" en este proyecto. Léelo antes de
> redactar specs o implementar.
> Plantilla neutra: rellena `<...>` con las decisiones reales del proyecto.

## 1. Objetivo

`<Describe en 2-3 frases qué hace el sistema y cuál es su prioridad nº1
(corrección, latencia, simplicidad…). Sé explícito sobre qué NO hace.>`

## 2. Stack (decidido)

| Capa            | Elección            |
|-----------------|---------------------|
| Lenguaje        | `<...>`             |
| Framework/API   | `<...>`             |
| Almacenamiento  | `<...>`             |
| Dependencias    | `<...>`             |
| Tests           | `<...>`             |

## 3. Flujo de datos

```
<Diagrama o descripción del flujo principal: entrada → procesamiento → salida.>
```

## 4. Componentes y puntos de intercambio (swap points)

Todo componente externo vive **detrás de una interfaz**. Las implementaciones
concretas se eligen por configuración. Esto mantiene los tests sin servicios
vivos (se inyectan fakes).

- `<Interfaz>` → impl `<Concreta>`, fake en tests.
- `<...>`

La lógica propia (orquestación, transformaciones) es testeable sin red usando
los fakes anteriores.

## 5. Layout del código fuente

```
src/
  <paquete>/
    <capa-1>/      # responsabilidad
    <capa-2>/
    ...
```

> El nombre exacto de módulos puede afinarse en cada spec, pero **respeta la
> separación por capas**. Un revisor rechaza código que mezcle capas.

## 6. Política de dependencias

- Versiones **pineadas**.
- Solo lo necesario para la feature en curso (no añadas libs "por si acaso").
- Nada de claves/secretos en el código: van por entorno (`.env`, no commiteado).
