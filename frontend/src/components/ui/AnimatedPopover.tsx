import { useRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { scalePopDown } from "@/lib/animations";

type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

interface AnimatedPopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  placement?: Placement;
  className?: string;
}

export function AnimatedPopover({
  trigger,
  children,
  placement = "bottom-start",
  className = "",
}: AnimatedPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const placementClasses: Record<Placement, string> = {
    "bottom-start": "top-full left-0 mt-2",
    "bottom-end": "top-full right-0 mt-2",
    "top-start": "bottom-full left-0 mb-2",
    "top-end": "bottom-full right-0 mb-2",
  };

  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen((v) => !v)} className="cursor-pointer">
        {trigger}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            key="popover"
            variants={scalePopDown}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`absolute z-50 min-w-max rounded-xl border border-white/30 bg-white/80 backdrop-blur-md shadow-glass ${placementClasses[placement]} ${className}`}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
