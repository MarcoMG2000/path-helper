// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getLegalNotice } from "../../../../src/data/legal";
import { es } from "../../../../src/web/i18n/es";
import { loadSections } from "../../../../src/web/shell/load-sections";
import { makeServices } from "../../helpers/fake-services";
import { renderApp } from "../../helpers/render-app";

const notice = getLegalNotice();

describe("LegalPage", () => {
  it("R71: muestra el aviso de proyecto no oficial, la Section 15 y la OGL idénticos a getLegalNotice()", async () => {
    renderApp({ route: "/legal", sections: loadSections(), services: makeServices() });
    await screen.findByRole("heading", { level: 1, name: es.legal.title });

    const unofficial = screen.getByRole("region", { name: es.legal.unofficial });
    expect(within(unofficial).getByText(notice.unofficialNotice)).toBeTruthy();

    const section15 = screen.getByRole("region", { name: es.legal.section15 });
    const entries = within(section15)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(entries).toEqual(notice.section15);

    const details = screen.getByText(es.legal.ogl).closest("details");
    expect(details).not.toBeNull();
    const paragraphs = Array.from(details!.querySelectorAll("p")).map((p) => p.textContent);
    expect(paragraphs).toEqual(notice.oglText.split("\n\n"));
    expect(paragraphs.join("\n\n")).toBe(notice.oglText);
  });

  it("R71: el texto íntegro de la OGL empieza por su título y la Section 15 no está vacía", async () => {
    renderApp({ route: "/legal", sections: loadSections(), services: makeServices() });
    await screen.findByRole("heading", { level: 1, name: es.legal.title });
    expect(screen.getByText("OPEN GAME LICENSE Version 1.0a")).toBeTruthy();
    expect(notice.section15.length).toBeGreaterThan(0);
  });

  it("R29: es pública, ofrece «Volver» y no pide login", async () => {
    const app = renderApp({ route: "/legal", sections: loadSections(), services: makeServices() });
    await screen.findByRole("heading", { level: 1, name: es.legal.title });
    expect(app.location().pathname).toBe("/legal");
    expect(screen.getByRole("link", { name: es.common.back }).getAttribute("href")).toBe("/");
  });
});
