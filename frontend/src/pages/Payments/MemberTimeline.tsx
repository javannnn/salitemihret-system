import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

import { Card, Button, Badge } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import { api, ApiError, MemberDetail, Payment, listPayments } from "@/lib/api";

const STATUS_STYLES: Record<Payment["status"], string> = {
  Pending: "bg-amber-100 text-amber-900 border-amber-200",
  Completed: "bg-emerald-100 text-emerald-900 border-emerald-200",
  Overdue: "bg-rose-100 text-rose-900 border-rose-200",
};

export default function MemberPaymentTimeline() {
  const { memberId } = useParams<{ memberId: string }>();
  const permissions = usePermissions();
  const toast = useToast();
  const navigate = useNavigate();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [invalidMember, setInvalidMember] = useState(false);

  useEffect(() => {
    const numericId = Number(memberId);
    if (!memberId || Number.isNaN(numericId)) {
      setInvalidMember(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const detailPromise = api<MemberDetail>(`/members/${numericId}`).catch((error) => {
          if (error instanceof ApiError && error.status === 404) {
            return null;
          }
          throw error;
        });
        const [detail, ledger] = await Promise.all([
          detailPromise,
          listPayments({ member_id: numericId, page_size: 100 }),
        ]);
        if (!cancelled) {
          if (!detail) {
            setInvalidMember(true);
          } else {
            setMember(detail);
          }
          setPayments(ledger.items);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          toast.push("Failed to load payment history");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [memberId, toast]);

  const aggregates = useMemo(() => {
    const totals: Record<Payment["status"], number> = {
      Pending: 0,
      Completed: 0,
      Overdue: 0,
    };
    const sum = payments.reduce((acc, payment) => {
      totals[payment.status] += payment.amount;
      return acc + payment.amount;
    }, 0);
    return { totals, sum };
  }, [payments]);

  if (!permissions.viewPayments) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6" data-tour="payment-timeline">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="px-3" onClick={() => navigate("/payments")}
          >
            <ArrowLeft className="h-4 w-4" /> Back to ledger
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Payment history</h1>
            <p className="text-sm text-mute">Timeline view for member {member ? `#${member.id}` : ""}</p>
          </div>
        </div>
        {member && (
          <Button onClick={() => navigate(`/members/${member.id}/edit`)} className="inline-flex items-center gap-2">
            Manage member
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
      </div>

      {loading && (
        <Card className="p-10 flex flex-col items-center gap-3 text-mute">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading payment history…
        </Card>
      )}

      {!loading && member && (
        <Card className="p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-mute uppercase">Member</div>
            <div className="text-xl font-semibold">
              {member.first_name} {member.last_name}
            </div>
            <div className="text-sm text-mute">
              {member.email || "No email"} • {member.phone || "No phone"}
            </div>
          </div>
          <div className="flex gap-3">
            {(["Completed", "Pending", "Overdue"] as Payment["status"][]).map((status) => (
              <Card key={status} className="p-4 text-center min-w-[120px]">
                <div className="text-xs uppercase text-mute">{status}</div>
                <div className="text-lg font-semibold">
                  {aggregates.totals[status].toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}

      {!loading && payments.length === 0 && (
        <Card className="p-8 text-center text-mute">No payments recorded for this member yet.</Card>
      )}

      {!loading && invalidMember && payments.length > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50/70 text-sm text-amber-900">
          Member record no longer exists. Payments shown below remain in the ledger, but they are no longer linked to an active member.
        </Card>
      )}

      {!loading && !member && payments.length > 0 && (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase text-mute">Member</div>
            <div className="text-lg font-semibold">Former member #{memberId}</div>
            <div className="text-sm text-mute">Profile removed • timeline shows legacy payments</div>
          </div>
          <div className="flex gap-3">
            {(["Completed", "Pending", "Overdue"] as Payment["status"][]).map((status) => (
              <Card key={status} className="p-4 text-center min-w-[120px]">
                <div className="text-xs uppercase text-mute">{status}</div>
                <div className="text-lg font-semibold">
                  {aggregates.totals[status].toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}

      {!loading && payments.length > 0 && (
        <div className="relative pl-6">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-border" aria-hidden />
          {payments.map((payment) => (
            <div key={payment.id} className="relative mb-6 pl-3">
              <span className="absolute left-0 top-6 h-3 w-3 -translate-x-1 rounded-full bg-accent shadow-ring" />
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-mute">
                      {new Date(payment.posted_at).toLocaleString()}
                    </div>
                    <div className="text-xl font-semibold">
                      {payment.currency} {payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <Badge className={`${STATUS_STYLES[payment.status]} normal-case`}>
                    {payment.status}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs uppercase text-mute">Service</div>
                    <div className="font-medium">{payment.service_type.label}</div>
                    {payment.service_type.description && (
                      <div className="text-xs text-mute">{payment.service_type.description}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs uppercase text-mute">Method</div>
                    <div>{payment.method || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-mute">Due date</div>
                    <div>{payment.due_date ? new Date(payment.due_date).toLocaleDateString() : "—"}</div>
                  </div>
                </div>
                {payment.memo && (
                  <div className="mt-3 text-sm">
                    <div className="text-xs uppercase text-mute">Memo</div>
                    <p>{payment.memo}</p>
                  </div>
                )}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
