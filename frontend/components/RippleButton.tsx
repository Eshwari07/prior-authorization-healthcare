"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface RippleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function RippleButton({
  children,
  variant = "primary",
  size = "md",
  className,
  onClick,
  disabled,
  ...props
}: RippleButtonProps) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);
  const ref = useRef<HTMLButtonElement>(null);
  const nextId = useRef(0);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const rect = ref.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 2.2;
    const id = nextId.current++;
    setRipples((prev) => [...prev, { id, x, y, size }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 750);
    onClick?.(e);
  };

  const baseClasses =
    "relative overflow-hidden rounded-full font-semibold transition-all duration-300 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

  const variantClasses = {
    primary:
      "bg-[#3a5ba0] hover:bg-[#2d4a8a] text-[#fffbe6] shadow-lg hover:shadow-xl hover:-translate-y-0.5 focus-visible:ring-[#3a5ba0] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
    outline:
      "border-2 border-[#3a5ba0] text-[#3a5ba0] hover:bg-[#3a5ba0] hover:text-[#fffbe6] focus-visible:ring-[#3a5ba0]",
    ghost:
      "text-[#3a5ba0] hover:bg-[#3a5ba0]/10 focus-visible:ring-[#3a5ba0]",
  };

  const sizeClasses = {
    sm: "px-5 py-2 text-sm",
    md: "px-8 py-3 text-base",
    lg: "px-12 py-4 text-lg",
  };

  return (
    <button
      ref={ref}
      onClick={handleClick}
      disabled={disabled}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    >
      <span className="relative z-10">{children}</span>
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            className="absolute rounded-full bg-white/25 pointer-events-none"
            style={{
              left: r.x - r.size / 2,
              top: r.y - r.size / 2,
              width: r.size,
              height: r.size,
            }}
            initial={{ scale: 0, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        ))}
      </AnimatePresence>
    </button>
  );
}
