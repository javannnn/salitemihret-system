import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Clock3,
  History,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { subscribeAdminRolesUpdated } from "@/lib/adminRolesSync";
import {
  type AdminRoleSummary,
  type AdminUserAuditEntry,
  type AdminUserDetail,
  type AdminUserLifecycleStatus,
  type AdminUserMemberSummary,
  type AdminUserPasswordResetResponse,
  deleteAdminUser,
  getAdminUser,
  getAdminUserAudit,
  listAdminRoles,
  parseApiErrorMessage,
  resetAdminUserPassword,
  restoreAdminUser,
  searchAdminMembers,
  suspendAdminUser,
  unsuspendAdminUser,
  updateAdminUser,
  updateAdminUserMemberLink,
  updateAdminUserRoles,
} from "@/lib/api";

import {
  compareStringSets,
  cn,
  formatDateTime,
  formatRelativeTime,
  formatRoleLabel,
  formatUserLifecycleLabel,
  getUserDisplayName,
  getUserLifecycleTone,
  ToneBadge,
  UserAvatar,
} from "./workspace";

type DetailTab = "overview" | "access" | "member" | "activity";

const SUPER_ROLE = "SuperAdmin";
const tabLabels: Record<DetailTab, { label: string; detail: string }> = {
  overview: {
    label: "Overview",
    detail: "Identity and account state",
  },
  access: {
    label: "Access",
    detail: "Roles and temporary credentials",
  },
  member: {
    label: "Member link",
    detail: "Parish identity alignment",
  },
  activity: {
    label: "Activity",
    detail: "Audit trail and change history",
  },
};

function usernameLooksValid(value: string) {
  return /^[a-z0-9._]+$/.test(value);
}

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getMemberName(member: AdminUserMemberSummary) {
  return `${member.first_name} ${member.last_name}`.trim();
}

function getMemberIdentityFetchPrompt(member: AdminUserMemberSummary) {
  const subject = getMemberName(member);
  if (member.email) {
    return `Fetch email, full name, and username from ${subject} into this user account?`;
  }
  return `Fetch full name and username from ${subject} into this user account? This member has no email, so the current user email will stay as it is.`;
}

function getAttentionReasons(user: AdminUserDetail) {
  const reasons: string[] = [];
  if (user.lifecycle_status === "deleted") {
    reasons.push("This account is soft-deleted and cannot be used until it is restored.");
  } else if (user.lifecycle_status === "suspended") {
    reasons.push(
      user.suspended_until
        ? `This account is suspended until ${formatDateTime(user.suspended_until)}.`
        : "This account is suspended.",
    );
  } else if (!user.is_active) {
    reasons.push("This account is inactive.");
  }
  if (user.must_change_password) {
    reasons.push("The user still needs to complete the required password change.");
  }
  if (!user.member) {
    reasons.push("No parish member is linked to this account.");
  }
  if (!user.last_login_at) {
    reasons.push("The user has never signed in.");
  }
  if (!user.roles.length) {
    reasons.push("No roles are assigned yet.");
  }
  return reasons;
}

function toDateTimeLocalInput(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function getMemberSummary(member?: AdminUserMemberSummary | null) {
  if (!member) {
    return "No member linked";
  }
  const parts = [`ID ${member.id}`];
  if (member.status) {
    parts.push(member.status);
  }
  if (member.email) {
    parts.push(member.email);
  }
  return `${member.first_name} ${member.last_name} • ${parts.join(" • ")}`;
}

export default function UserDetail() {
  const { id } = useParams();
  const userId = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.is_super_admin ?? false;

  const activeTab =
    (searchParams.get("tab") as DetailTab) in tabLabels
      ? (searchParams.get("tab") as DetailTab)
      : "overview";
  const backTarget =
    typeof (location.state as { from?: string } | null)?.from === "string"
      ? (location.state as { from?: string }).from
      : "/admin/users";

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [memberInput, setMemberInput] = useState("");
  const [memberNotes, setMemberNotes] = useState("");
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [memberResults, setMemberResults] = useState<AdminUserMemberSummary[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [audit, setAudit] = useState<AdminUserAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savingMemberLink, setSavingMemberLink] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [lifecycleSubmitting, setLifecycleSubmitting] = useState(false);
  const [passwordResetResult, setPasswordResetResult] =
    useState<AdminUserPasswordResetResponse | null>(null);
  const [roleSelection, setRoleSelection] = useState<string[]>([]);
  const [roles, setRoles] = useState<AdminRoleSummary[]>([]);
  const [suspensionUntil, setSuspensionUntil] = useState("");
  const [suspensionReason, setSuspensionReason] = useState("");
  const [deletionReason, setDeletionReason] = useState("");

  useEffect(() => {
    if (!userId || !isSuperAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getAdminUser(userId)
      .then((details) => {
        setUser(details);
        setEmail(details.email);
        setFullName(details.full_name ?? "");
        setUsername(details.username);
        setIsActive(details.is_active);
        setSuperAdmin(details.is_super_admin);
        setMemberInput(details.member ? String(details.member.id) : "");
        setMemberSearchTerm(
          details.member
            ? `${details.member.first_name} ${details.member.last_name}`
            : "",
        );
        setRoleSelection(details.roles);
        setSuspensionUntil(toDateTimeLocalInput(details.suspended_until));
        setSuspensionReason(details.suspension_reason ?? "");
        setDeletionReason(details.deletion_reason ?? "");
        if (!details.temporary_credentials?.is_active) {
          setPasswordResetResult(null);
        }
      })
      .catch((error) => {
        console.error(error);
        toast.push(parseApiErrorMessage(error, "Unable to load user"));
      })
      .finally(() => setLoading(false));
  }, [isSuperAdmin, toast, userId, reloadKey]);

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }
    listAdminRoles()
      .then((response) => setRoles(response.items))
      .catch((error) => {
        console.error(error);
        toast.push(parseApiErrorMessage(error, "Failed to load roles"));
      });
  }, [isSuperAdmin, toast, reloadKey]);

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }
    return subscribeAdminRolesUpdated(() => {
      listAdminRoles()
        .then((response) => setRoles(response.items))
        .catch((error) => {
          console.error(error);
          toast.push(parseApiErrorMessage(error, "Failed to load roles"));
        });
    });
  }, [isSuperAdmin, toast]);

  useEffect(() => {
    if (!userId || !isSuperAdmin || activeTab !== "activity") {
      return;
    }
    setAuditLoading(true);
    getAdminUserAudit(userId, 25)
      .then((entries) => setAudit(entries))
      .catch((error) => {
        console.error(error);
        toast.push(parseApiErrorMessage(error, "Failed to load audit log"));
      })
      .finally(() => setAuditLoading(false));
  }, [activeTab, isSuperAdmin, toast, userId, reloadKey]);

  useEffect(() => {
    const hasSuperAccess = roleSelection.includes(SUPER_ROLE);
    setSuperAdmin((current) => (current === hasSuperAccess ? current : hasSuperAccess));
  }, [roleSelection]);

  useEffect(() => {
    setRoleSelection((previous) => {
      const hasSuper = previous.includes(SUPER_ROLE);
      if (superAdmin && !hasSuper) {
        return [SUPER_ROLE];
      }
      if (!superAdmin && hasSuper) {
        return previous.filter((entry) => entry !== SUPER_ROLE);
      }
      return previous;
    });
  }, [superAdmin]);

  useEffect(() => {
    if (activeTab !== "member") {
      return;
    }
    const term = memberSearchTerm.trim();
    const linkedMemberName = user?.member
      ? `${user.member.first_name} ${user.member.last_name}`
      : "";
    if (
      term.length < 2 ||
      (user?.member &&
        term === linkedMemberName &&
        memberInput.trim() === String(user.member.id))
    ) {
      setMemberResults([]);
      setMemberSearching(false);
      return;
    }
    const handle = window.setTimeout(() => {
      setMemberSearching(true);
      searchAdminMembers(term, 6)
        .then((results) => setMemberResults(results))
        .catch((error) => {
          console.error(error);
          toast.push(parseApiErrorMessage(error, "Failed to search members"));
        })
        .finally(() => setMemberSearching(false));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [activeTab, memberInput, memberSearchTerm, toast, user]);

  const assignableRoles = useMemo(() => {
    const roleNames = roles.map((roleItem) => roleItem.name);
    const combined = [...roleNames, ...roleSelection.filter((roleName) => roleName !== SUPER_ROLE)];
    return Array.from(new Set(combined)).sort((left, right) =>
      formatRoleLabel(left).localeCompare(formatRoleLabel(right)),
    );
  }, [roleSelection, roles]);

  const identityDirty = useMemo(() => {
    if (!user) {
      return false;
    }
    return (
      email.trim() !== user.email ||
      fullName.trim() !== (user.full_name ?? "") ||
      username.trim() !== user.username ||
      isActive !== user.is_active ||
      superAdmin !== user.is_super_admin
    );
  }, [email, fullName, isActive, superAdmin, user, username]);

  const rolesDirty = useMemo(
    () => Boolean(user) && !compareStringSets(roleSelection, user.roles),
    [roleSelection, user],
  );

  const memberDirty = useMemo(() => {
    if (!user) {
      return false;
    }
    const currentMemberId = user.member ? String(user.member.id) : "";
    return memberInput.trim() !== currentMemberId || Boolean(memberNotes.trim());
  }, [memberInput, memberNotes, user]);

  const activeTemporaryPassword =
    passwordResetResult?.temporary_password ??
    user?.temporary_credentials?.password ??
    null;
  const activeTemporaryIssuedAt = user?.temporary_credentials?.issued_at ?? null;
  const hasActiveTemporaryPassword = Boolean(
    passwordResetResult || user?.temporary_credentials?.is_active,
  );
  const attentionReasons = user ? getAttentionReasons(user) : [];
  const lifecycleStatus: AdminUserLifecycleStatus | null = user?.lifecycle_status ?? null;
  const isDeleted = lifecycleStatus === "deleted";
  const isSuspended = lifecycleStatus === "suspended";

  const updateTab = (tab: DetailTab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === "overview") {
        next.delete("tab");
      } else {
        next.set("tab", tab);
      }
      return next;
    }, { replace: true });
  };

  const handleIdentitySave = async () => {
    if (!user) {
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.push("Email is required.");
      return;
    }
    if (!emailLooksValid(trimmedEmail)) {
      toast.push("Enter a valid email address.");
      return;
    }
    if (!trimmedUsername) {
      toast.push("Username is required.");
      return;
    }
    if (!usernameLooksValid(trimmedUsername)) {
      toast.push(
        "Username can only contain lowercase letters, numbers, dots, and underscores.",
      );
      return;
    }
    setSavingIdentity(true);
    try {
      await updateAdminUser(user.id, {
        email: trimmedEmail,
        full_name: fullName.trim() || undefined,
        username: trimmedUsername,
        is_active: isActive,
        is_super_admin: superAdmin,
      });
      toast.push("Identity updated");
      setReloadKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to update user"));
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleRolesSave = async () => {
    if (!user) {
      return;
    }
    setSavingRoles(true);
    try {
      await updateAdminUserRoles(user.id, roleSelection);
      toast.push("Roles updated");
      setReloadKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to update roles"));
    } finally {
      setSavingRoles(false);
    }
  };

  const toggleRole = (roleName: string) => {
    setRoleSelection((previous) => {
      const exists = previous.includes(roleName);
      if (roleName === SUPER_ROLE) {
        return exists ? [] : [SUPER_ROLE];
      }
      const withoutSuper = previous.filter((entry) => entry !== SUPER_ROLE);
      return exists
        ? withoutSuper.filter((entry) => entry !== roleName)
        : [...withoutSuper, roleName];
    });
  };

  const applyMemberDetailsToIdentity = (member: AdminUserMemberSummary) => {
    setEmail((current) => member.email ?? current);
    setFullName(getMemberName(member));
    setUsername(member.username);
    toast.push(
      member.email
        ? "Member details copied into the identity form."
        : "Member name and username copied. Email stayed unchanged because the member record has no email.",
    );
  };

  const handleSelectMemberResult = (member: AdminUserMemberSummary) => {
    if (user && member.linked_user_id && member.linked_user_id !== user.id) {
      toast.push(`Linked to ${member.linked_username ?? "another user"}`);
      return;
    }
    setMemberInput(String(member.id));
    setMemberSearchTerm(getMemberName(member));
    setMemberResults([]);
    if (window.confirm(getMemberIdentityFetchPrompt(member))) {
      applyMemberDetailsToIdentity(member);
    }
  };

  const handleMemberLink = async (memberId: number | null) => {
    if (!user) {
      return;
    }
    setSavingMemberLink(true);
    try {
      await updateAdminUserMemberLink(user.id, memberId, memberNotes.trim() || undefined);
      toast.push(memberId ? "Member linked" : "Member unlinked");
      setMemberNotes("");
      setReloadKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to update member link"));
    } finally {
      setSavingMemberLink(false);
    }
  };

  const handleMemberLinkSubmit = () => {
    if (!user) {
      return;
    }
    if (!memberInput.trim()) {
      handleMemberLink(null);
      return;
    }
    const parsed = Number(memberInput.trim());
    if (Number.isNaN(parsed)) {
      toast.push("Enter a numeric member ID");
      return;
    }
    handleMemberLink(parsed);
  };

  const handleResetPassword = async () => {
    if (!user) {
      return;
    }
    setResettingPassword(true);
    try {
      const response = await resetAdminUserPassword(user.id);
      setPasswordResetResult(response);
      setReloadKey((value) => value + 1);
      toast.push(
        response.email_sent
          ? "Temporary password generated. Mail server accepted the email."
          : "Temporary password generated. Email delivery was not accepted.",
      );
      if (response.email_delivery.warning) {
        toast.push(response.email_delivery.warning);
      }
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Unable to reset password"));
    } finally {
      setResettingPassword(false);
    }
  };

  const handleSuspendUser = async () => {
    if (!user) {
      return;
    }
    const suspendedUntil = toIsoFromLocalInput(suspensionUntil);
    if (!suspendedUntil) {
      toast.push("Choose a valid suspension end date and time.");
      return;
    }
    if (new Date(suspendedUntil).getTime() <= Date.now()) {
      toast.push("Suspension end time must be in the future.");
      return;
    }
    setLifecycleSubmitting(true);
    try {
      await suspendAdminUser(user.id, {
        suspended_until: suspendedUntil,
        reason: suspensionReason.trim() || undefined,
      });
      toast.push("User suspended");
      setReloadKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to suspend user"));
    } finally {
      setLifecycleSubmitting(false);
    }
  };

  const handleUnsuspendUser = async () => {
    if (!user) {
      return;
    }
    setLifecycleSubmitting(true);
    try {
      await unsuspendAdminUser(user.id);
      toast.push("Suspension lifted");
      setReloadKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to lift suspension"));
    } finally {
      setLifecycleSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!user) {
      return;
    }
    if (!window.confirm(`Soft-delete ${getUserDisplayName(user)}? The account will be preserved for audit and can be restored later.`)) {
      return;
    }
    setLifecycleSubmitting(true);
    try {
      await deleteAdminUser(user.id, { reason: deletionReason.trim() || undefined });
      toast.push("User soft-deleted");
      setReloadKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to delete user"));
    } finally {
      setLifecycleSubmitting(false);
    }
  };

  const handleRestoreUser = async () => {
    if (!user) {
      return;
    }
    setLifecycleSubmitting(true);
    try {
      await restoreAdminUser(user.id);
      toast.push("User restored. Reactivate sign-in when ready.");
      setReloadKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to restore user"));
    } finally {
      setLifecycleSubmitting(false);
    }
  };

  if (!userId) {
    return <div className="text-sm text-mute">Invalid user id.</div>;
  }

  if (!isSuperAdmin) {
    return <div className="text-sm text-mute">Super Admin access required.</div>;
  }

  if (loading) {
    return <div className="text-sm text-mute">Loading user…</div>;
  }

  if (!user) {
    return <div className="text-sm text-mute">User not found.</div>;
  }

  return (
    <div className="space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.98),_rgba(241,245,249,0.92),_rgba(226,232,240,0.84))] p-6 shadow-soft dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.96),_rgba(2,6,23,0.96),_rgba(2,6,23,0.88))]"
      >
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-5">
            <UserAvatar
              user={user}
              className="h-16 w-16 rounded-[22px] text-base"
            />
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                User workspace
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
                  {getUserDisplayName(user)}
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {user.email} • @{user.username}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ToneBadge tone={getUserLifecycleTone(user)}>
                  {formatUserLifecycleLabel(user)}
                </ToneBadge>
                {user.must_change_password && (
                  <ToneBadge tone="warning">Password change required</ToneBadge>
                )}
                {user.is_super_admin && (
                  <ToneBadge tone="info">Super admin</ToneBadge>
                )}
                {user.suspended_until && user.lifecycle_status === "suspended" && (
                  <ToneBadge tone="warning">Until {formatDateTime(user.suspended_until)}</ToneBadge>
                )}
                {user.roles.map((roleName) => (
                  <ToneBadge key={roleName}>{formatRoleLabel(roleName)}</ToneBadge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={() => navigate(backTarget)}>
              <ArrowLeft className="h-4 w-4" />
              Back to users
            </Button>
            <Button
              variant="ghost"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh data
            </Button>
            <Button
              className="bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              onClick={() => updateTab("access")}
            >
              <KeyRound className="h-4 w-4" />
              Manage access
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
          <span>Created {formatDateTime(user.created_at)}</span>
          <span>Updated {formatDateTime(user.updated_at)}</span>
          <span>
            Last login{" "}
            {user.last_login_at
              ? formatDateTime(user.last_login_at)
              : "Never"}
          </span>
        </div>
      </motion.section>

      <Card className="sticky top-20 z-20 rounded-[24px] border border-slate-200/80 bg-white/90 p-3 shadow-soft backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="grid gap-2 md:grid-cols-4">
          {(Object.keys(tabLabels) as DetailTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => updateTab(tab)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left transition",
                activeTab === tab
                  ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800",
              )}
            >
              <div className="text-sm font-semibold">{tabLabels[tab].label}</div>
              <div
                className={cn(
                  "mt-1 text-xs",
                  activeTab === tab
                    ? "text-white/80 dark:text-slate-950/70"
                    : "text-slate-500 dark:text-slate-400",
                )}
              >
                {tabLabels[tab].detail}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_340px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-6"
          >
            {activeTab === "overview" && (
              <>
                <Card className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Identity
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                        Core account details
                      </h2>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Keep the sign-in identity clear, consistent, and intentionally scoped.
                      </p>
                    </div>
                    <Button onClick={handleIdentitySave} disabled={isDeleted || !identityDirty || savingIdentity}>
                      {savingIdentity ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Save identity
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Email
                      </label>
                      <Input
                        type="email"
                        className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                        value={email}
                        disabled={isDeleted}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Full name
                      </label>
                      <Input
                        className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                        value={fullName}
                        disabled={isDeleted}
                        onChange={(event) => setFullName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Username
                      </label>
                      <Input
                        className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                        value={username}
                        disabled={isDeleted}
                        onChange={(event) => setUsername(event.target.value.toLowerCase())}
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Lowercase letters, numbers, dots, and underscores only.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Activation
                      </label>
                      <Select
                        className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                        value={isActive ? "active" : "inactive"}
                        disabled={isDeleted}
                        onChange={(event) => setIsActive(event.target.value === "active")}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </Select>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Use this for indefinite activation. Timed lockouts are managed below.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Global access
                      </label>
                      <Select
                        className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                        value={superAdmin ? "yes" : "no"}
                        disabled={isDeleted}
                        onChange={(event) => setSuperAdmin(event.target.value === "yes")}
                      >
                        <option value="no">Standard admin</option>
                        <option value="yes">Super admin</option>
                      </Select>
                    </div>
                  </div>
                </Card>

                <Card className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Snapshot
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                        Operational context
                      </h2>
                    </div>
                    <ToneBadge tone={attentionReasons.length ? "warning" : "success"}>
                      {attentionReasons.length
                        ? `${attentionReasons.length} follow-up item${attentionReasons.length === 1 ? "" : "s"}`
                        : "Fully set up"}
                    </ToneBadge>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Member link
                      </p>
                      <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
                        {user.member
                          ? `${user.member.first_name} ${user.member.last_name}`
                          : "Not linked"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {getMemberSummary(user.member)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Last login
                      </p>
                      <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
                        {user.last_login_at
                          ? formatRelativeTime(user.last_login_at)
                          : "Never"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {formatDateTime(user.last_login_at, "No login recorded")}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Lifecycle
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                        Suspension, restoration, and archival controls
                      </h2>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Use suspension for timed lockouts and soft-delete for removal with audit retention.
                      </p>
                    </div>
                    <ToneBadge tone={getUserLifecycleTone(user)}>
                      {formatUserLifecycleLabel(user)}
                    </ToneBadge>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Sign-in state
                      </p>
                      <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
                        {user.can_sign_in ? "Allowed" : "Blocked"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {user.lifecycle_status === "suspended" && user.suspended_until
                          ? `Blocked until ${formatDateTime(user.suspended_until)}.`
                          : user.lifecycle_status === "deleted"
                            ? "Blocked until the account is restored and reactivated."
                            : user.lifecycle_status === "inactive"
                              ? "Blocked until the account is reactivated."
                              : "This account can sign in right now."}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Archive state
                      </p>
                      <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
                        {user.deleted_at ? formatDateTime(user.deleted_at) : "Not deleted"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {user.deletion_reason || "Soft-delete keeps the record and audit history intact."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                    <div className="space-y-4 rounded-[24px] border border-slate-200 p-5 dark:border-slate-800">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">
                          Timed suspension
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Block sign-in until a specific date and time without deleting the account.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                          Suspend until
                        </label>
                        <Input
                          type="datetime-local"
                          className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                          value={suspensionUntil}
                          disabled={isDeleted}
                          onChange={(event) => setSuspensionUntil(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                          Reason
                        </label>
                        <Textarea
                          rows={3}
                          className="rounded-[22px] border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                          value={suspensionReason}
                          disabled={isDeleted}
                          onChange={(event) => setSuspensionReason(event.target.value)}
                          placeholder="Optional note for admins and audit history"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={handleSuspendUser} disabled={isDeleted || lifecycleSubmitting}>
                          {lifecycleSubmitting ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving…
                            </>
                          ) : (
                            <>
                              <Ban className="h-4 w-4" />
                              Suspend user
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={handleUnsuspendUser}
                          disabled={isDeleted || lifecycleSubmitting || !isSuspended}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Lift suspension
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-[24px] border border-rose-200 bg-rose-50/50 p-5 dark:border-rose-500/30 dark:bg-rose-500/10">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">
                          Soft delete and restore
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          Deleted users stay in the system for audit, but cannot sign in or receive normal access actions.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                          Deletion note
                        </label>
                        <Textarea
                          rows={3}
                          className="rounded-[22px] border-rose-200 bg-white dark:border-rose-500/30 dark:bg-slate-950"
                          value={deletionReason}
                          onChange={(event) => setDeletionReason(event.target.value)}
                          placeholder="Optional note explaining why the account is being archived"
                        />
                      </div>
                      {user.deleted_at && (
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          Deleted {formatDateTime(user.deleted_at)}
                          {user.deletion_reason ? ` • ${user.deletion_reason}` : ""}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3">
                        {isDeleted ? (
                          <Button onClick={handleRestoreUser} disabled={lifecycleSubmitting}>
                            {lifecycleSubmitting ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving…
                              </>
                            ) : (
                              <>
                                <RotateCcw className="h-4 w-4" />
                                Restore user
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            className="border-rose-200 bg-rose-100 text-rose-700 hover:border-rose-300 hover:bg-rose-200 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100 dark:hover:bg-rose-500/20"
                            onClick={handleDeleteUser}
                            disabled={lifecycleSubmitting}
                          >
                            {lifecycleSubmitting ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving…
                              </>
                            ) : (
                              <>
                                <Trash2 className="h-4 w-4" />
                                Soft delete user
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {activeTab === "access" && (
              <>
                <Card className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Roles
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                        Access assignment
                      </h2>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Changes take effect immediately. Super admin remains exclusive.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="ghost"
                        onClick={() => navigate("/admin/users/roles")}
                      >
                        Open role manager
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                      <Button onClick={handleRolesSave} disabled={isDeleted || !rolesDirty || savingRoles}>
                        {savingRoles ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Shield className="h-4 w-4" />
                            Save roles
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {assignableRoles.map((roleName) => {
                      const selected = roleSelection.includes(roleName);
                      return (
                        <button
                          key={roleName}
                          type="button"
                          onClick={() => toggleRole(roleName)}
                          className={cn(
                            "rounded-full border px-4 py-2 text-sm font-medium transition",
                            isDeleted
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600"
                              : selected
                              ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800",
                          )}
                          disabled={isDeleted}
                        >
                          {formatRoleLabel(roleName)}
                        </button>
                      );
                    })}
                  </div>
                </Card>

                <Card className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Temporary access
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                        Support sign-in without guesswork
                      </h2>
                    </div>
                    <Button variant="ghost" onClick={handleResetPassword} disabled={isDeleted || resettingPassword}>
                      {resettingPassword ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>
                          <KeyRound className="h-4 w-4" />
                          Generate temporary password
                        </>
                      )}
                    </Button>
                  </div>

                  {passwordResetResult && (
                    <div
                      className={cn(
                        "mt-5 rounded-[24px] border p-4",
                        passwordResetResult.email_sent
                          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                          : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
                      )}
                    >
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">
                        {passwordResetResult.email_sent
                          ? "The reset email was accepted by the mail server."
                          : "A temporary password was generated, but the email server did not accept it."}
                      </p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        {passwordResetResult.email_delivery.warning ||
                          "The system will force a password change on the next successful sign-in."}
                      </p>
                    </div>
                  )}

                  {hasActiveTemporaryPassword ? (
                    user.temporary_credentials?.is_active && !activeTemporaryPassword ? (
                      <div className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                        A temporary password is active, but it cannot be displayed with the current server secret. Generate a new one to replace it.
                      </div>
                    ) : (
                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            Sign-in email
                          </p>
                          <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
                            {user.email}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            Username
                          </p>
                          <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
                            {user.username}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80 md:col-span-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            Temporary password
                          </p>
                          <p className="mt-2 break-all font-mono text-base font-semibold text-slate-950 dark:text-white">
                            {activeTemporaryPassword}
                          </p>
                          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            Active until the user sets a personal password.
                            {activeTemporaryIssuedAt
                              ? ` Issued ${formatDateTime(activeTemporaryIssuedAt)}.`
                              : ""}
                          </p>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
                      No active temporary password is available. The user may already have changed to a personal password, or this account predates temporary-credential tracking.
                    </div>
                  )}
                </Card>
              </>
            )}

            {activeTab === "member" && (
              <Card className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Member link
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                      Connect this account to the correct person
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Linking improves audits, mail merges, and traceability across staff workflows.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {user.member && (
                      <Button
                        variant="ghost"
                        onClick={() => handleMemberLink(null)}
                        disabled={isDeleted || savingMemberLink}
                      >
                        Unlink
                      </Button>
                    )}
                    <Button onClick={handleMemberLinkSubmit} disabled={isDeleted || !memberDirty || savingMemberLink}>
                      {savingMemberLink ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Link2 className="h-4 w-4" />
                          {user.member ? "Update link" : "Link member"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/80">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Current link
                      </p>
                      <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
                        {getMemberSummary(user.member)}
                      </p>
                    </div>
                    <ToneBadge tone={user.member ? "success" : "warning"}>
                      {user.member ? "Linked" : "Not linked"}
                    </ToneBadge>
                  </div>
                  {user.member && (
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          if (user.member) {
                            applyMemberDetailsToIdentity(user.member);
                          }
                        }}
                      >
                        Fetch details to identity
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-6 grid gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Search member
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        className="h-12 rounded-2xl border-slate-200 bg-slate-50 pl-10 dark:border-slate-700 dark:bg-slate-900"
                        value={memberSearchTerm}
                        disabled={isDeleted}
                        onChange={(event) => {
                          setMemberSearchTerm(event.target.value);
                          if (!event.target.value.trim()) {
                            setMemberInput("");
                          }
                        }}
                        placeholder="Name, email, or phone"
                      />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      When you choose a member, the system can also pull that member's email, full name, and username into the identity form.
                    </p>
                  </div>

                  {memberSearchTerm.trim().length >= 2 && (
                    <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-800">
                      {memberSearching ? (
                        <div className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                          Searching members…
                        </div>
                      ) : memberResults.length ? (
                        memberResults.map((member) => {
                          const disabled = Boolean(
                            member.linked_user_id && member.linked_user_id !== user.id,
                          );
                          const isCurrent = user.member?.id === member.id;
                          return (
                            <button
                              key={member.id}
                              type="button"
                              disabled={isDeleted || disabled}
                              onClick={() => handleSelectMemberResult(member)}
                              className={cn(
                                "w-full border-b border-slate-200 px-4 py-3 text-left last:border-b-0 dark:border-slate-800",
                                disabled
                                  ? "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-900/60 dark:text-slate-500"
                                  : "bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900",
                                isCurrent && "bg-emerald-50 dark:bg-emerald-500/10",
                              )}
                            >
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950 dark:text-white">
                                    {member.first_name} {member.last_name}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    ID {member.id}
                                    {member.status ? ` • ${member.status}` : ""}
                                    {member.email ? ` • ${member.email}` : ""}
                                    {member.phone ? ` • ${member.phone}` : ""}
                                  </p>
                                </div>
                                {member.linked_user_id && (
                                  <ToneBadge
                                    tone={member.linked_user_id === user.id ? "success" : "warning"}
                                  >
                                    {member.linked_user_id === user.id
                                      ? "Linked here"
                                      : `Linked to ${member.linked_username ?? "another user"}`}
                                  </ToneBadge>
                                )}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                          No matching member found.
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Member ID
                      </label>
                      <Input
                        className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                        value={memberInput}
                        disabled={isDeleted}
                        onChange={(event) => setMemberInput(event.target.value)}
                        placeholder="Enter numeric ID"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Notes
                      </label>
                      <Textarea
                        rows={3}
                        className="rounded-[22px] border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                        value={memberNotes}
                        disabled={isDeleted}
                        onChange={(event) => setMemberNotes(event.target.value)}
                        placeholder="Optional note for the audit log"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === "activity" && (
              <Card className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Audit trail
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                      Recent changes and actors
                    </h2>
                  </div>
                  <ToneBadge tone="info">
                    {audit.length} entr{audit.length === 1 ? "y" : "ies"}
                  </ToneBadge>
                </div>

                {auditLoading ? (
                  <div className="mt-6 text-sm text-slate-500 dark:text-slate-400">
                    Loading audit…
                  </div>
                ) : audit.length ? (
                  <div className="mt-6 space-y-3">
                    {audit.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>{formatDateTime(entry.created_at)}</span>
                          <span>{entry.actor_email || entry.actor_name || "System"}</span>
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
                          {entry.action}
                        </div>
                        {entry.payload && Object.keys(entry.payload).length > 0 && (
                          <pre className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                            {JSON.stringify(entry.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                    No audit entries yet.
                  </div>
                )}
              </Card>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="space-y-6">
          <Card className="sticky top-[170px] rounded-[26px] border border-slate-200/80 bg-white/92 p-5 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Account health
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ToneBadge tone={getUserLifecycleTone(user)}>
                    {formatUserLifecycleLabel(user)}
                  </ToneBadge>
                  <ToneBadge tone={user.member ? "success" : "warning"}>
                    {user.member ? "Member linked" : "Missing member link"}
                  </ToneBadge>
                  <ToneBadge tone={user.can_sign_in ? "success" : "warning"}>
                    {user.can_sign_in ? "Sign-in allowed" : "Sign-in blocked"}
                  </ToneBadge>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Attention
                </p>
                {attentionReasons.length ? (
                  attentionReasons.map((reason) => (
                    <div
                      key={reason}
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                    >
                      {reason}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                    This account is configured cleanly.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Quick actions
                </p>
                <div className="grid gap-2">
                  <Button variant="ghost" onClick={() => updateTab("overview")}>
                    <Sparkles className="h-4 w-4" />
                    Overview
                  </Button>
                  <Button variant="ghost" onClick={() => updateTab("access")}>
                    <KeyRound className="h-4 w-4" />
                    Access
                  </Button>
                  <Button variant="ghost" onClick={() => updateTab("member")}>
                    <Link2 className="h-4 w-4" />
                    Member link
                  </Button>
                  <Button variant="ghost" onClick={() => updateTab("activity")}>
                    <History className="h-4 w-4" />
                    Activity
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Timeline
                </p>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-white">
                    <Clock3 className="h-4 w-4 text-slate-400" />
                    Last seen {formatRelativeTime(user.last_login_at)}
                  </div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    Created {formatDateTime(user.created_at)} and updated {formatRelativeTime(user.updated_at)}.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
