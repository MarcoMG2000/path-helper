import { z } from "zod";
import type { AccountDto } from "../../shared";
import type { ApiResult, HttpClient } from "./http-client";
import { accountDtoSchema } from "./schemas";

export interface AccountsApi {
  list(): Promise<ApiResult<AccountDto[]>>;
  create(name: string, pin: string): Promise<ApiResult<AccountDto>>;
  resetPin(id: string, pin: string): Promise<ApiResult<void>>;
  setDisabled(id: string, disabled: boolean): Promise<ApiResult<AccountDto>>;
  unlock(id: string): Promise<ApiResult<void>>;
}

const accountListSchema = z.array(accountDtoSchema);

export function createAccountsApi(http: HttpClient): AccountsApi {
  const path = (id: string, suffix = "") => `/api/accounts/${encodeURIComponent(id)}${suffix}`;
  return {
    list: () => http.request({ method: "GET", path: "/api/accounts", schema: accountListSchema }),
    create: (name, pin) =>
      http.request({
        method: "POST",
        path: "/api/accounts",
        body: { name, pin },
        schema: accountDtoSchema,
      }),
    resetPin: (id, pin) =>
      http.request({ method: "PUT", path: path(id, "/pin"), body: { pin }, schema: null }),
    setDisabled: (id, disabled) =>
      http.request({
        method: "PATCH",
        path: path(id),
        body: { disabled },
        schema: accountDtoSchema,
      }),
    unlock: (id) => http.request({ method: "POST", path: path(id, "/unlock"), schema: null }),
  };
}
