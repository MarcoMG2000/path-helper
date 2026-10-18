import { vi, type Mock } from "vitest";
import { err, ok, type AccountDto, type UserDto } from "../../../src/shared";
import type { AppServices } from "../../../src/web/api/services";
import type { ApiError } from "../../../src/web/api/http-client";

export const PLAYER: UserDto = { id: "p1", name: "Marta", role: "player" };
export const GM: UserDto = { id: "g1", name: "Gandalf", role: "gm" };

export function apiError(code: ApiError["code"], extra: Partial<ApiError> = {}): ApiError {
  return { status: 400, code, ...extra };
}

export function makeAccount(overrides: Partial<AccountDto> = {}): AccountDto {
  return {
    id: "p1",
    name: "Marta",
    role: "player",
    disabled: false,
    createdAt: "2026-10-18T10:00:00.000Z",
    ...overrides,
  };
}

type Fn<K extends keyof AppServices> = AppServices[K];

export interface FakeServices extends AppServices {
  auth: { [K in keyof AppServices["auth"]]: Mock<AppServices["auth"][K]> };
  accounts: { [K in keyof AppServices["accounts"]]: Mock<AppServices["accounts"][K]> };
  checkHealth: Mock<Fn<"checkHealth">>;
  /** Simula un 401 `unauthenticated` recibido por el cliente HTTP. */
  emitUnauthenticated(): void;
}

/** Todas las llamadas devuelven `ok` por defecto; `me` devuelve 401 salvo que se indique. */
export function makeServices(
  overrides: {
    me?: UserDto | ApiError;
    accountsList?: AccountDto[];
  } = {},
): FakeServices {
  const handlers = new Set<() => void>();
  const me = overrides.me ?? apiError("unauthenticated", { status: 401 });
  const meResult = "role" in me ? ok(me) : err(me);
  const services: FakeServices = {
    auth: {
      login: vi.fn(async (name: string) => ok({ id: "u1", name, role: "player" as const })),
      me: vi.fn(async () => meResult),
      logout: vi.fn(async () => ok(undefined)),
      changePin: vi.fn(async () => ok(undefined)),
    },
    accounts: {
      list: vi.fn(async () => ok(overrides.accountsList ?? [])),
      create: vi.fn(async (name: string) => ok(makeAccount({ id: "new", name }))),
      resetPin: vi.fn(async () => ok(undefined)),
      setDisabled: vi.fn(async (id: string, disabled: boolean) => {
        const known = (overrides.accountsList ?? []).find((a) => a.id === id);
        return ok({ ...(known ?? makeAccount({ id })), disabled });
      }),
      unlock: vi.fn(async () => ok(undefined)),
    },
    checkHealth: vi.fn(async () => ok({ status: "ok" as const })),
    onUnauthenticated(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    emitUnauthenticated() {
      for (const handler of [...handlers]) handler();
    },
  };
  return services;
}
