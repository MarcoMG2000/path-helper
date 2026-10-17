import { z } from "zod";
import { CATEGORY_IDS, type Category, type EntryCategory } from "../schema/common";
import { getCategory } from "../categories";
import { provenanceOf } from "./helpers";
import type { IntegrityIssue, IntegrityRule, LoadedDataset } from "./types";

// Regla cruzada final del Lote Z:
//  - R26: el número de entradas de cada categoría es igual al `expectedCount` congelado en su
//    procedencia (la unión de `provenance/<cat>.json` o `provenance/<cat>/*.json`, R98).
//  - Toda categoría con datos tiene procedencia (R39, R42) y esa procedencia es válida (incluida la
//    licencia OGL de cada fichero de lote, R98).
//  - R99: los lotes de `spells` (`spell-batches.json`) son rangos contiguos de la inicial del id que
//    cubren `a`-`z` sin solaparse, cada conjuro cae en exactamente un lote, el recuento por lote
//    coincide con `expectedCountByBatch` y la suma de los lotes es el `expectedCount` total.
//  - `magic-items` se delega en R66/R67 de `magic-refs` (recuentos por `kind`); aquí solo se exige
//    que tenga procedencia.

const issue = (
  category: Category,
  id: string | undefined,
  rule: string,
  message: string,
): IntegrityIssue => ({ category, id, rule, message });

const BatchConfigSchema = z.object({
  batches: z
    .array(
      z.object({ id: z.string().min(1), from: z.string().length(1), to: z.string().length(1) }),
    )
    .min(1),
  expectedCountByBatch: z.record(z.string(), z.number().int().nonnegative()),
});

type BatchConfig = z.infer<typeof BatchConfigSchema>;

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Comprueba que los rangos son contiguos, disjuntos y cubren `a`-`z` (R99). */
function batchRangeProblems(config: BatchConfig): string[] {
  const problems: string[] = [];
  const batches = [...config.batches].sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : 0,
  );
  for (const batch of batches) {
    if (!LETTERS.includes(batch.from) || !LETTERS.includes(batch.to)) {
      problems.push(`el lote ${batch.id} usa un extremo fuera de a-z (${batch.from}-${batch.to})`);
    } else if (batch.from > batch.to) {
      problems.push(`el lote ${batch.id} tiene el rango invertido (${batch.from}-${batch.to})`);
    }
  }
  if (new Set(batches.map((b) => b.id)).size !== batches.length) {
    problems.push("hay ids de lote repetidos");
  }
  if (problems.length > 0) return problems;
  if (batches[0]!.from !== "a")
    problems.push(`el primer lote empieza en "${batches[0]!.from}", no en "a"`);
  for (let i = 1; i < batches.length; i++) {
    const prev = batches[i - 1]!;
    const next = batches[i]!;
    const expectedFrom = LETTERS[LETTERS.indexOf(prev.to) + 1];
    if (next.from <= prev.to) {
      problems.push(`los lotes ${prev.id} y ${next.id} se solapan`);
    } else if (next.from !== expectedFrom) {
      problems.push(
        `hueco entre los lotes ${prev.id} y ${next.id}: falta ${expectedFrom}-${LETTERS[LETTERS.indexOf(next.from) - 1]}`,
      );
    }
  }
  const last = batches.at(-1)!;
  if (last.to !== "z") problems.push(`el último lote termina en "${last.to}", no en "z"`);
  return problems;
}

function spellBatches(
  data: LoadedDataset,
  config: Readonly<Record<string, unknown>>,
  total: number | undefined,
  byBatch: Readonly<Record<string, number>> | undefined,
): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  const parsed = BatchConfigSchema.safeParse(config["spellBatches"]);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    out.push(
      issue(
        "spells",
        undefined,
        "counts.batch-config",
        `spell-batches.json no es válido: ${first?.path.join(".") || "(raíz)"}: ${first?.message ?? "inválido"} (R99)`,
      ),
    );
    return out;
  }
  const batchConfig = parsed.data;
  for (const problem of batchRangeProblems(batchConfig)) {
    out.push(issue("spells", undefined, "counts.batch-ranges", `${problem} (R99)`));
  }
  if (out.length > 0) return out;

  // Cada conjuro cae en exactamente un lote.
  const counts = new Map<string, number>(batchConfig.batches.map((b) => [b.id, 0]));
  for (const raw of data.entries.spells ?? []) {
    const id =
      typeof raw === "object" && raw !== null && typeof (raw as { id?: unknown }).id === "string"
        ? (raw as { id: string }).id
        : undefined;
    if (id === undefined) continue;
    const initial = id.charAt(0);
    const owners = batchConfig.batches.filter((b) => initial >= b.from && initial <= b.to);
    if (owners.length !== 1) {
      out.push(
        issue(
          "spells",
          id,
          "counts.batch-membership",
          owners.length === 0
            ? `el conjuro ${id} no cae en ningún lote de spell-batches.json (R99)`
            : `el conjuro ${id} cae en ${owners.length} lotes (${owners.map((b) => b.id).join(", ")}) (R99)`,
        ),
      );
    } else {
      counts.set(owners[0]!.id, (counts.get(owners[0]!.id) ?? 0) + 1);
    }
  }

  // Recuento congelado por lote (procedencia) frente al real.
  const frozen = byBatch ?? {};
  const configIds = batchConfig.batches.map((b) => b.id);
  for (const id of configIds) {
    if (!(id in frozen)) {
      out.push(
        issue(
          "spells",
          id,
          "counts.batch-count",
          `el lote ${id} no tiene expectedCountByBatch en la procedencia (R99)`,
        ),
      );
      continue;
    }
    const have = counts.get(id) ?? 0;
    if (have !== frozen[id]) {
      out.push(
        issue(
          "spells",
          id,
          "counts.batch-count",
          `el lote ${id} tiene ${have} conjuros pero expectedCountByBatch es ${frozen[id]} (R99)`,
        ),
      );
    }
    const declared = batchConfig.expectedCountByBatch[id];
    if (declared !== undefined && declared !== frozen[id]) {
      out.push(
        issue(
          "spells",
          id,
          "counts.batch-config-drift",
          `spell-batches.json declara ${declared} para ${id} pero la procedencia congelada dice ${frozen[id]} (R99)`,
        ),
      );
    }
  }
  for (const id of Object.keys(frozen)) {
    if (!configIds.includes(id)) {
      out.push(
        issue(
          "spells",
          id,
          "counts.batch-count",
          `la procedencia declara el lote ${id}, que no existe en spell-batches.json (R99)`,
        ),
      );
    }
  }

  // La suma de los lotes es el total.
  const sum = Object.values(frozen).reduce((a, b) => a + b, 0);
  if (total !== undefined && sum !== total) {
    out.push(
      issue(
        "spells",
        undefined,
        "counts.batch-sum",
        `la suma de expectedCountByBatch es ${sum} pero expectedCount es ${total} (R99)`,
      ),
    );
  }
  return out;
}

export const countsRule: IntegrityRule = (data, ctx) => {
  const issues: IntegrityIssue[] = [];
  for (const category of CATEGORY_IDS) {
    const def = getCategory(category);
    const isRecordShape = def.shape === "record";
    const entries = isRecordShape ? undefined : data.entries[category as EntryCategory];
    const hasData = isRecordShape ? data.spellLists !== undefined : (entries?.length ?? 0) > 0;
    const provenance = provenanceOf(data, category);

    if (!provenance) {
      if (hasData) {
        issues.push(
          issue(
            category,
            undefined,
            "counts.no-provenance",
            "la categoría tiene datos pero no tiene procedencia (R39, R42)",
          ),
        );
      }
      continue;
    }
    if (category === "magic-items") continue; // R66/R67 en magic-refs (y su error de procedencia)
    if (provenance.error !== undefined || provenance.value === undefined) {
      issues.push(
        issue(
          category,
          undefined,
          "counts.provenance",
          `procedencia inválida: ${provenance.error ?? "?"} (R98)`,
        ),
      );
      continue;
    }
    if (isRecordShape || entries === undefined) continue; // sin datos cargados no hay qué contar

    const expected = provenance.value.expectedCount;
    if (expected === undefined) {
      issues.push(
        issue(
          category,
          undefined,
          "counts.no-expected",
          "la procedencia no tiene expectedCount congelado (R26)",
        ),
      );
    } else if (expected !== entries.length) {
      issues.push(
        issue(
          category,
          undefined,
          "counts.count",
          `hay ${entries.length} entradas pero expectedCount es ${expected} (R26)`,
        ),
      );
    }
    if (category === "spells") {
      issues.push(
        ...spellBatches(data, ctx.config, expected, provenance.value.expectedCountByBatch),
      );
    }
  }
  return issues;
};
