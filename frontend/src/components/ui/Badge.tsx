import { cn } from "@/lib/utils";

const variants = {
  default: "bg-gray-100 text-gray-700",
  primary: "bg-indigo-100 text-indigo-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-sky-100 text-sky-700",
  purple: "bg-purple-100 text-purple-700",
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
              default: "bg-gray-500",
              primary: "bg-indigo-500",
              success: "bg-emerald-500",
              warning: "bg-amber-500",
              danger: "bg-red-500",
              info: "bg-sky-500",
              purple: "bg-purple-500",
            }[variant]
          )}
        />
      )}
      {children}
    </span>
  );
}
