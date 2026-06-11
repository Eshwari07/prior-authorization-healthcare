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
  Quote,
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
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
        <span className="font-medium">Confidence</span>
        <span className="font-bold text-slate-700">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const STATUS_BORDER: Record<string, string> = {
  eligible: "border-l-emerald-400",
  coded: "border-l-emerald-400",
  approved: "border-l-emerald-400",
  denied: "border-l-red-400",
  ineligible: "border-l-red-400",
  analyzed: "border-l-amber-400",
  escalated: "border-l-amber-400",
};

export function AgentTraceCard({ step, index }: { step: TraceStep; index: number }) {
  const [open, setOpen] = useState(true);
  const meta = AGENT_META[step.agent] ?? { icon: <Clock className="w-4 h-4" />, label: step.agent };
  const details = step.details ?? {};
  const borderColor = STATUS_BORDER[step.status] ?? "border-l-slate-300";

  return (
    <div className={`rounded-xl border border-slate-200 border-l-4 ${borderColor} bg-white shadow-sm overflow-hidden hover:shadow-md transition-all duration-200`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${open ? "Collapse" : "Expand"} ${meta.label} step details`}
        className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-3.5 hover:bg-slate-50/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3a5ba0]/50"
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-wrap">
          {/* Step number */}
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold shrink-0">
            {index + 1}
          </span>
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#3a5ba0]/10 text-[#3a5ba0] shrink-0">
            {meta.icon}
          </span>
          <span className="font-semibold text-slate-800 truncate">{meta.label}</span>
          <StatusBadge status={step.status} />
          <span className="text-slate-500 text-sm hidden md:block truncate max-w-[200px]">{step.decision}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-3 border-t border-slate-100">
          <p className="text-sm text-slate-600 mt-3.5 leading-relaxed">
            <span className="text-slate-400 font-medium">Reasoning: </span>
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
                  <p className="text-sm text-gray-500 italic">{details.clinical_justification as string}</p>
                )}
              </div>
            </div>
          )}

          {Array.isArray(details.citations) && (details.citations as string[]).length > 0 && (
            <div className="mt-2 rounded-lg bg-[#3a5ba0]/5 border border-[#3a5ba0]/15 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Quote className="w-3.5 h-3.5 text-[#3a5ba0]" />
                <span className="text-xs font-semibold uppercase tracking-wide text-[#3a5ba0]">
                  Grounded sources
                </span>
              </div>
              <ul className="space-y-1">
                {(details.citations as string[]).map((c, i) => (
                  <li key={i} className="text-xs text-slate-600 leading-relaxed flex gap-1.5">
                    <span className="text-[#3a5ba0]/60 shrink-0">[{i + 1}]</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step.data_used && step.data_used.length > 0 && (
            <p className="text-xs text-slate-400 font-medium">
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
      <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{label}:</span>
      <span
        className={cn(
          "text-sm",
          mono && "font-mono bg-[#3a5ba0]/8 px-1.5 py-0.5 rounded text-[#3a5ba0] border border-[#3a5ba0]/20",
          highlight === "error" && "text-red-600 font-medium",
          !mono && !highlight && "text-slate-700"
        )}
      >
        {value}
      </span>
    </div>
  );
}
