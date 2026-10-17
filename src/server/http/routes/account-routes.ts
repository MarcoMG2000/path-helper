import type { FastifyPluginAsync } from "fastify";
import {
  createAccountBodySchema,
  patchAccountBodySchema,
  resetPinBodySchema,
  type ErrorBody,
  type UserDto,
} from "../../../shared";
import type { AccountError, AccountService } from "../../auth/account-service";
import { authorizeOrDeny, notFoundBody } from "../../authz/http-denial";
import type { AuthorizationPolicy } from "../../authz/policy";
import { requireRole } from "../auth-plugin";
import { errorBody, sendError, unauthenticatedBody, validationBody } from "../errors";

export interface AccountRoutesOptions {
  accounts: AccountService;
  policy: AuthorizationPolicy;
}

const ACCOUNT_ERRORS: Record<AccountError["code"], { status: number; body: ErrorBody }> = {
  name_taken: { status: 409, body: errorBody("name_taken", "Ya existe una cuenta con ese nombre") },
  validation_error: { status: 400, body: validationBody() },
  not_found: { status: 404, body: notFoundBody() },
  cannot_disable_gm: {
    status: 409,
    body: errorBody("cannot_disable_gm", "No se puede deshabilitar la cuenta del GM"),
  },
  gm_exists: { status: 409, body: errorBody("gm_exists", "Ya existe una cuenta de GM") },
};

export const accountRoutes: FastifyPluginAsync<AccountRoutesOptions> = async (app, opts) => {
  const { accounts, policy } = opts;
  const gmOnly = { preHandler: requireRole("gm") };

  // R4, R13, R14
  app.get("/api/accounts", gmOnly, async (_request, reply) => {
    return reply.code(200).send(await accounts.list());
  });

  // R1-R3
  app.post("/api/accounts", gmOnly, async (request, reply) => {
    const body = createAccountBodySchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, validationBody());
    const result = await accounts.createPlayer(body.data.name, body.data.pin);
    if (!result.ok) {
      const mapped = ACCOUNT_ERRORS[result.error.code];
      return sendError(reply, mapped.status, mapped.body);
    }
    return reply.code(201).send(result.value);
  });

  // R63-R65: la política decide ANTES de tocar el store; denegado == inexistente (404).
  app.get<{ Params: { id: string } }>("/api/accounts/:id", async (request, reply) => {
    const actor = request.actor;
    if (!actor) return sendError(reply, 401, unauthenticatedBody());
    const { id } = request.params;
    const verdict = authorizeOrDeny(policy, actor, "read", { kind: "account", ownerId: id });
    if (!verdict.ok) return sendError(reply, verdict.denial.status, verdict.denial.body);
    const account = await accounts.get(id);
    if (!account) return sendError(reply, 404, notFoundBody());
    const dto: UserDto = { id: account.id, name: account.name, role: account.role };
    return reply.code(200).send(dto);
  });

  // R5-R7, R12
  app.put<{ Params: { id: string } }>("/api/accounts/:id/pin", gmOnly, async (request, reply) => {
    const body = resetPinBodySchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, validationBody());
    const result = await accounts.resetPin(request.params.id, body.data.pin);
    if (!result.ok) {
      const mapped = ACCOUNT_ERRORS[result.error.code];
      return sendError(reply, mapped.status, mapped.body);
    }
    return reply.code(204).send();
  });

  // R8
  app.post<{ Params: { id: string } }>(
    "/api/accounts/:id/unlock",
    gmOnly,
    async (request, reply) => {
      const result = await accounts.unlock(request.params.id);
      if (!result.ok) {
        const mapped = ACCOUNT_ERRORS[result.error.code];
        return sendError(reply, mapped.status, mapped.body);
      }
      return reply.code(204).send();
    },
  );

  // R9-R11
  app.patch<{ Params: { id: string } }>("/api/accounts/:id", gmOnly, async (request, reply) => {
    const body = patchAccountBodySchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, validationBody());
    const result = await accounts.setDisabled(request.params.id, body.data.disabled);
    if (!result.ok) {
      const mapped = ACCOUNT_ERRORS[result.error.code];
      return sendError(reply, mapped.status, mapped.body);
    }
    return reply.code(200).send(result.value);
  });
};
