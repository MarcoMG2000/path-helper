import type { FastifyInstance } from "fastify";
import { errorBody, sendError } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Segunda barrera anti-CSRF (la primera es SameSite=Strict): un método mutante con cabecera
 * Origin fuera de la lista se rechaza antes de ejecutar nada (R62). Sin cabecera Origin se
 * permite: un navegador siempre la envía en peticiones mutantes cross-site; curl y los tests no.
 */
export function registerOriginGuard(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  const allowed = new Set(allowedOrigins);
  app.addHook("onRequest", async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin === undefined) return;
    if (typeof origin !== "string" || !allowed.has(origin)) {
      return sendError(reply, 403, errorBody("bad_origin", "Origen no permitido"));
    }
  });
}
