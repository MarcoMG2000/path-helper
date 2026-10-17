import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { changePinBodySchema, loginBodySchema, type UserDto } from "../../../shared";
import type { AccountService } from "../../auth/account-service";
import type { AuthService, LockedError } from "../../auth/auth-service";
import type { AuthConfig } from "../../auth/config";
import {
  errorBody,
  invalidCredentialsBody,
  lockedBody,
  sendError,
  validationBody,
} from "../errors";

export interface AuthRoutesOptions {
  auth: AuthService;
  accounts: AccountService;
  config: Pick<AuthConfig, "cookieName" | "cookieSecure">;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, opts) => {
  const { auth, accounts, config } = opts;
  const baseCookie: CookieSerializeOptions = {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: config.cookieSecure,
  };

  function sendLocked(reply: FastifyReply, error: LockedError): FastifyReply {
    reply.header("Retry-After", String(error.retryAfterSeconds));
    return sendError(reply, 429, lockedBody());
  }

  // R18-R26, R41-R49
  app.post("/api/auth/login", async (request, reply) => {
    const body = loginBodySchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, validationBody());
    const result = await auth.login(body.data.name, body.data.pin);
    if (!result.ok) {
      if (result.error.code === "locked") return sendLocked(reply, result.error);
      return sendError(reply, 401, invalidCredentialsBody());
    }
    reply.setCookie(config.cookieName, result.value.token, {
      ...baseCookie,
      maxAge: result.value.maxAgeSeconds,
    });
    return reply.code(200).send(result.value.user);
  });

  // R35, R36: idempotente, siempre 204 y cookie expirada.
  app.post("/api/auth/logout", async (request, reply) => {
    await auth.logout(request.cookies[config.cookieName]);
    reply.setCookie(config.cookieName, "", { ...baseCookie, maxAge: 0, expires: new Date(0) });
    return reply.code(204).send();
  });

  // R37
  app.get("/api/auth/me", async (request, reply) => {
    const actor = request.actor;
    const account = actor ? await accounts.get(actor.userId) : null;
    if (!account) return sendError(reply, 401, errorBody("unauthenticated", "Sesión no válida"));
    const dto: UserDto = { id: account.id, name: account.name, role: account.role };
    return reply.code(200).send(dto);
  });

  // R38-R40, R92
  app.put("/api/auth/pin", async (request, reply) => {
    const actor = request.actor;
    const token = request.cookies[config.cookieName];
    if (!actor || !token)
      return sendError(reply, 401, errorBody("unauthenticated", "Sesión no válida"));
    const body = changePinBodySchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, validationBody());
    const result = await auth.changeOwnPin(actor, token, body.data.currentPin, body.data.newPin);
    if (!result.ok) {
      if (result.error.code === "locked") return sendLocked(reply, result.error);
      return sendError(
        reply,
        403,
        errorBody("invalid_current_pin", "El PIN actual no es correcto"),
      );
    }
    return reply.code(204).send();
  });
};
