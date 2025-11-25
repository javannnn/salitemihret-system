import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import { Button, Card, Input, Select } from "@/components/ui";
import { PhoneInput } from "@/components/PhoneInput";
import { useToast } from "@/components/Toast";
import { MemberDetail, SpousePayload, api, updateMemberSpouse } from "@/lib/api";
import { getCanonicalCanadianPhone, hasValidEmail, normalizeEmailInput } from "@/lib/validation";

export type SpouseDraft = {
  maritalStatus: string;
  firstName: string;
  lastName: string;
  gender?: string;
  country?: string;
  phone: string;
  email: string;
};

type Props = {
  open: boolean;
  memberId: number | null;
  memberName: string;
  initialDraft: SpouseDraft | null;
  onPersistDraft: (memberId: number, draft: SpouseDraft) => void;
  onClearDraft: (memberId: number) => void;
  onClose: () => void;
  onSaved: () => void;
  ["data-tour"]?: string;
};

const MARITAL_STATUSES = ["Single", "Married", "Separated", "Divorced", "Widowed", "Other"];

const EMPTY_FORM: SpouseDraft = {
  maritalStatus: "",
  firstName: "",
  lastName: "",
  gender: "",
  country: "",
  phone: "",
  email: "",
};

export default function SpouseDrawer({
  open,
  memberId,
  memberName,
  initialDraft,
  onPersistDraft,
  onClearDraft,
  onClose,
  onSaved,
  ...rest
}: Props) {
  const toast = useToast();
  const [form, setForm] = useState<SpouseDraft>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setError("");
      return;
    }
    if (!memberId) {
      return;
    }
    if (initialDraft) {
      setForm(initialDraft);
      return;
    }
    let cancelled = false;
    async function fetchDetail() {
      setLoading(true);
      try {
        const detail = await api<MemberDetail>(`/members/${memberId}`);
        if (cancelled) return;
        setForm({
          maritalStatus: detail.marital_status ?? "",
          firstName: detail.spouse?.first_name ?? "",
          lastName: detail.spouse?.last_name ?? "",
          gender: detail.spouse?.gender ?? "",
          country: detail.spouse?.country_of_birth ?? "",
          phone: detail.spouse?.phone ?? "",
          email: detail.spouse?.email ?? "",
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          toast.push("Failed to load spouse details");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [open, memberId, initialDraft, toast]);

  const closeDrawer = () => {
    if (memberId) {
      onPersistDraft(memberId, form);
    }
    if (!saving) {
      onClose();
    }
  };

  useEffect(() => {
    if (!open && memberId) {
      onPersistDraft(memberId, form);
    }
  }, [open, memberId, form, onPersistDraft]);

  const maritalStatus = form.maritalStatus || "";
  const requiresSpouse = maritalStatus === "Married";

  const canonicalPhone = useMemo(() => {
    if (!form.phone) return "";
    const canonical = getCanonicalCanadianPhone(form.phone);
    return canonical ?? "";
  }, [form.phone]);

  const normalizedEmail = useMemo(() => (form.email ? normalizeEmailInput(form.email) : ""), [form.email]);

  const validate = () => {
    if (requiresSpouse && (!form.firstName.trim() || !form.lastName.trim())) {
      setError("First and last name are required for married members.");
      return false;
    }
    if (form.phone) {
      const canonical = getCanonicalCanadianPhone(form.phone);
      if (!canonical) {
        setError("Phone must match +1########## format.");
        return false;
      }
    }
    if (form.email && !hasValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return false;
    }
    setError("");
    return true;
  };

  const handleSave = async () => {
    if (!memberId) {
      return;
    }
    if (!validate()) {
      return;
    }
    setSaving(true);
    try {
      let payloadSpouse: SpousePayload | null = null;
      if (requiresSpouse) {
        payloadSpouse = {
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          gender: form.gender || undefined,
          country_of_birth: form.country || undefined,
          phone: form.phone ? getCanonicalCanadianPhone(form.phone) ?? undefined : undefined,
          email: normalizedEmail || undefined,
        };
      } else if (form.firstName.trim() && form.lastName.trim()) {
        payloadSpouse = {
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          gender: form.gender || undefined,
          country_of_birth: form.country || undefined,
          phone: form.phone ? getCanonicalCanadianPhone(form.phone) ?? undefined : undefined,
          email: normalizedEmail || undefined,
        };
      }
      const response = await updateMemberSpouse(memberId, {
        marital_status: form.maritalStatus || undefined,
        spouse: payloadSpouse,
      });
      if (memberId) {
        onClearDraft(memberId);
      }
      toast.push(payloadSpouse ? "Spouse updated" : "Spouse removed");
      setSaving(false);
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast.push("Failed to save spouse");
      setSaving(false);
    }
  };

  const updateField = (field: keyof SpouseDraft, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhoneChange = (value: string) => {
    setForm((prev) => ({ ...prev, phone: value }));
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
          />
          <motion.div
            className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-card border-l border-border shadow-soft z-50 p-6 overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            {...rest}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Spouse</h2>
                <p className="text-sm text-mute">{memberName}</p>
              </div>
              <Button variant="ghost" onClick={closeDrawer} disabled={saving}>
                Close
              </Button>
            </div>

            {loading ? (
              <div className="text-sm text-mute">Loading spouse details…</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase text-mute">Marital status</label>
                  <Select value={maritalStatus} onChange={(event) => updateField("maritalStatus", event.target.value)}>
                    <option value="">Not set</option>
                    {MARITAL_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs uppercase text-mute">First name</label>
                    <Input value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute">Last name</label>
                    <Input value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs uppercase text-mute">Gender</label>
                    <Select value={form.gender ?? ""} onChange={(event) => updateField("gender", event.target.value)}>
                      <option value="">Not set</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute">Country of birth</label>
                    <Input value={form.country ?? ""} onChange={(event) => updateField("country", event.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs uppercase text-mute">Phone</label>
                    <PhoneInput value={form.phone} onChange={handlePhoneChange} />
                    {form.phone && (
                      <p className="text-xs text-mute mt-1">
                        Canonical: {canonicalPhone || "invalid – use +1 followed by 10 digits"}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute">Email</label>
                    <Input
                      value={form.email}
                      onChange={(event) => updateField("email", normalizeEmailInput(event.target.value))}
                      placeholder="spouse@example.com"
                      type="email"
                    />
                  </div>
                </div>
              </div>
            )}

            {error && <div className="text-sm text-red-600 mt-4">{error}</div>}

            <div className="flex justify-between items-center mt-6">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setError("");
                }}
                disabled={saving}
              >
                Clear
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={closeDrawer} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving || loading}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
