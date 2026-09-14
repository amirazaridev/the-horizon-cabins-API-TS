export function safeArray(value: unknown): unknown {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return [];

    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : value;
    } catch {
      return value;
    }
  }

  return value;
}