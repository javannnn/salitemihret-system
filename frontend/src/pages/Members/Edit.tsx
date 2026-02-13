import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, Input, Select, Textarea, Button, Badge } from "@/components/ui";
import {
  API_BASE,
  ApiError,
  MemberDuplicateMatch,
  MemberAuditEntry,
  MemberDetail,
  MemberStatus,
  MemberSundaySchoolParticipantStatus,
  MembersMeta,
  Payment,
  PaymentServiceType,
  api,
  findMemberDuplicates,
  createPaymentEntry,
  getMemberAudit,
  getMembersMeta,
  getPaymentServiceTypes,
  listPayments,
  uploadAvatar,
  uploadContributionExceptionAttachment,
  deleteAvatar,
  deleteContributionExceptionAttachment,
} from "@/lib/api";
import { AvatarEditor } from "@/components/AvatarEditor";
import { useToast } from "@/components/Toast";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  CreditCard,
  FileText,
  GraduationCap,
  MoreVertical,
  Paperclip,
  PlusCircle,
  ShieldAlert,
  Trash2,
  UsersRound,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

const STATUS_OPTIONS: MemberStatus[] = ["Active", "Inactive", "Pending", "Archived"];
const statusChipStyles: Record<MemberStatus, string> = {
  Active: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800",
  Inactive: "bg-slate-100 text-slate-600 ring-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
  Pending: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800",
  Archived: "bg-slate-200 text-slate-600 ring-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
};

const SUNDAY_STATUS_STYLES: Record<MemberSundaySchoolParticipantStatus, string> = {
  "Up to date": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  Overdue: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300",
  "No payments yet": "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  "Not contributing": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const SECTION_NAV_ITEMS = [
  { id: "identity", label: "Identity" },
  { id: "membership", label: "Membership" },
  { id: "sundaySchool", label: "Sunday school" },
  { id: "contact", label: "Contact" },
  { id: "household", label: "Household" },
  { id: "giving", label: "Giving" },
  { id: "payments", label: "Payments" },
  { id: "family", label: "Family" },
  { id: "ministries", label: "Ministries" },
  { id: "notes", label: "Notes" },
] as const;

type SectionId = (typeof SECTION_NAV_ITEMS)[number]["id"];

const CANADIAN_COUNTRY_CODE = "+1";
const CANADA_FLAG = "🇨🇦";

const extractCanadianDigits = (value?: string | null) => {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) {
    digits = digits.slice(1);
  }
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
};

const formatCanadianPhoneDisplay = (digits: string) => {
  if (!digits) return "";
  const area = digits.slice(0, 3);
  const mid = digits.slice(3, 6);
  const last = digits.slice(6, 10);
  let output = "";
  if (area) {
    output += area.length === 3 ? `(${area})` : area;
  }
  if (mid) {
    output += area.length === 3 ? " " : "";
    output += mid;
  }
  if (last) {
    output += mid.length === 3 ? "-" : "";
    output += last;
  }
  return output.trim();
};

const normalizeCanadianInput = (input: string) => {
  const rawDigits = input.replace(/\D/g, "");
  let digits = rawDigits;
  let autoAdjusted = false;
  if (digits.startsWith("1") && digits.length > 10) {
    digits = digits.slice(1);
    autoAdjusted = true;
  }
  if (digits.length > 10) {
    digits = digits.slice(0, 10);
    autoAdjusted = true;
  }
  return { digits, autoAdjusted: autoAdjusted || (!!digits && rawDigits !== digits) };
};

const formatCanadianPostalCode = (value: string) => {
  if (!value) return "";

  // Remove non-alphanumeric characters and convert to uppercase
  let clean = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  // Filter out invalid characters globally: D, F, I, O, Q, U
  clean = clean.replace(/[DFIOQU]/g, "");

  // Enforce first character restrictions: cannot be W or Z
  if (clean.length > 0 && /[WZ]/.test(clean[0])) {
    clean = clean.slice(1);
  }

  // Enforce alternating format: Letter-Number-Letter Number-Letter-Number
  let formatted = "";
  for (let i = 0; i < clean.length && i < 6; i++) {
    const char = clean[i];
    const isLetterPosition = i % 2 === 0; // 0, 2, 4 are letters

    if (isLetterPosition) {
      if (/[A-Z]/.test(char)) {
        formatted += char;
      }
      // If it's a number in a letter position, we skip it (or could stop, but skipping feels better for typing)
    } else {
      if (/[0-9]/.test(char)) {
        formatted += char;
      }
    }
  }

  // Add space after FSA (first 3 chars)
  if (formatted.length > 3) {
    formatted = `${formatted.slice(0, 3)} ${formatted.slice(3)}`;
  }

  return formatted;
};

type SpouseFormState = {
  first_name: string;
  last_name: string;
  gender: string;
  country_of_birth: string;
  phone: string;
  email: string;
};

type ChildFormState = {
  key: string;
  first_name: string;
  last_name: string;
  gender: string;
  birth_date: string;
  country_of_birth: string;
  notes: string;
};

type MemberPaymentForm = {
  amount: string;
  paid_at: string;
  method: string;
  note: string;
  service_type_code: string;
};

const makeChildKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createChildFormState = (initial?: Partial<ChildFormState>): ChildFormState => ({
  key: initial?.key ?? makeChildKey(),
  first_name: initial?.first_name ?? "",
  last_name: initial?.last_name ?? "",
  gender: initial?.gender ?? "",
  birth_date: initial?.birth_date ?? "",
  country_of_birth: initial?.country_of_birth ?? "",
  notes: initial?.notes ?? "",
});

const cloneMemberDetail = (value: MemberDetail): MemberDetail =>
  JSON.parse(JSON.stringify(value)) as MemberDetail;

const createBlankMemberDetail = (): MemberDetail => {
  const nowIso = new Date().toISOString();
  return {
    id: 0,
    username: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    status: "Active",
    gender: null,
    birth_date: null,
    join_date: null,
    marital_status: null,
    baptismal_name: null,
    district: null,
    phone: "",
    email: null,
    avatar_path: null,
    address: null,
    address_street: null,
    address_city: null,
    address_region: null,
    address_postal_code: null,
    address_country: null,
    is_tither: false,
    pays_contribution: true,
    contribution_method: null,
    contribution_amount: 75,
    contribution_currency: "CAD",
    contribution_exception_reason: null,
    contribution_exception_attachment_path: null,
    notes: null,
    family_count: 1,
    household_size_override: null,
    has_father_confessor: false,
    status_override: false,
    status_override_value: null,
    status_override_reason: null,
    created_at: nowIso,
    updated_at: nowIso,
    created_by_id: null,
    updated_by_id: null,
    membership_health: {
      effective_status: "Active",
      auto_status: "Active",
      override_active: false,
      override_reason: null,
      last_paid_at: null,
      next_due_at: null,
      days_until_due: null,
      overdue_days: null,
      consecutive_months: 0,
      required_consecutive_months: 6,
    },
    membership_events: [],
    contribution_history: [],
    sunday_school_participants: [],
    sunday_school_payments: [],
    children: [],
    tags: [],
    ministries: [],
    household: null,
    spouse: null,
    father_confessor: null,
  };
};

type EditMemberProps = { mode?: "create" | "edit" };

export default function EditMember({ mode = "edit" }: EditMemberProps) {
  return (
    <ProtectedRoute roles={["Registrar", "Admin", "PublicRelations", "Clerk", "OfficeAdmin", "FinanceAdmin"]}>
      <EditMemberInner mode={mode} />
    </ProtectedRoute>
  );
}

function SummaryCards({ member, formatDate }: { member: MemberDetail; formatDate: (value?: string | null) => string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide">Household & Ministries</h3>
        <div className="text-sm">
          <div className="text-xs uppercase text-mute">Household</div>
          {member.household ? (
            <div className="font-medium">{member.household.name}</div>
          ) : (
            <div className="text-mute">No household assigned</div>
          )}
        </div>
        <div className="text-sm">
          <div className="text-xs uppercase text-mute">Tags</div>
          <div className="flex flex-wrap gap-2 mt-1">
            {member.tags.length > 0 ? (
              member.tags.map((tag) => (
                <Badge key={tag.id} className="normal-case">
                  {tag.name}
                </Badge>
              ))
            ) : (
              <span className="text-mute text-xs">No tags yet</span>
            )}
          </div>
        </div>
        <div className="text-sm">
          <div className="text-xs uppercase text-mute">Ministries</div>
          <div className="flex flex-wrap gap-2 mt-1">
            {member.ministries.length > 0 ? (
              member.ministries.map((ministry) => (
                <Badge key={ministry.id} className="normal-case">
                  {ministry.name}
                </Badge>
              ))
            ) : (
              <span className="text-mute text-xs">No ministries yet</span>
            )}
          </div>
        </div>
      </div>
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide">Profile Snapshot</h3>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase text-mute">Gender</div>
            <div>{member.gender || "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-mute">Marital status</div>
            <div>{member.marital_status || "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-mute">District</div>
            <div>{member.district || "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-mute">Family count</div>
            <div>{member.family_count}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-mute">Birth date</div>
            <div>{formatDate(member.birth_date)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-mute">Membership date</div>
            <div>{formatDate(member.join_date)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-mute">Father confessor</div>
            <div>{member.father_confessor?.full_name ?? (member.has_father_confessor ? "Assigned" : "—")}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-mute">Giving</div>
            <div>
              {member.is_tither ? "Tither" : "Non-tither"}
              {" · "}
              {member.pays_contribution ? "Gives contribution" : "Contribution pending"}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs uppercase text-mute">Contribution details</div>
            <div>
              {member.contribution_method || "—"}
              {member.contribution_amount !== null && member.contribution_amount !== undefined && (
                <span>
                  {" · "}
                  {member.contribution_currency} {member.contribution_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
              {member.contribution_exception_reason && (
                <span className="text-amber-600"> · {member.contribution_exception_reason === "LowIncome" ? "Low income" : member.contribution_exception_reason} exception</span>
              )}
              {member.contribution_exception_reason === "LowIncome" && member.contribution_exception_attachment_path && (
                <span className="text-emerald-700 dark:text-emerald-300"> · PDF attached</span>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs uppercase text-mute">Address</div>
            <div>
              {[
                member.address,
                member.address_street,
                member.address_city,
                member.address_region,
                member.address_postal_code,
                member.address_country,
              ]
                .filter(Boolean)
                .join(", ") || "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AvatarCard({
  avatarUrl,
  initials,
  canUpload,
  uploading,
  onChangeClick,
  onRemoveClick,
  removing,
}: {
  avatarUrl: string | null;
  initials: string;
  canUpload: boolean;
  uploading: boolean;
  onChangeClick: () => void;
  onRemoveClick: () => void;
  removing: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-4 shadow-sm">
      <div className="relative mx-auto">
        <div className="h-28 w-28 rounded-full border border-border bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center text-2xl font-semibold overflow-hidden shadow-sm">
          {avatarUrl ? <img src={avatarUrl} alt="Member avatar" className="h-full w-full object-cover" /> : initials || "—"}
        </div>
      </div>
      <div className="space-y-2">
        <Button
          variant="soft"
          className="w-full rounded-full"
          onClick={onChangeClick}
          disabled={uploading || removing || !canUpload}
        >
          {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
        </Button>
        {avatarUrl && canUpload && (
          <Button
            variant="ghost"
            className="w-full rounded-full text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={onRemoveClick}
            disabled={uploading || removing}
          >
            {removing ? "Removing…" : "Remove photo"}
          </Button>
        )}
        <p className="text-[11px] text-mute">PNG, JPG or WEBP up to 5MB</p>
        {!canUpload && <p className="text-[11px] text-mute">Avatar updates require Registrar or Admin permissions</p>}
      </div>
    </div>
  );
}

type QuickAction = {
  label: string;
  description?: string;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
};

function QuickActionsCard({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-mute">Quick actions</h3>
      <div className="space-y-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={`w-full rounded-2xl border px-3 py-3 text-left transition ${action.disabled ? "border-border/50 text-mute/50 cursor-not-allowed" : "border-border hover:bg-accent/10"
              }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${action.disabled ? "bg-accent/10 text-mute/50" : "bg-accent/10 text-ink"
                  }`}
              >
                {action.icon}
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink">{action.label}</div>
                {action.description && <p className="text-xs text-mute">{action.description}</p>}
              </div>
              <ArrowUpRight className="h-4 w-4 text-mute/50" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

type SnapshotCardProps = {
  memberAge: number | null;
  membershipSince: string;
  sundayLinkedCount: number;
  sundaySummary: { upToDate: number; overdue: number; pending: number; notContributing: number };
  sundayContributors: number;
  lastContributionDate: string;
  lastSundayPayment: string;
  addressSummary: string;
  isTither: boolean;
  paysContribution: boolean;
};

function SnapshotCard({
  memberAge,
  membershipSince,
  sundayLinkedCount,
  sundaySummary,
  sundayContributors,
  lastContributionDate,
  lastSundayPayment,
  addressSummary,
  isTither,
  paysContribution,
}: SnapshotCardProps) {
  const sundayStatusLabel = sundayLinkedCount
    ? `${sundaySummary.upToDate} up to date · ${sundaySummary.overdue} overdue`
    : "No participants yet";
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-mute">Member snapshot</h3>
      <div className="grid gap-3">
        <div className="rounded-xl border border-border/50 bg-card/50 px-3 py-2 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase text-mute">Age</div>
            <div className="text-base font-semibold text-ink">{memberAge ?? "—"}</div>
          </div>
          <div className="text-xs text-mute">Member since {membershipSince}</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/50 px-3 py-2">
          <div className="text-[11px] uppercase text-mute">Contribution status</div>
          <div className="font-semibold text-ink">
            {isTither ? "Tither" : "Non-tither"} · {paysContribution ? "Contribution active" : "Contribution paused"}
          </div>
          <div className="text-xs text-mute">Last ledger payment: {lastContributionDate}</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/50 px-3 py-2">
          <div className="text-[11px] uppercase text-mute">Sunday school</div>
          <div className="font-semibold text-ink">
            {sundayLinkedCount} linked · {sundayContributors} contributors
          </div>
          <div className="text-xs text-mute">
            {sundayStatusLabel} · Last payment {lastSundayPayment}
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/50 px-3 py-2">
          <div className="text-[11px] uppercase text-mute">Address</div>
          <div className="font-semibold text-ink">{addressSummary}</div>
        </div>
      </div>
    </div>
  );
}

function AuditTrailCard({
  auditLoading,
  auditEntries,
}: {
  auditLoading: boolean;
  auditEntries: MemberAuditEntry[];
}) {
  return (
    <div className="border rounded-lg p-4 space-y-3" data-tour="member-audit">
      <h3 className="text-sm font-semibold uppercase tracking-wide">Audit Trail</h3>
      {auditLoading ? (
        <div className="text-sm text-mute">Loading audit entries…</div>
      ) : auditEntries.length === 0 ? (
        <div className="text-sm text-mute">No changes recorded yet.</div>
      ) : (
        <ul className="space-y-2 text-sm">
          {auditEntries.map((entry, index) => (
            <li key={`${entry.changed_at}-${index}`} className="border rounded-md p-3">
              <div className="flex items-center justify-between text-xs text-mute">
                <span>{new Date(entry.changed_at).toLocaleString()}</span>
                <span>{entry.actor}</span>
              </div>
              <div className="mt-1 font-medium">
                {entry.action.toUpperCase()} {entry.field}
              </div>
              <div className="text-xs text-mute">
                {entry.old_value ?? "—"} → {entry.new_value ?? "—"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SectionCardProps = {
  id: string;
  title: string;
  subtitle?: string;
  collapsed?: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
  children: ReactNode;
};

const SectionCard = forwardRef<HTMLDivElement, SectionCardProps>(function SectionCardComponent(
  { id, title, subtitle, collapsed = false, onToggle, actions, children }: SectionCardProps,
  ref
) {
  return (
    <section ref={ref} id={id} className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-slate-700">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {(actions || onToggle) && (
          <div className="flex items-center gap-2">
            {actions}
            {onToggle && (
              <button
                type="button"
                onClick={onToggle}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-mute hover:bg-accent/10"
                aria-label={collapsed ? "Expand section" : "Collapse section"}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
              </button>
            )}
          </div>
        )}
      </div>
      {!collapsed && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </section>
  );
});

function EditMemberInner({ mode = "edit" }: EditMemberProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, token } = useAuth();
  const isCreateMode = mode === "create";
  const memberId = id ? Number(id) : null;
  const permissions = usePermissions();
  const disableAll = !permissions.editCore && !permissions.editSpiritual && !permissions.editStatus;
  const disableCore = disableAll || !permissions.editCore;
  const disableFinance = disableAll || !permissions.editFinance;
  const disableSpiritual = disableAll || !permissions.editSpiritual;
  const canViewAudit = permissions.viewAudit;
  const canSubmit = !disableAll;
  const canUploadAvatar = !disableCore;
  const canOverrideStatus = permissions.editStatus || permissions.editFinance;
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [meta, setMeta] = useState<MembersMeta | null>(null);
  const exceptionReasons = meta?.contribution_exception_reasons ?? [];
  const [metaLoading, setMetaLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberLoadError, setMemberLoadError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRemoving, setAvatarRemoving] = useState(false);
  const [exceptionAttachmentUploading, setExceptionAttachmentUploading] = useState(false);
  const [exceptionAttachmentRemoving, setExceptionAttachmentRemoving] = useState(false);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [phoneAutoAdjusted, setPhoneAutoAdjusted] = useState(false);
  const [auditEntries, setAuditEntries] = useState<MemberAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [selectedHousehold, setSelectedHousehold] = useState<string>("");
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [fatherConfessorId, setFatherConfessorId] = useState<string>("");
  const [spouseForm, setSpouseForm] = useState<SpouseFormState | null>(null);
  const [childrenForm, setChildrenForm] = useState<ChildFormState[]>([]);
  const [newPayment, setNewPayment] = useState<MemberPaymentForm>(() => ({
    amount: "75.00",
    paid_at: new Date().toISOString().slice(0, 10),
    method: "",
    note: "",
    service_type_code: "",
  }));
  const [savingPayment, setSavingPayment] = useState(false);
  const [memberPayments, setMemberPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [serviceTypes, setServiceTypes] = useState<PaymentServiceType[]>([]);
  const defaultContributionCode = useMemo(() => {
    if (!serviceTypes.length) return "";
    return serviceTypes.find((type) => type.code === "CONTRIBUTION")?.code || serviceTypes[0].code;
  }, [serviceTypes]);
  const [duplicateMatches, setDuplicateMatches] = useState<MemberDuplicateMatch[]>([]);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const baselineMemberRef = useRef<MemberDetail | null>(null);
  const exceptionAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("identity");
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionId, boolean>>({
    identity: false,
    membership: false,
    sundaySchool: false,
    contact: false,
    household: false,
    giving: true,
    payments: true,
    family: true,
    ministries: false,
    notes: false,
  });
  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    identity: null,
    membership: null,
    sundaySchool: null,
    contact: null,
    household: null,
    giving: null,
    payments: null,
    family: null,
    ministries: null,
    notes: null,
  });
  const setSectionRef = useCallback(
    (id: SectionId) => (node: HTMLDivElement | null) => {
      sectionRefs.current[id] = node;
    },
    []
  );
  const [payWarningPulse, setPayWarningPulse] = useState(false);
  type ConfirmConfig = {
    title?: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
  };
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);

  const openConfirm = (config: ConfirmConfig) => setConfirmConfig(config);
  const closeConfirm = () => setConfirmConfig(null);
  const markDirty = useCallback(() => setHasUnsavedChanges(true), []);

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatCanadianPostalCode(raw);

    // Only update if the formatted value is different or if the user is deleting (to allow backspace)
    // Actually, formatting on every change provides the best "force" experience
    setMember((prev) => (prev ? { ...prev, address_postal_code: formatted } : null));
    markDirty();
  };

  const toggleSectionCollapse = useCallback((id: SectionId) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);
  const scrollToSection = useCallback(
    (id: SectionId) => {
      if (collapsedSections[id]) {
        setCollapsedSections((prev) => ({ ...prev, [id]: false }));
      }
      const target = sectionRefs.current[id];
      if (!target) {
        return;
      }
      const offset = 120;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
      setActiveSection(id);
    },
    [collapsedSections]
  );
  useEffect(() => {
    const handleScroll = () => {
      let closest: SectionId = SECTION_NAV_ITEMS[0].id;
      let minDistance = Number.POSITIVE_INFINITY;
      SECTION_NAV_ITEMS.forEach((section) => {
        const node = sectionRefs.current[section.id];
        if (!node) {
          return;
        }
        const distance = Math.abs(node.getBoundingClientRect().top - 140);
        if (distance < minDistance) {
          minDistance = distance;
          closest = section.id;
        }
      });
      setActiveSection((prev) => (prev === closest ? prev : closest));
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  const memberAge = useMemo(() => {
    if (!member?.birth_date) {
      return null;
    }
    const birth = new Date(member.birth_date);
    if (Number.isNaN(birth.getTime())) {
      return null;
    }
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const hasHadBirthday =
      today.getMonth() > birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
    if (!hasHadBirthday) {
      age -= 1;
    }
    return age;
  }, [member?.birth_date]);
  const sundayStatusSummary = useMemo(() => {
    const summary = {
      upToDate: 0,
      overdue: 0,
      pending: 0,
      notContributing: 0,
    };
    (member?.sunday_school_participants ?? []).forEach((participant) => {
      if (participant.status === "Up to date") {
        summary.upToDate += 1;
      } else if (participant.status === "Overdue") {
        summary.overdue += 1;
      } else if (participant.status === "No payments yet") {
        summary.pending += 1;
      } else {
        summary.notContributing += 1;
      }
    });
    return summary;
  }, [member?.sunday_school_participants]);
  const quickActions = useMemo<QuickAction[]>(
    () =>
      !member?.id
        ? []
        : [
          {
            label: "View payments",
            description: "Open ledger timeline",
            disabled: !permissions.viewPayments,
            onClick: () => navigate(`/payments/members/${member.id}`),
            icon: <CreditCard className="h-4 w-4" />,
          },
          {
            label: "View sponsorships",
            description: "Jump to sponsorship dashboard",
            disabled: !permissions.viewSponsorships,
            onClick: () => navigate("/sponsorships"),
            icon: <UsersRound className="h-4 w-4" />,
          },
          {
            label: "Sunday School records",
            description: "Review linked participants",
            disabled: !permissions.viewSchools,
            onClick: () => navigate(`/schools/sunday-school?member=${member.id}`),
            icon: <BookOpen className="h-4 w-4" />,
          },
          {
            label: "Schools workspace",
            description: "Open Abenet / Sunday School",
            disabled: !permissions.viewSchools,
            onClick: () => navigate("/schools"),
            icon: <GraduationCap className="h-4 w-4" />,
          },
        ],
    [member?.id, navigate, permissions.viewPayments, permissions.viewSchools, permissions.viewSponsorships]
  );

  const loadMemberPayments = useCallback(
    async (memberId: number) => {
      if (!permissions.viewPayments) {
        setMemberPayments([]);
        return;
      }
      setPaymentsLoading(true);
      try {
        const response = await listPayments({ member_id: memberId, page_size: 25 });
        setMemberPayments(response.items);
      } catch (error) {
        console.error(error);
        toast.push("Failed to load payment history");
      } finally {
        setPaymentsLoading(false);
      }
    },
    [permissions.viewPayments, toast]
  );


  const initializeFormsFromMember = useCallback((details: MemberDetail) => {
    setSelectedHousehold(details.household ? String(details.household.id) : "");
    setNewHouseholdName("");
    setFatherConfessorId(details.father_confessor ? String(details.father_confessor.id) : "");
    if (details.marital_status === "Married") {
      setSpouseForm({
        first_name: details.spouse?.first_name ?? "",
        last_name: details.spouse?.last_name ?? "",
        gender: details.spouse?.gender ?? "",
        country_of_birth: details.spouse?.country_of_birth ?? "",
        phone: details.spouse?.phone ?? "",
        email: details.spouse?.email ?? "",
      });
    } else {
      setSpouseForm(null);
    }
    setChildrenForm(
      details.children.map((child) =>
        createChildFormState({
          key: child.id ? `existing-${child.id}` : undefined,
          first_name: child.first_name ?? "",
          last_name: child.last_name ?? "",
          gender: child.gender ?? "",
          birth_date: child.birth_date ?? "",
          country_of_birth: child.country_of_birth ?? "",
          notes: child.notes ?? "",
        })
      )
    );
    const digits = extractCanadianDigits(details.phone);
    setPhoneDisplay(formatCanadianPhoneDisplay(digits));
    setPhoneAutoAdjusted(false);
  }, []);

  useEffect(() => {
    if (!isCreateMode) {
      return;
    }
    const draft = createBlankMemberDetail();
    setMember(draft);
    initializeFormsFromMember(draft);
    baselineMemberRef.current = cloneMemberDetail(draft);
    setHasUnsavedChanges(true);
    setSendWelcomeEmail(true);
  }, [initializeFormsFromMember, isCreateMode]);

  useEffect(() => {
    if (!isCreateMode) {
      setSendWelcomeEmail(false);
    }
  }, [isCreateMode]);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    setMetaLoading(true);
    getMembersMeta()
      .then((data) => {
        if (!cancelled) {
          setMeta(data);
        }
      })
      .catch((error) => {
        console.error(error);
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return;
        }
        if (!cancelled) {
          toast.push("Failed to load metadata");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMetaLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, toast]);

  const fetchMember = useCallback(async () => {
    if (isCreateMode) return;
    if (!memberId || Number.isNaN(memberId)) {
      toast.push("Member not found");
      navigate("/members");
      return;
    }
    setMemberLoading(true);
    setMemberLoadError(null);
    try {
      const data = await api<MemberDetail>(`/members/${memberId}`);
      const normalized = cloneMemberDetail(data);
      setMember(normalized);
      initializeFormsFromMember(normalized);
      baselineMemberRef.current = cloneMemberDetail(data);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError) {
        const friendly = parseApiErrorMessage(error.body) || error.message || `Server error (${error.status})`;
        setMemberLoadError(friendly);
        toast.push(friendly, "error");
      } else if (error instanceof Error) {
        setMemberLoadError(error.message);
        toast.push(error.message, "error");
      } else {
        setMemberLoadError("Failed to load member");
        toast.push("Failed to load member", "error");
      }
    } finally {
      setMemberLoading(false);
    }
  }, [initializeFormsFromMember, isCreateMode, memberId, navigate, toast]);

  useEffect(() => {
    fetchMember();
  }, [fetchMember]);

  useEffect(() => {
    if (!member) return;
    setNewPayment((prev) => ({
      ...prev,
      amount: (member.contribution_amount ?? 75).toFixed(2),
      paid_at: new Date().toISOString().slice(0, 10),
    }));
  }, [member?.id]);

  useEffect(() => {
    if (!member?.id) {
      setMemberPayments([]);
      return;
    }
    loadMemberPayments(member.id);
  }, [member?.id, loadMemberPayments]);

  useEffect(() => {
    if (!permissions.managePayments) {
      setServiceTypes([]);
      return;
    }
    let cancelled = false;
    getPaymentServiceTypes()
      .then((types) => {
        if (!cancelled) {
          setServiceTypes(types);
        }
      })
      .catch((error) => {
        console.error(error);
        toast.push("Failed to load service types");
      });
    return () => {
      cancelled = true;
    };
  }, [permissions.managePayments, toast]);

  useEffect(() => {
    if (!defaultContributionCode) {
      return;
    }
    setNewPayment((prev) =>
      prev.service_type_code ? prev : { ...prev, service_type_code: defaultContributionCode }
    );
  }, [defaultContributionCode]);

  useEffect(() => {
    if (!member) {
      setDuplicateMatches([]);
      return;
    }
    const email = (member.email || "").trim();
    const phone = (member.phone || "").trim();
    const first = (member.first_name || "").trim();
    const last = (member.last_name || "").trim();
    const shouldCheck = !!email || !!phone || (!!first && !!last);
    if (!shouldCheck) {
      setDuplicateMatches([]);
      setDuplicateLoading(false);
      return;
    }
    let cancelled = false;
    setDuplicateLoading(true);
    const timer = setTimeout(() => {
      findMemberDuplicates({
        email: email || undefined,
        phone: phone || undefined,
        first_name: first || undefined,
        last_name: last || undefined,
        exclude_member_id: member.id,
      })
        .then((items) => {
          if (!cancelled) {
            setDuplicateMatches(items);
          }
        })
        .catch((error) => {
          console.error(error);
          if (!cancelled) {
            toast.push("Failed to check duplicates");
            setDuplicateMatches([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setDuplicateLoading(false);
          }
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [member?.id, member?.email, member?.phone, member?.first_name, member?.last_name, toast]);

  const refreshAudit = async (memberId: number) => {
    if (!canViewAudit) {
      setAuditEntries([]);
      setAuditLoading(false);
      return;
    }
    setAuditLoading(true);
    try {
      const entries = await getMemberAudit(memberId);
      setAuditEntries(entries);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        return;
      }
      console.error(error);
      toast.push("Failed to load audit trail");
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (isCreateMode) {
      setAuditEntries([]);
      setAuditLoading(false);
      return;
    }
    if (!memberId || Number.isNaN(memberId)) {
      return;
    }
    if (!canViewAudit) {
      setAuditEntries([]);
      setAuditLoading(false);
      return;
    }
    refreshAudit(memberId);
  }, [canViewAudit, isCreateMode, memberId]);

  useEffect(() => {
    if (!member) return;
    if (!hasUnsavedChanges) {
      toast.push("No changes to save");
      return;
    }
    if (member.marital_status === "Married" && !spouseForm) {
      setSpouseForm({
        first_name: "",
        last_name: "",
        gender: "",
        country_of_birth: "",
        phone: "",
        email: "",
      });
    }
    if (member.marital_status !== "Married" && spouseForm) {
      setSpouseForm(null);
    }
  }, [member?.marital_status]);

  const canDelete = !isCreateMode && (user?.roles.some((role) => role === "Admin" || role === "PublicRelations") ?? false);

  const handleChange =
    (field: keyof MemberDetail) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (disableCore) {
        return;
      }
      const value = event.target.value;
      setMember((prev) => (prev ? { ...prev, [field]: value } : prev));
      markDirty();
    };

  const handlePhoneInputChange = (value: string) => {
    if (disableCore) {
      setPhoneDisplay(value);
      return;
    }
    const normalized = normalizeCanadianInput(value);
    setPhoneDisplay(formatCanadianPhoneDisplay(normalized.digits));
    setPhoneAutoAdjusted(normalized.autoAdjusted);
    setMember((prev) =>
      prev ? { ...prev, phone: normalized.digits ? `${CANADIAN_COUNTRY_CODE}${normalized.digits}` : "" } : prev
    );
    markDirty();
  };

  const acceptAutoAdjustedPhone = () => setPhoneAutoAdjusted(false);


  const handleHouseholdSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (disableCore) {
      return;
    }
    const value = event.target.value;
    setSelectedHousehold(value);
    if (value !== "new") {
      setNewHouseholdName("");
    }
    setMember((prev) => {
      if (!prev) return prev;
      if (value === "" || value === "new") {
        return { ...prev, household: null };
      }
      const household = meta?.households.find((item) => String(item.id) === value);
      return { ...prev, household: household ?? null };
    });
    markDirty();
  };

  const toggleBoolean = (field: "is_tither" | "pays_contribution" | "has_father_confessor") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      if ((field === "is_tither" || field === "pays_contribution") && disableFinance) {
        return;
      }
      if (field === "has_father_confessor" && disableSpiritual) {
        return;
      }
      if (disableAll) {
        return;
      }
      if (field === "pays_contribution" && !checked) {
        setPayWarningPulse(true);
        setTimeout(() => setPayWarningPulse(false), 1200);
        openConfirm({
          title: "Turn off membership contribution?",
          message:
            "Membership contribution is normally required. If you turn this off, please ensure you have approval and a note explaining why.",
          confirmLabel: "Yes, turn off",
          danger: true,
          onConfirm: () => {
            setMember((prev) => (prev ? { ...prev, pays_contribution: false } : prev));
            markDirty();
            closeConfirm();
          },
          onCancel: () => {
            setMember((prev) => (prev ? { ...prev, pays_contribution: true } : prev));
            closeConfirm();
          },
        });
        return;
      }
      setMember((prev) => (prev ? { ...prev, [field]: checked } : prev));
      markDirty();
    };

  const updateSpouseField = (field: keyof SpouseFormState, value: string) => {
    if (disableCore) {
      return;
    }
    setSpouseForm((prev) => {
      if (!prev) {
        return {
          first_name: "",
          last_name: "",
          gender: "",
          country_of_birth: "",
          phone: "",
          email: "",
          [field]: value,
        } as SpouseFormState;
      }
      return { ...prev, [field]: value };
    });
    markDirty();
  };

  const updateChildField = (key: string, field: keyof Omit<ChildFormState, "key">, value: string) => {
    if (disableCore) {
      return;
    }
    setChildrenForm((prev) => prev.map((child) => (child.key === key ? { ...child, [field]: value } : child)));
    markDirty();
  };

  const addChild = () => {
    if (disableCore) return;
    setChildrenForm((prev) => [...prev, createChildFormState()]);
    markDirty();
  };

  const removeChild = (key: string) => {
    if (disableCore) return;
    setChildrenForm((prev) => prev.filter((child) => child.key !== key));
    markDirty();
  };

  const toggleTag = (tagId: number) => {
    if (!meta || disableCore) return;
    setMember((prev) => {
      if (!prev) return prev;
      const exists = prev.tags.some((tag) => tag.id === tagId);
      if (exists) {
        return { ...prev, tags: prev.tags.filter((tag) => tag.id !== tagId) };
      }
      const tag = meta.tags.find((t) => t.id === tagId);
      if (!tag) return prev;
      return { ...prev, tags: [...prev.tags, tag] };
    });
    markDirty();
  };

  const toggleMinistry = (ministryId: number) => {
    if (!meta || disableCore) return;
    setMember((prev) => {
      if (!prev) return prev;
      const exists = prev.ministries.some((ministry) => ministry.id === ministryId);
      if (exists) {
        return { ...prev, ministries: prev.ministries.filter((ministry) => ministry.id !== ministryId) };
      }
      const ministry = meta.ministries.find((m) => m.id === ministryId);
      if (!ministry) return prev;
      return { ...prev, ministries: [...prev.ministries, ministry] };
    });
    markDirty();
  };

  const handleContributionExceptionChange = (value: string) => {
    if (disableFinance) return;
    setMember((prev) => {
      if (!prev) return prev;
      const nextReason = value || null;
      const nextAmount = nextReason ? (prev.contribution_amount ?? 75) : 75;
      return {
        ...prev,
        contribution_exception_reason: nextReason,
        contribution_amount: nextAmount,
      };
    });
    markDirty();
  };

  const handleOverrideToggle = (checked: boolean) => {
    if (!canOverrideStatus || disableAll) {
      return;
    }
    setMember((prev) => {
      if (!prev) return prev;
      const fallbackStatus = prev.membership_health?.effective_status ?? prev.status;
      return {
        ...prev,
        status_override: checked,
        status_override_value: checked ? prev.status_override_value ?? fallbackStatus : null,
        status_override_reason: checked ? prev.status_override_reason ?? "" : null,
      };
    });
    markDirty();
  };

  const handleOverrideStatusChange = (value: MemberStatus) => {
    if (!canOverrideStatus || disableAll) {
      return;
    }
    setMember((prev) => (prev ? { ...prev, status_override_value: value } : prev));
    markDirty();
  };

  const handleOverrideReasonChange = (value: string) => {
    if (!canOverrideStatus || disableAll) {
      return;
    }
    setMember((prev) => (prev ? { ...prev, status_override_reason: value } : prev));
    markDirty();
  };

  const handleRecordPayment = async () => {
    if (!member || !permissions.managePayments) {
      return;
    }
    const amountNumber = Number(newPayment.amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      toast.push("Payment amount must be greater than zero");
      return;
    }
    if (!newPayment.service_type_code) {
      toast.push("Select a service type");
      return;
    }
    setSavingPayment(true);
    try {
      const created = await createPaymentEntry({
        amount: Math.round(amountNumber * 100) / 100,
        service_type_code: newPayment.service_type_code,
        member_id: member.id,
        method: newPayment.method || undefined,
        memo: newPayment.note.trim() || undefined,
        posted_at: newPayment.paid_at ? new Date(newPayment.paid_at).toISOString() : undefined,
      });
      setMemberPayments((prev) => [created, ...prev]);
      toast.push("Payment recorded");
      setNewPayment({
        amount: (member.contribution_amount ?? 75).toFixed(2),
        paid_at: new Date().toISOString().slice(0, 10),
        method: "",
        note: "",
        service_type_code: defaultContributionCode || newPayment.service_type_code,
      });
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError) {
        toast.push(error.body || "Failed to record payment");
      } else {
        toast.push("Failed to record payment");
      }
    } finally {
      setSavingPayment(false);
    }
  };

  const handleCancelChanges = () => {
    if (!baselineMemberRef.current) {
      return;
    }
    const snapshot = cloneMemberDetail(baselineMemberRef.current);
    setMember(snapshot);
    initializeFormsFromMember(snapshot);
    setHasUnsavedChanges(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!member) return;
    if (!canSubmit) {
      toast.push("You do not have permission to update this member.");
      return;
    }
    let normalizedContribution: number | null = null;
    if (!disableFinance) {
      const amountValue = Number(member.contribution_amount ?? 0);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        toast.push("Contribution amount must be greater than zero");
        setUpdating(false);
        return;
      }
      normalizedContribution = Math.round(amountValue * 100) / 100;
      if (!member.contribution_exception_reason && Math.abs(normalizedContribution - 75) > 0.01) {
        toast.push("Standard membership contribution is 75 CAD unless an exception is selected.");
        setUpdating(false);
        return;
      }
    }

    setUpdating(true);
    try {
      const trimOrNull = (value?: string | null) => {
        const trimmed = value?.trim();
        return trimmed && trimmed.length > 0 ? trimmed : null;
      };

      if (!member.phone || !member.phone.trim()) {
        toast.push("Phone number is required");
        setUpdating(false);
        return;
      }

      if (!disableCore && (!member.address_postal_code || !member.address_postal_code.trim())) {
        toast.push("Postal code is required");
        setUpdating(false);
        return;
      }

      if (!disableSpiritual && member.has_father_confessor && !fatherConfessorId) {
        toast.push("Select a father confessor or disable the flag");
        setUpdating(false);
        return;
      }

      if (member.birth_date) {
        const birth = new Date(member.birth_date);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const hasHadBirthday =
          today.getMonth() > birth.getMonth() ||
          (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
        if (!hasHadBirthday) {
          age -= 1;
        }
        if (age < 18) {
          toast.push("Members must be 18 years or older. Please add them as a child of an existing member.");
          setUpdating(false);
          return;
        }
      }

      if (!disableCore) {
        for (const child of childrenForm) {
          if (child.birth_date) {
            const birth = new Date(child.birth_date);
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const hasHadBirthday =
              today.getMonth() > birth.getMonth() ||
              (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
            if (!hasHadBirthday) {
              age -= 1;
            }
            if (age >= 18) {
              toast.push(`Child ${child.first_name} is over 18. Please register them as an independent member.`);
              setUpdating(false);
              return;
            }
          }
        }
      }

      if (!disableCore && member.marital_status === "Married") {
        if (!spouseForm || !spouseForm.first_name.trim() || !spouseForm.last_name.trim()) {
          toast.push("Enter spouse first and last name for married members");
          setUpdating(false);
          return;
        }
      }

      const payload: Record<string, unknown> = {};

      if (!disableCore) {
        payload.first_name = member.first_name.trim();
        payload.middle_name = trimOrNull(member.middle_name);
        payload.last_name = member.last_name.trim();
        payload.baptismal_name = trimOrNull(member.baptismal_name);
        payload.email = trimOrNull(member.email);
        payload.phone = member.phone.trim();
        payload.gender = trimOrNull(member.gender);
        payload.marital_status = trimOrNull(member.marital_status);
        payload.birth_date = member.birth_date || null;
        payload.join_date = member.join_date || null;
        payload.address = trimOrNull(member.address);
        payload.address_street = trimOrNull(member.address_street);
        payload.address_city = trimOrNull(member.address_city);
        payload.address_region = trimOrNull(member.address_region);
        payload.address_postal_code = trimOrNull(member.address_postal_code);
        payload.address_country = trimOrNull(member.address_country);
        payload.district = trimOrNull(member.district);
        payload.notes = trimOrNull(member.notes);
        payload.household_size_override = member.household_size_override ?? null;
        payload.tag_ids = member.tags.map((tag) => tag.id);
        payload.ministry_ids = member.ministries.map((ministry) => ministry.id);
        payload.status = member.status;
      }

      if (!disableFinance) {
        payload.is_tither = member.is_tither;
        payload.pays_contribution = member.pays_contribution;
        payload.contribution_method = trimOrNull(member.contribution_method);
        payload.contribution_amount = normalizedContribution;
        payload.contribution_exception_reason = member.contribution_exception_reason || null;
      }

      if (!disableSpiritual) {
        payload.has_father_confessor = member.has_father_confessor;
      }
      payload.status_override = member.status_override ?? false;
      payload.status_override_value = member.status_override ? member.status_override_value ?? member.status : null;
      payload.status_override_reason = member.status_override ? trimOrNull(member.status_override_reason) : null;

      if (selectedHousehold === "new") {
        const trimmed = newHouseholdName.trim();
        if (!trimmed) {
          toast.push("Enter a household name or choose an existing household.");
          setUpdating(false);
          return;
        }
        payload.household_name = trimmed;
      } else if (selectedHousehold === "") {
        payload.household_id = 0;
      } else {
        payload.household_id = Number(selectedHousehold);
      }

      if (!disableSpiritual && member.has_father_confessor) {
        payload.father_confessor_id = Number(fatherConfessorId);
      } else if (!disableSpiritual && fatherConfessorId) {
        payload.father_confessor_id = 0;
      }

      if (!disableCore && member.marital_status === "Married") {
        const data = spouseForm!;
        payload.spouse = {
          first_name: data.first_name.trim(),
          last_name: data.last_name.trim(),
          gender: data.gender || null,
          country_of_birth: trimOrNull(data.country_of_birth),
          phone: trimOrNull(data.phone),
          email: trimOrNull(data.email),
        };
      } else {
        payload.spouse = null;
      }

      if (!disableCore) {
        payload.children = childrenForm
          .map((child) => ({
            first_name: child.first_name.trim(),
            last_name: child.last_name.trim(),
            gender: child.gender || null,
            birth_date: child.birth_date || null,
            country_of_birth: trimOrNull(child.country_of_birth),
            notes: trimOrNull(child.notes),
          }))
          .filter((child) => child.first_name && child.last_name);
      }

      if (isCreateMode) {
        payload.send_welcome_email = sendWelcomeEmail;
      }

      const endpoint = isCreateMode ? "/members" : `/members/${member.id}`;
      const method = isCreateMode ? "POST" : "PATCH";
      const updated = await api<MemberDetail>(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      const normalized = cloneMemberDetail(updated);
      setMember(normalized);
      initializeFormsFromMember(normalized);
      baselineMemberRef.current = cloneMemberDetail(updated);
      setHasUnsavedChanges(false);
      await refreshAudit(normalized.id);
      toast.push(isCreateMode ? "Member created" : "Changes saved");
      if (isCreateMode) {
        navigate(`/members/${normalized.id}/edit`, { replace: true });
      }
    } catch (error) {
      console.error(error);
      toast.push("Failed to update member");
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!member || !member.id || !canDelete) return;
    openConfirm({
      title: "Archive member?",
      message: "Archiving will hide this member from active lists. You can restore later if needed.",
      confirmLabel: "Yes, archive",
      danger: true,
      onConfirm: async () => {
        setDeleting(true);
        try {
          await api(`/members/${member.id}`, { method: "DELETE" });
          toast.push("Member archived");
          navigate("/members");
        } catch (error) {
          console.error(error);
          toast.push("Failed to archive member");
        } finally {
          setDeleting(false);
          closeConfirm();
        }
      },
      onCancel: closeConfirm,
    });
  };

  const buildAvatarUrl = (path?: string | null) => {
    if (!path) return null;
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    if (path.startsWith("/")) {
      return `${API_BASE}${path}`;
    }
    return `${API_BASE}/static/${path}`;
  };

  const handleAvatarSave = async (blob: Blob) => {
    if (!member || !canUploadAvatar) return;

    setAvatarUploading(true);
    try {
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      const response = await uploadAvatar(member.id, file);
      const relative = response.avatar_url.startsWith("/static/")
        ? response.avatar_url.replace("/static/", "")
        : response.avatar_url;
      setMember((prev) => (prev ? { ...prev, avatar_path: relative } : prev));
      toast.push("Avatar updated");
      refreshAudit(member.id);
    } catch (error) {
      console.error(error);
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes("too large") || message.includes("file size")) {
          toast.push("Image file is too large. Please use an image under 5MB.");
        } else if (message.includes("format") || message.includes("type")) {
          toast.push("Invalid image format. Please use JPG, PNG, or WebP.");
        } else {
          toast.push("Failed to upload avatar. Please try again.");
        }
      } else {
        toast.push("Failed to upload avatar");
      }
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    if (!member || !canUploadAvatar) return;

    if (!window.confirm("Are you sure you want to remove your avatar?")) {
      return;
    }

    setAvatarRemoving(true);
    try {
      await deleteAvatar(member.id);
      setMember((prev) => (prev ? { ...prev, avatar_path: null } : prev));
      toast.push("Avatar removed");
      refreshAudit(member.id);
    } catch (error) {
      console.error(error);
      toast.push("Failed to remove avatar");
    } finally {
      setAvatarRemoving(false);
    }
  };

  const handleExceptionAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!member || !member.id) {
      event.target.value = "";
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      event.target.value = "";
      return;
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.push("Upload a PDF document only.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.push("PDF is too large. Please keep it under 5MB.");
      event.target.value = "";
      return;
    }

    setExceptionAttachmentUploading(true);
    try {
      const response = await uploadContributionExceptionAttachment(member.id, file);
      const relative = response.attachment_url.startsWith("/static/")
        ? response.attachment_url.replace("/static/", "")
        : response.attachment_url;
      setMember((prev) => (prev ? { ...prev, contribution_exception_attachment_path: relative } : prev));
      toast.push("Low-income document uploaded");
      refreshAudit(member.id);
    } catch (error) {
      console.error(error);
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes("low income")) {
          toast.push("Select Low income exception before uploading a PDF.");
        } else if (message.includes("too large") || message.includes("size")) {
          toast.push("PDF is too large. Please keep it under 5MB.");
        } else if (message.includes("pdf") || message.includes("type")) {
          toast.push("Upload a valid PDF document.");
        } else {
          toast.push("Failed to upload the low-income document.");
        }
      } else {
        toast.push("Failed to upload the low-income document.");
      }
    } finally {
      setExceptionAttachmentUploading(false);
      event.target.value = "";
    }
  };

  const handleExceptionAttachmentRemove = async () => {
    if (!member || !member.id || !member.contribution_exception_attachment_path) {
      return;
    }
    if (!window.confirm("Remove the uploaded low-income document?")) {
      return;
    }

    setExceptionAttachmentRemoving(true);
    try {
      await deleteContributionExceptionAttachment(member.id);
      setMember((prev) => (prev ? { ...prev, contribution_exception_attachment_path: null } : prev));
      toast.push("Low-income document removed");
      refreshAudit(member.id);
    } catch (error) {
      console.error(error);
      toast.push("Failed to remove the low-income document.");
    } finally {
      setExceptionAttachmentRemoving(false);
    }
  };

  const avatarUrl = member ? buildAvatarUrl(member.avatar_path) : null;
  const exceptionAttachmentUrl = member ? buildAvatarUrl(member.contribution_exception_attachment_path) : null;

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  };

  if (!member) {
    return <div className="text-sm text-mute">Loading member…</div>;
  }

  const membershipHealth = member.membership_health;
  const membershipEvents = member.membership_events ?? [];
  const overrideDisabled = disableAll || !canOverrideStatus;
  const effectiveStatus = membershipHealth?.effective_status ?? member.status;
  const displayName = `${member.first_name} ${member.last_name}`.trim() || "New member";
  const initials = `${(member.first_name?.[0] ?? "").toUpperCase()}${(member.last_name?.[0] ?? "").toUpperCase()}`;
  const statusChipClass = statusChipStyles[effectiveStatus] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  const headerSubtitle = isCreateMode
    ? "New member · Username will be generated when saved"
    : `Username: ${member.username} · Member ID: ${member.id}`;
  const pendingRequirement =
    membershipHealth &&
    membershipHealth.auto_status === "Pending" &&
    membershipHealth.required_consecutive_months > 1
      ? `Pending · ${membershipHealth.consecutive_months}/${membershipHealth.required_consecutive_months} consecutive months`
      : null;
  const statusDescription = membershipHealth
    ? membershipHealth.override_active
      ? `Manual override · Auto status ${membershipHealth.auto_status}`
      : pendingRequirement
        ? pendingRequirement
        : membershipHealth.days_until_due !== null && membershipHealth.days_until_due !== undefined
          ? membershipHealth.days_until_due >= 0
            ? `Next due in ${membershipHealth.days_until_due} days`
            : `Overdue by ${Math.abs(membershipHealth.days_until_due)} days`
          : "Automatic status"
    : "";
  const nextContributionLabel = membershipHealth?.next_due_at ? formatDate(membershipHealth.next_due_at) : "—";
  const lastContributionLabel = membershipHealth?.last_paid_at ? formatDate(membershipHealth.last_paid_at) : "—";
  const membershipSince = formatDate(member.join_date);
  const addressSummary =
    [
      member.address,
      member.address_street,
      member.address_city,
      member.address_region,
      member.address_postal_code,
      member.address_country,
    ]
      .filter(Boolean)
      .join(", ") || "—";
  const sundayParticipants = member.sunday_school_participants ?? [];
  const sundayPayments = member.sunday_school_payments ?? [];
  const sundayContributors = sundayParticipants.filter((participant) => participant.pays_contribution).length;
  const contributionHistory = member.contribution_history ?? [];
  const lastContributionDateLabel = contributionHistory.length ? formatDate(contributionHistory[0].paid_at) : "No payments yet";
  const lastSundayPaymentLabel = sundayPayments.length ? formatDate(sundayPayments[0].posted_at) : "No payments yet";
  const unsavedLabel = hasUnsavedChanges ? "Unsaved changes" : "All changes saved";
  const canSendWelcome = Boolean(member.email && member.email.trim());
  const showLowIncomeAttachment = member.contribution_exception_reason === "LowIncome";
  const hasExceptionAttachmentRole =
    permissions.hasRole("Admin") ||
    permissions.hasRole("FinanceAdmin") ||
    permissions.hasRole("Registrar") ||
    permissions.hasRole("PublicRelations");
  const canManageExceptionAttachment = hasExceptionAttachmentRole;
  const canUploadExceptionAttachmentNow = canManageExceptionAttachment && !isCreateMode && Boolean(member.id);
  const exceptionAttachmentName =
    member.contribution_exception_attachment_path?.split("/").pop() || null;

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-full px-3">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-lg font-semibold tracking-tight">{displayName}</h1>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusChipClass}`}>
                  {effectiveStatus}
                </span>
              </div>
              <p className="text-xs text-mute">{headerSubtitle}</p>
              {statusDescription && (
                <p
                  className={`text-xs ${membershipHealth?.override_active ? "text-amber-600" : "text-mute"}`}
                >
                  {statusDescription}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canDelete && (
              <Button variant="ghost" onClick={handleDelete} disabled={deleting} className="rounded-full">
                <Trash2 className="mr-1 h-4 w-4" />
                Archive
              </Button>
            )}
            <Button
              data-tour="member-save"
              type="submit"
              form="member-form"
              disabled={updating || !canSubmit}
              className="rounded-full px-5"
            >
              {updating ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-4 space-y-6">
          {memberLoadError && (
            <Card className="border border-rose-200 bg-rose-50 text-rose-900">
              <div className="flex items-start gap-3">
                <div className="text-sm">
                  <div className="font-semibold">Unable to load member</div>
                  <div className="text-sm leading-relaxed">{memberLoadError}</div>
                </div>
                <div className="ml-auto flex gap-2">
                  <Button variant="ghost" onClick={fetchMember} disabled={memberLoading}>
                    Retry
                  </Button>
                  <Button variant="ghost" onClick={() => navigate("/members")}>
                    Back to list
                  </Button>
                </div>
              </div>
            </Card>
          )}
          {memberLoading && !member && (
            <Card className="p-4 text-sm text-mute">Loading member details…</Card>
          )}
          {disableAll && (
            <div className="border border-amber-200 bg-amber-50 text-amber-900 rounded-lg p-4 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Read-only access</div>
                <p className="text-sm leading-relaxed">
                  You can review this member&apos;s record, but updates are limited to Registrar or PR Admin roles.
                </p>
              </div>
            </div>
          )}

          <nav className="border border-border bg-card rounded-full px-2 py-1 overflow-x-auto" data-tour="member-section-nav">
            <div className="flex gap-1">
              {SECTION_NAV_ITEMS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${activeSection === section.id ? "bg-primary text-primary-foreground" : "text-mute hover:bg-accent/10"
                    }`}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
            <div className="space-y-6">
              <form id="member-form" className="space-y-6" onSubmit={handleSubmit}>
                <SectionCard
                  id="identity"
                  ref={setSectionRef("identity")}
                  title="Identity"
                  subtitle="Core profile details and membership status"
                  collapsed={collapsedSections.identity}
                  onToggle={() => toggleSectionCollapse("identity")}
                >
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs uppercase text-mute">First name</label>
                      <Input value={member.first_name} onChange={handleChange("first_name")} required disabled={disableCore} />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Last name</label>
                      <Input value={member.last_name} onChange={handleChange("last_name")} required disabled={disableCore} />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Middle name</label>
                      <Input value={member.middle_name ?? ""} onChange={handleChange("middle_name")} disabled={disableCore} />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Baptismal name</label>
                      <Input value={member.baptismal_name ?? ""} onChange={handleChange("baptismal_name")} disabled={disableCore} />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs uppercase text-mute">Username</label>
                      <Input value={member.username} disabled readOnly />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Gender</label>
                      <Select
                        value={member.gender ?? ""}
                        onChange={(event) => {
                          if (disableCore) return;
                          setMember((prev) => (prev ? { ...prev, gender: event.target.value || null } : prev));
                          markDirty();
                        }}
                        disabled={disableCore}
                      >
                        <option value="">Not set</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Marital status</label>
                      <Select
                        value={member.marital_status ?? ""}
                        onChange={(event) => {
                          if (disableCore) return;
                          setMember((prev) => (prev ? { ...prev, marital_status: event.target.value || null } : prev));
                          markDirty();
                        }}
                        disabled={disableCore}
                      >
                        <option value="">Not set</option>
                        {(meta?.marital_statuses ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs uppercase text-mute">Date of birth</label>
                      <Input
                        type="date"
                        value={member.birth_date ?? ""}
                        onChange={(event) => {
                          if (disableCore) return;
                          setMember((prev) => (prev ? { ...prev, birth_date: event.target.value || null } : prev));
                          markDirty();
                        }}
                        disabled={disableCore}
                      />
                      <p className="text-xs text-mute mt-1">{memberAge !== null ? `${memberAge} years old` : "Age calculated automatically"}</p>
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Membership date</label>
                      <Input
                        type="date"
                        value={member.join_date ?? ""}
                        onChange={(event) => {
                          if (disableCore) return;
                          setMember((prev) => (prev ? { ...prev, join_date: event.target.value || null } : prev));
                          markDirty();
                        }}
                        disabled={disableCore}
                      />
                    </div>
                  </div>
                </SectionCard>
                <SectionCard
                  id="membership"
                  ref={setSectionRef("membership")}
                  title="Membership health"
                  subtitle="Status follows monthly contribution payments"
                  collapsed={collapsedSections.membership}
                  onToggle={() => toggleSectionCollapse("membership")}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase text-mute">Effective status</div>
                      <div className="text-base font-semibold text-ink">{effectiveStatus}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-mute">Auto status</div>
                      <div className="text-sm text-ink">{membershipHealth?.auto_status ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-mute">Last payment</div>
                      <div>{lastContributionLabel}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-mute">Next due</div>
                      <div>{nextContributionLabel}</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card/50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase text-mute">Next payment</div>
                      <div className="text-base font-semibold text-ink">{nextContributionLabel}</div>
                    </div>
                    <div
                      className={`text-sm font-semibold ${membershipHealth?.days_until_due !== undefined && membershipHealth?.days_until_due !== null
                        ? membershipHealth.days_until_due >= 0
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-rose-700 dark:text-rose-400"
                        : "text-mute"
                        }`}
                    >
                      {membershipHealth?.days_until_due !== undefined && membershipHealth?.days_until_due !== null
                        ? membershipHealth.days_until_due >= 0
                          ? `${membershipHealth.days_until_due} days remaining`
                          : `${Math.abs(membershipHealth.days_until_due)} days overdue`
                        : "No schedule"}
                    </div>
                  </div>
                  {membershipHealth?.override_active && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Manual override active
                      {member.status_override_reason ? ` — ${member.status_override_reason}` : ""}
                    </div>
                  )}
                  {membershipHealth?.auto_status === "Pending" &&
                    (membershipHealth?.required_consecutive_months ?? 0) > 1 && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {membershipHealth.consecutive_months} of {membershipHealth.required_consecutive_months} consecutive months paid. Record payments to activate status automatically.
                      </div>
                    )}
                  {membershipHealth?.overdue_days && membershipHealth.overdue_days > 0 && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                      Contribution overdue by {membershipHealth.overdue_days} days. Record a payment to reactivate status.
                    </div>
                  )}
                  {canOverrideStatus && (
                    <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs uppercase text-mute">Manual override</label>
                        <label className="flex items-center gap-2 text-xs text-mute">
                          <input
                            type="checkbox"
                            className="accent-accent"
                            checked={member.status_override ?? false}
                            onChange={(event) => handleOverrideToggle(event.target.checked)}
                            disabled={overrideDisabled}
                          />
                          Keep status fixed regardless of payments
                        </label>
                      </div>
                      {member.status_override && (
                        <>
                          <Select
                            value={member.status_override_value ?? effectiveStatus}
                            onChange={(event) => handleOverrideStatusChange(event.target.value as MemberStatus)}
                            disabled={overrideDisabled}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                          <Input
                            value={member.status_override_reason ?? ""}
                            onChange={(event) => handleOverrideReasonChange(event.target.value)}
                            placeholder="Reason (optional)"
                            disabled={overrideDisabled}
                          />
                        </>
                      )}
                      <p className="text-[11px] text-mute">
                        Overrides should be used sparingly. Status will return to automatic once overrides are disabled.
                      </p>
                    </div>
                  )}
                </SectionCard>
                <SectionCard
                  id="sundaySchool"
                  ref={setSectionRef("sundaySchool")}
                  title="Sunday school"
                  subtitle="Linked participants and contribution health"
                  collapsed={collapsedSections.sundaySchool}
                  onToggle={() => toggleSectionCollapse("sundaySchool")}
                  actions={
                    permissions.manageSchools ? (
                      <Button
                        type="button"
                        variant="soft"
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                        onClick={() => navigate("/schools/sunday-school")}
                      >
                        Add participant
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-4 text-sm">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-mute">Linked</p>
                      <p className="text-lg font-semibold text-ink">{sundayParticipants.length}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Up to date</p>
                      <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">{sundayStatusSummary.upToDate}</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-400">Pending</p>
                      <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">{sundayStatusSummary.pending}</p>
                    </div>
                    <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 p-3 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-rose-700 dark:text-rose-400">Overdue</p>
                      <p className="text-lg font-semibold text-rose-700 dark:text-rose-400">{sundayStatusSummary.overdue}</p>
                    </div>
                  </div>
                  {!sundayParticipants.length ? (
                    <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-sm text-mute">
                      No Sunday School participants linked yet. Use the Sunday School workspace to enroll a child, youth, or adult.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sundayParticipants.map((participant) => (
                        <div key={participant.id} className="rounded-xl border border-border bg-card/70 p-4 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-ink">
                                {participant.first_name} {participant.last_name}
                              </div>
                              <p className="text-xs text-mute">
                                {participant.category} · Username {participant.member_username}
                              </p>
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SUNDAY_STATUS_STYLES[participant.status]
                                }`}
                            >
                              {participant.status}
                            </span>
                          </div>
                          <dl className="grid gap-3 text-sm sm:grid-cols-3">
                            <div>
                              <dt className="text-xs uppercase text-mute">Monthly amount</dt>
                              <dd className="font-medium">
                                {participant.monthly_amount !== null && participant.monthly_amount !== undefined
                                  ? `${member.contribution_currency} ${participant.monthly_amount.toFixed(2)}`
                                  : "—"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs uppercase text-mute">Preferred method</dt>
                              <dd className="font-medium">{participant.payment_method || "—"}</dd>
                            </div>
                            <div>
                              <dt className="text-xs uppercase text-mute">Last payment</dt>
                              <dd className="font-medium">{formatDate(participant.last_payment_at)}</dd>
                            </div>
                          </dl>
                          <p className="text-xs text-mute">
                            {participant.pays_contribution
                              ? "Contribution enabled for this participant."
                              : "Marked as not contributing to Sunday School fees."}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {permissions.viewPayments && sundayPayments.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-mute">Recent payments</h4>
                      <div className="space-y-2">
                        {sundayPayments.slice(0, 3).map((payment) => (
                          <div
                            key={payment.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/50 px-3 py-2 text-sm"
                          >
                            <div>
                              <div className="font-medium text-ink">{payment.service_type_label}</div>
                              <div className="text-xs text-mute">{new Date(payment.posted_at).toLocaleDateString()}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">
                                {payment.currency}{" "}
                                {payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div className="text-xs text-mute">{payment.method || "—"}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {permissions.viewSchools && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-full px-4"
                      onClick={() => navigate(`/schools/sunday-school?member=${member.id}`)}
                    >
                      Open Sunday School workspace
                    </Button>
                  )}
                </SectionCard>

                <SectionCard
                  id="contact"
                  ref={setSectionRef("contact")}
                  title="Contact & address"
                  subtitle="Primary communication info plus duplicate detection"
                  data-tour="member-contact"
                  collapsed={collapsedSections.contact}
                  onToggle={() => toggleSectionCollapse("contact")}
                >
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs uppercase text-mute">Email</label>
                      <Input value={member.email ?? ""} onChange={handleChange("email")} type="email" disabled={disableCore} />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Phone</label>
                      <div className="flex gap-2">
                        <span className="inline-flex items-center rounded-xl border border-border bg-card/50 px-3 text-sm font-semibold text-ink">
                          {CANADA_FLAG} {CANADIAN_COUNTRY_CODE}
                        </span>
                        <Input
                          value={phoneDisplay}
                          onChange={(event) => handlePhoneInputChange(event.target.value)}
                          required
                          disabled={disableCore}
                          placeholder="(613) 555-0199"
                        />
                      </div>
                      {phoneAutoAdjusted && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                          Auto-adjusted to Canadian format. Accept?
                          <button
                            type="button"
                            className="font-semibold underline hover:text-amber-900"
                            onClick={acceptAutoAdjustedPhone}
                          >
                            Accept
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">District</label>
                      <Input value={member.district ?? ""} onChange={handleChange("district")} disabled={disableCore} />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Address (line)</label>
                      <Input value={member.address ?? ""} onChange={handleChange("address")} disabled={disableCore} />
                    </div>
                  </div>
                  {isCreateMode && (
                    <div className="rounded-xl border border-border bg-card/50 px-4 py-3">
                      <label className="flex items-start gap-3 text-sm text-ink">
                        <input
                          type="checkbox"
                          className="mt-1 accent-accent"
                          checked={sendWelcomeEmail}
                          onChange={(event) => {
                            setSendWelcomeEmail(event.target.checked);
                            markDirty();
                          }}
                          disabled={disableCore}
                        />
                        <span className="leading-relaxed">
                          <span className="font-medium">Send welcome email</span>
                          <span className="block text-xs text-mute">Send a friendly welcome message to the member after saving.</span>
                        </span>
                      </label>
                      {!canSendWelcome && (
                        <p className="mt-2 text-xs text-mute">Add an email address to send the welcome email.</p>
                      )}
                    </div>
                  )}
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs uppercase text-mute">Street</label>
                      <Input value={member.address_street ?? ""} onChange={handleChange("address_street")} disabled={disableCore} />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">City</label>
                      <Input value={member.address_city ?? ""} onChange={handleChange("address_city")} disabled={disableCore} />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Region / State</label>
                      <Input value={member.address_region ?? ""} onChange={handleChange("address_region")} disabled={disableCore} />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs uppercase text-mute">Postal code</label>
                      <Input
                        value={member.address_postal_code ?? ""}
                        onChange={handlePostalCodeChange}
                        disabled={disableCore}
                        placeholder="A1A 1A1"
                        maxLength={7}
                        required={!disableCore}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Country</label>
                      <Input value={member.address_country ?? ""} onChange={handleChange("address_country")} disabled={disableCore} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase text-mute">Potential duplicates</label>
                    {!permissions.viewMembers ? (
                      <Card className="p-3 text-sm text-mute">Duplicate checks require member directory access.</Card>
                    ) : duplicateLoading ? (
                      <Card className="p-3 text-sm text-mute">Checking for duplicates…</Card>
                    ) : duplicateMatches.length === 0 ? (
                      <Card className="p-3 text-sm text-mute">No duplicates detected with the current contact info.</Card>
                    ) : (
                      <Card className="p-3 space-y-3 border border-amber-200 bg-amber-50/80">
                        {duplicateMatches.map((match) => (
                          <div key={match.id} className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-medium">
                                {match.first_name} {match.last_name}
                              </div>
                              <div className="text-xs text-mute">
                                {match.email || "No email"} • {match.phone || "No phone"}
                              </div>
                              <div className="text-xs text-amber-800">Match on {match.reason}</div>
                            </div>
                            <Link to={`/members/${match.id}/edit`} className="text-sm text-accent underline">
                              Open
                            </Link>
                          </div>
                        ))}
                      </Card>
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  id="household"
                  ref={setSectionRef("household")}
                  title="Household & faith"
                  subtitle="Household membership and father confessor context"
                  data-tour="member-household"
                  collapsed={collapsedSections.household}
                  onToggle={() => toggleSectionCollapse("household")}
                >
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs uppercase text-mute">Household</label>
                      <div className="flex flex-col gap-2 md:flex-row md:items-center">
                        <Select value={selectedHousehold} onChange={handleHouseholdSelect} className="md:w-64" disabled={disableCore}>
                          <option value="">No household</option>
                          {meta?.households.map((household) => (
                            <option key={household.id} value={String(household.id)}>
                              {household.name}
                            </option>
                          ))}
                          <option value="new">Add new household…</option>
                        </Select>
                        {selectedHousehold === "new" && (
                          <Input
                            className="md:flex-1"
                            value={newHouseholdName}
                            onChange={(event) => {
                              if (disableCore) return;
                              setNewHouseholdName(event.target.value);
                              markDirty();
                            }}
                            placeholder="Household name"
                            disabled={disableCore}
                          />
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Household size override</label>
                      <Input
                        type="number"
                        min={1}
                        value={member.household_size_override ?? ""}
                        onChange={(event) => {
                          if (disableCore) return;
                          const value = event.target.value;
                          const parsed = Number(value);
                          setMember((prev) =>
                            prev
                              ? {
                                ...prev,
                                household_size_override:
                                  value === "" || Number.isNaN(parsed) ? null : parsed,
                              }
                              : prev
                          );
                          markDirty();
                        }}
                        disabled={disableCore}
                      />
                      <p className="text-xs text-mute mt-1">Current family count: {member.family_count}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase text-mute">Father confessor</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={member.has_father_confessor}
                        onChange={(event) => {
                          if (disableSpiritual) {
                            return;
                          }
                          const checked = event.target.checked;
                          setMember((prev) => (prev ? { ...prev, has_father_confessor: checked } : prev));
                          if (!checked) {
                            setFatherConfessorId("");
                          }
                          markDirty();
                        }}
                        disabled={disableSpiritual}
                      />
                      <span className="text-sm">Member has a father confessor</span>
                    </div>
                    {member.has_father_confessor && (
                      <Select
                        className="md:w-72"
                        value={fatherConfessorId}
                        onChange={(event) => {
                          setFatherConfessorId(event.target.value);
                          markDirty();
                        }}
                        required
                        disabled={disableSpiritual}
                      >
                        <option value="">Select father confessor…</option>
                        {(meta?.father_confessors ?? []).map((confessor) => (
                          <option key={confessor.id} value={String(confessor.id)}>
                            {confessor.full_name}
                          </option>
                        ))}
                      </Select>
                    )}
                    {disableSpiritual && (
                      <p className="text-xs text-mute">Registrar or PR Admin must manage Father Confessor assignments.</p>
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  id="giving"
                  ref={setSectionRef("giving")}
                  title="Giving & contributions"
                  subtitle="Finance admins keep contribution data in sync here"
                  data-tour="member-giving"
                  collapsed={collapsedSections.giving}
                  onToggle={() => toggleSectionCollapse("giving")}
                >
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={member.is_tither}
                        onChange={toggleBoolean("is_tither")}
                        disabled={disableFinance}
                      />
                      Tither
                    </label>
                    <label
                      className={`flex items-center gap-2 text-sm transition ${payWarningPulse ? "animate-pulse ring-2 ring-amber-400 rounded-lg px-2 -mx-2" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={member.pays_contribution}
                        onChange={toggleBoolean("pays_contribution")}
                        disabled={disableFinance}
                      />
                      Pays membership contribution (required)
                    </label>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs uppercase text-mute">Contribution method</label>
                      <Select
                        value={member.contribution_method ?? ""}
                        onChange={(event) => {
                          if (disableFinance) return;
                          setMember((prev) => (prev ? { ...prev, contribution_method: event.target.value || null } : prev));
                          markDirty();
                        }}
                        disabled={disableFinance}
                      >
                        <option value="">Not set</option>
                        {(meta?.payment_methods ?? []).map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Contribution amount</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={member.contribution_amount ?? ""}
                        onChange={(event) => {
                          if (disableFinance) return;
                          const value = event.target.value;
                          const parsed = Number(value);
                          setMember((prev) =>
                            prev
                              ? {
                                ...prev,
                                contribution_amount:
                                  value === "" || Number.isNaN(parsed) ? null : parsed,
                              }
                              : prev
                          );
                          markDirty();
                        }}
                        disabled={disableFinance || !member.contribution_exception_reason}
                      />
                      {!member.contribution_exception_reason ? (
                        <p className="text-xs text-mute mt-1">Amount fixed at 75.00 CAD unless an exception is selected.</p>
                      ) : (
                        <p className="text-xs text-mute mt-1">Adjust the collected contribution for this member.</p>
                      )}
                    </div>
                  </div>
                  <div className="md:w-72">
                    <label className="text-xs uppercase text-mute">Contribution exception</label>
                    <Select
                      value={member.contribution_exception_reason ?? ""}
                      onChange={(event) => handleContributionExceptionChange(event.target.value)}
                      disabled={disableFinance}
                    >
                      <option value="">No exception (75 CAD)</option>
                      {exceptionReasons.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason === "LowIncome" ? "Low income" : reason}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {showLowIncomeAttachment && (
                    <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-900/10 p-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-lg bg-white/80 dark:bg-slate-900/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-ink">Low-income PDF (optional)</p>
                            <p className="text-xs text-mute">Attach one supporting document for this exception.</p>
                          </div>
                        </div>
                        {exceptionAttachmentUrl && (
                          <a
                            href={exceptionAttachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                          >
                            View PDF
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>

                      <input
                        ref={exceptionAttachmentInputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={handleExceptionAttachmentChange}
                        disabled={!canUploadExceptionAttachmentNow || exceptionAttachmentUploading || exceptionAttachmentRemoving}
                      />

                      <div className="rounded-lg border border-dashed border-emerald-300/80 dark:border-emerald-900/70 bg-white/70 dark:bg-slate-900/30 px-3 py-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-wide text-mute">Attachment</div>
                          <div className="flex items-center gap-2 text-sm text-ink min-w-0">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-mute" />
                            <span className="truncate">{exceptionAttachmentName ?? "No PDF uploaded yet"}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="soft"
                            className="rounded-full"
                            onClick={() => {
                              if (!canManageExceptionAttachment) return;
                              if (!canUploadExceptionAttachmentNow) {
                                toast.push("Save the member first, then upload the optional low-income PDF.");
                                return;
                              }
                              exceptionAttachmentInputRef.current?.click();
                            }}
                            disabled={!canManageExceptionAttachment || exceptionAttachmentUploading || exceptionAttachmentRemoving}
                          >
                            {exceptionAttachmentUploading
                              ? "Uploading…"
                              : exceptionAttachmentUrl
                                ? "Replace PDF"
                                : "Upload PDF"}
                          </Button>
                          {exceptionAttachmentUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              className="rounded-full text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={handleExceptionAttachmentRemove}
                              disabled={!canUploadExceptionAttachmentNow || exceptionAttachmentUploading || exceptionAttachmentRemoving}
                            >
                              {exceptionAttachmentRemoving ? "Removing…" : "Remove"}
                            </Button>
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-mute">PDF only, up to 5MB.</p>
                      {!canManageExceptionAttachment ? (
                        <p className="text-[11px] text-mute">
                          Admin, Finance Admin, Registrar, or Public Relations roles are required to upload this attachment.
                        </p>
                      ) : !canUploadExceptionAttachmentNow ? (
                        <p className="text-[11px] text-mute">Save the member first, then upload the optional low-income PDF.</p>
                      ) : null}
                    </div>
                  )}
                  {disableFinance && (
                    <p className="text-xs text-mute">
                      Finance Admin permissions are required to adjust giving details.
                    </p>
                  )}
                </SectionCard>

                <SectionCard
                  id="payments"
                  ref={setSectionRef("payments")}
                  title="Financial activity"
                  subtitle="Ledger history and quick entry"
                  data-tour="member-payments"
                  collapsed={collapsedSections.payments}
                  onToggle={() => toggleSectionCollapse("payments")}
                  actions={
                    permissions.viewPayments && member?.id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        data-tour="payment-timeline"
                        onClick={() => navigate(`/payments/members/${member.id}`)}
                      >
                        View payment timeline
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border bg-card/50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase text-slate-500">Next contribution due</div>
                        <div className="text-base font-semibold text-ink">{nextContributionLabel}</div>
                      </div>
                      <div
                        className={`text-sm font-semibold ${membershipHealth?.days_until_due !== undefined && membershipHealth?.days_until_due !== null
                          ? membershipHealth.days_until_due >= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-rose-700 dark:text-rose-400"
                          : "text-mute"
                          }`}
                      >
                        {membershipHealth?.days_until_due !== undefined && membershipHealth?.days_until_due !== null
                          ? membershipHealth.days_until_due >= 0
                            ? `${membershipHealth.days_until_due} days`
                            : `${Math.abs(membershipHealth.days_until_due)} days overdue`
                          : "No schedule"}
                      </div>
                    </div>
                    {membershipEvents.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-mute">Status activity</h4>
                        <div className="space-y-2">
                          {membershipEvents.slice(0, 5).map((event) => (
                            <div key={`${event.type}-${event.timestamp}`} className="rounded-xl border border-border px-3 py-2">
                              <div className="flex items-center justify-between text-[11px] uppercase text-mute">
                                <span>{formatDate(event.timestamp)}</span>
                                <span>{event.type}</span>
                              </div>
                              <div className="text-sm font-semibold text-ink">{event.label}</div>
                              {event.description && (
                                <div className="text-xs text-mute">{event.description}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {!permissions.viewPayments ? (
                    <p className="text-sm text-mute">Finance Admin permissions are required to view ledger payments.</p>
                  ) : paymentsLoading ? (
                    <p className="text-sm text-mute">Loading payment history…</p>
                  ) : memberPayments.length === 0 ? (
                    <p className="text-sm text-mute">No payments recorded in the ledger yet.</p>
                  ) : (
                    <div className="overflow-x-auto border border-border rounded-lg">
                      <table className="min-w-full text-sm">
                        <thead className="bg-card/80 text-xs uppercase tracking-wide text-mute">
                          <tr>
                            <th className="px-4 py-2 text-left">Date</th>
                            <th className="px-4 py-2 text-left">Service</th>
                            <th className="px-4 py-2 text-left">Amount</th>
                            <th className="px-4 py-2 text-left">Method</th>
                            <th className="px-4 py-2 text-left">Status</th>
                            <th className="px-4 py-2 text-left">Memo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {memberPayments.map((payment) => (
                            <tr key={payment.id} className="border-t border-border/60">
                              <td className="px-4 py-2">{new Date(payment.posted_at).toLocaleDateString()}</td>
                              <td className="px-4 py-2">{payment.service_type.label}</td>
                              <td className="px-4 py-2">
                                {payment.currency} {payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2">{payment.method || "—"}</td>
                              <td className="px-4 py-2">
                                <Badge className="normal-case">{payment.status}</Badge>
                              </td>
                              <td className="px-4 py-2">{payment.memo || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {permissions.managePayments && (
                    <div className="grid md:grid-cols-6 gap-3">
                      <div>
                        <label className="text-xs uppercase text-mute">Service type</label>
                        <Select
                          value={newPayment.service_type_code}
                          onChange={(event) => setNewPayment((prev) => ({ ...prev, service_type_code: event.target.value }))}
                          disabled={savingPayment || serviceTypes.length === 0}
                        >
                          {serviceTypes.length === 0 && <option value="">Loading…</option>}
                          {serviceTypes.map((type) => (
                            <option key={type.code} value={type.code}>
                              {type.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute">Amount</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newPayment.amount}
                          onChange={(event) => setNewPayment((prev) => ({ ...prev, amount: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute">Paid on</label>
                        <Input
                          type="date"
                          value={newPayment.paid_at}
                          onChange={(event) => setNewPayment((prev) => ({ ...prev, paid_at: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute">Method</label>
                        <Select
                          value={newPayment.method}
                          onChange={(event) => setNewPayment((prev) => ({ ...prev, method: event.target.value }))}
                        >
                          <option value="">Select method</option>
                          {(meta?.payment_methods ?? []).map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute">Memo</label>
                        <Input
                          value={newPayment.note}
                          onChange={(event) => setNewPayment((prev) => ({ ...prev, note: event.target.value }))}
                          placeholder="Optional"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button type="button" onClick={handleRecordPayment} disabled={savingPayment || !newPayment.service_type_code}>
                          {savingPayment ? "Recording…" : "Record payment"}
                        </Button>
                      </div>
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  id="family"
                  ref={setSectionRef("family")}
                  title="Family"
                  subtitle="Spouse + children context stays synced with membership records"
                  collapsed={collapsedSections.family}
                  onToggle={() => toggleSectionCollapse("family")}
                >
                  {member.marital_status === "Married" ? (
                    <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                      <h4 className="text-xs uppercase text-mute tracking-wide">Spouse</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs uppercase text-mute">First name</label>
                          <Input value={spouseForm?.first_name ?? ""} onChange={(event) => updateSpouseField("first_name", event.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs uppercase text-mute">Last name</label>
                          <Input value={spouseForm?.last_name ?? ""} onChange={(event) => updateSpouseField("last_name", event.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs uppercase text-mute">Gender</label>
                          <Select value={spouseForm?.gender ?? ""} onChange={(event) => updateSpouseField("gender", event.target.value)}>
                            <option value="">Not set</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs uppercase text-mute">Country of birth</label>
                          <Input value={spouseForm?.country_of_birth ?? ""} onChange={(event) => updateSpouseField("country_of_birth", event.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs uppercase text-mute">Phone</label>
                          <Input value={spouseForm?.phone ?? ""} onChange={(event) => updateSpouseField("phone", event.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs uppercase text-mute">Email</label>
                          <Input value={spouseForm?.email ?? ""} onChange={(event) => updateSpouseField("email", event.target.value)} type="email" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-mute">Spouse information is required only when marital status is set to Married.</p>
                  )}

                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs uppercase text-mute tracking-wide">Children</h4>
                        <p className="text-[11px] text-slate-500">Track household dependents for Sunday School and sponsorship links.</p>
                      </div>
                      <Button type="button" variant="soft" onClick={addChild} className="rounded-full px-4">
                        Add child
                      </Button>
                    </div>
                    {childrenForm.length === 0 ? (
                      <p className="text-xs text-mute">No children recorded.</p>
                    ) : (
                      <div className="space-y-4">
                        {childrenForm.map((child) => (
                          <div key={child.key} className="rounded-lg border border-border/70 p-3 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <span className="text-xs uppercase text-mute">Child</span>
                              <Button type="button" variant="ghost" className="text-red-500" onClick={() => removeChild(child.key)}>
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </Button>
                            </div>
                            <div className="grid md:grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs uppercase text-mute">First name</label>
                                <Input value={child.first_name} onChange={(event) => updateChildField(child.key, "first_name", event.target.value)} />
                              </div>
                              <div>
                                <label className="text-xs uppercase text-mute">Last name</label>
                                <Input value={child.last_name} onChange={(event) => updateChildField(child.key, "last_name", event.target.value)} />
                              </div>
                              <div>
                                <label className="text-xs uppercase text-mute">Gender</label>
                                <Select value={child.gender} onChange={(event) => updateChildField(child.key, "gender", event.target.value)}>
                                  <option value="">Not set</option>
                                  <option value="Male">Male</option>
                                  <option value="Female">Female</option>
                                </Select>
                              </div>
                              <div>
                                <label className="text-xs uppercase text-mute">Birth date</label>
                                <Input type="date" value={child.birth_date} onChange={(event) => updateChildField(child.key, "birth_date", event.target.value)} />
                              </div>
                            </div>
                            <div className="grid md:grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs uppercase text-mute">Country of birth</label>
                                <Input value={child.country_of_birth} onChange={(event) => updateChildField(child.key, "country_of_birth", event.target.value)} />
                              </div>
                              <div>
                                <label className="text-xs uppercase text-mute">Notes</label>
                                <Input value={child.notes} onChange={(event) => updateChildField(child.key, "notes", event.target.value)} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  id="ministries"
                  ref={setSectionRef("ministries")}
                  title="Tags & ministries"
                  subtitle="Chip selectors keep roles + cohorts tidy"
                  collapsed={collapsedSections.ministries}
                  onToggle={() => toggleSectionCollapse("ministries")}
                >
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs uppercase text-mute mb-2">Tags</h4>
                      {metaLoading && <div className="text-xs text-mute">Loading tags…</div>}
                      {!metaLoading && meta && meta.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {meta.tags.map((tag) => {
                            const checked = member.tags.some((assigned) => assigned.id === tag.id);
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() => toggleTag(tag.id)}
                                disabled={disableCore}
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${checked ? "border-accent bg-accent/10 text-accent" : "border-border bg-card text-mute"} ${disableCore ? "opacity-60 cursor-not-allowed" : "hover:bg-accent/10"}`}
                              >
                                {tag.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {!metaLoading && meta && meta.tags.length === 0 && (
                        <div className="text-xs text-mute">No tags available yet.</div>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs uppercase text-mute mb-2">Ministries</h4>
                      {metaLoading && <div className="text-xs text-mute">Loading ministries…</div>}
                      {!metaLoading && meta && meta.ministries.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {meta.ministries.map((ministry) => {
                            const checked = member.ministries.some((assigned) => assigned.id === ministry.id);
                            return (
                              <button
                                key={ministry.id}
                                type="button"
                                onClick={() => toggleMinistry(ministry.id)}
                                disabled={disableCore}
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${checked ? "border-accent bg-accent/10 text-accent" : "border-border bg-card text-mute"} ${disableCore ? "opacity-60 cursor-not-allowed" : "hover:bg-accent/10"}`}
                              >
                                {ministry.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {!metaLoading && meta && meta.ministries.length === 0 && (
                        <div className="text-xs text-mute">No ministries available yet.</div>
                      )}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  id="notes"
                  ref={setSectionRef("notes")}
                  title="Notes"
                  subtitle="Internal-only remarks visible to registrar roles"
                  collapsed={collapsedSections.notes}
                  onToggle={() => toggleSectionCollapse("notes")}
                >
                  <Textarea rows={3} value={member.notes ?? ""} onChange={handleChange("notes")} disabled={disableCore} />
                </SectionCard>

                <div className="flex justify-end">
                  <Button type="submit" disabled={updating || !canSubmit}>
                    {updating ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
              <SummaryCards member={member} formatDate={formatDate} />
              <AuditTrailCard auditLoading={auditLoading} auditEntries={auditEntries} />
            </div>
            <aside className="space-y-4">
              <AvatarCard
                avatarUrl={avatarUrl}
                initials={initials}
                canUpload={canUploadAvatar}
                uploading={avatarUploading}
                onChangeClick={() => setAvatarEditorOpen(true)}
                onRemoveClick={handleAvatarRemove}
                removing={avatarRemoving}
              />
              <QuickActionsCard actions={quickActions} />
              <SnapshotCard
                memberAge={memberAge}
                membershipSince={membershipSince}
                sundayLinkedCount={sundayParticipants.length}
                sundaySummary={sundayStatusSummary}
                sundayContributors={sundayContributors}
                lastContributionDate={lastContributionDateLabel}
                lastSundayPayment={lastSundayPaymentLabel}
                addressSummary={addressSummary}
                isTither={member.is_tither}
                paysContribution={member.pays_contribution}
              />
            </aside>
          </div>
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-mute">
          <span>{unsavedLabel}</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={handleCancelChanges} className="rounded-full px-4">
              Cancel
            </Button>
            <Button type="submit" form="member-form" disabled={updating || !canSubmit} className="rounded-full px-5">
              {updating ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </footer>

      {confirmConfig && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <Card className="relative z-10 w-full max-w-md border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-black">
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${confirmConfig.danger ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-800"} dark:bg-slate-800 dark:text-slate-100`}>
                  !
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-ink dark:text-white">{confirmConfig.title || "Please confirm"}</p>
                  <p className="text-sm text-mute">{confirmConfig.message}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  onClick={() => {
                    confirmConfig.onCancel?.();
                    closeConfirm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant={confirmConfig.danger ? "outline" : "default"}
                  className={confirmConfig.danger ? "border-amber-500 text-amber-700 hover:bg-amber-50 dark:border-amber-500/70 dark:text-amber-100 dark:hover:bg-amber-500/10" : "dark:border-slate-600 dark:bg-slate-800 dark:text-white"}
                  onClick={() => confirmConfig.onConfirm()}
                >
                  {confirmConfig.confirmLabel || "Confirm"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
      <AvatarEditor
        isOpen={avatarEditorOpen}
        onClose={() => setAvatarEditorOpen(false)}
        onSave={handleAvatarSave}
        currentAvatarUrl={avatarUrl}
      />
    </div>
  );
}
const parseApiErrorMessage = (raw?: string | null) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.detail) return String(parsed.detail);
  } catch {
    // not JSON
  }
  return raw;
};
