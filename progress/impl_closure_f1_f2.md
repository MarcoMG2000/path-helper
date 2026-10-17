# Cierre de f1-auth-roles y f2-rules-engine-core

Estado: **done -> f1, f2** (marcadas `done` en `feature-list.json`; solo cambió su `status`). Entorno: Windows + Git Bash, Node v24.20.0.

## Cambios

1. `engines.node` `>=22.13` en `package.json` y en la raíz de `package-lock.json`; test de f0 R6 en `tests/project/package-json.test.ts` actualizado con comentario del motivo (`node:sqlite` sin flag + `engine-strict`). `.nvmrc` se deja en `22`. Nota: `specs/f0-project-skeleton/requirements.md` R6 sigue diciendo `>=22` (enmienda pendiente del spec de f0, aprobada de palabra por el humano).
2. **M-1**: `src/server/auth/config.ts` rechaza con `NODE_ENV=production` un `AUTH_PEPPER` que contenga `change-me` (sin distinguir mayúsculas; cubre el marcador de `.env.example`, comprobado leyendo el fichero real). El mensaje no incluye el valor. En desarrollo, test o sin `NODE_ENV` sigue permitido. Tests `R61 (review M-1)` x3 en `tests/server/auth/config.test.ts`.
3. **M-2**: `src/server/cli/reset-gm-lock.ts` (+ script `reset-gm-lock` en `package.json`) sobre `AccountService.unlock` y los Stores reales/`DATABASE_PATH`; exit 1 con mensaje claro si no hay GM o la config es inválida. Helper común `src/server/cli/cli-settings.ts`, usado también por `create-gm.ts` (refactor sin cambio de comportamiento). Tests: `tests/server/cli/reset-gm-lock.test.ts` (4, fakes) y `reset-gm-lock.int.test.ts` (2: GM bloqueado con 5 fallos reales -> 429 -> CLI -> login 200; y proceso real sin GM / con GM). README: nueva sección "Operación: cuentas de GM", prerrequisito Node >= 22.13 y aviso del pepper.
4. **B-3**: `src/server/http/auth-plugin.ts` pone `Cache-Control: no-store` en toda ruta bajo `/api` (también las públicas login/logout). Test `review B-3` (login 200/401/429 y logout 204) en `tests/server/http/auth-plugin.test.ts`. **B-1**: `idleResetMs = max(48 h, AUTH_LOCK_MAX_HOURS)`; test `R50 (review B-1)` en `config.test.ts`. B-2, I-1, I-2 (e I-3) anotados como mejoras futuras en `progress/impl_f1-auth-roles.md`.
5. Hallazgo extra, causado por f1 y de mi alcance: `tests/web/dev-server.int.test.ts` (f0) arrancaba `start()` sin `AUTH_PEPPER`/`AUTH_ALLOWED_ORIGINS`/BD y fallaba; ahora los pasa con una BD temporal.
6. `specs/f2-rules-engine-core/tasks.md` T14 marcada; `progress/history.md` con los resúmenes de f1 y f2 (al final); `progress/impl_f1-auth-roles.md` con sección de cierre. `progress/current.md` no se ha tocado.

## Comandos y resultados reales

| Comando | Resultado |
|---|---|
| `bash ./init.sh` | **exit 1**, SOLO por f3: `npm ci` OK; `tests/scripts/srd/parse-feats.test.ts` no compila por un literal sin cerrar en `scripts/srd/parsers/feats.ts:497` (f3, en curso). Resto: 82 ficheros / 905 tests en verde |
| `npx vitest run tests/server tests/rules tests/project tests/shared tests/web` | 51 ficheros / 594 tests en verde |
| `npm run test:int` | 5 ficheros OK; fallan 3 tests de `tests/project/pipeline.int.test.ts` (R13 typecheck, R14 lint, R40 build) por errores de f3 (`scripts/srd/parsers/feats.ts`, `tests/scripts/srd/parse-feats.test.ts`, `.cache/**`). `npx vitest run --config vitest.int.config.ts tests/server tests/web`: 6 ficheros / 44 tests en verde |
| `npm run lint` | falla solo en f3 (`scripts/srd/parsers/feats.ts`, `tests/scripts/srd/parse-feats.test.ts`) y en `.cache/**` (scratch de f3, 'console' no definido). `npx eslint src/server src/shared src/rules src/web tests/server tests/helpers tests/project tests/shared tests/web tests/rules`: limpio |
| `npm run typecheck` | 73 errores, todos en `scripts/srd/**` (f3); ninguno en `src/` ni `tests/` |
| `npx prettier --check README.md package.json src/server tests/server tests/web tests/project` | limpio |

Lo mío (tests/server, rules, project, shared, web) está verde; ningún fichero de f3 se tocó. Pendiente para el leader: repetir `./init.sh` y `npm run test:int` cuando f3 repare `feats.ts`.
