import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonTap } from "@/lib/animations";

const variants = {
  primary:
    "bg-sage text-white shadow-sm hover:bg-sage-hover focus-visible:ring-sage",
  secondary:
    "bg-card text-ink border border-hairline shadow-soft hover:bg-surface focus-visible:ring-sage",
  ghost:
    "bg-transparent text-secondary hover:bg-surface focus-visible:ring-sage",
  danger:
    "bg-coral text-white shadow-sm hover:bg-coral/90 focus-visible:ring-coral",
  outline:
    "border border-sage text-sage hover:bg-sage-soft focus-visible:ring-sage",
};

const sizes = {
  xs: "h-7 px-3 text-xs gap-1.5",
  sm: "h-8 px-3.5 text-sm gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-10 px-5 text-base gap-2",
  icon: "h-9 w-9 p-0",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      className,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <motion.button
        ref={ref}
        whileTap={isDisabled ? undefined : buttonTap}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          "disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...(props as React.ComponentProps<typeof motion.button>)}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </motion.button>
    );
  }
);

Button.displayName = "Button";
