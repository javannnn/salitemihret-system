import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { subscribeAdminRolesUpdated } from "@/lib/adminRolesSync";
import {
  type AdminRoleSummary,
  type AdminUserListResponse,
  type AdminUserMemberSummary,
  type AdminUserProvisionPayload,
  type AdminUserProvisionResponse,
  type AdminUserSummary,
  listAdminRoles,
  listAdminUsers,
  parseApiErrorMessage,
  provisionAdminUser,
  searchAdminMembers,
} from "@/lib/api";

import {
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

type StatusFilter = "any" | "active" | "inactive" | "suspended" | "deleted";
type LinkedFilter = "any" | "linked" | "unlinked";
type SurfaceFilter = "all" | "attention" | "super" | "linked" | "unlinked";

const SUPER_ROLE = "SuperAdmin";
const surfaceLabels: Record<SurfaceFilter, string> = {
  all: "All accounts",
  attention: "Needs attention",
  super: "Super admins",
  linked: "Linked to members",
  unlinked: "Needs member link",
};

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function usernameLooksValid(value: string) {
  return /^[a-z0-9._]+$/.test(value);
}

function getMemberName(member: AdminUserMemberSummary) {
  return `${member.first_name} ${member.last_name}`.trim();
}

function getInviteMemberFetchPrompt(member: AdminUserMemberSummary) {
  const subject = getMemberName(member);
  if (member.email) {
    return `Fetch email, first name, last name, and username from ${subject} into this new user account?`;
  }
  return `Fetch first name, last name, and username from ${subject} into this new user account? This member has no email, so the email field will stay as it is.`;
}

function getAttentionReasons(user: AdminUserSummary) {
  const reasons: string[] = [];
  if (user.lifecycle_status === "deleted") {
    reasons.push("Soft-deleted account");
  } else if (user.lifecycle_status === "suspended") {
    reasons.push(
      user.suspended_until
        ? `Suspended until ${formatDateTime(user.suspended_until)}`
        : "Suspended account",
    );
  } else if (!user.is_active) {
    reasons.push("Inactive account");
  }
  if (user.must_change_password) {
    reasons.push("Waiting for first password change");
  }
  if (!user.member) {
    reasons.push("No linked member record");
  }
  if (!user.last_login_at) {
    reasons.push("No successful sign-in yet");
  }
  if (!user.roles.length) {
    reasons.push("No roles assigned");
  }
  return reasons;
}

function matchesSurface(user: AdminUserSummary, filter: SurfaceFilter) {
  if (filter === "attention") {
    return getAttentionReasons(user).length > 0;
  }
  if (filter === "super") {
    return user.is_super_admin;
  }
  if (filter === "linked") {
    return Boolean(user.member);
  }
  if (filter === "unlinked") {
    return !user.member;
  }
  return true;
}

function formatMemberLine(member?: AdminUserMemberSummary | null) {
  if (!member) {
    return "No member link";
  }
  const details = [`ID ${member.id}`];
  if (member.status) {
    details.push(member.status);
  }
  if (member.email) {
    details.push(member.email);
  }
  return `${member.first_name} ${member.last_name} • ${details.join(" • ")}`;
}

export default function UsersList() {
  const [data, setData] = useState<AdminUserListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roles, setRoles] = useState<AdminRoleSummary[]>([]);
  const [invitePayload, setInvitePayload] = useState<AdminUserProvisionPayload>({
    email: "",
    username: "",
    roles: [],
  });
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [selectedInviteMember, setSelectedInviteMember] =
    useState<AdminUserMemberSummary | null>(null);
  const [memberResults, setMemberResults] = useState<AdminUserMemberSummary[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [provisionResult, setProvisionResult] =
    useState<AdminUserProvisionResponse | null>(null);

  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isSuperAdmin = user?.is_super_admin ?? false;

  const search = searchParams.get("q") ?? "";
  const role = searchParams.get("role") ?? "";
  const statusFilter = (searchParams.get("status") as StatusFilter) || "any";
  const linkedFilter = (searchParams.get("linked") as LinkedFilter) || "any";
  const surfaceFilter =
    (searchParams.get("surface") as SurfaceFilter) || "all";
  const selectedUserId = useMemo(() => {
    const value = searchParams.get("focus");
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }, [searchParams]);

  const [draftSearch, setDraftSearch] = useState(search);
  const deferredSearch = useDeferredValue(draftSearch);

  const updateParams = useCallback(
    (patch: Record<string, string | undefined>, replace = true) => {
      startTransition(() => {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          Object.entries(patch).forEach(([key, value]) => {
            if (!value) {
              next.delete(key);
              return;
            }
            next.set(key, value);
          });
          return next;
        }, { replace });
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    setDraftSearch(search);
  }, [search]);

  useEffect(() => {
    const normalizedSearch = deferredSearch.trim();
    if (normalizedSearch === search.trim()) {
      return;
    }
    updateParams({ q: normalizedSearch || undefined, focus: undefined });
  }, [deferredSearch, search, updateParams]);

  const loadUsers = useCallback(() => {
    if (!isSuperAdmin) {
      return;
    }
    setLoading(true);
    listAdminUsers({
      search: search.trim() || undefined,
      role: role || undefined,
      is_active:
        statusFilter === "active" || statusFilter === "inactive"
          ? statusFilter === "active"
          : undefined,
      lifecycle_status: statusFilter === "any" ? undefined : statusFilter,
      linked:
        linkedFilter === "any" ? undefined : linkedFilter === "linked",
    })
      .then((response) => setData(response))
      .catch((error) => {
        console.error(error);
        toast.push(parseApiErrorMessage(error, "Failed to load users"));
      })
      .finally(() => setLoading(false));
  }, [isSuperAdmin, linkedFilter, role, search, statusFilter, toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, refreshKey]);

  const loadRoles = useCallback(() => {
    if (!isSuperAdmin) {
      return;
    }
    listAdminRoles()
      .then((response) => setRoles(response.items))
      .catch((error) => {
        console.error(error);
        toast.push(parseApiErrorMessage(error, "Failed to load roles"));
      });
  }, [isSuperAdmin, toast]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }
    return subscribeAdminRolesUpdated(() => {
      loadRoles();
    });
  }, [isSuperAdmin, loadRoles]);

  useEffect(() => {
    if (!inviteOpen) {
      setMemberResults([]);
      setMemberSearching(false);
      return;
    }
    const term = memberSearchTerm.trim();
    if (term.length < 2) {
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
          toast.push(parseApiErrorMessage(error, "Unable to search members"));
        })
        .finally(() => setMemberSearching(false));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [inviteOpen, memberSearchTerm, toast]);

  const roleOptions = useMemo(
    () =>
      roles
        .map((roleItem) => roleItem.name)
        .sort((left, right) =>
          formatRoleLabel(left).localeCompare(formatRoleLabel(right)),
        ),
    [roles],
  );

  const inviteRoleOptions = useMemo(() => {
    const withoutSuper = roleOptions.filter((option) => option !== SUPER_ROLE);
    return [SUPER_ROLE, ...withoutSuper];
  }, [roleOptions]);

  const filteredUsers = useMemo(
    () => (data?.items ?? []).filter((entry) => matchesSurface(entry, surfaceFilter)),
    [data?.items, surfaceFilter],
  );

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!filteredUsers.length) {
      if (selectedUserId !== null) {
        updateParams({ focus: undefined });
      }
      return;
    }
    if (!selectedUserId || !filteredUsers.some((entry) => entry.id === selectedUserId)) {
      updateParams({ focus: String(filteredUsers[0].id) });
    }
  }, [filteredUsers, loading, selectedUserId, updateParams]);

  const selectedPreview =
    filteredUsers.find((entry) => entry.id === selectedUserId) ||
    filteredUsers[0] ||
    null;

  const surfaceCounts = useMemo(() => {
    const items = data?.items ?? [];
    return {
      all: items.length,
      attention: items.filter((entry) => getAttentionReasons(entry).length > 0)
        .length,
      super: items.filter((entry) => entry.is_super_admin).length,
      linked: items.filter((entry) => Boolean(entry.member)).length,
      unlinked: items.filter((entry) => !entry.member).length,
    };
  }, [data?.items]);

  const summaryCards = useMemo(
    () => [
      {
        label: "Accounts",
        value: data?.total ?? 0,
        detail: "Visible in current query",
        tone: "neutral" as const,
      },
      {
        label: "Can sign in",
        value: data?.total_active ?? 0,
        detail: "Can sign in right now",
        tone: "success" as const,
      },
      {
        label: "Suspended",
        value: data?.total_suspended ?? 0,
        detail: "Temporarily locked",
        tone: "warning" as const,
      },
      {
        label: "Deleted",
        value: data?.total_deleted ?? 0,
        detail: "Soft-deleted accounts",
        tone: "danger" as const,
      },
    ],
    [data?.total, data?.total_active, data?.total_deleted, data?.total_suspended],
  );

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (search.trim()) {
      chips.push(`Search: ${search.trim()}`);
    }
    if (role) {
      chips.push(`Role: ${formatRoleLabel(role)}`);
    }
    if (statusFilter !== "any") {
      chips.push(`Status: ${statusFilter[0].toUpperCase()}${statusFilter.slice(1)}`);
    }
    if (linkedFilter !== "any") {
      chips.push(
        linkedFilter === "linked" ? "Member linked" : "Not linked to member",
      );
    }
    if (surfaceFilter !== "all") {
      chips.push(surfaceLabels[surfaceFilter]);
    }
    return chips;
  }, [linkedFilter, role, search, statusFilter, surfaceFilter]);

  const inviteErrors = useMemo(() => {
    const errors: Partial<
      Record<"email" | "name" | "username" | "member", string>
    > = {};
    const email = invitePayload.email.trim();
    const firstName = inviteFirstName.trim();
    const lastName = inviteLastName.trim();
    const username = invitePayload.username?.trim() ?? "";

    if (!email) {
      errors.email = "Email is required.";
    } else if (!emailLooksValid(email)) {
      errors.email = "Enter a valid email address.";
    }

    if ((firstName || lastName) && (!firstName || !lastName)) {
      errors.name = "Enter both first and last name, or leave both blank.";
    }

    if (username && !usernameLooksValid(username)) {
      errors.username =
        "Username can only contain lowercase letters, numbers, dots, and underscores.";
    }

    if (selectedInviteMember?.linked_user_id) {
      errors.member = `This member is already linked to ${selectedInviteMember.linked_username ?? "another user"}.`;
    }

    return errors;
  }, [inviteFirstName, inviteLastName, invitePayload.email, invitePayload.username, selectedInviteMember]);

  const canSubmitInvite =
    Boolean(invitePayload.email.trim()) &&
    Object.keys(inviteErrors).length === 0 &&
    !inviteSubmitting;

  const resetInviteForm = useCallback(() => {
    setInvitePayload({ email: "", username: "", roles: [] });
    setInviteFirstName("");
    setInviteLastName("");
    setMemberSearchTerm("");
    setSelectedInviteMember(null);
    setMemberResults([]);
    setProvisionResult(null);
  }, []);

  const closeInvite = useCallback(() => {
    setInviteOpen(false);
    resetInviteForm();
  }, [resetInviteForm]);

  const toggleRole = useCallback((roleName: string) => {
    setInvitePayload((previous) => {
      const currentRoles = previous.roles ?? [];
      const exists = currentRoles.includes(roleName);
      if (roleName === SUPER_ROLE) {
        return {
          ...previous,
          roles: exists ? [] : [SUPER_ROLE],
        };
      }
      const nextRoles = currentRoles.filter((entry) => entry !== SUPER_ROLE);
      return {
        ...previous,
        roles: exists
          ? nextRoles.filter((entry) => entry !== roleName)
          : [...nextRoles, roleName],
      };
    });
  }, []);

  const openUserWorkspace = useCallback(
    (userId: number, tab?: string) => {
      const query = tab ? `?tab=${tab}` : "";
      navigate(`/admin/users/${userId}${query}`, {
        state: { from: `${location.pathname}${location.search}` },
      });
    },
    [location.pathname, location.search, navigate],
  );

  const applyInviteMemberDetails = useCallback(
    (member: AdminUserMemberSummary) => {
      setInvitePayload((previous) => ({
        ...previous,
        email: member.email ?? previous.email,
        username: member.username || previous.username,
      }));
      setInviteFirstName(member.first_name);
      setInviteLastName(member.last_name);
      toast.push(
        member.email
          ? "Member details copied into the account form."
          : "Member name and username copied. Email stayed unchanged because the member record has no email.",
      );
    },
    [toast],
  );

  const handleSelectInviteMember = useCallback(
    (member: AdminUserMemberSummary) => {
      if (member.linked_user_id) {
        toast.push(
          `Already linked to ${member.linked_username ?? "another user"}`,
        );
        return;
      }
      setSelectedInviteMember(member);
      setMemberSearchTerm(getMemberName(member));
      setMemberResults([]);
      if (window.confirm(getInviteMemberFetchPrompt(member))) {
        applyInviteMemberDetails(member);
      }
    },
    [applyInviteMemberDetails, toast],
  );

  const handleInviteSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const firstError = Object.values(inviteErrors).find(Boolean);
    if (firstError) {
      toast.push(firstError);
      return;
    }

    const firstName = inviteFirstName.trim();
    const lastName = inviteLastName.trim();
    const fullName =
      [firstName, lastName].filter(Boolean).join(" ").trim() || undefined;

    setInviteSubmitting(true);
    try {
      const response = await provisionAdminUser({
        email: invitePayload.email.trim(),
        username: invitePayload.username?.trim() || undefined,
        full_name: fullName,
        member_id: selectedInviteMember?.id,
        message: invitePayload.message?.trim() || undefined,
        roles: invitePayload.roles ?? [],
      });
      setProvisionResult(response);
      toast.push(
        response.email_sent
          ? `Account created for ${response.user.email}. Mail server accepted the email.`
          : `Account created for ${response.user.email}. Email delivery was not accepted.`,
      );
      if (response.email_delivery.warning) {
        toast.push(response.email_delivery.warning);
      }
      setRefreshKey((value) => value + 1);
      updateParams({ focus: String(response.user.id) });
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to create user"));
    } finally {
      setInviteSubmitting(false);
    }
  };

  if (!isSuperAdmin) {
    return <div className="text-sm text-mute">Super Admin access required.</div>;
  }

  return (
    <div className="space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.96),_rgba(241,245,249,0.92),_rgba(226,232,240,0.86))] p-6 shadow-soft dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.96),_rgba(2,6,23,0.96),_rgba(2,6,23,0.88))]"
      >
        <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Security Console
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-[2.5rem]">
                User Accounts
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Search, filter, and manage all system accounts in one place.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:w-[420px]">
            {summaryCards.map((card) => (
              <Card
                key={card.label}
                className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.04]"
              >
                <ToneBadge tone={card.tone}>{card.label}</ToneBadge>
                <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
                  {card.value}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {card.detail}
                </p>
              </Card>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="ghost"
            className="border-white/70 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh directory
          </Button>
          <Button
            variant="ghost"
            className="border-white/70 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            onClick={() => navigate("/admin/users/roles")}
          >
            <Settings2 className="h-4 w-4" />
            Roles & permissions
          </Button>
          <Button
            className="bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            onClick={() => {
              resetInviteForm();
              setInviteOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Create user
          </Button>
        </div>
      </motion.section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="space-y-6">
          <Card className="rounded-[26px] border border-slate-200/80 bg-white/90 p-5 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_220px_190px_190px]">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Search accounts
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50 pl-10 dark:border-slate-700 dark:bg-slate-900"
                    value={draftSearch}
                    onChange={(event) => setDraftSearch(event.target.value)}
                    placeholder="Name, username, or email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Role
                </label>
                <Select
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                  value={role}
                  onChange={(event) =>
                    updateParams({
                      role: event.target.value || undefined,
                      focus: undefined,
                    })
                  }
                >
                  <option value="">All roles</option>
                  {roleOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatRoleLabel(option)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Status
                </label>
                <Select
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                  value={statusFilter}
                  onChange={(event) =>
                    updateParams({
                      status:
                        event.target.value === "any" ? undefined : event.target.value,
                      focus: undefined,
                    })
                  }
                >
                  <option value="any">Any status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                  <option value="deleted">Deleted</option>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Member link
                </label>
                <Select
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                  value={linkedFilter}
                  onChange={(event) =>
                    updateParams({
                      linked:
                        event.target.value === "any" ? undefined : event.target.value,
                      focus: undefined,
                    })
                  }
                >
                  <option value="any">All users</option>
                  <option value="linked">Linked</option>
                  <option value="unlinked">Not linked</option>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(Object.keys(surfaceLabels) as SurfaceFilter[]).map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() =>
                    updateParams({
                      surface: filterKey === "all" ? undefined : filterKey,
                      focus: undefined,
                    })
                  }
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                    surfaceFilter === filterKey
                      ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800",
                  )}
                >
                  {surfaceLabels[filterKey]}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      surfaceFilter === filterKey
                        ? "bg-white/15 text-white dark:bg-slate-950/10 dark:text-slate-950"
                        : "bg-white text-slate-600 dark:bg-slate-950 dark:text-slate-300",
                    )}
                  >
                    {surfaceCounts[filterKey]}
                  </span>
                </button>
              ))}

              <div className="ms-auto flex flex-wrap gap-2">
                {activeFilterChips.length > 0 && (
                  <Button
                    variant="ghost"
                    className="h-10 rounded-full px-4"
                    onClick={() => {
                      setDraftSearch("");
                      updateParams({
                        q: undefined,
                        role: undefined,
                        status: undefined,
                        linked: undefined,
                        surface: undefined,
                        focus: undefined,
                      });
                    }}
                  >
                    <X className="h-4 w-4" />
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            {activeFilterChips.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {activeFilterChips.map((chip) => (
                  <ToneBadge key={chip}>{chip}</ToneBadge>
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/92 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  {surfaceLabels[surfaceFilter]}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {loading
                    ? "Refreshing account directory…"
                    : `${filteredUsers.length} result${filteredUsers.length === 1 ? "" : "s"} in view`}
                </p>
              </div>
              {!loading && selectedPreview && (
                <Button
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => openUserWorkspace(selectedPreview.id)}
                >
                  Open full workspace
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`skeleton-${index}`}
                    className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.95fr)_140px]"
                  >
                    <div className="space-y-3">
                      <div className="h-5 w-48 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                      <div className="h-4 w-72 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                    </div>
                    <div className="space-y-3">
                      <div className="h-4 w-56 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                      <div className="h-4 w-40 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                    </div>
                    <div className="space-y-3">
                      <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                      <div className="h-4 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                    </div>
                  </div>
                ))
              ) : filteredUsers.length ? (
                filteredUsers.map((entry) => {
                  const selected = entry.id === selectedPreview?.id;
                  const attention = getAttentionReasons(entry);
                  return (
                    <motion.div
                      layout
                      key={entry.id}
                      className={cn(
                        "cursor-pointer px-5 py-5 transition-colors",
                        selected
                          ? "bg-slate-100/90 dark:bg-slate-900/90"
                          : "hover:bg-slate-50/90 dark:hover:bg-slate-900/60",
                      )}
                      onClick={() => updateParams({ focus: String(entry.id) })}
                    >
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.95fr)_160px]">
                        <div className="flex gap-4">
                          <UserAvatar
                            user={entry}
                            className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-900"
                          />
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-slate-950 dark:text-white">
                                {getUserDisplayName(entry)}
                              </h3>
                              {entry.is_super_admin && (
                                <ToneBadge tone="info">Super admin</ToneBadge>
                              )}
                              {!entry.roles.length && (
                                <ToneBadge tone="danger">No roles</ToneBadge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center gap-2">
                                <Mail className="h-3.5 w-3.5" />
                                {entry.email}
                              </span>
                              <span>@{entry.username}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {entry.roles.length ? (
                                entry.roles.map((roleName) => (
                                  <ToneBadge key={roleName}>
                                    {formatRoleLabel(roleName)}
                                  </ToneBadge>
                                ))
                              ) : (
                                <ToneBadge tone="warning">
                                  Assign a role to finish setup
                                </ToneBadge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {formatMemberLine(entry.member)}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {entry.member ? (
                              <ToneBadge tone="success">
                                <Link2 className="h-3.5 w-3.5" />
                                Linked
                              </ToneBadge>
                            ) : (
                              <ToneBadge tone="warning">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Member link missing
                              </ToneBadge>
                            )}
                            {entry.must_change_password && (
                              <ToneBadge tone="warning">
                                <KeyRound className="h-3.5 w-3.5" />
                                Password reset pending
                              </ToneBadge>
                            )}
                          </div>
                          {attention.length > 0 && (
                            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                              {attention.slice(0, 2).join(" • ")}
                              {attention.length > 2 ? " • more…" : ""}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-start gap-3 lg:items-end">
                          <div className="space-y-1 text-sm text-slate-500 dark:text-slate-400 lg:text-right">
                            <div className="font-medium text-slate-800 dark:text-slate-100">
                              {entry.last_login_at
                                ? formatRelativeTime(entry.last_login_at)
                                : "Never signed in"}
                            </div>
                            <div>Created {formatDateTime(entry.created_at)}</div>
                          </div>
                          <div className="flex flex-wrap gap-2 lg:justify-end">
                            <ToneBadge tone={getUserLifecycleTone(entry)}>
                              {formatUserLifecycleLabel(entry)}
                            </ToneBadge>
                            <Button
                              variant="ghost"
                              className="rounded-full"
                              onClick={(event) => {
                                event.stopPropagation();
                                openUserWorkspace(entry.id);
                              }}
                            >
                              View
                              <ArrowUpRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                    <Users className="h-6 w-6 text-slate-400" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-slate-950 dark:text-white">
                    No users match this view
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Reset the filters or create a new account. This view stays focused on the
                    exact queue you are working through.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDraftSearch("");
                        updateParams({
                          q: undefined,
                          role: undefined,
                          status: undefined,
                          linked: undefined,
                          surface: undefined,
                          focus: undefined,
                        });
                      }}
                    >
                      Clear filters
                    </Button>
                    <Button
                      onClick={() => {
                        resetInviteForm();
                        setInviteOpen(true);
                      }}
                    >
                      <UserPlus className="h-4 w-4" />
                      Create user
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-24 rounded-[26px] border border-slate-200/80 bg-white/92 p-5 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
            {selectedPreview ? (
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <UserAvatar
                    user={selectedPreview}
                    className="h-16 w-16 rounded-[22px] text-base"
                  />
                  <div className="min-w-0 space-y-2">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                        {getUserDisplayName(selectedPreview)}
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {selectedPreview.email}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ToneBadge tone={getUserLifecycleTone(selectedPreview)}>
                        {formatUserLifecycleLabel(selectedPreview)}
                      </ToneBadge>
                      {selectedPreview.must_change_password && (
                        <ToneBadge tone="warning">Password change required</ToneBadge>
                      )}
                      {selectedPreview.is_super_admin && (
                        <ToneBadge tone="info">Global access</ToneBadge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Last sign-in
                    </p>
                    <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
                      {selectedPreview.last_login_at
                        ? formatRelativeTime(selectedPreview.last_login_at)
                        : "Never signed in"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(selectedPreview.last_login_at, "No sign-in recorded")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Member link
                    </p>
                    <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
                      {selectedPreview.member
                        ? `${selectedPreview.member.first_name} ${selectedPreview.member.last_name}`
                        : "Not linked"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {selectedPreview.member
                        ? `Member ID ${selectedPreview.member.id}`
                        : "Linking keeps audit and communication history aligned."}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Attention queue
                    </p>
                    <ToneBadge tone="warning">
                      {getAttentionReasons(selectedPreview).length}
                    </ToneBadge>
                  </div>
                  {getAttentionReasons(selectedPreview).length ? (
                    <div className="space-y-2">
                      {getAttentionReasons(selectedPreview).map((reason) => (
                        <div
                          key={reason}
                          className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                        >
                          {reason}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                      This account is fully set up and does not have any immediate follow-up items.
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                    Roles
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedPreview.roles.length ? (
                      selectedPreview.roles.map((roleName) => (
                        <ToneBadge key={roleName}>{formatRoleLabel(roleName)}</ToneBadge>
                      ))
                    ) : (
                      <ToneBadge tone="danger">No roles assigned</ToneBadge>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <Button onClick={() => openUserWorkspace(selectedPreview.id)}>
                    Open full workspace
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => openUserWorkspace(selectedPreview.id, "member")}
                  >
                    Review member link
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => navigate("/admin/users/roles")}
                  >
                    Manage roles
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                  <Sparkles className="h-6 w-6 text-slate-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                    User preview
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Select a user from the directory to inspect access health, member link status,
                    and the fastest next action.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </section>

      <AnimatePresence>
        {inviteOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm"
              onClick={closeInvite}
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[760px] flex-col border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <UserPlus className="h-3.5 w-3.5" />
                    {provisionResult ? "Account created" : "Create account"}
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                      {provisionResult
                        ? "Temporary access is ready."
                        : "Create a clean account in one pass."}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      {provisionResult
                        ? "Share the temporary password only if email delivery was not accepted."
                        : "Identity, access, and member link are grouped here so nothing important gets missed."}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" className="rounded-full" onClick={closeInvite}>
                  <X className="h-4 w-4" />
                  Close
                </Button>
              </div>

              {provisionResult ? (
                <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                  <div
                    className={cn(
                      "rounded-[26px] border p-5",
                      provisionResult.email_sent
                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                        : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {provisionResult.email_sent ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-300" />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">
                          {provisionResult.email_sent
                            ? "The welcome email was accepted by the mail server."
                            : "The account was created, but the email server did not accept the message."}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {provisionResult.email_sent
                            ? "The user can sign in with the temporary password below and will be forced to create a personal password."
                            : "Use the temporary password below to deliver access manually."}
                        </p>
                        {provisionResult.email_delivery.warning && (
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            {provisionResult.email_delivery.warning}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Email
                      </p>
                      <p className="mt-3 text-base font-semibold text-slate-950 dark:text-white">
                        {provisionResult.user.email}
                      </p>
                    </Card>
                    <Card className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Username
                      </p>
                      <p className="mt-3 text-base font-semibold text-slate-950 dark:text-white">
                        {provisionResult.user.username}
                      </p>
                    </Card>
                    <Card className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Temporary password
                      </p>
                      <p className="mt-3 break-all font-mono text-base font-semibold text-slate-950 dark:text-white">
                        {provisionResult.temporary_password}
                      </p>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        This password disappears as soon as the user completes the required password change.
                      </p>
                    </Card>
                    <Card className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Login URL in email
                      </p>
                      <p className="mt-3 break-all text-sm text-slate-700 dark:text-slate-200">
                        {provisionResult.email_delivery.login_url || "Not available"}
                      </p>
                      <div className="mt-3">
                        <ToneBadge
                          tone={
                            provisionResult.email_delivery.login_url_public
                              ? "success"
                              : "warning"
                          }
                        >
                          {provisionResult.email_delivery.login_url_public
                            ? "Publicly reachable"
                            : "Local or private URL"}
                        </ToneBadge>
                      </div>
                    </Card>
                  </div>
                </div>
              ) : (
                <form
                  className="flex-1 overflow-y-auto px-6 py-6"
                  onSubmit={handleInviteSubmit}
                >
                  <div className="grid gap-5">
                    <Card className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            1. Identity
                          </p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                            Sign-in basics
                          </h3>
                        </div>
                        <ToneBadge tone="info">Required first</ToneBadge>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            Email
                          </label>
                          <Input
                            type="email"
                            required
                            autoComplete="email"
                            className={cn(
                              "h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950",
                              inviteErrors.email && "border-rose-300 dark:border-rose-500/50",
                            )}
                            value={invitePayload.email}
                            onChange={(event) =>
                              setInvitePayload((previous) => ({
                                ...previous,
                                email: event.target.value,
                              }))
                            }
                            placeholder="name@example.com"
                          />
                          {inviteErrors.email && (
                            <p className="text-sm text-rose-600 dark:text-rose-300">
                              {inviteErrors.email}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            First name
                          </label>
                          <Input
                            autoComplete="given-name"
                            className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
                            value={inviteFirstName}
                            onChange={(event) => setInviteFirstName(event.target.value)}
                            placeholder="Optional"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            Last name
                          </label>
                          <Input
                            autoComplete="family-name"
                            className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
                            value={inviteLastName}
                            onChange={(event) => setInviteLastName(event.target.value)}
                            placeholder="Optional"
                          />
                        </div>

                        {inviteErrors.name && (
                          <p className="md:col-span-2 text-sm text-rose-600 dark:text-rose-300">
                            {inviteErrors.name}
                          </p>
                        )}

                        <div className="space-y-2 md:col-span-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            Username
                          </label>
                          <Input
                            className={cn(
                              "h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950",
                              inviteErrors.username && "border-rose-300 dark:border-rose-500/50",
                            )}
                            value={invitePayload.username ?? ""}
                            onChange={(event) =>
                              setInvitePayload((previous) => ({
                                ...previous,
                                username: event.target.value.toLowerCase(),
                              }))
                            }
                            placeholder="Auto-generate if empty"
                          />
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Leave blank to let the system generate it from the email.
                          </p>
                          {inviteErrors.username && (
                            <p className="text-sm text-rose-600 dark:text-rose-300">
                              {inviteErrors.username}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>

                    <Card className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            2. Access
                          </p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                            Roles and welcome note
                          </h3>
                        </div>
                        <ToneBadge>
                          {(invitePayload.roles ?? []).length} selected
                        </ToneBadge>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {inviteRoleOptions.map((option) => {
                          const selected = invitePayload.roles?.includes(option) ?? false;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => toggleRole(option)}
                              className={cn(
                                "rounded-full border px-4 py-2 text-sm font-medium transition",
                                selected
                                  ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900",
                              )}
                            >
                              {formatRoleLabel(option)}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-5 space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                          Welcome note
                        </label>
                        <Textarea
                          rows={4}
                          className="rounded-[22px] border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
                          value={invitePayload.message ?? ""}
                          onChange={(event) =>
                            setInvitePayload((previous) => ({
                              ...previous,
                              message: event.target.value,
                            }))
                          }
                          placeholder="Optional note that will appear in the welcome email"
                        />
                      </div>
                    </Card>

                    <Card className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            3. Member link
                          </p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                            Keep staff identity aligned with parish data
                          </h3>
                        </div>
                        {selectedInviteMember ? (
                          <ToneBadge tone="success">Selected</ToneBadge>
                        ) : (
                          <ToneBadge>Optional</ToneBadge>
                        )}
                      </div>

                      <div className="mt-5 space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                          Search member
                        </label>
                        <Input
                          className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
                          value={memberSearchTerm}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setMemberSearchTerm(nextValue);
                            if (
                              selectedInviteMember &&
                              nextValue.trim() !==
                              `${selectedInviteMember.first_name} ${selectedInviteMember.last_name}`
                            ) {
                              setSelectedInviteMember(null);
                            }
                          }}
                          placeholder="Name, email, or phone"
                        />
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Linking now avoids duplicate identities later in audit and communication flows, and it can also pull the member's saved details into this user form.
                        </p>
                      </div>

                      {selectedInviteMember && (
                        <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-slate-950 dark:text-white">
                                {selectedInviteMember.first_name} {selectedInviteMember.last_name}
                              </p>
                              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                ID {selectedInviteMember.id}
                                {selectedInviteMember.status
                                  ? ` • ${selectedInviteMember.status}`
                                  : ""}
                                {selectedInviteMember.email
                                  ? ` • ${selectedInviteMember.email}`
                                  : ""}
                              </p>
                              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                You can pull the member's email, name, and username into the account form before creating the user.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                className="rounded-full"
                                onClick={() => applyInviteMemberDetails(selectedInviteMember)}
                              >
                                Fetch details
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="rounded-full"
                                onClick={() => {
                                  setSelectedInviteMember(null);
                                  setMemberSearchTerm("");
                                }}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {inviteErrors.member && (
                        <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">
                          {inviteErrors.member}
                        </p>
                      )}

                      {memberSearchTerm.trim().length >= 2 &&
                        (!selectedInviteMember ||
                          memberSearchTerm.trim() !==
                          `${selectedInviteMember.first_name} ${selectedInviteMember.last_name}`) && (
                          <div className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 dark:border-slate-800">
                            {memberSearching ? (
                              <div className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                                Searching members…
                              </div>
                            ) : memberResults.length ? (
                              memberResults.map((member) => {
                                const disabled = Boolean(member.linked_user_id);
                                return (
                                  <button
                                    key={member.id}
                                    type="button"
                                    onClick={() => handleSelectInviteMember(member)}
                                    disabled={disabled}
                                    className={cn(
                                      "w-full border-b border-slate-200 px-4 py-3 text-left last:border-b-0 dark:border-slate-800",
                                      disabled
                                        ? "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-900/60 dark:text-slate-500"
                                        : "bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900",
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
                                      {disabled && (
                                        <ToneBadge tone="warning">
                                          Linked to {member.linked_username ?? "another user"}
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
                    </Card>
                  </div>

                  <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/95 px-1 pb-1 pt-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      The user will be required to set a personal password on first successful sign-in.
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button variant="ghost" onClick={closeInvite}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={!canSubmitInvite}>
                        {inviteSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Creating…
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Create account
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              )}

              {provisionResult && (
                <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-800">
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button variant="ghost" onClick={resetInviteForm}>
                      Create another
                    </Button>
                    <Button
                      onClick={() => {
                        const userId = provisionResult.user.id;
                        setInviteOpen(false);
                        resetInviteForm();
                        openUserWorkspace(userId);
                      }}
                    >
                      Open workspace
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
