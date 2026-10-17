import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/server/compose", () => ({ composeApp: vi.fn() }));

import { composeApp } from "../../src/server/compose";
import { ConfigError } from "../../src/server/config";
import { start } from "../../src/server/start";

describe("start", () => {
  it("R33: con entorno inválido rechaza con ConfigError sin crear la app ni abrir puerto", async () => {
    const envFile = join(tmpdir(), "path-helper-no-existe", ".env");
    await expect(start({ PORT: "abc", LOG_LEVEL: "verbose" }, { envFile })).rejects.toBeInstanceOf(
      ConfigError,
    );
    expect(composeApp).not.toHaveBeenCalled();
  });
});
