# Verificación

> Cómo demostrar que el trabajo funciona. Léelo antes de declarar `done`.

## Principio

La corrección manda. No se declara nada `done` sin una verificación objetiva y
reproducible: ejecutar la suite de tests y comprobar que pasa.

## 1. Tests automáticos

- Ejecuta la suite vía `./init.sh` (o el comando de test del proyecto). Debe
  pasar al 100%.
- **Un fichero de test por módulo** del código fuente.
- **Trazabilidad obligatoria:** cada requisito `R<n>` del `requirements.md` de la
  feature está cubierto por al menos un test. Nombra o comenta el test con el
  `R<n>` que cubre (p. ej. `test_<algo>  # R4`).
- La lógica se testea con **fakes/dobles** inyectados: nada de red, base de
  datos ni servicios externos en los tests unitarios.
- Usa directorios temporales para ficheros de prueba. No escribas en el repo.

### Tests de integración (servicios reales)

- Marca como `integration` lo que necesite servicios vivos (BD, APIs externas).
- Por defecto se excluyen y se corren a propósito cuando hay entorno.
  `init.sh` corre la suite no-integration.

## 2. Checklist antes de `done`

1. `./init.sh` termina en exit 0 y la suite pasa.
2. Todos los `R<n>` de la feature tienen test (trazabilidad).
3. Sin `print()` de debug, sin TODOs sin contexto, sin secretos.
4. `tasks.md` con todas las tasks `[x]`.
5. Resumen movido a `progress/history.md` y `feature-list.json` actualizado.
