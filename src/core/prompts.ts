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
  return raw.replace(/^\s*```(?:markdown|md)?\n/, "").replace(/\n```\s*$/, "").trim();
}

const LIMIT = 15_000;

/** «Traducir error»: qué significa un error, por qué ocurre y cómo arreglarlo, para un principiante. */
export function errorRequest(error: string, code: string | undefined, lang: string, michi = false): ChatRequest {
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
export function michiRequest(code: string, lang: string): ChatRequest {
  return {
    system: [
      "You are Michi, a friendly, playful cat who teaches programming to beginners. A beginner pastes a piece of code.",
      "Explain what it does using comparisons from the daily life of cats (napping, hunting, chasing a laser dot, being fed, knocking things off the table, scratching the sofa, boxes, the litter box, purring, curiosity...).",
      "Every comparison must map clearly to what the code really does, so the beginner truly understands it. Never invent behaviour the code does not have.",
      "Reply in Markdown with exactly these three sections:",
      "## Michi te cuenta\nWhat the code does as a short story of a cat's day, in 3 to 6 sentences. Start with a cat sound such as «Miau».",
      "## Paso a paso\nBullets, one per important line or block: first the cat comparison, then the real meaning in programming (name the line or expression).",
      "## En palabras de programador\nOne or two plain sentences with the exact technical meaning, and any term a beginner should learn (variable, loop, function...), each in bold.",
      `Write in ${languageName(lang)}, keeping the three headings exactly as shown above. Keep it warm, short and without being childish.`,
    ].join("\n"),
    user: `<code>\n${code.slice(0, LIMIT)}\n</code>`,
    maxTokens: 1400,
    temperature: 0.5,
  };
}
