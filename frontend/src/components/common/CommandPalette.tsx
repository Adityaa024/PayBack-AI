import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  TrendingUp,
  Bot,
  FileText,
  BarChart3,
  Settings,
  CreditCard,
  MessageSquare,
  Play,
  RefreshCw,
  Shield,
  Zap,
  Sparkles,
  X,
  History,
  CheckCircle2,
} from "lucide-react";

interface CommandItem {
  id: string;
  title: string;
  category: "Navigation" | "Actions" | "Simulation";
  shortcut?: string;
  icon: React.ElementType;
  color?: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerAction?: (actionName: string) => void;
}

export function CommandPalette({ isOpen, onClose, onTriggerAction }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        setSelectedIndex(0);
        setQuery("");
      }, 50);
    }
  }, [isOpen]);

  const items: CommandItem[] = [
    // Navigation
    {
      id: "nav-recovery",
      title: "Recovery Dashboard (Flagship Engine)",
      category: "Navigation",
      shortcut: "G R",
      icon: TrendingUp,
      color: "text-cyan-400",
      onSelect: () => {
        navigate("/recovery");
        onClose();
      },
    },
    {
      id: "nav-invoices",
      title: "Invoices Ledger & Accounts Receivable",
      category: "Navigation",
      shortcut: "G I",
      icon: FileText,
      color: "text-blue-400",
      onSelect: () => {
        navigate("/invoices");
        onClose();
      },
    },
    {
      id: "nav-agent",
      title: "Autopilot Collections Agent",
      category: "Navigation",
      shortcut: "G A",
      icon: Bot,
      color: "text-violet-400",
      onSelect: () => {
        navigate("/agent");
        onClose();
      },
    },
    {
      id: "nav-analytics",
      title: "Analytics & Recovery Yield Metrics",
      category: "Navigation",
      shortcut: "G Y",
      icon: BarChart3,
      color: "text-emerald-400",
      onSelect: () => {
        navigate("/analytics");
        onClose();
      },
    },
    {
      id: "nav-payment-plans",
      title: "Payment Plans & Instalments",
      category: "Navigation",
      icon: CreditCard,
      color: "text-amber-400",
      onSelect: () => {
        navigate("/payment-plans");
        onClose();
      },
    },
    {
      id: "nav-disputes",
      title: "Inquiries & Dispute Resolution",
      category: "Navigation",
      icon: MessageSquare,
      color: "text-rose-400",
      onSelect: () => {
        navigate("/disputes");
        onClose();
      },
    },
    {
      id: "nav-activity",
      title: "Activity Audit Log",
      category: "Navigation",
      icon: History,
      color: "text-zinc-400",
      onSelect: () => {
        navigate("/activity-log");
        onClose();
      },
    },
    {
      id: "nav-settings",
      title: "Merchant Settings & Policies",
      category: "Navigation",
      shortcut: "G S",
      icon: Settings,
      color: "text-zinc-400",
      onSelect: () => {
        navigate("/settings");
        onClose();
      },
    },

    // Actions
    {
      id: "action-batch",
      title: "Trigger Recovery Batch Scan (POST /api/recovery/run)",
      category: "Actions",
      shortcut: "Ctrl+B",
      icon: Zap,
      color: "text-amber-400",
      onSelect: () => {
        navigate("/recovery");
        onTriggerAction?.("trigger-batch");
        onClose();
      },
    },
    {
      id: "action-seed-50",
      title: "Seed 50 Recovery Scenarios (4 Lanes + 15% Holdout)",
      category: "Actions",
      icon: Sparkles,
      color: "text-cyan-400",
      onSelect: () => {
        navigate("/recovery");
        onTriggerAction?.("seed-50");
        onClose();
      },
    },
    {
      id: "action-ptp-check",
      title: "Check Broken Promises-to-Pay (Daily Cron)",
      category: "Actions",
      icon: RefreshCw,
      color: "text-violet-400",
      onSelect: () => {
        navigate("/recovery");
        onTriggerAction?.("check-ptp");
        onClose();
      },
    },

    // Simulation Acts
    {
      id: "act-1",
      title: "Run Act 1: Initial Batch Seeding",
      category: "Simulation",
      shortcut: "1",
      icon: Play,
      color: "text-cyan-400",
      onSelect: () => {
        navigate("/recovery");
        onTriggerAction?.("act-1");
        onClose();
      },
    },
    {
      id: "act-2",
      title: "Run Act 2: AI Diagnosis & Plan Evaluation",
      category: "Simulation",
      shortcut: "2",
      icon: Play,
      color: "text-blue-400",
      onSelect: () => {
        navigate("/recovery");
        onTriggerAction?.("act-2");
        onClose();
      },
    },
    {
      id: "act-3",
      title: "Run Act 3: Real Test Payment Simulation",
      category: "Simulation",
      shortcut: "3",
      icon: Play,
      color: "text-emerald-400",
      onSelect: () => {
        navigate("/recovery");
        onTriggerAction?.("act-3");
        onClose();
      },
    },
    {
      id: "act-4",
      title: "Run Act 4: Intelligent Non-Action (Stopping Rule / Opt-Out)",
      category: "Simulation",
      shortcut: "4",
      icon: Shield,
      color: "text-rose-400",
      onSelect: () => {
        navigate("/recovery");
        onTriggerAction?.("act-4");
        onClose();
      },
    },
    {
      id: "act-5",
      title: "Run Act 5: Incremental Proof & Holdout Comparison",
      category: "Simulation",
      shortcut: "5",
      icon: Play,
      color: "text-cyan-400",
      onSelect: () => {
        navigate("/recovery");
        onTriggerAction?.("act-5");
        onClose();
      },
    },
  ];

  const filteredItems = items.filter((item) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.shortcut && item.shortcut.toLowerCase().includes(q))
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
      e.preventDefault();
      filteredItems[selectedIndex].onSelect();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-xl bg-[#0c0e13]/95 backdrop-blur-2xl border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10"
          >
            {/* Search Input Box */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800/80 bg-white/[0.02]">
              <Search className="w-5 h-5 text-zinc-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or search (e.g. 'Recovery', 'Seed', 'Act 1')..."
                className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
              />
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Command List */}
            <div className="max-h-80 overflow-y-auto p-2 divide-y divide-transparent thin-scrollbar">
              {filteredItems.length === 0 ? (
                <div className="py-10 text-center text-xs text-zinc-500">
                  No matching commands found for &ldquo;{query}&rdquo;
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <motion.div
                      key={item.id}
                      onClick={item.onSelect}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/10 border border-cyan-500/30 text-white shadow-xs"
                          : "text-zinc-300 hover:bg-white/[0.03] border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0 ${
                            isSelected
                              ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                              : "bg-zinc-900 border-zinc-800 text-zinc-400"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate flex items-center gap-2">
                            <span>{item.title}</span>
                            {item.category === "Simulation" && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                                DEMO
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500">{item.category}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {item.shortcut && (
                          <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] font-mono text-zinc-400">
                            {item.shortcut}
                          </kbd>
                        )}
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-cyan-400 ml-1" />}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Footer Hints */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800/80 bg-black/40 text-[11px] text-zinc-500">
              <div className="flex items-center gap-3">
                <span>
                  Use <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">↑</kbd>{" "}
                  <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">↓</kbd> to navigate
                </span>
                <span>
                  <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">Enter</kbd> to select
                </span>
              </div>
              <div>
                <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">Esc</kbd> to close
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
