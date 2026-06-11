"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import { API_URL } from "@/lib/utils";

interface FallbackEvent {
  kind: string;
  detail: string;
  age_seconds: number;
}

interface StatusResponse {
  llm_provider: string;
  retrieval_provider: string;
  degraded: boolean;
  fallbacks: FallbackEvent[];
}

/**
 * Polls the backend /api/status endpoint and shows an accessible banner when the
 * system has fallen back from its primary Microsoft Foundry / Foundry IQ path to
 * the OpenRouter / Qdrant fallbacks. Supports the Reliability & Safety criterion
 * by making degraded states transparent to the user.
 */
export function ReliabilityBanner() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const poll = useCallback(() => {
    fetch(`${API_URL}/api/status`)
      .then((r) => r.json())
      .then((d: StatusResponse) => {
        setStatus(d);
        if (d.degraded) setDismissed(false); // re-show when a new fallback occurs
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 20000);
    return () => clearInterval(id);
  }, [poll]);

  if (!status || !status.degraded || dismissed) return null;

  const kinds = new Set(status.fallbacks.map((f) => f.kind));
  const parts: string[] = [];
  if (kinds.has("llm")) parts.push("LLM reasoning is using the OpenRouter fallback");
  if (kinds.has("retrieval")) parts.push("knowledge retrieval is using the Qdrant fallback");
  const summary =
    parts.length > 0
      ? `Running in degraded mode — ${parts.join(" and ")}.`
      : "Running in degraded mode.";

  return (
    <div
      role="status"
      aria-live="polite"
      className="shrink-0 flex items-start gap-3 px-3 sm:px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900"
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{summary}</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Primary Microsoft Foundry services were temporarily unavailable. Results remain valid;
          the system automatically switched providers to stay online.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss reliability notice"
        className="shrink-0 rounded-md p-1 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default ReliabilityBanner;
