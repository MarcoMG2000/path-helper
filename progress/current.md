# Sesión actual

- **Feature en curso:** oleada 1 de specs: `f0-project-skeleton`, `f1-auth-roles`, `f2-rules-engine-core`, `f3-srd-data` (fase: `spec`)
- **Inicio:** 2026-10-16
- **Agente:** leader

## Plan

Instanciar la plantilla con las decisiones del humano (stack TS/Fastify/React/SQLite, Fly.io, SRD EN + UI ES, login nombre+PIN) y redactar en paralelo los specs de la oleada 1. Oleada 2 (f4–f9) cuando la 1 esté aprobada, para que lean las interfaces ya fijadas.

## Bitácora

- Decisiones del humano: despliegue Fly.io; datos desde SRD (EN) con UI en español; acceso nombre+PIN; MVP = ficha/inventario/notas + combate + calculadora + compendio.
- `feature-list.json`, `docs/architecture.md`, `docs/conventions.md`, `init.sh` y `AGENTS.md` (regla de paralelismo) instanciados.
- Se relaja `one_feature_at_a_time` por petición expresa del humano (ver `rules.parallel_policy`).
- El tipo de agente `spec_author` no está registrado en esta sesión (existe `.claude/agents/spec_author.md` pero la herramienta Agent no lo lista). Workaround: 4 agentes `general-purpose` (Sonnet) que leen y siguen `spec_author.md`, escribiendo solo en `specs/`. Pendiente de confirmar la causa (probable: reiniciar Claude Code).
- Oleada 1 completa: f0, f1, f2, f3 en `spec_ready` (46, 92, 54 y 62 requisitos). Añadida `f1b-auth-ui` (pending). Esperando aprobación humana.
- 2026-10-16 decisiones del humano: GM no lee notas personales; bestiario con datos de monstruos (nuevas f3b y f5b; se asume Bestiary 1); objetos mágicos del Core dentro de f3. Node 24.20 instalado (fuera del PATH de esta sesión; init.sh lo localiza). En curso: revisión del spec f3 y spec nuevo f3b. Falta el "aprobado" explícito del humano para pasar a implementación.
- 2026-10-16 APROBADOS: f0 (en implementación), f1 y f2 (esperan a que f0 esté done para lanzar el implementer, por parallel_policy). f3 en revisión por ampliar a todos los conjuros del Core; requerirá nueva aprobación.
- f3 APROBADO por el humano (con todos los conjuros y objetos mágicos). f1 y f2 en implementación en paralelo; f3 arranca con el Lote 0 (secuencial) y después los lotes A-E, M y D en paralelo.
- 2026-10-16 INCIDENTE: better-sqlite3 (f1) exige compilar con node-gyp y esta máquina no tiene Python/C++: npm install fallaba y dejaba node_modules vacío. Decisión del leader: usar node:sqlite (integrado en Node 24, sin nativos), aprovechando que los Stores van tras interfaz. node_modules reinstalado y verificado; servidor dev parado (reiniciar al terminar f1/f2). Lote 0 de f3 reanudado.
- f1 implementado (696 tests del conjunto en verde, typecheck limpio). Verificado scrypt N=2^15,r=8,p=3 en la guía OWASP actual. Añadido script create-gm y .env local (pepper aleatorio). Pendiente: review f1, aprobado humano de f2 corregido, engines >=22.13 + test R6 de f0 (requiere implementer), init.sh en ventana tranquila.
- f3 Lote 0 HECHO y verificado por el leader (794 tests, tsc y data:validate OK). Oleada 1 de lotes lanzada: A (clases/dominios), C (dotes), D0 (fundamentos conjuros). Oleada 2 pendiente: B (razas/habilidades), E (equipo), M (objetos mágicos), D1-D4 (conjuros), luego D5, Z y reviewer. Se limitan a 3 lotes con red simultáneos por cortesía con AoN (limitador de 1 req/s es por proceso) y por cuota de API.
- 2026-10-16 el humano da "APROBADO" al spec de f2 corregido (D1-D3). Cierre de f1 y f2 (engines >=22.13 + test R6 de f0 + init.sh + done) en ventana tranquila, entre oleadas de f3 (init.sh hace npm ci y rompería a los agentes en marcha). Falta el veredicto del reviewer de f1.
- Cierre f1+f2: DONE (594 tests propios en verde; init.sh exit 1 SOLO por WIP de f3: literal sin cerrar en scripts/srd/parsers/feats.ts). Repetir ./init.sh y test:int cuando f3 compile. Hallazgos de f1 corregidos: M-1 pepper en prod, M-2 comando reset-gm-lock, B-1, B-3. Mejoras futuras en impl_f1. Pendiente: enmendar R6 de f0 (>=22.13). Reanudados lotes A, C, D0 de f3 tras reinicio de sesión; .cache/ y reports/ excluidos de eslint/prettier.
- f0 implementado y APROBADO por el reviewer (progress/review_f0-project-skeleton.md); cierre (done) delegado en implementer. Specs listos: f3 (revisado: todos los conjuros, pendiente de nuevo aprobado humano), f3b. Siguiente: f1 y f2 en paralelo cuando f0 sea done.

## Próximo paso

1. ~~Humano instala Node~~ (hecho: v24.20; en esta sesión hay que exportar el PATH, ver init.sh).
2. Humano revisa y aprueba los specs de la oleada 1 (`specs/f0..f3`).
3. Implementación de f0 (primero), luego f1/f2/f3 en paralelo; servidor local para feedback.

## Riesgos anotados

- Plazo "mañana" no realista para todo el alcance; se entrega por fases con servidor local visible.
- El Bestiario NO es Core Rulebook: los monstruos los introduce el GM a mano (pregunta abierta).
- Nombres en español del manual (Devir) no verificables desde el SRD inglés: glosario a validar por el humano.
- Fidelidad de datos del SRD: requiere revisión humana por muestreo además de los tests.

## f0-project-skeleton (implementer, 2026-10-16)

- Feature en curso: f0-project-skeleton — Project skeleton & configuration system
- Plan: las tasks T1..T22 de specs/f0-project-skeleton/tasks.md
- Estado: implementadas T1..T22, `bash ./init.sh` exit 0, `npm run test:int`, `lint`, `build` en verde, `npm run dev` verificado y parado. Pendiente de reviewer (no marcada `done`). Informe: progress/impl_f0-project-skeleton.md

## f1-auth-roles (implementer, 2026-10-16)

- Feature en curso: f1-auth-roles — Autenticación nombre+PIN y roles
- Plan: las tasks T1..T21 de specs/f1-auth-roles/tasks.md
- Estado: implementadas T1..T21; suite unitaria (696) e int de server (39) en verde; pendiente de reviewer (no marcada done). Dependencia nueva neta: @fastify/cookie 11.1.3 (node:sqlite en vez de better-sqlite3). Informe: progress/impl_f1-auth-roles.md. Pendiente del leader: script create-gm en package.json.

## f2-rules-engine-core (implementer, 2026-10-16)

- Feature en curso: f2-rules-engine-core — Rules engine core (src/rules puro)
- Plan: las tasks T1..T14 de specs/f2-rules-engine-core/tasks.md
- Estado: en implementación. Informe: progress/impl_f2-rules-engine-core.md

## f3-srd-data Lote 0 (implementer, 2026-10-16)

- Feature en curso: f3-srd-data — Lote 0 (Fundamentos). Plan: tasks T0.1..T0.14 de specs/f3-srd-data/tasks.md.
- Estado: Lote 0 implementado (T0.1..T0.14 marcadas), suite completa, tsc y eslint en verde; pendiente de reviewer. Informe: progress/impl_f3-srd-data_lote0.md. Dependencia añadida: cheerio 1.2.0 (dev).

## f3-srd-data Lote D0 (implementer, 2026-10-16)

- Feature en curso: f3-srd-data — sub-lote D0 (fundamentos de conjuros). Plan: tasks TD.1..TD.5 de specs/f3-srd-data/tasks.md.
- Estado: en implementación. Informe: progress/impl_f3-srd-data_loteD0.md. Descubierto: el índice de AoN (Spells.aspx?Class=All) no trae libro; el universo CRB sale de SourceDisplay.aspx?FixedSource=PRPG Core Rulebook (623 conjuros).
- 2026-10-16 D0 (reanudado): TD.1..TD.5 hechas y marcadas; 454 tests de data/scripts en verde, tsc y eslint limpios. Informe: progress/impl_f3-srd-data_loteD0.md (623 conjuros CRB; rangos a-d 172, e-k 142, l-r 146, s-z 163). Pendiente de reviewer.

## f3-srd-data Lote A (implementer, 2026-10-16)

- Feature en curso: f3-srd-data — Lote A (clases, capacidades de clase y dominios). Plan: tasks TA.1..TA.8 de specs/f3-srd-data/tasks.md.
- Estado: implementado (TA.1..TA.8 marcadas); 7 clases, 240 capacidades/opciones y 33 dominios importados de AoN con sus resúmenes ES y glosario en borrador; tests de mis ficheros en verde. Pendiente de reviewer y de las decisiones humanas anotadas en progress/impl_f3-srd-data_loteA.md (campo `domainSpellsPerDay` del clérigo, tokens de competencias, ids de Knowledge).

## f3-srd-data Lote D5 (implementer, 2026-10-17)

- Feature en curso: f3-srd-data — sub-lote D5 (cierre del Lote D). Plan: tasks TD.6 y TD.7 de specs/f3-srd-data/tasks.md (listas por clase, R22 sobre datos reales, consolidación de procedencia, `tests/data/spells.test.ts`).
- Estado: implementado (TD.6 y TD.7 marcadas). Listas por clase importadas (bard 164, cleric 236, druid 169, paladin 45, ranger 51), R22 sin incoherencias reales sobre los 623 conjuros. Pendiente de reviewer. Informe: progress/impl_f3-srd-data_D5.md.

## f3-srd-data Lote Z (implementer, 2026-10-17)

- Feature en curso: f3-srd-data — Lote Z (integración). Plan: las tasks TZ.1..TZ.5 de specs/f3-srd-data/tasks.md.
- Estado: implementado (TZ.1..TZ.5 marcadas). Informe: progress/impl_f3-srd-data_Z.md. Pendiente de reviewer; la feature NO está done.
