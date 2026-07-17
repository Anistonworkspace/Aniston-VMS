import { useCallback, useState } from "react";
import type { ToastItem, ToastVariant } from "@/components/ui/Toast";

let counter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback(
    (
      variant: ToastVariant,
      title: string,
      description?: string,
      duration?: number
    ) => {
      const id = `toast-${++counter}`;
      setToasts((prev) => [...prev, { id, variant, title, description, duration }]);
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return {
    toasts,
    dismiss,
    success: (title: string, desc?: string) => toast("success", title, desc),
    error:   (title: string, desc?: string) => toast("error",   title, desc),
    warning: (title: string, desc?: string) => toast("warning", title, desc),
    info:    (title: string, desc?: string) => toast("info",    title, desc),
  };
}
