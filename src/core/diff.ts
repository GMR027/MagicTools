
const MAX_FILE_LINES = 200;

/** Diff de un archivo nuevo (sin rastrear): todo son líneas añadidas. Vacío si parece binario. */
export function addedFileDiff(path: string, content: string): string {
  if (content.includes("\0")) return "";
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const shown = lines.slice(0, MAX_FILE_LINES);
  const more = lines.length > shown.length ? `\n+… (${lines.length - shown.length} more lines)` : "";
  return [`diff --git a/${path} b/${path}`, "new file mode 100644", "--- /dev/null", `+++ b/${path}`, `@@ -0,0 +1,${shown.length} @@`, ...shown.map((l) => `+${l}`)].join("\n") + more + "\n";
}

/** Ramas base habituales, en orden de preferencia, para comparar «mi rama contra main». */
export const BASE_BRANCHES = ["origin/main", "main", "origin/master", "master"] as const;
