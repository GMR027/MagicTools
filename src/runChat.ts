import * as vscode from "vscode";
import { OllamaBackend } from "./backends/ollama";
import { cfg, createApiBackend } from "./config";
import type { Backend, ChatRequest } from "./core/types";
import { clipRules, RULES_FILE, withRules } from "./core/rules";
import { inspectLocal } from "./localGuard";

/** Reglas del equipo (.magictools/rules.md) del proyecto abierto; solo en carpetas de confianza. */
export async function loadRules(): Promise<string> {
  const folder = vscode.window.activeTextEditor && vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
  const root = (folder ?? vscode.workspace.workspaceFolders?.[0])?.uri;
  if (!root || !vscode.workspace.isTrusted) return "";
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, RULES_FILE));
    return clipRules(new TextDecoder().decode(bytes.slice(0, 20_000)));
  } catch {
    return "";
  }
}

/** Backend para las herramientas con IA según el modo; undefined (con aviso) si no se puede. */
export async function chatBackend(secrets: vscode.SecretStorage): Promise<Backend | undefined> {
  if (cfg().mode === "api") {
    try {
      return await createApiBackend(secrets);
    } catch (err) {
      void vscode.window.showErrorMessage(`MagicTools: ${(err as Error).message}`);
      return undefined;
    }
  }
  const local = await inspectLocal();
  if (!local.reachable) {
    void vscode.window.showErrorMessage(`MagicTools: Ollama no responde en ${local.url}. Inícialo o cambia al modo API.`);
    return undefined;
  }
  if (!local.model) {
    void vscode.window.showWarningMessage(`MagicTools: ${local.notice?.text ?? "no hay un modelo de chat disponible."}`);
    return undefined;
  }
  return new OllamaBackend(local.url, local.model);
}

type Attempt = { ok: string } | { cancelled: true } | { error: string };

/** Un intento: notificación cancelable y límite de tiempo. */
function attempt(backend: Backend, req: ChatRequest, what: string, log: vscode.LogOutputChannel): Thenable<Attempt> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `MagicTools: ${what} con ${backend.label}…`, cancellable: true },
    async (_progress, token): Promise<Attempt> => {
      const abort = new AbortController();
      token.onCancellationRequested(() => abort.abort());
      const timer = setTimeout(() => abort.abort(), 120_000);
      let out = "";
      try {
        for await (const piece of backend.chat(req, abort.signal)) out += piece;
        return { ok: out };
      } catch (err) {
        if (token.isCancellationRequested) return { cancelled: true };
        const error = abort.signal.aborted ? "el modelo tardó demasiado en responder." : (err as Error).message;
        log.error(`${what}: ${error}`);
        return { error };
      } finally {
        clearTimeout(timer);
      }
    },
  );
}

/** Petición de chat con notificación cancelable y límite de tiempo. Si falla, ofrece «Reintentar» con la misma petición. undefined si se canceló o falló. */
export async function runChat(backend: Backend, req: ChatRequest, what: string, log: vscode.LogOutputChannel): Promise<string | undefined> {
  const withTeamRules = withRules(req, await loadRules());
  for (;;) {
    const r = await attempt(backend, withTeamRules, what, log);
    if ("ok" in r) return r.ok;
    if ("cancelled" in r) return undefined;
    const pick = await vscode.window.showErrorMessage(`MagicTools: error ${what}: ${r.error}`, "Reintentar");
    if (pick !== "Reintentar") return undefined;
  }
}
