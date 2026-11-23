export function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.trim().split(" ");
  if (parts.length !== 2) return null;
  const [scheme, token] = parts;
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
