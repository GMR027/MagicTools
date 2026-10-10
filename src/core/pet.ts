export type Species = "gato" | "perro" | "conejo" | "pinguino";

export const SPECIES: { id: Species; label: string; name: string }[] = [
  { id: "gato", label: "Gatito", name: "Pelusa" },
  { id: "perro", label: "Perrito", name: "Toby" },
  { id: "conejo", label: "Conejito", name: "Copito" },
  { id: "pinguino", label: "Pingüino", name: "Pipo" },
];

/** Reglas del juego (todas en un sitio para poder ajustarlas). */
export const RULES = {
  /** Caracteres escritos a mano que equivalen a 1 punto de comida. */
  charsPerFood: 15,
  /** Caracteres de código «de la IA» que equivalen a 1 punto de globo. */
  charsPerBalloon: 20,
  /** Caracteres a mano que desinflan 1 punto de globo. */
  charsPerDeflate: 30,
  /** Con este globo o más, el animalito se infla. */
  balloonAt: 40,
  /** Caracteres a mano en un día para que cuente como «día de código». */
  minDayChars: 100,
  /** Días seguidos sin código a partir de los cuales se congela. */
  freezeAfterDays: 3,
  /** Días seguidos de código necesarios para descongelarlo. */
  thawStreak: 3,
  /** Comida que se pierde por cada día sin código. */
  foodLossPerDay: 25,
  /** Globo que se desinfla por cada día que pasa. */
  deflatePerDay: 40,
  /** Con menos comida que esto tiene hambre. */
  hungryBelow: 25,
  /** Durante cuánto tiempo (ms) hace ejercicio tras escribir a mano. */
  exerciseMs: 60_000,
  /** Durante cuánto tiempo (ms) está comiendo tras escribir a mano. */
  eatingMs: 4_000,
} as const;

export interface PetState {
  species: Species;
  food: number;
  balloon: number;
  /** Días seguidos con código a mano. */
  streak: number;
  frozen: boolean;
  /** Último día (YYYY-MM-DD) que contó como «día de código». */
  lastCodeDay?: string;
  /** Día en que se creó o se contó por última vez (para calcular los días en blanco). */
  day: string;
  todayManual: number;
  todayAi: number;
  lastManualAt: number;
  totalManual: number;
  totalAi: number;
}

export type Mood = "frozen" | "hungry" | "balloon" | "exercise" | "eating" | "happy" | "idle";

export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Días enteros entre dos claves YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  const t = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

export function newPet(species: Species, now: Date): PetState {
  return { species, food: 60, balloon: 0, streak: 0, frozen: false, day: dayKey(now), todayManual: 0, todayAi: 0, lastManualAt: 0, totalManual: 0, totalAi: 0 };
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Días seguidos sin código hasta hoy (0 si hoy ya programaste). */
export function idleDays(p: PetState, today: string): number {
  if (p.lastCodeDay === today) return 0;
  return daysBetween(p.lastCodeDay ?? p.day, today);
}

/** Aplica el paso de los días: hambre, globo que se desinfla, racha perdida y congelación. */
export function rollover(p: PetState, now: Date): PetState {
  const today = dayKey(now);
  if (p.day === today) return p;
  const passed = Math.max(0, daysBetween(p.day, today));
  const next: PetState = { ...p, day: today, todayManual: 0, todayAi: 0 };
  next.balloon = clamp(p.balloon - RULES.deflatePerDay * passed);
  const idle = idleDays(next, today);
  // Cada día entero sin código quita comida, aunque se haya saltado un día de consulta.
  if (idle > 0) next.food = clamp(p.food - RULES.foodLossPerDay * Math.min(passed, idle));
  // La racha se pierde si ayer no fue día de código.
  if (!p.lastCodeDay || daysBetween(p.lastCodeDay, today) > 1) next.streak = 0;
  if (idle >= RULES.freezeAfterDays) next.frozen = true;
  return next;
}

/** Suma lo escrito a mano y lo que se detectó como generado por IA. */
export function applyActivity(p: PetState, a: { manual?: number; ai?: number }, now: Date): PetState {
  let s = rollover(p, now);
  const manual = a.manual ?? 0;
  const ai = a.ai ?? 0;
  if (!manual && !ai) return s;
  s = { ...s, totalManual: s.totalManual + manual, totalAi: s.totalAi + ai, todayAi: s.todayAi + ai };
  if (ai) s.balloon = clamp(s.balloon + ai / RULES.charsPerBalloon);
  if (manual) {
    s.todayManual += manual;
    s.lastManualAt = now.getTime();
    s.balloon = clamp(s.balloon - manual / RULES.charsPerDeflate);
    // Congelado no come: primero hay que cumplir la racha.
    if (!s.frozen) s.food = clamp(s.food + manual / RULES.charsPerFood);
    const today = dayKey(now);
    if (s.todayManual >= RULES.minDayChars && s.lastCodeDay !== today) {
      s.streak = s.lastCodeDay && daysBetween(s.lastCodeDay, today) === 1 ? s.streak + 1 : 1;
      s.lastCodeDay = today;
      if (s.frozen && s.streak >= RULES.thawStreak) (s.frozen = false), (s.food = Math.max(s.food, 50));
    }
  }
  return s;
}

export function moodOf(p: PetState, now: Date): Mood {
  const s = rollover(p, now);
  const idle = idleDays(s, dayKey(now));
  if (s.frozen || idle >= RULES.freezeAfterDays) return "frozen";
  const since = now.getTime() - s.lastManualAt;
  if (s.balloon >= RULES.balloonAt) return "balloon";
  if (idle >= 1 || s.food < RULES.hungryBelow) return "hungry";
  if (since < RULES.eatingMs) return "eating";
  if (since < RULES.exerciseMs) return "exercise";
  if (s.todayManual >= RULES.minDayChars) return "happy";
  return "idle";
}

export function moodText(mood: Mood, p: PetState, name: string, now: Date): string {
  const idle = idleDays(rollover(p, now), dayKey(now));
  switch (mood) {
    case "frozen":
      return `${name} está congelado ❄️. Programa ${RULES.thawStreak} días seguidos para descongelarlo (${Math.min(p.streak, RULES.thawStreak)}/${RULES.thawStreak}).`;
    case "balloon":
      return `${name} se ha inflado como un globo 🎈: detectó mucho código que no escribiste tú. Escribe a mano para que se desinfle.`;
    case "hungry":
      return idle >= 1
        ? `${name} tiene hambre 🍖: llevas ${idle} día${idle === 1 ? "" : "s"} sin escribir código.`
        : `${name} tiene hambre 🍖: escribe código a mano para darle de comer.`;
    case "eating":
      return `${name} se come tus letras ¡ñam, ñam! 😋`;
    case "exercise":
      return `${name} está contento y hace ejercicio 💪 al ritmo de tu teclado.`;
    case "happy":
      return `${name} está feliz 😊: hoy ya has programado.`;
    default:
      return `${name} te espera. Escribe algo de código y se pondrá a comer.`;
  }
}

/** Qué hacer con un cambio en el editor: contarlo a mano, como código generado o ignorarlo. */
export function classifyChange(c: { text: string; rangeLength: number }, clipboard?: string): "manual" | "ai" | "ignore" {
  const text = c.text;
  if (!text.trim()) return "ignore";
  // Tecleo normal, autocompletado corto o apertura de llaves con sangría.
  if (text.length <= 30 && text.split("\n").length <= 2) return "manual";
  // Pegar lo copiado por el usuario no es de la IA ni escrito a mano.
  if (clipboard !== undefined && text.trim() === clipboard.trim()) return "ignore";
  // Dar formato a un bloque: casi el mismo tamaño que lo que reemplaza.
  if (c.rangeLength > 0 && Math.abs(text.length - c.rangeLength) <= c.rangeLength * 0.2) return "ignore";
  return "ai";
}
