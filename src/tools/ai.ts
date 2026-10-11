import * as vscode from "vscode";
import { cleanReply } from "../core/prompts";
import type { ChatRequest } from "../core/types";
import { recordReply, openReply } from "../history";
import { chatBackend, runChat } from "../runChat";

export interface Ctx {
  secrets: vscode.SecretStorage;
  log: vscode.LogOutputChannel;
}

/** Lanza una petición de IA y muestra la respuesta como Markdown a un lado. Devuelve el texto (o undefined). */
export async function aiDocument(ctx: Ctx, req: ChatRequest, what: string, title: string, intro = ""): Promise<string | undefined> {
  const backend = await chatBackend(ctx.secrets);
  if (!backend) return undefined;
  const raw = await runChat(backend, req, what, ctx.log);
  const text = raw ? cleanReply(raw) : "";
  if (!text) {
    if (raw !== undefined) void vscode.window.showWarningMessage("MagicTools: el modelo no devolvió ninguna respuesta.");
    return undefined;
  }
  recordReply(title, intro, text);
  await openReply(title, intro, text);
  return text;
}
