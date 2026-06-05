"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";

interface NavTab {
  id: string;
  label: string;
}

interface NavHeaderProps {
  tabs: NavTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

function NavHeader({ tabs, onTabChange }: NavHeaderProps) {
  const [position, setPosition] = useState({
    left: 0,
    width: 0,
    opacity: 0,
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <ul
      className="relative mx-auto flex w-fit rounded-full border-2 border-[#3a5ba0] bg-white p-1 shadow-sm"
      onMouseLeave={() => {
        setPosition((pv) => ({ ...pv, opacity: 0 }));
        setHoveredId(null);
      }}
    >
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          setPosition={setPosition}
          isHovered={hoveredId === tab.id}
          onHover={() => setHoveredId(tab.id)}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </Tab>
      ))}

      <Cursor position={position} />
    </ul>
  );
}

const Tab = ({
  children,
  setPosition,
  isHovered,
  onHover,
  onClick,
}: {
  children: React.ReactNode;
  setPosition: (p: { left: number; width: number; opacity: number }) => void;
  isHovered: boolean;
  onHover: () => void;
  onClick: () => void;
}) => {
  const ref = useRef<HTMLLIElement>(null);
  return (
    <li
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => {
        if (!ref.current) return;
        const { width } = ref.current.getBoundingClientRect();
        setPosition({
          width,
          opacity: 1,
          left: ref.current.offsetLeft,
        });
        onHover();
      }}
      className={`relative z-10 block cursor-pointer px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors duration-200 md:px-5 md:py-2 md:text-sm ${
        isHovered ? "text-white" : "text-[#3a5ba0]"
      }`}
    >
      {children}
    </li>
  );
};

const Cursor = ({
  position,
}: {
  position: { left: number; width: number; opacity: number };
}) => {
  return (
    <motion.li
      animate={position}
      className="absolute z-0 h-7 rounded-full bg-[#3a5ba0] md:h-9"
    />
  );
};

export default NavHeader;
