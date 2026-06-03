"use client";

import { useEffect, useState, useRef } from "react";
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Ban,
  BarChart3,
  History,
  Send,
  Loader2,
  Heart,
  FileText,
  TrendingUp,
} from "lucide-react";
import { AgentTraceCard } from "@/components/AgentTraceCard";
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
  insurer: string;
  procedure_desc: string;
  cpt_code: string;
  primary_icd10: string;
  final_status: string;
  retry_count: number;
  auth_number?: string;
}

interface Analytics {
  total: number;
  approved: number;
  escalated: number;
  ineligible: number;
  avg_retries: number;
  denial_breakdown: Record<string, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle className="w-5 h-5 text-green-400" />;
  if (status === "ineligible") return <Ban className="w-5 h-5 text-red-400" />;
  if (status === "escalated") return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
  if (status === "denied") return <XCircle className="w-5 h-5 text-red-400" />;
  return <Activity className="w-5 h-5 text-blue-400" />;
}

function FinalBanner({ result }: { result: RunResult }) {
  if (result.final_status === "approved") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-green-500/10 border border-green-500/30 px-4 py-3">
        <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
        <div>
          <p className="text-green-300 font-semibold">Authorization Approved</p>
          <p className="text-green-400/70 text-sm">
            Auth #{result.final_auth_number}
            {result.retry_count > 0 && ` — approved after ${result.retry_count} retr${result.retry_count === 1 ? "y" : "ies"}`}
          </p>
        </div>
      </div>
    );
  }
  if (result.final_status === "ineligible") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3">
        <Ban className="w-5 h-5 text-red-400 shrink-0" />
        <p className="text-red-300 font-semibold">Not Eligible — see eligibility reasoning above</p>
      </div>
    );
  }
  if (result.final_status === "escalated") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
          <p className="text-yellow-300 font-semibold">Escalated to Human Review</p>
        </div>
        {result.appeal_letter && (
          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <p className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Appeal Letter
            </p>
            <pre className="text-xs text-slate-400 whitespace-pre-wrap font-sans leading-relaxed">
              {result.appeal_letter}
            </pre>
          </div>
        )}
      </div>
    );
  }
  return null;
}

// ─── Submit Tab ───────────────────────────────────────────────────────────────

function SubmitTab() {
  const [patients, setPatients] = useState<Patient[]>([]);
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-300">Patient</label>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          {selectedPatient && (
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedPatient.insurer && (
                <Badge variant="outline">{selectedPatient.insurer}</Badge>
              )}
              <Badge variant={selectedPatient.coverage_active ? "success" : "error"}>
                {selectedPatient.coverage_active ? "active" : "inactive"}
              </Badge>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-300">Procedure Request</label>
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-800 text-slate-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500"
            placeholder="e.g. MRI of the lower back"
            value={procedure}
            onChange={(e) => setProcedure(e.target.value)}
            disabled={running}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <p className="text-xs text-slate-500 mt-1">
            Try: MRI lumbar spine · total knee replacement · laparoscopic hysterectomy
          </p>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={running || !procedure.trim() || patients.length === 0}
        className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium px-6 py-2.5 text-sm transition-colors"
      >
        {running ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Running workflow…</>
        ) : (
          <><Send className="w-4 h-4" /> Run Agentic Workflow</>
        )}
      </button>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {trace.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Agent Trace</p>
          {trace.map((step, i) => (
            <AgentTraceCard key={i} step={step} index={i} />
          ))}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Result</p>
          <FinalBanner result={result} />
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/history`)
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading history…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <History className="w-10 h-10 mb-3 opacity-40" />
        <p>No PA requests recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800/60">
            {["Date", "Patient", "Insurer", "Procedure", "CPT", "ICD-10", "Status", "Retries"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r, i) => (
            <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors">
              <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
              </td>
              <td className="px-4 py-3 text-slate-200 font-medium">{r.patient_name}</td>
              <td className="px-4 py-3 text-slate-400">{r.insurer}</td>
              <td className="px-4 py-3 text-slate-300">{r.procedure_desc}</td>
              <td className="px-4 py-3 font-mono text-blue-300 text-xs">{r.cpt_code}</td>
              <td className="px-4 py-3 font-mono text-blue-300 text-xs">{r.primary_icd10}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <StatusIcon status={r.final_status} />
                  <span className="capitalize text-slate-300">{r.final_status}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-slate-400 text-center">{r.retry_count ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-blue-400">{icon}</span>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
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
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading analytics…
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <BarChart3 className="w-10 h-10 mb-3 opacity-40" />
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
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
          <p className="text-sm font-semibold text-slate-300 mb-4">Denial Code Breakdown</p>
          <div className="space-y-3">
            {denialEntries.map(([code, count]) => (
              <div key={code} className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span className="font-mono text-blue-300">{code}</span>
                  <span>{count}</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
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

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "submit" | "history" | "analytics";

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("submit");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "submit", label: "Submit", icon: <Send className="w-4 h-4" /> },
    { id: "history", label: "History", icon: <History className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30">
            <Heart className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100">Prior Authorization Automation</h1>
            <p className="text-xs text-slate-500">
              Agentic workflow · LangGraph · OpenRouter · Qdrant
            </p>
          </div>
          <div className="ml-auto">
            <Badge variant="success">Live</Badge>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-800 w-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === "submit" && <SubmitTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "analytics" && <AnalyticsTab />}
      </main>
    </div>
  );
}
