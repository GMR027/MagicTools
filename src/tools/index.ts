import { errorRequest, ideaRequest, michiRequest } from "../core/prompts";
import { LANGUAGES, type ToolDef } from "../core/registry";

/** Herramientas de MagicTools. Cada una se añade aquí con su pestaña (starter | junior | senior). */
export const TOOLS: ToolDef[] = [
  {
    id: "understand",
    tab: "starter",
    title: "Entender (con Michi)",
    description: "Pega un error o un código y Michi te lo explica en palabras sencillas.",
    icon: "cat",
    action: "Pregúntale a Michi",
    mascot: "michi",
    fields: [
      { id: "mode", label: "¿Qué quieres entender?", kind: "select", options: ["Un error", "Un código"] },
      { id: "text", label: "Pega aquí el error o el código", kind: "textarea", placeholder: "El mensaje de error, la salida de la terminal o unas líneas de código…" },
      { id: "code", label: "Código que causó el error (opcional)", kind: "textarea", optional: true, placeholder: "Solo para errores: si lo pegas, Michi señala la línea exacta." },
    ],
    request: (v, lang) => (v.mode === "Un código" ? michiRequest(v.text ?? "", lang) : errorRequest(v.text ?? "", v.code?.trim() || undefined, lang, true)),
  },
  {
    id: "idea-to-code",
    tab: "starter",
    title: "Idea a código",
    description: "Cuenta qué quieres hacer y obtén un plan y el código comentado.",
    icon: "bulb",
    action: "Crear código",
    fields: [
      { id: "idea", label: "Tu idea", kind: "textarea", placeholder: "Ej.: un programa que pida mi edad y me diga si soy mayor de edad…" },
      { id: "language", label: "Lenguaje", kind: "language" },
    ],
    request: (v, lang) => ideaRequest(v.idea ?? "", v.language || LANGUAGES[0].label, lang),
  },
  {
    id: "pet",
    tab: "starter",
    title: "Mi animalito",
    description: "Come con el código que escribes a mano. Si lo escribe la IA, se infla.",
    icon: "paw",
    type: "fun",
    widget: "pet",
  },
  {
    id: "colors",
    tab: "junior",
    title: "Extractor de colores",
    description: "Saca los colores de una imagen y los guarda en src/css o src/sass.",
    icon: "palette",
    widget: "colors",
  },
  {
    id: "function-tree",
    tab: "junior",
    title: "Árbol de función",
    description: "Dibuja cómo se llega hasta la función bajo el cursor y qué llama. Crea un .md en «Arbol de funciones».",
    icon: "tree",
    command: true,
  },
];
