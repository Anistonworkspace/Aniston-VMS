import type { Variants, Transition } from "framer-motion";

// ─── Shared transitions ────────────────────────────────────────────────────

export const spring: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
};

export const snappy: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 35,
};

export const smooth: Transition = {
  type: "tween",
  ease: [0.4, 0, 0.2, 1],
  duration: 0.22,
};

// ─── Fade ─────────────────────────────────────────────────────────────────

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: smooth },
  exit: { opacity: 0, transition: { ...smooth, duration: 0.15 } },
};

// ─── Slide + fade (modal / drawer entries) ────────────────────────────────

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: spring },
  exit: { opacity: 0, y: 16, transition: smooth },
};

export const slideDown: Variants = {
  hidden: { opacity: 0, y: -16 },
  visible: { opacity: 1, y: 0, transition: spring },
  exit: { opacity: 0, y: -16, transition: smooth },
};

export const slideLeft: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: spring },
  exit: { opacity: 0, x: 24, transition: smooth },
};

export const slideRight: Variants = {
  hidden: { opacity: 0, x: -24 },
  visible: { opacity: 1, x: 0, transition: spring },
  exit: { opacity: 0, x: -24, transition: smooth },
};

// ─── Scale (popup / dropdown) ─────────────────────────────────────────────

export const scalePop: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: snappy },
  exit: { opacity: 0, scale: 0.92, transition: smooth },
};

export const scalePopDown: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: -8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: snappy },
  exit: { opacity: 0, scale: 0.95, y: -8, transition: smooth },
};

// ─── Page transition ──────────────────────────────────────────────────────

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...spring, staggerChildren: 0.06, delayChildren: 0.05 },
  },
  exit: { opacity: 0, y: -8, transition: smooth },
};

export const pageChild: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: spring },
};

// ─── List stagger ─────────────────────────────────────────────────────────

export const listContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

export const listItem: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: spring },
};

// ─── Card hover (apply via whileHover) ────────────────────────────────────

export const cardHover = {
  scale: 1.015,
  boxShadow:
    "0 12px 40px -8px rgba(79, 70, 229, 0.18), 0 4px 16px -4px rgba(0,0,0,0.10)",
  transition: snappy,
};

// ─── Button tap (apply via whileTap) ─────────────────────────────────────

export const buttonTap = { scale: 0.96, transition: snappy };

// ─── Notification / toast slide-in ────────────────────────────────────────

export const toastSlide: Variants = {
  hidden: { opacity: 0, x: 80, scale: 0.95 },
  visible: { opacity: 1, x: 0, scale: 1, transition: spring },
  exit: { opacity: 0, x: 80, scale: 0.95, transition: smooth },
};

// ─── Skeleton shimmer keyframes (use in tailwind animate-pulse or CSS) ────

export const shimmerVariants: Variants = {
  initial: { backgroundPosition: "-400px 0" },
  animate: {
    backgroundPosition: "400px 0",
    transition: { repeat: Infinity, duration: 1.4, ease: "linear" },
  },
};
