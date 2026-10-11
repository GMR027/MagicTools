/** Elige el framework de tests según el lenguaje y lo que declara el proyecto. */
export interface ProjectHints {
  /** Contenido de package.json, si existe. */
  packageJson?: string;
  /** Contenido de pyproject.toml / requirements.txt, si existen (juntos). */
  pythonDeps?: string;
}

export function detectTestFramework(languageId: string, hints: ProjectHints = {}): string {
  const lang = languageId.toLowerCase();
  if (["javascript", "typescript", "javascriptreact", "typescriptreact", "vue", "svelte"].includes(lang)) {
    const pkg = (hints.packageJson ?? "").toLowerCase();
    if (/"vitest"/.test(pkg)) return "Vitest";
    if (/"jest"|"ts-jest"|"@types\/jest"/.test(pkg)) return "Jest";
    if (/"mocha"/.test(pkg)) return "Mocha";
    if (/node --test/.test(pkg)) return "node:test (built-in node:test and node:assert)";
    return "Jest";
  }
  switch (lang) {
    case "python": return /unittest/.test(hints.pythonDeps ?? "") && !/pytest/.test(hints.pythonDeps ?? "") ? "unittest" : "pytest";
    case "java": return "JUnit 5";
    case "csharp": return "xUnit";
    case "go": return "the standard testing package (table-driven tests)";
    case "rust": return "cargo test (#[test])";
    case "php": return "PHPUnit";
    case "c": case "cpp": return "a minimal assert-based test (no external framework)";
    default: return "the most common test framework for the language";
  }
}
