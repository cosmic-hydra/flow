export function allowedWebOrigins(primaryOrigin: string): string[] {
  const origins = new Set<string>([primaryOrigin]);
  try {
    const url = new URL(primaryOrigin);
    if (url.hostname === 'localhost') {
      origins.add(`${url.protocol}//127.0.0.1${url.port === '' ? '' : `:${url.port}`}`);
    } else if (url.hostname === '127.0.0.1') {
      origins.add(`${url.protocol}//localhost${url.port === '' ? '' : `:${url.port}`}`);
    }
  } catch {
    // Keep the configured origin only when parsing fails.
  }
  return [...origins];
}
