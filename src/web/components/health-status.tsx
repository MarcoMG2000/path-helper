import { es } from "../i18n/es";
import type { HealthState } from "../hooks/use-health";

export function HealthStatus({ state }: { state: HealthState }) {
  return (
    <p role="status" data-state={state}>
      {es.health[state]}
    </p>
  );
}
