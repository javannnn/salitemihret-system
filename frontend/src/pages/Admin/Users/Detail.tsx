import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button, Card, Input, Textarea, Select, Badge } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import {
  getAdminUser,
  AdminUserSummary,
  updateAdminUser,
  updateAdminUserRoles,
  updateAdminUserMemberLink,
  resetAdminUserPassword,
  getAdminUserAudit,
  AdminUserAuditEntry,
  searchAdminMembers,
  AdminUserMemberSummary,
} from "@/lib/api";
import { useToast } from "@/components/Toast";
import { ROLE_OPTIONS, ROLE_LABELS } from "@/lib/roles";

export default function UserDetail() {
  const SUPER_ROLE = "SuperAdmin";
  const { id } = useParams();
  const userId = Number(id);
  const [user, setUser] = useState<AdminUserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [statusValue, setStatusValue] = useState("Active");
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
  const [roleSelection, setRoleSelection] = useState<string[]>([]);
  const toast = useToast();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.is_super_admin ?? false;

  useEffect(() => {
    if (!userId || !isSuperAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getAdminUser(userId)
      .then((data) => {
        setUser(data);
        setFullName(data.full_name ?? "");
        setUsername(data.username);
        setStatusValue(data.is_active ? "Active" : "Inactive");
        setSuperAdmin(data.is_super_admin);
        setMemberInput(data.member ? String(data.member.id) : "");
        setRoleSelection(data.roles);
      })
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load user");
      })
      .finally(() => setLoading(false));
  }, [isSuperAdmin, userId, toast, reloadKey]);

  useEffect(() => {
    if (!userId || !isSuperAdmin) {
      return;
    }
    setAuditLoading(true);
    getAdminUserAudit(userId, 25)
      .then((entries) => setAudit(entries))
      .catch((error) => {
        console.error(error);
        toast.push("Failed to load audit log");
      })
      .finally(() => setAuditLoading(false));
  }, [userId, toast, reloadKey]);

  useEffect(() => {
    if (user) {
      setMemberInput(user.member ? String(user.member.id) : "");
      setMemberSearchTerm(user.member ? `${user.member.first_name} ${user.member.last_name}` : "");
    }
  }, [user]);

  const handleIdentitySave = async () => {
    if (!user) return;
    setSavingIdentity(true);
    try {
      await updateAdminUser(user.id, {
        full_name: fullName,
        username,
        is_active: statusValue === "Active",
        is_super_admin: superAdmin,
      });
      toast.push("User updated");
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error(error);
      toast.push("Failed to update user");
    } finally {
      setSavingIdentity(false);
    }
  };

  useEffect(() => {
    if (user) {
      setRoleSelection(user.roles);
    }
  }, [user]);

  useEffect(() => {
    const hasSuper = roleSelection.includes(SUPER_ROLE);
    setSuperAdmin(hasSuper);
  }, [roleSelection]);

  useEffect(() => {
    setRoleSelection((prev) => {
      const hasSuper = prev.includes(SUPER_ROLE);
      if (superAdmin && !hasSuper) {
        return [...prev, SUPER_ROLE];
      }
      if (!superAdmin && hasSuper) {
        return prev.filter((role) => role !== SUPER_ROLE);
      }
      return prev;
    });
  }, [superAdmin]);

  useEffect(() => {
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
          toast.push("Failed to search members");
        })
        .finally(() => setMemberSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [memberSearchTerm, toast]);

  const handleRolesSave = async () => {
    if (!user) return;
    setSavingRoles(true);
    try {
      await updateAdminUserRoles(user.id, roleSelection);
      toast.push("Roles updated");
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error(error);
      toast.push("Failed to update roles");
    } finally {
      setSavingRoles(false);
    }
  };

  const toggleRole = (roleName: string) => {
    setRoleSelection((prev) => {
      const exists = prev.includes(roleName);
      const next = exists ? prev.filter((role) => role !== roleName) : [...prev, roleName];
      if (roleName === SUPER_ROLE) {
        setSuperAdmin(!exists);
      }
      return next;
    });
  };

  const handleSelectMemberResult = (member: AdminUserMemberSummary) => {
    if (user && member.linked_user_id && member.linked_user_id !== user.id) {
      toast.push(`Linked to ${member.linked_username ?? "another user"}`);
      return;
    }
    setMemberInput(String(member.id));
    setMemberSearchTerm(`${member.first_name} ${member.last_name}`);
    setMemberResults([]);
  };

  const handleMemberLink = async (memberId: number | null) => {
    if (!user) return;
    setSavingMemberLink(true);
    try {
      await updateAdminUserMemberLink(user.id, memberId, memberNotes || undefined);
      toast.push(memberId ? "Member linked" : "Member unlinked");
      setMemberNotes("");
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error(error);
      toast.push("Failed to update member link");
    } finally {
      setSavingMemberLink(false);
    }
  };

  const handleMemberLinkSubmit = () => {
    if (!user) return;
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
    if (!user) return;
    setResettingPassword(true);
    try {
      await resetAdminUserPassword(user.id);
      toast.push("Password reset invite sent");
    } catch (error) {
      console.error(error);
      toast.push("Unable to send reset invite");
    } finally {
      setResettingPassword(false);
    }
  };

  const linkedMemberLabel = useMemo(() => {
    if (!user || !user.member) {
      return "Not linked";
    }
    const pieces = [`${user.member.first_name} ${user.member.last_name}`, `ID ${user.member.id}`];
    if (user.member.status) {
      pieces.push(user.member.status);
    }
    if (user.member.email) {
      pieces.push(user.member.email);
    }
    return pieces.join(" • ");
  }, [user]);

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
      <section className="rounded-3xl border border-border bg-gradient-to-br from-white/95 via-slate-100/90 to-white/90 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950/80 backdrop-blur-xl p-6 shadow-soft text-ink dark:text-white">
        <div className="flex flex-wrap items-center gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">User</p>
            <h1 className="text-3xl font-semibold text-ink dark:text-white">{user.full_name || user.username}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-300">{user.email}</p>
          </div>
          <div className="ms-auto flex flex-wrap gap-2">
            <Badge className={`rounded-full ${user.is_active ? "bg-emerald-400/20 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
              {user.is_active ? "Active" : "Inactive"}
            </Badge>
            {user.is_super_admin && <Badge className="bg-slate-100 text-ink border border-white/40 dark:bg-slate-800 dark:text-white">Super Admin</Badge>}
            <Button variant="outline" className="border-slate-200 bg-white/80 text-ink hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white" onClick={() => navigate(-1)}>
              Back
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {user.roles.map((role) => (
            <Badge key={role} className="bg-white/15 text-white border border-white/20">
              {ROLE_LABELS[role] || role}
            </Badge>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-300">
          <span>Created {new Date(user.created_at).toLocaleString()}</span>
          <span>•</span>
          <span>Last update {new Date(user.updated_at).toLocaleString()}</span>
          <span>•</span>
          <span>Last login {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}</span>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="p-6 space-y-5 rounded-2xl shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Identity & Access</h2>
                <p className="text-sm text-mute">Update core identity fields, activation status, or reset credentials.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleResetPassword} disabled={resettingPassword}>
                  {resettingPassword ? "Sending…" : "Send reset invite"}
                </Button>
                <Button onClick={handleIdentitySave} disabled={savingIdentity}>
                  {savingIdentity ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-mute">Full name</label>
                <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-mute">Username</label>
                <Input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-mute">Status</label>
                <Select value={statusValue} onChange={(event) => setStatusValue(event.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-mute">Super Admin</label>
                <Select value={superAdmin ? "Yes" : "No"} onChange={(event) => setSuperAdmin(event.target.value === "Yes")}>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-5 rounded-2xl shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Role assignments</h2>
                <p className="text-sm text-mute">Toggle module access. Changes apply immediately.</p>
              </div>
              <Button onClick={handleRolesSave} disabled={savingRoles}>
                {savingRoles ? "Saving…" : "Save roles"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => (
                <label key={role} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${roleSelection.includes(role) ? "border-accent bg-accent/10" : "border-border"}`}>
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={roleSelection.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  {ROLE_LABELS[role] || role}
                </label>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-5 rounded-2xl shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Member link</h2>
                <p className="text-sm text-mute">Link this admin identity to a parish member for audits and mail merges.</p>
              </div>
              <div className="flex gap-2">
                {user.member && (
                  <Button variant="ghost" disabled={savingMemberLink} onClick={() => handleMemberLink(null)}>
                    Unlink
                  </Button>
                )}
                <Button onClick={handleMemberLinkSubmit} disabled={savingMemberLink}>
                  {savingMemberLink ? "Saving…" : user.member ? "Update link" : "Link member"}
                </Button>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-1 text-sm">
              <p className="font-medium text-ink dark:text-white">{linkedMemberLabel}</p>
              {!user.member && <p className="text-xs text-mute">Not linked yet</p>}
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-mute">Search member</label>
              <Input
                value={memberSearchTerm}
                onChange={(event) => setMemberSearchTerm(event.target.value)}
                placeholder="Name, email, or phone"
              />
              {memberSearchTerm && (
                <div className="rounded-2xl border border-border bg-card/80 text-sm max-h-60 overflow-y-auto">
                  {memberSearching ? (
                    <p className="px-3 py-2 text-mute">Searching…</p>
                  ) : memberResults.length ? (
                    memberResults.map((member) => {
                      const disabled = Boolean(member.linked_user_id && member.linked_user_id !== user?.id);
                      const isCurrent = user?.member?.id === member.id;
                      return (
                        <button
                          type="button"
                          key={member.id}
                          onClick={() => handleSelectMemberResult(member)}
                          disabled={disabled}
                          className={`w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                            disabled ? "text-mute cursor-not-allowed" : ""
                          } ${isCurrent ? "bg-emerald-50 dark:bg-emerald-500/10" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">{member.first_name} {member.last_name}</div>
                            <span className="text-xs text-mute">ID {member.id}</span>
                          </div>
                          <div className="text-xs text-mute">
                            {member.status && <span>{member.status}</span>}
                            {member.email && <span> • {member.email}</span>}
                            {member.phone && <span> • {member.phone}</span>}
                          </div>
                          {member.linked_user_id && (
                            <div className={`text-xs ${disabled ? "text-amber-500" : "text-emerald-600"}`}>
                              {member.linked_user_id === user?.id ? "Linked to this user" : `Linked to ${member.linked_username ?? "another user"}`}
                            </div>
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <p className="px-3 py-2 text-mute">No matches</p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-mute">Member ID</label>
              <div className="flex items-center gap-2">
                <Input value={memberInput} onChange={(event) => setMemberInput(event.target.value)} placeholder="Enter member ID" />
                {memberInput && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMemberInput("");
                      setMemberSearchTerm("");
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-mute">Notes</label>
              <Textarea value={memberNotes} onChange={(event) => setMemberNotes(event.target.value)} placeholder="Optional note" />
            </div>
          </Card>

          <Card className="p-6 space-y-4 rounded-2xl shadow-soft">
            <h2 className="text-base font-semibold">Audit log</h2>
            {auditLoading ? (
              <p className="text-sm text-mute">Loading audit…</p>
            ) : audit.length ? (
              <ul className="space-y-2 text-sm max-h-80 overflow-y-auto pr-1">
                {audit.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-border bg-card/70 p-3 space-y-1">
                    <div className="flex items-center justify-between text-xs text-mute">
                      <span>{new Date(entry.created_at).toLocaleString()}</span>
                      <span>{entry.actor_email || entry.actor_name || "System"}</span>
                    </div>
                    <div className="font-medium">{entry.action}</div>
                    {entry.payload && Object.keys(entry.payload).length > 0 && (
                      <pre className="text-xs mt-1 text-mute bg-card/80 rounded-lg p-2 overflow-x-auto">
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-mute">No audit entries yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
