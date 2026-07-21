import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { toastSlide } from "@/lib/animations";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

const iconMap = {
  success: <CheckCircle className="h-5 w-5 text-state-healthy" />,
  error:   <XCircle     className="h-5 w-5 text-coral" />,
  warning: <AlertTriangle className="h-5 w-5 text-state-warning" />,
  info:    <Info        className="h-5 w-5 text-state-maintenance" />,
};

const borderMap: Record<ToastVariant, string> = {
  success: "border-l-state-healthy",
  error:   "border-l-coral",
  warning: "border-l-state-warning",
  info:    "border-l-state-maintenance",
};

interface SingleToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function SingleToast({ toast, onDismiss }: SingleToastProps) {
  useEffect(() => {
    const timer = setTimeout(
      () => onDismiss(toast.id),
      toast.duration ?? 4000
    );
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <motion.div
      layout
      key={toast.id}
      variants={toastSlide}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(
        "flex w-80 items-start gap-3 rounded-xl border-l-4 bg-card px-4 py-3 shadow-soft",
        borderMap[toast.variant]
      )}
    >
      <div className="mt-0.5 shrink-0">{iconMap[toast.variant]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs text-muted">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="mt-0.5 shrink-0 text-muted hover:text-secondary"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <SingleToast key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}
