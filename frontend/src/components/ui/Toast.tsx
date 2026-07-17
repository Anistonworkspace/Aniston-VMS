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
  success: <CheckCircle className="h-5 w-5 text-emerald-500" />,
  error:   <XCircle     className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  info:    <Info        className="h-5 w-5 text-sky-500" />,
};

const borderMap: Record<ToastVariant, string> = {
  success: "border-l-emerald-500",
  error:   "border-l-red-500",
  warning: "border-l-amber-500",
  info:    "border-l-sky-500",
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
        "flex w-80 items-start gap-3 rounded-xl border-l-4 bg-white/90 backdrop-blur-md px-4 py-3 shadow-glass",
        borderMap[toast.variant]
      )}
    >
      <div className="mt-0.5 shrink-0">{iconMap[toast.variant]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs text-gray-500">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600"
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
