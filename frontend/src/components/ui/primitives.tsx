import React from "react";
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Search, RefreshCw, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Currency / Money Value ───────────────────────────────────────────────────

export interface MoneyValueProps {
  amount: number | string | undefined | null;
  currency?: string;
  compact?: boolean;
  className?: string;
  prefix?: string;
}

export function MoneyValue({
  amount,
  currency = "₹",
  compact = false,
  className = "",
  prefix = "",
}: MoneyValueProps) {
  const num = Number(amount ?? 0);
  if (isNaN(num)) return <span className={`tabular-nums font-mono ${className}`}>—</span>;

  let formatted: string;
  if (compact) {
    if (Math.abs(num) >= 10000000) {
      formatted = `${(num / 10000000).toFixed(2)}Cr`;
    } else if (Math.abs(num) >= 100000) {
      formatted = `${(num / 100000).toFixed(2)}L`;
    } else if (Math.abs(num) >= 1000) {
      formatted = `${(num / 1000).toFixed(1)}K`;
    } else {
      formatted = num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  } else {
    formatted = num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <span className={`tabular-nums font-medium ${className}`}>
      {prefix}{currency}{formatted}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

export interface StatusBadgeProps {
  status: string;
  isHoldout?: boolean;
  className?: string;
}

export function StatusBadge({ status, isHoldout, className = "" }: StatusBadgeProps) {
  if (isHoldout) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium tracking-wide uppercase bg-stone-100 text-stone-700 border border-stone-300 ${className}`}
        title="20% Holdout Control Arm — No Outreach"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-stone-500" />
        Holdout (Control)
      </span>
    );
  }

  const s = status?.toLowerCase() || "active";
  switch (s) {
    case "recovered":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium tracking-wide uppercase bg-emerald-50 text-emerald-800 border border-emerald-300 ${className}`}
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Recovered
        </span>
      );
    case "stopped":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium tracking-wide uppercase bg-red-50 text-red-800 border border-red-300 ${className}`}
        >
          <XCircle className="w-3 h-3 text-red-600" />
          Stopped
        </span>
      );
    case "escalated":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium tracking-wide uppercase bg-amber-50 text-amber-900 border border-amber-300 ${className}`}
        >
          <AlertTriangle className="w-3 h-3 text-amber-700" />
          Escalated
        </span>
      );
    case "active":
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium tracking-wide uppercase bg-stone-100 text-stone-800 border border-stone-300 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-stone-600 animate-pulse" />
          In Progress
        </span>
      );
  }
}

// ─── Policy State ─────────────────────────────────────────────────────────────

export interface PolicyStateProps {
  allowed: boolean;
  violations?: string[];
  requiresApproval?: boolean;
}

export function PolicyState({ allowed, violations = [], requiresApproval = false }: PolicyStateProps) {
  if (requiresApproval) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-300"
        title="Requires Explicit Human Approval (> ₹5L)"
      >
        <AlertTriangle className="w-3 h-3 text-amber-700" />
        Needs Approval
      </span>
    );
  }

  if (allowed && violations.length === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-300"
        title="Passed 8 Deterministic PolicyGuard Rules"
      >
        <ShieldCheck className="w-3 h-3 text-emerald-600" />
        Policy Clear
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-800 border border-red-300"
      title={violations.join(" | ") || "Blocked by PolicyGuard"}
    >
      <ShieldAlert className="w-3 h-3 text-red-600" />
      Policy Blocked
    </span>
  );
}

// ─── Table Toolbar ────────────────────────────────────────────────────────────

export interface TableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  totalCount: number;
  filteredCount: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  actions?: React.ReactNode;
}

export function TableToolbar({
  search,
  onSearchChange,
  placeholder = "Search cases, invoices, debtors...",
  totalCount,
  filteredCount,
  onRefresh,
  isRefreshing,
  actions,
}: TableToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-white border-b border-stone-200">
      <div className="flex items-center gap-2.5 flex-1 w-full sm:w-auto">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-9 pr-7 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-md text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <span className="text-xs text-stone-500 font-medium tabular-nums hidden sm:inline">
          {filteredCount === totalCount ? `${totalCount} records` : `${filteredCount} of ${totalCount} filtered`}
        </span>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-md border border-stone-200 transition-colors"
            title="Refresh Table"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {actions && <div className="flex items-center gap-2 w-full sm:w-auto justify-end">{actions}</div>}
    </div>
  );
}

// ─── Empty & Error States ─────────────────────────────────────────────────────

export function EmptyState({
  title = "No records found",
  description = "There are no cases matching the selected filters.",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white border border-dashed border-stone-300 rounded-lg my-4">
      <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-500 mb-3">
        <Search className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-stone-900 mb-1">{title}</h3>
      <p className="text-xs text-stone-500 max-w-sm mb-4">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Failed to load operational data",
  message = "An error occurred while communicating with the service.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-red-50/50 border border-red-200 rounded-lg my-4">
      <div className="w-10 h-10 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600 mb-3">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-red-900 mb-1">{title}</h3>
      <p className="text-xs text-red-700 max-w-md mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1.5 text-xs font-medium bg-white text-red-700 border border-red-300 rounded-md hover:bg-red-50 shadow-xs"
        >
          Retry Request
        </button>
      )}
    </div>
  );
}

export function LoadingState({ message = "Loading operational telemetry..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <RefreshCw className="w-6 h-6 text-stone-400 animate-spin mb-3" />
      <span className="text-xs text-stone-500 font-medium">{message}</span>
    </div>
  );
}

// ─── Side Panel (Drawer) ──────────────────────────────────────────────────────

export interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export function SidePanel({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-2xl",
}: SidePanelProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-stone-900/30 backdrop-blur-[2px]"
          />

          {/* Drawer Container */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className={`w-screen ${width} bg-white border-l border-stone-200 shadow-xl flex flex-col`}
            >
              {/* Header */}
              <div className="p-4 border-b border-stone-200 flex items-start justify-between bg-stone-50/50">
                <div className="min-w-0 pr-4">
                  <h2 className="text-base font-semibold text-stone-900 truncate">{title}</h2>
                  {subtitle && <div className="text-xs text-stone-500 mt-0.5">{subtitle}</div>}
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#FAF9F6]">
                {children}
              </div>

              {/* Footer */}
              {footer && (
                <div className="p-4 border-t border-stone-200 bg-white flex items-center justify-end gap-2">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
