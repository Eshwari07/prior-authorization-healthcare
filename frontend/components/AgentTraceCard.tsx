"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Search,
  ClipboardList,
  Send,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TraceStep {
  agent: string;
  status: string;
  decision: string;
  reasoning: string;
  confidence?: number;
  details?: Record<string, unknown>;
  data_used?: string[];
}

const AGENT_META: Record<string, { icon: React.ReactNode; label: string }> = {
  eligibility: { icon: <Search className="w-4 h-4" />, label: "Eligibility Verifier" },
  coder: { icon: <ClipboardList className="w-4 h-4" />, label: "Prior Auth Coder" },
  submitter: { icon: <Send className="w-4 h-4" />, label: "PA Submitter" },
  denial_analyst: { icon: <RefreshCw className="w-4 h-4" />, label: "Denial Analyst" },
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "success" | "error" | "warning" | "default" | "outline"; label: string }> = {
    eligible: { variant: "success", label: "Eligible" },
    ineligible: { variant: "error", label: "Ineligible" },
    coded: { variant: "success", label: "Coded" },
    approved: { variant: "success", label: "Approved" },
    denied: { variant: "error", label: "Denied" },
    analyzed: { variant: "warning", label: "Analyzed" },
    escalated: { variant: "warning", label: "Escalated" },
  };
  const s = map[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 1) * 100;
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>Confidence</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AgentTraceCard({ step, index }: { step: TraceStep; index: number }) {
  const [open, setOpen] = useState(true);
  const meta = AGENT_META[step.agent] ?? { icon: <Clock className="w-4 h-4" />, label: step.agent };
  const details = step.details ?? {};

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 backdrop-blur overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-700 text-blue-400">
            {meta.icon}
          </span>
          <span className="font-medium text-slate-100 text-sm">{meta.label}</span>
          <StatusBadge status={step.status} />
          <span className="text-slate-400 text-sm hidden sm:block">{step.decision}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700">
          <p className="text-sm text-slate-300 mt-3">
            <span className="text-slate-500 font-medium">Reasoning: </span>
            {step.reasoning}
          </p>

          {Object.keys(details).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div className="space-y-1.5">
                {(details.cpt_code as string) && (
                  <DetailRow label="CPT/HCPCS" value={details.cpt_code as string} mono />
                )}
                {(details.primary_icd10 as string) && (
                  <DetailRow label="Primary ICD-10" value={details.primary_icd10 as string} mono />
                )}
                {Array.isArray(details.secondary_icd10) && details.secondary_icd10.length > 0 && (
                  <DetailRow label="Secondary ICD-10" value={(details.secondary_icd10 as string[]).join(", ")} mono />
                )}
                {(details.auth_number as string) && (
                  <DetailRow label="Auth #" value={details.auth_number as string} mono />
                )}
                {(details.denial_code as string) && (
                  <DetailRow
                    label="Denial"
                    value={`${details.denial_code} — ${details.denial_reason ?? ""}`}
                    highlight="error"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                {(details.root_cause as string) && (
                  <DetailRow label="Root cause" value={details.root_cause as string} />
                )}
                {Array.isArray(details.correction) && details.correction.length > 0 && (
                  <DetailRow label="Correction" value={(details.correction as string[]).join("; ")} />
                )}
                {(details.clinical_justification as string) && (
                  <p className="text-xs text-slate-400 italic">{details.clinical_justification as string}</p>
                )}
              </div>
            </div>
          )}

          {step.data_used && step.data_used.length > 0 && (
            <p className="text-xs text-slate-500">
              Data consulted: {step.data_used.join(" · ")}
            </p>
          )}

          {step.confidence != null && <ConfidenceBar value={step.confidence} />}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: "error";
}) {
  return (
    <div className="flex flex-wrap gap-1.5 items-baseline">
      <span className="text-xs text-slate-500 font-medium">{label}:</span>
      <span
        className={cn(
          "text-xs",
          mono && "font-mono bg-slate-700 px-1 rounded text-blue-300",
          highlight === "error" && "text-red-400",
          !mono && !highlight && "text-slate-300"
        )}
      >
        {value}
      </span>
    </div>
  );
}
