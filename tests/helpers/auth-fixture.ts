import { AccountService } from "../../src/server/auth/account-service";
import { AuthService } from "../../src/server/auth/auth-service";
import type { AuthConfig } from "../../src/server/auth/config";
import { DEFAULT_LOCKOUT } from "../../src/server/auth/config";
import {
  InMemoryLoginAttemptStore,
  InMemorySessionStore,
  InMemoryUserStore,
} from "../../src/server/stores/in-memory";
import { FakeClock } from "./fake-clock";
import { SpyPinHasher } from "./spy-pin-hasher";

export const TEST_PEPPER = "test-pepper-0123456789-0123456789-abcdef";
export const TEST_ORIGIN = "http://localhost:5173";

export function makeAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    pepper: TEST_PEPPER,
    cookieSecure: false,
    cookieName: "ph_session",
    allowedOrigins: [TEST_ORIGIN],
    sessionIdleTtlMs: 7 * 86_400_000,
    sessionAbsoluteTtlMs: 30 * 86_400_000,
    sessionTouchIntervalMs: 60_000,
    lockout: { ...DEFAULT_LOCKOUT },
    ...overrides,
  };
}

export interface AuthFixture {
  users: InMemoryUserStore;
  sessions: InMemorySessionStore;
  attempts: InMemoryLoginAttemptStore;
  hasher: SpyPinHasher;
  clock: FakeClock;
  config: AuthConfig;
  auth: AuthService;
  accounts: AccountService;
}

export function makeAuthFixture(
  opts: { config?: Partial<AuthConfig>; hasher?: SpyPinHasher } = {},
): AuthFixture {
  const users = new InMemoryUserStore();
  const sessions = new InMemorySessionStore();
  const attempts = new InMemoryLoginAttemptStore();
  const hasher = opts.hasher ?? new SpyPinHasher();
  const clock = new FakeClock();
  const config = makeAuthConfig(opts.config);
  const auth = new AuthService({ users, sessions, attempts, hasher, clock, config });
  const accounts = new AccountService({ users, sessions, attempts, hasher, clock });
  return { users, sessions, attempts, hasher, clock, config, auth, accounts };
}
