import { err, ok, type Result, type Role } from "../../../shared";
import type { User, UserStore } from "../user-store";

// Guarda y devuelve copias para que un test no pueda mutar el estado del store por accidente.
export class InMemoryUserStore implements UserStore {
  private readonly users = new Map<string, User>();

  async create(user: User): Promise<Result<User, "name_taken">> {
    for (const existing of this.users.values()) {
      if (existing.nameKey === user.nameKey) return err("name_taken");
    }
    // Un id repetido es un error de programación (como la PK en SQLite), no un resultado esperado.
    if (this.users.has(user.id)) throw new Error("duplicate user id");
    this.users.set(user.id, { ...user });
    return ok({ ...user });
  }

  async findById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async findByNameKey(nameKey: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.nameKey === nameKey) return { ...user };
    }
    return null;
  }

  async list(): Promise<User[]> {
    return [...this.users.values()]
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((user) => ({ ...user }));
  }

  async update(
    id: string,
    patch: Partial<Pick<User, "pinHash" | "disabled">>,
    updatedAt: number,
  ): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    if (patch.pinHash !== undefined) user.pinHash = patch.pinHash;
    if (patch.disabled !== undefined) user.disabled = patch.disabled;
    user.updatedAt = updatedAt;
    return { ...user };
  }

  async hasRole(role: Role): Promise<boolean> {
    return [...this.users.values()].some((user) => user.role === role);
  }

  /** Solo para tests: cambia el rol directamente (no hay API pública para ello, Q10). */
  testOnlySetRole(id: string, role: Role): void {
    const user = this.users.get(id);
    if (user) user.role = role;
  }

  /** Solo para tests: elimina una cuenta (f1 no permite borrar cuentas, Q11). */
  testOnlyRemove(id: string): void {
    this.users.delete(id);
  }

  /** Solo para tests (R57): contenido completo, serializable. */
  dump(): User[] {
    return [...this.users.values()].map((user) => ({ ...user }));
  }
}
