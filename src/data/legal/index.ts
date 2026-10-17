import { OGL_TEXT } from "./ogl-1.0a";
import section15 from "./section15.json";

// Aviso legal (R37-R39). La pantalla que lo muestra la monta otra feature (Q6, R40).

export interface LegalNotice {
  /** Texto íntegro de la Open Game License v1.0a. */
  oglText: string;
  /** Avisos de copyright de la Section 15 (CRB, PRD y las fuentes de las que derivan). */
  section15: string[];
  /** Declaración de proyecto no oficial y sin afiliación. */
  unofficialNotice: string;
}

export const UNOFFICIAL_NOTICE =
  "Este proyecto es una herramienta no oficial, sin afiliación con Paizo Inc. ni con Wizards of the " +
  "Coast. No utiliza marcas ni Product Identity de Paizo. Los datos de reglas proceden del Open Game " +
  "Content del Pathfinder Roleplaying Game Core Rulebook (Pathfinder Reference Document), " +
  "distribuido bajo la Open Game License v1.0a.";

export function getLegalNotice(): LegalNotice {
  return {
    oglText: OGL_TEXT,
    section15: [...(section15 as string[])],
    unofficialNotice: UNOFFICIAL_NOTICE,
  };
}

/** Contenido canónico de `LICENSE-OGL.md` (R38: el módulo y el fichero dicen lo mismo). */
export function renderLegalMarkdown(notice: LegalNotice = getLegalNotice()): string {
  return (
    [
      "# Open Game License v1.0a y avisos de copyright",
      "",
      "## Open Game License",
      "",
      notice.oglText,
      "",
      "## Section 15: Copyright Notice",
      "",
      notice.section15.join("\n\n"),
      "",
      "## Aviso de proyecto no oficial",
      "",
      notice.unofficialNotice,
    ].join("\n") + "\n"
  );
}
