import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Input, Select, Textarea, Button, Badge } from "@/components/ui";
import {
  API_BASE,
  ApiError,
  MemberAuditEntry,
  MemberDetail,
  MemberStatus,
  MembersMeta,
  Payment,
  PaymentServiceType,
  api,
  createPaymentEntry,
  getMemberAudit,
  getMembersMeta,
  getPaymentServiceTypes,
  listPayments,
  uploadAvatar,
} from "@/lib/api";
import { useToast } from "@/components/Toast";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, ShieldAlert, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

const STATUS_OPTIONS: MemberStatus[] = ["Active", "Inactive", "Pending", "Archived"];

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

export default function EditMember() {
  return (
    <ProtectedRoute roles={["Registrar", "Admin", "PublicRelations", "Clerk", "OfficeAdmin", "FinanceAdmin"]}>
      <EditMemberInner />
    </ProtectedRoute>
  );
}

function EditMemberInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, token } = useAuth();
  const permissions = usePermissions();
  const disableAll = !permissions.editCore && !permissions.editSpiritual && !permissions.editStatus;
  const disableCore = disableAll || !permissions.editCore;
  const disableFinance = disableAll || !permissions.editFinance;
  const disableSpiritual = disableAll || !permissions.editSpiritual;
  const disableStatus = disableAll || !permissions.editStatus;
  const canViewAudit = permissions.viewAudit;
  const canSubmit = !disableAll;
  const canUploadAvatar = !disableCore;
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [meta, setMeta] = useState<MembersMeta | null>(null);
  const exceptionReasons = meta?.contribution_exception_reasons ?? [];
  const [metaLoading, setMetaLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
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
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

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
  }, []);

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

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api<MemberDetail>(`/members/${id}`);
        setMember(data);
        initializeFormsFromMember(data);
      } catch (error) {
        console.error(error);
        toast.push("Failed to load member");
      }
    };
    load();
  }, [id, toast, initializeFormsFromMember]);

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
      console.error(error);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        return;
      }
      toast.push("Failed to load audit trail");
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (!id) {
      return;
    }
    if (!canViewAudit) {
      setAuditEntries([]);
      setAuditLoading(false);
      return;
    }
    const memberId = Number(id);
    if (Number.isNaN(memberId)) return;
    refreshAudit(memberId);
  }, [id, canViewAudit]);

  useEffect(() => {
    if (!member) return;
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

  const canDelete = user?.roles.some((role) => role === "Admin" || role === "PublicRelations");

  const handleChange = (field: keyof MemberDetail) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (disableCore) {
      return;
    }
    setMember((prev) => prev ? { ...prev, [field]: event.target.value } : prev);
  };


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
  };

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (disableStatus) {
      return;
    }
    setMember((prev) => (prev ? { ...prev, status: event.target.value as MemberStatus } : prev));
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
        toast.push("Membership contribution is mandatory.");
        return;
      }
      setMember((prev) => (prev ? { ...prev, [field]: checked } : prev));
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
  };

  const updateChildField = (key: string, field: keyof Omit<ChildFormState, "key">, value: string) => {
    if (disableCore) {
      return;
    }
    setChildrenForm((prev) => prev.map((child) => (child.key === key ? { ...child, [field]: value } : child)));
  };

  const addChild = () => {
    if (disableCore) return;
    setChildrenForm((prev) => [...prev, createChildFormState()]);
  };

  const removeChild = (key: string) => {
    if (disableCore) return;
    setChildrenForm((prev) => prev.filter((child) => child.key !== key));
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

      if (!disableSpiritual && member.has_father_confessor && !fatherConfessorId) {
        toast.push("Select a father confessor or disable the flag");
        setUpdating(false);
        return;
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
      }

      if (!disableStatus) {
        payload.status = member.status;
      }

      if (!disableFinance) {
        payload.is_tither = member.is_tither;
        payload.pays_contribution = true;
        payload.contribution_method = trimOrNull(member.contribution_method);
        payload.contribution_amount = normalizedContribution;
        payload.contribution_exception_reason = member.contribution_exception_reason || null;
      }

      if (!disableSpiritual) {
        payload.has_father_confessor = member.has_father_confessor;
      }

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

      const updated = await api<MemberDetail>(`/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setMember(updated);
      initializeFormsFromMember(updated);
      await refreshAudit(updated.id);
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
    if (!canUploadAvatar) return;
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !member || !canUploadAvatar) {
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

  const avatarUrl = member ? buildAvatarUrl(member.avatar_path) : null;

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  };

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
              <Button variant="soft" onClick={handleAvatarPick} disabled={avatarUploading || !canUploadAvatar}>
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
              {!canUploadAvatar && (
                <p className="text-xs text-mute">
                  Avatar updates are limited to Registrar and Admin roles.
                </p>
              )}
            </div>
          </div>
        </div>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Identity</h3>
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
                  }}
                  disabled={disableCore}
                >
                  <option value="">No gender</option>
                  {(meta?.genders ?? []).map((gender) => (
                    <option key={gender} value={gender}>
                      {gender}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute">Marital status</label>
                <Select
                  value={member.marital_status ?? ""}
                  onChange={(event) => {
                    if (disableCore) return;
                    setMember((prev) => (prev ? { ...prev, marital_status: event.target.value || null } : prev));
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
              <div>
              <label className="text-xs uppercase text-mute">Membership status</label>
              <Select value={member.status} onChange={handleStatusChange} disabled={disableStatus}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              {disableStatus && (
                <p className="text-xs text-mute mt-1">Status changes require PR Admin approval.</p>
              )}
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
                  }}
                  disabled={disableCore}
                />
              </div>
              <div>
                <label className="text-xs uppercase text-mute">Membership date</label>
                <Input
                  type="date"
                  value={member.join_date ?? ""}
                  onChange={(event) => {
                    if (disableCore) return;
                    setMember((prev) => (prev ? { ...prev, join_date: event.target.value || null } : prev));
                  }}
                  disabled={disableCore}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Contact & Address</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase text-mute">Email</label>
                <Input value={member.email ?? ""} onChange={handleChange("email")} type="email" disabled={disableCore} />
              </div>
              <div>
                <label className="text-xs uppercase text-mute">Phone</label>
                <Input value={member.phone} onChange={handleChange("phone")} required disabled={disableCore} />
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
                <Input value={member.address_postal_code ?? ""} onChange={handleChange("address_postal_code")} disabled={disableCore} />
              </div>
              <div>
                <label className="text-xs uppercase text-mute">Country</label>
                <Input value={member.address_country ?? ""} onChange={handleChange("address_country")} disabled={disableCore} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Household & Faith</h3>
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
                  }}
                  disabled={disableSpiritual}
                />
                <span className="text-sm">Member has a father confessor</span>
              </div>
              {member.has_father_confessor && (
                <Select
                  className="md:w-72"
                  value={fatherConfessorId}
                  onChange={(event) => setFatherConfessorId(event.target.value)}
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
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Giving & Contributions</h3>
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
                  value={member.contribution_method ?? ""}
                  onChange={(event) => {
                    if (disableFinance) return;
                    setMember((prev) => (prev ? { ...prev, contribution_method: event.target.value || null } : prev));
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
            {disableFinance && (
              <p className="text-xs text-mute">
                Finance Admin permissions are required to adjust giving details.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Financial Activity</h3>
              {permissions.viewPayments && member?.id && (
                <Button type="button" variant="ghost" onClick={() => navigate(`/payments/members/${member.id}`)}>
                  View payment timeline
                </Button>
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
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Family</h3>
            {member.marital_status === "Married" ? (
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
                      {(meta?.genders ?? []).map((gender) => (
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
                    <Input
                      value={spouseForm?.phone ?? ""}
                      onChange={(event) => updateSpouseField("phone", event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute">Email</label>
                    <Input
                      value={spouseForm?.email ?? ""}
                      onChange={(event) => updateSpouseField("email", event.target.value)}
                      type="email"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-mute">
                Spouse information is required only when marital status is set to Married.
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
                            {(meta?.genders ?? []).map((gender) => (
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
                    const checked = member.tags.some((assigned) => assigned.id === tag.id);
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
                        disabled={disableCore}
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
                    const checked = member.ministries.some((assigned) => assigned.id === ministry.id);
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
                        disabled={disableCore}
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
            <Textarea rows={3} value={member.notes ?? ""} onChange={handleChange("notes")} disabled={disableCore} />
          </section>

          <div className="flex justify-end">
            <Button type="submit" disabled={updating || !canSubmit}>
              {updating ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
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
