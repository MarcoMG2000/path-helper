import { es } from "../i18n/es";

export const MAIN_ID = "contenido";

export function SkipLink() {
  return (
    <a className="ph-skip" href={`#${MAIN_ID}`}>
      {es.a11y.skipToContent}
    </a>
  );
}
