import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, X } from "lucide-react";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const shortcuts = [
    { key: "Ctrl + K", desc: "Open Command Palette & search" },
    { key: "1 - 5", desc: "Trigger Demo Acts 1 through 5" },
    { key: "/", desc: "Focus search bar" },
    { key: "R", desc: "Refresh recovery sessions" },
    { key: "Esc", desc: "Close any modal or audit drawer" },
    { key: "?", desc: "Show keyboard shortcuts" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md bg-[#0d0f14]/95 backdrop-blur-2xl border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden p-6 z-10 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2.5 text-white">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
                  <p className="text-xs text-zinc-400">Navigate PayBack-AI faster</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              {shortcuts.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                >
                  <span className="text-xs text-zinc-300">{s.desc}</span>
                  <kbd className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-xs font-mono text-cyan-300 font-semibold shadow-xs">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>

            <div className="text-center pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white font-medium transition-colors"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
