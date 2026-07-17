import { motion } from 'framer-motion';
import { Rocket, Terminal } from 'lucide-react';

/**
 * Placeholder landing page for the generic skeleton. Replace this with your
 * app's real first screen. Build features with `/new-module` or `/build-loop`
 * in Claude Code.
 */
export function HomePage(): JSX.Element {
  return (
    <main className="min-h-screen grid place-items-center bg-[var(--base-tint)] p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="floating-card rounded-2xl shadow-floating-card max-w-lg w-full p-8 text-center"
      >
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[var(--primary-bg-tint)]">
          <Rocket className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-heading text-2xl text-[var(--primary-text-color)]">
          Boilerplate ready
        </h1>
        <p className="mt-2 text-sm text-[var(--secondary-text-color)]">
          This is a generic starter — no application code ships with it. The value is the AI-agent
          layer, the memory system, and the build tooling for web, PWA, Android, iOS, and desktop.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-[var(--primary-bg-tint)] px-4 py-3 font-mono text-sm text-primary">
          <Terminal className="h-4 w-4" />
          /design-first → /build-loop &lt;module&gt;
        </div>
        <p className="mt-4 text-xs text-[var(--secondary-text-color)]">
          Start Claude Code and describe what you want to build.
        </p>
      </motion.div>
    </main>
  );
}
