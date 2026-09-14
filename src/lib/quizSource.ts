/**
 * Stable cache key for generated quizzes. This deliberately has no
 * Firebase dependency so both client code and server routes can use it.
 */
export function buildVideoSourceHash(
  title: string,
  description?: string | null,
  summary?: string | null,
): string {
  const text = `${(title || "").trim()}\n${(description || "").trim()}\n${(summary || "").trim()}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
