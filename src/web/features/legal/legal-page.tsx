import { Link } from "react-router";
// Solo este módulo pequeño (R73): nunca el barrel src/data ni las categorías (arrastrarían los datasets).
import { getLegalNotice } from "../../../data/legal";
import { es } from "../../i18n/es";
import { Page } from "../../shell/page";

const notice = getLegalNotice();
// `ogl-1.0a.ts` une los párrafos con una línea en blanco.
const oglParagraphs = notice.oglText.split("\n\n");

// R71: texto como nodos de React (sin dangerouslySetInnerHTML, R72). Pública (R29).
export function LegalPage() {
  return (
    <Page title={es.legal.title}>
      <section className="ph-card" aria-labelledby="legal-unofficial">
        <h2 id="legal-unofficial">{es.legal.unofficial}</h2>
        <p>{notice.unofficialNotice}</p>
      </section>
      <section className="ph-card" aria-labelledby="legal-section15">
        <h2 id="legal-section15">{es.legal.section15}</h2>
        <ul>
          {notice.section15.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </section>
      <details className="ph-card ph-details">
        <summary>{es.legal.ogl}</summary>
        <div className="ph-legal-text">
          {oglParagraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </details>
      <Link className="ph-button" to="/">
        {es.common.back}
      </Link>
    </Page>
  );
}
