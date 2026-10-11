/** Texto resultante de reemplazar [start, end) por `code` (si start == end, se inserta en esa posición). */
export function applyCode(text: string, start: number, end: number, code: string): string {
  const a = Math.max(0, Math.min(start, text.length));
  const b = Math.max(a, Math.min(end, text.length));
  return text.slice(0, a) + code + text.slice(b);
}
