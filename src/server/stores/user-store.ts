import type { Result, Role } from "../../shared";

export interface User {
  id: string;
  name: string;
  /** Clave de nombre normalizada (`normalizeName`); única. */
  nameKey: string;
  role: Role;
  pinHash: string;
  disabled: boolean;
  /** epoch ms */
  createdAt: number;
  /** epoch ms */
  updatedAt: number;
}

export interface UserStore {
  /** La unicidad por `nameKey` la garantiza el store (R88). */
  create(user: User): Promise<Result<User, "name_taken">>;
  findById(id: string): Promise<User | null>;
  findByNameKey(nameKey: string): Promise<User | null>;
  /** Ordenado por `createdAt` y luego `id`. */
  list(): Promise<User[]>;
  update(
    id: string,
    patch: Partial<Pick<User, "pinHash" | "disabled">>,
    updatedAt: number,
  ): Promise<User | null>;
  hasRole(role: Role): Promise<boolean>;
}
