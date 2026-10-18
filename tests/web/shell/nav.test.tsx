// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { es } from "../../../src/web/i18n/es";
import { loadSections } from "../../../src/web/shell/load-sections";
import { defineSection } from "../../../src/web/shell/sections";
import { GM, makeServices, PLAYER } from "../helpers/fake-services";
import { renderApp } from "../helpers/render-app";

const sections = loadSections();
const Dummy = () => <p>pantalla</p>;
const extra = [
  defineSection({
    id: "ficha",
    path: "/ficha",
    label: "Ficha",
    roles: ["player", "gm"],
    order: 10,
    Component: Dummy,
  }),
  defineSection({
    id: "combate",
    path: "/combate",
    label: "Combate",
    roles: ["gm"],
    order: 20,
    Component: Dummy,
  }),
  defineSection({
    id: "secreta",
    path: "/secreta",
    label: "Secreta",
    roles: ["player", "gm"],
    order: 1,
    Component: Dummy,
    hidden: true,
  }),
];

async function navLabels(services = makeServices({ me: GM }), route = "/") {
  const app = renderApp({ route, sections: [...sections, ...extra], services });
  const nav = await screen.findByRole("navigation", { name: es.a11y.mainNav });
  return { app, nav, labels: Array.from(nav.querySelectorAll("a")).map((a) => a.textContent) };
}

describe("Nav", () => {
  it("R32: el GM ve Inicio y las secciones de su rol ordenadas por order (sin las hidden)", async () => {
    const { labels } = await navLabels();
    expect(labels).toEqual([es.nav.home, "Ficha", "Combate", es.nav.accounts, es.nav.profile]);
  });

  it("R32: el jugador solo ve las secciones cuyo roles lo incluye", async () => {
    const { labels } = await navLabels(makeServices({ me: PLAYER }));
    expect(labels).toEqual([es.nav.home, "Ficha", es.nav.profile]);
  });

  it("R32: la ruta actual se marca con aria-current=page y las demás no", async () => {
    const { nav } = await navLabels(makeServices({ me: GM }), "/perfil");
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe(es.nav.profile);
  });

  it("R32: Inicio solo se marca en la raíz", async () => {
    const { nav } = await navLabels();
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(Array.from(current).map((a) => a.textContent)).toEqual([es.nav.home]);
  });

  it("R33: una sección ficticia aparece en la navegación sin modificar el shell", async () => {
    const { labels } = await navLabels();
    expect(labels).toContain("Combate");
  });

  it("R32: la navegación cambia la ruta y mueve la marca actual", async () => {
    const { app, nav } = await navLabels();
    await app.user.click(within(nav).getByRole("link", { name: es.nav.accounts }));
    await screen.findByRole("heading", { level: 1, name: es.accounts.title });
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe(es.nav.accounts);
  });
});
