import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Input, Select, Textarea, Button, Badge } from "@/components/ui";
import {
  API_BASE,
  MemberAuditEntry,
  MemberDetail,
  MemberStatus,
  api,
  getMemberAudit,
  uploadAvatar,
} from "@/lib/api";
import { useToast } from "@/components/Toast";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Trash2 } from "lucide-react";

const STATUS_OPTIONS: MemberStatus[] = ["Active", "Inactive", "Archived"];

export default function EditMember() {
  return (
    <ProtectedRoute roles={["Registrar", "Admin"]}>
      <EditMemberInner />
    </ProtectedRoute>
  );
}

function EditMemberInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [auditEntries, setAuditEntries] = useState<MemberAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api<MemberDetail>(`/members/${id}`);
        setMember(data);
      } catch (error) {
        console.error(error);
        toast.push("Failed to load member");
      }
    };
    load();
  }, [id, toast]);

  const refreshAudit = async (memberId: number) => {
    setAuditLoading(true);
    try {
      const entries = await getMemberAudit(memberId);
      setAuditEntries(entries);
    } catch (error) {
      console.error(error);
      toast.push("Failed to load audit trail");
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    const memberId = Number(id);
    if (Number.isNaN(memberId)) return;
    refreshAudit(memberId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const canDelete = user?.roles.includes("Admin");

  const handleChange = (field: keyof MemberDetail) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setMember((prev) => prev ? { ...prev, [field]: event.target.value } : prev);
  };

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setMember((prev) => (prev ? { ...prev, status: event.target.value as MemberStatus } : prev));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!member) return;
    setUpdating(true);
    try {
      await api(`/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: member.first_name,
          last_name: member.last_name,
          email: member.email,
          phone: member.phone,
          status: member.status,
          notes: member.notes,
        }),
      });
      toast.push("Member updated");
    } catch (error) {
      console.error(error);
      toast.push("Failed to update member");
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!member || !canDelete) return;
    const confirmed = window.confirm("Archive this member? This hides them from active lists.");
    if (!confirmed) return;
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
    }
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

  const handleAvatarPick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !member) {
      return;
    }
    setAvatarUploading(true);
    try {
      const response = await uploadAvatar(member.id, file);
      const relative = response.avatar_url.startsWith("/static/")
        ? response.avatar_url.replace("/static/", "")
        : response.avatar_url;
      setMember((prev) => (prev ? { ...prev, avatar_path: relative } : prev));
      toast.push("Avatar updated");
      refreshAudit(member.id);
    } catch (error) {
      console.error(error);
      toast.push("Failed to upload avatar");
    } finally {
      setAvatarUploading(false);
      event.target.value = "";
    }
  };

  const avatarUrl = buildAvatarUrl(member.avatar_path);

  if (!member) {
    return <div className="text-sm text-mute">Loading member…</div>;
  }

  return (
    <Card className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{member.first_name} {member.last_name}</h2>
            <div className="text-xs text-mute">{member.username}</div>
          </div>
          <Badge>{member.status}</Badge>
        </div>
        {canDelete && (
          <Button variant="ghost" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="w-4 h-4 mr-1" /> Archive
          </Button>
        )}
      </div>
      <div className="grid gap-6 md:grid-cols-[260px,1fr]">
        <div className="space-y-4">
          <div className="border rounded-lg p-4 text-center space-y-3">
            <div className="mx-auto h-40 w-40 rounded-full bg-muted overflow-hidden flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt={`${member.first_name} ${member.last_name}`} className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm text-mute">No avatar</span>
              )}
            </div>
            <div className="space-y-2">
              <Button variant="outline" onClick={handleAvatarPick} disabled={avatarUploading}>
                {avatarUploading ? "Uploading…" : "Upload Avatar"}
              </Button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <p className="text-xs text-mute">PNG, JPEG, or WEBP up to 5MB.</p>
            </div>
          </div>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase text-mute">First name</label>
              <Input value={member.first_name} onChange={handleChange("first_name")} required />
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Last name</label>
              <Input value={member.last_name} onChange={handleChange("last_name")} required />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase text-mute">Email</label>
              <Input value={member.email ?? ""} onChange={handleChange("email")} type="email" />
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Phone</label>
              <Input value={member.phone ?? ""} onChange={handleChange("phone")} />
            </div>
          </div>
          <div className="md:w-56">
            <label className="text-xs uppercase text-mute">Status</label>
            <Select value={member.status} onChange={handleStatusChange}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase text-mute">Notes</label>
            <Textarea rows={3} value={member.notes ?? ""} onChange={handleChange("notes")} />
          </div>
          <Button type="submit" disabled={updating}>{updating ? "Saving…" : "Save changes"}</Button>
        </form>
      </div>
      <div className="border rounded-lg p-4 space-y-3">
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
                <div className="mt-1 font-medium">{entry.action.toUpperCase()} {entry.field}</div>
                <div className="text-xs text-mute">
                  {entry.old_value ?? "—"} → {entry.new_value ?? "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
