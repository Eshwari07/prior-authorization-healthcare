import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "error" | "warning" | "outline";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        {
          "bg-blue-500/20 text-blue-400 border border-blue-500/30": variant === "default",
          "bg-green-500/20 text-green-400 border border-green-500/30": variant === "success",
          "bg-red-500/20 text-red-400 border border-red-500/30": variant === "error",
          "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30": variant === "warning",
          "border border-slate-600 text-slate-400": variant === "outline",
        },
        className
      )}
      {...props}
    />
  );
}
