import { cn } from "@/lib/utils";

const variants = {
  default: "bg-state-unknown-soft text-state-unknown",
  primary: "bg-sage-soft text-sage",
  success: "bg-state-healthy-soft text-state-healthy",
  warning: "bg-state-warning-soft text-state-warning",
  danger: "bg-state-critical-soft text-state-critical",
  info: "bg-state-maintenance-soft text-state-maintenance",
  purple: "bg-indigo-soft text-indigo",
};

const sizes = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-0.5 text-xs",
  lg: "px-3 py-1 text-sm",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  dot?: boolean;
}

export function Badge({
  variant = "default",
  size = "md",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            {
              default: "bg-state-unknown",
              primary: "bg-sage",
              success: "bg-state-healthy",
              warning: "bg-state-warning",
              danger: "bg-state-critical",
              info: "bg-state-maintenance",
              purple: "bg-indigo",
            }[variant]
          )}
        />
      )}
      {children}
    </span>
  );
}
