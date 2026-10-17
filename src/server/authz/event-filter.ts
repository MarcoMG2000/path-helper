import type { Actor, AuthorizationPolicy, Resource } from "./policy";

/**
 * Evento de tiempo real: un recurso (de él sale quién puede verlo) y hasta tres vistas del
 * payload, una por audiencia.
 */
export interface RealtimeEvent<P = unknown> {
  readonly type: string;
  readonly resource: Resource;
  readonly views: { readonly gm?: P; readonly owner?: P; readonly others?: P };
}

export interface ProjectedEvent<P = unknown> {
  readonly type: string;
  readonly payload: P;
}

/**
 * Payload que `actor` puede recibir de `event`, o `null`. La capa SSE (f5) DEBE emitir a
 * cada conexión solo lo que devuelva esta función (R79-R85). Sin vista sustituta: si falta la
 * vista de su audiencia, no recibe nada.
 */
export function projectEventFor<P>(
  policy: AuthorizationPolicy,
  actor: Actor,
  event: RealtimeEvent<P>,
): ProjectedEvent<P> | null {
  const audience = policy.readAudience(actor, event.resource);
  let payload: P | undefined;
  switch (audience) {
    case "owner":
      payload = event.views.owner;
      break;
    case "gm":
      payload = event.views.gm;
      break;
    case "other":
      payload = event.views.others;
      break;
    default:
      return null;
  }
  return payload === undefined ? null : { type: event.type, payload };
}
