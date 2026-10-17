import type { KindRules } from "./policy";

/**
 * Reglas de los tipos de recurso propios de f1. Cada feature declara las suyas en su propio
 * fichero y `compose.ts` las une con `mergeKindRules`.
 *
 * `account` (ownerId = id de la cuenta): el propio jugador y el GM la leen; solo el GM
 * administra cuentas. El cambio de PIN propio va por `AuthService`, no por `canWrite`.
 */
export const ACCOUNT_KIND_RULES: KindRules = {
  account: { scope: "owned", ownerWrite: false, gmRead: true, gmWrite: true },
};
