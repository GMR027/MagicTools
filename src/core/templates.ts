/** Estructuras de proyecto listas para crear. Son datos puros: no usan red ni instalan nada. */
export type TemplateGroup = "Sitios web" | "JavaScript" | "PHP" | "Python" | "Otros lenguajes";

export const TEMPLATE_GROUPS: readonly TemplateGroup[] = ["Sitios web", "JavaScript", "PHP", "Python", "Otros lenguajes"];

export interface Template {
  id: string;
  label: string;
  group: TemplateGroup;
  /** Una línea para el selector. */
  hint: string;
  /** Pasos para arrancarlo (van al README). */
  howto: string[];
  /** Ruta relativa → contenido. `{{name}}` se sustituye por el nombre del proyecto (también en las rutas). */
  files: Record<string, string>;
  gitignore: string[];
}

const t = (s: string): string => s.replace(/^\n/, "");
const json = (o: unknown): string => JSON.stringify(o, null, 2) + "\n";
const KEEP = "";

// --- Piezas comunes ---------------------------------------------------------------------------

const html = (css: string, js?: string): string =>
  t(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{name}}</title>
  <link rel="stylesheet" href="${css}">
</head>
<body>
  <main>
    <h1>{{name}}</h1>
    <p>Tu proyecto está listo. Edita este archivo y recarga la página.</p>
  </main>
${js ? `  <script src="${js}"></script>\n` : ""}</body>
</html>
`);

const BASE_CSS = t(`
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}

main {
  max-width: 60rem;
  margin: 0 auto;
  padding: 2rem 1rem;
}
`);

const MAIN_JS = t(`
// Aquí va tu JavaScript.
console.log("{{name}} listo");
`);

const NODE_IGNORE = ["node_modules/", "dist/", ".env", ".DS_Store"];
const PY_IGNORE = ["__pycache__/", "*.pyc", ".venv/", ".env", ".pytest_cache/"];

/** Proyecto de Vite: lo común a React, Vue y Svelte. */
const vitePackage = (deps: Record<string, string>, dev: Record<string, string>, build = "vite build"): string =>
  json({
    name: "{{name}}",
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: { dev: "vite", build, preview: "vite preview" },
    dependencies: deps,
    devDependencies: dev,
  });

const viteHtml = (entry: string): string =>
  t(`
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{name}}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="${entry}"></script>
  </body>
</html>
`);

// --- Plantillas ---------------------------------------------------------------------------------

export const TEMPLATES: readonly Template[] = [
  // ===== Sitios web =====
  {
    id: "html-css",
    label: "HTML + CSS",
    group: "Sitios web",
    hint: "Una página con su hoja de estilos",
    howto: ["Abre `index.html` en el navegador (o usa la extensión Live Server)."],
    gitignore: [".DS_Store"],
    files: {
      "index.html": html("src/css/style.css"),
      "src/css/style.css": BASE_CSS,
      "assets/img/.gitkeep": KEEP,
    },
  },
  {
    id: "html-css-js",
    label: "HTML + CSS + JS",
    group: "Sitios web",
    hint: "Una página con estilos y JavaScript",
    howto: ["Abre `index.html` en el navegador (o usa la extensión Live Server)."],
    gitignore: [".DS_Store"],
    files: {
      "index.html": html("src/css/style.css", "src/js/main.js"),
      "src/css/style.css": BASE_CSS,
      "src/js/main.js": MAIN_JS,
      "assets/img/.gitkeep": KEEP,
    },
  },
  {
    id: "html-sass",
    label: "HTML + Sass",
    group: "Sitios web",
    hint: "Estilos en Sass que se compilan a CSS",
    howto: ["`npm install`", "`npm run sass` (compila y se queda vigilando los cambios)", "Abre `index.html` en el navegador."],
    gitignore: NODE_IGNORE,
    files: {
      "index.html": html("src/css/style.css"),
      "package.json": json({ name: "{{name}}", private: true, version: "0.1.0", scripts: { sass: "sass --watch src/sass/main.scss src/css/style.css" }, devDependencies: { sass: "^1.80.0" } }),
      "src/sass/main.scss": t(`
@use "variables" as *;
@use "base";
`),
      "src/sass/_variables.scss": t(`
$color-primary: #3b5bdb;
$color-text: #212529;
$space: 1rem;
`),
      "src/sass/_base.scss": t(`
@use "variables" as *;

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  color: $color-text;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}

main {
  max-width: 60rem;
  margin: 0 auto;
  padding: $space * 2 $space;
}

h1 {
  color: $color-primary;
}
`),
      "src/css/style.css": "/* Este archivo lo genera Sass: edita los de src/sass. */\n",
      "assets/img/.gitkeep": KEEP,
    },
  },
  {
    id: "html-sass-js",
    label: "HTML + Sass + JS",
    group: "Sitios web",
    hint: "Sass compilado a CSS, más JavaScript",
    howto: ["`npm install`", "`npm run sass` (compila y se queda vigilando los cambios)", "Abre `index.html` en el navegador."],
    gitignore: NODE_IGNORE,
    files: {
      "index.html": html("src/css/style.css", "src/js/main.js"),
      "package.json": json({ name: "{{name}}", private: true, version: "0.1.0", scripts: { sass: "sass --watch src/sass/main.scss src/css/style.css" }, devDependencies: { sass: "^1.80.0" } }),
      "src/sass/main.scss": t(`
@use "variables" as *;
@use "base";
`),
      "src/sass/_variables.scss": t(`
$color-primary: #3b5bdb;
$color-text: #212529;
$space: 1rem;
`),
      "src/sass/_base.scss": t(`
@use "variables" as *;

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  color: $color-text;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}

main {
  max-width: 60rem;
  margin: 0 auto;
  padding: $space * 2 $space;
}

h1 {
  color: $color-primary;
}
`),
      "src/css/style.css": "/* Este archivo lo genera Sass: edita los de src/sass. */\n",
      "src/js/main.js": MAIN_JS,
      "assets/img/.gitkeep": KEEP,
    },
  },
  {
    id: "html-bootstrap",
    label: "HTML + Bootstrap",
    group: "Sitios web",
    hint: "Bootstrap 5 desde CDN, sin instalar nada",
    howto: ["Abre `index.html` en el navegador (necesita internet para cargar Bootstrap)."],
    gitignore: [".DS_Store"],
    files: {
      "index.html": t(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{name}}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="src/css/style.css">
</head>
<body>
  <main class="container py-5">
    <h1 class="display-5">{{name}}</h1>
    <p class="lead">Tu proyecto con Bootstrap está listo.</p>
    <button class="btn btn-primary" id="saludar">Pulsa aquí</button>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script src="src/js/main.js"></script>
</body>
</html>
`),
      "src/css/style.css": "/* Tus estilos propios, encima de Bootstrap. */\n",
      "src/js/main.js": t(`
document.getElementById("saludar").addEventListener("click", () => alert("¡Hola!"));
`),
      "assets/img/.gitkeep": KEEP,
    },
  },
  {
    id: "html-tailwind",
    label: "HTML + Tailwind CSS",
    group: "Sitios web",
    hint: "Tailwind con su compilador (CLI)",
    howto: ["`npm install`", "`npm run dev` (genera `dist/output.css` y vigila los cambios)", "Abre `index.html` en el navegador."],
    gitignore: NODE_IGNORE,
    files: {
      "index.html": t(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{name}}</title>
  <link href="dist/output.css" rel="stylesheet">
</head>
<body class="bg-slate-50 text-slate-900">
  <main class="mx-auto max-w-3xl px-4 py-12">
    <h1 class="text-4xl font-bold text-indigo-600">{{name}}</h1>
    <p class="mt-4">Tu proyecto con Tailwind CSS está listo.</p>
  </main>
</body>
</html>
`),
      "package.json": json({
        name: "{{name}}",
        private: true,
        version: "0.1.0",
        scripts: { dev: "tailwindcss -i ./src/input.css -o ./dist/output.css --watch", build: "tailwindcss -i ./src/input.css -o ./dist/output.css --minify" },
        devDependencies: { "@tailwindcss/cli": "^4.0.0", tailwindcss: "^4.0.0" },
      }),
      "src/input.css": '@import "tailwindcss";\n',
      "assets/img/.gitkeep": KEEP,
    },
  },

  // ===== JavaScript =====
  {
    id: "react",
    label: "React (Vite)",
    group: "JavaScript",
    hint: "React con Vite, en JavaScript",
    howto: ["`npm install`", "`npm run dev` y abre la dirección que te indique."],
    gitignore: NODE_IGNORE,
    files: {
      "package.json": vitePackage({ react: "^18.3.1", "react-dom": "^18.3.1" }, { "@vitejs/plugin-react": "^4.3.1", vite: "^5.4.0" }),
      "vite.config.js": t(`
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`),
      "index.html": viteHtml("/src/main.jsx").replace('id="app"', 'id="root"'),
      "src/main.jsx": t(`
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`),
      "src/App.jsx": t(`
import Counter from "./components/Counter.jsx";

export default function App() {
  return (
    <main>
      <h1>{{name}}</h1>
      <Counter />
    </main>
  );
}
`),
      "src/components/Counter.jsx": t(`
import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Pulsaste {count} veces</button>;
}
`),
      "src/index.css": BASE_CSS,
      "src/assets/.gitkeep": KEEP,
      "public/.gitkeep": KEEP,
    },
  },
  {
    id: "react-ts",
    label: "React + TypeScript (Vite)",
    group: "JavaScript",
    hint: "React con Vite, en TypeScript",
    howto: ["`npm install`", "`npm run dev` y abre la dirección que te indique."],
    gitignore: NODE_IGNORE,
    files: {
      "package.json": vitePackage(
        { react: "^18.3.1", "react-dom": "^18.3.1" },
        { "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0", "@vitejs/plugin-react": "^4.3.1", typescript: "^5.5.0", vite: "^5.4.0" },
        "tsc --noEmit && vite build",
      ),
      "vite.config.ts": t(`
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`),
      "tsconfig.json": json({
        compilerOptions: { target: "ES2020", lib: ["ES2020", "DOM", "DOM.Iterable"], module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx", strict: true, noEmit: true, skipLibCheck: true, isolatedModules: true },
        include: ["src", "vite.config.ts"],
      }),
      "index.html": viteHtml("/src/main.tsx").replace('id="app"', 'id="root"'),
      "src/main.tsx": t(`
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`),
      "src/App.tsx": t(`
import Counter from "./components/Counter";

export default function App() {
  return (
    <main>
      <h1>{{name}}</h1>
      <Counter />
    </main>
  );
}
`),
      "src/components/Counter.tsx": t(`
import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState<number>(0);
  return <button onClick={() => setCount(count + 1)}>Pulsaste {count} veces</button>;
}
`),
      "src/index.css": BASE_CSS,
      "src/vite-env.d.ts": '/// <reference types="vite/client" />\n',
      "public/.gitkeep": KEEP,
    },
  },
  {
    id: "vue",
    label: "Vue (Vite)",
    group: "JavaScript",
    hint: "Vue 3 con Vite",
    howto: ["`npm install`", "`npm run dev` y abre la dirección que te indique."],
    gitignore: NODE_IGNORE,
    files: {
      "package.json": vitePackage({ vue: "^3.5.0" }, { "@vitejs/plugin-vue": "^5.1.0", vite: "^5.4.0" }),
      "vite.config.js": t(`
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({ plugins: [vue()] });
`),
      "index.html": viteHtml("/src/main.js"),
      "src/main.js": t(`
import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

createApp(App).mount("#app");
`),
      "src/App.vue": t(`
<script setup>
import Counter from "./components/Counter.vue";
</script>

<template>
  <main>
    <h1>{{name}}</h1>
    <Counter />
  </main>
</template>
`),
      "src/components/Counter.vue": t(`
<script setup>
import { ref } from "vue";
const count = ref(0);
</script>

<template>
  <button @click="count++">Pulsaste {{ count }} veces</button>
</template>
`),
      "src/style.css": BASE_CSS,
      "src/assets/.gitkeep": KEEP,
      "public/.gitkeep": KEEP,
    },
  },
  {
    id: "svelte",
    label: "Svelte (Vite)",
    group: "JavaScript",
    hint: "Svelte 5 con Vite",
    howto: ["`npm install`", "`npm run dev` y abre la dirección que te indique."],
    gitignore: NODE_IGNORE,
    files: {
      "package.json": vitePackage({ svelte: "^5.0.0" }, { "@sveltejs/vite-plugin-svelte": "^4.0.0", vite: "^5.4.0" }),
      "vite.config.js": t(`
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({ plugins: [svelte()] });
`),
      "svelte.config.js": t(`
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default { preprocess: vitePreprocess() };
`),
      "index.html": viteHtml("/src/main.js"),
      "src/main.js": t(`
import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

mount(App, { target: document.getElementById("app") });
`),
      "src/App.svelte": t(`
<script>
  import Counter from "./lib/Counter.svelte";
</script>

<main>
  <h1>{{name}}</h1>
  <Counter />
</main>
`),
      "src/lib/Counter.svelte": t(`
<script>
  let count = $state(0);
</script>

<button onclick={() => count++}>Pulsaste {count} veces</button>
`),
      "src/app.css": BASE_CSS,
      "public/.gitkeep": KEEP,
    },
  },
  {
    id: "next",
    label: "Next.js (App Router)",
    group: "JavaScript",
    hint: "React con rutas y servidor incluido",
    howto: ["`npm install`", "`npm run dev` y abre http://localhost:3000"],
    gitignore: [...NODE_IGNORE, ".next/"],
    files: {
      "package.json": json({ name: "{{name}}", private: true, version: "0.1.0", scripts: { dev: "next dev", build: "next build", start: "next start" }, dependencies: { next: "^15.0.0", react: "^19.0.0", "react-dom": "^19.0.0" } }),
      "next.config.mjs": t(`
/** @type {import("next").NextConfig} */
const nextConfig = {};

export default nextConfig;
`),
      "app/layout.js": t(`
import "./globals.css";

export const metadata = { title: "{{name}}" };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
`),
      "app/page.js": t(`
export default function Home() {
  return (
    <main>
      <h1>{{name}}</h1>
      <p>Edita app/page.js y guarda para ver los cambios.</p>
    </main>
  );
}
`),
      "app/globals.css": BASE_CSS,
      "components/.gitkeep": KEEP,
      "public/.gitkeep": KEEP,
    },
  },
  {
    id: "express",
    label: "Node.js + Express (API)",
    group: "JavaScript",
    hint: "Servidor web / API REST con Express",
    howto: ["`npm install`", "`npm run dev` y abre http://localhost:3000"],
    gitignore: NODE_IGNORE,
    files: {
      "package.json": json({ name: "{{name}}", private: true, version: "0.1.0", type: "module", scripts: { start: "node src/index.js", dev: "node --watch src/index.js" }, dependencies: { express: "^4.21.0" } }),
      "src/index.js": t(`
import express from "express";
import routes from "./routes/index.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use("/", routes);

app.listen(port, () => {
  console.log("Servidor en http://localhost:" + port);
});
`),
      "src/routes/index.js": t(`
import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.json({ mensaje: "{{name}} funcionando" });
});

export default router;
`),
      "src/controllers/.gitkeep": KEEP,
      "src/models/.gitkeep": KEEP,
      ".env.example": "PORT=3000\n",
    },
  },

  // ===== PHP =====
  {
    id: "php",
    label: "PHP (básico)",
    group: "PHP",
    hint: "Páginas PHP con cabecera y pie compartidos",
    howto: ["`php -S localhost:8000 -t public`", "Abre http://localhost:8000"],
    gitignore: [".env", ".DS_Store"],
    files: {
      "public/index.php": t(`
<?php
require __DIR__ . '/../config/config.php';
require __DIR__ . '/../includes/header.php';
?>
<main>
  <h1><?= htmlspecialchars(APP_NAME) ?></h1>
  <p>Tu proyecto PHP está listo.</p>
</main>
<?php require __DIR__ . '/../includes/footer.php'; ?>
`),
      "includes/header.php": t(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= htmlspecialchars(APP_NAME) ?></title>
  <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
`),
      "includes/footer.php": t(`
  <script src="/assets/js/main.js"></script>
</body>
</html>
`),
      "config/config.php": t(`
<?php
const APP_NAME = '{{name}}';
`),
      "public/assets/css/style.css": BASE_CSS,
      "public/assets/js/main.js": MAIN_JS,
      "public/assets/img/.gitkeep": KEEP,
    },
  },
  {
    id: "php-mvc",
    label: "PHP (MVC con Composer)",
    group: "PHP",
    hint: "Controladores, vistas y autoload PSR-4",
    howto: ["`composer install`", "`php -S localhost:8000 -t public`", "Abre http://localhost:8000"],
    gitignore: ["vendor/", ".env", ".DS_Store"],
    files: {
      "composer.json": json({ name: "app/{{name}}", description: "{{name}}", type: "project", require: { php: ">=8.1" }, autoload: { "psr-4": { "App\\": "src/" } } }),
      "public/index.php": t(`
<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\\Controllers\\HomeController;

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($path === '/') {
    (new HomeController())->index();
} else {
    http_response_code(404);
    echo 'Página no encontrada';
}
`),
      "src/Controllers/HomeController.php": t(`
<?php
declare(strict_types=1);

namespace App\\Controllers;

class HomeController
{
    public function index(): void
    {
        $title = '{{name}}';
        require __DIR__ . '/../../views/home.php';
    }
}
`),
      "src/Models/.gitkeep": KEEP,
      "views/home.php": t(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= htmlspecialchars($title) ?></title>
  <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
  <main>
    <h1><?= htmlspecialchars($title) ?></h1>
    <p>Tu proyecto PHP con MVC está listo.</p>
  </main>
</body>
</html>
`),
      "config/config.php": "<?php\n\nreturn [\n    'app_name' => '{{name}}',\n];\n",
      "public/assets/css/style.css": BASE_CSS,
      "public/assets/js/main.js": MAIN_JS,
      ".env.example": "APP_ENV=local\n",
    },
  },

  // ===== Python =====
  {
    id: "python",
    label: "Python (script con tests)",
    group: "Python",
    hint: "Un programa con módulos y pruebas (pytest)",
    howto: ["`python -m venv .venv` y actívalo", "`pip install -r requirements.txt`", "`python main.py`", "`pytest` para ejecutar las pruebas"],
    gitignore: PY_IGNORE,
    files: {
      "main.py": t(`
from src.utils import saludar


def main():
    print(saludar("{{name}}"))


if __name__ == "__main__":
    main()
`),
      "src/__init__.py": KEEP,
      "src/utils.py": t(`
def saludar(nombre):
    return "Hola, " + nombre + "!"
`),
      "tests/test_utils.py": t(`
from src.utils import saludar


def test_saludar():
    assert saludar("Ana") == "Hola, Ana!"
`),
      "conftest.py": KEEP,
      "requirements.txt": "pytest\n",
    },
  },
  {
    id: "flask",
    label: "Python + Flask",
    group: "Python",
    hint: "Web con plantillas HTML y archivos estáticos",
    howto: ["`python -m venv .venv` y actívalo", "`pip install -r requirements.txt`", "`flask --app run run --debug` y abre http://localhost:5000"],
    gitignore: PY_IGNORE,
    files: {
      "run.py": t(`
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
`),
      "app/__init__.py": t(`
from flask import Flask


def create_app():
    app = Flask(__name__)

    from .routes import bp

    app.register_blueprint(bp)
    return app
`),
      "app/routes.py": t(`
from flask import Blueprint, render_template

bp = Blueprint("main", __name__)


@bp.route("/")
def index():
    return render_template("index.html", titulo="{{name}}")
`),
      "app/templates/index.html": t(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ titulo }}</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='css/style.css') }}">
</head>
<body>
  <main>
    <h1>{{ titulo }}</h1>
    <p>Tu proyecto Flask está listo.</p>
  </main>
</body>
</html>
`),
      "app/static/css/style.css": BASE_CSS,
      "app/static/js/main.js": MAIN_JS,
      "tests/test_app.py": t(`
from app import create_app


def test_index():
    client = create_app().test_client()
    assert client.get("/").status_code == 200
`),
      "conftest.py": KEEP,
      "requirements.txt": "flask\npytest\n",
      ".env.example": "FLASK_DEBUG=1\n",
    },
  },
  {
    id: "fastapi",
    label: "Python + FastAPI (API)",
    group: "Python",
    hint: "API REST con documentación automática",
    howto: ["`python -m venv .venv` y actívalo", "`pip install -r requirements.txt`", "`uvicorn app.main:app --reload`", "Abre http://localhost:8000/docs"],
    gitignore: PY_IGNORE,
    files: {
      "app/__init__.py": KEEP,
      "app/main.py": t(`
from fastapi import FastAPI

from .routers import hello

app = FastAPI(title="{{name}}")
app.include_router(hello.router)
`),
      "app/routers/__init__.py": KEEP,
      "app/routers/hello.py": t(`
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def raiz():
    return {"mensaje": "{{name}} funcionando"}
`),
      "tests/test_main.py": t(`
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_raiz():
    assert client.get("/").status_code == 200
`),
      "conftest.py": KEEP,
      "requirements.txt": "fastapi\nuvicorn[standard]\npytest\nhttpx\n",
      ".env.example": "# Variables de entorno\n",
    },
  },

  // ===== Otros lenguajes =====
  {
    id: "java",
    label: "Java (Maven)",
    group: "Otros lenguajes",
    hint: "Proyecto Maven con JUnit 5",
    howto: ["`mvn test` para probarlo", "`mvn package` para generar el .jar"],
    gitignore: ["target/", ".idea/", "*.class"],
    files: {
      "pom.xml": t(`
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>com.example</groupId>
  <artifactId>{{name}}</artifactId>
  <version>0.1.0</version>
  <packaging>jar</packaging>

  <properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.10.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.2.5</version>
      </plugin>
    </plugins>
  </build>
</project>
`),
      "src/main/java/com/example/App.java": t(`
package com.example;

public class App {
    public static String saludar(String nombre) {
        return "Hola, " + nombre + "!";
    }

    public static void main(String[] args) {
        System.out.println(saludar("{{name}}"));
    }
}
`),
      "src/test/java/com/example/AppTest.java": t(`
package com.example;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AppTest {
    @Test
    void saludaPorSuNombre() {
        assertEquals("Hola, Ana!", App.saludar("Ana"));
    }
}
`),
    },
  },
  {
    id: "c",
    label: "C (con Makefile)",
    group: "Otros lenguajes",
    hint: "Programa en C que se compila con make",
    howto: ["`make` para compilar", "`./build/{{name}}` para ejecutarlo", "`make clean` para limpiar"],
    gitignore: ["build/"],
    files: {
      "src/main.c": t(`
#include <stdio.h>

int main(void)
{
    printf("Hola desde {{name}}\\n");
    return 0;
}
`),
      Makefile: "CC = gcc\nCFLAGS = -Wall -Wextra -std=c11\nTARGET = build/{{name}}\n\nall: $(TARGET)\n\n$(TARGET): src/main.c\n\tmkdir -p build\n\t$(CC) $(CFLAGS) -o $@ $^\n\nclean:\n\trm -rf build\n\n.PHONY: all clean\n",
      "include/.gitkeep": KEEP,
    },
  },
  {
    id: "cpp",
    label: "C++ (CMake)",
    group: "Otros lenguajes",
    hint: "Programa en C++17 con CMake",
    howto: ["`cmake -B build`", "`cmake --build build`", "`./build/{{name}}` para ejecutarlo"],
    gitignore: ["build/"],
    files: {
      "CMakeLists.txt": "cmake_minimum_required(VERSION 3.16)\nproject({{name}} LANGUAGES CXX)\n\nset(CMAKE_CXX_STANDARD 17)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\n\nadd_executable({{name}} src/main.cpp)\n",
      "src/main.cpp": t(`
#include <iostream>

int main()
{
    std::cout << "Hola desde {{name}}" << std::endl;
    return 0;
}
`),
      "include/.gitkeep": KEEP,
    },
  },
  {
    id: "csharp",
    label: "C# (.NET consola)",
    group: "Otros lenguajes",
    hint: "Aplicación de consola con .NET 8",
    howto: ["`dotnet run`", "`dotnet build` para compilar"],
    gitignore: ["bin/", "obj/"],
    files: {
      "{{name}}.csproj": t(`
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

</Project>
`),
      "Program.cs": t(`
Console.WriteLine("Hola desde {{name}}");
`),
    },
  },
  {
    id: "go",
    label: "Go (módulo)",
    group: "Otros lenguajes",
    hint: "Módulo de Go con un paquete y su test",
    howto: ["`go run .`", "`go test ./...` para las pruebas"],
    gitignore: ["bin/", "*.exe"],
    files: {
      "go.mod": "module {{name}}\n\ngo 1.22\n",
      "main.go": t(`
package main

import (
	"fmt"

	"{{name}}/greet"
)

func main() {
	fmt.Println(greet.Saludar("{{name}}"))
}
`),
      "greet/greet.go": t(`
package greet

func Saludar(nombre string) string {
	return "Hola, " + nombre + "!"
}
`),
      "greet/greet_test.go": t(`
package greet

import "testing"

func TestSaludar(t *testing.T) {
	if got := Saludar("Ana"); got != "Hola, Ana!" {
		t.Errorf("se esperaba «Hola, Ana!» y salió %q", got)
	}
}
`),
    },
  },
  {
    id: "rust",
    label: "Rust (Cargo)",
    group: "Otros lenguajes",
    hint: "Proyecto de Cargo con una función y su test",
    howto: ["`cargo run`", "`cargo test` para las pruebas"],
    gitignore: ["target/"],
    files: {
      "Cargo.toml": '[package]\nname = "{{name}}"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n',
      "src/main.rs": t(`
fn saludar(nombre: &str) -> String {
    format!("Hola, {}!", nombre)
}

fn main() {
    println!("{}", saludar("{{name}}"));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saluda_por_su_nombre() {
        assert_eq!(saludar("Ana"), "Hola, Ana!");
    }
}
`),
    },
  },
];

// --- Generación ---------------------------------------------------------------------------------

/** Nombre de proyecto válido para carpetas, paquetes y módulos: minúsculas, números y guiones. */
export function slugify(raw: string): string {
  const s = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "mi-proyecto";
}

export const findTemplate = (id: string): Template | undefined => TEMPLATES.find((x) => x.id === id);

export interface PlannedFile {
  path: string;
  content: string;
}

const fill = (s: string, name: string): string => s.replaceAll("{{name}}", name);

/** Archivos que se crearán, con el nombre ya puesto. Siempre incluye README.md y .gitignore. */
export function planFiles(tpl: Template, rawName: string): PlannedFile[] {
  const name = slugify(rawName);
  const files: PlannedFile[] = Object.entries(tpl.files).map(([p, c]) => ({ path: fill(p, name), content: fill(c, name) }));
  files.push({ path: ".gitignore", content: tpl.gitignore.join("\n") + "\n" });
  const steps = tpl.howto.map((h, i) => `${i + 1}. ${fill(h, name)}`).join("\n");
  files.push({ path: "README.md", content: `# ${name}\n\nProyecto creado con MagicTools: ${tpl.label}.\n\n## Cómo empezar\n\n${steps}\n` });
  return files;
}

/** Solo las rutas (para la vista previa del panel), con un nombre de ejemplo. */
export const previewPaths = (tpl: Template): string[] => planFiles(tpl, "mi-proyecto").map((f) => f.path).sort();

/** Una ruta segura: relativa, sin «..» ni letras de unidad. */
export const isSafePath = (p: string): boolean => !!p && !p.startsWith("/") && !/(^|\/)\.\.(\/|$)/.test(p) && !/^[A-Za-z]:/.test(p) && !p.includes("\\");
