"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";

// ── Neural Network Paths ──────────────────────────────────────────────────────
function NeuralPaths() {
  const { nodes, connections } = useMemo(() => {
    const n = Array.from({ length: 48 }, (_, i) => ({
      x: Math.random() * 800,
      y: Math.random() * 600,
      id: `node-${i}`,
    }));
    const c: { id: string; d: string; delay: number }[] = [];
    n.forEach((node, i) => {
      n.forEach((other, j) => {
        if (i >= j) return;
        const dist = Math.hypot(node.x - other.x, node.y - other.y);
        if (dist < 110 && Math.random() > 0.55) {
          c.push({
            id: `conn-${i}-${j}`,
            d: `M${node.x},${node.y} L${other.x},${other.y}`,
            delay: Math.random() * 10,
          });
        }
      });
    });
    return { nodes: n, connections: c };
  }, []);

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
      {connections.map((conn) => (
        <motion.path
          key={conn.id}
          d={conn.d}
          stroke="#3a5ba0"
          strokeWidth="0.6"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 0], opacity: [0, 0.7, 0] }}
          transition={{ duration: 6, delay: conn.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      {nodes.map((node) => (
        <motion.circle
          key={node.id}
          cx={node.x}
          cy={node.y}
          r="2.5"
          fill="#f7c873"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1, 1.3, 1], opacity: [0, 0.8, 1, 0.7] }}
          transition={{ duration: 4, delay: Math.random() * 6, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </svg>
  );
}

// ── Organic Flow Paths ────────────────────────────────────────────────────────
function FlowPaths() {
  const flowPaths = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: `flow-${i}`,
        d: `M-100,${160 + i * 50} Q250,${160 + i * 50 - (50 + i * 8)} 550,${160 + i * 50} T950,${160 + i * 50}`,
        strokeWidth: 0.8 + i * 0.25,
        delay: i * 0.9,
      })),
    []
  );

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
      {flowPaths.map((p) => (
        <motion.path
          key={p.id}
          d={p.d}
          fill="none"
          stroke="#6ea3c1"
          strokeWidth={p.strokeWidth}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 0.8, 0], opacity: [0, 0.6, 0.4, 0] }}
          transition={{ duration: 14, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </svg>
  );
}

// ── Geometric Grid Paths ──────────────────────────────────────────────────────
function GeometricPaths() {
  const gridCells = useMemo(() => {
    const cells: { id: string; d: string; delay: number }[] = [];
    const size = 48;
    for (let x = 0; x < 18; x++) {
      for (let y = 0; y < 13; y++) {
        if (Math.random() > 0.72) {
          cells.push({
            id: `grid-${x}-${y}`,
            d: `M${x * size},${y * size} L${(x + 1) * size},${y * size} L${(x + 1) * size},${(y + 1) * size} L${x * size},${(y + 1) * size} Z`,
            delay: Math.random() * 6,
          });
        }
      }
    }
    return cells;
  }, []);

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 864 624" preserveAspectRatio="xMidYMid slice">
      {gridCells.map((cell) => (
        <motion.path
          key={cell.id}
          d={cell.d}
          fill="none"
          stroke="#3a5ba0"
          strokeWidth="1"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 0], opacity: [0, 0.55, 0], scale: [1, 1.04, 1] }}
          transition={{ duration: 8, delay: cell.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </svg>
  );
}

// ── Spiral Paths ──────────────────────────────────────────────────────────────
function SpiralPaths() {
  const spirals = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const cx = 100 + (i % 4) * 200;
        const cy = 150 + Math.floor(i / 4) * 280;
        const radius = 70 + i * 12;
        const turns = 3 + i * 0.4;
        let d = `M${cx + radius},${cy}`;
        for (let angle = 0; angle <= turns * 360; angle += 4) {
          const rad = (angle * Math.PI) / 180;
          const r = radius * (1 - angle / (turns * 360));
          d += ` L${cx + r * Math.cos(rad)},${cy + r * Math.sin(rad)}`;
        }
        return { id: `spiral-${i}`, d, delay: i * 1.3 };
      }),
    []
  );

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
      {spirals.map((s) => (
        <motion.path
          key={s.id}
          d={s.d}
          fill="none"
          stroke="#bccdf0"
          strokeWidth="1.2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 0], rotate: [0, 360] }}
          transition={{
            pathLength: { duration: 12, repeat: Infinity, ease: "easeInOut", delay: s.delay },
            rotate: { duration: 22, repeat: Infinity, ease: "linear", delay: s.delay },
          }}
        />
      ))}
    </svg>
  );
}

// ── Pattern names & indicators ────────────────────────────────────────────────
const PATTERNS = ["neural", "flow", "geometric", "spiral"] as const;

function PatternIndicator({ current }: { current: number }) {
  return (
    <div className="absolute bottom-3 right-4 flex gap-1.5 z-10 pointer-events-none">
      {PATTERNS.map((_, i) => (
        <motion.div
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
            i === current ? "bg-[#f7c873]" : "bg-[#3a5ba0]/40"
          }`}
          animate={{ scale: i === current ? 1.3 : 1, opacity: i === current ? 1 : 0.5 }}
          transition={{ duration: 0.3 }}
        />
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function AnimatedBackground() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCurrent((p) => (p + 1) % PATTERNS.length), 12000);
    return () => clearInterval(id);
  }, []);

  const renderPattern = () => {
    switch (current) {
      case 0: return <NeuralPaths />;
      case 1: return <FlowPaths />;
      case 2: return <GeometricPaths />;
      case 3: return <SpiralPaths />;
      default: return <NeuralPaths />;
    }
  };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Animated pattern layer */}
      <div className="absolute inset-0 opacity-[0.18]">
        <motion.div
          key={current}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2.5 }}
        >
          {renderPattern()}
        </motion.div>
      </div>

      {/* Subtle vignette — keeps text readable */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#f5f7fa]/30 via-transparent to-[#f5f7fa]/50" />

      {/* Floating accent orbs */}
      <motion.div
        className="absolute top-1/4 left-1/3 w-5 h-5 rounded-full bg-[#3a5ba0]/15 blur-md"
        animate={{ y: [0, -18, 0], x: [0, 8, 0], scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-2/3 right-1/4 w-7 h-7 rounded-full bg-[#f7c873]/20 blur-md"
        animate={{ y: [0, 14, 0], x: [0, -12, 0], scale: [1, 0.85, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
      />
      <motion.div
        className="absolute top-1/2 right-1/2 w-4 h-4 rounded-full bg-[#6ea3c1]/15 blur-sm"
        animate={{ y: [0, -10, 8, 0], x: [0, 6, -4, 0], opacity: [0.2, 0.5, 0.3, 0.2] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 5 }}
      />

      <PatternIndicator current={current} />
    </div>
  );
}
