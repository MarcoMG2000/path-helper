import { randomUUID } from "node:crypto";
import {
  createAccountBodySchema,
  err,
  normalizeName,
  ok,
  pinSchema,
  type AccountDto,
  type Result,
  type Role,
} from "../../shared";
import type { Clock } from "../clock";
import type { LoginAttemptStore } from "../stores/login-attempt-store";
import type { SessionStore } from "../stores/session-store";
import type { User, UserStore } from "../stores/user-store";
import type { PinHasher } from "./pin-hasher";

export type AccountError =
  | { code: "name_taken" }
  | { code: "validation_error" }
  | { code: "not_found" }
  | { code: "cannot_disable_gm" }
  | { code: "gm_exists" };

export interface AccountServiceDeps {
  users: UserStore;
  sessions: SessionStore;
  attempts: LoginAttemptStore;
  hasher: PinHasher;
  clock: Clock;
}

export function toAccountDto(user: User): AccountDto {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    disabled: user.disabled,
    createdAt: new Date(user.createdAt).toISOString(),
  };
}

export class AccountService {
  constructor(private readonly deps: AccountServiceDeps) {}

  // Valida con los schemas de src/shared aunque la ruta ya lo haga: también lo usa el CLI.
  private async createWithRole(
    role: Role,
    name: string,
    pin: string,
  ): Promise<Result<AccountDto, AccountError>> {
    const parsed = createAccountBodySchema.safeParse({ name, pin });
    if (!parsed.success) return err({ code: "validation_error" });
    const { users, hasher, clock } = this.deps;
    const now = clock.now();
    const created = await users.create({
      id: randomUUID(),
      name: parsed.data.name,
      nameKey: normalizeName(parsed.data.name),
      role,
      pinHash: await hasher.hash(parsed.data.pin),
      disabled: false,
      createdAt: now,
      updatedAt: now,
    });
    if (!created.ok) return err({ code: created.error });
    return ok(toAccountDto(created.value));
  }

  /** R1-R3. Solo crea jugadores: el rol gm solo nace por `bootstrapFirstGm` (Q10). */
  createPlayer(name: string, pin: string): Promise<Result<AccountDto, AccountError>> {
    return this.createWithRole("player", name, pin);
  }

  /** R15-R17 */
  async bootstrapFirstGm(name: string, pin: string): Promise<Result<AccountDto, AccountError>> {
    if (!createAccountBodySchema.safeParse({ name, pin }).success) {
      return err({ code: "validation_error" });
    }
    if (await this.deps.users.hasRole("gm")) return err({ code: "gm_exists" });
    return this.createWithRole("gm", name, pin);
  }

  async list(): Promise<AccountDto[]> {
    return (await this.deps.users.list()).map(toAccountDto);
  }

  async get(id: string): Promise<AccountDto | null> {
    const user = await this.deps.users.findById(id);
    return user ? toAccountDto(user) : null;
  }

  /** R5-R7: nuevo hash, revoca todas las sesiones y borra el bloqueo por intentos. */
  async resetPin(id: string, pin: string): Promise<Result<void, AccountError>> {
    if (!pinSchema.safeParse(pin).success) return err({ code: "validation_error" });
    const { users, sessions, attempts, hasher, clock } = this.deps;
    const user = await users.findById(id);
    if (!user) return err({ code: "not_found" });
    await users.update(id, { pinHash: await hasher.hash(pin) }, clock.now());
    await sessions.deleteAllForUser(id);
    await attempts.delete(user.nameKey);
    return ok(undefined);
  }

  /** R8: borra el bloqueo sin tocar el PIN. */
  async unlock(id: string): Promise<Result<void, AccountError>> {
    const user = await this.deps.users.findById(id);
    if (!user) return err({ code: "not_found" });
    await this.deps.attempts.delete(user.nameKey);
    return ok(undefined);
  }

  /** R9-R11 */
  async setDisabled(id: string, disabled: boolean): Promise<Result<AccountDto, AccountError>> {
    const { users, sessions, clock } = this.deps;
    const user = await users.findById(id);
    if (!user) return err({ code: "not_found" });
    if (disabled && user.role === "gm") return err({ code: "cannot_disable_gm" });
    const updated = await users.update(id, { disabled }, clock.now());
    if (!updated) return err({ code: "not_found" });
    if (disabled) await sessions.deleteAllForUser(id);
    return ok(toAccountDto(updated));
  }
}
