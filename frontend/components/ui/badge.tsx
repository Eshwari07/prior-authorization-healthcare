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
          "bg-blue-100 text-blue-700 border border-blue-200": variant === "default",
          "bg-green-100 text-green-700 border border-green-200": variant === "success",
          "bg-red-100 text-red-700 border border-red-200": variant === "error",
          "bg-amber-100 text-amber-700 border border-amber-200": variant === "warning",
          "border border-gray-300 text-gray-600": variant === "outline",
        },
        className
      )}
      {...props}
    />
  );
}
