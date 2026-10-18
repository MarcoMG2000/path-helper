import type { UserDto } from "../../shared";
import type { ApiResult, HttpClient } from "./http-client";
import { userDtoSchema } from "./schemas";

export interface AuthApi {
  login(name: string, pin: string): Promise<ApiResult<UserDto>>;
  me(): Promise<ApiResult<UserDto>>;
  logout(): Promise<ApiResult<void>>;
  changePin(currentPin: string, newPin: string): Promise<ApiResult<void>>;
}

export function createAuthApi(http: HttpClient): AuthApi {
  return {
    login: (name, pin) =>
      http.request({
        method: "POST",
        path: "/api/auth/login",
        body: { name, pin },
        schema: userDtoSchema,
      }),
    me: () => http.request({ method: "GET", path: "/api/auth/me", schema: userDtoSchema }),
    logout: () => http.request({ method: "POST", path: "/api/auth/logout", schema: null }),
    changePin: (currentPin, newPin) =>
      http.request({
        method: "PUT",
        path: "/api/auth/pin",
        body: { currentPin, newPin },
        schema: null,
      }),
  };
}
