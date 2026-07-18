import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fadeIn, smooth } from '@/lib/animations';

const drawerSlide: Variants = {
  hidden: { x: '104%' },
  visible: { x: 0, transition: { type: 'spring', stiffness: 380, damping: 40 } },
  exit: { x: '104%', transition: { ...smooth, duration: 0.2 } },
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Header content (left of the close button). */
  title?: React.ReactNode;
  /** Extra classes on the panel, e.g. to widen it (`sm:max-w-2xl`). */
  widthClassName?: string;
  children?: React.ReactNode;
}

/**
 * Right-hand slide-over panel (detail views: camera, incident, …).
 * Same interaction contract as AnimatedModal: backdrop click + Escape close,
 * body scroll locked while open.
 */
export function Drawer({
  open,
  onClose,
  title,
  widthClassName,
  children,
}: DrawerProps): JSX.Element {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0 bg-charcoal/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            variants={drawerSlide}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            className={cn(
              'absolute inset-y-0 right-0 flex w-full flex-col bg-canvas shadow-2xl sm:max-w-xl',
              widthClassName
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-4">
              <div className="min-w-0 flex-1">{title}</div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-gray-500 transition-colors hover:bg-black/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
