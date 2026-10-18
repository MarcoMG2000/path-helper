import { useEffect, useState } from "react";
import { fetchHealth } from "../api/health";

export type HealthState = "loading" | "ok" | "error";

type HealthCheck = () => ReturnType<typeof fetchHealth>;

export function useHealth(check: HealthCheck = () => fetchHealth()): HealthState {
  const [state, setState] = useState<HealthState>("loading");

  // `check` se usa una vez por montaje: una referencia nueva en cada render no relanza la consulta.
  useEffect(() => {
    let active = true;
    void check().then((result) => {
      if (active) setState(result.ok ? "ok" : "error");
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
