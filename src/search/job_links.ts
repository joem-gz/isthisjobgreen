/**
 * Provider URLs are untrusted data. Only HTTPS destinations may become
 * clickable links in the extension UI; malformed or active-scheme values are
 * rendered as plain text by the caller.
 */
export function resolveSafeJobUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
