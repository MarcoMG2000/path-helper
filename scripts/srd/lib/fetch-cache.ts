import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRateLimiter, type Clock, type RateLimiter } from "./rate-limiter";

export const USER_AGENT =
  "path-helper-srd-importer/1.0 (personal non-commercial Pathfinder 1e tool; polite, cached)";

/** Página descargada o leída de la caché. `fetchedAt` es ISO-8601. */
export interface CachedPage {
  url: string;
  html: string;
  sha256: string;
  bytes: number;
  fetchedAt: string;
}

export class FetchError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class CacheMissError extends Error {
  constructor(readonly url: string) {
    super(`la página no está en la caché local (ejecuta npm run data:import): ${url}`);
  }
}

export interface FetchCacheOptions {
  /** Directorio `.cache/srd-raw`. */
  cacheDir: string;
  fetch: typeof fetch;
  clock: Clock;
  userAgent?: string;
  minIntervalMs?: number;
  /** Reintentos tras el primer intento (R41: acotados). */
  maxRetries?: number;
  backoffMs?: number;
}

export interface FetchCache {
  /** Caché primero; si no está, descarga (con tasa y reintentos) y guarda. */
  get(url: string): Promise<CachedPage & { fromCache: boolean }>;
  /** Descarga sin leer ni escribir la caché (para `--verify`, R48). */
  fetchFresh(url: string): Promise<CachedPage>;
  /** Solo lectura offline (R43); lanza `CacheMissError` si no existe. */
  readCached(url: string): CachedPage;
  has(url: string): boolean;
}

export function sha256Of(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function cachePathFor(cacheDir: string, url: string): string {
  const host = new URL(url).hostname;
  const key = createHash("sha1").update(url, "utf8").digest("hex");
  return join(cacheDir, host, `${key}.html`);
}

interface CacheMeta {
  url: string;
  fetchedAt: string;
}

export function createFetchCache(options: FetchCacheOptions): FetchCache {
  const {
    cacheDir,
    clock,
    userAgent = USER_AGENT,
    minIntervalMs = 1000,
    maxRetries = 3,
    backoffMs = 1000,
  } = options;
  const limiter: RateLimiter = createRateLimiter(clock, minIntervalMs);

  async function download(url: string): Promise<CachedPage> {
    let lastError: FetchError | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await clock.sleep(backoffMs * 2 ** (attempt - 1));
      await limiter.acquire();
      let retryable = true;
      try {
        const response = await options.fetch(url, { headers: { "User-Agent": userAgent } });
        if (response.ok) {
          const html = await response.text();
          return {
            url,
            html,
            sha256: sha256Of(html),
            bytes: Buffer.byteLength(html, "utf8"),
            fetchedAt: new Date(clock.now()).toISOString(),
          };
        }
        lastError = new FetchError(
          `HTTP ${response.status} al descargar ${url}`,
          url,
          response.status,
        );
        retryable = response.status === 429 || response.status >= 500;
      } catch (error) {
        lastError = new FetchError(`error de red al descargar ${url}: ${String(error)}`, url);
      }
      if (!retryable) throw lastError;
    }
    throw lastError ?? new FetchError(`no se pudo descargar ${url}`, url);
  }

  function readCached(url: string): CachedPage {
    const path = cachePathFor(cacheDir, url);
    if (!existsSync(path)) throw new CacheMissError(url);
    const html = readFileSync(path, "utf8");
    const metaPath = path.replace(/\.html$/, ".json");
    const meta: CacheMeta | undefined = existsSync(metaPath)
      ? (JSON.parse(readFileSync(metaPath, "utf8")) as CacheMeta)
      : undefined;
    return {
      url,
      html,
      sha256: sha256Of(html),
      bytes: Buffer.byteLength(html, "utf8"),
      fetchedAt: meta?.fetchedAt ?? new Date(0).toISOString(),
    };
  }

  return {
    has: (url) => existsSync(cachePathFor(cacheDir, url)),
    readCached,
    fetchFresh: download,
    async get(url) {
      const path = cachePathFor(cacheDir, url);
      if (existsSync(path)) return { ...readCached(url), fromCache: true };
      const page = await download(url);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, page.html, "utf8");
      const meta: CacheMeta = { url, fetchedAt: page.fetchedAt };
      writeFileSync(path.replace(/\.html$/, ".json"), JSON.stringify(meta) + "\n", "utf8");
      return { ...page, fromCache: false };
    },
  };
}
