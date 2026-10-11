import * as vscode from "vscode";
import { cfg } from "../config";
import { resolveLanguage, savedPromptRequest } from "../core/prompts";
import { fillPrompt, parseSavedPrompts, PROMPTS_FILE, PROMPTS_TEMPLATE } from "../core/savedPrompts";
import { aiDocument, type Ctx } from "./ai";
import { pickEditor } from "./functionTree";
import { openOrCreate, projectRoot } from "./workspace";

const EDIT = "__edit__";

/** Lanza uno de los prompts de `.magictools/prompts.json` sobre la selección (o el archivo activo). */
export async function runSavedPrompt(ctx: Ctx): Promise<void> {
  const root = projectRoot();
  if (!root) return void vscode.window.showInformationMessage("MagicTools: abre una carpeta de proyecto primero.");
  let text: string;
  try {
    text = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, PROMPTS_FILE)));
  } catch {
    await openOrCreate(PROMPTS_FILE, PROMPTS_TEMPLATE, "tus prompts guardados");
    return;
  }
  const { prompts, error } = parseSavedPrompts(text);
  if (error) {
    void vscode.window.showWarningMessage(`MagicTools: ${PROMPTS_FILE}: ${error}`);
    return void (await openOrCreate(PROMPTS_FILE, PROMPTS_TEMPLATE, "tus prompts guardados"));
  }
  const items = [
    ...prompts.map((p) => ({ label: p.name, detail: p.prompt.replace(/\s+/g, " ").slice(0, 100), id: p.name })),
    { label: "$(edit) Editar mis prompts…", detail: PROMPTS_FILE, id: EDIT },
  ];
  const pick = await vscode.window.showQuickPick(items, { title: "MagicTools — mis prompts" });
  if (!pick) return;
  if (pick.id === EDIT) return void (await openOrCreate(PROMPTS_FILE, PROMPTS_TEMPLATE, "tus prompts guardados"));
  const template = prompts.find((p) => p.name === pick.id)?.prompt ?? "";
  const editor = pickEditor();
  const doc = editor?.document;
  const selection = editor ? (editor.selection.isEmpty ? (doc?.getText().slice(0, 12_000) ?? "") : doc!.getText(editor.selection)) : "";
  const prompt = fillPrompt(template, { selection, file: doc ? vscode.workspace.asRelativePath(doc.uri) : "", language: doc?.languageId ?? "" });
  const lang = resolveLanguage(cfg().language, vscode.env.language, process.env);
  await aiDocument(ctx, savedPromptRequest(prompt, lang), pick.label.toLowerCase(), pick.label);
}
