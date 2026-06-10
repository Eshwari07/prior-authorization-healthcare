"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FolderTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
}

interface FolderTabsProps {
  tabs: FolderTab[];
  defaultTab?: string;
}

export function FolderTabs({ tabs, defaultTab }: FolderTabsProps) {
  const [activeTab, setActiveTab] = useState<string>(
    defaultTab ?? tabs[0]?.id
  );
  const activeContent = tabs.find((t) => t.id === activeTab)?.content;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Tab strip ── */}
      <div className="relative z-10 flex items-end justify-start sm:justify-center gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="relative px-3 sm:px-6 py-2.5 sm:py-3 focus:outline-none shrink-0"
            >
              {isActive && (
                <motion.span
                  layoutId="folder-active-tab"
                  className="absolute inset-x-0 top-0 -bottom-3 rounded-t-2xl bg-slate-200 shadow-[0_-1px_2px_rgba(0,0,0,0.06)]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span
                className={`relative z-10 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm uppercase tracking-wide whitespace-nowrap transition-colors ${
                  isActive
                    ? "font-semibold text-slate-900"
                    : "font-medium text-slate-400 hover:text-slate-600"
                }`}
              >
                <span
                  className={
                    isActive ? "text-[#3a5ba0]" : "text-slate-400"
                  }
                >
                  {tab.icon}
                </span>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Folder body ── */}
      <div className="relative z-0 flex-1 min-h-0 rounded-2xl sm:rounded-3xl bg-slate-200 p-3 sm:p-5 shadow-sm">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="h-full min-h-0"
          >
            {activeContent}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
