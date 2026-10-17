import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../../src/web/app";
import { es } from "../../src/web/i18n/es";

describe("App", () => {
  it("R44: muestra el nombre de la aplicación de i18n/es", () => {
    expect(renderToString(<App />)).toContain(es.appName);
  });

  it("R43: en el primer render (efectos sin ejecutar) muestra el estado loading", () => {
    expect(renderToString(<App />)).toContain(es.health.loading);
  });
});
