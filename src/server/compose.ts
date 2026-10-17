import type { Writable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app";
import { AccountService } from "./auth/account-service";
import { AuthService } from "./auth/auth-service";
import type { AuthConfig } from "./auth/config";
import { ScryptPinHasher, type PinHasher } from "./auth/pin-hasher";
import {
  ACCOUNT_KIND_RULES,
  createAuthorizationPolicy,
  mergeKindRules,
  type KindRules,
} from "./authz";
import { SystemClock, type Clock } from "./clock";
import type { Config } from "./config";
import { PUBLIC_ROUTES, registerAuth } from "./http/auth-plugin";
import { registerErrorHandler } from "./http/errors";
import { registerOriginGuard } from "./http/origin-guard";
import { accountRoutes } from "./http/routes/account-routes";
import { authRoutes } from "./http/routes/auth-routes";
import type { LoginAttemptStore } from "./stores/login-attempt-store";
import type { SessionStore } from "./stores/session-store";
import {
  SqliteLoginAttemptStore,
  SqliteSessionStore,
  SqliteUserStore,
  openDatabase,
  type DatabaseConfig,
} from "./stores/sqlite";
import type { UserStore } from "./stores/user-store";

export interface ComposeSettings {
  auth: AuthConfig;
  database: DatabaseConfig;
}

/** Sustituciones para tests: con `stores` no se abre ninguna base de datos. */
export interface ComposeOverrides {
  stores?: { users: UserStore; sessions: SessionStore; attempts: LoginAttemptStore };
  clock?: Clock;
  hasher?: PinHasher;
  logStream?: Writable;
  /** Reglas de tipo de recurso de otras features, unidas con las de f1. */
  extraKindRules?: readonly KindRules[];
  /** Rutas adicionales sin sesión (formato "MÉTODO /patrón"), junto a las de PUBLIC_ROUTES. */
  extraPublicRoutes?: readonly string[];
}

type Stores = NonNullable<ComposeOverrides["stores"]>;

// Elige las implementaciones de Store: SQLite salvo que un test inyecte las suyas.
function composeStores(
  settings: ComposeSettings,
  overrides: Pick<ComposeOverrides, "stores">,
): { stores: Stores; close: () => void } {
  if (overrides.stores) return { stores: overrides.stores, close: () => {} };
  const db = openDatabase(settings.database.DATABASE_PATH);
  return {
    stores: {
      users: new SqliteUserStore(db),
      sessions: new SqliteSessionStore(db),
      attempts: new SqliteLoginAttemptStore(db),
    },
    close: () => db.close(),
  };
}

/** Para el CLI (npm run create-gm): el servicio de cuentas sobre la BD configurada. */
export function composeAccountService(
  settings: ComposeSettings,
  overrides: Pick<ComposeOverrides, "stores" | "clock" | "hasher"> = {},
): { accounts: AccountService; close: () => void } {
  const { stores, close } = composeStores(settings, overrides);
  const accounts = new AccountService({
    ...stores,
    clock: overrides.clock ?? new SystemClock(),
    hasher: overrides.hasher ?? new ScryptPinHasher(settings.auth.pepper),
  });
  return { accounts, close };
}

// Único punto de composición (docs/conventions.md): aquí se eligen las implementaciones
// de Store, Clock y PinHasher y se registran plugins, rutas y reglas de autorización.
export async function composeApp(
  config: Config,
  settings: ComposeSettings,
  overrides: ComposeOverrides = {},
): Promise<FastifyInstance> {
  const app = buildApp(config, overrides.logStream ? { logStream: overrides.logStream } : {});
  const authConfig = settings.auth;

  const { stores, close } = composeStores(settings, overrides);
  app.addHook("onClose", async () => {
    close();
  });
  const clock = overrides.clock ?? new SystemClock();
  const hasher = overrides.hasher ?? new ScryptPinHasher(authConfig.pepper);

  const auth = new AuthService({ ...stores, hasher, clock, config: authConfig });
  const accounts = new AccountService({ ...stores, hasher, clock });
  const policy = createAuthorizationPolicy(
    mergeKindRules(ACCOUNT_KIND_RULES, ...(overrides.extraKindRules ?? [])),
  );

  // El hash ficticio del login se calcula al arrancar, no en la primera petición (R49).
  app.addHook("onReady", async () => {
    await auth.warmUp();
  });

  registerErrorHandler(app);
  registerOriginGuard(app, authConfig.allowedOrigins);
  await registerAuth(app, {
    auth,
    cookieName: authConfig.cookieName,
    publicRoutes: [...PUBLIC_ROUTES, ...(overrides.extraPublicRoutes ?? [])],
  });
  await app.register(authRoutes, { auth, accounts, config: authConfig });
  await app.register(accountRoutes, { accounts, policy });
  return app;
}
