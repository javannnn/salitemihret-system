import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Copy, Loader2, PauseCircle, PlayCircle, XCircle } from "lucide-react";

import { Badge, Button, Card, Textarea } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import {
  ApiError,
  Sponsorship,
  SponsorshipNote,
  SponsorshipNotesListResponse,
  SponsorshipSponsorContext,
  SponsorshipTimelineResponse,
  createSponsorshipNote,
  getSponsorContext,
  getSponsorship,
  getSponsorshipTimeline,
  listSponsorshipNotes,
  remindSponsorship,
  transitionSponsorshipStatus,
} from "@/lib/api";

type StatusModalState = {
  open: boolean;
  nextStatus: Sponsorship["status"] | null;
  title: string;
  reasonRequired: boolean;
};

const STATUS_STYLES: Record<Sponsorship["status"], string> = {
  Draft: "bg-slate-50 text-slate-600 border-slate-200",
  Submitted: "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-sky-50 text-sky-700 border-sky-200",
  Rejected: "bg-rose-50 text-rose-600 border-rose-200",
  Active: "bg-emerald-50 text-emerald-600 border-emerald-200",
  Suspended: "bg-orange-50 text-orange-700 border-orange-200",
  Completed: "bg-zinc-50 text-zinc-600 border-zinc-200",
  Closed: "bg-neutral-50 text-neutral-600 border-neutral-200",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
}

function caseId(id: number) {
  return `SP-${String(id).padStart(4, "0")}`;
}

function beneficiaryLabel(record: Sponsorship) {
  if (record.newcomer) {
    return {
      label: `${record.newcomer.first_name} ${record.newcomer.last_name}`.trim(),
      type: "Newcomer",
      status: record.newcomer.status,
    };
  }
  if (record.beneficiary_member) {
    return {
      label: `${record.beneficiary_member.first_name} ${record.beneficiary_member.last_name}`.trim(),
      type: "Member",
      status: null,
    };
  }
  return {
    label: record.beneficiary_name,
    type: "External",
    status: null,
  };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function buildWhatsAppMessage(record: Sponsorship, sponsorName: string) {
  const beneficiary = beneficiaryLabel(record).label;
  const pledge = formatCurrency(record.monthly_amount);
  const frequency = record.frequency || "Monthly";
  return [
    `Hello ${sponsorName},`,
    `This is a reminder about your sponsorship pledge for ${beneficiary}.`,
    `Pledge: ${pledge} (${frequency}).`,
    `Case: SP-${String(record.id).padStart(4, "0")}`,
    "Thank you for your support.",
  ].join("\n");
}

export default function SponsorshipCaseProfile() {
  const { id } = useParams<{ id: string }>();
  const permissions = usePermissions();
  const toast = useToast();
  const navigate = useNavigate();
  const canView = permissions.viewSponsorships || permissions.manageSponsorships;
  const canManage = permissions.manageSponsorships;
  const canApprove = permissions.hasRole("Admin") || permissions.isSuperAdmin;
  const numericId = Number(id);

  const [loading, setLoading] = useState(true);
  const [sponsorship, setSponsorship] = useState<Sponsorship | null>(null);
  const [timeline, setTimeline] = useState<SponsorshipTimelineResponse | null>(null);
  const [notes, setNotes] = useState<SponsorshipNotesListResponse | null>(null);
  const [sponsorContext, setSponsorContext] = useState<SponsorshipSponsorContext | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [statusModal, setStatusModal] = useState<StatusModalState>({
    open: false,
    nextStatus: null,
    title: "",
    reasonRequired: false,
  });
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const beneficiary = useMemo(() => (sponsorship ? beneficiaryLabel(sponsorship) : null), [sponsorship]);

  useEffect(() => {
    if (!canView) return;
    if (!id || Number.isNaN(numericId)) {
      setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const detail = await getSponsorship(numericId);
        if (!active) return;
        setSponsorship(detail);
        const [timelineData, notesData, context] = await Promise.all([
          getSponsorshipTimeline(numericId),
          listSponsorshipNotes(numericId),
          getSponsorContext(detail.sponsor.id),
        ]);
        if (!active) return;
        setTimeline(timelineData);
        setNotes(notesData);
        setSponsorContext(context);
      } catch (error) {
        console.error(error);
        if (error instanceof ApiError && error.status === 404) {
          toast.push("Sponsorship case not found.");
        } else {
          toast.push("Unable to load sponsorship case.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [canView, id, numericId, toast]);

  const refreshNotes = async () => {
    if (!sponsorship) return;
    const data = await listSponsorshipNotes(sponsorship.id);
    setNotes(data);
  };

  const refreshTimeline = async () => {
    if (!sponsorship) return;
    const data = await getSponsorshipTimeline(sponsorship.id);
    setTimeline(data);
  };

  const handleNoteSubmit = async () => {
    if (!sponsorship || !noteDraft.trim()) return;
    setNoteSubmitting(true);
    try {
      await createSponsorshipNote(sponsorship.id, { note: noteDraft.trim() });
      setNoteDraft("");
      await refreshNotes();
      toast.push("Note added.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to add note.");
    } finally {
      setNoteSubmitting(false);
    }
  };

  const openStatusModal = (nextStatus: Sponsorship["status"], title: string, reasonRequired: boolean) => {
    setStatusReason("");
    setStatusModal({ open: true, nextStatus, title, reasonRequired });
  };

  const handleStatusTransition = async () => {
    if (!sponsorship || !statusModal.nextStatus) return;
    if (statusModal.reasonRequired && !statusReason.trim()) return;
    setStatusSubmitting(true);
    try {
      const updated = await transitionSponsorshipStatus(sponsorship.id, {
        status: statusModal.nextStatus,
        reason: statusReason.trim() || undefined,
      });
      setSponsorship(updated);
      await refreshTimeline();
      toast.push("Case updated.");
      setStatusModal({ open: false, nextStatus: null, title: "", reasonRequired: false });
    } catch (error) {
      console.error(error);
      toast.push("Unable to update case.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleSendReminder = async () => {
    if (!sponsorship) return;
    setReminderSending(true);
    try {
      const updated = await remindSponsorship(sponsorship.id);
      setSponsorship(updated);
      toast.push("Reminder sent.");
      if (updated.reminder_channel === "WhatsApp") {
        const sponsorName = `${updated.sponsor.first_name} ${updated.sponsor.last_name}`.trim();
        setWhatsappMessage(buildWhatsAppMessage(updated, sponsorName));
        setWhatsappModalOpen(true);
      }
    } catch (error) {
      console.error(error);
      toast.push("Unable to send reminder.");
    } finally {
      setReminderSending(false);
    }
  };

  const handleCopyMessage = async () => {
    if (!whatsappMessage) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(whatsappMessage);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = whatsappMessage;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      toast.push("Message copied.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to copy message.");
    }
  };

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!id || Number.isNaN(numericId)) {
    return <Navigate to="/sponsorships" replace />;
  }

  if (!loading && !sponsorship) {
    return <Navigate to="/sponsorships" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/sponsorships")}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {sponsorship ? caseId(sponsorship.id) : "Sponsorship case"}
              </h1>
              {sponsorship && (
                <Badge variant="outline" className={STATUS_STYLES[sponsorship.status]}>
                  {sponsorship.status}
                </Badge>
              )}
            </div>
            <p className="text-sm text-mute">
              {sponsorship ? `Created ${formatDate(sponsorship.created_at)}` : "Case profile"}
            </p>
          </div>
        </div>
        {sponsorship && canManage && (
          <div className="flex flex-wrap gap-2">
            {sponsorship.status === "Draft" && (
              <Button variant="ghost" onClick={() => navigate(`/sponsorships?draft=${sponsorship.id}`)}>
                Continue draft
              </Button>
            )}
            {sponsorship.status === "Draft" && (
              <Button onClick={() => openStatusModal("Submitted", "Submit case", false)}>
                Submit
              </Button>
            )}
            {sponsorship.status === "Submitted" && (
              <>
                <Button
                  disabled={!canApprove}
                  onClick={() => openStatusModal("Approved", "Approve case", true)}
                >
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  disabled={!canApprove}
                  onClick={() => openStatusModal("Rejected", "Reject case", true)}
                >
                  Reject
                </Button>
              </>
            )}
            {sponsorship.status === "Approved" && (
              <Button onClick={() => openStatusModal("Active", "Activate case", false)}>
                Activate
              </Button>
            )}
            {sponsorship.status === "Active" && (
              <>
                <Button
                  variant="ghost"
                  onClick={handleSendReminder}
                  disabled={reminderSending}
                >
                  {reminderSending ? "Sending reminder..." : "Send reminder"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => openStatusModal("Suspended", "Suspend case", false)}
                >
                  Suspend
                </Button>
                <Button onClick={() => openStatusModal("Completed", "Complete case", false)}>
                  Complete
                </Button>
              </>
            )}
            {sponsorship.status === "Suspended" && (
              <Button onClick={() => openStatusModal("Active", "Resume case", false)}>
                Resume
              </Button>
            )}
          </div>
        )}
      </div>

      {loading && (
        <Card className="p-10 flex flex-col items-center gap-3 text-mute">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading case details...
        </Card>
      )}

      {!loading && sponsorship && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4 space-y-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm uppercase text-mute">Sponsor</h2>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/members/${sponsorship.sponsor.id}/edit`)}>
                  View member profile
                </Button>
              </div>
              <div>
                <p className="text-lg font-semibold">
                  {sponsorship.sponsor.first_name} {sponsorship.sponsor.last_name}
                </p>
                <Badge variant="outline" className="mt-2">
                  {sponsorContext?.member_status || "Unknown"}
                </Badge>
              </div>
              <div className="text-sm text-mute space-y-1">
                <div>Last sponsorship: {formatDate(sponsorContext?.last_sponsorship_date)}</div>
                <div>Last status: {sponsorContext?.last_sponsorship_status || "-"}</div>
                <div>12-mo history: {sponsorContext?.history_count_last_12_months ?? 0}</div>
                <div>Volunteer services: {sponsorContext?.volunteer_services?.join(", ") || "-"}</div>
                <div>Father of repentance: {sponsorContext?.father_of_repentance_name || "-"}</div>
                {sponsorContext?.marital_status === "Married" && (
                  <div>
                    Spouse: {sponsorContext.spouse_name || "Not set in family profile"}
                    {sponsorContext.spouse_phone ? ` • ${sponsorContext.spouse_phone}` : ""}
                    {sponsorContext.spouse_email ? ` • ${sponsorContext.spouse_email}` : ""}
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-4 space-y-2">
              <h2 className="text-sm uppercase text-mute">Beneficiary</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold">{beneficiary?.label}</p>
                  <p className="text-sm text-mute">{beneficiary?.type}</p>
                  {beneficiary?.status && (
                    <Badge variant="outline" className="mt-2">
                      {beneficiary.status}
                    </Badge>
                  )}
                </div>
                {sponsorship.newcomer && (
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/newcomers/${sponsorship.newcomer?.id}`)}>
                    Open profile
                  </Button>
                )}
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <h2 className="text-sm uppercase text-mute">Case info</h2>
              <div className="text-sm space-y-1">
                <div>Frequency: {sponsorship.frequency}</div>
                <div>Reminder channel: {sponsorship.reminder_channel || "-"}</div>
                <div>Last reminder: {formatDateTime(sponsorship.reminder_last_sent)}</div>
                <div>Next reminder: {formatDateTime(sponsorship.reminder_next_due)}</div>
                <div>Last sponsored date: {formatDate(sponsorship.last_sponsored_date)}</div>
                <div>Payment information: {sponsorship.payment_information || "-"}</div>
                <div>
                  Last sponsored status: {sponsorship.last_status || "-"}
                  {sponsorship.last_status === "Rejected" && sponsorship.last_status_reason
                    ? ` (${sponsorship.last_status_reason})`
                    : ""}
                </div>
                <div>Start date: {formatDate(sponsorship.start_date)}</div>
                <div>Expected end: {formatDate(sponsorship.end_date)}</div>
                <div>
                  Budget round:{" "}
                  {sponsorship.budget_round
                    ? `Round ${sponsorship.budget_round.round_number} (${sponsorship.budget_round.year})`
                    : "-"}
                </div>
                <div>
                  Budget period: {sponsorship.budget_month && sponsorship.budget_year
                    ? `${sponsorship.budget_month}/${sponsorship.budget_year}`
                    : "-"}
                </div>
                <div>Budget slots: {sponsorship.budget_slots ?? "-"}</div>
                <div>Used slots: {sponsorship.used_slots ?? 0}</div>
                {sponsorship.notes && (
                  <div className="pt-2">
                    <div className="text-xs uppercase text-mute">Case summary</div>
                    <p className="text-sm text-ink mt-1 whitespace-pre-wrap">{sponsorship.notes}</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-5">
            <Card className="p-4 h-full">
              <h2 className="text-sm uppercase text-mute mb-4">Timeline</h2>
              {timeline?.items.length ? (
                <div className="relative pl-6">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-border" aria-hidden />
                  {timeline.items.map((event) => (
                    <div key={event.id} className="relative mb-6 pl-3">
                      <span className="absolute left-0 top-5 h-3 w-3 -translate-x-1 rounded-full bg-accent shadow-ring" />
                      <Card className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs text-mute">{formatDateTime(event.occurred_at)}</div>
                            <div className="text-base font-semibold text-ink">{event.label}</div>
                          </div>
                          {event.event_type === "Approval" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                          {event.event_type === "Suspension" && <PauseCircle className="h-5 w-5 text-orange-500" />}
                          {event.event_type === "Reactivation" && <PlayCircle className="h-5 w-5 text-sky-500" />}
                          {event.event_type === "Rejection" && <XCircle className="h-5 w-5 text-rose-500" />}
                        </div>
                        {event.reason && (
                          <p className="mt-2 text-sm text-mute">{event.reason}</p>
                        )}
                        <div className="mt-2 text-xs text-mute">
                          {event.actor_name ? `by ${event.actor_name}` : ""}
                        </div>
                      </Card>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-mute">No timeline activity yet.</div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-3">
            <Card className="p-4 space-y-4">
              <h2 className="text-sm uppercase text-mute">Internal notes</h2>
              {notes?.items.length ? (
                <div className="space-y-3">
                  {notes.items.map((note: SponsorshipNote) => (
                    <Card key={note.id} className="p-3">
                      <div className="flex items-center justify-between text-xs text-mute">
                        <span>{note.created_by_name || "Unknown"}</span>
                        <span>{formatDateTime(note.created_at)}</span>
                      </div>
                      {note.restricted ? (
                        <p className="mt-2 text-sm text-mute">Restricted note exists.</p>
                      ) : (
                        <p className="mt-2 text-sm text-ink whitespace-pre-wrap">{note.note}</p>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-mute">No notes yet.</p>
              )}

              {canManage && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Add an internal note (visible to you + admins)"
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                  />
                  <Button onClick={handleNoteSubmit} disabled={noteSubmitting || !noteDraft.trim()}>
                    Add note
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {whatsappModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
            onClick={() => setWhatsappModalOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">WhatsApp reminder</h3>
                <Button variant="ghost" onClick={() => setWhatsappModalOpen(false)}>
                  Close
                </Button>
              </div>
              <p className="text-sm text-mute">
                Copy and send this message to the sponsor.
              </p>
              <Textarea rows={6} value={whatsappMessage} readOnly />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setWhatsappModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCopyMessage}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy message
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}

      {statusModal.open && (
        <>
          <div
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
            onClick={() => setStatusModal({ open: false, nextStatus: null, title: "", reasonRequired: false })}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-5 space-y-3">
              <h3 className="text-lg font-semibold">{statusModal.title}</h3>
              <p className="text-sm text-mute">Update case status to {statusModal.nextStatus}.</p>
              <Textarea
                placeholder={statusModal.reasonRequired ? "Reason (required)" : "Add a reason (optional)"}
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setStatusModal({ open: false, nextStatus: null, title: "", reasonRequired: false })}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleStatusTransition}
                  disabled={statusSubmitting || (statusModal.reasonRequired && !statusReason.trim())}
                >
                  Confirm
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
