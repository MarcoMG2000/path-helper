# Review — feature f2-rules-engine-core

**Veredicto:** CHANGES_REQUESTED (rechazado). El codigo y los tests son correctos y fieles al SRD; el rechazo es solo por
deriva de documentacion: requirements.md / design.md / feature-list.json (acceptance) contradicen lo implementado en D1 y D2
(R8, R9, R11, M7, A4/A5, OQ-2). NO hace falta tocar src/ ni tests/; con el spec actualizado y re-aprobado por el humano, la re-revision es trivial.
./init.sh NO lo he ejecutado (restriccion de concurrencia); T14 queda para el leader.

## Verificacion independiente contra el SRD (curl, 2026-10-16)

### D1 - racial se apila: CORRECTO
Texto literal (Core Rulebook p.206, Casting Spells > Bonus Types): "With the exception of dodge bonuses, most circumstance bonuses, and racial bonuses, only the better bonus of a given type works (see Combining Magical Effects)."
URLs: https://aonprd.com/Rules.aspx?Name=Casting%20Spells&Category=Magic ; https://www.d20pfsrd.com/magic/ ; https://www.d20pfsrd.com/basics-ability-scores/glossary/ (Bonus).
El spec (R9, OQ-2) omitia racial. El implementer acierta. Nota: el SRD dice "most circumstance" (no todos); el codigo apila todos los circumstance (igual que el spec) sin enumerar excepciones; riesgo residual aceptable y a documentar.

### D2 - penalizadores del mismo tipo: solo cuenta el peor: CORRECTO
Texto literal (misma seccion, mismas URLs): "The same principle applies to penalties - a character taking two or more penalties of the same type applies only the worst one, although most penalties have no type and thus always stack. Bonuses without a type always stack, unless they are from the same source."
Glosario (https://www.d20pfsrd.com/basics-ability-scores/glossary/, Stacking): "Penalties and bonuses generally stack with one another, meaning that the penalties might negate or exceed part or all of the bonuses" -> M8 (morale +2 con morale -2 = 0) correcto.
El spec (R11/M7: morale -2 y -2 = -4) era erroneo. Implementacion (src/rules/modifiers.ts, penaltyWinner: ganadores separados por signo) coherente; untyped/dodge/circumstance/racial/base/ability siempre suman (ACP armadura + escudo = untyped, se suman: correcto).

### D3 - cota de mallas: CORRECTO
AoN, Chainmail (CRB pg.151): "Armor Bonus +6; Max Dex Bonus +2; Armor Check Penalty -5" -> https://aonprd.com/EquipmentArmorDisplay.aspx?ItemName=Chainmail . d20pfsrd Table: Armor and Shields: "Chainmail 150 gp +6 +2 -5 30% 20 ft. 15 ft. 40 lbs." -> https://www.d20pfsrd.com/equipment---final/armor/ . El spec (+5) era erroneo. Confirmados tambien: Full plate +9/+1/-6, Leather +2/+6/0, Studded leather +3/+5/-1, Shield heavy steel +2/-/-2. Recalculados a mano A1-A10 (con +6: A4 = 18/12/16/10, A5 = 17/11/16/10): coinciden con los tests.

### Otras reglas verificadas por mi (no solo por el implementer)
- Esquiva perdida con Des perdido: d20pfsrd combat, Dodge Bonuses: "Any situation that denies you your Dexterity bonus also denies you dodge bonuses... Unlike most sorts of bonuses, dodge bonuses stack with each other." Flat-footed: el SRD dice que no puedes usar tu bonificador de Des a la CA (if any) estando desprevenido (un Des negativo se conserva: R38 ok). Matiz del SRD: si el Des a la CA baja a 0 por la armadura, eso no cuenta como perder el bonificador de Des; consistente con el codigo (solo se excluye ac.dex si dexEffective > 0 estando desprevenido). https://www.d20pfsrd.com/gamemastering/combat/ y https://www.d20pfsrd.com/equipment---final/armor/
- Armadura vs carga: AoN Carrying Capacity (CRB): "If your character is wearing armor, use the worse figure (from armor or from load) for each category. Do not stack the penalties." Tabla 7-5: media +3/-3, pesada +1/-6. El codigo aplica el menor de maxDexCaps (test A5). https://aonprd.com/Rules.aspx?Name=Carrying%20Capacity&Category=Equipment
- ACP armadura + escudo: d20pfsrd armor: "If a character is wearing armor and using a shield, both armor check penalties apply." (test S3: -6 y -2 = -8). Max Dex: la restriccion no afecta a otras capacidades basadas en Des (iniciativa, salvaciones y habilidades sin cap: ok).
- Tabla de modificadores de caracteristica 1-45 comparada fila a fila con https://www.d20pfsrd.com/basics-ability-scores/ability-scores/ (1 = -5 ... 10-11 = +0 ... 44-45 = +17): identica a ability.test.ts. Tamano: tabla de combat (Colossal -8 ... Fine +8): identica.
- BAB y salvaciones, niveles 1, 5, 6, 10, 20, tablas de Fighter (BAB good, Fort good), Cleric (BAB medium, Fort y Will good, Ref poor) y Wizard (BAB poor, Will good) en https://www.d20pfsrd.com/classes/core-classes/ (fighter, cleric, wizard): BAB good 1/5/6/10/20; medium 0/3/4/7/15; poor 0/2/3/5/10; salvacion good 2/4/5/7/12; poor 0/1/2/3/6. Coincide con las tablas literales de progression.test.ts.

## Trazabilidad requirements <-> tests
Todos los R1..R54 aparecen en el nombre de al menos un it(...) de tests/rules (script propio; minimo 1 test por R) y los esperados son literales o derivados a mano (no salen de ejecutar el propio codigo). npx vitest run tests/rules -> 13 ficheros, 215 tests verdes.
- R1: [x] result.test.ts. R2/R3: [x] determinism.test.ts. R4/R6: [x] purity.test.ts. R5: [x] json.test.ts.
- R7: [x] modifiers R7/M18. R8: [x] M1/M2 (TEXTO de R8 desactualizado). R9: [x] tests dodge/circumstance/untyped/racial (TEXTO de R9 sin racial).
- R10: [x] M6. R11: [!] el texto de R11 (sumarlos todos, sea cual sea su tipo) es falso respecto al codigo; M7 afirma ahora -2. R12-R20: [x] modifiers.test.ts.
- R21-R25: [x] ability.test.ts. R26: [x] size.test.ts. R27-R32: [x] progression.test.ts. R33: [x] saves.test.ts.
- R34-R43: [x] armor-class.test.ts. R44-R45: [x] check.test.ts. R46: [x] initiative.test.ts. R47-R54: [x] skills.test.ts.

## Tasks completas
- T1..T13: [x]
- T14: [ ] pendiente a proposito (init.sh lo ejecuta el leader); justificado en progress/impl_f2-rules-engine-core.md. No bloquea por si solo.

## Capas, pureza, higiene, API
- Capas: [x] src/rules solo importa ./*; sin server/web/data ni modulos Node (grep + purity.test.ts).
- Pureza: [x] sin Date, Math.random, process, console ni I/O.
- Higiene: [x] sin console, TODO/FIXME, any, ts-ignore ni eslint-disable en src/rules y tests/rules.
- tsc --noEmit filtrado a src/rules + tests/rules: 0 errores. eslint src/rules tests/rules: limpio. prettier --check: OK.
- API publica (index.ts) coherente con design.md sec.4. Comentarios CRB: con URL en todos los ficheros de regla (R6).

## Checkpoints
- C1: [ ] no evaluado: requiere ./init.sh (no permitido ahora). Los ficheros base y docs existen.
- C2: [x] solo f2 en in_progress (en lo que atane a f2)
- C3: [x] capas; [x] sin servicios externos; [x] sin dependencias nuevas; [x] sin print/TODO/secretos en src/rules
- C4: [x] un test por modulo de src/rules; [x] sin red ni servicios; [x] 215 tests no-integration verdes
- C5: [x] carpeta specs con los 3 ficheros; [x] EARS; [ ] todas las tasks [x] (T14 pendiente del leader); [ ] R8/R9/R11 describen un comportamiento distinto del implementado (el SRD manda)

## Cambios requeridos
1. (Leader / spec_author, SOLO docs; requiere re-aprobacion humana segun el proceso SDD porque cambia requisitos aprobados) Actualizar specs/f2-rules-engine-core/requirements.md:
   - R8 y R9: anadir racial a las excepciones que se apilan (dodge, circumstance, racial, untyped), con cita del SRD.
   - R11: reescribir: de varios penalizadores del mismo tipo con nombre solo cuenta el peor (empate: el primero); los untyped/dodge/circumstance/racial se suman; un bonificador y un penalizador del mismo tipo se suman entre si.
2. Actualizar design.md: sec.5.1 (ganador por tipo y signo), sec.8.3 M7 (-2, no -4), M12/R14, A4/A5 (cota de mallas +6: 18/12/16/10 y 17/11/16/10), fixtures de la CA (+6) y OQ-2 (resuelta: racial se apila).
3. Actualizar el acceptance de f2 en feature-list.json (decision humana): dice que los penalizadores si se apilan y que el mismo tipo no se apila salvo esquiva, circunstancia y sin tipo; ambos contradicen el SRD.
4. Sin cambios de codigo ni de tests. Tras 1-3 y aprobacion humana: ejecutar ./init.sh (T14) y cerrar.

Observaciones menores (no bloquean): (a) T13 pedia parar y consultar antes de cambiar comportamiento; el implementer lo cambio por su cuenta (lo declara en su informe); (b) OQ-4 y OQ-11 siguen abiertas para el humano; (c) una progresion desconocida en runtime no tiene error (el tipo TS lo impide).
