import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fadeIn } from '@/lib/animations';

// Centered popup entrance. On mobile the panel behaves like a bottom-sheet
// (slides up from the bottom, full-width); on >=sm it is a centered card that
// scales/rises into place. Kept in this file (not the shared animations lib) so
// the Drawer contract stays self-contained.
const popIn: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 380, damping: 34 },
  },
  exit: { opacity: 0, y: 24, scale: 0.98, transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] } },
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Header content (left of the close button). */
  title?: React.ReactNode;
  /**
   * Extra classes on the panel, e.g. to widen it (`sm:max-w-2xl`). Because the
   * class list is merged with `tailwind-merge`, a `sm:max-w-*` override here
   * wins over the default `sm:max-w-xl`.
   */
  widthClassName?: string;
  children?: React.ReactNode;
}

/**
 * Centered modal popup (detail views: camera, incident, user scopes, …).
 *
 * Historically a right-hand slide-over; now a responsive centered popup so every
 * detail surface opens in the middle of the screen. The public contract is
 * unchanged (open / onClose / title / widthClassName / children) so all existing
 * call sites keep working. Interaction contract matches AnimatedModal: backdrop
 * click + Escape close, body scroll locked while open.
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
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0 bg-charcoal/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            variants={popIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            className={cn(
              // Bottom-sheet on mobile → centered card on >=sm.
              'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-canvas shadow-2xl',
              'sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl',
              widthClassName
            )}
          >
            {/* Grab handle (mobile bottom-sheet affordance). */}
            <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
              <span className="h-1.5 w-10 rounded-full bg-black/15" />
            </div>
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
