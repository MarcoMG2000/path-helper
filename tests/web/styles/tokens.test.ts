import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const STYLES_DIR = join(import.meta.dirname, "../../../src/web/styles");
const read = (name: string) => readFileSync(join(STYLES_DIR, name), "utf8");
const tokensCss = read("tokens.css");
const otherFiles = readdirSync(STYLES_DIR).filter((f) => f.endsWith(".css") && f !== "tokens.css");

interface Rule {
  selector: string;
  body: string;
}

/** Reglas "hoja" (sin llaves anidadas), incluidas las que viven dentro de @media. */
function leafRules(css: string): Rule[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selector: match[1]!.trim(), body: match[2]! });
  }
  return rules;
}

function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const decl of body.split(";")) {
    const index = decl.indexOf(":");
    if (index > 0) map.set(decl.slice(0, index).trim(), decl.slice(index + 1).trim());
  }
  return map;
}

function tokenMap(body: string): Map<string, string> {
  return declarations(body);
}

const rules = leafRules(tokensCss);
const lightRoot = rules.find((r) => r.selector === ":root" && r.body.includes("--ph-space-1"));
const darkRoot = rules.find((r) => r.selector === ":root" && !r.body.includes("--ph-space-1"));
const light = tokenMap(lightRoot?.body ?? "");
const dark = tokenMap(darkRoot?.body ?? "");

const colorTokens = [...light.keys()].filter((k) => k.startsWith("--ph-color-"));

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("tokens.css", () => {
  it("R78: define tokens --ph-* de color, espaciado, radio, tipografía y tamaño táctil", () => {
    for (const name of [
      "--ph-color-bg",
      "--ph-color-surface",
      "--ph-color-text",
      "--ph-color-text-muted",
      "--ph-color-primary",
      "--ph-color-on-primary",
      "--ph-color-border",
      "--ph-color-danger",
      "--ph-color-success",
      "--ph-color-focus",
      "--ph-space-1",
      "--ph-space-6",
      "--ph-radius",
      "--ph-font-family",
      "--ph-font-size-base",
      "--ph-font-size-sm",
      "--ph-font-size-lg",
      "--ph-font-size-xl",
      "--ph-tap-min",
      "--ph-content-max",
    ]) {
      expect(light.has(name), name).toBe(true);
    }
  });

  it("R78: los colores de tokens.css son hexadecimales de 6 dígitos", () => {
    for (const name of colorTokens) expect(light.get(name), name).toMatch(/^#[0-9a-f]{6}$/i);
    for (const name of colorTokens) expect(dark.get(name), name).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("R78: ninguna otra hoja usa colores literales (hex, rgb(), hsl() ni nombres)", () => {
    expect(otherFiles.length).toBeGreaterThanOrEqual(3);
    for (const file of otherFiles) {
      const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css, file).not.toMatch(/\b(?:rgba?|hsla?|hwb|oklch|lab|lch)\(/);
      expect(css, file).not.toMatch(
        /:\s*(?:white|black|red|green|blue|gray|grey|yellow|orange)\b/i,
      );
    }
  });

  it("R78: los componentes usan los tokens (var(--ph-…)) para color", () => {
    for (const file of otherFiles) {
      const css = read(file);
      for (const used of css.matchAll(/var\((--ph-[a-z0-9-]+)\)/g)) {
        expect(light.has(used[1]!), `${file}: ${used[1]}`).toBe(true);
      }
    }
  });

  it("R79: declara color-scheme light dark y un único bloque prefers-color-scheme: dark", () => {
    expect(light.get("color-scheme")).toBe("light dark");
    expect(tokensCss.match(/@media \(prefers-color-scheme: dark\)/g)).toHaveLength(1);
    expect(darkRoot).toBeDefined();
  });

  it("R79: el modo oscuro redefine exactamente los mismos tokens de color", () => {
    const darkColors = [...dark.keys()].filter((k) => k.startsWith("--ph-color-"));
    expect(darkColors.sort()).toEqual([...colorTokens].sort());
  });

  describe("R80: contraste WCAG >= 4,5:1", () => {
    const pairs: [string, string][] = [
      ["text", "bg"],
      ["text", "surface"],
      ["text-muted", "bg"],
      ["text-muted", "surface"],
      ["on-primary", "primary"],
      ["primary", "bg"],
      ["primary", "surface"],
      ["danger", "bg"],
      ["danger", "surface"],
      ["success", "bg"],
      ["success", "surface"],
    ];
    for (const [scheme, tokens] of [
      ["claro", light],
      ["oscuro", dark],
    ] as const) {
      for (const [fg, bg] of pairs) {
        it(`R80: ${fg}/${bg} en modo ${scheme}`, () => {
          const ratio = contrast(tokens.get(`--ph-color-${fg}`)!, tokens.get(`--ph-color-${bg}`)!);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  });

  it("R81: las media queries de ancho usan solo min-width (mobile-first)", () => {
    for (const file of [...otherFiles, "tokens.css"]) {
      const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
      const queries = [...css.matchAll(/@media([^{]+)\{/g)].map((m) => m[1]!);
      for (const query of queries) {
        expect(query, `${file}: ${query}`).not.toMatch(/max-(width|height)/);
        if (/width/.test(query)) expect(query, `${file}: ${query}`).toMatch(/min-width/);
      }
    }
    expect(otherFiles.some((f) => /@media[^{]*min-width/.test(read(f)))).toBe(true);
  });

  it("R82: --ph-tap-min >= 44px y botones, campos y enlaces de navegación lo usan", () => {
    const tap = light.get("--ph-tap-min")!;
    expect(tap).toMatch(/^[\d.]+rem$/);
    expect(parseFloat(tap) * 16).toBeGreaterThanOrEqual(44);
    const all = otherFiles.flatMap((f) => leafRules(read(f)));
    for (const selector of [".ph-button", ".ph-input", ".ph-nav__link", ".ph-footer__link"]) {
      const rule = all.find((r) => r.selector === selector);
      expect(rule, selector).toBeDefined();
      expect(declarations(rule!.body).get("min-height"), selector).toBe("var(--ph-tap-min)");
    }
  });

  it("R83: el font-size de los campos es --ph-font-size-base >= 1rem", () => {
    expect(parseFloat(light.get("--ph-font-size-base")!)).toBeGreaterThanOrEqual(1);
    expect(light.get("--ph-font-size-base")).toMatch(/rem$/);
    const all = otherFiles.flatMap((f) => leafRules(read(f)));
    const input = all.find((r) => r.selector === ".ph-input");
    expect(declarations(input!.body).get("font-size")).toBe("var(--ph-font-size-base)");
  });
});
