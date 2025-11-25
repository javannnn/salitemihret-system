import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus } from "lucide-react";
import { Button, Card, Input, Select, Textarea, Badge } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import {
  listAdminUsers,
  AdminUserListResponse,
  createUserInvitation,
  InvitationCreatePayload,
  searchAdminMembers,
  AdminUserMemberSummary,
} from "@/lib/api";
import { useToast } from "@/components/Toast";
import { ROLE_OPTIONS, ROLE_LABELS } from "@/lib/roles";

type StatusFilter = "any" | "active" | "inactive";
type LinkedFilter = "any" | "linked" | "unlinked";

const roleOptions = [...ROLE_OPTIONS].sort((a, b) => (ROLE_LABELS[a] || a).localeCompare(ROLE_LABELS[b] || b));

export default function UsersList() {
  const [data, setData] = useState<AdminUserListResponse | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("any");
  const [linkedFilter, setLinkedFilter] = useState<LinkedFilter>("any");
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePayload, setInvitePayload] = useState<InvitationCreatePayload>({ email: "", full_name: "", username: "", roles: [] });
  const [inviteMemberId, setInviteMemberId] = useState("");
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [memberResults, setMemberResults] = useState<AdminUserMemberSummary[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.is_super_admin ?? false;

  const summaryCards = useMemo(
    () => [
      { label: "Active", value: data?.total_active ?? 0, accent: "text-emerald-600 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-slate-900/70" },
      { label: "Inactive", value: data?.total_inactive ?? 0, accent: "text-amber-600 dark:text-amber-300", bg: "bg-amber-50 dark:bg-slate-900/70" },
      { label: "Linked", value: data?.total_linked ?? 0, accent: "text-blue-600 dark:text-blue-300", bg: "bg-blue-50 dark:bg-slate-900/70" },
      { label: "Unlinked", value: data?.total_unlinked ?? 0, accent: "text-slate-600 dark:text-slate-200", bg: "bg-slate-100 dark:bg-slate-900/70" },
    ],
    [data]
  );

  const loadUsers = useCallback(() => {
    if (!isSuperAdmin) {
      return;
    }
    setLoading(true);
    listAdminUsers({
      search: search.trim() || undefined,
      role: role || undefined,
      is_active: statusFilter === "any" ? undefined : statusFilter === "active",
      linked: linkedFilter === "any" ? undefined : linkedFilter === "linked",
    })
      .then((response) => setData(response))
      .catch((error) => {
        console.error(error);
        toast.push("Failed to load users");
      })
      .finally(() => setLoading(false));
  }, [isSuperAdmin, search, role, statusFilter, linkedFilter, toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, refreshKey]);

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
    const handle = setTimeout(() => {
      setMemberSearching(true);
      searchAdminMembers(term, 6)
        .then((results) => setMemberResults(results))
        .catch((error) => {
          console.error(error);
          toast.push("Unable to search members");
        })
        .finally(() => setMemberSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [inviteOpen, memberSearchTerm, toast]);

  const resetInviteForm = () => {
    setInvitePayload({ email: "", full_name: "", username: "", roles: [] });
    setInviteMemberId("");
    setMemberSearchTerm("");
    setMemberResults([]);
  };

  const handleInviteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invitePayload.email.trim()) {
      toast.push("Email is required");
      return;
    }
    const trimmedMemberId = inviteMemberId.trim();
    let memberId: number | undefined;
    if (trimmedMemberId) {
      const parsed = Number(trimmedMemberId);
      if (Number.isNaN(parsed)) {
        toast.push("Member ID must be numeric");
        return;
      }
      memberId = parsed;
    }
    setInviteSubmitting(true);
    try {
      const response = await createUserInvitation({
        ...invitePayload,
        member_id: memberId,
        roles: invitePayload.roles,
      });
      toast.push(`Invite created for ${response.email}`);
      setInviteOpen(false);
      resetInviteForm();
      setRefreshKey((key) => key + 1);
    } catch (error) {
      console.error(error);
      toast.push("Failed to create invitation");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const toggleRole = (roleName: string) => {
    setInvitePayload((prev) => {
      const exists = prev.roles?.includes(roleName);
      return {
        ...prev,
        roles: exists ? prev.roles?.filter((role) => role !== roleName) ?? [] : [...(prev.roles ?? []), roleName],
      };
    });
  };

  const handleSelectInviteMember = (member: AdminUserMemberSummary) => {
    if (member.linked_user_id) {
      toast.push(`Already linked to ${member.linked_username ?? "another user"}`);
      return;
    }
    setInviteMemberId(String(member.id));
    setMemberSearchTerm(`${member.first_name} ${member.last_name}`);
    setMemberResults([]);
  };

  if (!isSuperAdmin) {
    return <div className="text-sm text-mute">Super Admin access required.</div>;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border bg-slate-50 p-6 shadow-soft text-ink dark:bg-black dark:border-slate-800 dark:text-white">
        <div className="flex flex-wrap items-center gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Security Console</p>
            <h1 className="text-3xl font-semibold text-ink dark:text-white">User Management</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Provision identities, invite new administrators, and keep role assignments and member links disciplined. Every change is audited.
            </p>
          </div>
          <div className="ms-auto flex flex-wrap gap-3">
            <Button variant="outline" className="border-slate-200 bg-white/90 text-ink hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white" onClick={() => loadUsers()}>
              Refresh
            </Button>
            <Button className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900" onClick={() => setInviteOpen(true)}>
              <Plus size={16} className="mr-2" />
              Invite user
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className={`p-4 border border-border/60 ${card.bg}`}>
            <p className="text-xs uppercase text-mute">{card.label}</p>
            <div className="mt-2 text-2xl font-semibold">
              <span className={card.accent}>{card.value}</span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5 space-y-3 rounded-2xl border border-border/70 bg-white dark:bg-slate-900 dark:border-slate-800">
        <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-mute">Search</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, or username"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-mute">Role</label>
            <Select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">All roles</option>
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option] || option}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-mute">Status</label>
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="any">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-mute">Member link</label>
            <Select value={linkedFilter} onChange={(event) => setLinkedFilter(event.target.value as LinkedFilter)}>
              <option value="any">All users</option>
              <option value="linked">Linked</option>
              <option value="unlinked">Not linked</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-0 rounded-2xl border border-border overflow-hidden bg-white/95 dark:bg-slate-900/80">
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-mute">Loading users…</div>
        ) : data?.items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-mute dark:bg-slate-800/60 dark:text-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">User</th>
                  <th className="px-5 py-3 text-left">Roles</th>
                  <th className="px-5 py-3 text-left">Member</th>
                  <th className="px-5 py-3 text-left">Last login</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => {
                  const lastLogin = user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never";
                  return (
                    <tr key={user.id} className="border-t border-border/70 dark:border-slate-800">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-ink dark:text-white">{user.full_name || user.username}</div>
                        <div className="text-xs text-mute">
                          {user.username} · {user.email}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {user.roles.length ? (
                            user.roles.map((roleName) => (
                              <Badge key={roleName} variant="outline" className="rounded-full border-border/70 text-xs">
                                {ROLE_LABELS[roleName] || roleName}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-mute">No roles</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs text-mute">
                        {user.member ? (
                          <div>
                            <div className="font-medium text-sm text-ink dark:text-white">
                              {user.member.first_name} {user.member.last_name}
                            </div>
                            <div>ID {user.member.id}{user.member.status && ` • ${user.member.status}`}</div>
                            {(user.member.email || user.member.phone) && (
                              <div>
                                {user.member.email}
                                {user.member.phone && <> • {user.member.phone}</>}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span>Not linked</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-mute">{lastLogin}</td>
                      <td className="px-5 py-4">
                        <Badge className={`rounded-full ${user.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                        {user.is_super_admin && <p className="text-[11px] text-mute mt-1">Super Admin</p>}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/users/${user.id}`)}>
                          View profile
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-sm text-mute">No users found.</div>
        )}
      </Card>
      {inviteOpen && (
        <Fragment>
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40" onClick={() => { setInviteOpen(false); resetInviteForm(); }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl bg-white/95 dark:bg-slate-900/95 border border-border/70">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
                <div>
                  <h2 className="text-lg font-semibold">Invite user</h2>
                  <p className="text-sm text-mute">Send an email invite to create an account.</p>
                </div>
                <Button variant="ghost" onClick={() => { setInviteOpen(false); resetInviteForm(); }}>
                  Close
                </Button>
              </div>
              <form className="space-y-4 overflow-y-auto px-6 py-4 max-h-[70vh]" onSubmit={handleInviteSubmit}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase text-mute">Email</label>
                    <Input
                      type="email"
                      required
                      value={invitePayload.email}
                      onChange={(event) => setInvitePayload((prev) => ({ ...prev, email: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute">Full name</label>
                    <Input
                      value={invitePayload.full_name ?? ""}
                      onChange={(event) => setInvitePayload((prev) => ({ ...prev, full_name: event.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute">Username</label>
                    <Input
                      value={invitePayload.username ?? ""}
                      onChange={(event) => setInvitePayload((prev) => ({ ...prev, username: event.target.value.toLowerCase() }))}
                      placeholder="Auto-generate if empty"
                    />
                    <p className="text-xs text-mute mt-1">Only lowercase letters, numbers, dots, underscores.</p>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute">Message</label>
                    <Textarea
                      value={invitePayload.message ?? ""}
                      onChange={(event) => setInvitePayload((prev) => ({ ...prev, message: event.target.value }))}
                      placeholder="Optional note to include"
                    />
                  </div>
                </div>
              <div>
                <label className="text-xs uppercase text-mute">Roles</label>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((option) => (
                    <label key={option} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={invitePayload.roles?.includes(option) ?? false}
                        onChange={() => toggleRole(option)}
                      />
                      {ROLE_LABELS[option] || option}
                    </label>
                  ))}
                </div>
              </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase text-mute">Link to member</label>
                  <Input
                    value={memberSearchTerm}
                    onChange={(event) => setMemberSearchTerm(event.target.value)}
                    placeholder="Search by name, email, or phone"
                  />
                  {memberSearchTerm && (
                    <div className="rounded-xl border border-border bg-card/80 text-left text-sm">
                      {memberSearching ? (
                        <p className="px-3 py-2 text-mute">Searching…</p>
                      ) : memberResults.length ? (
                        memberResults.map((member) => {
                          const disabled = Boolean(member.linked_user_id);
                          return (
                            <button
                              type="button"
                              key={member.id}
                              onClick={() => handleSelectInviteMember(member)}
                              disabled={disabled}
                              className={`w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 ${disabled ? "text-mute cursor-not-allowed" : ""}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-medium">{member.first_name} {member.last_name}</div>
                                <span className="text-xs text-mute">ID {member.id}</span>
                              </div>
                              <div className="text-xs text-mute">
                                {member.status && <span>{member.status}</span>}
                                {member.email && <span> • {member.email}</span>}
                                {member.phone && <span> • {member.phone}</span>}
                              </div>
                              {disabled && (
                                <div className="text-xs text-amber-500">Linked to {member.linked_username ?? "another user"}</div>
                              )}
                            </button>
                          );
                        })
                      ) : (
                        <p className="px-3 py-2 text-mute">No matches</p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      value={inviteMemberId}
                      onChange={(event) => setInviteMemberId(event.target.value)}
                      placeholder="Or paste member ID"
                    />
                    {inviteMemberId && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => {
                          setInviteMemberId("");
                          setMemberSearchTerm("");
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-mute">Selected member ID: {inviteMemberId || "None"}</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setInviteOpen(false); resetInviteForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={inviteSubmitting}>
                    {inviteSubmitting ? "Sending…" : "Send invite"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </Fragment>
      )}
    </div>
  );
}
