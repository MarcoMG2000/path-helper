import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CacheMissError,
  FetchError,
  USER_AGENT,
  cachePathFor,
  createFetchCache,
  sha256Of,
} from "../../../scripts/srd/lib/fetch-cache";
import { createRateLimiter } from "../../../scripts/srd/lib/rate-limiter";
import { fakeClock, fakeFetch, tempDir } from "../helpers";

const URL_A = "https://www.aonprd.com/SpellDisplay.aspx?ItemName=Magic%20Missile";
const URL_B = "https://www.aonprd.com/SpellDisplay.aspx?ItemName=Wish";

describe("rate-limiter (R41)", () => {
  it("separa las peticiones al menos 1 s con el reloj falso", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(clock, 1000);
    for (let i = 0; i < 4; i++) await limiter.acquire();
    const start = Date.UTC(2026, 9, 16);
    expect(clock.time - start).toBe(3000);
  });

  it("no espera si ya pasó el intervalo", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(clock, 1000);
    await limiter.acquire();
    clock.time += 5000;
    await limiter.acquire();
    expect(clock.sleeps).toEqual([]);
  });
});

describe("fetch-cache (R41, R42)", () => {
  function setup(respond: Parameters<typeof fakeFetch>[0]) {
    const clock = fakeClock();
    const cacheDir = join(tempDir(), ".cache", "srd-raw");
    const ff = fakeFetch(respond, clock);
    const cache = createFetchCache({ cacheDir, fetch: ff.fetch, clock, backoffMs: 100 });
    return { clock, cacheDir, ff, cache };
  }

  it("R41: envía User-Agent identificable y respeta 1 petición/s entre URLs", async () => {
    const { ff, cache } = setup(() => ({ status: 200, body: "<html>x</html>" }));
    await cache.get(URL_A);
    await cache.get(URL_B);
    expect(ff.calls).toHaveLength(2);
    expect(ff.calls[0]?.headers["User-Agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/path-helper/);
    expect((ff.calls[1]?.at ?? 0) - (ff.calls[0]?.at ?? 0)).toBeGreaterThanOrEqual(1000);
  });

  it("R42: miss descarga y guarda en .cache/srd-raw/<host>/<sha1>.html; hit no vuelve a la red", async () => {
    const { ff, cache, cacheDir } = setup(() => ({ status: 200, body: "<html>hola</html>" }));
    const first = await cache.get(URL_A);
    expect(first.fromCache).toBe(false);
    expect(first.sha256).toBe(sha256Of("<html>hola</html>"));
    expect(first.bytes).toBe(17);
    expect(existsSync(cachePathFor(cacheDir, URL_A))).toBe(true);
    expect(readdirSync(join(cacheDir, "www.aonprd.com"))).toHaveLength(2); // html + meta
    const second = await cache.get(URL_A);
    expect(second.fromCache).toBe(true);
    expect(second.html).toBe("<html>hola</html>");
    expect(second.sha256).toBe(first.sha256);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(ff.calls).toHaveLength(1);
  });

  it("R41: reintentos acotados con backoff ante 5xx y errores de red", async () => {
    const { ff, cache, clock } = setup((_url, attempt) =>
      attempt === 1
        ? new Error("ECONNRESET")
        : attempt === 2
          ? { status: 503 }
          : { status: 200, body: "ok" },
    );
    const page = await cache.get(URL_A);
    expect(page.html).toBe("ok");
    expect(ff.calls).toHaveLength(3);
    expect(clock.sleeps).toContain(100);
    expect(clock.sleeps).toContain(200);
  });

  it("R41: tras agotar los reintentos (3) lanza FetchError y no guarda nada", async () => {
    const { ff, cache, cacheDir } = setup(() => ({ status: 500 }));
    await expect(cache.get(URL_A)).rejects.toBeInstanceOf(FetchError);
    expect(ff.calls).toHaveLength(4); // 1 intento + 3 reintentos
    expect(existsSync(cachePathFor(cacheDir, URL_A))).toBe(false);
  });

  it("R41: un 404 no se reintenta", async () => {
    const { ff, cache } = setup(() => ({ status: 404 }));
    await expect(cache.get(URL_A)).rejects.toMatchObject({ status: 404 });
    expect(ff.calls).toHaveLength(1);
  });

  it("R43: readCached no usa la red y lanza CacheMissError si falta", async () => {
    const { ff, cache } = setup(() => ({ status: 200, body: "x" }));
    expect(() => cache.readCached(URL_A)).toThrow(CacheMissError);
    await cache.get(URL_A);
    expect(cache.readCached(URL_A).html).toBe("x");
    expect(cache.has(URL_A)).toBe(true);
    expect(ff.calls).toHaveLength(1);
  });

  it("fetchFresh ignora y no modifica la caché", async () => {
    let body = "v1";
    const { ff, cache } = setup(() => ({ status: 200, body }));
    await cache.get(URL_A);
    body = "v2";
    const fresh = await cache.fetchFresh(URL_A);
    expect(fresh.html).toBe("v2");
    expect(cache.readCached(URL_A).html).toBe("v1");
    expect(ff.calls).toHaveLength(2);
  });
});
