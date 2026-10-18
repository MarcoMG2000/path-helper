// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { es } from "../../../src/web/i18n/es";
import { AppErrorBoundary } from "../../../src/web/shell/error-boundary";

function Boom(): never {
  throw new Error("fallo de render");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppErrorBoundary", () => {
  it("R39: una excepción de render muestra la pantalla de error con «Recargar»", async () => {
    // React escribe el error capturado en consola; se silencia solo en este test.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onReload = vi.fn();
    render(
      <AppErrorBoundary onReload={onReload}>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole("heading", { level: 1, name: es.crash.title })).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: es.crash.reload }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("R39: sin errores renderiza a sus hijos", () => {
    render(
      <AppErrorBoundary>
        <p>contenido</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText("contenido")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
