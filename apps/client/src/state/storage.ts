/** Le cache garde aussi les suppressions si le stockage devient indisponible. */
const values = new Map<string, string | null>();

export function readStored(key: string): string | null {
  if (values.has(key)) return values.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null): void {
  values.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // La session reste utilisable en mémoire, sans persistance.
  }
}
