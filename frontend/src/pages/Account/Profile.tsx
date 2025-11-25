import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { Card, Input, Button, Textarea, Badge } from "@/components/ui";
import {
  AccountProfile as AccountProfileType,
  AccountMemberSummary,
  getAccountProfile,
  updateAccountProfile,
  updateAccountPassword,
  requestAccountMemberLink,
  searchAccountMembers,
  ApiError,
} from "@/lib/api";
import { useToast } from "@/components/Toast";

export default function AccountProfile() {
  const { refresh, user } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<AccountProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingMemberLink, setSavingMemberLink] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [memberNotes, setMemberNotes] = useState("");
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [memberResults, setMemberResults] = useState<AccountMemberSummary[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [memberIdWarning, setMemberIdWarning] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const parseErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      if (error.body) {
        try {
          const parsed = JSON.parse(error.body);
          if (typeof parsed?.detail === "string") {
            return parsed.detail;
          }
        } catch {
          if (error.body.trim()) {
            return error.body;
          }
        }
      }
      return fallback;
    }
    if (error instanceof Error) {
      return error.message || fallback;
    }
    return fallback;
  }, []);

  const loadProfile = useCallback(() => {
    setLoading(true);
    getAccountProfile()
      .then((data) => {
        setProfile(data);
        setFullName(data.full_name ?? "");
        setUsername(data.username);
        setMemberInput(data.member ? String(data.member.id) : "");
        setMemberSearchTerm(data.member ? `${data.member.first_name} ${data.member.last_name}` : "");
      })
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load account profile");
      })
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const trimmed = memberInput.trim();
    if (!trimmed) {
      setMemberIdWarning(null);
      return;
    }
    setMemberIdWarning(Number.isNaN(Number(trimmed)) ? "Member ID must be numeric" : null);
  }, [memberInput]);

  useEffect(() => {
    const term = memberSearchTerm.trim();
    if (!term || term.length < 2) {
      setMemberResults([]);
      setMemberSearching(false);
      return;
    }
    const handle = setTimeout(() => {
      setMemberSearching(true);
      searchAccountMembers(term, 6)
        .then((results) => setMemberResults(results))
        .catch((error) => {
          console.error(error);
          toast.push("Unable to search members");
        })
        .finally(() => setMemberSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [memberSearchTerm, toast]);

  const handleSelectMemberSuggestion = (member: AccountMemberSummary) => {
    setMemberInput(String(member.id));
    setMemberSearchTerm(`${member.first_name} ${member.last_name}`);
    setMemberResults([]);
    setMemberIdWarning(null);
  };

  const linkedMemberLabel = useMemo(() => {
    if (!profile?.member) {
      return "Not linked";
    }
    return `${profile.member.first_name} ${profile.member.last_name} (ID ${profile.member.id})`;
  }, [profile]);

  const linkedMemberContact = useMemo(() => {
    if (!profile?.member) {
      return null;
    }
    const parts = [profile.member.email, profile.member.phone].filter(Boolean);
    return parts.length ? parts.join(" • ") : null;
  }, [profile]);

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError(null);
    setSavingProfile(true);
    try {
      await updateAccountProfile({ full_name: fullName, username });
      toast.push("Profile updated");
      await refresh();
      loadProfile();
    } catch (error) {
      console.error(error);
      setProfileError(parseErrorMessage(error, "Failed to update profile"));
    } finally {
      setSavingProfile(false);
    }
  };

  const passwordChecks = useMemo(
    () => [
      { label: "At least 12 characters", satisfied: newPassword.length >= 12 },
      { label: "Contains an uppercase letter", satisfied: /[A-Z]/.test(newPassword) },
      { label: "Contains a lowercase letter", satisfied: /[a-z]/.test(newPassword) },
      { label: "Contains a digit", satisfied: /[0-9]/.test(newPassword) },
      { label: "Contains a symbol", satisfied: /[!@#$%^&*()_+\-={}[\]:\";'<>?,./\\]/.test(newPassword) },
    ],
    [newPassword]
  );

  const allPasswordChecksPassed = useMemo(() => passwordChecks.every((check) => check.satisfied), [passwordChecks]);
  const passwordsMatch = useMemo(
    () => newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword,
    [newPassword, confirmPassword]
  );

  const handlePasswordSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    if (!allPasswordChecksPassed) {
      setPasswordError("Meet every password requirement before saving.");
      return;
    }
    if (!passwordsMatch) {
      setPasswordError("Passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      await updateAccountPassword({ current_password: currentPassword, new_password: newPassword });
      toast.push("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error(error);
      setPasswordError(parseErrorMessage(error, "Unable to update password"));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleMemberLinkRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMemberError(null);
    const trimmed = memberInput.trim();
    const payload =
      trimmed.length === 0
        ? { member_id: null, notes: memberNotes || undefined }
        : {
          member_id: Number(trimmed),
          notes: memberNotes || undefined,
        };
    if (payload.member_id !== null && Number.isNaN(payload.member_id)) {
      setMemberError("Enter a numeric member ID");
      return;
    }
    setSavingMemberLink(true);
    try {
      await requestAccountMemberLink(payload);
      toast.push("Request submitted");
      setMemberNotes("");
      if (!trimmed.length) {
        setMemberSearchTerm("");
        setMemberResults([]);
      }
      loadProfile();
    } catch (error) {
      console.error(error);
      setMemberError(parseErrorMessage(error, "Unable to submit request"));
    } finally {
      setSavingMemberLink(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-mute">Loading profile…</div>;
  }

  if (!profile) {
    return <div className="text-sm text-mute">Unable to load account.</div>;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="p-6 space-y-5 rounded-2xl shadow-soft bg-slate-50 text-slate-900 border border-slate-200 dark:bg-black dark:text-slate-100 dark:border-slate-800">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">Profile</h2>
              <p className="text-sm text-mute">Your name and username appear on approvals, audit logs, and invitations.</p>
            </div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleProfileSave}>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-mute">Full name</label>
                <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-mute">Username</label>
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value.toLowerCase())}
                  disabled={!profile.can_change_username}
                />
                {!profile.can_change_username && profile.next_username_change_at && (
                  <p className="text-xs text-amber-600">
                    Next change window opens {new Date(profile.next_username_change_at).toLocaleDateString()}.
                  </p>
                )}
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? "Saving…" : "Save changes"}
                </Button>
              </div>
              {profileError && (
                <div className="md:col-span-2">
                  <p className="text-xs text-red-500">{profileError}</p>
                </div>
              )}
            </form>
          </Card>

      <Card className="p-6 space-y-5 rounded-2xl shadow-soft bg-slate-50 text-slate-900 border border-slate-200 dark:bg-black dark:text-slate-100 dark:border-slate-800">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">Password</h2>
              <p className="text-sm text-mute">Use at least 12 characters with upper/lowercase, a number, and a symbol.</p>
            </div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handlePasswordSave}>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs uppercase tracking-wide text-mute">Current password</label>
                <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-mute">New password</label>
                <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-mute">Confirm password</label>
                <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
              </div>
              <div className="md:col-span-2 grid gap-2 rounded-2xl border border-border/60 bg-muted/20 p-4">
                {passwordChecks.map((check) => (
                  <div
                    key={check.label}
                    className={`flex items-center gap-3 text-sm transition-colors ${check.satisfied ? "text-emerald-600" : "text-slate-500"}`}
                  >
                    <span
                      className={`h-6 w-6 rounded-full border flex items-center justify-center transition-colors ${check.satisfied ? "border-emerald-500 bg-emerald-500/10" : "border-slate-300"
                        }`}
                    >
                      {check.satisfied ? <Check size={14} /> : <X size={14} />}
                    </span>
                    {check.label}
                  </div>
                ))}
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={savingPassword}>
                  {savingPassword ? "Updating…" : "Update password"}
                </Button>
              </div>
              <div className="md:col-span-2 space-y-1">
                {!passwordsMatch && confirmPassword.length > 0 && (
                  <p className="text-xs text-red-500">Passwords must match.</p>
                )}
                {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
              </div>
            </form>
          </Card>
        </div>

        <Card className="p-6 rounded-2xl shadow-soft bg-slate-50 text-slate-900 border border-slate-200 dark:bg-black dark:text-slate-100 dark:border-slate-800 space-y-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">Member link</h2>
            <p className="text-sm text-mute">
              Linking ensures your user activity ties back to a specific parish record. Leave the field empty to request unlinking.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-medium">{linkedMemberLabel}</p>
            {profile.member?.status && <p className="text-xs text-mute">Status: {profile.member.status}</p>}
            {linkedMemberContact && <p className="text-xs text-mute">{linkedMemberContact}</p>}
          </div>
          <form className="space-y-4" onSubmit={handleMemberLinkRequest}>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-mute">Find your record</label>
              <Input
                value={memberSearchTerm}
                onChange={(event) => setMemberSearchTerm(event.target.value)}
                placeholder="Start typing a name, email, or phone number"
              />
              {memberSearchTerm && (
                <div className="rounded-2xl border border-slate-200 bg-white text-sm max-h-56 overflow-y-auto dark:border-slate-700 dark:bg-slate-900">
                  {memberSearching ? (
                    <p className="px-3 py-2 text-mute">Searching…</p>
                  ) : memberResults.length ? (
                    memberResults.map((member) => (
                      <button
                        type="button"
                        key={member.id}
                        onClick={() => handleSelectMemberSuggestion(member)}
                        className={`w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 ${memberInput === String(member.id) ? "bg-emerald-50 dark:bg-emerald-500/10" : ""
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{member.first_name} {member.last_name}</span>
                          <span className="text-xs text-mute">ID {member.id}</span>
                        </div>
                        <div className="text-xs text-mute">
                          {member.status && <span>{member.status}</span>}
                          {member.email && <span> • {member.email}</span>}
                          {member.phone && <span> • {member.phone}</span>}
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-mute">No matches yet.</p>
                  )}
                </div>
              )}
              <p className="text-xs text-mute">Selecting a record fills the member ID below. Super Admins review every request.</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-mute">Selected member ID</label>
              <div className="flex items-center gap-2">
                <Input value={memberInput} onChange={(event) => setMemberInput(event.target.value)} placeholder="e.g., 42" />
                {memberInput && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMemberInput("");
                      setMemberSearchTerm("");
                      setMemberResults([]);
                      setMemberIdWarning(null);
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {memberIdWarning && <p className="text-xs text-red-500">{memberIdWarning}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-mute">Notes</label>
              <Textarea
                value={memberNotes}
                onChange={(event) => setMemberNotes(event.target.value)}
                placeholder="Add context (e.g., “I am PR Admin assigned to Bekele Desta”)"
                maxLength={255}
                rows={3}
              />
              <p className="text-[11px] text-mute text-right">{memberNotes.length}/255</p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingMemberLink}>
                {savingMemberLink ? "Submitting…" : profile.member ? "Request update" : "Request link"}
              </Button>
            </div>
            {(memberError || memberIdWarning) && <p className="text-xs text-red-500">{memberError || memberIdWarning}</p>}
          </form>
        </Card>
      </div>
    </div>
  );
}
