import { start } from "./start";

try {
  const server = await start();
  const shutdown = (): void => {
    void server.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error) {
  // Aún no hay logger configurado y console.* está prohibido (docs/conventions.md).
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`No se pudo arrancar el servidor: ${message}\n`);
  process.exitCode = 1;
}
