# Sesión actual

- **Feature en curso:** f1b-auth-ui — Pantallas de login y gestión de cuentas
- **Inicio:** 2026-10-18
- **Agente:** implementer (terminado; pendiente de reviewer)

## Plan

Las tasks T1..T28 de `specs/f1b-auth-ui/tasks.md` — todas marcadas `[x]`.

## Estado

Implementada. Verde: `npx vitest run` (155 ficheros / 2242 tests), `npm run test:int` (9 / 58), `npm run typecheck`,
`npm run lint`, `npm run build`. NO ejecutados por regla de la sesión: `npm ci` e `./init.sh` (los corre el reviewer).
Informe: `progress/impl_f1b-auth-ui.md`. Checklist manual (todos los pasos de navegador pendientes del humano):
`progress/manual_f1b-auth-ui.md`. La feature NO está `done`.

## Bitácora

- 2026-10-18: dependencias instaladas (react-router 7.18.4, jsdom 29.1.1, RTL 16.3.3 / dom 10.4.2 / user-event 14.6.8).
- 2026-10-18: shell, sesión, pantallas, estilos, tests, integración y docs; humo con dev real y `vite preview`.

## Próximo paso

Reviewer (trazabilidad R1-R87, tasks, higiene) y el humano con la checklist manual; después el implementer marca `done`
y mueve el resumen a `progress/history.md`.

## Riesgos anotados

- Tras logout voluntario `RequireAuth` guarda `from`; un usuario de otro rol puede aterrizar en «Sin permiso» (inocuo).
- Comportamiento del service worker de desarrollo con `/api` sin verificar en navegador.
- f9 debe servir `dist/web` con fallback SPA y fijar `AUTH_ALLOWED_ORIGINS`.
