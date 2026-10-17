import type { Feat } from "../schema/feat";
import { validEntries } from "./helpers";
import type { IntegrityIssue, IntegrityRule } from "./types";

// Prerrequisitos de dotes: R18 (referencia rota) y R19 (ciclos). Más una comprobación cruzada
// opcional de `skills[].skillId` contra la categoría `skills` cuando ya está cargada.

/** Componentes fuertemente conexos con ciclo (tamaño > 1 o con autoarista), Tarjan iterativo. */
function cyclicComponents(graph: ReadonlyMap<string, readonly string[]>): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const found: string[][] = [];

  for (const root of [...graph.keys()].sort()) {
    if (index.has(root)) continue;
    const work: { node: string; next: number }[] = [{ node: root, next: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter++;
    stack.push(root);
    onStack.add(root);
    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const edges = graph.get(frame.node) ?? [];
      if (frame.next < edges.length) {
        const to = edges[frame.next++]!;
        if (!graph.has(to)) continue;
        if (!index.has(to)) {
          index.set(to, counter);
          low.set(to, counter);
          counter++;
          stack.push(to);
          onStack.add(to);
          work.push({ node: to, next: 0 });
        } else if (onStack.has(to)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(to)!));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.push(member);
        } while (member !== frame.node);
        const selfLoop =
          component.length === 1 && (graph.get(component[0]!) ?? []).includes(component[0]!);
        if (component.length > 1 || selfLoop) found.push(component.sort());
      }
    }
  }
  return found.sort((a, b) => (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0));
}

export const featPrereqsRule: IntegrityRule = (data, ctx) => {
  const feats = validEntries(data, "feats", ctx) as readonly Feat[];
  const issues: IntegrityIssue[] = [];
  const ids = new Set(feats.map((f) => f.id));

  // R18: todo `featIds` existe en `feats`.
  const graph = new Map<string, string[]>();
  for (const feat of feats) {
    graph.set(feat.id, [...feat.prerequisites.featIds]);
    for (const ref of feat.prerequisites.featIds) {
      if (!ids.has(ref)) {
        issues.push({
          category: "feats",
          id: feat.id,
          rule: "feats.prereq-ref",
          message: `el prerrequisito "${ref}" de "${feat.id}" no existe en feats`,
        });
      }
    }
  }

  // R19: el grafo de prerrequisitos no tiene ciclos (se ignoran las aristas rotas, ya informadas).
  for (const component of cyclicComponents(graph)) {
    const first = component[0]!;
    issues.push({
      category: "feats",
      id: first,
      rule: "feats.prereq-cycle",
      message: `ciclo de prerrequisitos entre dotes: ${[...component, first].join(" -> ")}`,
    });
  }

  // Cruzada opcional: las habilidades de los prerrequisitos existen si `skills` ya está cargada.
  const skills = data.entries.skills;
  if (skills && skills.length > 0) {
    const skillIds = new Set(
      skills.flatMap((s) =>
        typeof s === "object" && s !== null && typeof (s as { id?: unknown }).id === "string"
          ? [(s as { id: string }).id]
          : [],
      ),
    );
    for (const feat of feats) {
      for (const { skillId } of feat.prerequisites.skills) {
        if (!skillIds.has(skillId)) {
          issues.push({
            category: "feats",
            id: feat.id,
            rule: "feats.prereq-skill",
            message: `la habilidad "${skillId}" del prerrequisito de "${feat.id}" no existe en skills`,
          });
        }
      }
    }
  }
  return issues;
};
