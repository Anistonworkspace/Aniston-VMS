import { useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fadeIn } from "@/lib/animations";
import { cn } from "@/lib/utils";

type TooltipPlacement = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: TooltipPlacement;
  delay?: number;
  className?: string;
}

const placementStyles: Record<TooltipPlacement, { wrapper: string; arrow: string }> = {
  top:    { wrapper: "bottom-full left-1/2 -translate-x-1/2 mb-2",    arrow: "top-full left-1/2 -translate-x-1/2 border-t-gray-800 border-x-transparent border-b-transparent border-4" },
  bottom: { wrapper: "top-full left-1/2 -translate-x-1/2 mt-2",       arrow: "bottom-full left-1/2 -translate-x-1/2 border-b-gray-800 border-x-transparent border-t-transparent border-4" },
  left:   { wrapper: "right-full top-1/2 -translate-y-1/2 mr-2",       arrow: "left-full top-1/2 -translate-y-1/2 border-l-gray-800 border-y-transparent border-r-transparent border-4" },
  right:  { wrapper: "left-full top-1/2 -translate-y-1/2 ml-2",        arrow: "right-full top-1/2 -translate-y-1/2 border-r-gray-800 border-y-transparent border-l-transparent border-4" },
};

export function Tooltip({
  content,
  children,
  placement = "top",
  delay = 300,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    timer.current = setTimeout(() => setVisible(true), delay);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            key="tooltip"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="tooltip"
            className={cn(
              "pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-gray-800 px-2.5 py-1.5 text-xs text-white shadow-lg",
              placementStyles[placement].wrapper,
              className
            )}
          >
            {content}
            <span className={cn("absolute border", placementStyles[placement].arrow)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
