import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HealthStatus } from "../../../src/web/components/health-status";
import { es } from "../../../src/web/i18n/es";

describe("HealthStatus", () => {
  it("R43: muestra el texto español de cada estado", () => {
    expect(renderToString(<HealthStatus state="loading" />)).toContain(es.health.loading);
    expect(renderToString(<HealthStatus state="ok" />)).toContain(es.health.ok);
    expect(renderToString(<HealthStatus state="error" />)).toContain(es.health.error);
  });

  it("R43: los textos de los tres estados son distintos y no vacíos", () => {
    const texts = [es.health.loading, es.health.ok, es.health.error];
    expect(new Set(texts).size).toBe(3);
    for (const text of texts) expect(text.length).toBeGreaterThan(0);
  });
});
