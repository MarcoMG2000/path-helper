# Bitácora histórica (append-only)

> Cada vez que se cierra una sesión, su resumen se añade aquí.
> No edites entradas anteriores. Solo añades al final.

---

## 2026-10-16 — f0-project-skeleton (done)

**Entregado:** esqueleto del proyecto con capas `src/{rules,data,server,web,shared}` y reglas ESLint que
hacen cumplir las dependencias entre capas; sistema de configuración (zod, entorno + ficheros, `.env.example`);
servidor Fastify con `/api/health` y composición única en `src/server/compose.ts`; app web React con PWA
(vite-plugin-pwa), proxy de desarrollo a la API y estado de salud en la UI (textos en `src/web/i18n/es.ts`);
`npm run dev` sirve la app en localhost; `init.sh` hace `npm ci` y corre la suite (16 ficheros / 71 tests
unitarios; 7 tests de integración aparte con `npm run test:int`).

**Versiones clave:** Node >=22 (`engines`, `engine-strict`), TypeScript 6.0.3, Fastify 5, React 19, Vite 8,
Vitest 5, zod 4. Dependencias con versión exacta y lockfile.

**Desviaciones aceptadas por el reviewer:** TypeScript 6.0.3 en vez de 7.x (peer de typescript-eslint);
`@types/node` 22.20.5; `.prettierignore`; `createViteConfig` exportada; mensajes de `ConfigError` sin el valor;
helpers de test y apagado limpio en `main.ts`.

**Pendiente para el humano:** comprobar visualmente en el navegador el estado de error de la UI cuando la API
está caída (T21); está cubierto por tests unitarios (R42/R43) pero no se verificó en navegador.
Decisión opcional: `npm install-scripts approve|deny esbuild` para el aviso de npm 11.19.

Nota de cierre: la primera ejecución de `init.sh` falló (`vitest` no reconocido, `node_modules/.bin` ausente,
probable carrera con otro `npm ci` concurrente); la repetición dio exit 0.

Enlaces: [impl](impl_f0-project-skeleton.md) · [review](review_f0-project-skeleton.md)

---

## 2026-10-16 — f1-auth-roles (done)

**Entregado:** cuentas con nombre + PIN y roles jugador/GM; login con cookie de sesión opaca (token aleatorio, solo
su hash en la BD), caducidad por inactividad y absoluta, bloqueo progresivo por intentos fallidos con mutex por
nombre, hash de PIN scrypt con pepper, guarda CSRF por `Origin`, hook global "denegar por defecto" bajo `/api`,
política de autorización dueño/GM (404 indistinguible para recursos ajenos), filtro de eventos por audiencia,
Stores tras interfaz (SQLite + en memoria con suite de contrato común), migraciones y CLI `npm run create-gm`.
Un solo GM; solo el GM crea cuentas, restablece PIN, desbloquea y deshabilita.

**Desviaciones aceptadas:** `node:sqlite` en lugar de `better-sqlite3` (el `node-gyp rebuild` falla en la máquina de
desarrollo; Stores tras interfaz, así que el cambio queda en `stores/sqlite`); `composeApp` asíncrono;
`DATABASE_PATH` en `.env.example`; 415 en login con cuerpo no JSON; `engines.node` subido a `>=22.13` (enmienda de
R6 de f0, con su test y el lock).

**Hallazgos del review resueltos en el cierre:** M-1 (pepper de ejemplo rechazado en producción), M-2
(`npm run reset-gm-lock`), B-1 (`idleResetMs >= bloqueo máximo`), B-3 (`Cache-Control: no-store` en login/logout);
además `tests/web/dev-server.int.test.ts` adaptado a la config de auth/BD obligatoria.
**Pendientes (mejoras futuras):** B-2 (índice y purga de `login_attempts`), I-1 (redactar query string en logs),
I-2 (`setNotFoundHandler` con el contrato de errores, junto a `f1b-auth-ui`), I-3.

Enlaces: [impl](impl_f1-auth-roles.md) · [review](review_f1-auth-roles.md) · [cierre](impl_closure_f1_f2.md)

---

## 2026-10-16 — f2-rules-engine-core (done)

**Entregado:** motor de reglas puro y determinista en `src/rules` (sin E/S, resultados serializables a JSON con
desglose): apilado de modificadores por tipo, modificadores de característica, tamaño, BAB y salvaciones por
progresión de clase, CA (normal, toque, desprevenido) con armadura/escudo/Des máxima/carga, tiradas y pruebas,
iniciativa y habilidades (incluida penalización de armadura); 13 ficheros / 215 tests en `tests/rules`, con
valores esperados literales del SRD.

**Desviaciones aceptadas (D1-D3), corregidas contra el SRD y re-aprobadas por el humano:** D1, el bonificador
racial se apila (SRD, Casting Spells > Bonus Types); D2, de los penalizadores del mismo tipo solo cuenta el peor
(morale -2 y -2 = -2); D3, la cota de mallas es +6 / Des máx +2 / penalización -5. El rechazo del reviewer fue solo
por deriva de documentación (requirements/design/feature-list); el código y los tests estaban verificados. Sin
cambios de comportamiento en `src/rules`.

**Pendiente:** umbral de cobertura (OQ-11) sin `@vitest/coverage-v8`, a decisión humana.

Enlaces: [impl](impl_f2-rules-engine-core.md) · [review](review_f2-rules-engine-core.md) · [cierre](impl_closure_f1_f2.md)

---

## 2026-10-18 — f3-srd-data (done)

**Entregado:** dataset del Core Rulebook en JSON validado por schema (zod), con texto completo en inglés, resumen
en español (borrador), URL de la fuente y procedencia por entrada, generado por un pipeline reproducible y
offline-first (`data:import` / `data:parse` / `data:validate` / `data:sample`; dos pasadas dan el mismo hash) desde
Archives of Nethys, con overrides documentados (`reason` + `evidence`). Recuentos finales:

- **Clases:** 7 (druida, pícaro, cazador, bárbaro, paladín, bardo, clérigo) con tablas de 20 niveles; **240**
  capacidades de clase y opciones (poderes de furia, misericordias, talentos, etc.); **33** dominios.
- **Razas** 7; **habilidades** 35; **dotes** 176; **conjuros** 623 (universo de `SourceDisplay` del CRB) con las
  **listas por clase** (bardo 164, clérigo 236, druida 169, paladín 45, cazador 51).
- **Equipo:** 87 armas, 12 armaduras, 6 escudos, 164 piezas de `gear`.
- **Objetos mágicos:** **442** (armor-ability 17, artifact 12, cursed 29, general 21, ring 34, rod 24,
  shield-ability 14, specific-armor 12, specific-shield 8, specific-weapon 30, staff 21, weapon-ability 30,
  wondrous 190), con efectos tipados, `critMultiplier`/`functionsAs` y API `getExtraDamage` /
  `getWeaponAbilitiesExtraDamage`.
- Aviso OGL (`LICENSE-OGL.md`, contrato `getLegalNotice()`), glosario ES en borrador, regla de integridad
  `foreign-text` y 1927 tests unitarios más `data:validate` en verde.

**Primer rechazo y corrección:** el reviewer rechazó la primera entrega (CHANGES_REQUESTED) por (1) texto y reglas de
otros libros dentro de entradas marcadas CRB (hunters-bond, divine-bond, nature-bond, archery, lore-master,
rapid-reload, extra-channel, summon-monster-1, razas...), (2) valores de equipo y objetos mágicos distintos del CRB
frente al PRD (precios/pesos de `gear`, variantes de feather tokens, figurines y golem manuals, recetas
alquímicas de Ultimate Equipment) y (3) un modelo de daño extra sin multiplicador de crítico (flaming/icy/shocking
burst, thundering). Corrección A: overrides con evidencia del PRD, regla `foreign-text` en `data:validate`, parser de
conjuros (descriptores y subescuelas en catálogo cerrado) y CLI de procedencia por lotes. Corrección B: 40 fichas de
`gear` y 21 de objetos mágicos con override, tests contra fixtures del PRD (`equipment-prd`, `magic-items-prd`) y
el modelo `extraDamage` con `critMultiplier`, exclusión y `functionsAs`. Segunda revisión: **APROBADO**.

**Decisión del humano:** la fuente de verdad del texto y los valores del CRB es el **PRD oficial de Paizo**
(`paizo.com/pathfinderRPG/prd/coreRulebook/`), contrastado con d20pfsrd; AoN sigue siendo la fuente del pipeline y
cada desvío se corrige con override, nunca editando a mano los JSON generados.

**Desviaciones aceptadas:** `node:sqlite` no aplica a esta feature (es de f1; aquí no hay BD); Q11, pociones,
aceites, varitas y pergaminos genéricos con `expectedCount: 0` (el CRB solo trae fórmulas y tablas); schema de
equipo con `ammunition` y `siege` (munición y máquinas de asedio dentro de `weapons`, a confirmar); `enhancement`
opcional en objetos mágicos; alias de slugs de dominio -> conjuro (`slug-aliases.json`, categoría `spells`, 14
alias); R40 sin test en esta feature (excepción prevista en el propio spec: la pantalla legal es de otra feature, Q6;
`data/legal.test.ts` cubre el contrato R38).

**Decisiones PENDIENTES del humano** (lista de `review_f3-srd-data_2.md`):
1. `symbol-of-*` (8): PRD (solo trapfinding usa Disable Device; recomendado) o AoN («rogue (only)»).
2. `unhallow`: «sacred» (PRD y d20pfsrd) o «profane» (AoN; recomendado con `needsReview`); confirmar con el impreso.
3. `staff-of-illumination`: coste de creación 25.750 gp (recomendado) o 20.750 gp (PRD).
4. ~12 erratas de redacción de AoN: corregir solo las ortográficas por override o dejar todo.
5. Texto de Ultimate Equipment en ~115 fichas de `gear` y ~310 de `magic-items` (`chime-of-opening` cambia
   «wizard»): aceptar como reimpresión o importar el PRD como fuente (ampliar R6), lo que recuperaría
   `bag-of-tricks` y `lens-of-detection`.
6. Piezas de asedio y dardos de cerbatana (`needsReview`); `golem-manuals.sourceRef` sin página; párrafo general
   de las piedras ioun.
7. Q6 / R40: qué feature monta la pantalla legal y si se añade la declaración de Product Identity de Paizo.
8. Q2: nombres en español (Devir), todo en `draft`/`verified: false`.
9. Q10: contrastar los recuentos congelados (176 dotes, 623 conjuros, 87/12/6/164, 442) con los índices del libro
   impreso; Q9 (otras 4 clases), Q14/Q7 (Special Materials, venenos, compañeros animales, monturas, familiares) y
   Q15 (sin listas de hechicero/mago).
10. Ratificar la extensión del schema de conjuros (25 descriptores, 14 subescuelas, `additionalSubschools`), los
    campos `critMultiplier` y `functionsAs`, y la regla `foreign-text`.

**Mejoras no bloqueantes:** ampliar `foreign-text` a `benefit`, `normal`, `special`, `prerequisites`,
`shortDescriptionEn`, `construction.requirements` y `raw` de conjuros, y su lista de palabras guía; en f6, modelar
`flaming`/`frost`/`shock` como bajo orden («upon command») y el daño de `vicious` al portador.

Enlaces: [revisión 1 (rechazo)](review_f3-srd-data.md) · [revisión 2 (aprobado)](review_f3-srd-data_2.md) ·
[corrección A](impl_f3-srd-data_fixA.md) · [corrección B](impl_f3-srd-data_fixB.md) ·
[Lote 0](impl_f3-srd-data_lote0.md) · [A](impl_f3-srd-data_loteA.md) · [B](impl_f3-srd-data_loteB.md) ·
[C](impl_f3-srd-data_loteC.md) · [D0](impl_f3-srd-data_loteD0.md) · [D1](impl_f3-srd-data_D1.md) ·
[D2](impl_f3-srd-data_D2.md) · [D3](impl_f3-srd-data_D3.md) · [D4](impl_f3-srd-data_D4.md) ·
[D5](impl_f3-srd-data_D5.md) · [E](impl_f3-srd-data_loteE.md) · [M](impl_f3-srd-data_M.md) ·
[Z](impl_f3-srd-data_Z.md)
