import { HealthStatus } from "./components/health-status";
import { useHealth } from "./hooks/use-health";
import { es } from "./i18n/es";

export function App() {
  const health = useHealth();
  return (
    <main>
      <h1>{es.appName}</h1>
      <HealthStatus state={health} />
    </main>
  );
}
