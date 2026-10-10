import * as vscode from "vscode";
import { OllamaBackend } from "./backends/ollama";
import { cfg, createApiBackend } from "./config";
import type { Backend, ChatRequest } from "./core/types";
import { inspectLocal } from "./localGuard";

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

/** Petición de chat con notificación cancelable y límite de tiempo. undefined si se canceló o falló. */
export async function runChat(backend: Backend, req: ChatRequest, what: string, log: vscode.LogOutputChannel): Promise<string | undefined> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `MagicTools: ${what} con ${backend.label}…`, cancellable: true },
    async (_progress, token) => {
      const abort = new AbortController();
      token.onCancellationRequested(() => abort.abort());
      const timer = setTimeout(() => abort.abort(), 120_000);
      let out = "";
      try {
        for await (const piece of backend.chat(req, abort.signal)) out += piece;
        return out;
      } catch (err) {
        if (token.isCancellationRequested) return undefined;
        const msg = abort.signal.aborted ? "el modelo tardó demasiado en responder." : (err as Error).message;
        log.error(`${what}: ${msg}`);
        void vscode.window.showErrorMessage(`MagicTools: error ${what}: ${msg}`);
        return undefined;
      } finally {
        clearTimeout(timer);
      }
    },
  );
}
