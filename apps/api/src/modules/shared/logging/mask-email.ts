/**
 * Keeps logs useful for debugging (domain + first letter) without storing the
 * full e-mail address in Loki.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}
