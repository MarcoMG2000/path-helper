import { z } from "zod";
import { err, ok, type Result } from "../../shared";

export type HealthError = "network" | "bad-status" | "bad-body";

const healthBodySchema = z.object({ status: z.literal("ok") });

// No lanza: los fallos se devuelven como resultado (docs/conventions.md §Errores).
export async function fetchHealth(
  fetchFn: typeof fetch = fetch,
): Promise<Result<{ status: "ok" }, HealthError>> {
  let response: Response;
  try {
    response = await fetchFn("/health");
  } catch {
    return err("network");
  }
  if (response.status !== 200) return err("bad-status");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return err("bad-body");
  }
  const parsed = healthBodySchema.safeParse(body);
  return parsed.success ? ok(parsed.data) : err("bad-body");
}
