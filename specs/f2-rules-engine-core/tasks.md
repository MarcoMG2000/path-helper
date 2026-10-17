# Tasks — f2-rules-engine-core

> Ejecutar en orden. Cada task: escribir primero los tests (rojo) con los casos de
> `design.md` §8 y luego el código mínimo (verde). Cada test cita la regla del Core o
> el caso de design §8 que verifica. No tocar `feature-list.json` (lo hace el leader).
> Antes de empezar: confirmar que f0 está `done` (layout `src/rules`, Vitest, tsconfig strict, `./init.sh` verde).
> Los ficheros de `src/rules` salvo `types.ts`, `result.ts` e `index.ts` DEBEN llevar un comentario `CRB:` (R6).

- [x] **T1 — Tipos y Result.** Crear `src/rules/types.ts` y `src/rules/result.ts` (design §3): `ABILITY_IDS`, `BONUS_TYPES`, `Modifier`, `Breakdown`, `BreakdownLine`, `Size`, `Result`, `RulesError`, `RulesErrorCode`, helpers `ok()`/`err()`. Test base en `tests/rules/result.test.ts`. _Cubre: R1, R7 (catálogo)._
- [x] **T2 — Resolvedor.** Tests `tests/rules/modifiers.test.ts` con M1–M18 (incl. M5b y M7b; M7 = −2, racial se apila; ver design §5.1 y OQ-2); implementar `src/rules/modifiers.ts` (`resolveModifiers`, design §5.1). Incluir test de permutaciones. _Cubre: R7–R20._
- [x] **T3 — Características.** Tests con la tabla 1–45 literal y AB2–AB6; implementar `src/rules/ability.ts` (`abilityModifier`, `abilityModifiers`, `effectiveAbility`). _Cubre: R21–R25._
- [x] **T4 — Tamaño.** Test de los 9 valores; implementar `src/rules/size.ts`. _Cubre: R26._
- [x] **T5 — Progresiones.** Tests con las 5 tablas de 20 valores (§8.2) y P2–P9; implementar `src/rules/progression.ts`. _Cubre: R27–R32._
- [x] **T6 — Salvaciones.** Tests SV1–SV4; implementar `src/rules/saves.ts` (`savingThrow`, `SAVE_ABILITY`). _Cubre: R33 (usa R8–R12)._
- [x] **T7 — d20.** Tests I3; implementar `src/rules/check.ts` (`applyD20`). _Cubre: R44, R45._
- [x] **T8 — Iniciativa.** Tests I1, I2, I4; implementar `src/rules/initiative.ts`. _Cubre: R46._
- [x] **T9 — CA.** Tests A1–A10 (cota de mallas +6 / Des máx. +2 / ACP −5; A4 = 18/12/16/10, A5 = 17/11/16/10) + comprobaciones de `adjustment`, `excludedReason`, `invalid_max_dex`, ids reservados; implementar `src/rules/armor-class.ts` (design §5.4). _Cubre: R34–R43._
- [x] **T10 — Habilidades.** Tests S1–S11; implementar `src/rules/skills.ts` (design §5.5). _Cubre: R47–R54._
- [x] **T11 — API pública.** Crear `src/rules/index.ts` re-exportando todo lo público de design §4 (sin exportar internos). Verificar que `tsc` estricto compila sin `any`. _Cubre: R1._
- [x] **T12 — Propiedades transversales.** `tests/rules/determinism.test.ts` (doble llamada, entradas congeladas, `Date.now`/`Math.random` espiados), `tests/rules/json.test.ts` (round-trip estricto), `tests/rules/purity.test.ts` (imports prohibidos y presencia de `CRB:`). _Cubre: R2, R3, R4, R5, R6._
- [x] **T13 — Revisión de fidelidad.** Contrastar con el SRD cada tabla literal de design §8.2 y resolver las OQ marcadas "verificar contra SRD" que afecten a código (OQ-2, OQ-3, OQ-5–OQ-9, OQ-14, OQ-15); registrar en `progress/impl_f2-rules-engine-core.md` las que sigan abiertas. Si una lectura difiere de la del spec, **parar y consultar al leader**; no cambiar el comportamiento por cuenta propia. _Cubre: R6 (fidelidad)._
- [x] **T14 — Cierre.** Ejecutar `./init.sh` (todo verde), comprobar la trazabilidad R1–R54 ↔ tests (cada `R<n>` aparece en el nombre o comentario de al menos un test), resumen en `progress/impl_f2-rules-engine-core.md` y actualizar `progress/current.md`. _Cubre: R1–R54 (trazabilidad)._
