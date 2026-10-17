import { err, ok, type Result, type Role } from "../../../shared";
import type { User, UserStore } from "../user-store";
import type { SqliteDatabase } from "./database";

interface UserRow {
  id: string;
  name: string;
  name_key: string;
  role: Role;
  pin_hash: string;
  disabled: number;
  created_at: number;
  updated_at: number;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.name_key,
    role: row.role,
    pinHash: row.pin_hash,
    disabled: row.disabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteUserStore implements UserStore {
  constructor(private readonly db: SqliteDatabase) {}

  async create(user: User): Promise<Result<User, "name_taken">> {
    const existing = this.db.prepare("SELECT 1 FROM users WHERE name_key = ?").get(user.nameKey);
    if (existing) return err("name_taken");
    try {
      this.db
        .prepare(
          `INSERT INTO users (id, name, name_key, role, pin_hash, disabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          user.id,
          user.name,
          user.nameKey,
          user.role,
          user.pinHash,
          user.disabled ? 1 : 0,
          user.createdAt,
          user.updatedAt,
        );
    } catch (error) {
      // La restricción UNIQUE es la garantía real ante una carrera entre procesos.
      if (isUniqueViolation(error, "users.name_key")) return err("name_taken");
      throw error;
    }
    return ok({ ...user });
  }

  async findById(id: string): Promise<User | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as
      UserRow | undefined;
    return row ? toUser(row) : null;
  }

  async findByNameKey(nameKey: string): Promise<User | null> {
    const row = this.db
      .prepare("SELECT * FROM users WHERE name_key = ?")
      .get(nameKey) as unknown as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  async list(): Promise<User[]> {
    const rows = this.db
      .prepare("SELECT * FROM users ORDER BY created_at, id")
      .all() as unknown as UserRow[];
    return rows.map(toUser);
  }

  async update(
    id: string,
    patch: Partial<Pick<User, "pinHash" | "disabled">>,
    updatedAt: number,
  ): Promise<User | null> {
    this.db
      .prepare(
        `UPDATE users SET
           pin_hash = COALESCE(?, pin_hash),
           disabled = COALESCE(?, disabled),
           updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.pinHash ?? null,
        patch.disabled === undefined ? null : patch.disabled ? 1 : 0,
        updatedAt,
        id,
      );
    return this.findById(id);
  }

  async hasRole(role: Role): Promise<boolean> {
    return this.db.prepare("SELECT 1 FROM users WHERE role = ? LIMIT 1").get(role) !== undefined;
  }
}

function isUniqueViolation(error: unknown, column: string): boolean {
  return error instanceof Error && error.message.includes(`UNIQUE constraint failed: ${column}`);
}
