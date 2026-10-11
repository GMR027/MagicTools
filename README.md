# MagicTools — herramientas para programar

Un panel en VS Code con tres pestañas según tu nivel: **Starter**, **Junior** y **Senior**.
Las herramientas con IA funcionan con un modelo **local** (Ollama) o con una **API** (Claude, Codestral o compatible con OpenAI).

## Instalación (VS Code y VSCodium)

El mismo `.vsix` funciona en **VS Code** y en **VSCodium** (y en Code - OSS). Cada editor guarda sus extensiones por separado, así que hay que instalarla en cada uno:

```bash
npm ci
npm run package:install     # empaqueta e instala en TODOS los editores que encuentre (code, codium…)
# o, si ya tienes dist-vsix/magictools-<versión>.vsix:
npm run install:editors                          # en todos
node scripts/install-editors.mjs --only codium   # solo en uno
node scripts/install-editors.mjs --uninstall     # quitarla de todos
# a mano: code --install-extension dist-vsix/magictools-*.vsix   /   codium --install-extension dist-vsix/magictools-*.vsix
```

Sin clonar el repositorio, descarga `releases/magictools-<versión>.vsix` e instálalo en cada editor con `code --install-extension` / `codium --install-extension` (o *Extensiones → ··· → Instalar desde VSIX…*). Para publicar una versión nueva: `npm run release` (genera el `.vsix` en `releases/` y quita los de versiones anteriores).

Después recarga el editor (*Developer: Reload Window*). Necesita que `code` y/o `codium` estén en el `PATH` (en VS Code: *Shell Command: Install 'code' command in PATH*).

## Starter

| Herramienta | Qué hace |
|---|---|
| **Traducir error** (IA) | Pegas un error (y, si quieres, el código) y te explica qué significa, por qué pasa, cómo arreglarlo y cómo evitarlo. |
| **Idea a código** (IA) | Cuentas qué quieres hacer y devuelve un plan, el código comentado paso a paso y qué aprender de él. |

| **Explicar el error del cursor** (IA) | Toma el error que marca el editor (línea del cursor o el primero del archivo) con 7 líneas de contexto a cada lado. También está en la bombilla de cada error: «MagicTools: explicar este error». |
| **Aprender con pistas** (IA) | No da la solución: 3 pistas cada vez más concretas y, cuando quieras, la solución. |
| **Explicación «como si tuviera 10 años»** | Selector en «Entender»: la misma explicación, técnica o muy sencilla. |
| **Comparar y aplicar** | En los resultados con código: muestra el diff nativo y aplica el código en la selección o en el cursor solo si aceptas. |

### Estructura de proyecto

Elige un tipo y se crean sus carpetas y archivos base (en la carpeta abierta o en una nueva), con una vista previa antes de crear. No usa IA, no instala nada y **nunca sobrescribe** archivos existentes; cada proyecto lleva `README.md` y `.gitignore`.

| Grupo | Tipos |
|---|---|
| Sitios web | HTML + CSS · HTML + CSS + JS · HTML + Sass · HTML + Sass + JS · HTML + Bootstrap · HTML + Tailwind CSS |
| JavaScript | React (Vite) · React + TypeScript · Vue · Svelte · Next.js · Node.js + Express |
| PHP | Básico · MVC con Composer |
| Python | Script con tests · Flask · FastAPI |
| Otros | Java (Maven) · C (Makefile) · C++ (CMake) · C# (.NET) · Go · Rust |

## Junior

| Herramienta | Qué hace |
|---|---|
| **Árbol viviente** (vista «Árbol viviente» del panel lateral) | Las funciones del archivo activo, coloreadas por complejidad (verde, amarillo, rojo). Clic = ir a la función; iconos para generar sus tests, ver su impacto, dividirla, revisarla o analizar su complejidad. |
| **Generar tests** (IA) | Tests con casos borde en el framework del proyecto (Jest, Vitest, Pytest, JUnit…). Los muestra, no escribe nada en el proyecto. |
| **Explicar cambios / PR** (IA) | Resumen, riesgos y checklist de tus cambios de Git (sin subir, staged, último commit o un diff del portapapeles), con descripción lista para el PR. Las referencias `archivo:línea` del resultado son enlaces que abren ese sitio. |
| **Dividir esta función** (IA) | Propone partir una función larga en otras más pequeñas, sin cambiar su comportamiento; compruebas el diff antes de aplicar. |
| **Limpiar archivo** | Quita `console.log`, `debugger` y `print()` sueltos del archivo activo, con diff para confirmar. Sin IA. |

## Qué hace GhostCode (y MagicTools no repite)

Si tienes GhostCode instalada, estas herramientas viven allí y se retiraron de MagicTools para no tener dos iguales: **Documentar función** (JSDoc, docstring, PHPDoc…), y **Explicar** una función, clase, SQL o regex (al pasar el puntero, **Anotar selección** o el **Asistente**). MagicTools comparte con GhostCode el Ollama y el modelo ya cargado.

## Senior

| Herramienta | Qué hace |
|---|---|
| **Simulador de impacto** (IA) | Quién usa la función (servidor del lenguaje o búsqueda por nombre), qué tests la mencionan, qué podría romperse y un plan de cambio seguro. |
| **Buscar secretos** | Claves y contraseñas en el código, sin IA ni red. Avisa como *warning* en Problemas al abrir o guardar (`magictools.secrets.scan`). La IA solo explica qué hacer y nunca recibe el valor del secreto. |
| **Revisión de código** (IA) | Un revisor estricto de PR ajeno sobre la función o selección: veredicto y hallazgos por severidad (bugs, casos borde, concurrencia, seguridad). |
| **Revisor de seguridad (OWASP)** (IA) | Inyección, XSS, path traversal, deserialización insegura… con categoría OWASP, cómo se explotaría y el arreglo. Distinto de «Buscar secretos». |
| **Complejidad Big-O** (IA) | Complejidad temporal y espacial, el cuello de botella exacto y una versión optimizada con diff para aplicar. |
| **Migrar código** (IA) | Pega código y di a qué migrarlo (TypeScript estricto, async/await, Python 3…); copiar, abrir o «Comparar y aplicar». |
| **Post-mortem de incidente** (IA) | Stack trace + logs + contexto → línea temporal, causa raíz probable y medidas preventivas. Solo usa lo que pegas. |
| **Mapa de dependencias** | Imports entre archivos de JS/TS/Python, **dependencias circulares** y diagrama Mermaid. Sin IA. |
| **Hotspots de Git** | Cruza el historial de 12 meses con la complejidad: archivos que cambian mucho y son complejos. Sin IA. |
| **Crear .env.example** | Crea o amplía `.env.example` con el nombre de una variable por cada secreto hallado (comentario con archivo y línea). Nunca escribe valores reales ni borra lo existente. |
| **Reglas de equipo** | `.magictools/rules.md`, versionado en el repo: se añade al prompt de **todas** las herramientas con IA (solo en carpetas de confianza, máx. 4000 caracteres). Un bloque ```` ```check ```` (p. ej. `js:no-var, py:no-print`) activa comprobaciones locales sin IA que marcan en Problemas: `js:no-var`, `js:no-console`, `js:no-eqeq`, `js:no-debugger`, `py:no-print`, `py:no-bare-except`, `any:no-todo`. |

## El Taller (en las tres pestañas)

Una herramienta por nivel para crear **artefactos de texto renderizable** con tu modelo de IA actual (Ollama o API; nada de servicios de pago ni dependencias nativas). Se activa o desactiva con `magictools.workshop.enabled`.

| Pestaña | Nombre | Qué ofrece |
|---|---|---|
| Starter | **Crea el logo de tu proyecto** | Icono/logo SVG (estilo Minimalista, Geométrico o Divertido), animación CSS y datos de prueba. |
| Junior | **Assets y datos para tu app** | Lo anterior + tipo de CSS (loader, fondo, patrón, animación) y formato de datos (JSON, CSV, SQL). |
| Senior | **Taller de artefactos** | Lo anterior + cantidad de registros (hasta 200). |

- **SVG seguro:** el icono (64×64, pocas formas, colores planos) se valida antes de mostrarse: se rechazan `<script>`, `on*=`, `foreignObject`, enlaces externos y DOCTYPE, y se enseña como imagen (`data:` URI en un `<img>`), nunca como HTML.
- **Botones:** *Guardar en assets/…* (con un nombre libre, nunca pisa un archivo), *Copiar* y *Usar como cara de mi animalito* (guarda `.magictools/pet-icon.svg`; el panel lo usa en lugar del dibujo de siempre y hay un botón para volver al original).
- **Aviso de hardware:** el panel detecta tu RAM y tu GPU (`nvidia-smi`, `rocm-smi` o `/sys/class/drm`, con tiempo límite) y te dice hasta qué tamaño de modelo llega tu equipo. Con menos de 8 GB sugiere el modo API, sin bloquear nada. Niveles: menos de 8 GB de RAM · 8–16 GB · 16 GB o más (o GPU de 6 GB+) · GPU de 12 GB+.
- Las reglas del equipo (`rules.md`) también se aplican aquí.

**Mis prompts guardados** (Starter) lee `.magictools/prompts.json`: `[{ "name": "…", "prompt": "… {{selection}} {{file}} {{language}}" }]`.
**Code smells amigables** (Starter) marca funciones largas, anidadas o con muchos parámetros; la bombilla explica cómo mejorarlas. También marca `console.log`/`debugger`/`print()` olvidados y TODO con fecha de hace más de 30 días (`TODO 2026-01-15`).
**Resumen del proyecto** (Starter, sin IA) abre un informe con archivos por lenguaje, líneas, TODO/FIXME, archivos grandes y funciones complicadas.

**Robustez:** si una llamada a la IA falla, la notificación ofrece **Reintentar**; el botón del reloj del panel («Ver respuestas guardadas») reabre las últimas respuestas sin gastar tokens. Los secretos también detectan JWT y URLs con usuario y contraseña.

## IA local sin cargar dos modelos

Si tienes **GhostCode**, MagicTools mira con Ollama (`/api/ps`) qué modelo hay cargado y usa el mismo servidor y,
si puede, el mismo modelo de chat. El panel muestra un aviso, por ejemplo: «GhostCode ya está cargando un modelo (…)».
Si solo está cargado el modelo base de autocompletado (que no sigue instrucciones), te avisa de que habría dos
modelos en memoria y te sugiere el modo API.

## Configuración

`magictools.mode` (local | api), `magictools.local.url`, `magictools.local.chatModel`, `magictools.api.*`, `magictools.language`.
La API key se guarda cifrada en el llavero del sistema («MagicTools: Guardar API key»).

## Desarrollo

`npm install` · `npm run typecheck` · `npm test` · `npm run package` · F5 para probarla.

`npm test` ejecuta las pruebas de los módulos puros y una **prueba de humo** (`test/smoke.test.ts`) que activa la extensión entera con un `vscode` simulado (`test/support/vscode-mock.cjs`) y un Ollama falso: comprueba que todos los comandos de `package.json` están registrados, que ninguno falla sin editor ni carpeta abierta y que los flujos con IA aplican su resultado.
