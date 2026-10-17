import type { FastifyError, FastifyInstance, FastifyReply } from "fastify";
import type { ErrorBody, ErrorCode } from "../../shared";

export function errorBody(code: ErrorCode, message: string): ErrorBody {
  return { error: { code, message } };
}

export const unauthenticatedBody = (): ErrorBody =>
  errorBody("unauthenticated", "Sesión no válida o caducada");
export const validationBody = (): ErrorBody =>
  errorBody("validation_error", "Los datos enviados no son válidos");
export const invalidCredentialsBody = (): ErrorBody =>
  errorBody("invalid_credentials", "Nombre o PIN incorrectos");
export const lockedBody = (): ErrorBody =>
  errorBody("locked", "Demasiados intentos fallidos; inténtalo más tarde");

export function sendError(reply: FastifyReply, status: number, body: ErrorBody): FastifyReply {
  return reply.code(status).send(body);
}

/**
 * Manejador de errores común: los errores 4xx de Fastify (JSON mal formado, cuerpo demasiado
 * grande...) salen con la forma ErrorBody y SIN registrar el mensaje original, que puede citar
 * un fragmento del cuerpo (y por tanto un PIN). Los 5xx no filtran detalles al cliente.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status =
      typeof error.statusCode === "number" && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) {
      request.log.error({ err: error }, "unhandled error");
      return sendError(reply, 500, errorBody("internal_error", "Error interno"));
    }
    request.log.info({ code: error.code, status }, "request rejected");
    return sendError(reply, status, validationBody());
  });
}
