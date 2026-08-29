export function normalizeNoteContent(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}
