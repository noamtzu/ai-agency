function trimTrailingSlash(s: string) {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

export const API_BASE = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (fromEnv) return trimTrailingSlash(fromEnv);

  // Runtime default (works in production deployments where the app is not served from localhost).
  // Assumes backend is reachable at the same hostname on port 8000.
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  // Fallback for SSR/build-time evaluation.
  return "http://localhost:8000";
})();

export const WS_BASE = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_WS_BASE?.trim();
  if (fromEnv) return trimTrailingSlash(fromEnv);

  if (typeof window !== "undefined") {
    const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${wsProto}://${window.location.hostname}:8000`;
  }

  return "ws://localhost:8000";
})();
