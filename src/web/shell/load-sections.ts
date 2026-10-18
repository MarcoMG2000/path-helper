import { sortSections, validateSections, type AppSection } from "./sections";

type SectionModule = { default: AppSection | AppSection[] };

// R34: descubre las secciones declaradas por las features. Vive aparte de sections.ts para evitar
// un ciclo de importación (los section.tsx importan defineSection de sections.ts).
const modules = import.meta.glob<SectionModule>("../features/*/section.tsx", { eager: true });

export function loadSections(): AppSection[] {
  const sections = Object.values(modules).flatMap((module) =>
    Array.isArray(module.default) ? module.default : [module.default],
  );
  validateSections(sections);
  return sortSections(sections);
}
