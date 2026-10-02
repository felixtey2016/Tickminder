const LEGACY_HOST = "tuition-lesson-hub.zezhou2009.chatgpt.site";
const CURRENT_HOST = "www.tickminder.com";

export function legacyRedirectTarget(requestUrl: string, method: string): string | null {
  const url = new URL(requestUrl);
  if (url.hostname !== LEGACY_HOST || !["GET", "HEAD"].includes(method)) return null;
  // Keep authenticated API clients and scheduled backups on their existing endpoint.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  url.protocol = "https:";
  url.hostname = CURRENT_HOST;
  url.port = "";
  return url.toString();
}