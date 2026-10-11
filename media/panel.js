// Vista lateral de MagicTools. El estado lo envía src/panel.ts; aquí solo se pinta y se reenvían los clics.
// @ts-check
/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();
const app = /** @type {HTMLElement} */ (document.getElementById("app"));
/** @type {{ tab?: string, open?: string, colors?: { count: string, format: string }, structure?: { template: string, where: string } }} */
const saved = vscode.getState() || {};
/** Lo escrito en los campos: se conserva aunque el panel se vuelva a pintar. @type {Record<string, string>} */
const drafts = {};
/** @type {any} */
let state;

window.addEventListener("message", (e) => {
  const m = e.data;
  if (m?.type === "state") {
    state = m.state;
    render();
  } else if (m?.type === "pet" && state) {
    // Solo se repinta la tarjeta del animalito: así no se pierde lo que escribes en otros campos.
    state.pet = m.pet;
    const card = document.getElementById("pet-card");
    if (card) card.innerHTML = petCard(state);
  } else if (m?.type === "extract") {
    extractColors(m);
  }
});

/** Calcula la paleta de la imagen con un <canvas> y se la devuelve a la extensión. */
function extractColors({ dataUrl, name, count, format }) {
  const img = new Image();
  img.onerror = () => vscode.postMessage({ type: "paletteError", message: "formato no reconocido" });
  img.onload = () => {
    const scale = Math.min(1, 120 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const colors = window.MagicToolsColors.extractPalette(ctx.getImageData(0, 0, canvas.width, canvas.height).data, count);
    vscode.postMessage({ type: "palette", colors, name, format });
  };
  img.src = dataUrl;
}

app.addEventListener("click", (e) => {
  const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest("[data-action]"));
  if (!el || /** @type {HTMLButtonElement} */ (el).disabled) return;
  if (el.tagName === "A") e.preventDefault();
  if (el.dataset.action === "tab") {
    saved.tab = el.dataset.tab;
    vscode.setState(saved);
    render();
    return;
  }
  if (el.dataset.action === "pickImage") {
    const count = /** @type {HTMLSelectElement} */ (document.getElementById("colors-count")).value;
    const format = /** @type {HTMLSelectElement} */ (document.getElementById("colors-format")).value;
    saved.colors = { count, format };
    vscode.setState(saved);
    vscode.postMessage({ type: "pickImage", count, format });
    return;
  }
  if (el.dataset.action === "createStructure") {
    const template = /** @type {HTMLSelectElement} */ (document.getElementById("structure-template")).value;
    const where = /** @type {HTMLSelectElement} */ (document.getElementById("structure-where")).value;
    vscode.postMessage({ type: "createStructure", template, where });
    return;
  }
  if (el.dataset.action === "toggleTool") {
    saved.open = saved.open === el.dataset.id ? undefined : el.dataset.id;
    vscode.setState(saved);
    render();
    return;
  }
  if (el.dataset.action === "runTool") {
    const id = el.dataset.id;
    /** @type {Record<string, string>} */
    const values = {};
    app.querySelectorAll(`[data-field^="${id}:"]`).forEach((f) => {
      values[/** @type {HTMLElement} */ (f).dataset.field.split(":")[1]] = /** @type {HTMLInputElement} */ (f).value;
    });
    vscode.postMessage({ type: "runTool", id, values });
    return;
  }
  const { action, ...data } = el.dataset;
  vscode.postMessage({ type: action, ...data });
});

app.addEventListener("input", (e) => {
  const el = /** @type {HTMLInputElement} */ (e.target);
  if (el.dataset.field) drafts[el.dataset.field] = el.value;
});
app.addEventListener("change", (e) => {
  const el = /** @type {HTMLInputElement} */ (e.target);
  if (el.dataset.field) drafts[el.dataset.field] = el.value;
  if (el.dataset.field?.startsWith("workshop-") && el.dataset.field.endsWith(":kind")) {
    render();
    return;
  }
  if (el.id === "structure-template" || el.id === "structure-where") {
    saved.structure = {
      template: /** @type {HTMLSelectElement} */ (document.getElementById("structure-template")).value,
      where: /** @type {HTMLSelectElement} */ (document.getElementById("structure-where")).value,
    };
    vscode.setState(saved);
    render();
    return;
  }
  if (el.id === "colors-count" || el.id === "colors-format") {
    saved.colors = {
      count: /** @type {HTMLSelectElement} */ (document.getElementById("colors-count")).value,
      format: /** @type {HTMLSelectElement} */ (document.getElementById("colors-format")).value,
    };
    vscode.setState(saved);
  }
});

vscode.postMessage({ type: "ready" });

// --- Iconos (SVG en línea, trazo fino con el color del texto) ------------------------
const PATHS = {
  wand: '<path d="M4 20 15 9"/><path d="M16 3v4M14 5h4M20 11v3M18.5 12.5h3"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 2.5-6 7-6 0 4-2.5 6-7 6z"/><path d="M12 15c0-3-2-5-6-5 0 3.5 2 5 6 5z"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v8"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
  cat: '<path d="M5 11 4 4l4 2.5a8 8 0 0 1 8 0L20 4l-1 7a7 7 0 1 1-14 0z"/><path d="M9.5 12v.5M14.5 12v.5M11 15.5h2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1-.8-1.4-.8-2.4 0-.9.7-1.6 1.7-1.6H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
  paw: '<circle cx="6" cy="11" r="1.8"/><circle cx="10" cy="6.5" r="1.8"/><circle cx="14" cy="6.5" r="1.8"/><circle cx="18" cy="11" r="1.8"/><path d="M12 12c-3 0-5.5 3-5.5 5.2 0 1.6 1.3 2.3 2.6 2.3 1 0 1.8-.5 2.9-.5s1.9.5 2.9.5c1.3 0 2.6-.7 2.6-2.3C17.5 15 15 12 12 12z"/>',
  folder: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  tree: '<rect x="3" y="3" width="6" height="4" rx="1"/><rect x="15" y="10" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/><path d="M6 7v12h9M6 12h9"/>',
  bug: '<path d="M9 9a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z"/><path d="M12 9v9M9 11H5M15 11h4M9 15H5.5M15 15h3.5M10 6 8.5 4M14 6l1.5-2"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V16h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.5 4.25 4.25 0 0 0 7 18z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  filePlus: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  warning: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.7v.3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L3 9M3 4v5h5M4 13a8 8 0 0 0 14.6 4.5L21 15M21 20v-5h-5"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
};
/** @param {string} name */
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${/** @type {Record<string, string>} */ (PATHS)[name] ?? PATHS.wand}</svg>`;

/** @param {unknown} s */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const TAB_ICON = /** @type {Record<string, string>} */ ({ starter: "sprout", junior: "code", senior: "crown" });

const current = () => (state.tabs.some((/** @type {any} */ t) => t.id === saved.tab) ? saved.tab : state.tabs[0].id);

/** El sombrero es un nodo persistente: así su animación de entrada no se reinicia al repintar. */
const logo = document.createElement("div");
logo.className = "logo intro";
logo.setAttribute("aria-hidden", "true");
logo.innerHTML = `<svg class="icon" viewBox="0 0 32 32" fill="none" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
  <ellipse class="hat-brim" cx="13" cy="26.4" rx="10.8" ry="3.2"/>
  <path class="hat-crown" d="M7.5 25.6V11.6C7.5 10 10 9.2 13 9.2s5.5.8 5.5 2.4v14c0 1.2-2.4 2.2-5.5 2.2s-5.5-1-5.5-2.2z"/>
  <path class="hat-band" d="M7.5 20.2c0 1.2 2.4 2.2 5.5 2.2s5.5-1 5.5-2.2v2.6c0 1.2-2.4 2.2-5.5 2.2s-5.5-1-5.5-2.2z"/>
  <ellipse class="hat-mouth" cx="13" cy="11.4" rx="5.5" ry="2.1"/>
  <g class="wand">
    <path class="wand-edge" d="M13.6 11.2 25.6 4.4"/>
    <path class="wand-body" d="M13.6 11.2 25.6 4.4"/>
    <path class="wand-grip" d="M13.6 11.2 16.4 9.6"/>
    <path class="spark star" d="M27 .9l1.1 3 3 1.1-3 1.1-1.1 3-1.1-3-3-1.1 3-1.1z"/>
  </g>
  <path class="spark plus" d="M28.8 14v3.6M27 15.8h3.6"/>
  <circle class="spark dot" cx="21" cy="1.8" r=".9"/>
</svg>`;
// Pasado el saludo inicial, solo se anima al pasar el puntero.
setTimeout(() => logo.classList.remove("intro"), 6000);

function header(s) {
  const n = s.total;
  const ai = s.ai;
  const status = ai.ready ? "on" : "warn";
  const statusText = ai.ready ? "IA lista" : "IA sin configurar";
  const modes = [
    ["local", "cpu", "Local", "En tu equipo"],
    ["api", "cloud", "API", "En la nube"],
  ]
    .map(
      ([m, ico, label, sub]) => `<button class="mode" role="radio" aria-checked="${ai.mode === m}" data-action="mode" data-mode="${m}">
        ${icon(ico)}<span><strong>${label}</strong><small>${sub}</small></span></button>`,
    )
    .join("");
  const notice = ai.notice
    ? `<div class="notice ${ai.notice.level}" role="status">${icon(ai.notice.level === "warn" ? "warning" : "info")}<p>${esc(ai.notice.text)}</p></div>`
    : "";
  const problem = ai.problem
    ? `<div class="notice warn" role="status">${icon("warning")}<div><p>${esc(ai.problem)}</p>${
        ai.mode === "api" ? `<button class="btn" data-action="configureApi">Configurar API</button>` : `<button class="btn ghost" data-action="refresh">${icon("refresh")}Reintentar</button>`
      }</div></div>`
    : "";
  return `<header class="hero ${status}">
    <div class="brand">
      <div class="logo-slot"></div>
      <div class="grow">
        <h1>MagicTools</h1>
        <p class="status"><span class="dot"></span>${statusText}</p>
        <p class="detail" title="${esc(ai.label)}">${esc(ai.label)} · ${n ? `${n} herramienta${n === 1 ? "" : "s"}` : "sin herramientas"}</p>
      </div>
      <button class="icon-btn" data-action="refresh" title="Actualizar" aria-label="Actualizar">${icon("refresh")}</button>
    </div>
    <div class="modes" role="radiogroup" aria-label="Origen de la IA">${modes}</div>
    ${ai.mode === "api" && ai.ready ? `<button class="link" data-action="configureApi">${icon("settings")}<span>${esc(ai.label)}</span></button>` : ""}
    ${notice}${problem}
  </header>`;
}

function tabs(s) {
  return `<nav class="tabs" role="tablist" aria-label="Niveles de MagicTools">${s.tabs
    .map(
      (/** @type {any} */ t) => `<button class="tab" role="tab" aria-selected="${current() === t.id}" data-action="tab" data-tab="${t.id}" data-hue="${t.id}">
      ${icon(TAB_ICON[t.id])}<span>${esc(t.label)}</span></button>`,
    )
    .join("")}</nav>`;
}

/** Markdown mínimo (títulos, listas, negritas, código) ya escapado. @param {string} md */
function markdown(md) {
  const inline = (/** @type {string} */ t) =>
    esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  let html = "";
  let list = "";
  const close = () => {
    if (list) html += `</${list}>`;
    list = "";
  };
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      close();
      const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      html += `<pre><code>${esc(code.join("\n"))}</code></pre>`;
      continue;
    }
    const h = /^#{1,6}\s+(.*)/.exec(line);
    const ul = /^\s*[-*]\s+(.*)/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)/.exec(line);
    if (h) (close(), (html += `<h4>${inline(h[1])}</h4>`));
    else if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (list !== kind) (close(), (html += `<${kind}>`), (list = kind));
      html += `<li>${inline((ul || ol)[1])}</li>`;
    } else if (line.trim()) (close(), (html += `<p>${inline(line)}</p>`));
    else close();
  }
  close();
  return html;
}

/** Un campo del formulario de una herramienta. */
function field(s, tool, f) {
  const key = `${tool.id}:${f.id}`;
  const value = drafts[key];
  const label = `<label class="field-label" for="f-${esc(key)}">${esc(f.label)}</label>`;
  if (f.kind === "select") {
    const chosen = value ?? f.options[0];
    return `<div class="field">${label}<select id="f-${esc(key)}" data-field="${esc(key)}">${f.options
      .map((/** @type {string} */ o) => `<option${o === chosen ? " selected" : ""}>${esc(o)}</option>`)
      .join("")}</select></div>`;
  }
  if (f.kind === "language") {
    const chosen = value ?? s.editorLanguage;
    return `<div class="field">${label}<select id="f-${esc(key)}" data-field="${esc(key)}">${s.languages
      .map((/** @type {string} */ l) => `<option${l === chosen ? " selected" : ""}>${esc(l)}</option>`)
      .join("")}</select></div>`;
  }
  return `<div class="field">${label}<textarea id="f-${esc(key)}" rows="${f.optional ? 3 : 5}" data-field="${esc(key)}" placeholder="${esc(f.placeholder ?? "")}" spellcheck="false">${esc(value ?? "")}</textarea></div>`;
}

function result(s, tool, r = s.results[tool.id]) {
  if (!r) return "";
  const hasCode = r.text.includes("```");
  return `<div class="result">
    <div class="markdown">${markdown(r.text)}</div>
    <div class="row-btns">
      <button class="btn ghost" data-action="copy" data-id="${esc(tool.id)}">${icon("copy")}Copiar</button>
      ${hasCode ? `<button class="btn ghost" data-action="copyCode" data-id="${esc(tool.id)}">${icon("copy")}Copiar código</button>
      <button class="btn ghost" data-action="applyCode" data-id="${esc(tool.id)}" title="Muestra los cambios en el editor antes de aplicarlos">${icon("code")}Comparar y aplicar</button>
      <button class="btn ghost" data-action="insertCode" data-id="${esc(tool.id)}">${icon("filePlus")}Abrir en archivo</button>` : ""}
      <button class="btn ghost" data-action="clearResult" data-id="${esc(tool.id)}">${icon("close")}Cerrar</button>
    </div>
  </div>`;
}

// --- Animalitos (SVG; el estado de ánimo lo anima el CSS) ------------------------------
// Cabeza grande y ojos brillantes (estilo «chibi»). Cada especie añade sus orejas, cola y detalles.
const BACK = {
  gato: '<path class="tail stroke" d="M72 88C92 90 96 66 86 60"/>',
  perro: '<g class="tail-dog"><path class="tail-dog-shape dark" d="M70 86C82 84 88 74 86 66 82 70 76 76 68 80z"/></g>',
  conejo: '<circle class="puff" cx="72" cy="90" r="7.5"/>',
  pinguino: "",
};
const EARS = {
  gato:
    '<g class="ear ear-l"><path class="fur" d="M18 42C13 28 14 16 19 12 22 10.500 25 12.500 27 15L43 27z"/><path class="inner" d="M22 35C20 27 21 20 23 18L34 27z"/></g>' +
    '<g class="ear ear-r"><path class="fur" d="M82 42C87 28 86 16 81 12 78 10.500 75 12.500 73 15L57 27z"/><path class="inner" d="M78 35C80 27 79 20 77 18L66 27z"/></g>',
  perro:
    '<g class="ear ear-l"><ellipse class="dark" cx="20" cy="46" rx="9.500" ry="18" transform="rotate(16 20 46)"/></g>' +
    '<g class="ear ear-r"><ellipse class="dark" cx="80" cy="46" rx="9.500" ry="18" transform="rotate(-16 80 46)"/></g>',
  conejo:
    '<g class="ear ear-l"><ellipse class="fur" cx="35" cy="12" rx="8.500" ry="21"/><ellipse class="inner" cx="35" cy="13" rx="4" ry="15"/></g>' +
    '<g class="ear ear-r"><ellipse class="fur" cx="65" cy="12" rx="8.500" ry="21"/><ellipse class="inner" cx="65" cy="13" rx="4" ry="15"/></g>',
  pinguino: '<path class="dark tuft" d="M45 19c1-7 4-9 5-9s4 2 5 9z"/>',
};
const FACE_EXTRA = {
  gato: '<path class="stripes" d="M50 19v7M42.500 20.500l2 6M57.500 20.500l-2 6"/>',
  perro: '<ellipse class="dark" cx="64" cy="46" rx="10.500" ry="11.500"/><ellipse class="belly" cx="50" cy="58" rx="13" ry="10"/>',
  conejo: "",
  pinguino: '<path class="belly" d="M50 33C34 33 25 44 25 54c0 11 11 18 25 18s25-7 25-18c0-10-9-21-25-21z"/>',
};
const NOSE = {
  gato: '<path class="nose" d="M47.500 54h5l-2.500 3z"/>',
  perro: '<ellipse class="nose-dark" cx="50" cy="53" rx="5" ry="3.600"/>',
  conejo: '<path class="nose" d="M47.500 53.500h5l-2.500 3.200z"/>',
  pinguino: '<path class="beak beak-top" d="M42 54q8-6 16 0q-2 6-8 7-6-1-8-7z"/>',
};
const WHISKERS = '<path class="whisk" d="M30 55 15 51M30 59 14 60M70 55 85 51M70 59 86 60"/>';

/**
 * @param {string} species gato | perro | conejo | pinguino
 * @param {string} mood idle | happy | exercise | eating | hungry | balloon | frozen | think
 */
function animalSvg(species, mood) {
  const sp = species;
  const arms = '<ellipse class="arm arm-l fur" cx="29" cy="76" rx="6" ry="10" transform="rotate(14 29 76)"/><ellipse class="arm arm-r fur" cx="71" cy="76" rx="6" ry="10" transform="rotate(-14 71 76)"/>';
  const torsoBelly = sp === "pinguino" ? '<ellipse class="belly" cx="50" cy="82" rx="14" ry="13"/>' : '<ellipse class="belly" cx="50" cy="84" rx="13" ry="10"/>';
  const feet = sp === "pinguino" ? '<ellipse class="beak" cx="38" cy="95" rx="9" ry="3.800"/><ellipse class="beak" cx="62" cy="95" rx="9" ry="3.800"/>' : '<ellipse class="fur" cx="39" cy="94.500" rx="9" ry="4.500"/><ellipse class="fur" cx="61" cy="94.500" rx="9" ry="4.500"/>';
  const toes = sp === "pinguino" ? "" : '<path class="toes" d="M36 94.500v2M39 95v2M42 94.500v2M58 94.500v2M61 95v2M64 94.500v2"/>';
  const eye = (/** @type {number} */ x) =>
    `<ellipse class="pupil" cx="${x}" cy="48" rx="5.600" ry="6.600"/><circle class="shine" cx="${x - 1.800}" cy="45.400" r="2.300"/><circle class="shine" cx="${x + 2.200}" cy="50.600" r="1.100"/>`;
  const tear = (/** @type {number} */ x) => `<ellipse class="pupil" cx="${x}" cy="48.500" rx="6" ry="7"/><circle class="shine" cx="${x - 2}" cy="45.500" r="3"/><circle class="shine" cx="${x + 2.400}" cy="51" r="1.400"/>`;
  return `<svg class="animal sp-${sp} mood-${mood}" viewBox="0 -8 100 112" role="img" aria-label="${sp}">
    <ellipse class="shadow" cx="50" cy="99" rx="27" ry="4"/>
    <g class="pet-all">
      ${BACK[sp]}
      <g class="body">
        <g class="torso">
          <ellipse class="fur" cx="50" cy="80" rx="22" ry="17"/>
          ${torsoBelly}${arms}${feet}${toes}
        </g>
        <g class="head">
          ${EARS[sp]}
          <ellipse class="fur head-shape" cx="50" cy="46" rx="34" ry="29"/>
          <ellipse class="gloss" cx="38" cy="26" rx="13" ry="5" transform="rotate(-18 38 26)"/>
          ${FACE_EXTRA[sp]}
          <g class="face">
            <ellipse class="cheek" cx="27" cy="56" rx="6" ry="3.600"/><ellipse class="cheek" cx="73" cy="56" rx="6" ry="3.600"/>
            <g class="eyes-open"><g class="look">${eye(37)}${eye(63)}</g></g>
            <path class="eyes-happy" d="M31 50q6-9 12 0M57 50q6-9 12 0"/>
            <g class="eyes-sad">${tear(37)}${tear(63)}<path class="brow" d="M29 42l11-4M71 42l-11-4"/><path class="drop" d="M31 57q-3 5 0 6.500 3-1.500 0-6.500z"/></g>
            <path class="eyes-closed" d="M31 49q6 5 12 0M57 49q6 5 12 0"/>
            ${NOSE[sp]}
            ${sp === "gato" || sp === "conejo" ? WHISKERS : ""}
            <path class="m-smile" d="M44.500 59.500q2.800 3.800 5.500 0 2.700 3.800 5.500 0"/>
            <g class="m-open"><ellipse cx="50" cy="62.500" rx="5.500" ry="4.800"/><ellipse class="tongue" cx="50" cy="64.800" rx="3" ry="1.800"/></g>
            <path class="m-sad" d="M44.500 64q5.500-5 11 0"/>
            <path class="m-flat" d="M45 62h10"/>
            <ellipse class="m-o" cx="50" cy="62.500" rx="3" ry="3.400"/>
            <path class="tongue-out" d="M46.500 60.500q3.500 11 7 0z"/>
            ${sp === "conejo" ? '<rect class="tooth" x="47.200" y="61" width="2.800" height="3.600" rx="0.800"/><rect class="tooth" x="50" y="61" width="2.800" height="3.600" rx="0.800"/>' : ""}
          </g>
        </g>
      </g>
      <g class="dumbbell"><path d="M24 4h52"/><rect x="17" y="-4" width="8" height="16" rx="3"/><rect x="75" y="-4" width="8" height="16" rx="3"/></g>
    </g>
    <g class="balloon-string"><path d="M50 -6v-1.500M46.500 -9l3.500 5 3.500-5"/><path d="M50 100c-4 2.500 4 4.500 0 8"/></g>
    <g class="extras">
      <g class="glyphs"><text x="33" y="6">{ }</text><text x="48" y="-2">;</text><text x="60" y="8">&lt;/&gt;</text></g>
      <g transform="translate(80 26)"><path class="sweat" d="M0 0q-4 6 0 8 4-2 0-8z"/></g>
      <g class="hearts">
        <g transform="translate(82 28)"><path class="heart h1" d="M0 -1.500C-1.500-5-6-2.500-3.500 1L0 4.500 3.500 1C6-2.500 1.500-5 0-1.500z"/></g>
        <g transform="translate(20 22)"><path class="heart h2" d="M0 -1.500C-1.500-5-6-2.500-3.500 1L0 4.500 3.500 1C6-2.500 1.500-5 0-1.500z"/></g>
        <g transform="translate(88 44)"><path class="heart h3" d="M0 -1.500C-1.500-5-6-2.500-3.500 1L0 4.500 3.500 1C6-2.500 1.500-5 0-1.500z"/></g>
      </g>
      <g class="sparkles"><path class="spark s1" d="M14 6v6M11 9h6"/><path class="spark s2" d="M88 10v5M85.500 12.500h5"/></g>
      <path class="rumble" d="M30 90l-6 1.500M70 90l6 1.500M32 96l-6 3.500"/>
    </g>
    <g class="bubble bubble-hungry"><circle cx="78" cy="22" r="2"/><circle cx="84" cy="13" r="3"/><ellipse cx="90" cy="2" rx="10" ry="8"/><text x="90" y="6" text-anchor="middle">🍖</text></g>
    <g class="bubble bubble-think"><circle cx="78" cy="22" r="2"/><circle cx="84" cy="13" r="3"/><ellipse cx="90" cy="2" rx="10" ry="8"/><text x="90" y="6" text-anchor="middle">…</text></g>
    <g class="ice"><rect x="10" y="-2" width="80" height="104" rx="16"/><path class="shine-ice" d="M20 14v26M26 10l8 0"/><path d="M18 -2l3 -7 3 7M44 -2l3 -9 3 9M70 -2l3 -7 3 7"/></g>
  </svg>`;
}

const meter = (/** @type {string} */ label, /** @type {number} */ value, /** @type {number} */ max, /** @type {string} */ unit = "") =>
  `<div class="meter"><span>${label}</span><progress max="${max}" value="${Math.min(value, max)}"></progress><b>${value}${unit}</b></div>`;

/** Tarjeta del animalito: se repinta sola cuando cambia su estado. */
function petCard(s) {
  const p = s.pet;
  const text = p.enabled ? p.text : `${p.name} está en pausa: no cuento lo que escribes. Actívalo cuando quieras.`;
  // Con una cara de El Taller se muestra esa imagen (un <img>: nunca HTML crudo); si no, el animalito de siempre.
  const stage = s.petIcon ? `<img class="pet-custom" src="${esc(s.petIcon)}" alt="Cara de ${esc(p.name)}">` : animalSvg(p.species, p.enabled ? p.mood : "idle");
  return `<div class="pet-stage${p.enabled ? "" : " paused"}">${stage}</div>
    <p class="pet-text" role="status">${esc(text)}</p>
    <div class="meters">
      ${meter("Comida", p.food, 100)}
      ${meter("Globo", p.balloon, 100)}
      ${meter(p.frozen ? "Para descongelar" : "Racha", p.streak, p.thawNeed, p.frozen ? ` / ${p.thawNeed} días` : " días")}
      ${meter("Hoy", p.todayManual, p.minDay, ` / ${p.minDay} letras`)}
    </div>`;
}

function petWidget(s) {
  const choices = s.species
    .map(
      (/** @type {any} */ sp) => `<button class="species" role="radio" aria-checked="${s.pet.species === sp.id}" data-action="petSpecies" data-species="${sp.id}" title="${esc(sp.label)}">
        <span class="species-pic">${animalSvg(sp.id, "idle")}</span><small>${esc(sp.label)}</small></button>`,
    )
    .join("");
  return `<div class="pet" id="pet-card-wrap">
    <div class="switch-row"><span>Contar lo que escribo</span><button class="switch" role="switch" aria-checked="${s.pet.enabled}" aria-label="Activar o pausar al animalito" data-action="petToggle"><span></span></button></div>
    <p class="field-label">Elige tu animalito</p>
    <div class="species-row" role="radiogroup" aria-label="Animalito">${choices}</div>
    <div id="pet-card">${petCard(s)}</div>
    ${s.petIcon ? `<button class="btn ghost" data-action="petIconClear" title="Borra .magictools/pet-icon.svg">${icon("close")}Volver al animalito original</button>` : ""}
    <ul class="pet-rules">
      <li>✍️ Lo que escribes <strong>a mano</strong> lo alimenta: se pone contento y hace ejercicio.</li>
      <li>🎈 El código que aparece de golpe (IA) lo <strong>infla</strong> como un globo.</li>
      <li>🍖 Cada día sin programar le da <strong>hambre</strong>.</li>
      <li>❄️ Con 3 días sin código se <strong>congela</strong>: necesita una racha de 3 días para volver.</li>
    </ul>
    <p class="muted">Solo se cuentan letras; tu código no se guarda ni se envía a ningún sitio.</p>
  </div>`;
}

function colorsWidget(s) {
  const prev = saved.colors ?? { count: "6", format: "CSS" };
  const pal = s.palette;
  const swatches = pal
    ? `<div class="swatches">${pal.colors
        .map(
          (/** @type {string} */ c) => `<button class="swatch" data-action="copyText" data-value="${esc(c)}" title="Copiar ${esc(c)}">
        <svg viewBox="0 0 40 28" aria-hidden="true"><rect width="40" height="28" rx="5" fill="${esc(c)}" stroke="currentColor" stroke-opacity=".25"/></svg><span>${esc(c)}</span></button>`,
        )
        .join("")}</div>
      <p class="ok-line">${icon("check")}<span>Guardado en <code>${esc(pal.file)}</code></span></p>
      <button class="btn ghost" data-action="openFile" data-path="${esc(pal.file)}">${icon("file")}Abrir archivo</button>`
    : "";
  const opts = (/** @type {string[]} */ list, /** @type {string} */ cur) => list.map((o) => `<option${o === cur ? " selected" : ""}>${o}</option>`).join("");
  return `<div class="colors">
    <div class="two">
      <div class="field"><label class="field-label" for="colors-count">Cuántos colores</label><select id="colors-count">${opts(["3", "4", "5", "6", "8", "10", "12"], prev.count)}</select></div>
      <div class="field"><label class="field-label" for="colors-format">Guardar como</label><select id="colors-format">${opts(["CSS", "Sass"], prev.format)}</select></div>
    </div>
    <button class="btn wide" data-action="pickImage">${icon("palette")}Elegir imagen…</button>
    <p class="muted">Se guarda en <code>src/css/colors.css</code> o <code>src/sass/_colors.scss</code> del proyecto abierto. Si las carpetas no existen, se crean. Pulsa un color para copiarlo.</p>
    ${swatches}
  </div>`;
}

/** Árbol de carpetas en texto (con «├─» y «└─») a partir de rutas relativas. */
function treeLines(paths, root) {
  /** @type {{ dir: boolean, kids: Record<string, any> }} */
  const top = { dir: true, kids: {} };
  for (const p of paths) {
    const parts = p.split("/");
    let n = top;
    parts.forEach((part, i) => {
      const isDir = i < parts.length - 1;
      if (part === ".gitkeep") return; // solo sirve para que Git guarde la carpeta vacía
      n.kids[part] ??= { dir: isDir, kids: {} };
      n = n.kids[part];
    });
  }
  const lines = [root + "/"];
  /** @param {any} node @param {string} prefix */
  const walk = (node, prefix) => {
    const names = Object.keys(node.kids).sort((a, b) => (node.kids[a].dir === node.kids[b].dir ? a.localeCompare(b) : node.kids[a].dir ? -1 : 1));
    names.forEach((name, i) => {
      const last = i === names.length - 1;
      const kid = node.kids[name];
      lines.push(prefix + (last ? "└─ " : "├─ ") + name + (kid.dir ? "/" : ""));
      if (kid.dir) walk(kid, prefix + (last ? "   " : "│  "));
    });
  };
  walk(top, "");
  return lines.join("\n");
}

function structureWidget(s) {
  const prev = saved.structure ?? { template: s.templates[0].id, where: "here" };
  const tpl = s.templates.find((/** @type {any} */ t) => t.id === prev.template) ?? s.templates[0];
  const groups = s.templateGroups
    .map(
      (/** @type {string} */ g) => `<optgroup label="${esc(g)}">${s.templates
        .filter((/** @type {any} */ t) => t.group === g)
        .map((/** @type {any} */ t) => `<option value="${esc(t.id)}"${t.id === tpl.id ? " selected" : ""}>${esc(t.label)}</option>`)
        .join("")}</optgroup>`,
    )
    .join("");
  const here = s.projectFolder ? `En la carpeta abierta (${esc(s.projectFolder)})` : "En la carpeta abierta (ninguna)";
  const root = prev.where === "new" ? "mi-proyecto" : s.projectFolder || "mi-proyecto";
  const r = s.structure;
  return `<div class="structure">
    <div class="field"><label class="field-label" for="structure-template">Tipo de proyecto</label><select id="structure-template">${groups}</select></div>
    <p class="muted">${esc(tpl.hint)}</p>
    <div class="field"><label class="field-label" for="structure-where">Dónde crearlo</label>
      <select id="structure-where"><option value="here"${prev.where === "here" ? " selected" : ""}>${here}</option><option value="new"${prev.where === "new" ? " selected" : ""}>En una carpeta nueva…</option></select></div>
    <p class="field-label">Se creará</p>
    <pre class="tree-preview" aria-label="Vista previa de la estructura">${esc(treeLines(tpl.paths, root))}</pre>
    <button class="btn wide" data-action="createStructure">${icon("folder")}Crear estructura</button>
    <p class="muted">No sobrescribe archivos que ya existan y no instala nada: el README.md creado dice qué comandos ejecutar.</p>
    ${r ? `<p class="ok-line">${icon("check")}<span>${r.created} archivo(s) creados (${esc(r.template)})${r.skipped ? `, ${r.skipped} ya existían` : ""}.</span></p>` : ""}
  </div>`;
}

/** Motivos por los que se descarta un SVG (ver extractSvg). */
const SVG_PROBLEMS = {
  none: "El modelo no devolvió ningún SVG. Prueba con otra descripción o con un modelo de código.",
  invalid: "El SVG no estaba bien formado. Inténtalo de nuevo (con formas más simples suele salir mejor).",
  unsafe: "El SVG llevaba elementos no permitidos (scripts, enlaces externos…) y se descartó por seguridad.",
  "too-large": "El SVG salió demasiado grande. Pide algo más simple.",
};

/** El Taller: formulario según el tipo, vista previa segura del SVG y botones para guardarlo. */
function workshopWidget(s, t, busy) {
  const kindKey = `${t.id}:kind`;
  const kindField = t.fields.find((/** @type {any} */ f) => f.id === "kind");
  const kind = drafts[kindKey] ?? kindField.options[0];
  const isIcon = kind === kindField.options[0];
  const isCss = kind === kindField.options[1];
  const isData = kind === kindField.options[2];
  const visible = (/** @type {string} */ id) =>
    id === "kind" || id === "description" || (id === "style" && isIcon) || (id === "csstype" && isCss) || ((id === "format" || id === "count") && isData);
  const label = isIcon ? "Describe el icono o logo" : isCss ? "Describe la animación o el fondo" : "Esquema de los datos (campos y reglas)";
  const placeholder = isIcon
    ? "Ej.: un cohete pequeño con una estrella…"
    : isCss
      ? "Ej.: un loader de tres puntos que rebotan, en tonos morados…"
      : "Ej.: usuarios con nombre, email, edad (18-65) y ciudad…";
  const fields = t.fields
    .filter((/** @type {any} */ f) => visible(f.id))
    .map((/** @type {any} */ f) => (f.id === "description" ? field(s, t, { ...f, label, placeholder }) : field(s, t, f)))
    .join("");
  const disabled = busy || !!s.busy || !s.ai.ready;
  const hw = s.hardware
    ? `<div class="notice ${s.hardware.tier === 0 ? "warn" : "info"}" role="status">${icon(s.hardware.tier === 0 ? "warning" : "info")}<p>${esc(s.hardware.text)}</p></div>`
    : "";
  // Un resultado solo se muestra con el tipo que lo produjo (si cambias de tipo, no se mezclan).
  const r = s.results[t.id]?.kind === kind || !s.results[t.id]?.kind ? s.results[t.id] : undefined;
  let out = "";
  if (r && isIcon && (r.svgUri || r.svgProblem)) {
    out = `<div class="result">${
      r.svgUri
        ? `<div class="svg-preview"><img src="${esc(r.svgUri)}" alt="Vista previa del icono" width="128" height="128"></div>
      <div class="row-btns">
        <button class="btn ghost" data-action="workshopSave" data-id="${esc(t.id)}" title="Guarda el SVG en la carpeta assets/ del proyecto, sin pisar nada">${icon("filePlus")}Guardar en assets/…</button>
        <button class="btn ghost" data-action="workshopCopy" data-id="${esc(t.id)}">${icon("copy")}Copiar</button>
        <button class="btn ghost" data-action="workshopPet" data-id="${esc(t.id)}" title="Guarda una copia en .magictools/pet-icon.svg y la usa como cara de tu animalito">${icon("paw")}Usar como cara de mi animalito</button>
        <button class="btn ghost" data-action="clearResult" data-id="${esc(t.id)}">${icon("close")}Cerrar</button>
      </div>`
        : `<div class="notice warn" role="status">${icon("warning")}<p>${esc(SVG_PROBLEMS[r.svgProblem] ?? SVG_PROBLEMS.invalid)}</p></div>
      <div class="row-btns"><button class="btn ghost" data-action="clearResult" data-id="${esc(t.id)}">${icon("close")}Cerrar</button></div>`
    }</div>`;
  } else if (r) out = result(s, t, r);
  return `<div class="workshop">
    ${hw}
    ${fields}
    <button class="btn wide" data-action="runTool" data-id="${esc(t.id)}"${disabled ? " disabled" : ""}>${busy ? "Creando…" : esc(t.action)}</button>
    ${!s.ai.ready ? `<p class="muted">La IA no está lista: revisa el aviso de arriba.</p>` : ""}
    ${out}
  </div>`;
}

function michi(s, busy, hasResult) {
  const say = busy ? "Mmm… déjame olfatear tu código…" : hasResult ? "¡Miau! Aquí tienes mi explicación 🐾" : "Pégame unas líneas de código y te las cuento a mi manera 🐾";
  return `<div class="michi"><div class="pet-stage small">${animalSvg("gato", busy ? "think" : "idle")}</div><p class="bubble-text" role="status">${esc(say)}</p></div>`;
}

function tool(s, t) {
  const open = saved.open === t.id;
  const busy = s.busy === t.id;
  if (t.command) {
    return `<div class="tool"><button class="tile" data-tip="${esc(t.id)}" data-action="runCommand" data-id="${esc(t.id)}">
      <span class="tile-icon">${icon(t.icon ?? "wand")}</span>
      <span class="grow"><strong>${esc(t.title)}</strong><small>${esc(t.description)}</small></span></button></div>`;
  }
  const head = `<button class="tile" data-tip="${esc(t.id)}" data-action="toggleTool" data-id="${esc(t.id)}" aria-expanded="${open}">
      <span class="tile-icon">${icon(t.icon ?? "wand")}</span>
      <span class="grow"><strong>${esc(t.title)}${t.ai ? ' <span class="chip">IA</span>' : ""}</strong><small>${esc(t.description)}</small></span>
    </button>`;
  if (!open) return `<div class="tool">${head}</div>`;
  if (t.widget) {
    const body = t.widget === "pet" ? petWidget(s) : t.widget === "structure" ? structureWidget(s) : t.widget === "workshop" ? workshopWidget(s, t, busy) : colorsWidget(s);
    return `<div class="tool open">${head}<div class="tool-form">${body}</div></div>`;
  }
  const disabled = busy || !!s.busy || (t.ai && !s.ai.ready);
  return `<div class="tool open">${head}
    <div class="tool-form">
      ${t.mascot === "michi" ? michi(s, busy, !!s.results[t.id]) : ""}
      ${t.fields.map((/** @type {any} */ f) => field(s, t, f)).join("")}
      <button class="btn wide" data-action="runTool" data-id="${esc(t.id)}"${disabled ? " disabled" : ""}>${busy ? "Pensando…" : esc(t.action)}</button>
      ${t.ai && !s.ai.ready ? `<p class="muted">La IA no está lista: revisa el aviso de arriba.</p>` : ""}
      ${result(s, t)}
    </div>
  </div>`;
}

function panel(s) {
  const id = current();
  const tab = s.tabs.find((/** @type {any} */ t) => t.id === id);
  const tools = s.tools[id];
  // Las herramientas se agrupan por tipo (con IA, utilidades, motivación).
  const groups = s.types
    .map((/** @type {any} */ ty) => ({ ty, list: tools.filter((/** @type {any} */ t) => t.type === ty.id) }))
    .filter((/** @type {any} */ g) => g.list.length);
  const body = tools.length
    ? groups
        .map(
          (/** @type {any} */ g) => `<div class="group"><p class="group-label" title="${esc(g.ty.hint)}">${esc(g.ty.label)} <span class="group-count">${g.list.length}</span></p>
        <div class="tiles">${g.list.map((/** @type {any} */ t) => tool(s, t)).join("")}</div></div>`,
        )
        .join("")
    : `<div class="empty">${icon("wand")}<strong>Aún no hay herramientas en ${esc(tab.label)}</strong><span>Se irán añadiendo aquí.</span></div>`;
  return `<section class="block" data-hue="${id}">
    <header class="block-head">
      <span class="block-icon">${icon(TAB_ICON[id])}</span>
      <span class="grow"><h2>${esc(tab.label)}</h2><p>${esc(tab.subtitle)}</p></span>
    </header>
    <div class="body">${body}</div>
  </section>`;
}

function footer(s) {
  return `<footer class="credits">
    ${icon("wand")}<span>MagicTools${s.version ? ` v${esc(s.version)}` : ""} · Creado por
    <a href="#" data-action="openUrl" data-url="https://github.com/GMR027" title="https://github.com/GMR027">GMR027</a></span>
  </footer>`;
}

// --- Tooltip con la explicación de cada herramienta (propio: los de «title» son lentos y no se pueden dar formato) ---
const tip = document.createElement("div");
tip.id = "mt-tip";
tip.setAttribute("role", "tooltip");
document.body.appendChild(tip);
/** @type {ReturnType<typeof setTimeout> | undefined} */
let tipTimer;
/** @type {HTMLElement | null} */
let tipFor = null;

function hideTip() {
  clearTimeout(tipTimer);
  tip.classList.remove("show");
  tipFor?.removeAttribute("aria-describedby");
  tipFor = null;
}

/** @param {HTMLElement} el */
function showTip(el) {
  const id = el.dataset.tip;
  const t = Object.values(state?.tools ?? {})
    .flat()
    .find((/** @type {any} */ x) => x.id === id);
  const h = /** @type {any} */ (t)?.help;
  if (!h) return;
  tip.innerHTML = `<strong>${esc(/** @type {any} */ (t).title)}</strong>
    <p>${esc(h.what)}</p>
    <p class="tip-h">Cómo se usa</p><p>${esc(h.how)}</p>
    <p class="tip-h">Ejemplo</p><p class="tip-ex">${esc(h.example)}</p>`;
  tipFor = el;
  el.setAttribute("aria-describedby", "mt-tip");
  const r = el.getBoundingClientRect();
  tip.style.maxWidth = `${Math.max(180, window.innerWidth - 16)}px`;
  tip.classList.add("show");
  const h2 = tip.offsetHeight;
  // Debajo de la herramienta; si no cabe, encima.
  const below = r.bottom + 4 + h2 <= window.innerHeight - 4;
  tip.style.top = `${Math.max(4, below ? r.bottom + 4 : r.top - h2 - 4)}px`;
  tip.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8))}px`;
}

app.addEventListener("mouseover", (e) => {
  const el = /** @type {HTMLElement} */ (e.target).closest("[data-tip]");
  if (el === tipFor) return;
  hideTip();
  if (el) tipTimer = setTimeout(() => showTip(/** @type {HTMLElement} */ (el)), 350);
});
app.addEventListener("mouseleave", hideTip);
app.addEventListener("focusin", (e) => {
  const el = /** @type {HTMLElement} */ (e.target).closest?.("[data-tip]");
  if (el && el.matches(":focus-visible")) (hideTip(), showTip(/** @type {HTMLElement} */ (el)));
});
app.addEventListener("focusout", hideTip);
app.addEventListener("click", hideTip, true);
window.addEventListener("scroll", hideTip, true);
document.addEventListener("keydown", (e) => e.key === "Escape" && hideTip());

function render() {
  hideTip();
  const s = state;
  const focused = /** @type {HTMLInputElement | null} */ (document.activeElement);
  const focus = focused?.id ? { id: focused.id, start: focused.selectionStart, end: focused.selectionEnd } : undefined;
  app.innerHTML = header(s) + tabs(s) + `<main class="tab-panel" role="tabpanel">${panel(s)}</main>` + footer(s);
  app.querySelector(".logo-slot")?.replaceWith(logo);
  if (focus) {
    const el = /** @type {HTMLInputElement | null} */ (document.getElementById(focus.id));
    if (el) {
      el.focus();
      if (focus.start !== null) el.setSelectionRange(focus.start, focus.end ?? focus.start);
    }
  }
}
