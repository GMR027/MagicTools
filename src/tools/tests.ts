import * as vscode from "vscode";
import { cfg } from "../config";
import { resolveLanguage, testsRequest } from "../core/prompts";
import { detectTestFramework } from "../core/testing";
import { aiDocument, type Ctx } from "./ai";
import { resolveTarget, type FnNodeArg } from "./target";

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

/** Framework de tests del proyecto según package.json / pyproject / requirements. */
async function framework(uri: vscode.Uri, languageId: string): Promise<string> {
  const root = vscode.workspace.getWorkspaceFolder(uri)?.uri;
  if (!root) return detectTestFramework(languageId);
  const [packageJson, pyproject, req] = await Promise.all(
    ["package.json", "pyproject.toml", "requirements.txt"].map((f) => readText(vscode.Uri.joinPath(root, f))),
  );
  return detectTestFramework(languageId, { packageJson, pythonDeps: `${pyproject ?? ""}\n${req ?? ""}` });
}

/** «Generar tests»: los muestra junto a una explicación de los casos; no escribe nada en el proyecto. */
export async function generateTests(ctx: Ctx, arg?: FnNodeArg): Promise<void> {
  const t = await resolveTarget(arg);
  if (!t) return;
  const lang = resolveLanguage(cfg().language, vscode.env.language, process.env);
  const fw = await framework(t.uri, t.language);
  await aiDocument(ctx, testsRequest(t.code, t.name, t.language, fw, lang), "generando tests", `Tests para ${t.name}`, `\`${t.file}:${t.start + 1}\` · ${fw}`);
}
