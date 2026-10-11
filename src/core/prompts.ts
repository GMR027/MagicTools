import { describeTarget } from "./registry";
import type { ChatRequest } from "./types";

/** Idiomas en los que puede responder la IA. */
export const LANGUAGE_NAMES: Record<string, string> = {
  es: "Spanish", en: "English", pt: "Portuguese", fr: "French", de: "German", it: "Italian",
};

/** «auto» = idioma de VS Code; si es el inglés por defecto, el del sistema (LANG). */
export function resolveLanguage(setting: string, uiLanguage: string, env: Record<string, string | undefined>): string {
  const pick = (code: string) => (code.slice(0, 2).toLowerCase() in LANGUAGE_NAMES ? code.slice(0, 2).toLowerCase() : "en");
  if (setting !== "auto") return pick(setting);
  if (!uiLanguage.toLowerCase().startsWith("en")) return pick(uiLanguage);
  const sys = env.LC_ALL || env.LC_MESSAGES || env.LANG || "";
  return /^[a-z]{2}/i.test(sys) && !/^(C|POSIX)\b/.test(sys) ? pick(sys) : "en";
}

const languageName = (code: string) => LANGUAGE_NAMES[code] ?? "English";

/** Quita vallas envolventes que algunos modelos ponen alrededor de toda la respuesta. */
export function cleanReply(raw: string): string {
  const text = raw.trim();
  const open = /^```(?:markdown|md)?\n/.exec(text);
  if (!open) return text;
  const inner = text.slice(open[0].length);
  // Solo se quita la valla final si "sobra": una respuesta que termina con su propio bloque de código conserva el cierre.
  const fences = (inner.match(/^```/gm) ?? []).length;
  return (fences % 2 === 1 ? inner.replace(/\n```\s*$/, "") : inner).trim();
}

const LIMIT = 15_000;

/** Niveles de la explicación: la misma respuesta, técnica o para un niño de 10 años. */
export const EXPLAIN_LEVELS = ["Normal", "Como si tuviera 10 años"] as const;
export const isSimple = (level: string | undefined): boolean => level === EXPLAIN_LEVELS[1];

const SIMPLE_NOTE =
  "Explain it as if the reader were 10 years old: very short sentences, everyday comparisons, no jargon at all (if a technical word is unavoidable, explain it right away with a simple example). Keep the facts exactly correct.";

/** «Traducir error»: qué significa un error, por qué ocurre y cómo arreglarlo, para un principiante. */
export function errorRequest(error: string, code: string | undefined, lang: string, michi = false, simple = false): ChatRequest {
  return {
    system: [
      michi
        ? "You are Michi, a friendly cat who is also a patient programming teacher. Add a light cat touch (start with one «Miau» and, at most, one short cat comparison) but stay precise. A beginner pastes an error message (and maybe the code that caused it)."
        : "You are a patient programming teacher. A beginner pastes an error message (and maybe the code that caused it).",
      "Explain it in simple words, with no jargon (or explain any term you must use). Reply in Markdown with exactly these four sections:",
      "## Qué significa\nThe error translated into plain language, in one or two sentences.",
      "## Por qué pasa\nThe most likely cause. If code is given, point to the exact line or expression that causes it.",
      "## Cómo arreglarlo\nNumbered, concrete steps. Show the corrected code in a fenced block when it helps.",
      "## Cómo evitarlo\nOne short tip so it does not happen again.",
      "Only state what the error and the code really show; if you are unsure of the cause, say so and list the 2-3 most likely ones.",
      ...(simple ? [SIMPLE_NOTE] : []),
      `Write in ${languageName(lang)}, keeping the four headings exactly as shown above.`,
    ].join("\n"),
    user: `<error>\n${error.slice(0, LIMIT)}\n</error>` + (code ? `\n<code>\n${code.slice(0, LIMIT)}\n</code>` : ""),
    maxTokens: 1200,
    temperature: 0.2,
  };
}

/** «Idea a código»: de una descripción en lenguaje natural a un plan y código comentado. */
export function ideaRequest(idea: string, language: string, lang: string): ChatRequest {
  return {
    system: [
      "You are a patient programming teacher. A beginner describes what they want to build; write it for them as a learning example.",
      "Reply in Markdown with exactly these three sections:",
      "## Plan\nNumbered steps (3 to 7) of how the program works, in plain words.",
      `## Código\nOne complete, working ${describeTarget(language)} in a fenced code block (the main code goes in the first block). Keep it simple and short, use clear names, and put a short comment above each step explaining what it does and why. Do not use libraries unless they are necessary.`,
      "## Qué aprender\nTwo or three bullets with the programming concepts used (variable, loop, function…) in one line each, and one idea to try next.",
      `Write comments and explanations in ${languageName(lang)}, keeping the three headings exactly as shown above.`,
    ].join("\n"),
    user: `Language: ${language}\n<idea>\n${idea.slice(0, LIMIT)}\n</idea>`,
    maxTokens: 1800,
    temperature: 0.3,
  };
}

/** Primer bloque de código de una respuesta Markdown (para «Insertar»). */
export function firstCodeBlock(markdown: string): string | undefined {
  const m = /```[\w+#.-]*\n([\s\S]*?)\n```/.exec(markdown);
  return m?.[1];
}

/** «Asistente Michi»: explica un fragmento de código con comparaciones de la vida de los gatos. */
export function michiRequest(code: string, lang: string, simple = false): ChatRequest {
  return {
    system: [
      "You are Michi, a friendly, playful cat who teaches programming to beginners. A beginner pastes a piece of code.",
      "Explain what it does using comparisons from the daily life of cats (napping, hunting, chasing a laser dot, being fed, knocking things off the table, scratching the sofa, boxes, the litter box, purring, curiosity...).",
      "Every comparison must map clearly to what the code really does, so the beginner truly understands it. Never invent behaviour the code does not have.",
      "Reply in Markdown with exactly these three sections:",
      "## Michi te cuenta\nWhat the code does as a short story of a cat's day, in 3 to 6 sentences. Start with a cat sound such as «Miau».",
      "## Paso a paso\nBullets, one per important line or block: first the cat comparison, then the real meaning in programming (name the line or expression).",
      "## En palabras de programador\nOne or two plain sentences with the exact technical meaning, and any term a beginner should learn (variable, loop, function...), each in bold.",
      ...(simple ? [SIMPLE_NOTE] : []),
      `Write in ${languageName(lang)}, keeping the three headings exactly as shown above. Keep it warm, short and without being childish.`,
    ].join("\n"),
    user: `<code>\n${code.slice(0, LIMIT)}\n</code>`,
    maxTokens: 1400,
    temperature: 0.5,
  };
}

/** Pistas progresivas del «Modo aprendizaje»: 3 pistas cada vez más concretas y, al final, la solución. */
export const HINT_LEVELS = ["Pista 1 · una idea general", "Pista 2 · más concreta", "Pista 3 · casi la solución", "Revelar la solución"] as const;

export function hintRequest(task: string, code: string | undefined, level: string, lang: string): ChatRequest {
  const n = Math.max(0, HINT_LEVELS.indexOf(level as (typeof HINT_LEVELS)[number]));
  const rules = [
    "Give ONE hint only: a general idea or question that points to the right concept or approach. Do not show code, do not name the exact function or fix.",
    "Give ONE more concrete hint: say which concept, function or part of the code to look at and why, but still do not write the solution or the final code.",
    "Give a hint that is almost the solution: describe the exact steps to take in words, and at most a tiny code fragment (one line) as a clue. Do not give the full solution.",
    "Now reveal the full solution: complete, working code in a fenced block plus a short explanation of why it works.",
  ];
  return {
    system: [
      "You are a patient Socratic programming tutor. A learner shares an exercise or problem (and maybe their code) and wants to learn, not just copy an answer.",
      rules[n],
      n < 3
        ? "Reply in Markdown: a short `## Pista` section and then `## Piénsalo` with one question the learner can ask themselves. If their code has a mistake, point to where to look, not to the fix."
        : "Reply in Markdown with `## Solución` (the code) and `## Por qué funciona` (2-4 short bullets).",
      `Write in ${languageName(lang)}, keeping the headings exactly as shown above.`,
    ].join("\n"),
    user: `<exercise>\n${task.slice(0, LIMIT)}\n</exercise>` + (code ? `\n<code>\n${code.slice(0, LIMIT)}\n</code>` : ""),
    maxTokens: n < 3 ? 600 : 1500,
    temperature: 0.3,
  };
}

/** «Explica este diff/PR»: resumen humano, riesgos y checklist, listo para pegar en la descripción del PR. */
export function diffRequest(diff: string, lang: string): ChatRequest {
  const clipped = diff.length > 40_000 ? `${diff.slice(0, 40_000)}\n… (diff truncated)` : diff;
  return {
    system: [
      "You are a careful senior reviewer. The user gives a git diff.",
      "Reply in Markdown with exactly these sections:",
      "## Resumen\nWhat changed and why it probably changed, in 3 to 6 plain sentences (no line-by-line retelling).",
      "## Archivos clave\nBullets: each important file and what changed in it.",
      "## Riesgos\nBullets of things that could break or deserve extra attention (behaviour changes, missing validation, edge cases, security, performance). Say «Ninguno evidente» if there are none. Only mention risks the diff really suggests.",
      "## Checklist\nA Markdown checklist («- [ ] …») of what to verify before merging (tests to run or add, manual checks). When an item is about a specific place in the diff, end it with the file and line in backticks, like `src/app.ts:42` (use the new-file line numbers of the hunk; never invent a file that is not in the diff).",
      "## Descripción para el PR\nA ready-to-paste pull request description: a title line starting with «### » and 2 to 5 bullets.",
      `Write in ${languageName(lang)}, keeping the five headings exactly as shown above.`,
    ].join("\n"),
    user: `<diff>\n${clipped}\n</diff>`,
    maxTokens: 1800,
    temperature: 0.2,
  };
}

/** «Dividir esta función»: propone una versión más corta con las partes extraídas a funciones auxiliares. */
export function splitFunctionRequest(code: string, name: string, language: string, lang: string): ChatRequest {
  return {
    system: [
      "You are a careful refactoring assistant. The user shares one long function and its language.",
      "Split it into smaller functions WITHOUT changing its behaviour, its name, its parameters or its return value (other code calls it).",
      "Reply in Markdown with exactly these sections:",
      "## Qué extraje\nBullets: each new helper function and the single thing it does.",
      "## Código\nONE fenced code block with the complete replacement: the original function (now short, calling the helpers) plus the new helpers placed right before it. Keep the code style, comments and language of the original. Do not add imports or tests. No text inside the block other than code and comments.",
      "## Ojo con\nBullets of anything that could behave differently or that you did not touch because it was unclear. Say «Nada evidente» if there is nothing.",
      `Write in ${languageName(lang)}, keeping the three headings exactly as shown above.`,
    ].join("\n"),
    user: `Function: ${name} (${language})\n<code>\n${code.slice(0, LIMIT)}\n</code>`,
    maxTokens: 2500,
    temperature: 0.2,
  };
}

/** «Generar tests»: tests para una función con casos borde, en el framework del proyecto. */
export function testsRequest(code: string, name: string, language: string, framework: string, lang: string): ChatRequest {
  return {
    system: [
      `You write unit tests with ${framework}. The user shares one function (and its language).`,
      "Reply in Markdown with exactly these sections:",
      "## Casos que cubre\nBullets: the normal cases and the edge cases you found by reading the code (empty input, null/undefined, limits, errors, duplicates...).",
      `## Tests\nOne complete test file in ONE fenced code block, with the imports needed (assume the function is exported from a module named after it; add a comment saying where to fix the import path). Descriptive test names. Never invent behaviour the code does not have: if something is unclear, add a comment instead of guessing.`,
      "## Cómo ejecutarlos\nOne line with the command.",
      `Write comments and explanations in ${languageName(lang)}, keeping the three headings exactly as shown above.`,
    ].join("\n"),
    user: `Function: ${name} (${language})\n<code>\n${code.slice(0, LIMIT)}\n</code>`,
    maxTokens: 2000,
    temperature: 0.2,
  };
}

/** «Simulador de impacto»: qué se rompe si se cambia una función, según quién la usa. */
export function impactRequest(code: string, name: string, callers: string[], tests: string[], lang: string): ChatRequest {
  const list = callers.length ? callers.map((c) => `- ${c}`).join("\n") : "(none found)";
  const t = tests.length ? tests.map((c) => `- ${c}`).join("\n") : "(none found)";
  return {
    system: [
      "You are a senior engineer assessing the impact of changing one function. You get its code, the places that call it, and the test files that mention it.",
      "Reply in Markdown with exactly these sections:",
      "## Quién depende de esto\nSummarise the callers (group them by area). Do not invent callers that are not in the list.",
      "## Qué podría romperse\nBullets: what each kind of change (signature, return value, errors, side effects) would break and where.",
      "## Tests afectados\nWhich of the listed test files probably fail, and which gaps remain (no tests listed = say so).",
      "## Plan de cambio seguro\nNumbered steps to change it without breaking things (add tests first, change, migrate callers, remove old).",
      `Write in ${languageName(lang)}, keeping the four headings exactly as shown above.`,
    ].join("\n"),
    user: `Function: ${name}\n<code>\n${code.slice(0, LIMIT)}\n</code>\n<callers>\n${list}\n</callers>\n<tests>\n${t}\n</tests>`,
    maxTokens: 1600,
    temperature: 0.2,
  };
}

/** Explica un hallazgo local (code smell o secreto) y propone un arreglo. Nunca repite un secreto. */
export function findingRequest(kind: "smell" | "secret", message: string, snippet: string, lang: string): ChatRequest {
  const secret = kind === "secret";
  return {
    system: [
      secret
        ? "You are a security-minded teacher. A local scanner flagged a possible secret in the user's code (its value is masked)."
        : "You are a friendly teacher. A local analyzer flagged a possible code smell.",
      "Reply in Markdown with exactly these sections:",
      "## Por qué importa\n2 or 3 plain sentences.",
      secret
        ? "## Qué hacer ahora\nNumbered steps: revoke or rotate the key first, then move it to an environment variable or secret manager, then clean the git history if it was committed. Never print or ask for the secret value."
        : "## Cómo mejorarlo\nNumbered steps, with a short refactored example in a fenced code block when it helps.",
      `Write in ${languageName(lang)}, keeping the two headings exactly as shown above.`,
    ].join("\n"),
    user: `<finding>\n${message}\n</finding>\n<code>\n${snippet.slice(0, LIMIT)}\n</code>`,
    maxTokens: 1000,
    temperature: 0.2,
  };
}

/** Un prompt guardado por el usuario aplicado a su código. */
export function savedPromptRequest(prompt: string, lang: string): ChatRequest {
  return {
    system: [
      "You are a helpful programming assistant. Follow the user's instruction about their code. Reply in clear Markdown, with code in fenced blocks when you write code.",
      `Write in ${languageName(lang)} unless the instruction asks for another language.`,
    ].join("\n"),
    user: prompt.slice(0, LIMIT * 2),
    maxTokens: 2000,
    temperature: 0.3,
  };
}

const fnUser = (code: string, name: string, language: string) => `Function: ${name} (${language})\n<code>\n${code.slice(0, LIMIT)}\n</code>`;

/** «Revisión de código»: un revisor estricto de PR ajeno, con los hallazgos ordenados por severidad. */
export function reviewRequest(code: string, name: string, language: string, lang: string): ChatRequest {
  return {
    system: [
      "You are a strict, fair senior reviewer looking at code from someone else's pull request. The user shares one piece of code.",
      "Reply in Markdown with exactly these sections:",
      "## Veredicto\nOne sentence: approve, approve with changes, or request changes, and why.",
      "## Hallazgos\nA list ordered by severity (🔴 crítico, 🟠 importante, 🟡 menor). Each item: severity, the exact line or expression, the problem (bugs, edge cases, concurrency, error handling, security, readability) and a concrete fix. Only report what the code really shows; never invent code that is not there. Say «Nada relevante» if there is nothing.",
      "## Lo que está bien\nUp to 3 short bullets.",
      `Write in ${languageName(lang)}, keeping the three headings exactly as shown above.`,
    ].join("\n"),
    user: fnUser(code, name, language),
    maxTokens: 1800,
    temperature: 0.2,
  };
}

/** «Revisor de seguridad»: vulnerabilidades tipo OWASP en una selección, con categoría y arreglo. */
export function securityRequest(code: string, name: string, language: string, lang: string): ChatRequest {
  return {
    system: [
      "You are an application security reviewer. The user shares one piece of code. Look for OWASP Top 10 style problems: injection (SQL, command, NoSQL), XSS, path traversal, insecure deserialization, broken access control, SSRF, weak crypto, unsafe use of user input, missing validation, secrets handling.",
      "Reply in Markdown with exactly these sections:",
      "## Resumen\nOne or two sentences with the overall risk (Alto, Medio, Bajo, Sin hallazgos).",
      "## Vulnerabilidades\nFor each finding: the OWASP category (e.g. A03:2021 Injection), the exact line or expression, how it could be exploited in one sentence, and the fix with a short fenced code example. Only report what the code really shows; if user input does not reach the dangerous place in this snippet, say so instead of guessing. Say «Ninguna evidente» if there are none.",
      "## Buenas prácticas\nUp to 3 bullets of hardening that apply to this code.",
      `Write in ${languageName(lang)}, keeping the three headings exactly as shown above.`,
    ].join("\n"),
    user: fnUser(code, name, language),
    maxTokens: 1800,
    temperature: 0.2,
  };
}

/** «Complejidad Big-O»: análisis temporal/espacial, cuello de botella y versión optimizada. */
export function complexityRequest(code: string, name: string, language: string, lang: string): ChatRequest {
  return {
    system: [
      "You are an algorithms expert. The user shares one function.",
      "Reply in Markdown with exactly these sections:",
      "## Complejidad\nTime and space in Big-O (best/typical/worst when they differ), with a one-line reason each. Name what n is.",
      "## Cuello de botella\nThe exact loop, nested loop, repeated lookup or call-in-a-loop that dominates the cost, quoting the line.",
      "## Versión optimizada\nA short explanation of the idea, then ONE fenced code block with the complete replacement function (same name, parameters and result; same language and style). If it is already optimal, say so and do NOT include a code block.",
      "## Ojo con\nBullets of trade-offs (memory, readability, behaviour that could differ). Say «Nada evidente» if none.",
      `Write in ${languageName(lang)}, keeping the four headings exactly as shown above.`,
    ].join("\n"),
    user: fnUser(code, name, language),
    maxTokens: 2000,
    temperature: 0.2,
  };
}

/** «Migrar código»: convierte código existente a otra forma (TypeScript estricto, async/await, Python 3…). */
export function migrateRequest(code: string, goal: string, lang: string): ChatRequest {
  return {
    system: [
      "You are a migration expert. The user shares existing code and says what to migrate it to. Keep the behaviour identical unless the migration requires otherwise.",
      "Reply in Markdown with exactly these sections:",
      "## Qué cambié\nBullets of the main changes.",
      "## Código\nONE fenced code block with the complete migrated code (use the language tag of the target).",
      "## Ojo con\nBullets of behaviour differences, new dependencies or manual steps left. Say «Nada evidente» if none.",
      `Write in ${languageName(lang)}, keeping the three headings exactly as shown above.`,
    ].join("\n"),
    user: `Migrate to: ${goal.slice(0, 500)}\n<code>\n${code.slice(0, LIMIT)}\n</code>`,
    maxTokens: 2500,
    temperature: 0.2,
  };
}

/** «Post-mortem»: reconstruye un incidente a partir de un stack trace y logs. */
export function postmortemRequest(trace: string, logs: string | undefined, context: string | undefined, lang: string): ChatRequest {
  return {
    system: [
      "You are a senior SRE writing a blameless post-mortem draft. The user shares a production stack trace and optionally logs and context.",
      "Reply in Markdown with exactly these sections:",
      "## Resumen\n2 or 3 sentences: what failed and the impact that the evidence shows.",
      "## Línea temporal\nA list of events in order, using only timestamps and facts present in the input (say «sin hora» when there is none). Never invent events.",
      "## Causa raíz probable\nThe most likely cause, the evidence for it and your confidence (alta, media, baja). Mention the alternative causes you could not rule out.",
      "## Qué comprobar ahora\nNumbered, concrete checks to confirm the cause.",
      "## Medidas preventivas\nBullets: fix, tests, monitoring/alerts and process changes.",
      `Write in ${languageName(lang)}, keeping the five headings exactly as shown above.`,
    ].join("\n"),
    user: `<stacktrace>\n${trace.slice(0, 8000)}\n</stacktrace>\n<logs>\n${(logs ?? "(none)").slice(0, 8000)}\n</logs>\n<context>\n${(context ?? "(none)").slice(0, 2000)}\n</context>`,
    maxTokens: 2000,
    temperature: 0.2,
  };
}

// --- El Taller: artefactos de texto renderizable (SVG, CSS, datos de prueba) ---------------

export const SVG_MAX_CHARS = 20_000;

export type SvgResult = { ok: true; svg: string } | { ok: false; reason: "none" | "invalid" | "unsafe" | "too-large" };

const UNSAFE_SVG = [
  /<\s*(?:script|foreignObject|iframe|object|embed|audio|video|canvas|animate\w*|set|handler)\b/i,
  /<!\s*(?:ENTITY|DOCTYPE)/i,
  /\son[a-z]+\s*=/i,
  /javascript\s*:/i,
  /data\s*:\s*text\/html/i,
  /href\s*=\s*(?!["']?\s*#)/i,
  /url\(\s*(?!["']?\s*#)/i,
  /@import/i,
];

/** Atributos del <svg> raíz; null si las comillas no cierran. */
function rootAttributes(tag: string): Record<string, string> | null {
  const inner = tag.slice(4, -1).replace(/\/\s*$/, "");
  const attrs: Record<string, string> = {};
  const rest = inner.replace(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_m, k: string, a?: string, b?: string) => {
    attrs[k.toLowerCase()] = a ?? b ?? "";
    return " ";
  });
  return /["'<>=]/.test(rest) ? null : attrs;
}

/**
 * Extrae el primer SVG de una respuesta (de un bloque de código o suelto) y lo valida para mostrarlo sin riesgo:
 * empieza por <svg, sus atributos son correctos y no lleva scripts, manejadores on*=, recursos externos ni DOCTYPE.
 * Si falta xmlns o viewBox, los añade (hacen falta para verlo como imagen).
 */
export function extractSvg(markdown: string): SvgResult {
  const block = firstCodeBlock(markdown);
  const source = block && /<svg\b/i.test(block) ? block : markdown;
  const start = source.search(/<svg\b/i);
  const end = source.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < start) return { ok: false, reason: start < 0 ? "none" : "invalid" };
  let svg = source.slice(start, end + 6).trim();
  if (svg.length > SVG_MAX_CHARS) return { ok: false, reason: "too-large" };
  if (UNSAFE_SVG.some((re) => re.test(svg))) return { ok: false, reason: "unsafe" };
  const open = /^<svg\b[^>]*>/i.exec(svg);
  const attrs = open && rootAttributes(open[0]);
  if (!open || !attrs) return { ok: false, reason: "invalid" };
  let extra = "";
  if (!attrs.xmlns) extra += ' xmlns="http://www.w3.org/2000/svg"';
  if (!attrs.viewbox) {
    const w = parseFloat(attrs.width ?? "");
    const h = parseFloat(attrs.height ?? "");
    extra += w > 0 && h > 0 ? ` viewBox="0 0 ${w} ${h}"` : ' viewBox="0 0 64 64"';
  }
  if (extra) svg = `<svg${extra}${svg.slice(4)}`;
  return { ok: true, svg };
}

/** Estilos del icono que se pueden elegir. */
export const ICON_STYLES = ["Minimalista", "Geométrico", "Divertido"] as const;
export const CSS_KINDS = ["Loader (carga)", "Fondo", "Patrón", "Animación"] as const;
export const DATA_FORMATS = ["JSON", "CSV", "SQL"] as const;

/** «Icono / logo»: UN SVG limpio de 64×64, con formas simples (los modelos pequeños lo hacen mejor así). */
export function iconRequest(description: string, style: string, lang: string): ChatRequest {
  return {
    system: [
      "You design clean vector icons and logos. The user describes one icon.",
      "Reply with ONE fenced code block containing only the SVG, and nothing else except at most one short sentence after it.",
      "Rules for the SVG: root `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\">`; at most about 8 shapes (path, circle, rect, ellipse, polygon, line); flat solid colors (hex); no gradients, filters, masks, images, scripts, animations, external references or text; centred, with some margin inside the 64×64 box.",
      "Small models draw best with simple geometric shapes: prefer circles, rounded rectangles and straight paths over long curves.",
      `Visual style: ${style || ICON_STYLES[0]}.`,
      `If you add a sentence, write it in ${languageName(lang)}.`,
    ].join("\n"),
    user: `Icon: ${description.slice(0, 1000)}`,
    maxTokens: 1500,
    temperature: 0.4,
  };
}

/** «Arte CSS»: patrones, loaders, fondos o animaciones con un HTML mínimo que los use. */
export function cssArtRequest(description: string, kind: string, lang: string): ChatRequest {
  return {
    system: [
      "You write pure CSS art. The user describes what they want.",
      `Kind: ${kind || CSS_KINDS[0]}. Use only CSS (gradients, box-shadow, transforms, @keyframes); no JavaScript, no images, no external fonts or URLs.`,
      "Reply in Markdown with exactly these sections:",
      "## Código\nTWO fenced code blocks: first the HTML snippet (minimal, ready to paste inside <body>), then the CSS. Use short, unique class names. If it animates, add a `@media (prefers-reduced-motion: reduce)` rule that stops the animation.",
      "## Cómo personalizarlo\n2 or 3 bullets: which values to change (colors, size, speed).",
      `Write in ${languageName(lang)}, keeping the two headings exactly as shown above.`,
    ].join("\n"),
    user: `Description: ${description.slice(0, 1000)}`,
    maxTokens: 1800,
    temperature: 0.4,
  };
}

/** «Datos de prueba»: filas realistas en JSON, CSV o SQL a partir de un esquema descrito. */
export function mockDataRequest(schema: string, count: number, format: string, lang: string): ChatRequest {
  const n = Math.max(1, Math.min(200, Math.round(count) || 10));
  const sql = format === "SQL";
  return {
    system: [
      "You generate realistic test data. The user describes a schema (fields, types, rules).",
      `Produce exactly ${n} records in ${format || DATA_FORMATS[0]}.${sql ? " Write CREATE TABLE (inferred types) followed by INSERT statements." : ""}`,
      "Make the values plausible and varied (names, dates, amounts, ids that do not repeat); respect any rule the schema states. Never use real people's data, real emails or real phone numbers: use invented or example.com values.",
      "Reply in Markdown with exactly these sections:",
      "## Datos\nONE fenced code block with only the data (valid and ready to save).",
      "## Notas\nOne or two short bullets about assumptions you made.",
      `Write in ${languageName(lang)}, keeping the two headings exactly as shown above.`,
    ].join("\n"),
    user: `Schema:\n${schema.slice(0, 3000)}`,
    maxTokens: Math.min(4000, 400 + n * 90),
    temperature: 0.6,
  };
}
