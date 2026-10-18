// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ForbiddenPage } from "../../../../src/web/features/errors/forbidden-page";
import { NotFoundPage } from "../../../../src/web/features/errors/not-found-page";
import { es } from "../../../../src/web/i18n/es";
import "../../helpers/render-app";

describe("páginas de error", () => {
  it("R30: la 404 muestra título, mensaje y un enlace a /", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: es.notFound.title })).toBeTruthy();
    expect(screen.getByText(es.notFound.message)).toBeTruthy();
    expect(screen.getByRole("link", { name: es.common.backHome }).getAttribute("href")).toBe("/");
  });

  it("R31: «Sin permiso» muestra título, mensaje y un enlace a /", () => {
    render(
      <MemoryRouter>
        <ForbiddenPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: es.forbidden.title })).toBeTruthy();
    expect(screen.getByText(es.forbidden.message)).toBeTruthy();
    expect(screen.getByRole("link", { name: es.common.backHome }).getAttribute("href")).toBe("/");
  });
});
