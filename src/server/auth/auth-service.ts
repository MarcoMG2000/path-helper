import { err, normalizeName, ok, type Result, type UserDto } from "../../shared";
import type { Actor } from "../authz/policy";
import type { Clock } from "../clock";
import type { LoginAttemptStore } from "../stores/login-attempt-store";
import type { SessionStore } from "../stores/session-store";
import type { User, UserStore } from "../stores/user-store";
import type { AuthConfig } from "./config";
import { KeyedMutex } from "./keyed-mutex";
import { LoginThrottle } from "./login-throttle";
import type { PinHasher } from "./pin-hasher";
import { generateSessionToken, hashSessionToken } from "./session-token";

export interface AuthServiceDeps {
  users: UserStore;
  sessions: SessionStore;
  attempts: LoginAttemptStore;
  hasher: PinHasher;
  clock: Clock;
  config: AuthConfig;
}

export type LockedError = { code: "locked"; retryAfterSeconds: number };
export type LoginError = { code: "invalid_credentials" } | LockedError;
export type ChangePinError = { code: "invalid_current_pin" } | LockedError;

export interface LoginSuccess {
  user: UserDto;
  token: string;
  maxAgeSeconds: number;
}

export function toUserDto(user: User): UserDto {
  return { id: user.id, name: user.name, role: user.role };
}

export class AuthService {
  private readonly throttle: LoginThrottle;
  private readonly mutex = new KeyedMutex();
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly deps: AuthServiceDeps) {
    this.throttle = new LoginThrottle(deps.attempts, deps.clock, deps.config.lockout);
  }

  /** Calcula el hash ficticio (R49) antes de la primera petición; se llama al arrancar. */
  async warmUp(): Promise<void> {
    await this.getDummyHash();
  }

  // Un PIN que ningún cliente puede conocer; solo sirve para igualar el coste de verificar.
  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.deps.hasher.hash(generateSessionToken());
    return this.dummyHash;
  }

  private lockedError(lockedUntil: number): LockedError {
    const seconds = Math.ceil((lockedUntil - this.deps.clock.now()) / 1000);
    return { code: "locked", retryAfterSeconds: Math.max(1, seconds) };
  }

  async login(name: string, pin: string): Promise<Result<LoginSuccess, LoginError>> {
    const { users, sessions, hasher, clock, config } = this.deps;
    const key = normalizeName(name);
    // Exclusión mutua por clave: leer-contar-escribir es atómico entre peticiones (R48).
    return this.mutex.runExclusive(key, async (): Promise<Result<LoginSuccess, LoginError>> => {
      const state = await this.throttle.check(key);
      // R43/R44: bloqueada -> no se verifica el PIN ni se cuenta.
      if (state.locked) return err(this.lockedError(state.lockedUntil));

      const user = await users.findByNameKey(key);
      if (!user || user.disabled) {
        // R49: mismo coste que una verificación real; la respuesta es idéntica (R21-R23).
        await hasher.verify(pin, await this.getDummyHash());
        await this.throttle.recordFailure(key);
        return err({ code: "invalid_credentials" });
      }
      if (!(await hasher.verify(pin, user.pinHash))) {
        await this.throttle.recordFailure(key);
        return err({ code: "invalid_credentials" });
      }

      await this.throttle.reset(key);
      const now = clock.now();
      const token = generateSessionToken();
      await sessions.create({
        tokenHash: hashSessionToken(token),
        userId: user.id,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now + config.sessionAbsoluteTtlMs,
      });
      // Purga oportunista de sesiones caducadas.
      await sessions.deleteExpired(now, now - config.sessionIdleTtlMs);
      return ok({
        user: toUserDto(user),
        token,
        maxAgeSeconds: Math.floor(config.sessionAbsoluteTtlMs / 1000),
      });
    });
  }

  /** Idempotente (R36). */
  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.deps.sessions.delete(hashSessionToken(token));
  }

  /** R29-R34. El rol sale de la cuenta almacenada, nunca de la cookie. */
  async authenticate(token: string | undefined): Promise<Actor | null> {
    if (!token) return null;
    const { sessions, users, clock, config } = this.deps;
    const tokenHash = hashSessionToken(token);
    const session = await sessions.findByTokenHash(tokenHash);
    if (!session) return null;
    const now = clock.now();
    if (now >= session.expiresAt || now - session.lastSeenAt >= config.sessionIdleTtlMs) {
      await sessions.delete(tokenHash); // R31, R32
      return null;
    }
    const user = await users.findById(session.userId);
    if (!user || user.disabled) return null; // R33
    if (now - session.lastSeenAt > config.sessionTouchIntervalMs) {
      await sessions.touch(tokenHash, now); // R34
    }
    return { userId: user.id, role: user.role };
  }

  /** R38-R40. Comparte clave y límite de intentos con el login. */
  async changeOwnPin(
    actor: Actor,
    currentToken: string,
    currentPin: string,
    newPin: string,
  ): Promise<Result<void, ChangePinError>> {
    const { users, sessions, hasher, clock } = this.deps;
    const found = await users.findById(actor.userId);
    if (!found || found.disabled) return err({ code: "invalid_current_pin" });
    return this.mutex.runExclusive(
      found.nameKey,
      async (): Promise<Result<void, ChangePinError>> => {
        // Se relee dentro de la exclusión: el hash pudo cambiar mientras se esperaba.
        const user = await users.findById(actor.userId);
        if (!user || user.disabled) return err({ code: "invalid_current_pin" });
        const state = await this.throttle.check(user.nameKey);
        if (state.locked) return err(this.lockedError(state.lockedUntil));
        if (!(await hasher.verify(currentPin, user.pinHash))) {
          await this.throttle.recordFailure(user.nameKey); // R40
          return err({ code: "invalid_current_pin" });
        }
        await this.throttle.reset(user.nameKey);
        const pinHash = await hasher.hash(newPin);
        await users.update(user.id, { pinHash }, clock.now());
        await sessions.deleteAllForUser(user.id, hashSessionToken(currentToken));
        return ok(undefined);
      },
    );
  }
}
