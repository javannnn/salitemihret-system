import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Mail,
  PencilLine,
  Phone,
  PlusCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRound,
  Users2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PhoneInput } from "@/components/PhoneInput";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ApiError,
  ParishCouncilActivityItem,
  ParishCouncilApprovalAction,
  ParishCouncilApprovalStatus,
  ParishCouncilAssignment,
  ParishCouncilAssignmentApprovalPayload,
  ParishCouncilAssignmentPayload,
  ParishCouncilAssignmentStatus,
  ParishCouncilDepartmentDetail,
  ParishCouncilDepartmentStatus,
  ParishCouncilDocument,
  ParishCouncilDocumentType,
  ParishCouncilMemberSearchItem,
  ParishCouncilDepartmentUpdatePayload,
  ParishCouncilMeta,
  ParishCouncilOverviewResponse,
  createParishCouncilAssignment,
  deleteParishCouncilDocument,
  getParishCouncilDepartment,
  getParishCouncilMeta,
  getParishCouncilOverview,
  listParishCouncilActivity,
  listParishCouncilAssignments,
  listParishCouncilDepartments,
  searchParishCouncilMembers,
  updateParishCouncilAssignmentApproval,
  updateParishCouncilAssignment,
  updateParishCouncilDepartment,
  uploadParishCouncilDocument,
} from "@/lib/api";

type WorkspaceView = "overview" | "departments" | "assignments" | "timeline";
type MemberLookupMode = "member" | "manual";
type DepartmentDetailTab = "summary" | "trainees" | "documents" | "history";
type TimelineVisualMode = "calendar" | "list";
type TimelineCalendarEntryTone = "amber" | "emerald" | "blue" | "rose" | "slate" | "violet";
type TimelineCalendarEntry = {
  id: string;
  startsAt: string;
  dateKey: string;
  title: string;
  subtitle: string;
  detail?: string;
  tone: TimelineCalendarEntryTone;
};

type DepartmentFilterState = {
  q: string;
  status: ParishCouncilDepartmentStatus | "";
  lead_assigned: "all" | "assigned" | "unassigned";
  missing_contact: boolean;
  expiring_soon: boolean;
};

type AssignmentFilterState = {
  q: string;
  status: ParishCouncilAssignmentStatus | "";
  approval_status: ParishCouncilApprovalStatus | "";
  department_id: string;
  active_only: boolean;
};

type DepartmentFormState = {
  description: string;
  status: ParishCouncilDepartmentStatus;
  minimum_age: string;
  lead_member_id: string;
  lead_first_name: string;
  lead_last_name: string;
  lead_email: string;
  lead_phone: string;
  lead_term_start: string;
  lead_term_end: string;
  notes: string;
};

type AssignmentFormState = {
  department_id: string;
  source_mode: MemberLookupMode;
  trainee_member_id: string;
  trainee_first_name: string;
  trainee_last_name: string;
  trainee_email: string;
  trainee_phone: string;
  trainee_birth_date: string;
  training_from: string;
  training_to: string;
  status: ParishCouncilAssignmentStatus;
  notes: string;
  allow_same_person: boolean;
};

type DocumentDraftState = {
  document_type: ParishCouncilDocumentType;
  title: string;
  notes: string;
  assignment_id: string;
  file: File | null;
};

const statusBadgeClass: Record<string, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  Planned: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
  Completed: "bg-blue-500/10 text-blue-700 dark:text-blue-200",
  Cancelled: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
  OnHold: "bg-violet-500/10 text-violet-700 dark:text-violet-200",
  Inactive: "bg-slate-500/10 text-slate-700 dark:text-slate-200",
};

const approvalBadgeClass: Record<ParishCouncilApprovalStatus, string> = {
  Pending: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
  Approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  Rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
};

const calendarEntryToneClass: Record<TimelineCalendarEntryTone, string> = {
  amber: "bg-amber-500/12 text-amber-800 ring-1 ring-amber-500/20 dark:text-amber-200",
  emerald: "bg-emerald-500/12 text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-200",
  blue: "bg-sky-500/12 text-sky-800 ring-1 ring-sky-500/20 dark:text-sky-200",
  rose: "bg-rose-500/12 text-rose-800 ring-1 ring-rose-500/20 dark:text-rose-200",
  slate: "bg-slate-500/12 text-slate-700 ring-1 ring-slate-500/20 dark:text-slate-200",
  violet: "bg-violet-500/12 text-violet-800 ring-1 ring-violet-500/20 dark:text-violet-200",
};

const timelineWeekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const cardMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" },
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
};

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const toDateKey = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const dateKeyFromParts = (year: number, monthIndex: number, day: number) => {
  const value = new Date(year, monthIndex, day, 12);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};

const parseDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

const parseMonthKey = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1, 12);
};

const formatCalendarMonth = (monthKey: string) =>
  parseMonthKey(monthKey).toLocaleDateString(undefined, { month: "long", year: "numeric" });

const formatCalendarDay = (dateKey: string) =>
  parseDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

const formatCalendarTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "All day";
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const buildCalendarCells = (monthKey: string) => {
  const month = parseMonthKey(monthKey);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const leading = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const previousMonthDays = new Date(year, monthIndex, 0).getDate();

  return Array.from({ length: 42 }, (_, index) => {
    const visibleDay = index - leading + 1;
    if (visibleDay < 1) {
      const dayNumber = previousMonthDays + visibleDay;
      return { dateKey: dateKeyFromParts(year, monthIndex - 1, dayNumber), dayNumber, inMonth: false };
    }
    if (visibleDay > daysInMonth) {
      const dayNumber = visibleDay - daysInMonth;
      return { dateKey: dateKeyFromParts(year, monthIndex + 1, dayNumber), dayNumber, inMonth: false };
    }
    return { dateKey: dateKeyFromParts(year, monthIndex, visibleDay), dayNumber: visibleDay, inMonth: true };
  });
};

const timelineToneFromActivity = (action: string): TimelineCalendarEntryTone => {
  if (action.includes("approve")) return "emerald";
  if (action.includes("reject") || action.includes("delete")) return "rose";
  if (action.includes("document")) return "blue";
  if (action.includes("submit") || action === "created") return "amber";
  if (action === "updated") return "violet";
  return "slate";
};

const timelineToneFromAssignmentStatus = (status: ParishCouncilAssignmentStatus): TimelineCalendarEntryTone => {
  switch (status) {
    case "Active":
      return "emerald";
    case "Planned":
      return "amber";
    case "Completed":
      return "blue";
    case "Cancelled":
      return "rose";
    case "OnHold":
      return "violet";
    default:
      return "slate";
  }
};

const buildActivityCalendarEntries = (items: ParishCouncilActivityItem[]): TimelineCalendarEntry[] =>
  items.flatMap((item) => {
    const dateKey = toDateKey(item.created_at);
    if (!dateKey) return [];
    return [
      {
        id: `activity-${item.id}`,
        startsAt: item.created_at,
        dateKey,
        title: item.summary,
        subtitle: item.actor_name ? `${item.entity_type} • ${item.actor_name}` : `${item.entity_type} • System`,
        detail: item.changes[0] ?? item.action,
        tone: timelineToneFromActivity(item.action),
      },
    ];
  });

const buildAssignmentMilestoneEntries = (items: ParishCouncilAssignment[]): TimelineCalendarEntry[] =>
  items.flatMap((assignment) => [
    {
      id: `assignment-start-${assignment.id}`,
      startsAt: `${assignment.training_from}T09:00:00`,
      dateKey: assignment.training_from,
      title: `${assignment.trainee_full_name} training starts`,
      subtitle: assignment.department_name,
      detail:
        assignment.approval_status === "Pending"
          ? "Approval pending"
          : `${assignment.status} assignment`,
      tone: assignment.approval_status === "Pending" ? "amber" : timelineToneFromAssignmentStatus(assignment.status),
    },
    {
      id: `assignment-end-${assignment.id}`,
      startsAt: `${assignment.training_to}T16:00:00`,
      dateKey: assignment.training_to,
      title: `${assignment.trainee_full_name} training ends`,
      subtitle: assignment.department_name,
      detail: `${assignment.status} • ${assignment.approval_status}`,
      tone: assignment.status === "Completed" ? "blue" : timelineToneFromAssignmentStatus(assignment.status),
    },
  ]);

const buildUpcomingTimelineEntries = (
  items: ParishCouncilOverviewResponse["upcoming_end_dates"],
): TimelineCalendarEntry[] =>
  items.map((item) => ({
    id: `upcoming-${item.id}`,
    startsAt: `${item.training_to}T16:00:00`,
    dateKey: item.training_to,
    title: `${item.trainee_full_name} training ends`,
    subtitle: item.department_name,
    detail: `${item.status} assignment`,
    tone: timelineToneFromAssignmentStatus(item.status),
  }));

const sortTimelineCalendarEntries = (items: TimelineCalendarEntry[]) =>
  [...items].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());

const emptyAssignmentForm = (departmentId?: number | null): AssignmentFormState => ({
  department_id: departmentId ? String(departmentId) : "",
  source_mode: "member",
  trainee_member_id: "",
  trainee_first_name: "",
  trainee_last_name: "",
  trainee_email: "",
  trainee_phone: "",
  trainee_birth_date: "",
  training_from: new Date().toISOString().slice(0, 10),
  training_to: "",
  status: "Active",
  notes: "",
  allow_same_person: false,
});

const emptyDocumentDraft = (): DocumentDraftState => ({
  document_type: "ApprovalForm",
  title: "",
  notes: "",
  assignment_id: "",
  file: null,
});

const toDepartmentForm = (department: ParishCouncilDepartmentDetail): DepartmentFormState => ({
  description: department.description ?? "",
  status: department.status,
  minimum_age: String(department.minimum_age ?? 13),
  lead_member_id: department.lead_member_id ? String(department.lead_member_id) : "",
  lead_first_name: department.lead_first_name ?? "",
  lead_last_name: department.lead_last_name ?? "",
  lead_email: department.lead_email ?? "",
  lead_phone: department.lead_phone ?? "",
  lead_term_start: department.lead_term_start ?? "",
  lead_term_end: department.lead_term_end ?? "",
  notes: department.notes ?? "",
});

const toAssignmentForm = (assignment: ParishCouncilAssignment): AssignmentFormState => ({
  department_id: String(assignment.department_id),
  source_mode: assignment.trainee_member_id ? "member" : "manual",
  trainee_member_id: assignment.trainee_member_id ? String(assignment.trainee_member_id) : "",
  trainee_first_name: assignment.trainee_first_name,
  trainee_last_name: assignment.trainee_last_name,
  trainee_email: assignment.trainee_email ?? "",
  trainee_phone: assignment.trainee_phone ?? "",
  trainee_birth_date: assignment.trainee_birth_date ?? "",
  training_from: assignment.training_from,
  training_to: assignment.training_to,
  status: assignment.status,
  notes: assignment.notes ?? "",
  allow_same_person: false,
});

function ModalShell({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-card shadow-[0_28px_80px_rgba(15,23,42,0.38)]"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="border-b border-border bg-[linear-gradient(135deg,rgba(180,83,9,0.10),rgba(255,255,255,0.94),rgba(15,23,42,0.03))] px-6 py-5 dark:bg-[linear-gradient(135deg,rgba(180,83,9,0.12),rgba(15,23,42,0.98),rgba(30,41,59,0.94))]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-ink">{title}</h3>
                  {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
                </div>
                <Button variant="ghost" onClick={onClose}>Close</Button>
              </div>
            </div>
            <div className="max-h-[78vh] overflow-y-auto px-6 py-6">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function WorkspaceViewButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active ? "bg-accent text-accent-foreground shadow-sm" : "bg-card text-muted hover:bg-accent/10 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function ActivityList({ items }: { items: ParishCouncilActivityItem[] }) {
  if (!items.length) {
    return <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted">No activity recorded yet.</div>;
  }
  return (
    <div className="relative space-y-4 pl-5">
      <div className="absolute bottom-0 left-[7px] top-0 w-px bg-border" aria-hidden />
      {items.map((item) => (
        <div key={item.id} className="relative pl-4">
          <span className="absolute left-0 top-5 h-3 w-3 -translate-x-1/2 rounded-full bg-amber-500 shadow-[0_0_0_6px_rgba(251,191,36,0.12)]" />
          <div className="rounded-[24px] border border-border bg-bg/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-ink">{item.summary}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">{item.entity_type} • {item.action}</div>
              </div>
              <Badge className="normal-case tracking-normal">{formatDateTime(item.created_at)}</Badge>
            </div>
            {item.changes.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.changes.map((change) => (
                  <Badge key={`${item.id}-${change}`} className="bg-white/70 text-[11px] normal-case tracking-normal text-slate-700 dark:bg-white/5 dark:text-slate-200">
                    {change}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="mt-3 text-sm text-muted">
              {item.actor_name ? `Updated by ${item.actor_name}` : "System or unavailable actor"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineCalendarView({
  entries,
  emptyMessage,
}: {
  entries: TimelineCalendarEntry[];
  emptyMessage: string;
}) {
  const todayKey = toDateKey(new Date().toISOString()) ?? "";
  const todayMonthKey = todayKey.slice(0, 7);

  const sortedEntries = useMemo(() => sortTimelineCalendarEntries(entries), [entries]);
  const entryMonthKeys = useMemo(
    () => Array.from(new Set(sortedEntries.map((entry) => entry.dateKey.slice(0, 7)))).sort(),
    [sortedEntries],
  );
  const monthKeys = useMemo(
    () => Array.from(new Set([todayMonthKey, ...entryMonthKeys].filter(Boolean))).sort(),
    [entryMonthKeys, todayMonthKey],
  );
  const defaultMonthKey = entryMonthKeys.includes(todayMonthKey)
    ? todayMonthKey
    : entryMonthKeys[entryMonthKeys.length - 1] ?? todayMonthKey;

  const [selectedMonthKey, setSelectedMonthKey] = useState(defaultMonthKey);
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey || `${defaultMonthKey}-01`);

  useEffect(() => {
    setSelectedMonthKey((current) => (current && monthKeys.includes(current) ? current : defaultMonthKey));
  }, [defaultMonthKey, monthKeys]);

  const allEntriesByDate = useMemo(() => {
    const map = new Map<string, TimelineCalendarEntry[]>();
    for (const entry of sortedEntries) {
      const bucket = map.get(entry.dateKey) ?? [];
      bucket.push(entry);
      map.set(entry.dateKey, bucket);
    }
    return map;
  }, [sortedEntries]);

  const monthEntries = useMemo(
    () => sortedEntries.filter((entry) => entry.dateKey.startsWith(selectedMonthKey)),
    [selectedMonthKey, sortedEntries],
  );
  const calendarCells = useMemo(() => buildCalendarCells(selectedMonthKey), [selectedMonthKey]);
  const activeMonthDays = useMemo(
    () => new Set(monthEntries.map((entry) => entry.dateKey)).size,
    [monthEntries],
  );
  const defaultDayKeyForMonth = useMemo(() => {
    if (todayKey.startsWith(selectedMonthKey)) return todayKey;
    return monthEntries[0]?.dateKey ?? `${selectedMonthKey}-01`;
  }, [monthEntries, selectedMonthKey, todayKey]);

  useEffect(() => {
    setSelectedDayKey((current) =>
      current && current.startsWith(selectedMonthKey) ? current : defaultDayKeyForMonth,
    );
  }, [defaultDayKeyForMonth, selectedMonthKey]);

  const selectedDayEntries = allEntriesByDate.get(selectedDayKey) ?? [];
  const monthEntryCount = monthEntries.length;

  if (!sortedEntries.length) {
    return (
      <div className="rounded-[26px] border border-dashed border-border px-4 py-10 text-sm text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.14fr,0.86fr]">
      <div className="overflow-hidden rounded-[30px] border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted">Calendar Surface</div>
            <h4 className="mt-2 text-xl font-semibold text-ink">{formatCalendarMonth(selectedMonthKey)}</h4>
            <p className="mt-1 text-sm text-muted">Browse activity and training milestones by month, then focus a specific day.</p>
          </div>
          <div className="grid min-w-[220px] gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-border bg-bg/70 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Events</div>
              <div className="mt-2 text-2xl font-semibold text-ink">{monthEntryCount}</div>
            </div>
            <div className="rounded-[22px] border border-border bg-bg/70 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Active Days</div>
              <div className="mt-2 text-2xl font-semibold text-ink">{activeMonthDays}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {monthKeys.map((monthKey) => {
            const count = sortedEntries.filter((entry) => entry.dateKey.startsWith(monthKey)).length;
            return (
              <button
                key={monthKey}
                type="button"
                onClick={() => setSelectedMonthKey(monthKey)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  selectedMonthKey === monthKey
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "bg-bg/70 text-muted hover:bg-accent/10 hover:text-ink"
                }`}
              >
                {formatCalendarMonth(monthKey)}
                <span className="ml-2 text-xs opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <div className="grid grid-cols-7 gap-2 text-center text-[11px] uppercase tracking-[0.18em] text-muted">
            {timelineWeekdayLabels.map((label) => (
              <div key={label} className="py-2">{label}</div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2">
            {calendarCells.map((cell) => {
              const dayEntries = allEntriesByDate.get(cell.dateKey) ?? [];
              const isSelected = cell.dateKey === selectedDayKey;
              const isToday = cell.dateKey === todayKey;
              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  onClick={() => {
                    setSelectedMonthKey(cell.dateKey.slice(0, 7));
                    setSelectedDayKey(cell.dateKey);
                  }}
                  className={`min-h-[118px] rounded-[22px] border p-3 text-left transition ${
                    isSelected
                      ? "border-amber-400/50 bg-amber-500/10 shadow-[0_18px_40px_rgba(180,83,9,0.10)]"
                      : cell.inMonth
                        ? "border-border bg-bg/65 hover:border-amber-300/40 hover:bg-amber-500/5"
                        : "border-border/60 bg-bg/35 text-muted hover:border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        cell.inMonth ? "text-ink" : "text-muted"
                      } ${isToday ? "rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800 dark:text-amber-200" : ""}`}
                    >
                      {cell.dayNumber}
                    </span>
                    {dayEntries.length ? (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white dark:bg-white dark:text-slate-900">
                        {dayEntries.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-1">
                    {dayEntries.slice(0, 2).map((entry) => (
                      <div
                        key={entry.id}
                        className={`truncate rounded-full px-2.5 py-1 text-[11px] font-medium ${calendarEntryToneClass[entry.tone]}`}
                      >
                        {entry.title}
                      </div>
                    ))}
                    {dayEntries.length > 2 ? (
                      <div className="text-[11px] text-muted">+ {dayEntries.length - 2} more</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <motion.div
        key={selectedDayKey}
        className="overflow-hidden rounded-[30px] border border-border bg-[linear-gradient(160deg,rgba(251,191,36,0.08),rgba(255,255,255,0.96),rgba(15,23,42,0.02))] p-5 dark:bg-[linear-gradient(160deg,rgba(180,83,9,0.14),rgba(15,23,42,0.98),rgba(30,41,59,0.92))]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted">Focused Day</div>
            <h4 className="mt-2 text-xl font-semibold text-ink">{formatCalendarDay(selectedDayKey)}</h4>
            <p className="mt-1 text-sm text-muted">Use this agenda view to inspect what changed or what is due on the selected date.</p>
          </div>
          <Badge className="bg-white/80 text-slate-700 dark:bg-white/10 dark:text-slate-100">
            {selectedDayEntries.length} item{selectedDayEntries.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="mt-5 space-y-3">
          {selectedDayEntries.length ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${selectedDayKey}-${selectedDayEntries.length}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="space-y-3"
              >
                {selectedDayEntries.map((entry) => (
                  <div key={entry.id} className="rounded-[24px] border border-white/50 bg-white/75 p-4 dark:border-white/10 dark:bg-slate-950/35">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-ink">{entry.title}</div>
                        <div className="mt-1 text-sm text-muted">{entry.subtitle}</div>
                      </div>
                      <div className="text-xs font-medium text-muted">{formatCalendarTime(entry.startsAt)}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge className={`normal-case tracking-normal ${calendarEntryToneClass[entry.tone]}`}>
                        {entry.detail || "Scheduled item"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="rounded-[24px] border border-dashed border-border px-4 py-10 text-sm text-muted">
              No tracked activity or training milestone falls on this date.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function DocumentList({
  items,
  canManage,
  deletingId,
  onDelete,
}: {
  items: ParishCouncilDocument[];
  canManage: boolean;
  deletingId: number | null;
  onDelete: (document: ParishCouncilDocument) => void;
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted">
        No documents have been uploaded for this department yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-[24px] border border-border bg-bg/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-ink">{item.title || item.original_filename}</div>
                <Badge className="bg-sky-500/10 text-[11px] normal-case tracking-normal text-sky-700 dark:text-sky-200">
                  {item.document_type}
                </Badge>
              </div>
              <div className="mt-1 text-sm text-muted">
                {item.assignment_label ? `Linked to ${item.assignment_label}` : "Department-wide document"}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                <span>{formatFileSize(item.size_bytes)}</span>
                <span>{formatDateTime(item.created_at)}</span>
                <span>{item.uploaded_by_name || "Unknown uploader"}</span>
              </div>
              {item.notes ? <div className="mt-3 text-sm text-muted">{item.notes}</div> : null}
            </div>
            <div className="flex gap-2">
              <a href={item.file_url} target="_blank" rel="noreferrer">
                <Button variant="ghost">
                  <FileText size={16} />
                  Open
                </Button>
              </a>
              {canManage ? (
                <Button
                  variant="ghost"
                  onClick={() => onDelete(item)}
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle size={16} />}
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ParishCouncilsWorkspace() {
  const permissions = usePermissions();
  const toast = useToast();
  const canView = permissions.viewParishCouncils || permissions.manageParishCouncils;
  const canManage = permissions.manageParishCouncils;
  const canWriteDepartmentStatus = permissions.canWriteField("parish_councils", "status");
  const canWriteDepartmentDescription = permissions.canWriteField("parish_councils", "description");
  const canWriteMinimumAge = permissions.canWriteField("parish_councils", "minimum_age");
  const canWriteLeadName = permissions.canWriteField("parish_councils", "lead_first_name") || permissions.canWriteField("parish_councils", "lead_last_name");
  const canWriteLeadEmail = permissions.canWriteField("parish_councils", "lead_email");
  const canWriteLeadPhone = permissions.canWriteField("parish_councils", "lead_phone");
  const canWriteLeadTermDates = permissions.canWriteField("parish_councils", "lead_term_dates");
  const canWriteNotes = permissions.canWriteField("parish_councils", "notes");
  const canWriteTraineeName = permissions.canWriteField("parish_councils", "trainee_first_name") || permissions.canWriteField("parish_councils", "trainee_last_name");
  const canWriteTraineeEmail = permissions.canWriteField("parish_councils", "trainee_email");
  const canWriteTraineePhone = permissions.canWriteField("parish_councils", "trainee_phone");
  const canWriteTraineeBirthDate = permissions.canWriteField("parish_councils", "trainee_birth_date");
  const canWriteTrainingDates = permissions.canWriteField("parish_councils", "training_dates");
  const canWriteTrainingStatus = permissions.canWriteField("parish_councils", "training_status");
  const canWriteApprovals = permissions.canWriteField("parish_councils", "approval");
  const canWriteDocuments = permissions.canWriteField("parish_councils", "documents");
  const canReadHistory = permissions.canReadField("parish_councils", "history");

  const [view, setView] = useState<WorkspaceView>("overview");
  const [detailTab, setDetailTab] = useState<DepartmentDetailTab>("summary");
  const [workspaceTimelineMode, setWorkspaceTimelineMode] = useState<TimelineVisualMode>("calendar");
  const [historyVisualMode, setHistoryVisualMode] = useState<TimelineVisualMode>("calendar");
  const [meta, setMeta] = useState<ParishCouncilMeta | null>(null);
  const [overview, setOverview] = useState<ParishCouncilOverviewResponse | null>(null);
  const [departments, setDepartments] = useState<ParishCouncilDepartmentDetail[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<ParishCouncilDepartmentDetail | null>(null);
  const [assignments, setAssignments] = useState<ParishCouncilAssignment[]>([]);
  const [activity, setActivity] = useState<ParishCouncilActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const [departmentFilters, setDepartmentFilters] = useState<DepartmentFilterState>({
    q: "",
    status: "",
    lead_assigned: "all",
    missing_contact: false,
    expiring_soon: false,
  });
  const [assignmentFilters, setAssignmentFilters] = useState<AssignmentFilterState>({
    q: "",
    status: "",
    approval_status: "",
    department_id: "",
    active_only: true,
  });

  const [departmentEditorOpen, setDepartmentEditorOpen] = useState(false);
  const [departmentForm, setDepartmentForm] = useState<DepartmentFormState | null>(null);
  const [departmentSaving, setDepartmentSaving] = useState(false);
  const [departmentMemberQuery, setDepartmentMemberQuery] = useState("");
  const [departmentMemberResults, setDepartmentMemberResults] = useState<ParishCouncilMemberSearchItem[]>([]);

  const [assignmentEditorOpen, setAssignmentEditorOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(emptyAssignmentForm());
  const [assignmentEditing, setAssignmentEditing] = useState<ParishCouncilAssignment | null>(null);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentStep, setAssignmentStep] = useState(0);
  const [assignmentMemberQuery, setAssignmentMemberQuery] = useState("");
  const [assignmentMemberResults, setAssignmentMemberResults] = useState<ParishCouncilMemberSearchItem[]>([]);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraftState>(emptyDocumentDraft());
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentDeletingId, setDocumentDeletingId] = useState<number | null>(null);
  const [approvalDialog, setApprovalDialog] = useState<{ assignment: ParishCouncilAssignment; action: ParishCouncilApprovalAction } | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalSaving, setApprovalSaving] = useState(false);

  const departmentSearch = useDebouncedValue(departmentMemberQuery, 250);
  const assignmentSearch = useDebouncedValue(assignmentMemberQuery, 250);

  const selectedDepartmentMeta = useMemo(
    () => meta?.departments.find((item) => String(item.id) === assignmentForm.department_id) ?? null,
    [assignmentForm.department_id, meta],
  );

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadBase = async () => {
      setLoading(true);
      try {
        const [metaResponse, overviewResponse, activityResponse] = await Promise.all([
          getParishCouncilMeta(),
          getParishCouncilOverview(),
          listParishCouncilActivity({ limit: 60 }),
        ]);
        if (!cancelled) {
          setMeta(metaResponse);
          setOverview(overviewResponse);
          setActivity(activityResponse);
          if (!selectedDepartmentId && metaResponse.departments.length) {
            setSelectedDepartmentId(metaResponse.departments[0].id);
          }
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          toast.push("Unable to load Parish Councils workspace.", { type: "error" });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadBase();
    return () => {
      cancelled = true;
    };
  }, [canView, refreshToken, selectedDepartmentId, toast]);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    listParishCouncilDepartments({
      q: departmentFilters.q || undefined,
      status: departmentFilters.status || undefined,
      lead_assigned:
        departmentFilters.lead_assigned === "all"
          ? undefined
          : departmentFilters.lead_assigned === "assigned",
      missing_contact: departmentFilters.missing_contact || undefined,
      expiring_soon: departmentFilters.expiring_soon || undefined,
    })
      .then((response) => {
        if (cancelled) return;
        setDepartments(response.items as ParishCouncilDepartmentDetail[]);
        if (!selectedDepartmentId && response.items.length) {
          setSelectedDepartmentId(response.items[0].id);
        }
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.push("Unable to load departments.", { type: "warning" });
      });
    return () => {
      cancelled = true;
    };
  }, [canView, departmentFilters, refreshToken, selectedDepartmentId, toast]);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    listParishCouncilAssignments({
      q: assignmentFilters.q || undefined,
      status: assignmentFilters.status || undefined,
      approval_status: assignmentFilters.approval_status || undefined,
      department_id: assignmentFilters.department_id ? Number(assignmentFilters.department_id) : undefined,
      active_only: assignmentFilters.active_only,
    })
      .then((response) => {
        if (!cancelled) {
          setAssignments(response.items);
        }
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.push("Unable to load trainee assignments.", { type: "warning" });
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentFilters, canView, refreshToken, toast]);

  useEffect(() => {
    if (!selectedDepartmentId || !canView) {
      setSelectedDepartment(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getParishCouncilDepartment(selectedDepartmentId)
      .then((response) => {
        if (!cancelled) {
          setSelectedDepartment(response);
        }
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          toast.push("Unable to load department detail.", { type: "warning" });
          setSelectedDepartment(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canView, selectedDepartmentId, refreshToken, toast]);

  useEffect(() => {
    setDetailTab("summary");
    setDocumentDraft(emptyDocumentDraft());
  }, [selectedDepartmentId]);

  useEffect(() => {
    if (!departmentEditorOpen || !departmentSearch) {
      setDepartmentMemberResults([]);
      return;
    }
    let cancelled = false;
    searchParishCouncilMembers(departmentSearch, 6)
      .then((response) => {
        if (!cancelled) setDepartmentMemberResults(response);
      })
      .catch(() => {
        if (!cancelled) setDepartmentMemberResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentEditorOpen, departmentSearch]);

  useEffect(() => {
    if (!assignmentEditorOpen || assignmentForm.source_mode !== "member" || !assignmentSearch) {
      setAssignmentMemberResults([]);
      return;
    }
    let cancelled = false;
    searchParishCouncilMembers(assignmentSearch, 8)
      .then((response) => {
        if (!cancelled) setAssignmentMemberResults(response);
      })
      .catch(() => {
        if (!cancelled) setAssignmentMemberResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentEditorOpen, assignmentForm.source_mode, assignmentSearch]);

  const refreshWorkspace = () => setRefreshToken((current) => current + 1);

  const openDepartmentEditor = () => {
    if (!selectedDepartment) return;
    setDepartmentForm(toDepartmentForm(selectedDepartment));
    setDepartmentMemberQuery("");
    setDepartmentMemberResults([]);
    setDepartmentEditorOpen(true);
  };

  const selectDepartmentLead = (member: ParishCouncilMemberSearchItem) => {
    setDepartmentForm((current) =>
      current
        ? {
            ...current,
            lead_member_id: String(member.id),
            lead_first_name: member.first_name,
            lead_last_name: member.last_name,
            lead_email: member.email ?? "",
            lead_phone: member.phone ?? "",
          }
        : current,
    );
    setDepartmentMemberQuery(`${member.first_name} ${member.last_name}`);
    setDepartmentMemberResults([]);
  };

  const saveDepartment = async () => {
    if (!selectedDepartment || !departmentForm) return;
    const payload: ParishCouncilDepartmentUpdatePayload = {};
    if (canWriteDepartmentDescription) payload.description = departmentForm.description || null;
    if (canWriteDepartmentStatus) payload.status = departmentForm.status;
    if (canWriteMinimumAge) payload.minimum_age = Number(departmentForm.minimum_age || 0);
    if (canWriteLeadName || canWriteLeadEmail || canWriteLeadPhone) {
      payload.lead_member_id = departmentForm.lead_member_id ? Number(departmentForm.lead_member_id) : null;
    }
    if (canWriteLeadName) {
      payload.lead_first_name = departmentForm.lead_first_name || null;
      payload.lead_last_name = departmentForm.lead_last_name || null;
    }
    if (canWriteLeadEmail) payload.lead_email = departmentForm.lead_email || null;
    if (canWriteLeadPhone) payload.lead_phone = departmentForm.lead_phone || null;
    if (canWriteLeadTermDates) {
      payload.lead_term_start = departmentForm.lead_term_start || null;
      payload.lead_term_end = departmentForm.lead_term_end || null;
    }
    if (canWriteNotes) payload.notes = departmentForm.notes || null;

    setDepartmentSaving(true);
    try {
      const updated = await updateParishCouncilDepartment(selectedDepartment.id, payload);
      setSelectedDepartment(updated);
      setDepartmentEditorOpen(false);
      toast.push("Department lead record updated.");
      refreshWorkspace();
    } catch (error) {
      console.error(error);
      toast.push(error instanceof ApiError ? error.message : "Unable to update department.", { type: "error" });
    } finally {
      setDepartmentSaving(false);
    }
  };

  const openAssignmentEditor = (assignment?: ParishCouncilAssignment) => {
    setAssignmentEditing(assignment ?? null);
    setAssignmentForm(assignment ? toAssignmentForm(assignment) : emptyAssignmentForm(selectedDepartmentId));
    setAssignmentMemberQuery("");
    setAssignmentMemberResults([]);
    setAssignmentStep(0);
    setAssignmentEditorOpen(true);
  };

  const openApprovalDialog = (assignment: ParishCouncilAssignment, action: ParishCouncilApprovalAction) => {
    setApprovalDialog({ assignment, action });
    setApprovalNote(action === "reject" ? assignment.approval_note ?? "" : "");
  };

  const selectAssignmentMember = (member: ParishCouncilMemberSearchItem) => {
    setAssignmentForm((current) => ({
      ...current,
      trainee_member_id: String(member.id),
      trainee_first_name: member.first_name,
      trainee_last_name: member.last_name,
      trainee_email: member.email ?? "",
      trainee_phone: member.phone ?? "",
      trainee_birth_date: member.birth_date ?? "",
    }));
    setAssignmentMemberQuery(`${member.first_name} ${member.last_name}`);
    setAssignmentMemberResults([]);
  };

  const assignmentWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!assignmentForm.trainee_email) warnings.push("Trainee email is missing.");
    if (!assignmentForm.trainee_phone) warnings.push("Trainee phone is missing.");
    if (selectedDepartmentMeta && Number(selectedDepartmentMeta.minimum_age) > 0 && !assignmentForm.trainee_birth_date) {
      warnings.push(`Birth date is required to validate the ${selectedDepartmentMeta.minimum_age}+ rule for this department.`);
    }
    if (
      selectedDepartment &&
      selectedDepartment.id === Number(assignmentForm.department_id) &&
      [selectedDepartment.lead_first_name?.trim().toLowerCase(), selectedDepartment.lead_last_name?.trim().toLowerCase()].join("|") ===
        [assignmentForm.trainee_first_name.trim().toLowerCase(), assignmentForm.trainee_last_name.trim().toLowerCase()].join("|") &&
      assignmentForm.trainee_first_name &&
      assignmentForm.trainee_last_name
    ) {
      warnings.push("The trainee appears to match the current department lead. Confirm before saving.");
    }
    return warnings;
  }, [assignmentForm, selectedDepartment, selectedDepartmentMeta]);

  const assignmentCanAdvance = useMemo(() => {
    if (assignmentStep === 0) return Boolean(assignmentForm.department_id);
    if (assignmentStep === 1) return assignmentForm.source_mode === "manual" || Boolean(assignmentForm.trainee_member_id);
    if (assignmentStep === 2) {
      if (!assignmentForm.trainee_first_name.trim() || !assignmentForm.trainee_last_name.trim()) return false;
      if (selectedDepartmentMeta && selectedDepartmentMeta.minimum_age > 0 && !assignmentForm.trainee_birth_date) return false;
      return true;
    }
    if (assignmentStep === 3) {
      if (!assignmentForm.training_from || !assignmentForm.training_to) return false;
      return assignmentForm.training_to >= assignmentForm.training_from;
    }
    return true;
  }, [assignmentForm, assignmentStep, selectedDepartmentMeta]);

  const saveAssignment = async () => {
    const payload: ParishCouncilAssignmentPayload = {
      department_id: Number(assignmentForm.department_id),
      training_from: assignmentForm.training_from,
      training_to: assignmentForm.training_to,
      status: assignmentForm.status,
      allow_same_person: assignmentForm.allow_same_person,
    };

    payload.trainee_member_id = assignmentForm.source_mode === "member" && assignmentForm.trainee_member_id
      ? Number(assignmentForm.trainee_member_id)
      : null;

    if (canWriteTraineeName || assignmentForm.source_mode === "manual") {
      payload.trainee_first_name = assignmentForm.trainee_first_name || null;
      payload.trainee_last_name = assignmentForm.trainee_last_name || null;
    }
    if (canWriteTraineeEmail) payload.trainee_email = assignmentForm.trainee_email || null;
    if (canWriteTraineePhone) payload.trainee_phone = assignmentForm.trainee_phone || null;
    if (canWriteTraineeBirthDate) payload.trainee_birth_date = assignmentForm.trainee_birth_date || null;
    if (canWriteTrainingStatus) payload.status = assignmentForm.status;
    if (canWriteNotes) payload.notes = assignmentForm.notes || null;
    if (canWriteTrainingDates) {
      payload.training_from = assignmentForm.training_from;
      payload.training_to = assignmentForm.training_to;
    }

    setAssignmentSaving(true);
    try {
      if (assignmentEditing) {
        await updateParishCouncilAssignment(assignmentEditing.id, payload);
        toast.push("Trainee assignment updated.");
      } else {
        await createParishCouncilAssignment(payload);
        toast.push("Trainee assigned successfully.");
      }
      setAssignmentEditorOpen(false);
      refreshWorkspace();
    } catch (error) {
      console.error(error);
      toast.push(error instanceof ApiError ? error.message : "Unable to save assignment.", { type: "error" });
    } finally {
      setAssignmentSaving(false);
    }
  };

  const submitApprovalAction = async () => {
    if (!approvalDialog) return;
    const payload: ParishCouncilAssignmentApprovalPayload = {
      action: approvalDialog.action,
      note: approvalNote.trim() || null,
    };

    setApprovalSaving(true);
    try {
      await updateParishCouncilAssignmentApproval(approvalDialog.assignment.id, payload);
      toast.push(
        approvalDialog.action === "approve"
          ? "Assignment approved."
          : approvalDialog.action === "reject"
            ? "Assignment rejected."
            : "Assignment submitted for approval."
      );
      setApprovalDialog(null);
      setApprovalNote("");
      refreshWorkspace();
    } catch (error) {
      console.error(error);
      toast.push(error instanceof ApiError ? error.message : "Unable to update approval status.", { type: "error" });
    } finally {
      setApprovalSaving(false);
    }
  };

  const submitDocumentUpload = async () => {
    if (!selectedDepartment || !documentDraft.file) {
      toast.push("Choose a document before uploading.", { type: "warning" });
      return;
    }

    setDocumentUploading(true);
    try {
      await uploadParishCouncilDocument(selectedDepartment.id, documentDraft.file, {
        document_type: documentDraft.document_type,
        title: documentDraft.title || null,
        notes: documentDraft.notes || null,
        assignment_id: documentDraft.assignment_id ? Number(documentDraft.assignment_id) : null,
      });
      toast.push("Document uploaded.");
      setDocumentDraft(emptyDocumentDraft());
      refreshWorkspace();
    } catch (error) {
      console.error(error);
      toast.push(error instanceof ApiError ? error.message : "Unable to upload document.", { type: "error" });
    } finally {
      setDocumentUploading(false);
    }
  };

  const removeDocument = async (document: ParishCouncilDocument) => {
    setDocumentDeletingId(document.id);
    try {
      await deleteParishCouncilDocument(document.id);
      toast.push("Document removed.");
      refreshWorkspace();
    } catch (error) {
      console.error(error);
      toast.push(error instanceof ApiError ? error.message : "Unable to remove document.", { type: "error" });
    } finally {
      setDocumentDeletingId(null);
    }
  };

  const summaryCards = useMemo(
    () =>
      overview
        ? [
            {
              label: "Departments",
              value: overview.summary.total_departments,
              detail: `${overview.summary.active_departments} active`,
              icon: Building2,
            },
            {
              label: "Active Leads",
              value: overview.summary.active_leads,
              detail: "Named department heads",
              icon: UserRound,
            },
            {
              label: "Open Trainees",
              value: overview.summary.open_assignments,
              detail: `${overview.summary.expiring_assignments_30_days} expiring soon`,
              icon: Users2,
            },
            {
              label: "Pending Approval",
              value: overview.summary.pending_approvals,
              detail: "Assignments awaiting review",
              icon: ShieldCheck,
            },
            {
              label: "Documents",
              value: overview.summary.total_documents,
              detail: "Uploaded support files",
              icon: FileText,
            },
            {
              label: "Data Flags",
              value: overview.summary.missing_contact_records + overview.summary.underage_validation_issues,
              detail: `${overview.summary.missing_contact_records} missing contact • ${overview.summary.underage_validation_issues} age review`,
              icon: ShieldAlert,
            },
          ]
        : [],
    [overview],
  );

  const selectedDepartmentPendingAssignments = useMemo(
    () => selectedDepartment?.assignments.filter((item) => item.approval_status === "Pending") ?? [],
    [selectedDepartment],
  );

  const workspaceTimelineEntries = useMemo(
    () =>
      sortTimelineCalendarEntries([
        ...buildActivityCalendarEntries(activity),
        ...buildUpcomingTimelineEntries(overview?.upcoming_end_dates ?? []),
      ]),
    [activity, overview],
  );

  const selectedDepartmentTimelineEntries = useMemo(
    () =>
      selectedDepartment
        ? sortTimelineCalendarEntries([
            ...buildAssignmentMilestoneEntries(selectedDepartment.assignments),
            ...buildActivityCalendarEntries(selectedDepartment.activity),
          ])
        : [],
    [selectedDepartment],
  );

  if (!canView) {
    return (
      <div className="rounded-[28px] border border-border bg-card px-8 py-14 text-center">
        <ShieldAlert className="mx-auto h-6 w-6 text-amber-700 dark:text-amber-200" />
        <div className="mt-4 text-xl font-semibold text-ink">Parish Councils access is restricted</div>
        <div className="mt-2 text-sm text-muted">
          This account does not currently have permission to view the parish council workspace.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-7rem)] items-center justify-center text-muted">
        <Loader2 className="mr-3 h-5 w-5 animate-spin" />
        Loading Parish Councils workspace...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <motion.section
        className="overflow-hidden rounded-[30px] border border-border bg-[linear-gradient(135deg,rgba(180,83,9,0.16),rgba(255,255,255,0.98),rgba(15,23,42,0.02))] p-6 shadow-soft dark:bg-[linear-gradient(135deg,rgba(180,83,9,0.12),rgba(15,23,42,0.98),rgba(30,41,59,0.94))]"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <Badge className="mb-3 bg-white/75 text-[11px] text-amber-700 dark:bg-white/10 dark:text-amber-200">Parish Councils</Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">Parish council operations, approvals, and records in one workspace.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Manage the six parish council departments, maintain department leadership records, track trainee assignments and training periods with age validation, review approvals, and keep supporting documents organized in a structured workflow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <>
                <Button onClick={() => openAssignmentEditor()}>
                  <PlusCircle size={16} />
                  Assign trainee
                </Button>
                <Button variant="ghost" onClick={openDepartmentEditor} disabled={!selectedDepartment}>
                  <PencilLine size={16} />
                  Update lead
                </Button>
              </>
            ) : null}
            <Button variant="ghost" onClick={refreshWorkspace}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <WorkspaceViewButton active={view === "overview"} onClick={() => setView("overview")} label="Overview" />
          <WorkspaceViewButton active={view === "departments"} onClick={() => setView("departments")} label="Departments" />
          <WorkspaceViewButton active={view === "assignments"} onClick={() => setView("assignments")} label="Assignments" />
          <WorkspaceViewButton active={view === "timeline"} onClick={() => setView("timeline")} label="Timeline" />
        </div>
      </motion.section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {summaryCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.label} {...cardMotion} transition={{ ...cardMotion.transition, delay: index * 0.04 }}>
              <Card className="h-full p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted">{card.label}</div>
                    <div className="mt-3 text-3xl font-semibold text-ink">{card.value}</div>
                    <div className="mt-2 text-sm text-muted">{card.detail}</div>
                  </div>
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-200">
                    <Icon size={20} />
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {view === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <motion.div {...cardMotion}>
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-ink">Department Occupancy</h2>
                  <p className="text-sm text-muted">Open trainees by department, with the configured minimum age threshold.</p>
                </div>
                <Badge>{overview?.department_occupancy.length ?? 0} departments</Badge>
              </div>
              <div className="space-y-4">
                {(overview?.department_occupancy ?? []).map((item) => {
                  const width = Math.min(100, item.open_assignments * 18 + 10);
                  return (
                    <div key={item.department_id} className="rounded-2xl border border-border bg-bg/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-ink">{item.department_name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                            Min age {item.minimum_age || "exception"} • {item.status}
                          </div>
                        </div>
                        <Badge className={statusBadgeClass[item.status] ?? ""}>{item.open_assignments} open</Badge>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-border/60">
                        <motion.div
                          className="h-2 rounded-full bg-[linear-gradient(90deg,#b45309,#f59e0b)]"
                          initial={{ width: 0 }}
                          animate={{ width: `${width}%` }}
                          transition={{ duration: 0.35, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>

          <div className="space-y-6">
            <motion.div {...cardMotion} transition={{ duration: 0.28, delay: 0.05 }}>
              <Card className="p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">Upcoming End Dates</h2>
                    <p className="text-sm text-muted">Assignments nearing their training end window.</p>
                  </div>
                  <CalendarClock className="h-5 w-5 text-amber-700 dark:text-amber-200" />
                </div>
                <div className="space-y-3">
                  {(overview?.upcoming_end_dates ?? []).length ? (
                    overview?.upcoming_end_dates.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-border bg-bg/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-ink">{item.trainee_full_name}</div>
                            <div className="mt-1 text-sm text-muted">{item.department_name}</div>
                          </div>
                          <Badge className={statusBadgeClass[item.status] ?? ""}>{item.status}</Badge>
                        </div>
                        <div className="mt-3 inline-flex items-center gap-2 text-sm text-muted">
                          <Clock3 size={14} />
                          Ends {formatDate(item.training_to)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted">No expiring assignments in the next 30 days.</div>
                  )}
                </div>
              </Card>
            </motion.div>

            <motion.div {...cardMotion} transition={{ duration: 0.28, delay: 0.1 }}>
              <Card className="p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">Recent Changes</h2>
                    <p className="text-sm text-muted">The latest edits, assignments, and updates.</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted" />
                </div>
                <ActivityList items={overview?.recent_activity ?? []} />
              </Card>
            </motion.div>
          </div>
        </div>
      ) : null}

      {view === "departments" ? (
        <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
          <motion.div {...cardMotion}>
            <Card className="overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <div className="text-lg font-semibold text-ink">Departments</div>
                <p className="mt-1 text-sm text-muted">Filter the fixed council departments and jump into the lead + trainee detail view.</p>
              </div>
              <div className="space-y-3 border-b border-border px-5 py-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input
                    className="pl-9"
                    placeholder="Search department or lead"
                    value={departmentFilters.q}
                    onChange={(event) => setDepartmentFilters((current) => ({ ...current, q: event.target.value }))}
                  />
                </div>
                <Select
                  value={departmentFilters.status}
                  onChange={(event) => setDepartmentFilters((current) => ({ ...current, status: event.target.value as ParishCouncilDepartmentStatus | "" }))}
                >
                  <option value="">All statuses</option>
                  {(meta?.department_statuses ?? []).map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </Select>
                <Select
                  value={departmentFilters.lead_assigned}
                  onChange={(event) => setDepartmentFilters((current) => ({ ...current, lead_assigned: event.target.value as DepartmentFilterState["lead_assigned"] }))}
                >
                  <option value="all">Lead coverage: all</option>
                  <option value="assigned">Lead assigned</option>
                  <option value="unassigned">Lead unassigned</option>
                </Select>
                <div className="flex gap-2">
                  <Button
                    variant={departmentFilters.missing_contact ? "solid" : "ghost"}
                    className="flex-1"
                    onClick={() => setDepartmentFilters((current) => ({ ...current, missing_contact: !current.missing_contact }))}
                  >
                    Missing data
                  </Button>
                  <Button
                    variant={departmentFilters.expiring_soon ? "solid" : "ghost"}
                    className="flex-1"
                    onClick={() => setDepartmentFilters((current) => ({ ...current, expiring_soon: !current.expiring_soon }))}
                  >
                    Expiring soon
                  </Button>
                </div>
              </div>
              <div className="max-h-[62vh] overflow-y-auto p-3">
                {departments.map((department) => (
                  <button
                    key={department.id}
                    type="button"
                    onClick={() => setSelectedDepartmentId(department.id)}
                    className={`mb-2 w-full rounded-2xl border px-4 py-4 text-left transition ${
                      selectedDepartmentId === department.id
                        ? "border-accent/30 bg-accent/10 shadow-sm"
                        : "border-border bg-bg/70 hover:border-accent/20 hover:bg-accent/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-ink">{department.name}</div>
                        <div className="mt-1 text-sm text-muted">{department.lead_full_name || "No lead assigned yet"}</div>
                      </div>
                      <Badge className={statusBadgeClass[department.status] ?? ""}>{department.status}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                      <span>{department.open_assignment_count} open</span>
                      <span>•</span>
                      <span>{department.expiring_assignment_count} expiring</span>
                      <span>•</span>
                      <span>{department.missing_contact_count} missing fields</span>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </motion.div>

          <motion.div {...cardMotion} transition={{ duration: 0.28, delay: 0.04 }}>
            <Card className="min-h-[620px] p-6">
              {detailLoading ? (
                <div className="flex h-full items-center justify-center text-muted">
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                  Loading department detail...
                </div>
              ) : selectedDepartment ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-semibold text-ink">{selectedDepartment.name}</h2>
                        <Badge className={statusBadgeClass[selectedDepartment.status] ?? ""}>{selectedDepartment.status}</Badge>
                      </div>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                        {selectedDepartment.description || "No department description yet. Add one to clarify scope, ownership, and training purpose."}
                      </p>
                    </div>
                    {canManage ? (
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={openDepartmentEditor}>
                          <PencilLine size={16} />
                          Edit lead
                        </Button>
                        <Button onClick={() => openAssignmentEditor()}>
                          <PlusCircle size={16} />
                          Add trainee
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="border-none bg-bg/70 p-5 shadow-none">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted">Lead</div>
                      <div className="mt-3 text-lg font-semibold text-ink">{selectedDepartment.lead_full_name || "Unassigned"}</div>
                      {selectedDepartment.lead_email ? <div className="mt-2 text-sm text-muted">{selectedDepartment.lead_email}</div> : null}
                      {selectedDepartment.lead_phone ? <div className="mt-1 text-sm text-muted">{selectedDepartment.lead_phone}</div> : null}
                    </Card>
                    <Card className="border-none bg-bg/70 p-5 shadow-none">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted">Training Surface</div>
                      <div className="mt-3 text-lg font-semibold text-ink">{selectedDepartment.open_assignment_count} open</div>
                      <div className="mt-2 text-sm text-muted">{selectedDepartment.expiring_assignment_count} assignments expiring soon</div>
                    </Card>
                    <Card className="border-none bg-bg/70 p-5 shadow-none">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted">Age Rule</div>
                      <div className="mt-3 text-lg font-semibold text-ink">
                        {selectedDepartment.minimum_age > 0 ? `${selectedDepartment.minimum_age}+ years` : "Exception allowed"}
                      </div>
                      <div className="mt-2 text-sm text-muted">Configured at department level and enforced on save.</div>
                    </Card>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <WorkspaceViewButton active={detailTab === "summary"} onClick={() => setDetailTab("summary")} label="Summary" />
                    <WorkspaceViewButton active={detailTab === "trainees"} onClick={() => setDetailTab("trainees")} label="Trainees" />
                    <WorkspaceViewButton active={detailTab === "documents"} onClick={() => setDetailTab("documents")} label="Documents" />
                    <WorkspaceViewButton active={detailTab === "history"} onClick={() => setDetailTab("history")} label="History" />
                  </div>

                  {detailTab === "summary" ? (
                    <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                      <div className="space-y-6">
                        <Card className="border-none bg-bg/70 p-5 shadow-none">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-ink">Lead Profile</h3>
                              <p className="text-sm text-muted">Current department owner and local contact snapshot.</p>
                            </div>
                            <Badge className={selectedDepartment.lead_full_name ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "bg-slate-500/10 text-slate-700 dark:text-slate-200"}>
                              {selectedDepartment.lead_full_name ? "Assigned" : "Open"}
                            </Badge>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-muted">Lead</div>
                              <div className="mt-2 text-lg font-semibold text-ink">{selectedDepartment.lead_full_name || "No lead assigned yet"}</div>
                              <div className="mt-3 space-y-2 text-sm text-muted">
                                <div>{selectedDepartment.lead_email || "Email missing"}</div>
                                <div>{selectedDepartment.lead_phone || "Phone missing"}</div>
                              </div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-muted">Term window</div>
                              <div className="mt-2 text-sm text-muted">
                                {formatDate(selectedDepartment.lead_term_start)} to {formatDate(selectedDepartment.lead_term_end)}
                              </div>
                              <div className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">Department notes</div>
                              <div className="mt-2 text-sm text-muted">
                                {selectedDepartment.notes || "No internal notes for this department yet."}
                              </div>
                            </div>
                          </div>
                        </Card>

                        <Card className="border-none bg-bg/70 p-5 shadow-none">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-ink">Approval Queue</h3>
                              <p className="text-sm text-muted">Assignments waiting for sign-off before the workflow is considered cleared.</p>
                            </div>
                            <Badge className={selectedDepartmentPendingAssignments.length ? approvalBadgeClass.Pending : approvalBadgeClass.Approved}>
                              {selectedDepartmentPendingAssignments.length} pending
                            </Badge>
                          </div>
                          {selectedDepartmentPendingAssignments.length ? (
                            <div className="space-y-3">
                              {selectedDepartmentPendingAssignments.map((assignment) => (
                                <div key={assignment.id} className="rounded-[22px] border border-border bg-card/70 p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="font-medium text-ink">{assignment.trainee_full_name}</div>
                                      <div className="mt-1 text-sm text-muted">
                                        {formatDate(assignment.training_from)} to {formatDate(assignment.training_to)}
                                      </div>
                                      <div className="mt-2 text-xs text-muted">
                                        Requested {formatDateTime(assignment.approval_requested_at)} by {assignment.approval_requested_by_name || "Unknown user"}
                                      </div>
                                    </div>
                                    {canWriteApprovals ? (
                                      <div className="flex gap-2">
                                        <Button variant="ghost" onClick={() => openApprovalDialog(assignment, "approve")}>
                                          <CheckCheck size={16} />
                                          Approve
                                        </Button>
                                        <Button variant="ghost" onClick={() => openApprovalDialog(assignment, "reject")}>
                                          <XCircle size={16} />
                                          Reject
                                        </Button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted">
                              No assignments are waiting for approval in this department.
                            </div>
                          )}
                        </Card>
                      </div>

                      <div className="space-y-6">
                        <Card className="border-none bg-bg/70 p-5 shadow-none">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-ink">Document Shelf</h3>
                              <p className="text-sm text-muted">Approval forms, training files, and evaluation records linked to this department.</p>
                            </div>
                            <Badge>{selectedDepartment.documents.length} files</Badge>
                          </div>
                          <DocumentList
                            items={selectedDepartment.documents.slice(0, 3)}
                            canManage={canWriteDocuments}
                            deletingId={documentDeletingId}
                            onDelete={removeDocument}
                          />
                        </Card>

                        <Card className="border-none bg-bg/70 p-5 shadow-none">
                          <div className="mb-3">
                            <h3 className="text-lg font-semibold text-ink">Latest History</h3>
                            <p className="text-sm text-muted">Recent lead changes, uploads, approvals, and assignment edits.</p>
                          </div>
                          {canReadHistory ? <ActivityList items={selectedDepartment.activity.slice(0, 6)} /> : <div className="text-sm text-muted">History visibility is restricted for this role.</div>}
                        </Card>
                      </div>
                    </div>
                  ) : null}

                  {detailTab === "trainees" ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-ink">Trainees</h3>
                          <p className="text-sm text-muted">Active, completed, and historical assignments with approval and document state.</p>
                        </div>
                        <Badge>{selectedDepartment.assignments.length} total</Badge>
                      </div>
                      {selectedDepartment.assignments.length ? (
                        selectedDepartment.assignments.map((assignment) => (
                          <div key={assignment.id} className="rounded-[26px] border border-border bg-bg/70 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-lg font-semibold text-ink">{assignment.trainee_full_name}</div>
                                  <Badge className={statusBadgeClass[assignment.status] ?? ""}>{assignment.status}</Badge>
                                  <Badge className={approvalBadgeClass[assignment.approval_status]}>{assignment.approval_status}</Badge>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted">
                                  <span>{assignment.trainee_age != null ? `${assignment.trainee_age} years old` : "Age pending"}</span>
                                  <span>{formatDate(assignment.training_from)} to {formatDate(assignment.training_to)}</span>
                                  <span>{assignment.document_count} document{assignment.document_count === 1 ? "" : "s"}</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {canManage ? (
                                  <Button variant="ghost" onClick={() => openAssignmentEditor(assignment)}>
                                    <PencilLine size={16} />
                                    Edit
                                  </Button>
                                ) : null}
                                {canWriteApprovals ? (
                                  <>
                                    {assignment.approval_status === "Pending" ? (
                                      <>
                                        <Button variant="ghost" onClick={() => openApprovalDialog(assignment, "approve")}>
                                          <CheckCheck size={16} />
                                          Approve
                                        </Button>
                                        <Button variant="ghost" onClick={() => openApprovalDialog(assignment, "reject")}>
                                          <XCircle size={16} />
                                          Reject
                                        </Button>
                                      </>
                                    ) : (
                                      <Button variant="ghost" onClick={() => openApprovalDialog(assignment, "submit")}>
                                        <ShieldCheck size={16} />
                                        Resubmit
                                      </Button>
                                    )}
                                  </>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-4 grid gap-4 md:grid-cols-3">
                              <div className="rounded-2xl border border-border bg-card/70 p-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-muted">Contact</div>
                                <div className="mt-2 text-sm text-muted">{assignment.trainee_email || "Email missing"}</div>
                                <div className="mt-1 text-sm text-muted">{assignment.trainee_phone || "Phone missing"}</div>
                              </div>
                              <div className="rounded-2xl border border-border bg-card/70 p-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-muted">Approval history</div>
                                <div className="mt-2 text-sm text-muted">
                                  Requested {formatDateTime(assignment.approval_requested_at)}
                                </div>
                                <div className="mt-1 text-sm text-muted">
                                  {assignment.approval_status === "Pending"
                                    ? `Awaiting review from ${assignment.approval_requested_by_name || "assigned reviewer"}`
                                    : `${assignment.approval_status} ${assignment.approval_decided_at ? `on ${formatDateTime(assignment.approval_decided_at)}` : ""}`}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-border bg-card/70 p-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-muted">Notes</div>
                                <div className="mt-2 text-sm text-muted">{assignment.notes || assignment.approval_note || "No notes saved yet."}</div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted">
                          No trainee assignments have been recorded for this department yet.
                        </div>
                      )}
                    </div>
                  ) : null}

                  {detailTab === "documents" ? (
                    <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
                      <Card className="border-none bg-bg/70 p-5 shadow-none">
                        <div className="mb-4">
                          <h3 className="text-lg font-semibold text-ink">Upload Document</h3>
                          <p className="text-sm text-muted">Attach approval forms, training material, evaluations, or internal notes to the department or a specific trainee assignment.</p>
                        </div>
                        {canWriteDocuments ? (
                          <div className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <label className="mb-2 block text-sm font-medium text-ink">Document type</label>
                                <Select
                                  value={documentDraft.document_type}
                                  onChange={(event) => setDocumentDraft((current) => ({ ...current, document_type: event.target.value as ParishCouncilDocumentType }))}
                                >
                                  {(meta?.document_types ?? []).map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                  ))}
                                </Select>
                              </div>
                              <div>
                                <label className="mb-2 block text-sm font-medium text-ink">Link to assignment</label>
                                <Select
                                  value={documentDraft.assignment_id}
                                  onChange={(event) => setDocumentDraft((current) => ({ ...current, assignment_id: event.target.value }))}
                                >
                                  <option value="">Department-wide document</option>
                                  {selectedDepartment.assignments.map((assignment) => (
                                    <option key={assignment.id} value={assignment.id}>{assignment.trainee_full_name}</option>
                                  ))}
                                </Select>
                              </div>
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-medium text-ink">Title</label>
                              <Input
                                placeholder="Optional display title"
                                value={documentDraft.title}
                                onChange={(event) => setDocumentDraft((current) => ({ ...current, title: event.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-medium text-ink">Notes</label>
                              <Textarea
                                rows={4}
                                placeholder="What this document is for and when it should be reviewed"
                                value={documentDraft.notes}
                                onChange={(event) => setDocumentDraft((current) => ({ ...current, notes: event.target.value }))}
                              />
                            </div>
                            <label className="block rounded-[24px] border border-dashed border-border bg-card/70 p-5 text-center">
                              <UploadCloud className="mx-auto h-5 w-5 text-amber-700 dark:text-amber-200" />
                              <div className="mt-3 text-sm font-medium text-ink">
                                {documentDraft.file ? documentDraft.file.name : "Choose a document file"}
                              </div>
                              <div className="mt-1 text-xs text-muted">PDF, images, Word, and Excel files up to 8MB</div>
                              <input
                                type="file"
                                className="sr-only"
                                onChange={(event) => setDocumentDraft((current) => ({ ...current, file: event.target.files?.[0] ?? null }))}
                              />
                            </label>
                            <div className="flex justify-end">
                              <Button onClick={submitDocumentUpload} disabled={documentUploading || !documentDraft.file}>
                                {documentUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud size={16} />}
                                Upload document
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted">
                            This role can review documents but cannot upload or remove them.
                          </div>
                        )}
                      </Card>

                      <Card className="border-none bg-bg/70 p-5 shadow-none">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-ink">Stored Documents</h3>
                            <p className="text-sm text-muted">Department and assignment attachments with uploader and timestamp context.</p>
                          </div>
                          <Badge>{selectedDepartment.documents.length} files</Badge>
                        </div>
                        <DocumentList
                          items={selectedDepartment.documents}
                          canManage={canWriteDocuments}
                          deletingId={documentDeletingId}
                          onDelete={removeDocument}
                        />
                      </Card>
                    </div>
                  ) : null}

                  {detailTab === "history" ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-ink">Department History</h3>
                          <p className="text-sm text-muted">Previous lead edits, assignment approvals, uploads, and dated training milestones for this department.</p>
                        </div>
                        {canReadHistory ? (
                          <div className="flex flex-wrap gap-2">
                            <WorkspaceViewButton
                              active={historyVisualMode === "calendar"}
                              onClick={() => setHistoryVisualMode("calendar")}
                              label="Calendar"
                            />
                            <WorkspaceViewButton
                              active={historyVisualMode === "list"}
                              onClick={() => setHistoryVisualMode("list")}
                              label="List"
                            />
                          </div>
                        ) : null}
                      </div>
                      {canReadHistory ? (
                        historyVisualMode === "calendar" ? (
                          <TimelineCalendarView
                            entries={selectedDepartmentTimelineEntries}
                            emptyMessage="No department history or training milestones have been recorded yet."
                          />
                        ) : (
                          <ActivityList items={selectedDepartment.activity} />
                        )
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted">
                          History visibility is restricted for this role.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-muted">Select a department to inspect its details.</div>
              )}
            </Card>
          </motion.div>
        </div>
      ) : null}

      {view === "assignments" ? (
        <motion.div {...cardMotion}>
          <Card className="overflow-hidden">
            <div className="border-b border-border px-6 py-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-ink">Assignment Console</h2>
                  <p className="mt-1 text-sm text-muted">Cross-department trainee tracking with quick search and lifecycle filtering.</p>
                </div>
                {canManage ? (
                  <Button onClick={() => openAssignmentEditor()}>
                    <PlusCircle size={16} />
                    Add assignment
                  </Button>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input
                    className="pl-9"
                    placeholder="Search trainee"
                    value={assignmentFilters.q}
                    onChange={(event) => setAssignmentFilters((current) => ({ ...current, q: event.target.value }))}
                  />
                </div>
                <Select
                  value={assignmentFilters.department_id}
                  onChange={(event) => setAssignmentFilters((current) => ({ ...current, department_id: event.target.value }))}
                >
                  <option value="">All departments</option>
                  {(meta?.departments ?? []).map((department) => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </Select>
                <Select
                  value={assignmentFilters.status}
                  onChange={(event) => setAssignmentFilters((current) => ({ ...current, status: event.target.value as ParishCouncilAssignmentStatus | "" }))}
                >
                  <option value="">All statuses</option>
                  {(meta?.assignment_statuses ?? []).map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </Select>
                <Select
                  value={assignmentFilters.approval_status}
                  onChange={(event) => setAssignmentFilters((current) => ({ ...current, approval_status: event.target.value as ParishCouncilApprovalStatus | "" }))}
                >
                  <option value="">All approvals</option>
                  {(meta?.approval_statuses ?? []).map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </Select>
                <Button
                  variant={assignmentFilters.active_only ? "solid" : "ghost"}
                  onClick={() => setAssignmentFilters((current) => ({ ...current, active_only: !current.active_only }))}
                >
                  {assignmentFilters.active_only ? "Active only" : "All assignments"}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-bg/70 text-left text-xs uppercase tracking-[0.18em] text-muted">
                  <tr>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Trainee</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Dates</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Approval</th>
                    {canManage ? <th className="px-4 py-3">Action</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {assignments.length ? (
                    assignments.map((assignment) => (
                      <tr key={assignment.id} className="align-top">
                        <td className="px-4 py-4 font-medium text-ink">{assignment.department_name}</td>
                        <td className="px-4 py-4">
                          <div className="font-medium text-ink">{assignment.trainee_full_name}</div>
                          <div className="mt-1 text-xs text-muted">
                            {assignment.trainee_age != null ? `${assignment.trainee_age} years old` : "Age pending"}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-muted">
                          {assignment.trainee_email ? <div>{assignment.trainee_email}</div> : <div>Email missing</div>}
                          {assignment.trainee_phone ? <div>{assignment.trainee_phone}</div> : <div>Phone missing</div>}
                        </td>
                        <td className="px-4 py-4 text-muted">
                          <div>{formatDate(assignment.training_from)}</div>
                          <div>to {formatDate(assignment.training_to)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={statusBadgeClass[assignment.status] ?? ""}>{assignment.status}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={approvalBadgeClass[assignment.approval_status]}>{assignment.approval_status}</Badge>
                        </td>
                        {canManage ? (
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button variant="ghost" onClick={() => openAssignmentEditor(assignment)}>Edit</Button>
                              {canWriteApprovals ? (
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    openApprovalDialog(
                                      assignment,
                                      assignment.approval_status === "Pending" ? "approve" : "submit",
                                    )
                                  }
                                >
                                  {assignment.approval_status === "Pending" ? "Review" : "Resubmit"}
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-muted">
                        No assignments match the current filter set.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      ) : null}

      {view === "timeline" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Timeline</h2>
              <p className="text-sm text-muted">Audit events and training deadlines across all parish council departments.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <WorkspaceViewButton
                active={workspaceTimelineMode === "calendar"}
                onClick={() => setWorkspaceTimelineMode("calendar")}
                label="Calendar"
              />
              <WorkspaceViewButton
                active={workspaceTimelineMode === "list"}
                onClick={() => setWorkspaceTimelineMode("list")}
                label="List"
              />
            </div>
          </div>

          {workspaceTimelineMode === "calendar" ? (
            <motion.div {...cardMotion}>
              <Card className="p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-ink">Operations Calendar</h2>
                  <p className="text-sm text-muted">A visual date view of audit activity and upcoming training deadlines.</p>
                </div>
                <TimelineCalendarView
                  entries={workspaceTimelineEntries}
                  emptyMessage="No activity or training deadlines have been recorded yet."
                />
              </Card>
            </motion.div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
              <motion.div {...cardMotion}>
                <Card className="p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-ink">Recent Activity</h2>
                    <p className="text-sm text-muted">Chronological audit trail across departments and assignments.</p>
                  </div>
                  <ActivityList items={activity} />
                </Card>
              </motion.div>
              <motion.div {...cardMotion} transition={{ duration: 0.28, delay: 0.05 }}>
                <Card className="p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-ink">Upcoming Training Actions</h2>
                    <p className="text-sm text-muted">Assignments ending soon so office staff can extend, complete, or follow up.</p>
                  </div>
                  <div className="space-y-3">
                    {(overview?.upcoming_end_dates ?? []).length ? (
                      overview?.upcoming_end_dates.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-border bg-bg/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-ink">{item.trainee_full_name}</div>
                              <div className="mt-1 text-sm text-muted">{item.department_name}</div>
                            </div>
                            <Badge className={statusBadgeClass[item.status] ?? ""}>{item.status}</Badge>
                          </div>
                          <div className="mt-3 text-sm text-muted">Ends {formatDate(item.training_to)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted">There are no upcoming training deadlines right now.</div>
                    )}
                  </div>
                </Card>
              </motion.div>
            </div>
          )}
        </div>
      ) : null}

      <ModalShell
        open={departmentEditorOpen}
        title="Department Lead Settings"
        subtitle="Update lead ownership, department status, and age rule settings."
        onClose={() => setDepartmentEditorOpen(false)}
      >
        {departmentForm ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Description</label>
                <Textarea
                  rows={4}
                  value={departmentForm.description}
                  disabled={!canWriteDepartmentDescription}
                  onChange={(event) => setDepartmentForm((current) => current ? { ...current, description: event.target.value } : current)}
                />
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-ink">Status</label>
                  <Select
                    value={departmentForm.status}
                    disabled={!canWriteDepartmentStatus}
                    onChange={(event) => setDepartmentForm((current) => current ? { ...current, status: event.target.value as ParishCouncilDepartmentStatus } : current)}
                  >
                    {(meta?.department_statuses ?? []).map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-ink">Minimum trainee age</label>
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    value={departmentForm.minimum_age}
                    disabled={!canWriteMinimumAge}
                    onChange={(event) => setDepartmentForm((current) => current ? { ...current, minimum_age: event.target.value } : current)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-[26px] border border-border bg-bg/60 p-5">
              <div>
                <h4 className="text-base font-semibold text-ink">Link existing member</h4>
                <p className="mt-1 text-sm text-muted">Search a parish member to prefill the lead profile, then adjust any local snapshot fields if needed.</p>
              </div>
              <Input
                placeholder="Search member name"
                value={departmentMemberQuery}
                onChange={(event) => setDepartmentMemberQuery(event.target.value)}
              />
              {departmentMemberResults.length ? (
                <div className="grid gap-2">
                  {departmentMemberResults.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className="rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-accent/30 hover:bg-accent/5"
                      onClick={() => selectDepartmentLead(member)}
                    >
                      <div className="font-medium text-ink">{member.first_name} {member.last_name}</div>
                      <div className="mt-1 text-sm text-muted">{member.email || "No email"} • {member.phone || "No phone"}</div>
                    </button>
                  ))}
                </div>
              ) : departmentMemberQuery.trim() ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted">
                  No members matched that lead search. Try first name, last name, email, or username.
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted">
                  Start typing to search and link an existing parish member as the department lead.
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Lead first name</label>
                <Input
                  value={departmentForm.lead_first_name}
                  disabled={!canWriteLeadName}
                  onChange={(event) => setDepartmentForm((current) => current ? { ...current, lead_first_name: event.target.value } : current)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Lead last name</label>
                <Input
                  value={departmentForm.lead_last_name}
                  disabled={!canWriteLeadName}
                  onChange={(event) => setDepartmentForm((current) => current ? { ...current, lead_last_name: event.target.value } : current)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Lead email</label>
                <Input
                  type="email"
                  value={departmentForm.lead_email}
                  disabled={!canWriteLeadEmail}
                  onChange={(event) => setDepartmentForm((current) => current ? { ...current, lead_email: event.target.value } : current)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Lead phone</label>
                <PhoneInput
                  value={departmentForm.lead_phone}
                  disabled={!canWriteLeadPhone}
                  onChange={(value) => setDepartmentForm((current) => current ? { ...current, lead_phone: value } : current)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Lead term start</label>
                <Input
                  type="date"
                  value={departmentForm.lead_term_start}
                  disabled={!canWriteLeadTermDates}
                  onChange={(event) => setDepartmentForm((current) => current ? { ...current, lead_term_start: event.target.value } : current)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Lead term end</label>
                <Input
                  type="date"
                  value={departmentForm.lead_term_end}
                  disabled={!canWriteLeadTermDates}
                  onChange={(event) => setDepartmentForm((current) => current ? { ...current, lead_term_end: event.target.value } : current)}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Notes</label>
              <Textarea
                rows={4}
                value={departmentForm.notes}
                disabled={!canWriteNotes}
                onChange={(event) => setDepartmentForm((current) => current ? { ...current, notes: event.target.value } : current)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDepartmentEditorOpen(false)}>Cancel</Button>
              <Button onClick={saveDepartment} disabled={departmentSaving}>
                {departmentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={16} />}
                Save changes
              </Button>
            </div>
          </div>
        ) : null}
      </ModalShell>

      <ModalShell
        open={assignmentEditorOpen}
        title={assignmentEditing ? "Update Trainee Assignment" : "Assign Trainee"}
        subtitle="Wizard-based entry keeps trainee setup, contact capture, and training dates clean."
        onClose={() => setAssignmentEditorOpen(false)}
      >
        <div className="mb-6 grid gap-2 md:grid-cols-5">
          {["Department", "Trainee Source", "Contact", "Training", "Review"].map((label, index) => (
            <div
              key={label}
              className={`rounded-2xl border px-4 py-3 text-sm ${
                assignmentStep === index
                  ? "border-accent/30 bg-accent/10 text-ink"
                  : assignmentStep > index
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                    : "border-border bg-bg/60 text-muted"
              }`}
            >
              <div className="text-[11px] uppercase tracking-[0.18em]">{`Step ${index + 1}`}</div>
              <div className="mt-2 font-medium">{label}</div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          {assignmentStep === 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Department</label>
                <Select
                  value={assignmentForm.department_id}
                  onChange={(event) => setAssignmentForm((current) => ({ ...current, department_id: event.target.value }))}
                >
                  <option value="">Select department</option>
                  {(meta?.departments ?? []).map((department) => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </Select>
              </div>
              <Card className="border-none bg-bg/60 p-5 shadow-none">
                <div className="text-xs uppercase tracking-[0.18em] text-muted">Rule preview</div>
                <div className="mt-3 text-lg font-semibold text-ink">
                  {selectedDepartmentMeta
                    ? selectedDepartmentMeta.minimum_age > 0
                      ? `${selectedDepartmentMeta.minimum_age}+ years required`
                      : "Underage exception is allowed"
                    : "Choose a department"}
                </div>
                <div className="mt-2 text-sm text-muted">
                  The department configuration drives trainee age validation on save.
                </div>
              </Card>
            </div>
          ) : null}

          {assignmentStep === 1 ? (
            <div className="space-y-5">
              <div className="flex gap-2">
                <Button
                  variant={assignmentForm.source_mode === "member" ? "solid" : "ghost"}
                  onClick={() => setAssignmentForm((current) => ({ ...current, source_mode: "member" }))}
                >
                  Existing member
                </Button>
                <Button
                  variant={assignmentForm.source_mode === "manual" ? "solid" : "ghost"}
                  onClick={() => setAssignmentForm((current) => ({ ...current, source_mode: "manual", trainee_member_id: "" }))}
                >
                  Manual record
                </Button>
              </div>
              {assignmentForm.source_mode === "member" ? (
                <div className="space-y-4">
                  <Input
                    placeholder="Search member name"
                    value={assignmentMemberQuery}
                    onChange={(event) => setAssignmentMemberQuery(event.target.value)}
                  />
                  {assignmentMemberResults.length ? (
                    <div className="grid gap-2">
                      {assignmentMemberResults.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className="rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-accent/30 hover:bg-accent/5"
                          onClick={() => selectAssignmentMember(member)}
                        >
                          <div className="font-medium text-ink">{member.first_name} {member.last_name}</div>
                          <div className="mt-1 text-sm text-muted">{member.email || "No email"} • {member.phone || "No phone"}</div>
                        </button>
                      ))}
                    </div>
                  ) : assignmentMemberQuery.trim() ? (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted">
                      No members matched that search. Try first name, last name, email, or username.
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted">
                      Search for a member to prefill the trainee record.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted">
                  Manual record mode selected. Continue to the next step to enter trainee details directly.
                </div>
              )}
            </div>
          ) : null}

          {assignmentStep === 2 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">First name</label>
                <Input
                  value={assignmentForm.trainee_first_name}
                  disabled={!canWriteTraineeName && assignmentForm.source_mode === "member"}
                  onChange={(event) => setAssignmentForm((current) => ({ ...current, trainee_first_name: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Last name</label>
                <Input
                  value={assignmentForm.trainee_last_name}
                  disabled={!canWriteTraineeName && assignmentForm.source_mode === "member"}
                  onChange={(event) => setAssignmentForm((current) => ({ ...current, trainee_last_name: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Email</label>
                <Input
                  type="email"
                  value={assignmentForm.trainee_email}
                  disabled={!canWriteTraineeEmail}
                  onChange={(event) => setAssignmentForm((current) => ({ ...current, trainee_email: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Phone</label>
                <PhoneInput
                  value={assignmentForm.trainee_phone}
                  disabled={!canWriteTraineePhone}
                  onChange={(value) => setAssignmentForm((current) => ({ ...current, trainee_phone: value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Birth date</label>
                <Input
                  type="date"
                  value={assignmentForm.trainee_birth_date}
                  disabled={!canWriteTraineeBirthDate}
                  onChange={(event) => setAssignmentForm((current) => ({ ...current, trainee_birth_date: event.target.value }))}
                />
              </div>
            </div>
          ) : null}

          {assignmentStep === 3 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Training start</label>
                <Input
                  type="date"
                  value={assignmentForm.training_from}
                  disabled={!canWriteTrainingDates}
                  onChange={(event) => setAssignmentForm((current) => ({ ...current, training_from: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Training end</label>
                <Input
                  type="date"
                  value={assignmentForm.training_to}
                  disabled={!canWriteTrainingDates}
                  onChange={(event) => setAssignmentForm((current) => ({ ...current, training_to: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">Status</label>
                <Select
                  value={assignmentForm.status}
                  disabled={!canWriteTrainingStatus}
                  onChange={(event) => setAssignmentForm((current) => ({ ...current, status: event.target.value as ParishCouncilAssignmentStatus }))}
                >
                  {(meta?.assignment_statuses ?? []).map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </Select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-ink">Notes</label>
                <Textarea
                  rows={5}
                  value={assignmentForm.notes}
                  disabled={!canWriteNotes}
                  onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </div>
            </div>
          ) : null}

          {assignmentStep === 4 ? (
            <div className="space-y-5">
              <Card className="border-none bg-bg/60 p-5 shadow-none">
                <div className="text-xs uppercase tracking-[0.18em] text-muted">Summary</div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-sm text-muted">Department</div>
                    <div className="mt-1 font-medium text-ink">{selectedDepartmentMeta?.name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted">Trainee</div>
                    <div className="mt-1 font-medium text-ink">{assignmentForm.trainee_first_name} {assignmentForm.trainee_last_name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted">Training window</div>
                    <div className="mt-1 font-medium text-ink">{formatDate(assignmentForm.training_from)} to {formatDate(assignmentForm.training_to)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted">Status</div>
                    <div className="mt-1 font-medium text-ink">{assignmentForm.status}</div>
                  </div>
                </div>
              </Card>
              {assignmentWarnings.length ? (
                <Card className="border border-amber-500/20 bg-amber-500/10 p-5 shadow-none">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-700 dark:text-amber-200" />
                    <div>
                      <div className="font-medium text-ink">Validation warnings</div>
                      <div className="mt-3 space-y-2 text-sm text-muted">
                        {assignmentWarnings.map((warning) => (
                          <div key={warning}>{warning}</div>
                        ))}
                      </div>
                      <label className="mt-4 inline-flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={assignmentForm.allow_same_person}
                          onChange={(event) => setAssignmentForm((current) => ({ ...current, allow_same_person: event.target.checked }))}
                        />
                        Confirm if lead and trainee are intentionally the same person
                      </label>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="border border-emerald-500/20 bg-emerald-500/10 p-5 shadow-none">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-200" />
                    <div className="text-sm text-ink">Validation checks are clear. The assignment is ready to save.</div>
                  </div>
                </Card>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setAssignmentEditorOpen(false)}>Cancel</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setAssignmentStep((current) => Math.max(0, current - 1))} disabled={assignmentStep === 0}>
              Back
            </Button>
            {assignmentStep < 4 ? (
              <Button onClick={() => assignmentCanAdvance && setAssignmentStep((current) => Math.min(4, current + 1))} disabled={!assignmentCanAdvance}>
                Next
                <ArrowRight size={16} />
              </Button>
            ) : (
              <Button onClick={saveAssignment} disabled={assignmentSaving}>
                {assignmentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={16} />}
                Save assignment
              </Button>
            )}
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={Boolean(approvalDialog)}
        title={
          approvalDialog?.action === "approve"
            ? "Approve Assignment"
            : approvalDialog?.action === "reject"
              ? "Reject Assignment"
              : "Submit for Approval"
        }
        subtitle="Record the approval decision with clear notes so the history trail stays useful."
        onClose={() => {
          setApprovalDialog(null);
          setApprovalNote("");
        }}
      >
        {approvalDialog ? (
          <div className="space-y-6">
            <Card className="border-none bg-bg/60 p-5 shadow-none">
              <div className="text-xs uppercase tracking-[0.18em] text-muted">Assignment</div>
              <div className="mt-2 text-lg font-semibold text-ink">{approvalDialog.assignment.trainee_full_name}</div>
              <div className="mt-1 text-sm text-muted">{approvalDialog.assignment.department_name}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge className={statusBadgeClass[approvalDialog.assignment.status] ?? ""}>{approvalDialog.assignment.status}</Badge>
                <Badge className={approvalBadgeClass[approvalDialog.assignment.approval_status]}>{approvalDialog.assignment.approval_status}</Badge>
              </div>
            </Card>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Approval note</label>
              <Textarea
                rows={5}
                placeholder={
                  approvalDialog.action === "reject"
                    ? "Explain what must be corrected before this assignment can move forward"
                    : "Optional note for approvers and future history review"
                }
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setApprovalDialog(null);
                  setApprovalNote("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={submitApprovalAction} disabled={approvalSaving}>
                {approvalSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck size={16} />}
                {approvalDialog.action === "approve"
                  ? "Approve"
                  : approvalDialog.action === "reject"
                    ? "Reject"
                    : "Submit"}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </div>
  );
}
