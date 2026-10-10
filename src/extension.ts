import * as vscode from "vscode";
import { clearApiKeyCommand, configureApi, setApiKeyCommand } from "./commands";
import { validateTools } from "./core/registry";
import { MagicToolsPanel } from "./panel";
import { PetTracker } from "./pet";
import { TOOLS } from "./tools";
import { buildFunctionTree, trackEditors } from "./tools/functionTree";

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel("MagicTools", { log: true });
  for (const problem of validateTools(TOOLS)) log.warn(`Registro de herramientas: ${problem}`);

  trackEditors(context);
  const pet = new PetTracker(context);
  const panel = new MagicToolsPanel(context, TOOLS, log, pet);
  const secrets = context.secrets;
  context.subscriptions.push(
    log,
    pet,
    vscode.commands.registerCommand("magictools.tool.function-tree", () => buildFunctionTree(log)),
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
}

export function deactivate() {}
