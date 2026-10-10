import type { ChatRequest } from "./types";

/** Niveles (pestañas) del panel. */
export type TabId = "starter" | "junior" | "senior";

export const TABS: readonly { id: TabId; label: string; subtitle: string }[] = [
  { id: "starter", label: "Starter", subtitle: "Para dar los primeros pasos" },
  { id: "junior", label: "Junior", subtitle: "Para el trabajo del día a día" },
  { id: "senior", label: "Senior", subtitle: "Para perfiles avanzados" },
];

/** Tipo de herramienta: así se agrupan en el panel. */
export type ToolType = "ai" | "util" | "fun";

export const TYPES: readonly { id: ToolType; label: string; hint: string }[] = [
  { id: "ai", label: "Con IA", hint: "Usan tu modelo local o tu API" },
  { id: "util", label: "Utilidades", hint: "Funcionan sin IA, en tu equipo" },
  { id: "fun", label: "Motivación", hint: "Para mantener el ritmo" },
];

/** Lenguajes que se pueden elegir (nombre para la IA → id de VS Code). */
export const LANGUAGES: { label: string; id: string }[] = [
  { label: "Python", id: "python" },
  { label: "JavaScript", id: "javascript" },
  { label: "TypeScript", id: "typescript" },
  { label: "React", id: "javascriptreact" },
  { label: "HTML", id: "html" },
  { label: "CSS", id: "css" },
  { label: "Sass", id: "scss" },
  { label: "Java", id: "java" },
  { label: "C", id: "c" },
  { label: "C++", id: "cpp" },
  { label: "C#", id: "csharp" },
  { label: "PHP", id: "php" },
  { label: "Go", id: "go" },
  { label: "Rust", id: "rust" },
];

/** Campo de entrada de una herramienta. */
export interface FieldDef {
  id: string;
  label: string;
  kind: "textarea" | "language" | "select";
  placeholder?: string;
  /** Opciones de un campo «select» (la primera es la de por defecto). */
  options?: string[];
  /** Si es true, no hace falta rellenarlo. */
  optional?: boolean;
}

/** Una herramienta del panel. Añadir una nueva = añadirla a `src/tools/index.ts`. */
export interface ToolDef {
  /** Identificador único. */
  id: string;
  tab: TabId;
  title: string;
  description: string;
  /** Nombre de un icono de media/panel.js (por defecto, una varita). */
  icon?: string;
  /** Campos de entrada que pinta el panel. */
  fields?: FieldDef[];
  /** Herramienta que usa la IA: construye la petición a partir de lo escrito en el formulario. */
  request?: (values: Record<string, string>, lang: string) => ChatRequest;
  /** Etiqueta del botón de acción. */
  action?: string;
  /** Tipo (grupo del panel). Por defecto: «ai» si usa la IA y «util» si no. */
  type?: ToolType;
  /** Mascota animada que acompaña a la herramienta. */
  mascot?: "michi";
  /** Pieza de interfaz propia del panel (en lugar de un formulario). */
  widget?: "pet" | "colors";
  /** Herramienta sin formulario: al pulsarla se ejecuta el comando `magictools.tool.<id>`. */
  command?: boolean;
}

/** Lo que recibe la vista por cada herramienta. */
export interface ToolInfo {
  id: string;
  title: string;
  description: string;
  icon?: string;
  ai: boolean;
  action: string;
  fields: FieldDef[];
  mascot?: "michi";
  widget?: "pet" | "colors";
  command: boolean;
  type: ToolType;
}

/** Tipo de una herramienta (el indicado o, si no, según use IA o no). */
export function toolType(t: Pick<ToolDef, "type" | "request">): ToolType {
  return t.type ?? (t.request ? "ai" : "util");
}

export function toolsByTab(tools: readonly ToolDef[]): Record<TabId, ToolInfo[]> {
  const out: Record<TabId, ToolInfo[]> = { starter: [], junior: [], senior: [] };
  for (const t of tools) {
    out[t.tab].push({
      id: t.id,
      title: t.title,
      description: t.description,
      icon: t.icon,
      ai: !!t.request,
      action: t.action ?? "Generar",
      fields: t.fields ?? [],
      mascot: t.mascot,
      widget: t.widget,
      command: !!t.command,
      type: toolType(t),
    });
  }
  return out;
}

/** Devuelve los problemas del registro (ids repetidos o pestañas que no existen). */
export function validateTools(tools: readonly ToolDef[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const tabs = new Set<string>(TABS.map((t) => t.id));
  for (const t of tools) {
    if (!/^[a-z][a-z0-9-]*$/.test(t.id)) problems.push(`id no válido: «${t.id}»`);
    if (seen.has(t.id)) problems.push(`id repetido: «${t.id}»`);
    seen.add(t.id);
    if (!tabs.has(t.tab)) problems.push(`«${t.id}»: la pestaña «${t.tab}» no existe`);
    if (t.request && !t.fields?.length) problems.push(`«${t.id}»: una herramienta con IA necesita campos`);
  }
  return problems;
}

/** Cómo pedirle a la IA cada lenguaje (los de marcado y estilos no son «programas»). */
export function describeTarget(label: string): string {
  switch (label) {
    case "React": return "React component (JSX, a function component, in a single file)";
    case "HTML": return "complete HTML5 page (HTML only; minimal inline CSS only if really needed)";
    case "CSS": return "CSS stylesheet (and, in a second code block, a short HTML snippet that uses it)";
    case "Sass": return "Sass stylesheet in SCSS syntax (and, in a second code block, a short HTML snippet that uses it)";
    default: return `${label} program`;
  }
}

/** Nombre del lenguaje para la IA a partir del id de VS Code (Python si no se conoce). */
export function languageFromEditor(languageId: string | undefined): string {
  return LANGUAGES.find((l) => l.id === languageId)?.label ?? "Python";
}

/** Id de VS Code para un nombre de lenguaje (para abrir el código en un archivo nuevo). */
export function languageId(label: string): string {
  return LANGUAGES.find((l) => l.label === label)?.id ?? "plaintext";
}
