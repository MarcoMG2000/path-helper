import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Raíz del repo (scripts/srd/lib -> ../../..). Los comandos aceptan otra raíz para los tests. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export interface Paths {
  root: string;
  /** `src/data` */
  data: string;
  /** `scripts/srd/config` */
  config: string;
  /** `.cache/srd-raw` */
  cache: string;
  /** `reports` */
  reports: string;
}

export function pathsFor(root: string = REPO_ROOT): Paths {
  return {
    root,
    data: resolve(root, "src", "data"),
    config: resolve(root, "scripts", "srd", "config"),
    cache: resolve(root, ".cache", "srd-raw"),
    reports: resolve(root, "reports"),
  };
}

/** Normaliza separadores a `/` (las rutas de los JSON y de los imports son siempre POSIX). */
export function toPosix(path: string): string {
  return path.split("\\").join("/");
}
