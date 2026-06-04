"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface GooeyTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function GooeyTabs({ tabs, activeTab, onTabChange, className }: GooeyTabsProps) {
  return (
    <div className={cn("relative inline-flex gap-0.5 p-1 bg-slate-100 rounded-xl shadow-inner", className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="relative z-10 flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors duration-150 focus:outline-none"
            style={{ color: isActive ? "#0f172a" : "#64748b" }}
          >
            {isActive && (
              <motion.div
                layoutId="gooey-active-bg"
                className="absolute inset-0 rounded-lg bg-white shadow-sm"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {tab.icon && (
                <span className={cn("transition-colors", isActive ? "text-[#3a5ba0]" : "text-slate-400")}>
                  {tab.icon}
                </span>
              )}
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
