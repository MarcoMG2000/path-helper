import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";
import type { Clock } from "../../scripts/srd/lib/rate-limiter";

export interface FakeClock extends Clock {
  /** Tiempo virtual en ms. */
  time: number;
  sleeps: number[];
}

/** Reloj virtual: `sleep` avanza el tiempo al instante. */
export function fakeClock(start = Date.UTC(2026, 9, 16)): FakeClock {
  const clock: FakeClock = {
    time: start,
    sleeps: [],
    now: () => clock.time,
    sleep: async (ms) => {
      clock.sleeps.push(ms);
      clock.time += ms;
    },
  };
  return clock;
}

export type FakeResponse = { status: number; body?: string } | Error;

export interface FakeFetch {
  fetch: typeof fetch;
  calls: { url: string; headers: Record<string, string>; at: number }[];
}

/** `fetch` falso: `respond(url, n)` decide la respuesta de la n-ésima llamada a esa URL. */
export function fakeFetch(
  respond: (url: string, attempt: number) => FakeResponse,
  clock?: Clock,
): FakeFetch {
  const calls: FakeFetch["calls"] = [];
  const attempts = new Map<string, number>();
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const attempt = (attempts.get(url) ?? 0) + 1;
    attempts.set(url, attempt);
    calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      at: clock?.now() ?? 0,
    });
    const r = respond(url, attempt);
    if (r instanceof Error) throw r;
    return new Response(r.body ?? "", { status: r.status });
  };
  return { fetch: impl as typeof fetch, calls };
}

const dirs: string[] = [];

/** Directorio temporal borrado al terminar cada test (nada se escribe en el repo). */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "path-helper-srd-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

export function writeFile(root: string, relative: string, content: string): string {
  const path = join(root, ...relative.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}
