import type { ErrorBody } from "../../shared";
import type { Action, Actor, AuthorizationPolicy, Resource } from "./policy";

export type Denial = { status: 403 | 404; body: ErrorBody };

export function notFoundBody(): ErrorBody {
  return { error: { code: "not_found", message: "Recurso no encontrado" } };
}

export function forbiddenBody(): ErrorBody {
  return { error: { code: "forbidden", message: "No tienes permiso para esta operación" } };
}

/**
 * Denegación uniforme para handlers (R75-R77). Lo que el actor no puede leer es
 * indistinguible de lo que no existe (404); solo se responde 403 cuando lo puede leer
 * pero no escribir.
 */
export function authorizeOrDeny(
  policy: AuthorizationPolicy,
  actor: Actor,
  action: Action,
  resource: Resource,
): { ok: true } | { ok: false; denial: Denial } {
  if (!policy.canRead(actor, resource)) {
    return { ok: false, denial: { status: 404, body: notFoundBody() } };
  }
  if (action === "write" && !policy.canWrite(actor, resource)) {
    return { ok: false, denial: { status: 403, body: forbiddenBody() } };
  }
  return { ok: true };
}
