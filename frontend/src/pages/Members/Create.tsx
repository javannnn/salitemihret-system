import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Input, Select, Textarea, Button } from "@/components/ui";
import { MemberStatus, api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import ProtectedRoute from "@/components/ProtectedRoute";

const STATUS_OPTIONS: MemberStatus[] = ["Active", "Inactive", "Archived"];

export default function CreateMember() {
  return (
    <ProtectedRoute roles={["Registrar", "Admin"]}>
      <CreateMemberInner />
    </ProtectedRoute>
  );
}

function CreateMemberInner() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    status: "Active" as MemberStatus,
    notes: ""
  });

  const handleChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, status: event.target.value as MemberStatus }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await api("/members", {
        method: "POST",
        body: JSON.stringify(form),
      });
      toast.push("Member created");
      navigate("/members");
    } catch (error) {
      console.error(error);
      toast.push("Failed to create member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold mb-4">Create member</h2>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase text-mute">First name</label>
            <Input value={form.first_name} onChange={handleChange("first_name")} required />
          </div>
          <div>
            <label className="text-xs uppercase text-mute">Last name</label>
            <Input value={form.last_name} onChange={handleChange("last_name")} required />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase text-mute">Email</label>
            <Input value={form.email} onChange={handleChange("email")} type="email" />
          </div>
          <div>
            <label className="text-xs uppercase text-mute">Phone</label>
            <Input value={form.phone} onChange={handleChange("phone")} />
          </div>
        </div>
        <div className="md:w-56">
          <label className="text-xs uppercase text-mute">Status</label>
          <Select value={form.status} onChange={handleStatusChange}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs uppercase text-mute">Notes</label>
          <Textarea rows={3} value={form.notes} onChange={handleChange("notes")} />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
