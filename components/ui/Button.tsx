import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "ghost" | "outline";
type Size = "sm" | "md" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  default:
    "bg-ink text-paper hover:bg-ink/90 dark:bg-paper-raised dark:text-ink dark:hover:bg-paper",
  ghost: "hover:bg-paper-sunken dark:hover:bg-paper-raised text-ink",
  outline:
    "border border-line bg-paper hover:bg-paper-sunken text-ink dark:bg-paper-raised dark:hover:bg-paper",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  icon: "h-9 w-9",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
