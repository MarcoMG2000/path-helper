# CHECKPOINTS — Evaluación del estado final

> En sistemas multi-agente no se evalúa el camino, se evalúa el destino.
> Estos son los checkpoints objetivos para decidir si el proyecto está sano.

## C1 — El arnés está completo

- [ ] Existen los archivos base: `AGENTS.md`, `init.sh`, `feature-list.json`,
      `progress/current.md`.
- [ ] Existen los 4 docs: `docs/architecture.md`, `docs/conventions.md`,
      `docs/specs.md`, `docs/verification.md`.
- [ ] `./init.sh` termina con exit code 0.

## C2 — El estado es coherente

- [ ] Como mucho una feature en `in_progress` en `feature-list.json`.
- [ ] Toda feature `done` tiene tests asociados que pasan.
- [ ] `progress/current.md` está vacío o describe la sesión activa.

## C3 — El código respeta la arquitectura

- [ ] El código respeta la separación por capas de `docs/architecture.md`.
- [ ] Cada servicio externo vive detrás de su interfaz; nada de acceso directo a
      infraestructura fuera de su capa.
- [ ] Las dependencias están **pineadas** y solo lo necesario.
- [ ] No hay `print()` de debug, ni secretos en el repo, ni TODOs sin contexto.

## C4 — La verificación es real

- [ ] `tests/` tiene al menos un test por módulo del código fuente.
- [ ] La lógica se testea con **fakes/dobles** (sin red ni servicios reales); lo
      que necesita servicios reales está marcado como `integration`.
- [ ] La suite no-integration muestra > 0 tests y todos verdes.

## C5 — Spec Driven Development

- [ ] Toda feature con `"sdd": true` en `spec_ready`/`in_progress`/`done` tiene
      su carpeta `specs/<id>/` con `requirements.md`, `design.md`, `tasks.md`.
- [ ] `requirements.md` usa EARS estricto (ver `docs/specs.md`).
- [ ] Toda feature `done` con `"sdd": true` tiene todas sus tasks `[x]`.
- [ ] Cada `R<n>` de `requirements.md` está cubierto por al menos un test.

---

**Cómo usar este archivo:** el `reviewer` recorre cada checkbox, marca `[x]` o
`[ ]`, y rechaza el cierre si quedan boxes vacíos relevantes a la feature.
