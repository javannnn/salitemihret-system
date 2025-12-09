import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Download, Loader2 } from "lucide-react";

import { Card, Button, Input, Select, Badge } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import {
  Member,
  Payment,
  PaymentListResponse,
  PaymentServiceType,
  PaymentSummaryItem,
  createPaymentEntry,
  correctPayment,
  getPaymentServiceTypes,
  getPaymentSummary,
  exportPaymentsReport,
  searchMembers,
  listPayments,
} from "@/lib/api";

const PAYMENT_METHODS = ["Cash", "Debit", "Credit", "E-Transfer", "Cheque"];
const PAYMENT_STATUSES = ["Pending", "Completed", "Overdue"] as const;
const PAGE_SIZE = 25;
const STATUS_BADGE_STYLES: Record<(typeof PAYMENT_STATUSES)[number], string> = {
  Pending: "bg-amber-100 text-amber-900 border-amber-200",
  Completed: "bg-emerald-100 text-emerald-900 border-emerald-200",
  Overdue: "bg-rose-100 text-rose-900 border-rose-200",
};

type Filters = {
  reference: string;
  service_type: string;
  member_id: string;
  start_date: string;
  end_date: string;
  method: string;
  status: string;
  member_name: string;
};

const INITIAL_FILTERS: Filters = {
  reference: "",
  service_type: "",
  member_id: "",
  start_date: "",
  end_date: "",
  method: "",
  status: "",
  member_name: "",
};

export default function PaymentsLedger() {
  const permissions = usePermissions();
  const toast = useToast();
  const [filters, setFilters] = useState<Filters>({ ...INITIAL_FILTERS });
  const [serviceTypes, setServiceTypes] = useState<PaymentServiceType[]>([]);
  const [summary, setSummary] = useState<PaymentSummaryItem[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [data, setData] = useState<PaymentListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [correction, setCorrection] = useState<Payment | null>(null);
  const [recordSaving, setRecordSaving] = useState(false);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [filterMemberOptions, setFilterMemberOptions] = useState<Member[]>([]);
  const [filterMemberLoading, setFilterMemberLoading] = useState(false);
  const canRecordPayments = permissions.managePayments;
  const readOnlyAccess = permissions.viewPayments && !permissions.managePayments;

  const loadData = useCallback(
    async (pageOverride?: number) => {
      if (!permissions.viewPayments) return;
      setLoading(true);
      try {
        const appliedFilters = {
          reference: filters.reference || undefined,
          service_type: filters.service_type || undefined,
          member_id: filters.member_id ? Number(filters.member_id) : undefined,
          start_date: filters.start_date || undefined,
          end_date: filters.end_date || undefined,
          method: filters.method || undefined,
          status: filters.status || undefined,
          member_name: filters.member_name || undefined,
        };
        const [types, ledger, summaryResponse] = await Promise.all([
          getPaymentServiceTypes(),
          listPayments({
            page: pageOverride ?? page,
            page_size: PAGE_SIZE,
            ...appliedFilters,
          }),
          getPaymentSummary({
            start_date: appliedFilters.start_date,
            end_date: appliedFilters.end_date,
          }),
        ]);
        setServiceTypes(types);
        setData(ledger);
        setSummary(summaryResponse.items);
        setGrandTotal(summaryResponse.grand_total);
      } catch (error) {
        console.error(error);
        toast.push("Failed to load payments ledger. Please refresh.");
      } finally {
        setLoading(false);
      }
    },
    [filters, page, permissions.viewPayments, toast]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!filters.member_name || filters.member_name.trim().length < 2) {
      setFilterMemberOptions([]);
      setFilterMemberLoading(false);
      return;
    }
    // If member_id is set, we assume the name is already synced/selected, so don't search again
    // unless the user is typing (which would have cleared member_id in the onChange handler)
    if (filters.member_id) {
      return;
    }

    let cancelled = false;
    setFilterMemberLoading(true);
    const handle = setTimeout(async () => {
      try {
        const results = await searchMembers(filters.member_name.trim(), 6);
        if (!cancelled) {
          setFilterMemberOptions(results.items);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) {
          setFilterMemberLoading(false);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [filters.member_name, filters.member_id]);

  const handleDownloadReport = async () => {
    if (reporting) return;
    setReporting(true);
    try {
      const blob = await exportPaymentsReport({
        reference: filters.reference || undefined,
        service_type: filters.service_type || undefined,
        member_id: filters.member_id ? Number(filters.member_id) : undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
        method: filters.method || undefined,
        status: filters.status || undefined,
        member_name: filters.member_name || undefined,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "payments_report.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.push("Payments report downloaded");
    } catch (error) {
      console.error(error);
      toast.push("Failed to export payments");
    } finally {
      setReporting(false);
    }
  };

  const displayPayments = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  if (!permissions.viewPayments) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments Ledger</h1>
          <p className="text-sm text-mute">Review contributions, school fees, donations, and corrections.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setFilters({ ...INITIAL_FILTERS });
              setPage(1);
              loadData(1);
            }}
          >
            Reset filters
          </Button>
          <Button
            variant="ghost"
            onClick={handleDownloadReport}
            disabled={reporting}
          >
            <Download className="h-4 w-4" />
            {reporting ? "Preparing…" : "Export report"}
          </Button>
          {canRecordPayments && (
            <Button data-tour="payments-record" onClick={() => setRecordDialogOpen(true)}>
              Record payment
            </Button>
          )}
        </div>
      </div>

      {readOnlyAccess && (
        <Card className="flex items-start gap-3 border border-amber-300 bg-amber-50/80 p-4 text-amber-900">
          <AlertCircle className="h-5 w-5 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Read-only access</p>
            <p className="text-sm">
              Office Administrators can review payments here. Contact Finance to record or correct entries.
            </p>
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-4" data-tour="payments-filters">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Service type</label>
            <Select
              value={filters.service_type}
              onChange={(event) => setFilters((prev) => ({ ...prev, service_type: event.target.value }))}
            >
              <option value="">All types</option>
              {serviceTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Method</label>
            <Select
              value={filters.method}
              onChange={(event) => setFilters((prev) => ({ ...prev, method: event.target.value }))}
            >
              <option value="">All</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Reference #</label>
            <Input
              value={filters.reference}
              onChange={(event) => setFilters((prev) => ({ ...prev, reference: event.target.value }))}
              placeholder="e.g., PAY-1234"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Status</label>
            <Select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="">All</option>
              {PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </div>
          <div className="relative">
            <label className="text-xs uppercase text-mute block mb-1">Member Name</label>
            <Input
              value={filters.member_name}
              onChange={(event) => {
                setFilters((prev) => ({
                  ...prev,
                  member_name: event.target.value,
                  member_id: "", // Clear ID when typing to switch to text search
                }));
              }}
              placeholder="Search by name"
              autoComplete="off"
            />
            {filters.member_name.length >= 2 && !filters.member_id && (
              <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-auto">
                {filterMemberLoading && (
                  <div className="p-2 text-xs text-mute flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                  </div>
                )}
                {!filterMemberLoading && filterMemberOptions.length === 0 && (
                  <div className="p-2 text-xs text-mute">No matches found</div>
                )}
                {!filterMemberLoading &&
                  filterMemberOptions.map((member) => (
                    <button
                      key={member.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent/10 transition-colors border-b border-border/50 last:border-0"
                      onClick={() => {
                        setFilters((prev) => ({
                          ...prev,
                          member_name: `${member.first_name} ${member.last_name}`,
                          member_id: String(member.id),
                        }));
                        setFilterMemberOptions([]);
                      }}
                    >
                      <div className="font-medium">
                        {member.first_name} {member.last_name}
                      </div>
                      <div className="text-xs text-mute">#{member.id}</div>
                    </button>
                  ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Member ID</label>
            <Input
              value={filters.member_id}
              onChange={(event) => setFilters((prev) => ({ ...prev, member_id: event.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Start date</label>
            <Input
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, start_date: event.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs uppercase text-mute block mb-1">End date</label>
            <Input
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilters((prev) => ({ ...prev, end_date: event.target.value }))}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setPage(1);
              loadData(1);
            }}
          >
            Apply filters
          </Button>
        </div>
      </Card>

      <div data-tour="payments-summary" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summary.length > 0 || grandTotal > 0 ? (
          <>
            {summary.map((item) => (
              <Card key={item.service_type_code} className="p-4">
                <div className="text-xs uppercase text-mute">{item.service_type_label}</div>
                <div className="text-2xl font-semibold mt-1">
                  {item.currency} {item.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </Card>
            ))}
            <Card className="p-4">
              <div className="text-xs uppercase text-mute">Grand total</div>
              <div className="text-2xl font-semibold mt-1">
                CAD {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </Card>
          </>
        ) : (
          <Card className="p-4">
            <div className="text-xs uppercase text-mute">Finance summary</div>
            <div className="text-sm text-mute">Totals appear once payments are available for this period.</div>
          </Card>
        )}
      </div>

      <Card className="overflow-x-auto" data-tour="payments-table">
        <table className="min-w-full text-sm">
          <thead className="bg-card/80 text-xs uppercase tracking-wide text-mute border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left">Ref</th>
              <th className="px-4 py-3 text-left">Posted</th>
              <th className="px-4 py-3 text-left">Member</th>
              <th className="px-4 py-3 text-left">Service</th>
              <th className="px-4 py-3 text-left">Method</th>
              <th className="px-4 py-3 text-left">Amount</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Due</th>
              <th className="px-4 py-3 text-left">Memo</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, index) => (
                <tr key={`loading-${index}`} className="border-b border-border/60">
                  <td className="px-4 py-3">
                    <div className="h-4 w-20 rounded bg-border animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-24 rounded bg-border animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-32 rounded bg-border animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-28 rounded bg-border animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-20 rounded bg-border animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-16 rounded bg-border animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-20 rounded bg-border animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-20 rounded bg-border animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-24 rounded bg-border animate-pulse" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="h-8 w-16 rounded bg-border animate-pulse" />
                  </td>
                </tr>
              ))}
            {!loading && displayPayments.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-sm text-mute">
                  No payments match your filters yet.
                </td>
              </tr>
            )}
            {!loading &&
              displayPayments.map((payment) => (
                <tr key={payment.id} className="border-b border-border/60">
                  <td className="px-4 py-3 font-mono text-xs text-mute">PAY-{String(payment.id).padStart(6, "0")}</td>
                  <td className="px-4 py-3">
                    {new Date(payment.posted_at).toLocaleString()}
                    {payment.correction_of_id && (
                      <Badge className="ml-2 bg-amber-50 text-amber-700 normal-case">Correction</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {payment.member ? (
                      <Link
                        to={`/payments/members/${payment.member.id}`}
                        className="group block rounded-xl border border-transparent px-2 py-1 transition hover:border-accent/30"
                      >
                        <div className="font-medium group-hover:text-accent">
                          {payment.member.first_name} {payment.member.last_name}
                        </div>
                        <div className="text-xs text-mute">
                          {payment.member.email ? payment.member.email : `Member #${payment.member.id}`}
                        </div>
                      </Link>
                    ) : (
                      <span className="text-mute">
                        {payment.member_id ? `Member #${payment.member_id}` : "Unassigned"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{payment.service_type.label}</div>
                    {payment.service_type.description && (
                      <div className="text-xs text-mute">{payment.service_type.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{payment.method || "—"}</td>
                  <td className="px-4 py-3 font-medium">
                    {payment.currency} {payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`${STATUS_BADGE_STYLES[payment.status]} normal-case`}>
                      {payment.status}
                    </Badge>
                  </td>
                  <td className={`px-4 py-3 ${payment.status === "Overdue" ? "text-rose-600 font-medium" : ""}`}>
                    {payment.due_date ? new Date(payment.due_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">{payment.memo || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {permissions.managePayments && !payment.correction_of_id && (
                      <Button
                        variant="ghost"
                        onClick={() => setCorrection(payment)}
                        className="text-xs"
                      >
                        Correct
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      {data && data.total > data.page_size && (
        <div className="flex items-center justify-between text-sm text-mute">
          <div>
            Page {data.page} of {totalPages} • {data.total.toLocaleString()} records
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                const prev = Math.max(1, page - 1);
                setPage(prev);
                loadData(prev);
              }}
              disabled={page <= 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const next = Math.min(totalPages, page + 1);
                setPage(next);
                loadData(next);
              }}
              disabled={page >= totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <RecordPaymentDialog
        open={recordDialogOpen}
        onClose={() => setRecordDialogOpen(false)}
        onSuccess={() => {
          setRecordDialogOpen(false);
          loadData(page);
        }}
        serviceTypes={serviceTypes}
        saving={recordSaving}
        setSaving={setRecordSaving}
        canRecordPayments={canRecordPayments}
      />

      <CorrectionDialog
        payment={correction}
        onClose={() => setCorrection(null)}
        onSuccess={() => {
          setCorrection(null);
          loadData(page);
        }}
        saving={correctionSaving}
        setSaving={setCorrectionSaving}
      />
    </div>
  );
}

function RecordPaymentDialog({
  open,
  onClose,
  onSuccess,
  serviceTypes,
  saving,
  setSaving,
  canRecordPayments,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  serviceTypes: PaymentServiceType[];
  saving: boolean;
  setSaving: (value: boolean) => void;
  canRecordPayments: boolean;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    amount: "",
    currency: "CAD",
    method: "",
    memo: "",
    service_type_code: "",
    member_id: "",
    due_date: "",
    status: "",
  });
  const [memberLookupQuery, setMemberLookupQuery] = useState("");
  const [memberOptions, setMemberOptions] = useState<Member[]>([]);
  const [memberLookupLoading, setMemberLookupLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  useEffect(() => {
    if (!open) {
      setForm({
        amount: "",
        currency: "CAD",
        method: "",
        memo: "",
        service_type_code: "",
        member_id: "",
        due_date: "",
        status: "",
      });
      setMemberLookupQuery("");
      setMemberOptions([]);
      setSelectedMember(null);
    }
  }, [open]);

  useEffect(() => {
    if (!memberLookupQuery || memberLookupQuery.trim().length < 2) {
      setMemberOptions([]);
      setMemberLookupLoading(false);
      return;
    }
    let cancelled = false;
    setMemberLookupLoading(true);
    const handle = setTimeout(async () => {
      try {
        const results = await searchMembers(memberLookupQuery.trim(), 6);
        if (!cancelled) {
          setMemberOptions(results.items);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) {
          setMemberLookupLoading(false);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [memberLookupQuery]);

  if (!open) return null;

  const selectedType = serviceTypes.find((type) => type.code === form.service_type_code);

  const handleSelectMember = (member: Member) => {
    setSelectedMember(member);
    setForm((prev) => ({ ...prev, member_id: String(member.id) }));
    setMemberLookupQuery("");
    setMemberOptions([]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!form.amount || Number(form.amount) <= 0) {
      toast.push("Amount must be greater than zero");
      return;
    }
    if (!form.service_type_code) {
      toast.push("Select a service type");
      return;
    }
    if (!canRecordPayments) {
      toast.push("You do not have permission to record payments.");
      return;
    }
    setSaving(true);
    try {
      await createPaymentEntry({
        amount: Number(form.amount),
        currency: form.currency || "CAD",
        method: form.method || undefined,
        memo: form.memo || undefined,
        service_type_code: form.service_type_code,
        member_id: form.member_id ? Number(form.member_id) : undefined,
        due_date: form.due_date || undefined,
        status: form.status || undefined,
      });
      toast.push("Payment recorded");
      onSuccess();
    } catch (error) {
      console.error(error);
      toast.push("Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <h3 className="text-lg font-semibold">Record payment</h3>
          <p className="text-sm text-mute">Finance Admins can record tithes, contributions, or donations.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Amount</label>
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
              required
            />
          </div>
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Currency</label>
            <Input
              value={form.currency}
              onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
            />
          </div>
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Service type</label>
            <Select
              value={form.service_type_code}
              onChange={(event) => setForm((prev) => ({ ...prev, service_type_code: event.target.value }))}
              required
            >
              <option value="">Select</option>
              {serviceTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.label}
                </option>
              ))}
            </Select>
            {selectedType?.description && (
              <p className="text-xs text-mute mt-1">{selectedType.description}</p>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase text-mute block">Link member (optional)</label>
            <Input
              value={memberLookupQuery}
              onChange={(event) => setMemberLookupQuery(event.target.value)}
              placeholder="Search by name, email, or phone"
            />
            <p className="text-xs text-mute mt-1">Type at least two characters to search existing members.</p>
          </div>
          {memberLookupQuery.trim().length >= 2 && (
            <Card className="p-2 border border-border/60 max-h-48 overflow-auto">
              {memberLookupLoading && (
                <div className="flex items-center gap-2 text-sm text-mute">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </div>
              )}
              {!memberLookupLoading && memberOptions.length === 0 && (
                <div className="text-xs text-mute">No matches yet.</div>
              )}
              {!memberLookupLoading && memberOptions.length > 0 && (
                <div className="space-y-2">
                  {memberOptions.map((member) => (
                    <button
                      type="button"
                      key={member.id}
                      className="w-full text-left rounded-xl border border-transparent px-3 py-2 hover:border-accent/40 hover:bg-accent/5 transition"
                      onClick={() => handleSelectMember(member)}
                    >
                      <div className="font-medium">
                        {member.first_name} {member.last_name}
                      </div>
                      <div className="text-xs text-mute">
                        #{member.id} {member.email ? `• ${member.email}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}
          {selectedMember && (
            <Card className="p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">
                  {selectedMember.first_name} {selectedMember.last_name}
                </div>
                <div className="text-xs text-mute">Linked as member #{selectedMember.id}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSelectedMember(null);
                  setForm((prev) => ({ ...prev, member_id: "" }));
                }}
              >
                Clear
              </Button>
            </Card>
          )}
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Member ID (manual entry)</label>
            <Input
              value={form.member_id}
              onChange={(event) => {
                setSelectedMember(null);
                setForm((prev) => ({ ...prev, member_id: event.target.value }));
              }}
              placeholder="Paste member ID if you know it"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Method</label>
            <Input
              value={form.method}
              onChange={(event) => setForm((prev) => ({ ...prev, method: event.target.value }))}
              placeholder="Cash, E-transfer, etc."
            />
          </div>
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Memo</label>
            <Input
              value={form.memo}
              onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
              placeholder="Optional note"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Due date</label>
            <Input
              type="date"
              value={form.due_date}
              onChange={(event) => setForm((prev) => ({ ...prev, due_date: event.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs uppercase text-mute block mb-1">Status</label>
            <Select
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="">Auto</option>
              {PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Card className="p-3 bg-accent/5 border-dashed">
          <p className="text-xs text-mute">
            Leave status blank to auto-detect based on the due date (Pending when the due date is in the future,
            Completed otherwise).
          </p>
        </Card>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save payment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CorrectionDialog({
  payment,
  onClose,
  onSuccess,
  saving,
  setSaving,
}: {
  payment: Payment | null;
  onClose: () => void;
  onSuccess: () => void;
  saving: boolean;
  setSaving: (value: boolean) => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!payment) {
      setReason("");
    }
  }, [payment]);

  if (!payment) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!reason.trim()) {
      toast.push("Correction reason is required");
      return;
    }
    setSaving(true);
    try {
      await correctPayment(payment.id, { correction_reason: reason.trim() });
      toast.push("Correction recorded");
      onSuccess();
    } catch (error) {
      console.error(error);
      toast.push("Failed to record correction");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <h3 className="text-lg font-semibold">Correct payment #{payment.id}</h3>
          <p className="text-sm text-mute">
            Original: {payment.currency} {payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} • {payment.service_type.label}
          </p>
        </div>
        <div>
          <label className="text-xs uppercase text-mute block mb-1">Reason</label>
          <textarea
            className="w-full rounded-xl border border-border bg-card/80 text-ink p-2 outline-none transition focus:border-accent focus:shadow-ring focus:shadow-accent/40"
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this payment needs to be corrected"
            required
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Recording…" : "Record correction"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-start justify-center px-4 py-6 sm:py-10 overflow-y-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} />
        <Card className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 mt-8 sm:mt-0">
          {children}
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
