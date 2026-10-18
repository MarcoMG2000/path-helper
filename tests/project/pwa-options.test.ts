import { describe, expect, it } from "vitest";
import { NAVIGATE_FALLBACK_DENYLIST } from "../../src/web/pwa-manifest";
import { readRepoFile } from "./helpers";

const denied = (path: string) => NAVIGATE_FALLBACK_DENYLIST.some((re) => re.test(path));

describe("opciones PWA", () => {
  it.each(["/api", "/api/", "/api/auth/me", "/api/accounts/1/unlock", "/health"])(
    "R84: la navegación a %s NO cae en el fallback de index.html",
    (path) => {
      expect(denied(path)).toBe(true);
    },
  );

  it.each(["/", "/legal", "/cuentas", "/perfil", "/login", "/apiary", "/health/x", "/healthy"])(
    "R84: la ruta del cliente %s sí usa el fallback de index.html",
    (path) => {
      expect(denied(path)).toBe(false);
    },
  );

  it("R84: vite.config.ts pasa la lista a workbox.navigateFallbackDenylist", () => {
    const config = readRepoFile("vite.config.ts");
    expect(config).toMatch(
      /workbox:\s*\{\s*navigateFallbackDenylist:\s*NAVIGATE_FALLBACK_DENYLIST\s*\}/,
    );
  });
});
