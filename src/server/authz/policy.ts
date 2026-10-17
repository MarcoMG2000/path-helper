import type { Role } from "../../shared";

export type Action = "read" | "write";

export interface Actor {
  readonly userId: string;
  readonly role: Role;
}

export interface Resource {
  readonly kind: string;
  readonly ownerId?: string | null;
}

export interface ResourceKindRule {
  /** 'owned': pertenece a un jugador (ownerId obligatorio). 'shared': sin dueño, lo leen todos. */
  readonly scope: "owned" | "shared";
  /** owned: ¿puede el propietario escribir? (leer siempre puede) */
  readonly ownerWrite: boolean;
  /** owned: ¿puede el GM leer lo ajeno? (shared: ignorado, todos leen) */
  readonly gmRead: boolean;
  /** ¿puede el GM escribir? (owned ajeno o shared) */
  readonly gmWrite: boolean;
}

export type KindRules = Readonly<Record<string, ResourceKindRule>>;

/** R74: une conjuntos de reglas; un `kind` registrado dos veces es un error de programación. */
export function mergeKindRules(...sets: KindRules[]): KindRules {
  const merged: Record<string, ResourceKindRule> = Object.create(null) as Record<
    string,
    ResourceKindRule
  >;
  for (const set of sets) {
    for (const [kind, rule] of Object.entries(set)) {
      if (Object.hasOwn(merged, kind)) {
        throw new Error(`Tipo de recurso duplicado en las reglas de autorización: "${kind}"`);
      }
      merged[kind] = rule;
    }
  }
  return merged;
}

export type ReadAudience = "owner" | "gm" | "other" | "none";

export interface AuthorizationPolicy {
  canRead(actor: Actor, resource: Resource): boolean;
  canWrite(actor: Actor, resource: Resource): boolean;
  /** Qué vista de un evento sobre `resource` puede ver `actor` (base de canRead y del filtro SSE). */
  readAudience(actor: Actor, resource: Resource): ReadAudience;
}

/**
 * Política central de autorización. Denegar por defecto: cualquier caso no contemplado
 * (kind desconocido, recurso `owned` sin dueño, jugador ajeno) devuelve `false`/`none`.
 */
export function createAuthorizationPolicy(rules: KindRules): AuthorizationPolicy {
  function ruleFor(resource: Resource): ResourceKindRule | undefined {
    // hasOwn evita resolver "constructor"/"__proto__" como un tipo registrado.
    return Object.hasOwn(rules, resource.kind) ? rules[resource.kind] : undefined;
  }

  function readAudience(actor: Actor, resource: Resource): ReadAudience {
    const rule = ruleFor(resource);
    if (!rule) return "none"; // R73
    if (rule.scope === "shared") return actor.role === "gm" ? "gm" : "other"; // R71
    if (!resource.ownerId) return "none"; // R73: owned sin dueño, incluso para el GM
    if (actor.userId === resource.ownerId) return "owner"; // R66
    if (actor.role === "gm") return rule.gmRead ? "gm" : "none"; // R68
    return "none"; // R67
  }

  function canWrite(actor: Actor, resource: Resource): boolean {
    const rule = ruleFor(resource);
    if (!rule) return false;
    if (rule.scope === "shared") return actor.role === "gm" && rule.gmWrite; // R72
    if (!resource.ownerId) return false;
    if (actor.userId === resource.ownerId) return rule.ownerWrite; // R69
    if (actor.role === "gm") return rule.gmWrite; // R70
    return false; // R67
  }

  return {
    readAudience,
    canRead: (actor, resource) => readAudience(actor, resource) !== "none",
    canWrite,
  };
}
