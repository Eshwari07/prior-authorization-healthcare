"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Ban,
  BookOpen,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  Heart,
  History,
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
import { AgentTraceCard } from "@/components/AgentTraceCard";
import { ChatBot } from "@/components/ChatBot";
import { Badge } from "@/components/ui/badge";
import { API_URL } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface IcdCode {
  code: string;
  description: string;
}

interface PatientDetail {
  patient_id: string;
  name: string;
  dob: string;
  gender: string;
  insurer: string;
  member_id: string;
  plan_type: string;
  plan_name: string;
  coverage_active: string;
  coverage_start: string;
  coverage_end: string;
  conditions: string;
  medications: string;
  source_file: string;
}

interface Procedure {
  code: string;
  description: string;
  category: string;
  typical_modifiers: string;
}

interface PaRules {
  pa_required_categories?: string[];
  no_pa_categories?: string[];
  plan_overrides?: Record<string, { additional_pa_categories?: string[]; _note?: string }>;
  non_covered_examples?: Record<string, string[]>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle className="w-5 h-5 text-green-600" />;
  if (status === "ineligible") return <Ban className="w-5 h-5 text-red-600" />;
  if (status === "escalated") return <AlertTriangle className="w-5 h-5 text-amber-500" />;
  if (status === "denied") return <XCircle className="w-5 h-5 text-red-600" />;
  return <Activity className="w-5 h-5 text-blue-600" />;
}

function FinalBanner({ result }: { result: RunResult }) {
  if (result.final_status === "approved") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
        <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
        <div>
          <p className="text-green-800 font-semibold">Authorization Approved</p>
          <p className="text-green-700 text-sm">
            Auth #{result.final_auth_number}
            {result.retry_count > 0 && ` — approved after ${result.retry_count} retr${result.retry_count === 1 ? "y" : "ies"}`}
          </p>
        </div>
      </div>
    );
  }
  if (result.final_status === "ineligible") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
        <Ban className="w-5 h-5 text-red-600 shrink-0" />
        <p className="text-red-800 font-semibold">Not Eligible — see eligibility reasoning above</p>
      </div>
    );
  }
  if (result.final_status === "escalated") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-amber-800 font-semibold">Escalated to Human Review</p>
        </div>
        {result.appeal_letter && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Appeal Letter
            </p>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
              {result.appeal_letter}
            </pre>
          </div>
        )}
      </div>
    );
  }
  return null;
}

// ─── Patient Details Card ─────────────────────────────────────────────────────

function PatientDetailsCard({ patient, detail }: { patient: Patient; detail?: PatientDetail }) {
  const isActive = detail ? detail.coverage_active === "True" : !!patient.coverage_active;
  const conditions = (detail?.conditions ?? "")
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
  const medications = (detail?.medications ?? "")
    .split(";")
    .map((m) => m.trim())
    .filter(Boolean);

  const fields: { label: string; value: string }[] = [
    { label: "Date of Birth", value: detail?.dob || patient.dob || "—" },
    { label: "Sex", value: detail?.gender || "—" },
    { label: "Insurer", value: detail?.insurer || patient.insurer || "—" },
    { label: "Member ID", value: detail?.member_id || "—" },
    { label: "Plan", value: detail?.plan_name || patient.plan_name || "—" },
    { label: "Plan Type", value: detail?.plan_type || "—" },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-100">
            <Users className="w-4 h-4 text-blue-600" />
          </span>
          <p className="text-sm font-semibold text-gray-900">{patient.name}</p>
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            isActive
              ? "bg-green-100 text-green-700 border-green-200"
              : "bg-red-100 text-red-700 border-red-200"
          }`}
        >
          {isActive ? "Coverage Active" : "Coverage Inactive"}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
            <p className="text-sm font-medium text-gray-800 capitalize">{value}</p>
          </div>
        ))}
        {detail && (detail.coverage_start || detail.coverage_end) && (
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Coverage Period</p>
            <p className="text-sm font-medium text-gray-800">
              {detail.coverage_start || "—"} → {detail.coverage_end || "—"}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Conditions (ICD-10)</p>
          {conditions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {conditions.map((c) => (
                <span key={c} className="text-[11px] bg-white border border-gray-200 rounded-md px-2 py-0.5 text-gray-700">
                  {c}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">—</p>
          )}
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Medications</p>
          {medications.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {medications.map((m) => (
                <span key={m} className="text-[11px] bg-white border border-gray-200 rounded-md px-2 py-0.5 text-gray-700">
                  {m}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">—</p>
          )}
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
    fetch(`${API_URL}/api/patients`)
      .then((r) => r.json())
      .then((d) => setPatients(d.patients ?? []))
      .catch(() => setPatients([]));
    fetch(`${API_URL}/api/reference/patients-detail`)
      .then((r) => r.json())
      .then((d) => setDetails(d.patients ?? []))
      .catch(() => setDetails([]));
  }, []);

  const handleSubmit = async () => {
    if (!procedure.trim() || patients.length === 0) return;
    setRunning(true);
    setTrace([]);
    setResult(null);
    setError(null);

    const patient = patients[selectedIdx];

    try {
      const res = await fetch(`${API_URL}/api/submit/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_name: patient.name, procedure_request: procedure }),
      });

      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.type === "trace_step") {
              setTrace((prev) => [...prev, payload.step]);
            } else if (payload.type === "final") {
              setResult(payload.state);
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  };

  const selectedPatient = patients[selectedIdx];
  const selectedDetail = selectedPatient
    ? details.find((d) => d.patient_id === selectedPatient.patient_id)
    : undefined;

  return (
    <div className="space-y-6">
      {/* Step 1 — pick a patient */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Patient</label>
        <select
          className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          value={selectedIdx}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
          disabled={running}
        >
          {patients.map((p, i) => (
            <option key={p.patient_id} value={i}>
              {p.name} — {p.plan_name ?? p.insurer ?? "Unknown plan"}
            </option>
          ))}
        </select>
      </div>

      {/* Patient details — auto-populated from the selected patient */}
      {selectedPatient && <PatientDetailsCard patient={selectedPatient} detail={selectedDetail} />}

      {/* Step 2 — enter the procedure request */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Procedure Request</label>
        <input
          className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 shadow-sm"
          placeholder="e.g. MRI of the lower back"
          value={procedure}
          onChange={(e) => setProcedure(e.target.value)}
          disabled={running}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <p className="text-xs text-gray-400 mt-1">
          Try: MRI lumbar spine · total knee replacement · laparoscopic hysterectomy
        </p>
      </div>

      <button
        onClick={handleSubmit}
        disabled={running || !procedure.trim() || patients.length === 0}
        className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium px-6 py-2.5 text-sm transition-colors shadow-sm"
      >
        {running ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Running workflow…</>
        ) : (
          <><Send className="w-4 h-4" /> Run Agentic Workflow</>
        )}
      </button>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {trace.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Agent Trace</p>
          {trace.map((step, i) => (
            <AgentTraceCard key={i} step={step} index={i} />
          ))}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Result</p>
          <FinalBanner result={result} />
        </div>
      )}
    </div>
  );
}

// ─── Run Report Modal ─────────────────────────────────────────────────────────

function RunReportModal({ run, onClose }: { run: HistoryRun; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-gray-200">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">PA Run Report</h2>
              <p className="text-xs text-gray-500">
                {run.created_at ? new Date(run.created_at).toLocaleString() : "—"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Patient Info */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Patient Information</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Name", value: run.patient_name },
                { label: "Insurer", value: run.insurer },
                { label: "Plan", value: run.plan_name ?? "—" },
                { label: "Member ID", value: run.patient_id ?? "—" },
                { label: "Procedure Requested", value: run.procedure_desc },
                { label: "Retries", value: String(run.retry_count ?? 0) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                  <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                  <p className="text-sm font-medium text-gray-800 truncate">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Coding Result */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Coding Result</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-blue-50 rounded-lg px-3 py-2.5 border border-blue-100">
                <p className="text-xs text-blue-500 mb-0.5">CPT / HCPCS</p>
                <p className="text-sm font-mono font-bold text-blue-700">{run.cpt_code || "—"}</p>
              </div>
              <div className="bg-blue-50 rounded-lg px-3 py-2.5 border border-blue-100">
                <p className="text-xs text-blue-500 mb-0.5">Primary ICD-10</p>
                <p className="text-sm font-mono font-bold text-blue-700">{run.primary_icd10 || "—"}</p>
              </div>
              {run.secondary_icd10 && run.secondary_icd10.length > 0 && (
                <div className="bg-blue-50 rounded-lg px-3 py-2.5 border border-blue-100 col-span-2 sm:col-span-1">
                  <p className="text-xs text-blue-500 mb-0.5">Secondary ICD-10</p>
                  <p className="text-sm font-mono text-blue-700">{run.secondary_icd10.join(", ")}</p>
                </div>
              )}
            </div>
          </section>

          {/* Outcome */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Submission Outcome</h3>
            <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${run.final_status === "approved" ? "bg-green-50 border-green-200" : run.final_status === "escalated" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
              <StatusIcon status={run.final_status} />
              <div>
                <p className="font-semibold text-gray-800 capitalize">{run.final_status}</p>
                {run.auth_number && (
                  <p className="text-sm text-gray-600">Auth# {run.auth_number}</p>
                )}
                {run.denial_code && (
                  <p className="text-sm text-red-700">
                    {run.denial_code} — {run.denial_reason}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Appeal Letter */}
          {run.appeal_letter && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Appeal Letter</h3>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {run.appeal_letter}
                </pre>
              </div>
            </section>
          )}

          {/* Agent Trace */}
          {run.agent_trace && run.agent_trace.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Agent Trace</h3>
              <div className="space-y-2">
                {run.agent_trace.map((step, i) => (
                  <AgentTraceCard key={i} step={step} index={i} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
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
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading history…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <History className="w-10 h-10 mb-3 opacity-30" />
        <p>No PA requests recorded yet.</p>
      </div>
    );
  }

  const headers = ["Date", "Patient", "Insurer", "Plan", "Procedure", "CPT", "Primary ICD-10", "Status", "Auth #", "Denial", "Retries", "Report"];

  return (
    <>
      {reportRun && <RunReportModal run={reportRun} onClose={() => setReportRun(null)} />}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {runs.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-gray-900 font-medium whitespace-nowrap">{r.patient_name}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.insurer}</td>
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{r.plan_name ?? "—"}</td>
                <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{r.procedure_desc}</td>
                <td className="px-4 py-3 font-mono text-blue-700 text-xs font-semibold whitespace-nowrap">{r.cpt_code}</td>
                <td className="px-4 py-3 font-mono text-blue-700 text-xs font-semibold whitespace-nowrap">{r.primary_icd10}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={r.final_status} />
                    <span className="capitalize text-gray-700 text-xs font-medium">{r.final_status}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">{r.auth_number ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.denial_code ? (
                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 text-xs font-semibold">
                      {r.denial_code}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-gray-500 text-center text-xs">{r.retry_count ?? 0}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setReportRun(r)}
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg px-2.5 py-1.5 transition-colors border border-blue-200 whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" /> View Report
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

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-blue-600">{icon}</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
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
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading analytics…
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <BarChart3 className="w-10 h-10 mb-3 opacity-30" />
        <p>No data yet — run a few requests first.</p>
      </div>
    );
  }

  const approvalRate = data.total ? Math.round((data.approved / data.total) * 100) : 0;
  const denialEntries = Object.entries(data.denial_breakdown).sort((a, b) => b[1] - a[1]);
  const maxDenial = Math.max(...denialEntries.map(([, v]) => v), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<FileText className="w-4 h-4" />} label="Total Requests" value={data.total} />
        <StatCard
          icon={<CheckCircle className="w-4 h-4" />}
          label="Approval Rate"
          value={`${approvalRate}%`}
          sub={`${data.approved} of ${data.total} approved`}
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Escalated"
          value={data.escalated}
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Avg Retries"
          value={data.avg_retries.toFixed(1)}
        />
      </div>

      {denialEntries.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-4">Denial Code Breakdown</p>
          <div className="space-y-3">
            {denialEntries.map(([code, count]) => (
              <div key={code} className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span className="font-mono font-semibold text-blue-700">{code}</span>
                  <span>{count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${(count / maxDenial) * 100}%` }}
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

// ─── Reference Data Panel (rendered in the main content area) ──────────────────

type SidebarTab = "patients" | "icd10" | "hcpcs" | "parules";

const REF_TABS: { id: SidebarTab; label: string; icon: React.ReactNode }[] = [
  { id: "patients", label: "Patients", icon: <Users className="w-4 h-4" /> },
  { id: "icd10", label: "ICD-10 Codes", icon: <BookOpen className="w-4 h-4" /> },
  { id: "hcpcs", label: "HCPCS Codes", icon: <Stethoscope className="w-4 h-4" /> },
  { id: "parules", label: "PA Requirements", icon: <ShieldCheck className="w-4 h-4" /> },
];

const REF_IDS: SidebarTab[] = ["patients", "icd10", "hcpcs", "parules"];

function ReferencePanel({ tab }: { tab: SidebarTab }) {
  const [patients, setPatients] = useState<PatientDetail[]>([]);
  const [patientSearch, setPatientSearch] = useState("");

  const [icdSearch, setIcdSearch] = useState("");
  const [icdCodes, setIcdCodes] = useState<IcdCode[]>([]);
  const [icdTotal, setIcdTotal] = useState(0);
  const [icdMatched, setIcdMatched] = useState(0);
  const [icdLoading, setIcdLoading] = useState(false);
  const icdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [procSearch, setProcSearch] = useState("");

  const [paRules, setPaRules] = useState<PaRules | null>(null);

  // Initial loads
  useEffect(() => {
    fetch(`${API_URL}/api/reference/patients-detail`)
      .then((r) => r.json())
      .then((d) => setPatients(d.patients ?? []))
      .catch(() => {});
    fetch(`${API_URL}/api/reference/procedures`)
      .then((r) => r.json())
      .then((d) => setProcedures(d.procedures ?? []))
      .catch(() => {});
    fetch(`${API_URL}/api/reference/pa-rules`)
      .then((r) => r.json())
      .then(setPaRules)
      .catch(() => {});
  }, []);

  // ICD-10: load the first page on mount, then re-query on search (debounced)
  const fetchIcd = useCallback((term: string) => {
    setIcdLoading(true);
    fetch(`${API_URL}/api/reference/icd10?q=${encodeURIComponent(term)}`)
      .then((r) => r.json())
      .then((d) => {
        setIcdCodes(d.codes ?? []);
        setIcdTotal(d.total ?? 0);
        setIcdMatched(d.matched ?? (d.codes?.length ?? 0));
      })
      .catch(() => {
        setIcdCodes([]);
        setIcdTotal(0);
        setIcdMatched(0);
      })
      .finally(() => setIcdLoading(false));
  }, []);

  useEffect(() => { fetchIcd(""); }, [fetchIcd]);

  const onIcdSearch = (term: string) => {
    setIcdSearch(term);
    if (icdTimer.current) clearTimeout(icdTimer.current);
    icdTimer.current = setTimeout(() => fetchIcd(term), 300);
  };

  const filteredPatients = patients.filter((p) => {
    const q = patientSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.insurer.toLowerCase().includes(q) ||
      p.conditions.toLowerCase().includes(q) ||
      p.plan_name.toLowerCase().includes(q)
    );
  });

  const filteredProcs = procedures.filter((p) => {
    const q = procSearch.toLowerCase();
    return (
      p.code.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  const activeMeta = REF_TABS.find((t) => t.id === tab);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <span className="text-blue-600">{activeMeta?.icon}</span>
        <h2 className="text-lg font-bold text-gray-900">{activeMeta?.label}</h2>
      </div>

      {/* Data content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">

        {/* ── Patients tab ── */}
        {tab === "patients" && (
          <>
            <InfoBanner
              badge="Synthetic Data · No HIPAA Risk"
              links={[
                { label: "Synthea™ by MITRE", href: "https://synthea.mitre.org/" },
                { label: "Sample Data on GitHub", href: "https://github.com/synthetichealth/synthea-sample-data" },
              ]}
            >
              All 24 patient records are fully <strong>synthetic</strong> — generated in <strong>HL7 FHIR R4</strong> format
              to simulate realistic insurance coverage, diagnoses, and medications without using any real patient
              information. There is zero PHI exposure and no HIPAA concerns. Plan types, coverage status, and conditions
              were hand-crafted to cover a range of PA scenarios (active &amp; cancelled coverage, HMO/PPO/Medicare plans).
            </InfoBanner>
            <SidebarSearch value={patientSearch} onChange={setPatientSearch} placeholder="Search name, insurer, condition…" />
            <p className="text-[10px] text-gray-400">{filteredPatients.length} of {patients.length} patients</p>
            <div className="flex-1 overflow-auto rounded-lg border border-gray-200">
              <table className="text-[11px] border-collapse">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr>
                    {["Name", "DOB", "Sex", "Insurer", "Member ID", "Plan", "Active", "Conditions (ICD-10)", "Medications"].map((h) => (
                      <th key={h} className="px-2.5 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPatients.map((p) => (
                    <tr key={p.patient_id} className="hover:bg-blue-50/40">
                      <td className="px-2.5 py-2 font-medium text-gray-900 whitespace-nowrap">{p.name}</td>
                      <td className="px-2.5 py-2 text-gray-500 whitespace-nowrap">{p.dob}</td>
                      <td className="px-2.5 py-2 text-gray-500 capitalize">{p.gender}</td>
                      <td className="px-2.5 py-2 text-gray-600 whitespace-nowrap">{p.insurer}</td>
                      <td className="px-2.5 py-2 font-mono text-gray-500 whitespace-nowrap">{p.member_id}</td>
                      <td className="px-2.5 py-2 text-gray-600 whitespace-nowrap">{p.plan_name}</td>
                      <td className="px-2.5 py-2">
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${p.coverage_active === "True" ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                          {p.coverage_active === "True" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 text-gray-700 min-w-[200px]">{p.conditions || "—"}</td>
                      <td className="px-2.5 py-2 text-gray-500 min-w-[120px]">{p.medications || "—"}</td>
                    </tr>
                  ))}
                  {filteredPatients.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">No patients found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── ICD-10 tab ── */}
        {tab === "icd10" && (
          <>
            <InfoBanner
              badge="CMS FY 2024 · 74,044 codes"
              links={[
                { label: "CMS ICD-10-CM FY2024 Downloads", href: "https://www.cms.gov/medicare/coding-billing/icd-10-codes" },
              ]}
            >
              <strong>ICD-10-CM</strong> (International Classification of Diseases, 10th Revision, Clinical Modification)
              is the standard US diagnosis coding system. Every insurance claim must include ICD-10 codes to prove{" "}
              <strong>medical necessity</strong> — vague codes like &#34;back pain&#34; (R52) cause PA denials, while
              specific codes like <em>M51.16 — Intervertebral disc degeneration, lumbar region</em> are required for
              advanced procedures. This is the <strong>official CMS FY 2024 release</strong> of all 74,044 billable
              diagnosis codes.
            </InfoBanner>
            <SidebarSearch value={icdSearch} onChange={onIcdSearch} placeholder="Search ICD-10 code or description…" />
            <p className="text-[10px] text-gray-400">
              {icdSearch
                ? `${icdMatched.toLocaleString()} match${icdMatched === 1 ? "" : "es"} · showing ${icdCodes.length.toLocaleString()}`
                : `Showing ${icdCodes.length.toLocaleString()} of ${icdTotal.toLocaleString()} codes · search to narrow`}
            </p>
            <div className="flex-1 overflow-auto rounded-lg border border-gray-200 relative">
              {icdLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-20 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-1" /> Loading…
                </div>
              )}
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr>
                    <th className="px-2.5 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 w-20">Code</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {icdCodes.map((c) => (
                    <tr key={c.code} className="hover:bg-blue-50/40">
                      <td className="px-2.5 py-2 font-mono font-bold text-blue-700 whitespace-nowrap align-top">{c.code}</td>
                      <td className="px-2.5 py-2 text-gray-700">{c.description}</td>
                    </tr>
                  ))}
                  {!icdLoading && icdCodes.length === 0 && (
                    <tr><td colSpan={2} className="px-3 py-6 text-center text-gray-400">No codes found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── HCPCS tab ── */}
        {tab === "hcpcs" && (
          <>
            <InfoBanner
              badge="CPT + HCPCS Level II · 61 curated codes"
              links={[
                { label: "AMA CPT Code Set", href: "https://www.ama-assn.org/practice-management/cpt" },
                { label: "CMS HCPCS Level II", href: "https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system" },
              ]}
            >
              Two code sets cover every billable procedure: <strong>CPT</strong> (5-digit AMA codes, e.g.{" "}
              <code className="text-[10px] bg-white border border-gray-200 rounded px-1">72148</code> — MRI lumbar spine)
              for physician services and surgeries; <strong>HCPCS Level II</strong> (letter-prefixed CMS codes, e.g.{" "}
              <code className="text-[10px] bg-white border border-gray-200 rounded px-1">J0178</code> — Aflibercept,{" "}
              <code className="text-[10px] bg-white border border-gray-200 rounded px-1">E0601</code> — CPAP device) for
              drugs and durable medical equipment. PA submissions must include the exact code and required laterality
              modifiers (LT/RT) — missing or incorrect codes are the <strong>#1 cause of claim denials</strong>.
            </InfoBanner>
            <SidebarSearch value={procSearch} onChange={setProcSearch} placeholder="Search code, description, category…" />
            <p className="text-[10px] text-gray-400">{filteredProcs.length} of {procedures.length} procedures</p>
            <div className="flex-1 overflow-auto rounded-lg border border-gray-200">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr>
                    {["Code", "Description", "Category", "Modifiers"].map((h) => (
                      <th key={h} className="px-2.5 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProcs.map((p) => (
                    <tr key={p.code} className="hover:bg-blue-50/40">
                      <td className="px-2.5 py-2 font-mono font-bold text-blue-700 whitespace-nowrap align-top">{p.code}</td>
                      <td className="px-2.5 py-2 text-gray-700">{p.description}</td>
                      <td className="px-2.5 py-2 text-gray-500 whitespace-nowrap">{p.category}</td>
                      <td className="px-2.5 py-2 text-amber-700 font-mono whitespace-nowrap">{p.typical_modifiers || "—"}</td>
                    </tr>
                  ))}
                  {filteredProcs.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No procedures found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── PA Rules tab ── */}
        {tab === "parules" && paRules && (
          <div className="flex-1 overflow-auto space-y-4 pr-1">
            <InfoBanner
              badge="Representative Rules · Not Insurer-Specific"
              links={[
                { label: "AMA — Prior Authorization Resources", href: "https://www.ama-assn.org/practice-management/prior-authorization" },
              ]}
            >
              <strong>Prior Authorization (PA)</strong> is the insurer&#39;s pre-approval process required before
              certain services are performed. Insurers mandate PA for high-cost or high-variability procedures —
              advanced imaging (MRI/CT), elective surgeries, specialty drug infusions, and durable medical equipment —
              to verify <strong>medical necessity</strong> before the service is rendered. Without it, claims are
              automatically denied. Rules here are <strong>modeled on publicly documented commercial payer guidelines</strong>{" "}
              (Aetna, Cigna, UHC, BCBS) and vary by plan type (HMO, PPO, EPO, POS). Actual payer requirements are
              proprietary — these rules are representative, not prescriptive.
            </InfoBanner>
            <PaRuleTable
              title="Category PA Requirements"
              headers={["Procedure Category", "Prior Auth?"]}
              rows={[
                ...(paRules.pa_required_categories ?? []).map((c) => [c, "Required"] as [string, string]),
                ...(paRules.no_pa_categories ?? []).map((c) => [c, "Not Required"] as [string, string]),
              ]}
              renderCell={(val, col) =>
                col === 1 ? (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${val === "Required" ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`}>{val}</span>
                ) : (
                  <span className="text-gray-700">{val}</span>
                )
              }
            />

            <PaRuleTable
              title="Plan Overrides (Additional PA Categories)"
              headers={["Plan Type", "Additional PA Categories"]}
              rows={Object.entries(paRules.plan_overrides ?? {})
                .filter(([k]) => !k.startsWith("_"))
                .map(([plan, val]) => [plan, (val.additional_pa_categories ?? []).join(", ") || "None"] as [string, string])}
              renderCell={(val, col) =>
                col === 0 ? <span className="font-semibold text-gray-700">{val}</span> : <span className="text-amber-700">{val}</span>
              }
            />

            <PaRuleTable
              title="Non-Covered Codes by Insurer"
              headers={["Insurer", "Excluded CPT/HCPCS"]}
              rows={Object.entries(paRules.non_covered_examples ?? {})
                .filter(([k]) => !k.startsWith("_"))
                .map(([insurer, codes]) => [insurer, (codes as string[]).join(", ")] as [string, string])}
              renderCell={(val, col) =>
                col === 0 ? <span className="font-semibold text-gray-700">{val}</span> : <span className="font-mono text-red-700">{val}</span>
              }
            />
          </div>
        )}
        {tab === "parules" && !paRules && (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Info Banner ─────────────────────────────────────────────────────────────

function InfoBanner({
  badge,
  links,
  children,
}: {
  badge: string;
  links: { label: string; href: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-lg bg-blue-50 border border-blue-100 px-3.5 py-3 shrink-0">
      <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 border border-blue-200 rounded-full px-2 py-0.5 w-fit">
          {badge}
        </span>
        <p className="text-[11px] text-gray-600 leading-relaxed">{children}</p>
        {links.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
            {links.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-blue-600 hover:text-blue-800 underline underline-offset-2 flex items-center gap-0.5"
              >
                {label}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative shrink-0">
      <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
      <input
        className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-gray-400"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function PaRuleTable({
  title,
  headers,
  rows,
  renderCell,
}: {
  title: string;
  headers: string[];
  rows: [string, string][];
  renderCell: (val: string, col: number) => React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{title}</p>
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-[11px] border-collapse">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-2.5 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(([a, b], i) => (
              <tr key={`${a}-${i}`} className="hover:bg-blue-50/40">
                <td className="px-2.5 py-2 align-top">{renderCell(a, 0)}</td>
                <td className="px-2.5 py-2 align-top">{renderCell(b, 1)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={2} className="px-3 py-4 text-center text-gray-400">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Left Reference Nav (vertical, collapsible) ───────────────────────────────

function LeftNav({ active, onSelect }: { active: SidebarTab | null; onSelect: (id: SidebarTab) => void }) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <div className="flex flex-col items-center py-4 gap-3 w-12 shrink-0 border-r border-gray-200 bg-white">
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Open reference panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {REF_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`p-2 rounded-lg transition-colors ${active === t.id ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"}`}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-60 min-w-[15rem] shrink-0 border-r border-gray-200 bg-white h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Reference Data</span>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          title="Collapse"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex flex-col p-2 gap-1">
        {REF_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
              active === t.id
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto px-4 py-3 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Select a category to view its data in the main panel for manual cross-referencing.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type WorkflowTab = "submit" | "history" | "analytics";

export default function HomePage() {
  const [view, setView] = useState<string>("submit");
  const isRef = REF_IDS.includes(view as SidebarTab);

  const workflowTabs: { id: WorkflowTab; label: string; icon: React.ReactNode }[] = [
    { id: "submit", label: "Submit PA", icon: <Send className="w-4 h-4" /> },
    { id: "history", label: "History", icon: <History className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="h-screen bg-gray-50 text-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 shadow-sm">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Prior Authorization Automation</h1>
            <p className="text-xs text-gray-400">Agentic workflow · LangGraph · OpenRouter · Qdrant</p>
          </div>
          <div className="ml-auto">
            <Badge variant="success">Live</Badge>
          </div>
        </div>
      </header>

      {/* Body: vertical nav + main */}
      <div className="flex flex-1 overflow-hidden">
        <LeftNav active={isRef ? (view as SidebarTab) : null} onSelect={(id) => setView(id)} />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Workflow tab bar */}
          <div className="px-6 pt-5 shrink-0">
            <div className="flex gap-1 p-1 rounded-xl bg-gray-100 w-fit">
              {workflowTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setView(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    view === t.id
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <main className="flex-1 min-h-0 px-6 py-5 flex flex-col">
            {isRef ? (
              <ReferencePanel tab={view as SidebarTab} />
            ) : (
              <div className="flex-1 overflow-y-auto">
                {view === "submit" && <SubmitTab />}
                {view === "history" && <HistoryTab />}
                {view === "analytics" && <AnalyticsTab />}
              </div>
            )}
          </main>
        </div>
      </div>

      <ChatBot />
    </div>
  );
}
