# MagicTools — herramientas para programar

Un panel en VS Code con tres pestañas según tu nivel: **Starter**, **Junior** y **Senior**.
Las herramientas con IA funcionan con un modelo **local** (Ollama) o con una **API** (Claude, Codestral o compatible con OpenAI).

## Starter

| Herramienta | Qué hace |
|---|---|
| **Traducir error** (IA) | Pegas un error (y, si quieres, el código) y te explica qué significa, por qué pasa, cómo arreglarlo y cómo evitarlo. |
| **Idea a código** (IA) | Cuentas qué quieres hacer y devuelve un plan, el código comentado paso a paso y qué aprender de él. |

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
