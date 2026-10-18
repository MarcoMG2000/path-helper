import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const REPO = resolve(import.meta.dirname, "../../..");
const WEB = join(REPO, "src/web");
const DATA = join(REPO, "src/data");
const SERVER = join(REPO, "src/server");
const DATA_LEGAL = join(DATA, "legal");

// Ficheros que pueden llamar a `fetch` (R1).
const FETCH_ALLOWED = new Set(["api/http-client.ts", "api/health.ts"].map((f) => join(WEB, f)));

const TEXT_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "title",
  "placeholder",
  "alt",
]);
const FORBIDDEN_STORAGE = new Set(["localStorage", "sessionStorage", "indexedDB"]);
const HAS_LETTER = /\p{L}/u;

export interface Violation {
  rule: "R1" | "R72" | "R73" | "R75" | "R85" | "server";
  file: string;
  detail: string;
}

function isInside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir + sep);
}

function stringValue(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join("");
  }
  if (ts.isJsxExpression(node)) return stringValue(node.expression);
  return undefined;
}

/** Analiza un fichero de src/web y devuelve las infracciones de higiene. */
export function analyze(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const add = (rule: Violation["rule"], detail: string) =>
    violations.push({ rule, file: relative(REPO, file), detail });
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);

  const checkSpecifier = (specifier: string) => {
    if (!specifier.startsWith(".")) return;
    const target = resolve(dirname(file), specifier);
    if (isInside(target, SERVER)) add("server", `importa de src/server: ${specifier}`);
    if (isInside(target, DATA) && !isInside(target, DATA_LEGAL)) {
      add("R73", `importa de src/data fuera de src/data/legal: ${specifier}`);
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      checkSpecifier(node.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      checkSpecifier(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      checkSpecifier(node.arguments[0].text);
    }

    if (ts.isIdentifier(node)) {
      const name = node.text;
      if (name === "fetch" && !FETCH_ALLOWED.has(file))
        add("R1", "uso de fetch fuera del cliente HTTP");
      if (name === "dangerouslySetInnerHTML") add("R72", "dangerouslySetInnerHTML");
      if (FORBIDDEN_STORAGE.has(name)) add("R85", `uso de ${name}`);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "cookie" &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "document"
    ) {
      add("R85", "document.cookie");
    }

    if (ts.isJsxText(node) && HAS_LETTER.test(node.text)) {
      add("R75", `texto literal en JSX: ${JSON.stringify(node.text.trim())}`);
    }
    if (
      ts.isJsxExpression(node) &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      const text = stringValue(node.expression);
      const literal =
        node.expression &&
        (ts.isStringLiteral(node.expression) ||
          ts.isNoSubstitutionTemplateLiteral(node.expression) ||
          ts.isTemplateExpression(node.expression));
      if (literal && text !== undefined && HAS_LETTER.test(text)) {
        add("R75", `cadena literal como hijo JSX: ${JSON.stringify(text)}`);
      }
    }
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      TEXT_ATTRIBUTES.has(node.name.text)
    ) {
      const text = stringValue(node.initializer);
      if (text !== undefined && HAS_LETTER.test(text)) {
        add("R75", `atributo ${node.name.text} literal: ${JSON.stringify(text)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "public") out.push(...walk(path));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const files = walk(WEB);
const violationsOf = (rule: Violation["rule"]) =>
  files.flatMap((f) => analyze(f, readFileSync(f, "utf8"))).filter((v) => v.rule === rule);

describe("higiene de src/web", () => {
  it("hay ficheros que analizar (el recorrido no está vacío)", () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((f) => f.endsWith("login-page.tsx"))).toBe(true);
  });

  it("R1: solo api/http-client.ts y api/health.ts usan fetch", () => {
    expect(violationsOf("R1")).toEqual([]);
    const withFetch = files.filter((f) => {
      const text = readFileSync(f, "utf8");
      return /\bfetch\b/.test(text.replace(/\/\/.*$/gm, "")) && FETCH_ALLOWED.has(f);
    });
    expect(withFetch.length).toBe(2);
  });

  it("R72: no se usa dangerouslySetInnerHTML", () => {
    expect(violationsOf("R72")).toEqual([]);
  });

  it("R73: src/web solo importa de src/data/legal (nunca el barrel ni las categorías)", () => {
    expect(violationsOf("R73")).toEqual([]);
    const legal = readFileSync(join(WEB, "features/legal/legal-page.tsx"), "utf8");
    expect(legal).toMatch(/from "\.\.\/\.\.\/\.\.\/data\/legal"/);
  });

  it("R73: ningún fichero de src/web importa de src/server", () => {
    expect(violationsOf("server")).toEqual([]);
  });

  it("R75: no hay texto visible ni atributos accesibles literales en los componentes", () => {
    expect(violationsOf("R75")).toEqual([]);
  });

  it("R85: no se usa localStorage, sessionStorage, indexedDB ni document.cookie", () => {
    expect(violationsOf("R85")).toEqual([]);
  });
});

describe("el analizador detecta las infracciones (autotest)", () => {
  const bad = join(WEB, "features/x/bad.tsx");
  const rules = (source: string, file = bad) => analyze(file, source).map((v) => v.rule);

  it("R1: fetch fuera de los ficheros permitidos", () => {
    expect(rules("export const a = () => fetch('/api/x');")).toEqual(["R1"]);
    expect(rules("export const a = () => globalThis.fetch('/api/x');")).toEqual(["R1"]);
    expect(rules("export const a = () => fetch('/x');", join(WEB, "api/health.ts"))).toEqual([]);
  });

  it("R72: dangerouslySetInnerHTML", () => {
    expect(
      rules("export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;"),
    ).toContain("R72");
  });

  it("R73: imports de src/data fuera de legal y del servidor", () => {
    expect(rules("import { x } from '../../../data';")).toEqual(["R73"]);
    expect(rules("import { x } from '../../../data/spells';")).toEqual(["R73"]);
    expect(rules("export * from '../../../data';")).toEqual(["R73"]);
    expect(rules("export const a = import('../../../data/feats');")).toEqual(["R73"]);
    expect(rules("import { x } from '../../../data/legal';")).toEqual([]);
    expect(rules("import { x } from '../../../server/compose';")).toEqual(["server"]);
    expect(rules("import { x } from '../../../shared';")).toEqual([]);
  });

  it("R75: texto literal en JSX y atributos accesibles", () => {
    expect(rules("export const A = () => <p>Hola</p>;")).toEqual(["R75"]);
    expect(rules("export const A = () => <p>{'Hola'}</p>;")).toEqual(["R75"]);
    expect(rules("export const A = () => <p>{`Hola ${1}`}</p>;")).toEqual(["R75"]);
    expect(rules('export const A = () => <button aria-label="Cerrar" />;')).toEqual(["R75"]);
    expect(rules("export const A = () => <img alt={'Logo'} />;")).toEqual(["R75"]);
    expect(rules('export const A = () => <a title="Ir">{t}</a>;')).toEqual(["R75"]);
    expect(rules("export const A = (p: { t: string }) => <p aria-label={p.t}>{p.t}</p>;")).toEqual(
      [],
    );
    expect(rules("export const A = () => <p>{' · '}</p>;")).toEqual([]);
  });

  it("R85: almacenamiento y cookies del documento", () => {
    expect(rules("export const a = localStorage.getItem('x');")).toEqual(["R85"]);
    expect(rules("export const a = window.sessionStorage;")).toEqual(["R85"]);
    expect(rules("export const a = indexedDB;")).toEqual(["R85"]);
    expect(rules("export const a = document.cookie;")).toEqual(["R85"]);
  });
});
