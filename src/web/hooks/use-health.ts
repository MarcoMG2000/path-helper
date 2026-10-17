import { useEffect, useState } from "react";
import { fetchHealth } from "../api/health";

export type HealthState = "loading" | "ok" | "error";

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>("loading");

  useEffect(() => {
    let active = true;
    void fetchHealth().then((result) => {
      if (active) setState(result.ok ? "ok" : "error");
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
