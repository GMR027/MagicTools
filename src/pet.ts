import * as vscode from "vscode";
import { applyActivity, classifyChange, moodOf, moodText, newPet, RULES, rollover, SPECIES, type Mood, type PetState, type Species } from "./core/pet";

const KEY = "magictools.pet";
export const petEnabled = (): boolean => vscode.workspace.getConfiguration("magictools").get<boolean>("pet.enabled", true);
const IGNORED_LANGUAGES = new Set(["markdown", "plaintext", "log", "scminput", "search-result", "git-commit"]);

export interface PetView {
  /** false = pausado: no cuenta lo que escribes. */
  enabled: boolean;
  species: Species;
  name: string;
  mood: Mood;
  text: string;
  food: number;
  balloon: number;
  streak: number;
  thawNeed: number;
  frozen: boolean;
  todayManual: number;
  minDay: number;
  totalManual: number;
  totalAi: number;
}

/**
 * Observa lo que escribes y alimenta al animalito. Todo es local: solo cuenta caracteres,
 * nunca guarda el contenido del código.
 */
export class PetTracker implements vscode.Disposable {
  private state: PetState;
  private pending = { manual: 0, ai: 0 };
  private flushTimer?: NodeJS.Timeout;
  private saveTimer?: NodeJS.Timeout;
  private lastKey = "";
  private readonly emitter = new vscode.EventEmitter<PetView>();
  readonly onDidChange = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly clock: NodeJS.Timeout;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.state = rollover(context.globalState.get<PetState>(KEY) ?? newPet("gato", new Date()), new Date());
    this.disposables.push(vscode.workspace.onDidChangeTextDocument((e) => void this.onChange(e)), this.emitter);
    // El estado cambia con el tiempo (acaba el ejercicio, llega un día nuevo).
    this.clock = setInterval(() => this.emitIfChanged(), 10_000);
  }

  view(): PetView {
    const now = new Date();
    const s = rollover(this.state, now);
    const mood = moodOf(s, now);
    const name = SPECIES.find((x) => x.id === s.species)?.name ?? "Mascota";
    return {
      enabled: petEnabled(),
      species: s.species,
      name,
      mood,
      text: moodText(mood, s, name, now),
      food: Math.round(s.food),
      balloon: Math.round(s.balloon),
      streak: s.streak,
      thawNeed: RULES.thawStreak,
      frozen: mood === "frozen",
      todayManual: s.todayManual,
      minDay: RULES.minDayChars,
      totalManual: s.totalManual,
      totalAi: s.totalAi,
    };
  }

  setSpecies(species: Species): void {
    if (!SPECIES.some((x) => x.id === species)) return;
    this.state = { ...this.state, species };
    this.save();
    this.emitter.fire(this.view());
  }

  private async onChange(e: vscode.TextDocumentChangeEvent): Promise<void> {
    const doc = e.document;
    if (!petEnabled() || e.reason !== undefined || e.contentChanges.length === 0) return; // pausado, o deshacer / rehacer
    if ((doc.uri.scheme !== "file" && doc.uri.scheme !== "untitled") || IGNORED_LANGUAGES.has(doc.languageId)) return;
    let clipboard: string | undefined;
    for (const c of e.contentChanges) {
      if (c.text.length > 30 && clipboard === undefined) {
        try {
          clipboard = await vscode.env.clipboard.readText();
        } catch {
          clipboard = "";
        }
      }
      const kind = classifyChange({ text: c.text, rangeLength: c.rangeLength }, clipboard);
      if (kind === "manual") this.pending.manual += c.text.length;
      else if (kind === "ai") this.pending.ai += c.text.length;
    }
    // Se agrupan los cambios para no repintar el panel a cada tecla.
    this.flushTimer ??= setTimeout(() => this.flush(), 1200);
  }

  private flush(): void {
    this.flushTimer = undefined;
    const { manual, ai } = this.pending;
    this.pending = { manual: 0, ai: 0 };
    if (!manual && !ai) return;
    this.state = applyActivity(this.state, { manual, ai }, new Date());
    this.save();
    this.lastKey = JSON.stringify(this.view());
    this.emitter.fire(this.view());
  }

  private emitIfChanged(): void {
    const key = JSON.stringify(this.view());
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.emitter.fire(this.view());
  }

  private save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.context.globalState.update(KEY, this.state), 3000);
  }

  dispose(): void {
    clearInterval(this.clock);
    clearTimeout(this.flushTimer);
    clearTimeout(this.saveTimer);
    if (this.pending.manual || this.pending.ai) this.state = applyActivity(this.state, this.pending, new Date());
    void this.context.globalState.update(KEY, this.state);
    this.disposables.forEach((d) => d.dispose());
  }
}

