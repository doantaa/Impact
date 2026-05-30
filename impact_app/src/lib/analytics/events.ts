export type AnalyticsEventName =
  | "brief_create_started"
  | "template_selected"
  | "metrics_recommended_viewed"
  | "metric_edited"
  | "baseline_added"
  | "benchmark_added"
  | "scenario_generated"
  | "brief_exported";

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  ts: string;
  sessionId: string;
  props?: Record<string, unknown>;
};

const SESSION_KEY = "impact.analytics.sessionId.v1";

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

function endpoint(): string | null {
  if (typeof window === "undefined") return null;
  const raw = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

export function trackEvent(name: AnalyticsEventName, props?: Record<string, unknown>) {
  const ev: AnalyticsEvent = { name, ts: new Date().toISOString(), sessionId: getSessionId(), props };

  console.info("[analytics]", ev.name, ev);

  const url = endpoint();
  if (!url) return;

  try {
    const body = JSON.stringify(ev);
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
  }
}
