import type { Writable } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config";
import { healthRoutes } from "./http/health";

export interface BuildAppOptions {
  /** Destino de los logs (tests); por defecto, la salida estándar de pino. */
  logStream?: Writable;
}

// Los cuerpos de la API son diminutos (nombre + PIN, flags): 16 KiB sobra y acota el abuso.
const BODY_LIMIT_BYTES = 16 * 1024;

export function buildApp(
  config: Pick<Config, "LOG_LEVEL">,
  opts: BuildAppOptions = {},
): FastifyInstance {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL, ...(opts.logStream ? { stream: opts.logStream } : {}) },
    bodyLimit: BODY_LIMIT_BYTES,
  });
  void app.register(healthRoutes);
  return app;
}
