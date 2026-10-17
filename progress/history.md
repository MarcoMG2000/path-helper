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
