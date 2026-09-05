import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoiceService } from '../services/invoice';
import { Loader2, AlertCircle, CheckCircle, XCircle, Calendar, RefreshCw, ChevronLeft, ChevronRight, Layers, FileText, CheckCircle2 } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';

interface PaymentPlanRequest {
  id: string;
  invoiceId: string;
  invoiceNo: string;
  clientName: string;
  invoiceAmount: string;
  currency: string;
  installments: number;
  proposedAmountPerMonth: string;
  reason?: string | null;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  createdAt: string;
}

export function PaymentPlans() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'denied' | 'cancelled' | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [denyingPlan, setDenyingPlan] = useState<PaymentPlanRequest | null>(null);
  const limit = 10;

  const { data: plansResponse, isLoading, refetch } = useQuery({
    queryKey: ['paymentPlans', statusFilter, page],
    queryFn: () => invoiceService.getPaymentPlans({ page, limit, status: statusFilter }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => invoiceService.approvePaymentPlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentPlans'] });
      setSuccessNotice('Payment plan approved and installment schedule activated.');
      setTimeout(() => setSuccessNotice(null), 3500);
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to approve payment plan request.');
    },
  });

  const denyMutation = useMutation({
    mutationFn: (id: string) => invoiceService.denyPaymentPlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentPlans'] });
      setDenyingPlan(null);
      setSuccessNotice('Payment plan proposal declined.');
      setTimeout(() => setSuccessNotice(null), 3500);
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to deny payment plan request.');
    },
  });

  const formatCurrency = (amount: string, currencyCode: string) => {
    try {
      const num = parseFloat(amount);
      if (isNaN(num)) return `${currencyCode} ${amount}`;
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currencyCode || 'INR',
        maximumFractionDigits: 2,
      }).format(num);
    } catch {
      return `${currencyCode} ${amount}`;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const plansList = (plansResponse?.data || []) as PaymentPlanRequest[];
  const pagination = plansResponse?.pagination || { total: 0, totalPages: 1 };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="success" className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md px-2 py-0.5 text-[11px] font-semibold">Approved</Badge>;
      case 'denied':
        return <Badge variant="danger" className="bg-red-50 text-red-700 border border-red-200 rounded-md px-2 py-0.5 text-[11px] font-semibold">Denied</Badge>;
      case 'cancelled':
        return <Badge variant="warning" className="bg-stone-100 text-stone-600 border border-stone-300 rounded-md px-2 py-0.5 text-[11px] font-semibold">Cancelled</Badge>;
      default:
        return <Badge variant="warning" className="bg-amber-50 text-amber-800 border border-amber-200 rounded-md px-2 py-0.5 text-[11px] font-semibold">Pending Review</Badge>;
    }
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-10">
      {/* Top Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-stone-900 text-white">
              Promise-to-Pay Tracker
            </span>
            <span className="text-xs text-stone-500 font-mono">
              Debtor Installments & Schedules
            </span>
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight mt-1">Payment Plan Management</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Review and manage installment plan proposals submitted by debtors to prevent complete write-offs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {successNotice && (
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 flex items-center gap-1 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" /> {successNotice}
            </span>
          )}
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 text-stone-500" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-stone-100 border border-stone-300 rounded-lg w-fit">
        {(['pending', 'approved', 'denied', 'cancelled', 'all'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setStatusFilter(tab);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === tab
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {tab === 'pending' ? 'Pending Review' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="space-y-3.5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white border border-stone-200 rounded-lg">
            <Loader2 className="h-7 w-7 animate-spin text-stone-400 mb-3" />
            <p className="text-xs text-stone-500">Loading plan proposals...</p>
          </div>
        ) : plansList.length === 0 ? (
          <div className="border border-dashed border-stone-300 bg-white rounded-lg py-16 px-6 text-center flex flex-col items-center justify-center space-y-3 shadow-2xs">
            <div className="w-12 h-12 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm">No proposals found</h3>
            <p className="text-xs text-stone-500 max-w-sm leading-relaxed">
              There are no payment plan proposals currently in '{statusFilter}' status.
            </p>
          </div>
        ) : (
          <div className="grid gap-3.5">
            {plansList.map((plan) => (
              <div
                key={plan.id}
                className="bg-white border border-stone-200 rounded-lg overflow-hidden shadow-2xs hover:border-stone-300 transition-all"
              >
                <div className="bg-stone-50/90 border-b border-stone-200 py-2.5 px-4 flex flex-row items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Link
                      to={`/invoices/${plan.invoiceId}`}
                      className="font-bold text-xs text-stone-900 hover:text-stone-700 transition-colors inline-flex items-center gap-1.5 font-mono"
                    >
                      <FileText className="h-3.5 w-3.5 text-stone-500" />
                      #{plan.invoiceNo}
                    </Link>
                    {getStatusBadge(plan.status)}
                  </div>
                  <div className="text-[11px] text-stone-500 flex items-center">
                    <Calendar className="h-3.5 w-3.5 mr-1 text-stone-400" />
                    Submitted {formatDate(plan.createdAt)}
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* 4 Metrics in 1 single horizontal row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
                      <div>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">Client Name</p>
                        <p className="text-xs font-semibold text-stone-900 mt-0.5 truncate">{plan.clientName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">Invoice Balance</p>
                        <p className="text-xs font-bold text-stone-900 mt-0.5 font-mono">
                          {formatCurrency(plan.invoiceAmount, plan.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">Proposed Terms</p>
                        <p className="text-xs font-semibold text-stone-800 mt-0.5">{plan.installments} Monthly Payments</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">Monthly Payout</p>
                        <p className="text-xs font-bold text-emerald-800 mt-0.5 font-mono">
                          {formatCurrency(plan.proposedAmountPerMonth, plan.currency)} / mo
                        </p>
                      </div>
                    </div>

                    {/* Actions pane - only visible when pending */}
                    {plan.status === 'pending' && (
                      <div className="flex items-center gap-2 lg:pl-4 lg:border-l lg:border-stone-200 flex-shrink-0">
                        <button
                          onClick={() => approveMutation.mutate(plan.id)}
                          disabled={approveMutation.isPending || denyMutation.isPending}
                          className="inline-flex items-center justify-center rounded-md text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white h-8 px-3.5 transition-all disabled:opacity-50 shadow-2xs cursor-pointer whitespace-nowrap"
                        >
                          {approveMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          ) : (
                            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Approve Plan
                        </button>
                        <button
                          onClick={() => setDenyingPlan(plan)}
                          disabled={approveMutation.isPending || denyMutation.isPending}
                          className="inline-flex items-center justify-center rounded-md text-xs font-semibold bg-white border border-stone-300 hover:bg-red-50 text-red-700 h-8 px-3.5 transition-all disabled:opacity-50 shadow-2xs cursor-pointer whitespace-nowrap"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                          Deny
                        </button>
                      </div>
                    )}
                  </div>

                  {plan.reason && (
                    <div className="mt-3 pt-2.5 border-t border-stone-200 text-xs text-stone-600 flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-stone-500 flex-shrink-0">Debtor Note:</span>
                      <span className="italic text-stone-700 truncate">&ldquo;{plan.reason}&rdquo;</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-stone-200">
                <span className="text-xs text-stone-500">
                  Page {page} of {pagination.totalPages} ({pagination.total} total proposals)
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 h-7 px-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page >= pagination.totalPages}
                    className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 h-7 px-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Deny Confirmation Modal */}
      {denyingPlan && (
        <Modal
          isOpen={!!denyingPlan}
          onClose={() => setDenyingPlan(null)}
          title="Deny Payment Plan Proposal"
          className="max-w-md"
        >
          <div className="space-y-4 text-stone-900">
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">Invoice No:</span>
                <span className="font-bold text-stone-900 font-mono">#{denyingPlan.invoiceNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Client:</span>
                <span className="font-medium text-stone-900">{denyingPlan.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Invoice Balance:</span>
                <span className="font-bold text-stone-900 font-mono">{formatCurrency(denyingPlan.invoiceAmount, denyingPlan.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Proposed Terms:</span>
                <span className="font-bold text-emerald-800 font-mono">{denyingPlan.installments} Months ({formatCurrency(denyingPlan.proposedAmountPerMonth, denyingPlan.currency)}/mo)</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setDenyingPlan(null)}
                disabled={denyMutation.isPending}
                className="inline-flex items-center justify-center rounded-md text-xs font-semibold border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 h-8 px-3.5 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  denyMutation.mutate(denyingPlan.id);
                }}
                disabled={denyMutation.isPending}
                className="inline-flex items-center justify-center rounded-md text-xs font-semibold bg-red-700 text-white hover:bg-red-800 disabled:opacity-50 h-8 px-3.5 gap-1.5 transition-all cursor-pointer"
              >
                {denyMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Denying...
                  </>
                ) : (
                  "Confirm Deny"
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
