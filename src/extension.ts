import * as vscode from "vscode";
import { clearApiKeyCommand, configureApi, setApiKeyCommand } from "./commands";
import { validateTools } from "./core/registry";
import { MagicToolsPanel, PROPOSED_SCHEME, proposedProvider } from "./panel";
import { PetTracker } from "./pet";
import { TOOLS } from "./tools";
import { RULES_FILE, RULES_TEMPLATE } from "./core/rules";
import { initHistory, ReplyLinks, showLastReply } from "./history";
import { createEnvExample, projectSummary } from "./tools/projectTools";
import { analyzeComplexity, cleanFile, splitFunction } from "./tools/refactor";
import { dependencyMap, gitHotspots, reviewCode, securityReview } from "./tools/senior";
import { explainDiff } from "./tools/diffTool";
import { DiagnoseActions, explainDiagnostic } from "./tools/diagnose";
import { FindingActions, Findings, explainFinding } from "./tools/findings";
import { simulateImpact } from "./tools/impact";
import { LiveTree } from "./tools/liveTree";
import { runSavedPrompt } from "./tools/savedPrompts";
import { generateTests } from "./tools/tests";
import { openOrCreate } from "./tools/workspace";
import { buildFunctionTree, trackEditors } from "./tools/functionTree";

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel("MagicTools", { log: true });
  for (const problem of validateTools(TOOLS)) log.warn(`Registro de herramientas: ${problem}`);

  initHistory(context.workspaceState);
  trackEditors(context);
  const pet = new PetTracker(context);
  const panel = new MagicToolsPanel(context, TOOLS, log, pet);
  const secrets = context.secrets;
  const ctx = { secrets, log };
  const findings = new Findings();
  const liveTree = new LiveTree();
  context.subscriptions.push(
    log,
    pet,
    findings,
    liveTree,
    vscode.window.registerTreeDataProvider("magictools.functions", liveTree),
    vscode.commands.registerCommand("magictools.tool.function-tree", () => buildFunctionTree(log)),
    vscode.commands.registerCommand("magictools.tool.diagnose", () => explainDiagnostic(secrets, log)),
    vscode.commands.registerCommand("magictools.explainDiagnostic", (uri: vscode.Uri, diag: vscode.Diagnostic) =>
      explainDiagnostic(secrets, log, uri && diag ? { uri, diag } : undefined),
    ),
    vscode.commands.registerCommand("magictools.tool.saved-prompts", () => runSavedPrompt(ctx)),
    vscode.commands.registerCommand("magictools.tool.smells", async () => {
      const n = await findings.checkSmells();
      if (n === undefined) return;
      void vscode.window.showInformationMessage(n ? `MagicTools: ${n} cosa(s) para mejorar. Pasa el ratón por las marcas y pulsa la bombilla.` : "MagicTools: no encontré funciones raras en este archivo. ¡Bien hecho!");
    }),
    vscode.commands.registerCommand("magictools.tool.gen-tests", (node) => generateTests(ctx, node)),
    vscode.commands.registerCommand("magictools.tool.project-summary", () => projectSummary()),
    vscode.commands.registerCommand("magictools.tool.env-example", () => createEnvExample()),
    vscode.commands.registerCommand("magictools.tool.clean-file", () => cleanFile()),
    vscode.commands.registerCommand("magictools.tool.split-fn", (node) => splitFunction(ctx, node)),
    vscode.commands.registerCommand("magictools.tool.code-review", (node) => reviewCode(ctx, node)),
    vscode.commands.registerCommand("magictools.tool.security-review", (node) => securityReview(ctx, node)),
    vscode.commands.registerCommand("magictools.tool.complexity", (node) => analyzeComplexity(ctx, node)),
    vscode.commands.registerCommand("magictools.tool.deps-map", () => dependencyMap()),
    vscode.commands.registerCommand("magictools.tool.hotspots", () => gitHotspots()),
    vscode.commands.registerCommand("magictools.showLast", () => showLastReply()),
    vscode.languages.registerDocumentLinkProvider({ language: "markdown" }, new ReplyLinks()),
    vscode.commands.registerCommand("magictools.tool.explain-diff", () => explainDiff(ctx)),
    vscode.commands.registerCommand("magictools.tool.impact", (node) => simulateImpact(ctx, node)),
    vscode.commands.registerCommand("magictools.tool.secrets", async () => {
      if (!vscode.workspace.workspaceFolders?.length) return void vscode.window.showInformationMessage("MagicTools: abre una carpeta de proyecto primero.");
      const r = await findings.scanWorkspace();
      void vscode.window.showInformationMessage(r.hits ? `MagicTools: ${r.hits} posible(s) secreto(s) en ${r.files} archivo(s). Mira el panel de Problemas.` : "MagicTools: no encontré secretos en el código.");
    }),
    vscode.commands.registerCommand("magictools.tool.team-rules", () => openOrCreate(RULES_FILE, RULES_TEMPLATE, "las reglas del equipo")),
    vscode.commands.registerCommand("magictools.explainFinding", (uri: vscode.Uri, diag: vscode.Diagnostic) => uri && diag && explainFinding(ctx, uri, diag)),
    vscode.languages.registerCodeActionsProvider({ scheme: "file" }, new FindingActions(), { providedCodeActionKinds: DiagnoseActions.kinds }),
    vscode.languages.registerCodeActionsProvider({ scheme: "file" }, new DiagnoseActions(), { providedCodeActionKinds: DiagnoseActions.kinds }),
    vscode.workspace.registerTextDocumentContentProvider(PROPOSED_SCHEME, proposedProvider),
    vscode.window.registerWebviewViewProvider(MagicToolsPanel.viewId, panel),
    vscode.commands.registerCommand("magictools.openPanel", () => vscode.commands.executeCommand("workbench.view.extension.magictools")),
    vscode.commands.registerCommand("magictools.refreshPanel", () => panel.refresh()),
    vscode.commands.registerCommand("magictools.configureApi", () => configureApi(secrets)),
    vscode.commands.registerCommand("magictools.setApiKey", () => setApiKeyCommand(secrets)),
    vscode.commands.registerCommand("magictools.clearApiKey", () => clearApiKeyCommand(secrets)),
    // Cambió la configuración (modo, modelo, URL) o se instaló/desinstaló GhostCode.
    vscode.workspace.onDidChangeConfiguration((e) => (e.affectsConfiguration("magictools") || e.affectsConfiguration("ghostcode")) && void panel.refresh()),
    vscode.extensions.onDidChange(() => void panel.refresh()),
  );
  log.info(`MagicTools listo · ${TOOLS.length} herramienta(s)`);
  // API para las pruebas de integración.
  return { panel };
}

export function deactivate() {}
