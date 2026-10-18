import { describe, expect, it } from "vitest";
import { loadSections } from "../../../src/web/shell/load-sections";
import {
  defineSection,
  RESERVED_PATHS,
  validateSections,
  visibleSections,
  type AppSection,
} from "../../../src/web/shell/sections";

const Dummy = () => null;
const make = (overrides: Partial<AppSection> = {}): AppSection =>
  defineSection({
    id: "demo",
    path: "/demo",
    label: "Demo",
    roles: ["player", "gm"],
    order: 10,
    Component: Dummy,
    ...overrides,
  });

describe("loadSections", () => {
  it("R34: descubre las secciones de features/*/section.tsx (profile y accounts) ordenadas", () => {
    const sections = loadSections();
    expect(sections.map((s) => s.id)).toEqual(["accounts", "profile"]);
    expect(sections.map((s) => s.path)).toEqual(["/cuentas", "/perfil"]);
    expect(sections.find((s) => s.id === "accounts")?.roles).toEqual(["gm"]);
    expect(sections.find((s) => s.id === "profile")?.roles).toEqual(["player", "gm"]);
  });

  it("R34: las secciones descubiertas pasan la validación", () => {
    expect(() => validateSections(loadSections())).not.toThrow();
  });
});

describe("validateSections", () => {
  it("R35: acepta secciones distintas", () => {
    expect(() => validateSections([make(), make({ id: "otra", path: "/otra" })])).not.toThrow();
  });

  it("R35: id duplicado lanza y nombra el id", () => {
    expect(() => validateSections([make(), make({ path: "/otra" })])).toThrow(/"demo"/);
  });

  it("R35: path duplicado lanza y nombra el id ofensor", () => {
    expect(() => validateSections([make(), make({ id: "copia" })])).toThrow(/"copia"/);
  });

  it.each([...RESERVED_PATHS, "/login/x", "/legal/otra", "/api/auth", "/health/live"])(
    "R35: la ruta reservada %s lanza y nombra el id",
    (path) => {
      expect(() => validateSections([make({ id: "intruso", path })])).toThrow(/"intruso"/);
    },
  );

  it.each(["cuentas", "/cuentas/", ""])("R35: la ruta malformada %j lanza", (path) => {
    expect(() => validateSections([make({ id: "mala", path })])).toThrow(/"mala"/);
  });

  it("R35: /apiary no es una subruta de /api", () => {
    expect(() => validateSections([make({ path: "/apiary" })])).not.toThrow();
  });
});

describe("visibleSections", () => {
  const all = [
    make({ id: "c", path: "/c", order: 30 }),
    make({ id: "a", path: "/a", order: 10 }),
    make({ id: "gm", path: "/gm", order: 20, roles: ["gm"] }),
    make({ id: "oculta", path: "/oculta", order: 5, hidden: true }),
  ];

  it("R32: filtra por rol, excluye las hidden y ordena por order", () => {
    expect(visibleSections(all, "player").map((s) => s.id)).toEqual(["a", "c"]);
    expect(visibleSections(all, "gm").map((s) => s.id)).toEqual(["a", "gm", "c"]);
  });
});
