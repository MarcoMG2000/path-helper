import fastifyCookie from "@fastify/cookie";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "../../shared";
import type { AuthService } from "../auth/auth-service";
import type { Actor } from "../authz/policy";
import { forbiddenBody } from "../authz/http-denial";
import { sendError, unauthenticatedBody } from "./errors";

declare module "fastify" {
  interface FastifyRequest {
    /** Actor resuelto desde la sesión; `null` si no hay sesión válida o la ruta es pública. */
    actor: Actor | null;
  }
}

/** "MÉTODO patrón" de las rutas que no exigen sesión. Solo se amplía desde compose.ts. */
export const PUBLIC_ROUTES: readonly string[] = [
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "GET /health",
];

export interface AuthPluginOptions {
  auth: AuthService;
  cookieName: string;
  publicRoutes?: readonly string[];
}

// Un patrón de ruta registrado (p. ej. "/api/accounts/:id") o, si la petición no casó con
// ninguna ruta (404), la ruta pedida normalizada de la forma más conservadora posible.
function protectedByDefault(request: FastifyRequest): boolean {
  const pattern = request.routeOptions.url;
  const path = pattern ?? safeDecodedPath(request.url);
  return path.startsWith("/api");
}

function safeDecodedPath(url: string): string {
  const raw = url.split("?")[0] ?? "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Codificación inválida: se trata tal cual (el prefijo se comprueba igualmente).
  }
  // Minúsculas y barras repetidas colapsadas: ante la duda, se considera ruta de la API.
  return decoded.toLowerCase().replace(/\/{2,}/g, "/");
}

/**
 * Registra la lectura de la cookie y el hook global "denegar por defecto" (R30, R78): toda
 * ruta bajo /api que no esté en la lista pública exige sesión, aunque no declare guarda propia.
 * Se llama sobre la instancia raíz, ANTES de registrar las rutas.
 */
export async function registerAuth(app: FastifyInstance, opts: AuthPluginOptions): Promise<void> {
  const publicRoutes = new Set(opts.publicRoutes ?? PUBLIC_ROUTES);
  await app.register(fastifyCookie);
  app.decorateRequest("actor", null);

  app.addHook("onRequest", async (request, reply) => {
    request.actor = null;
    const isPublic = publicRoutes.has(`${request.method} ${request.routeOptions.url ?? ""}`);
    if (!protectedByDefault(request)) return;
    // Review B-3 de f1: toda respuesta bajo /api (también las rutas públicas de login y logout) no se cachea.
    reply.header("Cache-Control", "no-store");
    if (isPublic) return;
    const actor = await opts.auth.authenticate(request.cookies[opts.cookieName]);
    if (!actor) return sendError(reply, 401, unauthenticatedBody());
    request.actor = actor;
  });
}

/** preHandler que exige un rol concreto (R14). Va detrás del hook global (que ya dio 401). */
export function requireRole(role: Role) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> => {
    if (!request.actor) return sendError(reply, 401, unauthenticatedBody());
    if (request.actor.role !== role) return sendError(reply, 403, forbiddenBody());
  };
}
