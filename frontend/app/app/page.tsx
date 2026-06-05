"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Ban,
  BookOpen,
  CheckCircle,
  ExternalLink,
  Eye,
  FileText,
  Heart,
  History,
  Home,
  Info,
  Loader2,
  Search,
  Send,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  Users,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AgentTraceCard } from "@/components/AgentTraceCard";
import { ChatBot } from "@/components/ChatBot";
import { Badge } from "@/components/ui/badge";
import { FolderTabs } from "@/components/FolderTabs";
import NavHeader from "@/components/NavHeader";
import { RippleButton } from "@/components/RippleButton";
import { API_URL } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Patient {
  patient_id: string;
  name: string;
  dob?: string;
  insurer?: string;
  plan_name?: string;
  coverage_active?: boolean;
}

interface TraceStep {
  agent: string;
  status: string;
  decision: string;
  reasoning: string;
  confidence?: number;
  details?: Record<string, unknown>;
  data_used?: string[];
}

interface RunResult {
  run_id: string;
  final_status: string;
  final_auth_number?: string;
  retry_count: number;
  appeal_letter?: string;
  patient_context?: Record<string, unknown>;
  coding_result?: Record<string, unknown>;
  pa_request?: Record<string, unknown>;
  agent_trace: TraceStep[];
}

interface HistoryRun {
  created_at: string;
  patient_name: string;
  patient_id?: string;
  insurer: string;
  plan_name?: string;
  procedure_desc: string;
  cpt_code: string;
  primary_icd10: string;
  secondary_icd10?: string[];
  final_status: string;
  retry_count: number;
  auth_number?: string;
  denial_code?: string;
  denial_reason?: string;
  appeal_letter?: string;
  agent_trace?: TraceStep[];
}

interface Analytics {
  total: number;
  approved: number;
  escalated: number;
  ineligible: number;
  avg_retries: number;
  denial_breakdown: Record<string, number>;
}

interface IcdCode { code: string; description: string; }

interface PatientDetail {
  patient_id: string; name: string; dob: string; gender: string;
  insurer: string; member_id: string; plan_type: string; plan_name: string;
  coverage_active: string; coverage_start: string; coverage_end: string;
  conditions: string; medications: string; source_file: string;
}

interface Procedure {
  code: string; description: string; category: string; typical_modifiers: string;
}

interface PaRules {
  pa_required_categories?: string[];
  no_pa_categories?: string[];
  plan_overrides?: Record<string, { additional_pa_categories?: string[]; _note?: string }>;
  non_covered_examples?: Record<string, string[]>;
}

type WorkflowTab = "submit" | "history" | "analytics";
type SidebarTab = "patients" | "icd10" | "hcpcs" | "pa-rules";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle className="w-4 h-4 text-emerald-600" />;
  if (status === "ineligible") return <Ban className="w-4 h-4 text-red-500" />;
  if (status === "escalated") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  if (status === "denied") return <XCircle className="w-4 h-4 text-red-500" />;
  return <Activity className="w-4 h-4 text-[#3a5ba0]" />;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    denied: "bg-red-50 text-red-700 border-red-200",
    ineligible: "bg-red-50 text-red-700 border-red-200",
    escalated: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${map[status] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
      <StatusIcon status={status} />
      {status}
    </span>
  );
}

// ─── FinalBanner ──────────────────────────────────────────────────────────────

function FinalBanner({ result }: { result: RunResult }) {
  if (result.final_status === "approved") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-4 shadow-sm">
        <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
        <div>
          <p className="text-emerald-800 font-semibold">Authorization Approved</p>
          <p className="text-emerald-600 text-sm">
            Auth #{result.final_auth_number}
            {result.retry_count > 0 && ` — approved after ${result.retry_count} retr${result.retry_count === 1 ? "y" : "ies"}`}
          </p>
        </div>
      </div>
    );
  }
  if (result.final_status === "ineligible") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-5 py-4 shadow-sm">
        <Ban className="w-5 h-5 text-red-500 shrink-0" />
        <p className="text-red-700 font-semibold">Not Eligible — see eligibility reasoning above</p>
      </div>
    );
  }
  if (result.final_status === "escalated") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-amber-800 font-semibold">Escalated to Human Review</p>
        </div>
        {result.appeal_letter && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Appeal Letter
            </p>
            <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">
              {result.appeal_letter}
            </pre>
          </div>
        )}
      </div>
    );
  }
  return null;
}

// ─── PatientDetailsCard ───────────────────────────────────────────────────────

function PatientDetailsCard({ patient, detail }: { patient: Patient; detail?: PatientDetail }) {
  const isActive = detail ? detail.coverage_active === "True" : !!patient.coverage_active;
  const conditions = (detail?.conditions ?? "").split("|").map((c) => c.trim()).filter(Boolean);
  const medications = (detail?.medications ?? "").split(";").map((m) => m.trim()).filter(Boolean);
  const fields = [
    { label: "Date of Birth", value: detail?.dob || patient.dob || "—" },
    { label: "Sex", value: detail?.gender || "—" },
    { label: "Insurer", value: detail?.insurer || patient.insurer || "—" },
    { label: "Member ID", value: detail?.member_id || "—" },
    { label: "Plan", value: detail?.plan_name || patient.plan_name || "—" },
    { label: "Plan Type", value: detail?.plan_type || "—" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#3a5ba0]/10">
            <Users className="w-4 h-4 text-[#3a5ba0]" />
          </span>
          <p className="font-semibold text-slate-900">{patient.name}</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
          {isActive ? "Coverage Active" : "Coverage Inactive"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
            <p className="text-sm font-medium text-slate-800 capitalize">{value}</p>
          </div>
        ))}
        {detail && (detail.coverage_start || detail.coverage_end) && (
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Coverage Period</p>
            <p className="text-sm font-medium text-slate-800">{detail.coverage_start || "—"} → {detail.coverage_end || "—"}</p>
          </div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1.5">Conditions (ICD-10)</p>
          <div className="flex flex-wrap gap-1.5">
            {conditions.length > 0 ? conditions.map((c) => (
              <span key={c} className="text-xs bg-slate-100 border border-slate-200 rounded-md px-2 py-0.5 text-slate-600">{c}</span>
            )) : <p className="text-sm text-slate-400">—</p>}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1.5">Medications</p>
          <div className="flex flex-wrap gap-1.5">
            {medications.length > 0 ? medications.map((m) => (
              <span key={m} className="text-xs bg-slate-100 border border-slate-200 rounded-md px-2 py-0.5 text-slate-600">{m}</span>
            )) : <p className="text-sm text-slate-400">—</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Submit Tab ───────────────────────────────────────────────────────────────

function SubmitTab() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [details, setDetails] = useState<PatientDetail[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [procedure, setProcedure] = useState("");
  const [running, setRunning] = useState(false);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/patients`).then((r) => r.json()).then((d) => setPatients(d.patients ?? [])).catch(() => setPatients([]));
    fetch(`${API_URL}/api/reference/patients-detail`).then((r) => r.json()).then((d) => setDetails(d.patients ?? [])).catch(() => {});
  }, []);

  const selectedPatient = patients[selectedIdx];
  const selectedDetail = details.find((d) => d.patient_id === selectedPatient?.patient_id);

  const handleSubmit = async () => {
    if (!selectedPatient || !procedure.trim()) return;
    setRunning(true); setTrace([]); setResult(null); setError(null);

    try {
      const res = await fetch(`${API_URL}/api/submit/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_name: selectedPatient.name, procedure_request: procedure }),
      });
      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data:")) continue;
          try {
            const payload = JSON.parse(part.slice(5).trim());
            if (payload.type === "trace_step") setTrace((prev) => [...prev, payload.step as TraceStep]);
            else if (payload.type === "final") setResult(payload.state as RunResult);
            else if (payload.type === "error") setError(payload.message);
          } catch {}
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Form card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#3a5ba0]" /> New PA Request
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Patient</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3a5ba0]/40 focus:border-[#3a5ba0] shadow-sm transition-all"
              value={selectedIdx}
              onChange={(e) => setSelectedIdx(Number(e.target.value))}
              disabled={running}
            >
              {patients.map((p, i) => (
                <option key={p.patient_id} value={i}>
                  {p.name} — {p.insurer ?? "Unknown"} ({p.coverage_active ? "Active" : "Inactive"})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Procedure Request</label>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3a5ba0]/40 focus:border-[#3a5ba0] placeholder:text-slate-400 shadow-sm transition-all"
              placeholder="e.g. MRI of the lower back"
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              disabled={running}
            />
            <p className="text-xs text-slate-400">Try: MRI lumbar spine · total knee replacement · laparoscopic hysterectomy</p>
          </div>
        </div>
        <RippleButton
          onClick={handleSubmit}
          disabled={running || !procedure.trim() || patients.length === 0}
          size="md"
          className="w-full sm:w-auto"
        >
          {running ? (
            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Running workflow…</span>
          ) : (
            <span className="flex items-center gap-2"><Send className="w-4 h-4" /> Run Agentic Workflow</span>
          )}
        </RippleButton>
      </div>

      {/* Patient details */}
      {selectedPatient && (
        <PatientDetailsCard patient={selectedPatient} detail={selectedDetail} />
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {/* Agent trace */}
      {trace.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4" /> Agent Trace
          </h3>
          <AnimatePresence initial={false}>
            {trace.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <AgentTraceCard step={step} index={i} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Final result */}
      {result && <FinalBanner result={result} />}
    </div>
  );
}

// ─── Run Report Modal ─────────────────────────────────────────────────────────

function RunReportModal({ run, onClose }: { run: HistoryRun; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fields: { label: string; value: string }[] = [
    { label: "Patient", value: run.patient_name },
    { label: "Insurer", value: run.insurer },
    { label: "Plan", value: run.plan_name ?? "—" },
    { label: "Procedure", value: run.procedure_desc },
    { label: "Procedure Requested", value: run.procedure_desc },
    { label: "Retries", value: String(run.retry_count ?? 0) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.25 }}
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <StatusPill status={run.final_status} />
            <p className="font-semibold text-slate-800">{run.patient_name}</p>
            <span className="text-slate-400 text-sm">{run.created_at ? new Date(run.created_at).toLocaleDateString() : "—"}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fields.map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-lg px-3.5 py-3 border border-slate-100">
                <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                <p className="text-sm font-medium text-slate-800 truncate">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg px-3.5 py-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-0.5">CPT Code</p>
              <p className="text-sm font-mono font-bold text-[#3a5ba0]">{run.cpt_code || "—"}</p>
            </div>
            <div className="bg-slate-50 rounded-lg px-3.5 py-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-0.5">Primary ICD-10</p>
              <p className="text-sm font-mono font-bold text-[#3a5ba0]">{run.primary_icd10 || "—"}</p>
            </div>
          </div>
          {run.denial_code && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-semibold text-red-600 mb-1">Denial Code: {run.denial_code}</p>
              <p className="text-sm text-red-700">{run.denial_reason}</p>
            </div>
          )}
          {run.agent_trace && run.agent_trace.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Agent Trace</p>
              <div className="space-y-2">
                {run.agent_trace.map((step, i) => (
                  <AgentTraceCard key={i} step={step} index={i} />
                ))}
              </div>
            </div>
          )}
          {run.appeal_letter && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Appeal Letter
              </p>
              <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">{run.appeal_letter}</pre>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportRun, setReportRun] = useState<HistoryRun | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/history`)
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading history…
    </div>
  );

  if (runs.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <History className="w-10 h-10 mb-3 opacity-30" />
      <p className="font-medium">No runs yet — submit a PA request first.</p>
    </div>
  );

  const headers = ["Date", "Patient", "Insurer", "Plan", "Procedure", "CPT", "ICD-10", "Status", "Auth #", "Denial", "Retries", ""];

  return (
    <>
      {reportRun && <RunReportModal run={reportRun} onClose={() => setReportRun(null)} />}
      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr
                key={i}
                className="border-b border-slate-100 hover:bg-blue-50/40 transition-colors group"
              >
                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{r.patient_name}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.insurer}</td>
                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{r.plan_name ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">{r.procedure_desc}</td>
                <td className="px-4 py-3 font-mono font-bold text-[#3a5ba0] text-xs whitespace-nowrap">{r.cpt_code}</td>
                <td className="px-4 py-3 font-mono font-bold text-[#3a5ba0] text-xs whitespace-nowrap">{r.primary_icd10}</td>
                <td className="px-4 py-3 whitespace-nowrap"><StatusPill status={r.final_status} /></td>
                <td className="px-4 py-3 text-xs text-slate-400 font-mono whitespace-nowrap">{r.auth_number ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.denial_code ? (
                    <span className="inline-flex items-center rounded-full bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 text-xs font-semibold">{r.denial_code}</span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-slate-500 text-center text-xs">{r.retry_count ?? 0}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setReportRun(r)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#3a5ba0] hover:text-white hover:bg-[#3a5ba0] rounded-lg px-3 py-1.5 transition-all border border-[#3a5ba0]/30 whitespace-nowrap group-hover:border-[#3a5ba0]"
                  >
                    <Eye className="w-3.5 h-3.5" /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <span className="p-2 rounded-lg bg-[#3a5ba0]/10 text-[#3a5ba0]">{icon}</span>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-3xl font-black text-slate-900">{value}</p>
      {sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function AnalyticsTab() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/analytics`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading analytics…
    </div>
  );

  if (!data || data.total === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <BarChart3 className="w-10 h-10 mb-3 opacity-30" />
      <p className="font-medium">No data yet — run a few requests first.</p>
    </div>
  );

  const approvalRate = data.total ? Math.round((data.approved / data.total) * 100) : 0;
  const denialEntries = Object.entries(data.denial_breakdown).sort((a, b) => b[1] - a[1]);
  const maxDenial = Math.max(...denialEntries.map(([, v]) => v), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<FileText className="w-4 h-4" />} label="Total Requests" value={data.total} />
        <StatCard icon={<CheckCircle className="w-4 h-4" />} label="Approval Rate" value={`${approvalRate}%`} sub={`${data.approved} of ${data.total} approved`} />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Escalated" value={data.escalated} />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Avg Retries" value={data.avg_retries.toFixed(1)} />
      </div>
      {denialEntries.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-slate-700 mb-5">Denial Code Breakdown</p>
          <div className="space-y-4">
            {denialEntries.map(([code, count]) => (
              <div key={code}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-mono font-bold text-[#3a5ba0]">{code}</span>
                  <span className="font-semibold text-slate-600">{count}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[#3a5ba0] to-[#6ea3c1] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(count / maxDenial) * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reference Panel ──────────────────────────────────────────────────────────

function SidebarSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
      <input
        className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#3a5ba0]/30 focus:border-[#3a5ba0] placeholder:text-slate-400 transition-all shadow-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function InfoBanner({ badge, links, children }: { badge: string; links: { label: string; href: string }[]; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl bg-blue-50/60 border border-blue-100 px-4 py-3.5">
      <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="text-xs font-bold text-blue-700 bg-blue-100 rounded-full px-2.5 py-0.5 w-fit">{badge}</span>
        <p className="text-sm text-slate-600 leading-relaxed">{children}</p>
        {links.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-0.5">
            {links.map(({ label, href }) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> {label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PaRuleTable({ title, headers, rows, renderCell }: { title: string; headers: string[]; rows: [string, string][]; renderCell: (val: string, col: number) => React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{title}</p>
      <div className="rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(([a, b], i) => (
              <tr key={`${a}-${i}`} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2 align-top">{renderCell(a, 0)}</td>
                <td className="px-3 py-2 align-top">{renderCell(b, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReferencePanel({ tab }: { tab: SidebarTab }) {
  const [patients, setPatients] = useState<PatientDetail[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [icdCodes, setIcdCodes] = useState<IcdCode[]>([]);
  const [icdSearch, setIcdSearch] = useState("");
  const [icdTotal, setIcdTotal] = useState(0);
  const [icdMatched, setIcdMatched] = useState<number | null>(null);
  const [icdLoading, setIcdLoading] = useState(false);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [procSearch, setProcSearch] = useState("");
  const [paRules, setPaRules] = useState<PaRules | null>(null);
  const icdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tab === "patients") fetch(`${API_URL}/api/reference/patients-detail`).then((r) => r.json()).then((d) => setPatients(d.patients ?? [])).catch(() => {});
    if (tab === "icd10") {
      setIcdLoading(true);
      fetch(`${API_URL}/api/reference/icd10?limit=200`).then((r) => r.json()).then((d) => { setIcdCodes(d.codes ?? []); setIcdTotal(d.total ?? 0); }).finally(() => setIcdLoading(false));
    }
    if (tab === "hcpcs") fetch(`${API_URL}/api/reference/procedures`).then((r) => r.json()).then((d) => setProcedures(d.procedures ?? [])).catch(() => {});
    if (tab === "pa-rules") fetch(`${API_URL}/api/reference/pa-rules`).then((r) => r.json()).then((d) => setPaRules(d ?? null)).catch(() => {});
  }, [tab]);

  const fetchIcd = useCallback((q: string) => {
    setIcdLoading(true);
    const url = q.trim() ? `${API_URL}/api/reference/icd10?q=${encodeURIComponent(q)}&limit=200` : `${API_URL}/api/reference/icd10?limit=200`;
    fetch(url).then((r) => r.json()).then((d) => {
      setIcdCodes(d.codes ?? []);
      if (q.trim()) setIcdMatched(d.total ?? 0);
      else { setIcdMatched(null); setIcdTotal(d.total ?? 0); }
    }).finally(() => setIcdLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "icd10") return;
    if (icdRef.current) clearTimeout(icdRef.current);
    icdRef.current = setTimeout(() => fetchIcd(icdSearch), 350);
    return () => { if (icdRef.current) clearTimeout(icdRef.current); };
  }, [icdSearch, tab, fetchIcd]);

  const filteredPatients = patients.filter((p) => {
    const q = patientSearch.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.insurer.toLowerCase().includes(q) || p.conditions.toLowerCase().includes(q);
  });
  const filteredProcs = procedures.filter((p) => {
    const q = procSearch.toLowerCase();
    return !q || p.code.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });

  const tableRow = "px-3 py-2 text-xs text-slate-600";
  const monoCell = "font-mono font-bold text-[#3a5ba0]";

  if (tab === "patients") return (
    <div className="flex flex-col gap-3 h-full">
      <InfoBanner badge="Synthetic Patients" links={[{ label: "Synthea Synthetic Patient Generator", href: "https://synthetichealth.github.io/synthea/" }]}>
        All 24 patient records are fully <strong>synthetic</strong> — generated in <strong>HL7 FHIR R4</strong> format. Zero PHI exposure.
      </InfoBanner>
      <SidebarSearch value={patientSearch} onChange={setPatientSearch} placeholder="Search name, insurer, condition…" />
      <p className="text-xs text-slate-400">{filteredPatients.length} of {patients.length} patients</p>
      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 shadow-sm">
        <table className="text-xs border-collapse w-full">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              {["Name", "DOB", "Sex", "Insurer", "Member ID", "Plan", "Active", "Conditions (ICD-10)", "Medications"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap border-b border-slate-200">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPatients.map((p) => (
              <tr key={p.patient_id} className="hover:bg-blue-50/40 transition-colors">
                <td className={`${tableRow} font-semibold text-slate-800 whitespace-nowrap`}>{p.name}</td>
                <td className={`${tableRow} whitespace-nowrap`}>{p.dob}</td>
                <td className={tableRow}>{p.gender}</td>
                <td className={`${tableRow} whitespace-nowrap`}>{p.insurer}</td>
                <td className={`${tableRow} font-mono`}>{p.member_id}</td>
                <td className={`${tableRow} whitespace-nowrap`}>{p.plan_type}</td>
                <td className={tableRow}>
                  <span className={`rounded-full px-2 py-0.5 font-semibold text-[10px] ${p.coverage_active === "True" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                    {p.coverage_active === "True" ? "Yes" : "No"}
                  </span>
                </td>
                <td className={`${tableRow} max-w-[220px]`}>
                  <div className="flex flex-wrap gap-1">
                    {p.conditions.split("|").filter(Boolean).slice(0, 3).map((c) => (
                      <span key={c} className="bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] text-slate-600">{c.trim()}</span>
                    ))}
                  </div>
                </td>
                <td className={`${tableRow} max-w-[180px]`}>
                  <div className="flex flex-wrap gap-1">
                    {p.medications.split(";").filter(Boolean).slice(0, 2).map((m) => (
                      <span key={m} className="bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] text-slate-600">{m.trim()}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (tab === "icd10") return (
    <div className="flex flex-col gap-3 h-full">
      <InfoBanner badge="ICD-10-CM FY2024" links={[{ label: "CMS FY2024 Code Files", href: "https://www.cms.gov/medicare/coding-billing/icd-10-codes/2024-icd-10-cm" }]}>
        <strong>74,044 ICD-10-CM codes</strong> for FY2024. Loaded from the official CMS tabular list.
      </InfoBanner>
      <SidebarSearch value={icdSearch} onChange={setIcdSearch} placeholder="Search code or description…" />
      <p className="text-xs text-slate-400">
        {icdMatched !== null ? `${icdMatched.toLocaleString()} match${icdMatched === 1 ? "" : "es"} · showing ${icdCodes.length.toLocaleString()}` : `Showing ${icdCodes.length.toLocaleString()} of ${icdTotal.toLocaleString()} codes`}
      </p>
      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 shadow-sm relative">
        {icdLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-20 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-1" /> Loading…
          </div>
        )}
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200 w-20">Code</th>
              <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {icdCodes.map((c) => (
              <tr key={c.code} className="hover:bg-blue-50/40 transition-colors">
                <td className={`px-3 py-2 ${monoCell} whitespace-nowrap align-top`}>{c.code}</td>
                <td className="px-3 py-2 text-slate-600">{c.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (tab === "hcpcs") return (
    <div className="flex flex-col gap-3 h-full">
      <InfoBanner badge="CPT / HCPCS Codes" links={[{ label: "CMS HCPCS Files", href: "https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system" }]}>
        <strong>CPT Level I</strong> (5-digit codes for physician services) and <strong>HCPCS Level II</strong> (letter-prefixed CMS codes for drugs and equipment).
      </InfoBanner>
      <SidebarSearch value={procSearch} onChange={setProcSearch} placeholder="Search code, description, category…" />
      <p className="text-xs text-slate-400">{filteredProcs.length} of {procedures.length} procedures</p>
      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 shadow-sm">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              {["Code", "Description", "Category", "Modifiers"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProcs.map((p) => (
              <tr key={p.code} className="hover:bg-blue-50/40 transition-colors">
                <td className={`px-3 py-2 ${monoCell} whitespace-nowrap align-top`}>{p.code}</td>
                <td className="px-3 py-2 text-slate-600">{p.description}</td>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{p.category}</td>
                <td className={`px-3 py-2 font-mono text-slate-500`}>{p.typical_modifiers || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (tab === "pa-rules") return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      <InfoBanner badge="PA Rules (CMS 2024)" links={[{ label: "CMS Prior Auth Final Rule", href: "https://www.cms.gov/regulations-guidance/legislation/paperwork-reduction-act-of-1995/pra-listing/cms-0057-f" }]}>
        Rules for which procedure categories require prior authorization, based on CMS 2024 guidance and plan-specific overrides.
      </InfoBanner>
      {paRules ? (
        <div className="space-y-5">
          <PaRuleTable title="Categories Requiring PA" headers={["Category", "Note"]} rows={(paRules.pa_required_categories ?? []).map((c) => [c, "PA required"])} renderCell={(val, col) => col === 0 ? <span className="font-semibold text-slate-700">{val}</span> : <span className="text-slate-500">{val}</span>} />
          <PaRuleTable title="No PA Required" headers={["Category", "Note"]} rows={(paRules.no_pa_categories ?? []).map((c) => [c, "No PA needed"])} renderCell={(val, col) => col === 0 ? <span className="font-semibold text-slate-700">{val}</span> : <span className="text-emerald-600 font-medium">{val}</span>} />
          {Object.keys(paRules.plan_overrides ?? {}).length > 0 && (
            <PaRuleTable title="Plan-Specific Overrides" headers={["Plan", "Override"]} rows={Object.entries(paRules.plan_overrides ?? {}).map(([k, v]) => [k, v._note ?? JSON.stringify(v.additional_pa_categories)])} renderCell={(val, col) => col === 0 ? <span className={`font-mono text-xs font-bold text-[#3a5ba0]`}>{val}</span> : <span className="text-slate-500 text-xs">{val}</span>} />
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading rules…</div>
      )}
    </div>
  );

  return null;
}

// ─── Reference Sub-Tabs ───────────────────────────────────────────────────────

const TAB_CONTENT: {
  id: SidebarTab;
  label: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}[] = [
  { id: "patients", label: "Patients", icon: <Users className="w-4 h-4" />, content: <ReferencePanel tab="patients" /> },
  { id: "icd10", label: "ICD-10 Codes", icon: <BookOpen className="w-4 h-4" />, content: <ReferencePanel tab="icd10" /> },
  { id: "hcpcs", label: "HCPCS / CPT", icon: <Stethoscope className="w-4 h-4" />, content: <ReferencePanel tab="hcpcs" /> },
  { id: "pa-rules", label: "PA Rules", icon: <ShieldCheck className="w-4 h-4" />, content: <ReferencePanel tab="pa-rules" /> },
];

function ReferenceView() {
  return (
    <div className="flex-1 min-h-0">
      <FolderTabs tabs={TAB_CONTENT} defaultTab="patients" />
    </div>
  );
}

// ─── Main App Page ────────────────────────────────────────────────────────────

export default function AppPage() {
  const [view, setView] = useState<string>("submit");

  const navTabs = [
    { id: "submit", label: "Submit PA" },
    { id: "history", label: "History" },
    { id: "analytics", label: "Analytics" },
    { id: "reference", label: "Reference Data" },
  ];

  return (
    <div className="h-screen bg-[#f8fafc] text-slate-900 flex flex-col overflow-hidden">
      {/* ── Top Nav ── */}
      <header className="bg-gradient-to-r from-[#3a5ba0] via-[#4a6fb5] to-[#6ea3c1] border-b border-[#3a5ba0]/30 shadow-sm sticky top-0 z-20">
        <div className="relative px-6 py-5 flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white shadow-sm shrink-0">
            <Heart className="w-7 h-7 text-[#3a5ba0]" />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 text-center min-w-0 px-4 pointer-events-none">
            <h1 className="text-2xl font-bold text-white truncate">Prior Authorization Workflow Automation</h1>
            <p className="text-sm text-blue-100">Agentic workflow</p>
          </div>
          <div className="flex-1" />
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-blue-100 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/10"
          >
            <Home className="w-4 h-4" /> About
          </Link>
          <Badge variant="success">Live</Badge>
        </div>
      </header>

      {/* ── Nav Bar ── */}
      <div className="shrink-0 flex justify-center px-5 py-4 border-b border-slate-200 bg-white/60">
        <NavHeader tabs={navTabs} activeTab={view} onTabChange={setView} />
      </div>

      {/* ── Body ── */}
      <main className="flex-1 min-h-0 px-6 py-5 flex flex-col overflow-hidden">
        {view === "reference" ? (
          <ReferenceView />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto rounded-3xl bg-slate-200 p-5 shadow-sm">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {view === "submit" && <SubmitTab />}
                {view === "history" && <HistoryTab />}
                {view === "analytics" && <AnalyticsTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>

      <ChatBot />
    </div>
  );
}
