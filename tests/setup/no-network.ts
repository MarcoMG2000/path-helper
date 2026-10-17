// R50: los tests unitarios no hacen peticiones de red. Cualquier uso de `fetch` global sin
// inyectar un doble lanza; los tests que necesitan `fetch` reciben uno falso por parámetro.
globalThis.fetch = (() => {
  throw new Error(
    "Red prohibida en los tests unitarios (R50): inyecta un fetch falso en lugar de usar globalThis.fetch",
  );
}) as typeof fetch;
