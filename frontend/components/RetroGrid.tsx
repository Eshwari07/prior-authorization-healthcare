"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface RetroGridProps {
  angle?: number;
  cellSize?: number;
  opacity?: number;
  lineColor?: string;
  fadeColor?: string;
  className?: string;
}

export function RetroGrid({
  angle = 65,
  cellSize = 60,
  opacity = 0.4,
  lineColor = "rgba(255,255,255,0.12)",
  fadeColor = "#0f1520",
  className,
}: RetroGridProps) {
  const gridStyles = {
    "--grid-angle": `${angle}deg`,
    "--cell-size": `${cellSize}px`,
    "--line-color": lineColor,
  } as React.CSSProperties;

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden [perspective:200px]", className)}
      style={{ opacity }}
    >
      <div
        className="absolute inset-0"
        style={{ transform: `rotateX(var(--grid-angle))` } as React.CSSProperties}
      >
        <div
          className="animate-grid [background-repeat:repeat] [height:300vh] [inset:0%_0px] [margin-left:-200%] [transform-origin:100%_0_0] [width:600vw]"
          style={
            {
              backgroundImage: `linear-gradient(to right, var(--line-color) 1px, transparent 0), linear-gradient(to bottom, var(--line-color) 1px, transparent 0)`,
              backgroundSize: `var(--cell-size) var(--cell-size)`,
              ...gridStyles,
            } as React.CSSProperties
          }
        />
      </div>
      <div
        className="absolute inset-0 bg-gradient-to-t to-transparent to-90%"
        style={{ backgroundImage: `linear-gradient(to top, ${fadeColor}, transparent 90%)` }}
      />
    </div>
  );
}
