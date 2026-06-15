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

## Origen

Plantilla genérica extraída de un proyecto real, con toda la información
específica del proyecto eliminada.
