"use client";

// ─── LANDING PAGE — "/" ────────────────────────────────────────────────────────
// The main app lives at "/app"

import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Brain,
  ChevronRight,
  ClipboardList,
  Clock,
  DollarSign,
  FileText,
  Heart,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { RetroGrid } from "@/components/RetroGrid";
import { TypewriterText } from "@/components/TypewriterText";
import { RippleButton } from "@/components/RippleButton";
import { CountUp } from "@/components/CountUp";

// ── Fade-in wrapper ────────────────────────────────────────────────────────────
function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-slate-300">
      {children}
    </span>
  );
}

function SectionLabelLight({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#3a5ba0]/20 bg-[#3a5ba0]/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#3a5ba0]">
      {children}
    </span>
  );
}

// ── 1. Hero ────────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0f1520]">
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(58,91,160,0.35),transparent)]" />
      {/* Retro grid */}
      <RetroGrid opacity={0.45} lineColor="rgba(100,140,220,0.12)" fadeColor="#0f1520" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mb-8 flex justify-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm text-slate-300 backdrop-blur-sm">
            <Stethoscope className="w-4 h-4 text-[#f7c873]" />
            Healthcare · Revenue Cycle · Agentic AI
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.15 }}
          className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tight leading-none text-white mb-6"
        >
          Prior Authorization
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6ea3c1] via-[#f7c873] to-[#3a5ba0] animate-shimmer">
            <TypewriterText
              words={["Workflow Automation", "Reimagined", "Agentic Pipeline", "End-to-End"]}
              speed={70}
              deleteSpeed={30}
              pauseDuration={2500}
            />
          </span>
        </motion.h1>

        {/* Subline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="max-w-2xl mx-auto text-lg text-slate-400 leading-relaxed mb-12"
        >
          Physicians spend <strong className="text-white">13 hours/week</strong> on PA paperwork.
          This system verifies eligibility, codes the procedure, submits to the payer, and — when denied —
          <strong className="text-white"> reasons, corrects, and retries automatically.</strong>
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.8, type: "spring", stiffness: 120 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href="/app">
            <RippleButton size="lg" className="bg-[#f7c873] hover:bg-[#e6b85c] text-[#0f1520] font-bold shadow-xl shadow-[#f7c873]/20">
              Launch App <ArrowRight className="inline w-5 h-5 ml-2" />
            </RippleButton>
          </Link>
          <a href="#how-it-works" className="text-slate-400 hover:text-white text-sm flex items-center gap-1.5 transition-colors">
            How it works <ChevronRight className="w-4 h-4" />
          </a>
        </motion.div>

        {/* Floating stat pills */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="mt-20 flex flex-wrap justify-center gap-3"
        >
          {[
            { icon: <Clock className="w-3.5 h-3.5" />, text: "13 hrs/week → under 5 min per PA" },
            { icon: <DollarSign className="w-3.5 h-3.5" />, text: "$847k saved per year" },
            { icon: <TrendingDown className="w-3.5 h-3.5" />, text: "60% denials auto-resolved" },
            { icon: <Users className="w-3.5 h-3.5" />, text: "93% of doctors trust agents" },
          ].map((pill) => (
            <span
              key={pill.text}
              className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/5 px-3.5 py-1.5 text-xs text-slate-400 backdrop-blur-sm"
            >
              <span className="text-[#f7c873]">{pill.icon}</span>
              {pill.text}
            </span>
          ))}
        </motion.div>
      </div>

      {/* Scroll arrow */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="w-5 h-8 rounded-full border border-white/20 flex items-start justify-center pt-1.5">
          <div className="w-1 h-2 bg-white/40 rounded-full" />
        </div>
      </motion.div>
    </section>
  );
}

// ── 2. Problem Stats ───────────────────────────────────────────────────────────
const STATS = [
  {
    value: 13,
    suffix: " hrs",
    label: "per physician per week",
    detail: "Spent on PA paperwork instead of patient care",
    icon: <Clock className="w-6 h-6" />,
    color: "text-[#f7c873]",
  },
  {
    prefix: "$",
    value: 118,
    label: "cost per denied claim rework",
    detail: "Average $25–$118 per manual rework cycle",
    icon: <DollarSign className="w-6 h-6" />,
    color: "text-[#6ea3c1]",
  },
  {
    value: 93,
    suffix: "%",
    label: "of doctors say PA delays care",
    detail: "29% report PA caused a serious adverse event",
    icon: <AlertTriangle className="w-6 h-6" />,
    color: "text-amber-400",
  },
  {
    value: 11,
    suffix: "%+",
    label: "denial rate and growing",
    detail: "PA-related denials grew 20% in two years",
    icon: <TrendingDown className="w-6 h-6" />,
    color: "text-red-400",
  },
];

function ProblemStatsSection() {
  return (
    <section className="bg-[#181a24] py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <FadeIn className="text-center mb-16">
          <SectionLabel>The Problem</SectionLabel>
          <h2 className="mt-4 text-4xl md:text-5xl font-bold text-white tracking-tight">
            Prior authorization is <span className="text-[#f7c873]">broken</span>
          </h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Every PA submission touches 4 people, takes days, and fails 11% of the time — costing time, money, and patient outcomes.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STATS.map((s, i) => (
            <FadeIn key={s.label} delay={i * 0.1}>
              <div className="group rounded-2xl border border-white/6 bg-white/3 p-6 hover:bg-white/6 hover:border-white/12 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30">
                <div className={`mb-4 ${s.color}`}>{s.icon}</div>
                <p className={`text-4xl font-black ${s.color}`}>
                  {s.prefix && <span>{s.prefix}</span>}
                  <CountUp end={s.value} duration={2.2} suffix={s.suffix ?? ""} />
                </p>
                <p className="mt-2 text-sm font-semibold text-white">{s.label}</p>
                <p className="mt-1 text-xs text-slate-500">{s.detail}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 3. Agent Cards ─────────────────────────────────────────────────────────────
const AGENTS = [
  {
    n: "01",
    icon: <Shield className="w-6 h-6" />,
    name: "Eligibility Verifier",
    model: "Foundry (fast)",
    desc: "Parses the patient FHIR bundle, confirms active coverage, and decides whether PA is required — early-exiting on ineligible cases.",
    color: "from-blue-500/10 to-blue-600/5",
    border: "border-blue-500/20",
    iconColor: "text-blue-400",
  },
  {
    n: "02",
    icon: <ClipboardList className="w-6 h-6" />,
    name: "Prior Auth Coder",
    model: "Foundry + Foundry IQ",
    desc: "Maps the plain-English procedure to the correct CPT / HCPCS code and selects specific ICD-10 diagnoses using Foundry IQ cited retrieval over 74,044 codes.",
    color: "from-violet-500/10 to-violet-600/5",
    border: "border-violet-500/20",
    iconColor: "text-violet-400",
  },
  {
    n: "03",
    icon: <Send className="w-6 h-6" />,
    name: "PA Submitter",
    model: "Foundry (reasoning)",
    desc: "Assembles the complete authorization request and submits to the payer. Polls for a decision and routes to the denial analyst if rejected.",
    color: "from-emerald-500/10 to-emerald-600/5",
    border: "border-emerald-500/20",
    iconColor: "text-emerald-400",
  },
  {
    n: "04",
    icon: <Brain className="w-6 h-6" />,
    name: "Denial Analyst",
    model: "Foundry + Foundry IQ",
    desc: "Diagnoses the denial root cause via Foundry IQ retrieval over historical resolutions, corrects the coding, and retries — or generates an appeal letter if unfixable.",
    color: "from-amber-500/10 to-amber-600/5",
    border: "border-amber-500/20",
    iconColor: "text-amber-400",
  },
];

function AgentsSection() {
  return (
    <section id="how-it-works" className="bg-[#f8fafc] py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <FadeIn className="text-center mb-16">
          <SectionLabelLight>The 4 Agents</SectionLabelLight>
          <h2 className="mt-4 text-4xl md:text-5xl font-bold text-[#0f172a] tracking-tight">
            Verify → Code → Submit → <span className="text-[#3a5ba0]">Retry</span>
          </h2>
          <p className="mt-4 text-slate-500 max-w-xl mx-auto">
            A LangGraph pipeline of specialized AI agents that close the full loop — including the denial-retry cycle that existing tools skip.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 relative">
          {/* Connecting line on desktop */}
          <div className="hidden lg:block absolute top-12 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-blue-300/30 via-violet-300/30 to-amber-300/30" />

          {AGENTS.map((agent, i) => (
            <FadeIn key={agent.name} delay={i * 0.12}>
              <div className={`group relative rounded-2xl border ${agent.border} bg-gradient-to-br ${agent.color} p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 h-full`}>
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl bg-white shadow-sm ${agent.iconColor}`}>
                    {agent.icon}
                  </div>
                  <span className="text-xs font-bold text-slate-300 bg-slate-100 rounded-full px-2.5 py-0.5">
                    {agent.n}
                  </span>
                </div>
                <p className="text-base font-bold text-[#0f172a] mb-1">{agent.name}</p>
                <p className="text-xs text-slate-400 font-mono mb-3">{agent.model}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{agent.desc}</p>

                {/* Arrow to next */}
                {i < 3 && (
                  <div className="hidden lg:flex absolute -right-3 top-11 z-10 w-6 h-6 items-center justify-center bg-white rounded-full shadow border border-slate-200">
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                  </div>
                )}
                {/* Loop arrow on last card */}
                {i === 3 && (
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-amber-500 font-medium">
                    <RefreshCw className="w-3 h-3" /> up to 3 retries before escalation
                  </div>
                )}
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 4. Business Value ──────────────────────────────────────────────────────────
const VALUE_METRICS = [
  {
    metric: "$847k",
    sub: "saved per year",
    detail: "For a 5-physician practice (100+ PAs/week): physician time ($520k), billing staff ($215k), and rework costs ($112k) combined",
    icon: <TrendingUp className="w-7 h-7 text-[#f7c873]" />,
  },
  {
    metric: "13 → <5",
    sub: "min per PA submission",
    detail: "Agents handle eligibility check, coding, submission, and denial retry — physicians only review final decision",
    icon: <Clock className="w-7 h-7 text-[#6ea3c1]" />,
  },
  {
    metric: "~60%",
    sub: "denials auto-resolved",
    detail: "Fixable denials (wrong modifier, vague ICD code) corrected and resubmitted without human intervention",
    icon: <Zap className="w-7 h-7 text-emerald-400" />,
  },
];

function BusinessValueSection() {
  return (
    <section className="bg-[#1a2238] py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <FadeIn className="text-center mb-16">
          <SectionLabel>Business Value</SectionLabel>
          <h2 className="mt-4 text-4xl md:text-5xl font-bold text-white tracking-tight">
            Measurable impact, <span className="text-[#f7c873]">by the numbers</span>
          </h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Based on <a href="https://www.ama-assn.org/practice-management/prior-authorization/only-1-3-doctors-trusts-insurers-prior-authorization" target="_blank" rel="noopener noreferrer" className="text-[#f7c873] hover:text-white underline transition-colors">AMA 2023 survey data</a> showing physicians spend 13+ hours/week on PA. Agents reduce this to under 5 minutes per submission.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {VALUE_METRICS.map((m, i) => (
            <FadeIn key={m.metric} delay={i * 0.12}>
              <div className="rounded-2xl border border-white/8 bg-white/3 p-8 hover:bg-white/6 hover:border-white/14 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20">
                <div className="mb-4">{m.icon}</div>
                <p className="text-5xl font-black text-white tracking-tight">{m.metric}</p>
                <p className="text-[#f7c873] font-semibold mt-1">{m.sub}</p>
                <p className="mt-3 text-sm text-slate-400 leading-relaxed">{m.detail}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Tech stack strip */}
        <FadeIn>
          <div className="rounded-2xl border border-white/6 bg-white/2 px-8 py-6">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-4 text-center">Built with</p>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
              {[
                { label: "LangGraph", note: "multi-agent orchestration" },
                { label: "Microsoft AI Foundry", note: "LLM reasoning" },
                { label: "Foundry IQ", note: "cited knowledge retrieval" },
                { label: "Neon PostgreSQL", note: "run history" },
                { label: "FastAPI", note: "SSE streaming" },
                { label: "Next.js 14", note: "frontend" },
              ].map((t) => (
                <div key={t.label} className="text-center">
                  <p className="text-sm font-semibold text-slate-200">{t.label}</p>
                  <p className="text-xs text-slate-500">{t.note}</p>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ── 5. Final CTA ───────────────────────────────────────────────────────────────
function CtaSection() {
  return (
    <section className="bg-[#0f1520] py-28 px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_50%_50%,rgba(58,91,160,0.2),transparent)]" />
      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <FadeIn>
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#f7c873] flex items-center justify-center shadow-lg shadow-[#f7c873]/30">
              <Heart className="w-7 h-7 text-[#0f1520]" />
            </div>
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-4">
            Ready to automate<br />
            <span className="text-[#f7c873]">prior authorization?</span>
          </h2>
          <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">
            Open the live app — select a patient, describe a procedure, and watch all 4 agents work in real time.
          </p>
          <Link href="/app">
            <RippleButton
              size="lg"
              className="bg-[#f7c873] hover:bg-[#e6b85c] text-[#0f1520] font-bold shadow-2xl shadow-[#f7c873]/25"
            >
              Launch the App <ArrowRight className="inline w-5 h-5 ml-2" />
            </RippleButton>
          </Link>
          <p className="mt-6 text-xs text-slate-600">Uses synthetic patient data only — zero HIPAA exposure</p>
        </FadeIn>
      </div>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <main className="antialiased">
      <HeroSection />
      <ProblemStatsSection />
      <AgentsSection />
      <BusinessValueSection />
      <CtaSection />
    </main>
  );
}
