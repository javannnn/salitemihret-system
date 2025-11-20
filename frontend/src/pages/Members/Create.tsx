import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Card, Input, Select, Textarea, Button } from "@/components/ui";
import { PhoneInput } from "@/components/PhoneInput";
import {
  ApiError,
  MemberDuplicateMatch,
  MemberStatus,
  MembersMeta,
  api,
  findMemberDuplicates,
  getMembersMeta,
} from "@/lib/api";
import {
  getCanonicalCanadianPhone,
  hasValidCanadianPhone,
  hasValidEmail,
  normalizeEmailInput,
} from "@/lib/validation";
import { useToast } from "@/components/Toast";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { ShieldAlert } from "lucide-react";

const STATUS_OPTIONS: MemberStatus[] = ["Active", "Inactive", "Pending", "Archived"];
const FALLBACK_GENDERS = ["Male", "Female"];
type QuickCreateDraft = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  status: MemberStatus;
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

type ContactFieldErrors = {
  phone?: string;
  email?: string;
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

export default function CreateMember() {
  return (
    <ProtectedRoute roles={["Registrar", "Admin", "PublicRelations", "Clerk", "OfficeAdmin"]}>
      <CreateMemberInner />
    </ProtectedRoute>
  );
}

function CreateMemberInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const quickCreateDraft = (location.state as { quickCreateDraft?: QuickCreateDraft } | null)?.quickCreateDraft;
  const toast = useToast();
  const permissions = usePermissions();
  const canEditStatus = permissions.editStatus;
  const canEditFinance = permissions.editFinance;
  const canEditSpiritual = permissions.editSpiritual;
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<MembersMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [form, setForm] = useState(() => ({
    first_name: quickCreateDraft?.first_name ?? "",
    middle_name: "",
    last_name: quickCreateDraft?.last_name ?? "",
    baptismal_name: "",
    email: quickCreateDraft?.email ?? "",
    phone: quickCreateDraft?.phone ?? "",
    status: (quickCreateDraft?.status ?? "Active") as MemberStatus,
    gender: "",
    marital_status: "",
    birth_date: "",
    join_date: "",
    district: "",
    address: "",
    address_street: "",
    address_city: "",
    address_region: "",
    address_postal_code: "",
    address_country: "",
    is_tither: false,
    pays_contribution: true,
    contribution_method: "",
    contribution_amount: "75.00",
    contribution_exception_reason: "",
    notes: "",
    has_father_confessor: false,
    household_size_override: "",
    tag_ids: [] as number[],
    ministry_ids: [] as number[],
  }));

  useEffect(() => {
    if (quickCreateDraft) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [quickCreateDraft, navigate, location.pathname]);
  const [selectedHousehold, setSelectedHousehold] = useState<string>("");
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [fatherConfessorId, setFatherConfessorId] = useState<string>("");
  const [spouseForm, setSpouseForm] = useState<SpouseFormState | null>(null);
  const [childrenForm, setChildrenForm] = useState<ChildFormState[]>([]);
  const exceptionReasons = meta?.contribution_exception_reasons ?? [];
  const [duplicateMatches, setDuplicateMatches] = useState<MemberDuplicateMatch[]>([]);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const genderOptions = useMemo(() => (meta?.genders?.length ? meta.genders : FALLBACK_GENDERS), [meta?.genders]);
  const ensureSpouseState = useCallback(
    (current?: SpouseFormState | null): SpouseFormState =>
      current ?? {
        first_name: "",
        last_name: "",
        gender: "",
        country_of_birth: "",
        phone: "",
        email: "",
      },
    [],
  );

  useEffect(() => {
    if (!permissions.createMembers) {
      setMeta(null);
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
  }, [permissions.createMembers, toast]);

  useEffect(() => {
    if (form.marital_status === "Married" && !spouseForm) {
      setSpouseForm({
        first_name: "",
        last_name: "",
        gender: "",
        country_of_birth: "",
        phone: "",
        email: "",
      });
    }
    if (form.marital_status !== "Married" && spouseForm) {
      setSpouseForm(null);
    }
  }, [form.marital_status, spouseForm]);

  useEffect(() => {
    const email = form.email.trim();
    const canonicalPhone = hasValidCanadianPhone(form.phone) ? form.phone : null;
    const first = form.first_name.trim();
    const last = form.last_name.trim();
    const shouldCheck = !!email || !!canonicalPhone || (!!first && !!last);
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
        phone: canonicalPhone || undefined,
        first_name: first || undefined,
        last_name: last || undefined,
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
  }, [form.email, form.phone, form.first_name, form.last_name, toast]);

  const handleChange = (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const rawValue = event.target.type === "checkbox"
        ? (event.target as HTMLInputElement).checked
        : event.target.value;
      let value = rawValue;
      if (typeof value === "string" && field === "email") {
        value = normalizeEmailInput(value);
        setFieldErrors((prev) => ({ ...prev, email: undefined }));
      }
      setForm((prev) => ({
        ...prev,
        [field]: value,
      }));
    };

  const handlePrimaryPhoneChange = (nextValue: string) => {
    setFieldErrors((prev) => ({ ...prev, phone: undefined }));
    setForm((prev) => ({ ...prev, phone: nextValue }));
  };

  const handleContributionExceptionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setForm((prev) => ({
      ...prev,
      contribution_exception_reason: value,
      contribution_amount: value ? (prev.contribution_amount || "75.00") : "75.00",
    }));
  };

  const updateSpouseField = useCallback(
    (field: keyof SpouseFormState, value: string) => {
      let nextValue = value;
      if (field === "email") {
        nextValue = normalizeEmailInput(value);
      }
      setSpouseForm((prev) => ({ ...ensureSpouseState(prev), [field]: nextValue }));
    },
    [ensureSpouseState],
  );

  const handleSpousePhoneChange = (nextValue: string) => {
    setSpouseForm((prev) => ({ ...ensureSpouseState(prev), phone: nextValue }));
  };

  const updateChildField = useCallback((key: string, field: keyof Omit<ChildFormState, "key">, value: string) => {
    setChildrenForm((prev) => prev.map((child) => (child.key === key ? { ...child, [field]: value } : child)));
  }, []);

  const addChild = useCallback(() => {
    setChildrenForm((prev) => [...prev, createChildFormState()]);
  }, []);

  const removeChild = useCallback((key: string) => {
    setChildrenForm((prev) => prev.filter((child) => child.key !== key));
  }, []);

  const toggleTag = (id: number) => {
    setForm((prev) => {
      const next = new Set(prev.tag_ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...prev, tag_ids: Array.from(next) };
    });
  };

  const validateContacts = useCallback(() => {
    const errors: ContactFieldErrors = {};
    const canonicalPhone = getCanonicalCanadianPhone(form.phone);
    if (!canonicalPhone) {
      errors.phone = "Use +1 followed by 10 digits (e.g., +16475550123).";
    }
    const emailValue = form.email.trim();
    const normalizedEmail = emailValue ? normalizeEmailInput(emailValue) : "";
    if (normalizedEmail && !hasValidEmail(normalizedEmail)) {
      errors.email = "Enter a valid email address.";
    }
    setFieldErrors(errors);
    return {
      valid: Object.keys(errors).length === 0,
      canonicalPhone,
      normalizedEmail: normalizedEmail || null,
    };
  }, [form.phone, form.email]);

  const toggleMinistry = (id: number) => {
    setForm((prev) => {
      const next = new Set(prev.ministry_ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...prev, ministry_ids: Array.from(next) };
    });
  };

  const toggleBoolean = (field: "is_tither" | "pays_contribution" | "has_father_confessor") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      if ((field === "is_tither" || field === "pays_contribution") && !canEditFinance) {
        return;
      }
      if (field === "has_father_confessor" && !canEditSpiritual) {
        return;
      }
      if (field === "pays_contribution" && !checked) {
        toast.push("Membership contribution is mandatory.");
        return;
      }
      setForm((prev) => ({ ...prev, [field]: checked }));
      if (field === "has_father_confessor" && !checked) {
        setFatherConfessorId("");
      }
    };

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, status: event.target.value as MemberStatus }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.push("First and last name are required");
      return;
    }
    const contacts = validateContacts();
    if (!contacts.valid || !contacts.canonicalPhone) {
      toast.push("Enter a valid Canadian phone number before saving.");
      return;
    }
    if (form.has_father_confessor && !fatherConfessorId) {
      toast.push("Select a father confessor or uncheck the flag");
      return;
    }
    if (form.marital_status === "Married") {
      if (!spouseForm || !spouseForm.first_name.trim() || !spouseForm.last_name.trim()) {
        toast.push("Enter spouse first and last name for married members");
        return;
      }
    }

    const amountValue = Number(form.contribution_amount || "0");
    const normalizedAmount = Number.isNaN(amountValue)
      ? NaN
      : Math.round(amountValue * 100) / 100;
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      toast.push("Contribution amount must be greater than zero");
      return;
    }
    if (!form.contribution_exception_reason && Math.abs(normalizedAmount - 75) > 0.01) {
      toast.push("Standard membership contribution is 75 CAD unless an exception is selected.");
      return;
    }

    setLoading(true);
    try {
      const trim = (value: string) => value.trim() || null;

      const payload: Record<string, unknown> = {
        first_name: form.first_name.trim(),
        middle_name: trim(form.middle_name),
        last_name: form.last_name.trim(),
        baptismal_name: trim(form.baptismal_name),
        email: contacts.normalizedEmail,
        phone: contacts.canonicalPhone,
        status: form.status,
        gender: form.gender && genderOptions.includes(form.gender) ? form.gender : null,
        marital_status: trim(form.marital_status),
        birth_date: form.birth_date || null,
        join_date: form.join_date || null,
        district: trim(form.district),
        address: trim(form.address),
        address_street: trim(form.address_street),
        address_city: trim(form.address_city),
        address_region: trim(form.address_region),
        address_postal_code: trim(form.address_postal_code),
        address_country: trim(form.address_country),
        is_tither: form.is_tither,
        pays_contribution: true,
        contribution_method: trim(form.contribution_method),
        contribution_amount: normalizedAmount,
        contribution_exception_reason: form.contribution_exception_reason || null,
        notes: trim(form.notes),
        has_father_confessor: form.has_father_confessor,
        household_size_override:
          form.household_size_override && !Number.isNaN(Number(form.household_size_override))
            ? Number(form.household_size_override)
            : null,
        tag_ids: form.tag_ids,
        ministry_ids: form.ministry_ids,
      };

      if (selectedHousehold === "new") {
        const trimmed = newHouseholdName.trim();
        if (!trimmed) {
          toast.push("Enter a household name or select an existing household");
          setLoading(false);
          return;
        }
        payload.household_name = trimmed;
      } else if (selectedHousehold === "") {
        payload.household_id = 0;
      } else {
        payload.household_id = Number(selectedHousehold);
      }

      if (form.has_father_confessor) {
        payload.father_confessor_id = Number(fatherConfessorId);
      }

      if (form.marital_status === "Married") {
        const data = spouseForm!;
        let spousePhone: string | null = null;
        if (data.phone.trim()) {
          const canonicalSpousePhone = getCanonicalCanadianPhone(data.phone);
          if (!canonicalSpousePhone) {
            toast.push("Spouse phone must be a valid Canadian number.");
            setLoading(false);
            return;
          }
          spousePhone = canonicalSpousePhone;
        }
        payload.spouse = {
          first_name: data.first_name.trim(),
          last_name: data.last_name.trim(),
          gender: data.gender && genderOptions.includes(data.gender) ? data.gender : null,
          country_of_birth: trim(data.country_of_birth),
          phone: spousePhone,
          email: trim(data.email),
        };
      }

      payload.children = childrenForm
        .map((child) => ({
          first_name: child.first_name.trim(),
          last_name: child.last_name.trim(),
          gender: child.gender && genderOptions.includes(child.gender) ? child.gender : null,
          birth_date: child.birth_date || null,
          country_of_birth: child.country_of_birth.trim() || null,
          notes: child.notes.trim() || null,
        }))
        .filter((child) => child.first_name && child.last_name);

      await api("/members", {
        method: "POST",
        body: JSON.stringify(payload),
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

  if (!permissions.createMembers) {
    return (
      <Card className="p-6 max-w-2xl border-amber-200 bg-amber-50 text-amber-900 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-lg font-semibold">Read-only access</h2>
          <p className="text-sm leading-relaxed">
            Your role can review member records but cannot create new members. Reach out to a PR Admin if you need to request an addition.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold mb-4">Create member</h2>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Identity</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase text-mute">First name</label>
              <Input value={form.first_name} onChange={handleChange("first_name")} required />
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Middle name</label>
              <Input value={form.middle_name} onChange={handleChange("middle_name")} />
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Last name</label>
              <Input value={form.last_name} onChange={handleChange("last_name")} required />
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Baptismal name</label>
              <Input value={form.baptismal_name} onChange={handleChange("baptismal_name")} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase text-mute">Gender</label>
              <Select value={form.gender} onChange={handleChange("gender")}>
                <option value="">Not set</option>
                {genderOptions.map((gender) => (
                  <option key={gender} value={gender}>
                    {gender}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Marital status</label>
              <Select value={form.marital_status} onChange={handleChange("marital_status")}>
                <option value="">Not set</option>
                {(meta?.marital_statuses ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Date of birth</label>
              <Input type="date" value={form.birth_date} onChange={handleChange("birth_date")} />
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Membership date</label>
              <Input type="date" value={form.join_date} onChange={handleChange("join_date")} />
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Membership status</label>
              <Select value={form.status} onChange={handleStatusChange} disabled={!canEditStatus}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              {!canEditStatus && (
                <p className="text-xs text-mute mt-1">Status changes require PR Admin approval.</p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Contact & Address</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase text-mute">Email</label>
              <Input
                value={form.email}
                onChange={handleChange("email")}
                type="email"
                placeholder="name@example.com"
                aria-invalid={fieldErrors.email ? "true" : undefined}
              />
              {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Phone</label>
              <PhoneInput
                value={form.phone}
                onChange={handlePrimaryPhoneChange}
                aria-invalid={fieldErrors.phone ? "true" : undefined}
                required
              />
              <p className="text-xs text-mute mt-1">Canadian mobile numbers auto-format with +1.</p>
              {fieldErrors.phone && <p className="text-xs text-red-500">{fieldErrors.phone}</p>}
            </div>
            <div>
              <label className="text-xs uppercase text-mute">District</label>
              <Input value={form.district} onChange={handleChange("district")} />
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Address (line)</label>
              <Input value={form.address} onChange={handleChange("address")} />
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs uppercase text-mute">Street</label>
              <Input value={form.address_street} onChange={handleChange("address_street")} />
            </div>
            <div>
              <label className="text-xs uppercase text-mute">City</label>
              <Input value={form.address_city} onChange={handleChange("address_city")} />
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Region / State</label>
              <Input value={form.address_region} onChange={handleChange("address_region")} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase text-mute">Postal code</label>
              <Input value={form.address_postal_code} onChange={handleChange("address_postal_code")} />
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Country</label>
              <Input value={form.address_country} onChange={handleChange("address_country")} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase text-mute">Potential duplicates</label>
            {duplicateLoading ? (
              <Card className="p-3 text-sm text-mute">Checking for duplicates…</Card>
            ) : duplicateMatches.length === 0 ? (
              <Card className="p-3 text-sm text-mute">No duplicates detected with the current email/phone/name.</Card>
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
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Household & Faith</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase text-mute">Household</label>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <Select
                  value={selectedHousehold}
                  onChange={(event) => setSelectedHousehold(event.target.value)}
                  className="md:w-64"
                >
                  <option value="">No household</option>
                  {(meta?.households ?? []).map((household) => (
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
                    onChange={(event) => setNewHouseholdName(event.target.value)}
                    placeholder="Household name"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="text-xs uppercase text-mute">Household size override</label>
              <Input
                type="number"
                min={1}
                value={form.household_size_override}
                onChange={(event) => setForm((prev) => ({ ...prev, household_size_override: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase text-mute">Father confessor</label>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-accent"
                checked={form.has_father_confessor}
                onChange={toggleBoolean("has_father_confessor")}
                disabled={!canEditSpiritual}
              />
              <span className="text-sm">Member has a father confessor</span>
            </div>
            {form.has_father_confessor && (
              <Select
                className="md:w-72"
                value={fatherConfessorId}
                onChange={(event) => setFatherConfessorId(event.target.value)}
                required
                disabled={!canEditSpiritual}
              >
                <option value="">Select father confessor…</option>
                {(meta?.father_confessors ?? []).map((confessor) => (
                  <option key={confessor.id} value={String(confessor.id)}>
                    {confessor.full_name}
                  </option>
                ))}
              </Select>
            )}
            {!canEditSpiritual && (
              <p className="text-xs text-mute">Registrar or PR Admin must manage Father Confessor assignments.</p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Giving & Contribution</h3>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-accent"
                checked={form.is_tither}
                onChange={toggleBoolean("is_tither")}
                disabled={!canEditFinance}
              />
              Tither
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-accent"
                checked
                readOnly
                disabled
              />
              Pays membership contribution (required)
            </label>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase text-mute">Contribution method</label>
              <Select
                value={form.contribution_method}
                onChange={handleChange("contribution_method")}
                disabled={!canEditFinance}
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
                value={form.contribution_amount}
                onChange={handleChange("contribution_amount")}
                disabled={!canEditFinance || !form.contribution_exception_reason}
              />
              {!form.contribution_exception_reason ? (
                <p className="text-xs text-mute mt-1">Amount fixed at 75.00 CAD unless a hardship exception is selected.</p>
              ) : (
                <p className="text-xs text-mute mt-1">Adjust the contribution collected for this period.</p>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs uppercase text-mute">Contribution exception</label>
            <Select
              value={form.contribution_exception_reason}
              onChange={handleContributionExceptionChange}
              disabled={!canEditFinance}
            >
              <option value="">No exception (75 CAD)</option>
              {exceptionReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason === "LowIncome" ? "Low income" : reason}
                </option>
              ))}
            </Select>
          </div>
          {!canEditFinance && (
            <p className="text-xs text-mute">
              Finance Admins confirm giving details. Your changes will save without modifying contribution fields.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Family</h3>
          {form.marital_status === "Married" ? (
            <div className="border border-border rounded-lg p-4 space-y-3">
              <h4 className="text-xs uppercase text-mute">Spouse</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase text-mute">First name</label>
                  <Input
                    value={spouseForm?.first_name ?? ""}
                    onChange={(event) => updateSpouseField("first_name", event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute">Last name</label>
                  <Input
                    value={spouseForm?.last_name ?? ""}
                    onChange={(event) => updateSpouseField("last_name", event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute">Gender</label>
                  <Select
                    value={spouseForm?.gender ?? ""}
                    onChange={(event) => updateSpouseField("gender", event.target.value)}
                  >
                    <option value="">Not set</option>
                    {genderOptions.map((gender) => (
                      <option key={gender} value={gender}>
                        {gender}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-xs uppercase text-mute">Country of birth</label>
                  <Input
                    value={spouseForm?.country_of_birth ?? ""}
                    onChange={(event) => updateSpouseField("country_of_birth", event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute">Phone</label>
                  <PhoneInput value={spouseForm?.phone ?? ""} onChange={handleSpousePhoneChange} />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute">Email</label>
                  <Input
                    type="email"
                    value={spouseForm?.email ?? ""}
                    onChange={(event) => updateSpouseField("email", event.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-mute">
              Spouse details are required only when marital status is set to Married.
            </p>
          )}

          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase text-mute">Children</h4>
              <Button type="button" variant="soft" onClick={addChild}>
                Add child
              </Button>
            </div>
            {childrenForm.length === 0 ? (
              <p className="text-xs text-mute">No children recorded.</p>
            ) : (
              <div className="space-y-4">
                {childrenForm.map((child) => (
                  <div key={child.key} className="border border-border/70 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase text-mute">Child</span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => removeChild(child.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs uppercase text-mute">First name</label>
                        <Input
                          value={child.first_name}
                          onChange={(event) => updateChildField(child.key, "first_name", event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute">Last name</label>
                        <Input
                          value={child.last_name}
                          onChange={(event) => updateChildField(child.key, "last_name", event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute">Gender</label>
                        <Select
                          value={child.gender}
                          onChange={(event) => updateChildField(child.key, "gender", event.target.value)}
                        >
                          <option value="">Not set</option>
                          {genderOptions.map((gender) => (
                            <option key={gender} value={gender}>
                              {gender}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute">Birth date</label>
                        <Input
                          type="date"
                          value={child.birth_date}
                          onChange={(event) => updateChildField(child.key, "birth_date", event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute">Country of birth</label>
                        <Input
                          value={child.country_of_birth}
                          onChange={(event) => updateChildField(child.key, "country_of_birth", event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute">Notes</label>
                        <Input
                          value={child.notes}
                          onChange={(event) => updateChildField(child.key, "notes", event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Tags</h3>
          <div className="mt-2 space-y-2">
            {metaLoading && <div className="text-xs text-mute">Loading tags…</div>}
            {!metaLoading && meta && meta.tags.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {meta.tags.map((tag) => {
                  const checked = form.tag_ids.includes(tag.id);
                  return (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card/60 p-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTag(tag.id)}
                        className="accent-accent"
                      />
                      <span>{tag.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {!metaLoading && meta && meta.tags.length === 0 && (
              <div className="text-xs text-mute">No tags available yet.</div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Ministries</h3>
          <div className="mt-2 space-y-2">
            {metaLoading && <div className="text-xs text-mute">Loading ministries…</div>}
            {!metaLoading && meta && meta.ministries.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {meta.ministries.map((ministry) => {
                  const checked = form.ministry_ids.includes(ministry.id);
                  return (
                    <label
                      key={ministry.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card/60 p-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMinistry(ministry.id)}
                        className="accent-accent"
                      />
                      <span>{ministry.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {!metaLoading && meta && meta.ministries.length === 0 && (
              <div className="text-xs text-mute">No ministries available yet.</div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Notes</h3>
          <Textarea rows={3} value={form.notes} onChange={handleChange("notes")} />
        </section>

        <div className="flex items-center gap-2 justify-end">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
