export type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function findBalancedJson(raw: string, opener: '{' | '['): string | undefined {
  const closer = opener === '{' ? '}' : ']';
  const start = raw.indexOf(opener);
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;

    if (depth === 0) return raw.slice(start, i + 1);
  }

  return undefined;
}

function parseJsonValue(raw: string): unknown {
  const stripped = stripJsonFence(raw);
  try {
    return JSON.parse(stripped);
  } catch {
    const objectStart = stripped.indexOf('{');
    const arrayStart = stripped.indexOf('[');
    const preferArray = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart);

    const firstCandidate = findBalancedJson(stripped, preferArray ? '[' : '{');
    if (firstCandidate) return JSON.parse(firstCandidate);

    const secondCandidate = findBalancedJson(stripped, preferArray ? '{' : '[');
    if (secondCandidate) return JSON.parse(secondCandidate);

    throw new SyntaxError('No valid JSON value found in AI response');
  }
}

export function parseJsonRecord(raw: string | null | undefined, fallback: JsonRecord = {}): JsonRecord {
  if (!raw?.trim()) return fallback;
  try {
    const parsed = parseJsonValue(raw);
    return isRecord(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function parseJsonArray<T = unknown>(raw: string | null | undefined, fallback: T[] = []): T[] {
  if (!raw?.trim()) return fallback;
  try {
    const parsed = parseJsonValue(raw);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

export function parseJsonValueOrFallback<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) return fallback;
  try {
    return parseJsonValue(raw) as T;
  } catch {
    return fallback;
  }
}
