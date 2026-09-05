import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Phone, Mail, ShieldCheck, ArrowUpRight, Ban, CheckCircle2 } from "lucide-react";
import { invoiceService } from "../services/invoice";
import { recoveryService } from "../services/recovery";
import { MoneyValue, TableToolbar, EmptyState, LoadingState, ErrorState } from "../components/ui/primitives";

interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  totalInvoices: number;
  openInvoices: number;
  totalBalance: number;
  isOptedOut: boolean;
  activeSessionId?: string;
  activeLane?: string;
  activeStrategy?: string;
  lastContactedAt?: string;
  preferredChannel?: string;
}

export function Customers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterOptOut, setFilterOptOut] = useState<"all" | "active" | "opted_out">("all");

  const { data: invoicesData, isLoading: invLoading, isError: invError } = useQuery({
    queryKey: ["invoices", { page: 1, limit: 200 }],
    queryFn: () => invoiceService.getInvoices({ page: 1, limit: 200 }),
  });

  const { data: sessionsData, isLoading: sessLoading } = useQuery({
    queryKey: ["recovery-sessions"],
    queryFn: recoveryService.getSessions,
  });

  if (invLoading || sessLoading) {
    return <LoadingState message="Aggregating debtor registry and contact records..." />;
  }

  if (invError) {
    return <ErrorState message="Could not fetch accounts receivable customer records." />;
  }

  const invoices = invoicesData?.data || [];
  const sessions = sessionsData?.sessions || [];

  // Map debtors from invoices & recovery sessions
  const customerMap = new Map<string, CustomerRecord>();

  invoices.forEach((inv) => {
    const key = (inv.contactEmail || inv.clientName || "Unknown Debtor").toLowerCase().trim();
    const existing = customerMap.get(key) || {
      id: inv.id,
      name: inv.clientName || "Unnamed Client",
      email: inv.contactEmail || "—",
      phone: ((inv as unknown as Record<string, unknown>).contactPhone as string | undefined),
      totalInvoices: 0,
      openInvoices: 0,
      totalBalance: 0,
      isOptedOut: false,
    };

    existing.totalInvoices += 1;
    if (inv.paymentStatus !== "Paid") {
      existing.openInvoices += 1;
      existing.totalBalance += parseFloat(String(inv.invoiceAmount || 0));
    }
    customerMap.set(key, existing);
  });

  // Cross-reference with recovery sessions for opt-out & active strategy
  sessions.forEach((s) => {
    const invoiceMatch = invoices.find((i) => i.id === s.invoiceId);
    const key = (invoiceMatch?.contactEmail || invoiceMatch?.clientName || s.invoiceId).toLowerCase().trim();
    const existing = customerMap.get(key);
    if (existing) {
      if (s.optedOut) existing.isOptedOut = true;
      if (s.status === "active") {
        existing.activeSessionId = s.id;
        existing.activeLane = s.incidentLane;
        existing.activeStrategy = s.strategy;
        existing.lastContactedAt = s.lastActionAt ? String(s.lastActionAt) : undefined;
      }
    } else {
      customerMap.set(key, {
        id: s.id,
        name: `Customer (${s.invoiceId.slice(0, 8)})`,
        email: "—",
        totalInvoices: 1,
        openInvoices: s.status === "recovered" ? 0 : 1,
        totalBalance: parseFloat(s.amountAtRisk || "0"),
        isOptedOut: !!s.optedOut,
        activeSessionId: s.id,
        activeLane: s.incidentLane,
        activeStrategy: s.strategy,
      });
    }
  });

  const allCustomers = Array.from(customerMap.values());

  const filtered = allCustomers.filter((c) => {
    const matchesSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search));

    const matchesOpt =
      filterOptOut === "all" ||
      (filterOptOut === "opted_out" && c.isOptedOut) ||
      (filterOptOut === "active" && !c.isOptedOut);

    return matchesSearch && matchesOpt;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-stone-200 text-stone-700">
              Debtor Directory
            </span>
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight mt-1">Customer Registry & Outreach Limits</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Monitors debtor exposure, active recovery cases, channel consents, and STOP opt-out compliance.
          </p>
        </div>
      </div>

      {/* Toolbar & Filter Tabs */}
      <div className="rounded-lg border border-stone-200 bg-white overflow-hidden shadow-2xs">
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search debtor name, email, phone..."
          totalCount={allCustomers.length}
          filteredCount={filtered.length}
          actions={
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <button
                onClick={() => setFilterOptOut("all")}
                className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${
                  filterOptOut === "all"
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                }`}
              >
                All Debtors ({allCustomers.length})
              </button>
              <button
                onClick={() => setFilterOptOut("opted_out")}
                className={`px-2.5 py-1 rounded-md border text-xs transition-colors flex items-center gap-1 ${
                  filterOptOut === "opted_out"
                    ? "bg-red-700 text-white border-red-700"
                    : "bg-stone-50 text-red-700 border-stone-200 hover:bg-stone-100"
                }`}
              >
                <Ban className="w-3 h-3" />
                <span>Opted-Out ({allCustomers.filter((c) => c.isOptedOut).length})</span>
              </button>
            </div>
          }
        />

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 font-semibold uppercase tracking-wider">
                <th className="py-2.5 px-4">Debtor Account</th>
                <th className="py-2.5 px-4">Contact Coordinates</th>
                <th className="py-2.5 px-4">Open Invoices</th>
                <th className="py-2.5 px-4">Total Liability</th>
                <th className="py-2.5 px-4">Recovery Pipeline</th>
                <th className="py-2.5 px-4">Contact Controls</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filtered.map((customer) => (
                <tr key={customer.id} className="hover:bg-stone-50/60 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-stone-900">{customer.name}</div>
                    <div className="text-[11px] text-stone-400 font-mono">ID: {customer.id.slice(0, 8)}</div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 text-stone-700">
                      <Mail className="w-3.5 h-3.5 text-stone-400" />
                      <span className="truncate max-w-[160px]">{customer.email}</span>
                    </div>
                    {customer.phone && (
                      <div className="flex items-center gap-1.5 text-stone-500 text-[11px] mt-0.5">
                        <Phone className="w-3 h-3 text-stone-400" />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    <span className="font-semibold text-stone-900 tabular-nums">{customer.openInvoices}</span>
                    <span className="text-stone-400 text-[11px]"> / {customer.totalInvoices} total</span>
                  </td>

                  <td className="py-3 px-4 font-semibold text-stone-900 tabular-nums">
                    <MoneyValue amount={customer.totalBalance} />
                  </td>

                  <td className="py-3 px-4">
                    {customer.activeSessionId ? (
                      <div>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-800 border border-stone-300">
                          {customer.activeLane?.replace("_", " ") || "In Progress"}
                        </span>
                        <div className="text-[10px] text-stone-500 mt-0.5 capitalize truncate max-w-[140px]">
                          {customer.activeStrategy?.replace("_", " ")}
                        </div>
                      </div>
                    ) : customer.openInvoices === 0 ? (
                      <span className="text-emerald-700 text-[11px] font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Fully Settled
                      </span>
                    ) : (
                      <span className="text-stone-400 text-[11px]">Standard Invoicing</span>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    {customer.isOptedOut ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200">
                        <Ban className="w-3 h-3 text-red-600" /> STOP Opt-Out Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" /> Outreach Permitted
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => navigate(`/invoices?search=${encodeURIComponent(customer.name)}`)}
                        className="p-1 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-100 border border-stone-200 text-xs"
                        title="View Customer Invoices"
                      >
                        Invoices
                      </button>
                      {customer.activeSessionId && (
                        <button
                          onClick={() => navigate(`/recovery?id=${customer.activeSessionId}`)}
                          className="p-1 rounded text-[#991B1B] hover:bg-stone-100 border border-stone-200 text-xs"
                          title="Open Case in Recovery Queue"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      title="No matching customers"
                      description="No debtors match the provided search or opt-out filter criteria."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
