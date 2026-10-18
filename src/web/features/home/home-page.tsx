import { Link } from "react-router";
import { useServices } from "../../api/services";
import { HealthStatus } from "../../components/health-status";
import { useHealth } from "../../hooks/use-health";
import { es } from "../../i18n/es";
import { Page } from "../../shell/page";
import { visibleSections, type AppSection } from "../../shell/sections";
import { useUser } from "../../session/session-context";

// R40: saludo, acceso a cada sección visible para el rol e indicador de estado de la API.
export function HomePage({ sections }: { sections: readonly AppSection[] }) {
  const user = useUser();
  const { checkHealth } = useServices();
  const health = useHealth(checkHealth);
  const visible = visibleSections(sections, user.role);
  return (
    <Page title={es.home.greeting(user.name)} documentTitle={es.nav.home}>
      <section className="ph-card" aria-labelledby="home-sections">
        <h2 id="home-sections">{es.home.sections}</h2>
        {visible.length > 0 ? (
          <ul className="ph-list">
            {visible.map((section) => (
              <li key={section.id}>
                <Link className="ph-button ph-button--block" to={section.path}>
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>{es.home.noSections}</p>
        )}
      </section>
      <HealthStatus state={health} />
    </Page>
  );
}
