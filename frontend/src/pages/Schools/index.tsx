import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CalendarClock, FileText, HandHeart, Image, Loader2, PlusCircle, RefreshCcw, ShieldCheck, Users, Wallet } from "lucide-react";

import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import {
  AbenetEnrollment,
  AbenetEnrollmentList,
  AbenetEnrollmentPayload,
  AbenetPaymentPayload,
  AbenetReportRow,
  MemberDetail,
  MemberSummary,
  Member,
  SchoolsMeta,
  api,
  createAbenetEnrollment,
  getAbenetReport,
  getSchoolsMeta,
  listAbenetEnrollments,
  recordAbenetPayment,
  searchMembers,
  SundaySchoolParticipant,
  SundaySchoolPaymentMethod,
  SundaySchoolParticipantList,
  SundaySchoolParticipantPayload,
  SundaySchoolStats,
  SundaySchoolContent,
  SundaySchoolContentPayload,
  SundaySchoolContentList,
  SundaySchoolMeta,
  listSundaySchoolParticipants,
  createSundaySchoolParticipant,
  updateSundaySchoolParticipant,
  deactivateSundaySchoolParticipant,
  recordSundaySchoolContribution,
  getSundaySchoolStats,
  listSundaySchoolContent,
  createSundaySchoolContent,
  updateSundaySchoolContent,
  submitSundaySchoolContent,
  approveSundaySchoolContent,
  rejectSundaySchoolContent,
  getSundaySchoolMeta,
} from "@/lib/api";

type EnrollmentFormState = {
  parent_member_id: string;
  child_mode: "existing" | "new";
  child_id: string;
  child_first_name: string;
  child_last_name: string;
  birth_date: string;
  service_stage: AbenetEnrollment["service_stage"];
  enrollment_date: string;
  notes: string;
};

const SERVICE_LABELS: Record<AbenetEnrollment["service_stage"], string> = {
  Alphabet: "Alphabet",
  Reading: "Reading",
  ForDeacons: "For Deacons",
};

const STATUS_LABELS: Record<AbenetEnrollment["status"], string> = {
  Active: "Active",
  Paused: "Paused",
  Completed: "Completed",
  Cancelled: "Cancelled",
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const defaultEnrollmentForm: EnrollmentFormState = {
  parent_member_id: "",
  child_mode: "existing",
  child_id: "",
  child_first_name: "",
  child_last_name: "",
  birth_date: todayISO(),
  service_stage: "Alphabet",
  enrollment_date: todayISO(),
  notes: "",
};

type SundayFormState = {
  member_username: string;
  first_name: string;
  last_name: string;
  category: "Child" | "Youth" | "Adult";
  gender: "Male" | "Female" | "Other";
  dob: string;
  membership_date: string;
  phone: string;
  email: string;
  pays_contribution: boolean;
  monthly_amount: string;
  payment_method: string;
};

const defaultSundayForm: SundayFormState = {
  member_username: "",
  first_name: "",
  last_name: "",
  category: "Child",
  gender: "Female",
  dob: todayISO(),
  membership_date: todayISO(),
  phone: "",
  email: "",
  pays_contribution: false,
  monthly_amount: "50",
  payment_method: "CASH",
};

const SUNDAY_CATEGORIES = [
  { value: "Child", label: "Child" },
  { value: "Youth", label: "Youth" },
  { value: "Adult", label: "Adult" },
];

export default function SchoolsWorkspace() {
  const permissions = usePermissions();
  const toast = useToast();
  const canView = permissions.viewSchools;
  const canManage = permissions.manageSchools;

  const [meta, setMeta] = useState<SchoolsMeta | null>(null);
  const [activeTab, setActiveTab] = useState<"abenet" | "sundayschool">("abenet");
  const [abenetFilters, setAbenetFilters] = useState({ service_stage: "", status: "", q: "", page: 1 });
  const [abenetList, setAbenetList] = useState<AbenetEnrollmentList | null>(null);
  const [abenetLoading, setAbenetLoading] = useState(false);
  const [report, setReport] = useState<AbenetReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<AbenetEnrollment | null>(null);
  const [enrollmentForm, setEnrollmentForm] = useState<EnrollmentFormState>(defaultEnrollmentForm);
  const [parentSearch, setParentSearch] = useState("");
  const [parentResults, setParentResults] = useState<MemberSummary[]>([]);
  const [parentDetail, setParentDetail] = useState<MemberDetail | null>(null);
  const [parentLoading, setParentLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState<Partial<AbenetPaymentPayload>>({});
  const [sundayFilters, setSundayFilters] = useState({ category: "", pays: "", search: "", page: 1 });
  const [sundayList, setSundayList] = useState<SundaySchoolParticipantList | null>(null);
  const [sundayLoading, setSundayLoading] = useState(false);
  const [sundayStats, setSundayStats] = useState<SundaySchoolStats | null>(null);
  const [showSundayForm, setShowSundayForm] = useState(false);
  const [sundayForm, setSundayForm] = useState<SundayFormState>(defaultSundayForm);
  const [sundayMemberSearch, setSundayMemberSearch] = useState("");
  const [sundayMemberResults, setSundayMemberResults] = useState<Member[]>([]);
  const [sundayPaymentTarget, setSundayPaymentTarget] = useState<SundaySchoolParticipant | null>(null);
  const [showSundayPaymentModal, setShowSundayPaymentModal] = useState(false);
  const [sundayPaymentForm, setSundayPaymentForm] = useState({ amount: "", method: "CASH", memo: "" });
  const [sundayMeta, setSundayMeta] = useState<SundaySchoolMeta | null>(null);
  const [contentTypeFilter, setContentTypeFilter] = useState<SundaySchoolContent["type"]>("Mezmur");
  const [contentStatusFilter, setContentStatusFilter] = useState<SundaySchoolContent["status"] | "All">("All");
  const [contentForm, setContentForm] = useState<SundaySchoolContentPayload>({ type: "Mezmur", title: "", body: "" });
  const [contentList, setContentList] = useState<SundaySchoolContentList | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    if (!canView) return;
    getSchoolsMeta()
      .then(setMeta)
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load school settings.");
      });
  }, [canView, toast]);

  useEffect(() => {
    if (!canView) return;
    getSundaySchoolMeta()
      .then(setSundayMeta)
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load Sunday School options.");
      });
  }, [canView, toast]);

  useEffect(() => {
    if (!meta) return;
    setPaymentForm((prev) => ({ ...prev, method: prev.method || meta.payment_methods[0] || "" }));
  }, [meta]);

  useEffect(() => {
    if (!sundayMeta) return;
    setSundayForm((prev) => ({
      ...prev,
      payment_method: prev.payment_method || sundayMeta.payment_methods[0] || "CASH",
    }));
    setSundayPaymentForm((prev) => ({ ...prev, method: prev.method || sundayMeta.payment_methods[0] || "CASH" }));
  }, [sundayMeta]);

  useEffect(() => {
    if (!canView) return;
    getSundaySchoolStats()
      .then(setSundayStats)
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load Sunday School stats.");
      });
  }, [canView, toast]);

  useEffect(() => {
    if (!canView) return;
    setAbenetLoading(true);
    listAbenetEnrollments({
      service_stage: abenetFilters.service_stage || undefined,
      status: abenetFilters.status || undefined,
      q: abenetFilters.q || undefined,
      page: abenetFilters.page,
      page_size: 10,
    })
      .then(setAbenetList)
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load Abenet enrollments.");
      })
      .finally(() => setAbenetLoading(false));
  }, [abenetFilters, canView, toast]);

  useEffect(() => {
    if (!canView || activeTab !== "sundayschool") return;
    setSundayLoading(true);
    listSundaySchoolParticipants({
      category: sundayFilters.category || undefined,
      pays_contribution: sundayFilters.pays ? sundayFilters.pays === "yes" : undefined,
      search: sundayFilters.search || undefined,
      page: sundayFilters.page,
      page_size: 10,
    })
      .then(setSundayList)
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load Sunday School participants.");
      })
      .finally(() => setSundayLoading(false));
  }, [sundayFilters, canView, toast, activeTab]);

  useEffect(() => {
    if (!canView) return;
    setReportLoading(true);
    getAbenetReport()
      .then(setReport)
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load Abenet report.");
      })
      .finally(() => setReportLoading(false));
  }, [canView, toast]);

  useEffect(() => {
    if (!canView || activeTab !== "sundayschool") return;
    setContentLoading(true);
    listSundaySchoolContent({
      type: contentTypeFilter,
      status: contentStatusFilter === "All" ? undefined : contentStatusFilter || undefined,
    })
      .then(setContentList)
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load Sunday School content.");
      })
      .finally(() => setContentLoading(false));
  }, [canView, toast, contentTypeFilter, contentStatusFilter, activeTab]);

  useEffect(() => {
    setContentForm((prev) => ({ ...prev, type: contentTypeFilter }));
  }, [contentTypeFilter]);

  useEffect(() => {
    if (parentSearch.trim().length < 2) {
      setParentResults([]);
      return;
    }
    let cancelled = false;
    searchMembers(parentSearch.trim(), 5)
      .then((results) => {
        if (!cancelled) {
          setParentResults(results);
        }
      })
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, [parentSearch]);

  useEffect(() => {
    if (sundayMemberSearch.trim().length < 2) {
      setSundayMemberResults([]);
      return;
    }
    let cancelled = false;
    searchMembers(sundayMemberSearch.trim(), 5)
      .then((results) => {
        if (!cancelled) {
          setSundayMemberResults(results);
        }
      })
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, [sundayMemberSearch]);

  const selectedChild = useMemo(() => {
    if (!parentDetail || !enrollmentForm.child_id) return null;
    return parentDetail.children.find((child) => child.id === Number(enrollmentForm.child_id)) || null;
  }, [parentDetail, enrollmentForm.child_id]);

  const resetSundayForm = () => {
    setSundayForm(defaultSundayForm);
    setSundayMemberSearch("");
    setSundayMemberResults([]);
  };

  const handleSundayMemberSelect = (member: Member) => {
    setSundayMemberResults([]);
    setSundayMemberSearch(`${member.first_name} ${member.last_name}`);
    setSundayForm((prev) => ({
      ...prev,
      member_username: member.username,
      first_name: member.first_name,
      last_name: member.last_name,
      phone: member.phone || prev.phone,
      email: member.email || prev.email,
      gender: (member.gender as SundayFormState["gender"]) || prev.gender,
      dob: member.birth_date || prev.dob,
    }));
  };

  const handleSundayFormSubmit = async () => {
    if (!sundayForm.member_username.trim()) {
      toast.push("Select a member before saving.");
      return;
    }
    if (sundayForm.pays_contribution && !sundayForm.payment_method) {
      toast.push("Select a payment method for contributions.");
      return;
    }
    if (!sundayForm.first_name.trim() || !sundayForm.last_name.trim()) {
      toast.push("Member name is required.");
      return;
    }
    if (!sundayForm.dob) {
      toast.push("Enter the participant's date of birth.");
      return;
    }
    const payload: SundaySchoolParticipantPayload = {
      member_username: sundayForm.member_username.trim(),
      category: sundayForm.category,
      first_name: sundayForm.first_name.trim(),
      last_name: sundayForm.last_name.trim(),
      gender: sundayForm.gender,
      dob: sundayForm.dob,
      membership_date: sundayForm.membership_date || todayISO(),
      phone: sundayForm.phone || undefined,
      email: sundayForm.email || undefined,
      pays_contribution: sundayForm.pays_contribution,
      monthly_amount: sundayForm.pays_contribution ? Number(sundayForm.monthly_amount || 0) : undefined,
      payment_method: sundayForm.pays_contribution ? (sundayForm.payment_method as SundaySchoolPaymentMethod) : undefined,
    };
    try {
      await createSundaySchoolParticipant(payload);
      toast.push("Sunday School participant saved.");
      resetSundayForm();
      setShowSundayForm(false);
      setSundayFilters((prev) => ({ ...prev }));
      getSundaySchoolStats().then(setSundayStats).catch(() => {});
    } catch (error) {
      console.error(error);
      toast.push("Unable to save participant.");
    }
  };

  const handleSundayPaymentSubmit = async () => {
    if (!sundayPaymentTarget) return;
    if (!sundayPaymentForm.method) {
      toast.push("Select a payment method.");
      return;
    }
    try {
      await recordSundaySchoolContribution(sundayPaymentTarget.id, {
        amount: sundayPaymentForm.amount ? Number(sundayPaymentForm.amount) : undefined,
        method: sundayPaymentForm.method as SundaySchoolPaymentMethod,
        memo: sundayPaymentForm.memo || undefined,
      });
      toast.push("Contribution recorded.");
      setShowSundayPaymentModal(false);
      setSundayPaymentForm({ amount: "", method: sundayMeta?.payment_methods[0] || "CASH", memo: "" });
      setSundayPaymentTarget(null);
      setSundayFilters((prev) => ({ ...prev }));
      getSundaySchoolStats().then(setSundayStats).catch(() => {});
    } catch (error) {
      console.error(error);
      toast.push("Unable to record contribution.");
    }
  };

  const handleContentSubmit = async () => {
    if (!contentForm.title.trim()) {
      toast.push("Title is required.");
      return;
    }
    try {
      await createSundaySchoolContent(contentForm);
      toast.push("Content saved.");
      setContentForm({ type: contentForm.type, title: "", body: "" });
      setContentTypeFilter(contentForm.type);
      listSundaySchoolContent({ type: contentTypeFilter, status: contentStatusFilter || undefined })
        .then(setContentList)
        .catch(() => {});
    } catch (error) {
      console.error(error);
      toast.push("Unable to save content.");
    }
  };

  const handleContentAction = async (content: SundaySchoolContent, action: "submit" | "approve" | "reject") => {
    try {
      if (action === "submit") {
        await submitSundaySchoolContent(content.id);
      } else if (action === "approve") {
        await approveSundaySchoolContent(content.id, true);
      } else {
        const reason = window.prompt("Provide a reason for rejection?") || "Changes required";
        await rejectSundaySchoolContent(content.id, reason);
      }
      listSundaySchoolContent({ type: contentTypeFilter, status: contentStatusFilter || undefined })
        .then(setContentList)
        .catch(() => {});
      toast.push("Content updated.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to update content status.");
    }
  };

  if (!canView) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-sm text-mute">You do not have access to the Schools module.</p>
        </Card>
      </div>
    );
  }

  const resetEnrollmentModal = () => {
    setEnrollmentForm(defaultEnrollmentForm);
    setParentSearch("");
    setParentResults([]);
    setParentDetail(null);
  };

  const handleParentSelect = async (summary: MemberSummary) => {
    setEnrollmentForm((prev) => ({ ...prev, parent_member_id: String(summary.id), child_id: "" }));
    setParentSearch(`${summary.first_name} ${summary.last_name}`);
    setParentResults([]);
    setParentLoading(true);
    try {
      const detail = await api<MemberDetail>(`/members/${summary.id}`);
      setParentDetail(detail);
    } catch (error) {
      console.error(error);
      setParentDetail(null);
      setEnrollmentForm((prev) => ({ ...prev, child_mode: "new" }));
      toast.push("Unable to load member details—enter the child information manually.");
    } finally {
      setParentLoading(false);
    }
  };

  const handleEnrollmentSubmit = async () => {
    if (!enrollmentForm.parent_member_id) {
      toast.push("Select a parent before saving.");
      return;
    }
    if (enrollmentForm.child_mode === "existing" && !enrollmentForm.child_id) {
      toast.push("Select a child or switch to adding a new child.");
      return;
    }
    if (enrollmentForm.child_mode === "new" && (!enrollmentForm.child_first_name.trim() || !enrollmentForm.child_last_name.trim())) {
      toast.push("Provide the child’s first and last name.");
      return;
    }
    try {
      await createAbenetEnrollment({
        parent_member_id: Number(enrollmentForm.parent_member_id),
        child_id: enrollmentForm.child_mode === "existing" ? Number(enrollmentForm.child_id) : undefined,
        child_first_name: enrollmentForm.child_mode === "new" ? enrollmentForm.child_first_name : undefined,
        child_last_name: enrollmentForm.child_mode === "new" ? enrollmentForm.child_last_name : undefined,
        birth_date:
          enrollmentForm.child_mode === "existing" && selectedChild?.birth_date
            ? selectedChild.birth_date
            : enrollmentForm.birth_date,
        service_stage: enrollmentForm.service_stage,
        enrollment_date: enrollmentForm.enrollment_date,
        notes: enrollmentForm.notes || undefined,
      });
      toast.push("Enrollment created.");
      setAbenetFilters((prev) => ({ ...prev }));
      setShowEnrollmentModal(false);
      resetEnrollmentModal();
    } catch (error) {
      console.error(error);
      toast.push("Unable to create enrollment.");
    }
  };

  const handlePaymentSubmit = async () => {
    if (!selectedEnrollment) return;
    const method = paymentForm.method || paymentMethods[0];
    if (!method) {
      toast.push("Add at least one payment method in settings before recording tuition.");
      return;
    }
    try {
      await recordAbenetPayment(selectedEnrollment.id, {
        amount: meta?.monthly_amount,
        method,
        memo: paymentForm.memo || undefined,
      });
      toast.push("Payment recorded.");
      setShowPaymentModal(false);
      setPaymentForm({});
      setSelectedEnrollment(null);
      setAbenetFilters((prev) => ({ ...prev }));
      setReportLoading(true);
      getAbenetReport().then(setReport).finally(() => setReportLoading(false));
    } catch (error) {
      console.error(error);
      toast.push("Unable to record payment.");
    }
  };

  const paymentMethods = meta?.payment_methods ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Schools</h1>
          <p className="text-sm text-mute">Manage Abenet literacy training and the upcoming Sunday School module.</p>
        </div>
      </div>
      <div className="flex gap-3 border-b border-border">
        {[
          { key: "abenet", label: "Abenet School" },
          { key: "sundayschool", label: "Sunday School" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              activeTab === tab.key ? "border-accent text-accent" : "border-transparent text-mute hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab.key as "abenet" | "sundayschool")}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "abenet" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Abenet School</h2>
              <p className="text-sm text-mute">Register children, track tuition, and export payment-ready reports.</p>
            </div>
            {canManage && (
              <Button
                onClick={() => {
                  resetEnrollmentModal();
                  setShowEnrollmentModal(true);
                }}
              >
                <PlusCircle className="h-4 w-4" />
                New enrollment
              </Button>
            )}
          </div>
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <HandHeart className="h-8 w-8 text-accent" />
            <div>
              <p className="text-xs uppercase text-mute tracking-wide">Total enrollments</p>
              <p className="text-2xl font-semibold">{abenetList?.total ?? "—"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={abenetFilters.service_stage}
              onChange={(event) => setAbenetFilters((prev) => ({ ...prev, service_stage: event.target.value, page: 1 }))}
            >
              <option value="">All services</option>
              {meta?.service_stages.map((value) => (
                <option key={value} value={value}>
                  {SERVICE_LABELS[value]}
                </option>
              ))}
            </Select>
            <Select
              value={abenetFilters.status}
              onChange={(event) => setAbenetFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
            >
              <option value="">All statuses</option>
              {meta?.statuses.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value as AbenetEnrollment["status"]]}
                </option>
              ))}
            </Select>
            <Input
              placeholder="Search child"
              value={abenetFilters.q}
              onChange={(event) => setAbenetFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
            />
            <Button variant="ghost" onClick={() => setAbenetFilters({ service_stage: "", status: "", q: "", page: 1 })}>
              <RefreshCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>
        {abenetLoading ? (
          <div className="py-10 text-center text-mute flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading enrollments…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-mute">
                  <th className="py-2 pr-4">Child</th>
                  <th className="py-2 pr-4">Parent</th>
                  <th className="py-2 pr-4">Service</th>
                  <th className="py-2 pr-4">Monthly fee</th>
                  <th className="py-2 pr-4">Last payment</th>
                  <th className="py-2 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {abenetList?.items.map((item) => (
                  <tr key={item.id} className="border-t border-border/60">
                    <td className="py-2 pr-4">
                      <div className="font-medium">
                        {item.child.first_name} {item.child.last_name}
                      </div>
                      <div className="text-xs text-mute">Enrolled {new Date(item.enrollment_date).toLocaleDateString()}</div>
                    </td>
                    <td className="py-2 pr-4 text-sm">
                      {item.parent.first_name} {item.parent.last_name}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge className="normal-case">{SERVICE_LABELS[item.service_stage]}</Badge>
                    </td>
                    <td className="py-2 pr-4 font-medium">{currency(item.monthly_amount)}</td>
                    <td className="py-2 pr-4 text-xs">
                      {item.last_payment_at ? new Date(item.last_payment_at).toLocaleDateString() : "No payments yet"}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {canManage && (
                        <Button
                          variant="ghost"
                          className="text-xs"
                          disabled={!paymentMethods.length}
                          onClick={() => {
                            setSelectedEnrollment(item);
                            setPaymentForm({ method: paymentMethods[0] ?? undefined });
                            setShowPaymentModal(true);
                          }}
                        >
                          <Wallet className="h-4 w-4 mr-1" />
                          Record payment
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!abenetList?.items.length && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-mute">
                      No enrollments found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {abenetList && abenetList.total > 10 && (
          <div className="flex justify-between items-center text-sm text-mute pt-3">
            <span>
              Page {abenetFilters.page} of {Math.ceil(abenetList.total / 10)}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={abenetFilters.page === 1}
                onClick={() => setAbenetFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                disabled={abenetFilters.page >= Math.ceil(abenetList.total / 10)}
                onClick={() => setAbenetFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-8 w-8 text-accent" />
            <div>
              <p className="text-xs uppercase text-mute tracking-wide">Abenet report</p>
              <p className="text-2xl font-semibold">{report.length ?? 0}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={() => setReportLoading(true) || getAbenetReport().then(setReport).finally(() => setReportLoading(false))}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
        {reportLoading ? (
          <div className="py-8 text-center text-mute flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading report…
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {report.map((row) => (
              <div key={`${row.child_name}-${row.parent_name}`} className="border border-border/70 rounded-2xl p-3 bg-card/70">
                <div className="font-medium">{row.child_name}</div>
                <div className="text-xs text-mute">{row.parent_name}</div>
                <div className="text-sm mt-2 flex items-center gap-2">
                  <Badge className="normal-case">{SERVICE_LABELS[row.service_stage]}</Badge>
                  <span className="text-xs text-mute">
                    Last payment: {row.last_payment_at ? new Date(row.last_payment_at).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>
            ))}
            {!report.length && <p className="text-sm text-mute">No report data available.</p>}
          </div>
        )}
      </Card>

      <AnimatePresence>
        {showEnrollmentModal && (
          <Modal title="New Abenet enrollment" onClose={() => setShowEnrollmentModal(false)}>
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Search parent</label>
                <Input
                  placeholder="Type to search members"
                  value={parentSearch}
                  onChange={(event) => setParentSearch(event.target.value)}
                />
                {parentResults.length > 0 && (
                  <ul className="mt-2 border border-border rounded-xl divide-y divide-border/70">
                    {parentResults.map((result) => (
                      <li
                        key={result.id}
                        className="px-3 py-2 text-sm hover:bg-accent/10 cursor-pointer"
                        onClick={() => handleParentSelect(result)}
                      >
                        {result.first_name} {result.last_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Parent ID</label>
                  <Input
                    type="number"
                    value={enrollmentForm.parent_member_id}
                    onChange={(event) => setEnrollmentForm((prev) => ({ ...prev, parent_member_id: event.target.value, child_id: "" }))}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (!value) return;
                      handleParentSelect({ id: value, first_name: event.target.value, last_name: "" } as MemberSummary);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Service stage</label>
                  <Select
                    value={enrollmentForm.service_stage}
                    onChange={(event) =>
                      setEnrollmentForm((prev) => ({
                        ...prev,
                        service_stage: event.target.value as AbenetEnrollment["service_stage"],
                      }))
                    }
                  >
                    {meta?.service_stages.map((value) => (
                      <option key={value} value={value}>
                        {SERVICE_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-xl border ${enrollmentForm.child_mode === "existing" ? "border-accent bg-accent/10" : "border-border"}`}
                    onClick={() => setEnrollmentForm((prev) => ({ ...prev, child_mode: "existing", child_id: "" }))}
                  >
                    Select existing child
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-xl border ${enrollmentForm.child_mode === "new" ? "border-accent bg-accent/10" : "border-border"}`}
                    onClick={() =>
                      setEnrollmentForm((prev) => ({
                        ...prev,
                        child_mode: "new",
                        child_id: "",
                        child_first_name: "",
                        child_last_name: "",
                      }))
                    }
                  >
                    Add new child
                  </button>
                </div>
                {enrollmentForm.child_mode === "existing" ? (
                  <div className="space-y-2">
                    {parentLoading && <p className="text-xs text-mute">Loading children…</p>}
                    {!parentLoading && parentDetail?.children?.length ? (
                      <ul className="space-y-2">
                        {parentDetail.children.map((child) => (
                          <li key={child.id}>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="radio"
                                name="child"
                                value={child.id}
                                checked={enrollmentForm.child_id === String(child.id)}
                                onChange={(event) => setEnrollmentForm((prev) => ({ ...prev, child_id: event.target.value }))}
                              />
                              <span>
                                {child.first_name} {child.last_name}{" "}
                                {child.birth_date && (
                                  <span className="text-xs text-mute">({new Date(child.birth_date).toLocaleDateString()})</span>
                                )}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-mute">No child records found under this parent.</p>
                    )}
                  </div>
                ) : (
                  <div className="grid md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">First name</label>
                      <Input
                        value={enrollmentForm.child_first_name}
                        onChange={(event) => setEnrollmentForm((prev) => ({ ...prev, child_first_name: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Last name</label>
                      <Input
                        value={enrollmentForm.child_last_name}
                        onChange={(event) => setEnrollmentForm((prev) => ({ ...prev, child_last_name: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Birth date</label>
                      <Input
                        type="date"
                        value={enrollmentForm.birth_date}
                        onChange={(event) => setEnrollmentForm((prev) => ({ ...prev, birth_date: event.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Enrollment date</label>
                  <Input
                    type="date"
                    value={enrollmentForm.enrollment_date}
                    onChange={(event) => setEnrollmentForm((prev) => ({ ...prev, enrollment_date: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Fixed monthly amount</label>
                  <Input value={currency(meta?.monthly_amount ?? 0)} disabled />
                </div>
              </div>

              <div>
                <label className="text-xs uppercase text-mute block mb-1">Notes</label>
                <Textarea
                  rows={3}
                  value={enrollmentForm.notes}
                  onChange={(event) => setEnrollmentForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowEnrollmentModal(false);
                    resetEnrollmentModal();
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleEnrollmentSubmit}>Save enrollment</Button>
              </div>
            </div>
          </Modal>
        )}
     </AnimatePresence>

      <AnimatePresence>
        {showPaymentModal && selectedEnrollment && (
          <Modal title="Record Abenet payment" onClose={() => setShowPaymentModal(false)}>
            <div className="space-y-3">
              <p className="text-sm">
                Recording payment for{" "}
                <strong>
                  {selectedEnrollment.child.first_name} {selectedEnrollment.child.last_name}
                </strong>{" "}
                ({selectedEnrollment.parent.first_name} {selectedEnrollment.parent.last_name})
              </p>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Amount</label>
                  <Input value={currency(meta?.monthly_amount ?? 0)} disabled readOnly />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Method</label>
                  <Select
                    value={paymentForm.method || paymentMethods[0] || ""}
                    onChange={(event) => setPaymentForm((prev) => ({ ...prev, method: event.target.value }))}
                  >
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Memo</label>
                <Textarea
                  rows={3}
                  placeholder="Optional note"
                  value={paymentForm.memo || ""}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, memo: event.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setSelectedEnrollment(null);
                    setPaymentForm({});
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handlePaymentSubmit}>Record payment</Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>        </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-4 grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-mute">Participants</p>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-accent" />
                <p className="text-2xl font-semibold">{sundayStats?.total_participants ?? "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase text-mute">Child / Youth / Adult</p>
              <p className="text-sm text-mute">
                {sundayStats ? `${sundayStats.count_child}/${sundayStats.count_youth}/${sundayStats.count_adult}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-mute">Contributors</p>
              <p className="text-sm text-mute">
                {sundayStats
                  ? `${sundayStats.count_paying_contribution} paying / ${sundayStats.count_not_paying_contribution} not contributing`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-mute">Last 30 days</p>
              <p className="text-lg font-semibold">{currency(sundayStats?.revenue_last_30_days ?? 0)}</p>
              {sundayStats && (
                <p className="text-xs text-mute">
                  Pending approvals: {sundayStats.pending_mezmur + sundayStats.pending_lessons + sundayStats.pending_art}
                </p>
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Participants</h3>
                <p className="text-sm text-mute">Child, Youth, and Adult Sunday School members.</p>
              </div>
              {canManage && (
                <Button
                  onClick={() => {
                    resetSundayForm();
                    setShowSundayForm(true);
                  }}
                >
                  <PlusCircle className="h-4 w-4" />
                  Add participant
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={sundayFilters.category}
                onChange={(event) => setSundayFilters((prev) => ({ ...prev, category: event.target.value, page: 1 }))}
              >
                <option value="">All categories</option>
                {SUNDAY_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select
                value={sundayFilters.pays}
                onChange={(event) => setSundayFilters((prev) => ({ ...prev, pays: event.target.value, page: 1 }))}
              >
                <option value="">Contribution status</option>
                <option value="yes">Pays contribution</option>
                <option value="no">Not contributing</option>
              </Select>
              <Input
                placeholder="Search name or username"
                value={sundayFilters.search}
                onChange={(event) => setSundayFilters((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
              />
              <Button variant="ghost" onClick={() => setSundayFilters({ category: "", pays: "", search: "", page: 1 })}>
                <RefreshCcw className="h-4 w-4" />
                Reset
              </Button>
            </div>
            {sundayLoading ? (
              <div className="py-10 text-center text-mute flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading participants…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-mute">
                      <th className="py-2 pr-4">Participant</th>
                      <th className="py-2 pr-4">Category</th>
                      <th className="py-2 pr-4">Contact</th>
                      <th className="py-2 pr-4">Contribution</th>
                      <th className="py-2 pr-4">Last payment</th>
                      <th className="py-2 pr-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sundayList?.items.map((item) => (
                      <tr key={item.id} className="border-t border-border/50">
                        <td className="py-3 pr-4">
                          <div className="font-medium">
                            {item.first_name} {item.last_name}
                          </div>
                          <div className="text-xs text-mute">{item.member_username}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge>{item.category}</Badge>
                        </td>
                        <td className="py-3 pr-4 text-xs">
                          {item.phone || "—"}
                          <br />
                          {item.email || "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {item.pays_contribution ? (
                            <div>
                              <p className="font-medium">{currency(item.monthly_amount || 0)}</p>
                              <p className="text-xs text-mute">{item.payment_method || "Method not set"}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-mute">Not contributing</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-xs">
                          {item.last_payment_at ? new Date(item.last_payment_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <div className="flex justify-end gap-2">
                            {canManage ? (
                              <Button
                                variant="ghost"
                                className="text-xs"
                                onClick={() => {
                                  setSundayPaymentTarget(item);
                                  setShowSundayPaymentModal(true);
                                  setSundayPaymentForm((prev) => ({
                                    ...prev,
                                    amount: item.monthly_amount ? String(item.monthly_amount) : prev.amount,
                                  }));
                                }}
                              >
                                <Wallet className="h-4 w-4 mr-1" />
                                Payment
                              </Button>
                            ) : (
                              <span className="text-xs text-mute self-center">Read only</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!sundayList?.items.length && (
                      <tr>
                        <td className="py-6 text-center text-mute" colSpan={6}>
                          No participants found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {sundayList && sundayList.total > sundayList.page_size && (
              <div className="flex justify-between items-center text-sm text-mute">
                <span>
                  Page {sundayFilters.page} of {Math.ceil(sundayList.total / sundayList.page_size)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    disabled={sundayFilters.page === 1}
                    onClick={() => setSundayFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={sundayFilters.page >= Math.ceil(sundayList.total / sundayList.page_size)}
                    onClick={() => setSundayFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Content & Publishing</h3>
                <p className="text-sm text-mute">Manage Mezmur, Lessons, and Art submissions before they go live.</p>
              </div>
              <div className="flex gap-2">
                <Select value={contentTypeFilter} onChange={(event) => setContentTypeFilter(event.target.value as SundaySchoolContent["type"])}>
                  <option value="Mezmur">Mezmur</option>
                  <option value="Lesson">Lesson</option>
                  <option value="Art">Art</option>
                </Select>
                <Select value={contentStatusFilter} onChange={(event) => setContentStatusFilter(event.target.value as SundaySchoolContent["status"] | "All")}>
                  <option value="All">All statuses</option>
                  <option value="Draft">Draft</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </Select>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">New content</h4>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Title</label>
                  <Input value={contentForm.title} onChange={(event) => setContentForm((prev) => ({ ...prev, title: event.target.value }))} />
                </div>
                {contentTypeFilter !== "Art" && (
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Body</label>
                    <Textarea
                      rows={3}
                      value={contentForm.body || ""}
                      onChange={(event) => setContentForm((prev) => ({ ...prev, body: event.target.value }))}
                    />
                  </div>
                )}
                {contentTypeFilter === "Art" ? (
                  <div className="grid gap-3">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">File path</label>
                      <Input
                        placeholder="/uploads/art.png"
                        value={contentForm.file_path || ""}
                        onChange={(event) => setContentForm((prev) => ({ ...prev, file_path: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Participant ID (optional)</label>
                      <Input
                        type="number"
                        value={contentForm.participant_id ? String(contentForm.participant_id) : ""}
                        onChange={(event) =>
                          setContentForm((prev) => ({
                            ...prev,
                            participant_id: event.target.value ? Number(event.target.value) : undefined,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Body</label>
                    <Textarea
                      rows={4}
                      placeholder="Write the lesson or mezmur text…"
                      value={contentForm.body || ""}
                      onChange={(event) => setContentForm((prev) => ({ ...prev, body: event.target.value }))}
                    />
                  </div>
                )}
                <Button onClick={handleContentSubmit}>Save content</Button>
              </div>
              <div>
                {contentLoading ? (
                  <div className="text-sm text-mute flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading content…
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
                    {contentList?.items?.map((content) => (
                      <Card key={content.id} className="p-3 space-y-2 border border-border/70">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold">{content.title}</p>
                            <p className="text-xs text-mute">
                              {content.type} • {content.status}
                            </p>
                            {content.participant && (
                              <p className="text-xs text-mute">
                                Linked to {content.participant.first_name} {content.participant.last_name}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {content.status === "Draft" && canManage && (
                              <Button variant="ghost" className="text-xs" onClick={() => handleContentAction(content, "submit")}>
                                Submit
                              </Button>
                            )}
                            {content.status === "Pending" && (
                              <div className="flex gap-2">
                                <Button variant="ghost" className="text-xs text-green-600" onClick={() => handleContentAction(content, "approve")}>
                                  Approve
                                </Button>
                                <Button variant="ghost" className="text-xs text-rose-600" onClick={() => handleContentAction(content, "reject")}>
                                  Reject
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                        {content.body && <p className="text-sm text-mute line-clamp-3">{content.body}</p>}
                        {content.file_path && (
                          <a href={content.file_path} target="_blank" rel="noreferrer" className="text-xs text-accent underline">
                            View attachment
                          </a>
                        )}
                        {content.rejection_reason && content.status === "Rejected" && (
                          <p className="text-xs text-rose-600">Reason: {content.rejection_reason}</p>
                        )}
                      </Card>
                    ))}
                    {!contentList?.items.length && <p className="text-sm text-mute">No content for this filter.</p>}
                  </div>
                )}
              </div>
            </div>
          </Card>
          <AnimatePresence>
            {showSundayForm && (
              <Modal title="New Sunday School participant" onClose={() => setShowSundayForm(false)}>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Search member</label>
                    <Input
                      placeholder="Search by name"
                      value={sundayMemberSearch}
                      onChange={(event) => setSundayMemberSearch(event.target.value)}
                    />
                    {sundayMemberResults.length > 0 && (
                      <ul className="mt-2 border border-border rounded-xl divide-y divide-border/70 max-h-40 overflow-y-auto">
                        {sundayMemberResults.map((result) => (
                          <li
                            key={result.id}
                            className="px-3 py-2 text-sm hover:bg-accent/10 cursor-pointer"
                            onClick={() => handleSundayMemberSelect(result)}
                          >
                            {result.first_name} {result.last_name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Member username (FN.LN)</label>
                      <Input
                        placeholder="hanna.mengistu"
                        value={sundayForm.member_username}
                        onChange={(event) => setSundayForm((prev) => ({ ...prev, member_username: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">First name</label>
                      <Input
                        value={sundayForm.first_name}
                        onChange={(event) => setSundayForm((prev) => ({ ...prev, first_name: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Last name</label>
                      <Input
                        value={sundayForm.last_name}
                        onChange={(event) => setSundayForm((prev) => ({ ...prev, last_name: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Category</label>
                      <Select
                        value={sundayForm.category}
                        onChange={(event) =>
                          setSundayForm((prev) => ({ ...prev, category: event.target.value as SundayFormState["category"] }))
                        }
                      >
                        {SUNDAY_CATEGORIES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Gender</label>
                      <Select
                        value={sundayForm.gender}
                        onChange={(event) => setSundayForm((prev) => ({ ...prev, gender: event.target.value as SundayFormState["gender"] }))}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Date of birth</label>
                      <Input
                        type="date"
                        value={sundayForm.dob}
                        onChange={(event) => setSundayForm((prev) => ({ ...prev, dob: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Membership date</label>
                    <Input
                      type="date"
                      value={sundayForm.membership_date}
                      onChange={(event) => setSundayForm((prev) => ({ ...prev, membership_date: event.target.value }))}
                    />
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Phone</label>
                      <Input
                        value={sundayForm.phone}
                        onChange={(event) => setSundayForm((prev) => ({ ...prev, phone: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Email</label>
                      <Input
                        value={sundayForm.email}
                        onChange={(event) => setSundayForm((prev) => ({ ...prev, email: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="sunday-pays"
                      type="checkbox"
                      checked={sundayForm.pays_contribution}
                      onChange={(event) => setSundayForm((prev) => ({ ...prev, pays_contribution: event.target.checked }))}
                    />
                    <label htmlFor="sunday-pays" className="text-sm">
                      Pays contribution
                    </label>
                  </div>
                  {sundayForm.pays_contribution && (
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs uppercase text-mute block mb-1">Monthly amount</label>
                        <Input
                          type="number"
                          min="0"
                          value={sundayForm.monthly_amount}
                          onChange={(event) => setSundayForm((prev) => ({ ...prev, monthly_amount: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute block mb-1">Payment method</label>
                        <Select
                          value={sundayForm.payment_method}
                          onChange={(event) => setSundayForm((prev) => ({ ...prev, payment_method: event.target.value }))}
                        >
                          <option value="">Select method</option>
                          {sundayMeta?.payment_methods.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowSundayForm(false);
                        resetSundayForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSundayFormSubmit}>Save participant</Button>
                  </div>
                </div>
              </Modal>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showSundayPaymentModal && sundayPaymentTarget && (
              <Modal
                title={`Record contribution for ${sundayPaymentTarget.first_name} ${sundayPaymentTarget.last_name}`}
                onClose={() => setShowSundayPaymentModal(false)}
              >
                <div className="space-y-3">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Amount</label>
                    <Input
                      type="number"
                      min="1"
                      value={sundayPaymentForm.amount}
                      onChange={(event) => setSundayPaymentForm((prev) => ({ ...prev, amount: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Method</label>
                    <Select
                      value={sundayPaymentForm.method}
                      onChange={(event) => setSundayPaymentForm((prev) => ({ ...prev, method: event.target.value }))}
                    >
                      <option value="">Select method</option>
                      {sundayMeta?.payment_methods.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Memo</label>
                    <Textarea
                      rows={3}
                      value={sundayPaymentForm.memo}
                      onChange={(event) => setSundayPaymentForm((prev) => ({ ...prev, memo: event.target.value }))}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowSundayPaymentModal(false);
                        setSundayPaymentTarget(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSundayPaymentSubmit}>Record payment</Button>
                  </div>
                </div>
              </Modal>
            )}
          </AnimatePresence>

        </div>
      )}
    </div>
  );
}

function currency(value: number | undefined | null) {
  const amount = value ?? 0;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(amount);
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="w-full max-w-2xl bg-card rounded-2xl border border-border shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
