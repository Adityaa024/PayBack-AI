import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X, Zap } from "lucide-react";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type?: "success" | "warning" | "info" | "action";
}

interface NotificationToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function NotificationToast({ toasts, onDismiss }: NotificationToastProps) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const type = toast.type || "success";
          const icons = {
            success: <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
            warning: <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />,
            info: <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />,
            action: <Zap className="w-4 h-4 text-violet-400 flex-shrink-0" />,
          };

          const borders = {
            success: "border-emerald-500/30 bg-emerald-950/40 text-emerald-200",
            warning: "border-amber-500/30 bg-amber-950/40 text-amber-200",
            info: "border-cyan-500/30 bg-cyan-950/40 text-cyan-200",
            action: "border-violet-500/30 bg-violet-950/40 text-violet-200",
          };

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={`pointer-events-auto p-3.5 rounded-xl border backdrop-blur-xl shadow-2xl flex items-start gap-3 ${borders[type]}`}
            >
              <div className="mt-0.5">{icons[type]}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white tracking-wide">{toast.title}</div>
                {toast.description && (
                  <div className="text-[11px] text-zinc-300 mt-0.5 leading-snug">{toast.description}</div>
                )}
              </div>
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-zinc-400 hover:text-white transition-colors p-0.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
