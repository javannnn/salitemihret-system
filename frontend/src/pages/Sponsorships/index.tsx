import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, HandHeart, Loader2, PlusCircle, RefreshCcw, Users } from "lucide-react";

import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import {
  Sponsorship,
  SponsorshipListResponse,
  listSponsorships,
  createSponsorship,
  remindSponsorship,
  Newcomer,
  NewcomerListResponse,
  listNewcomers,
  createNewcomer,
  updateNewcomer,
  convertNewcomer,
} from "@/lib/api";
import { searchMembers } from "@/lib/api";

type SponsorshipFormState = {
  sponsor_member_id: string;
  beneficiary_member_id: string;
  newcomer_id: string;
  beneficiary_name: string;
  monthly_amount: string;
  start_date: string;
  frequency: "OneTime" | "Monthly" | "Quarterly" | "Yearly";
  program: string;
  notes: string;
};

type NewcomerFormState = {
  first_name: string;
  last_name: string;
  contact_phone: string;
  contact_email: string;
  arrival_date: string;
  service_type: string;
  notes: string;
};

type ConvertFormState = {
  phone: string;
  email: string;
  status: string;
  notes: string;
};

const STATUS_ORDER: Array<Newcomer["status"]> = ["New", "InProgress", "Sponsored", "Converted", "Closed"];
const FREQUENCIES: SponsorshipFormState["frequency"][] = ["Monthly", "Quarterly", "Yearly", "OneTime"];

export default function SponsorshipWorkspace() {
  const permissions = usePermissions();
  const toast = useToast();
  const [sponsorships, setSponsorships] = useState<SponsorshipListResponse | null>(null);
  const [sponsorshipLoading, setSponsorshipLoading] = useState(false);
  const [sponsorshipFilters, setSponsorshipFilters] = useState({ status: "Active", page: 1 });
  const [newcomers, setNewcomers] = useState<NewcomerListResponse | null>(null);
  const [newcomerLoading, setNewcomerLoading] = useState(false);
  const [showSponsorshipForm, setShowSponsorshipForm] = useState(false);
  const [showNewcomerForm, setShowNewcomerForm] = useState(false);
  const [convertTarget, setConvertTarget] = useState<Newcomer | null>(null);
  const [sponsorSearch, setSponsorSearch] = useState("");
  const [sponsorResults, setSponsorResults] = useState<Array<{ id: number; first_name: string; last_name: string }>>([]);
  const [sponsorLookupLoading, setSponsorLookupLoading] = useState(false);
  const [sponsorshipForm, setSponsorshipForm] = useState<SponsorshipFormState>({
    sponsor_member_id: "",
    beneficiary_member_id: "",
    newcomer_id: "",
    beneficiary_name: "",
    monthly_amount: "150",
    start_date: new Date().toISOString().slice(0, 10),
    frequency: "Monthly",
    program: "Family Support",
    notes: "",
  });
  const [newcomerForm, setNewcomerForm] = useState<NewcomerFormState>({
    first_name: "",
    last_name: "",
    contact_phone: "",
    contact_email: "",
    arrival_date: new Date().toISOString().slice(0, 10),
    service_type: "Family Settlement",
    notes: "",
  });
  const [convertForm, setConvertForm] = useState<ConvertFormState>({ phone: "", email: "", status: "Pending", notes: "" });

  const canViewBoard = permissions.viewSponsorships || permissions.manageSponsorships;
  const canViewNewcomers = permissions.viewNewcomers || permissions.manageNewcomers;

  useEffect(() => {
    if (!canViewBoard) return;
    const run = async () => {
      setSponsorshipLoading(true);
      try {
        const data = await listSponsorships({
          status: sponsorshipFilters.status || undefined,
          page: sponsorshipFilters.page,
          page_size: 10,
        });
        setSponsorships(data);
      } catch (error) {
        console.error(error);
        toast.push("Unable to load sponsorships right now.");
      } finally {
        setSponsorshipLoading(false);
      }
    };
    run();
  }, [sponsorshipFilters.page, sponsorshipFilters.status, canViewBoard, toast]);

  useEffect(() => {
    if (!canViewNewcomers) return;
    const run = async () => {
      setNewcomerLoading(true);
      try {
        const data = await listNewcomers({ page: 1, page_size: 40 });
        setNewcomers(data);
      } catch (error) {
        console.error(error);
        toast.push("Unable to load newcomer pipeline.");
      } finally {
        setNewcomerLoading(false);
      }
    };
    run();
  }, [canViewNewcomers, toast]);

  useEffect(() => {
    if (sponsorSearch.trim().length < 2) {
      setSponsorResults([]);
      return;
    }
    let cancelled = false;
    setSponsorLookupLoading(true);
    searchMembers(sponsorSearch.trim(), 5)
      .then((results) => {
        if (!cancelled) {
          setSponsorResults(results);
        }
      })
      .catch((error) => console.error(error))
      .finally(() => {
        if (!cancelled) {
          setSponsorLookupLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sponsorSearch]);

  const groupedNewcomers = useMemo(() => {
    const map: Record<Newcomer["status"], Newcomer[]> = {
      New: [],
      InProgress: [],
      Sponsored: [],
      Converted: [],
      Closed: [],
    };
    newcomers?.items.forEach((item) => {
      map[item.status]?.push(item);
    });
    return map;
  }, [newcomers]);

  const reloadNewcomers = () => {
    if (!canViewNewcomers) return;
    setNewcomerLoading(true);
    listNewcomers({ page: 1, page_size: 40 })
      .then(setNewcomers)
      .catch((error) => {
        console.error(error);
        toast.push("Unable to refresh newcomers.");
      })
      .finally(() => setNewcomerLoading(false));
  };

  const handleSponsorshipSubmit = async () => {
    if (!sponsorshipForm.sponsor_member_id) {
      toast.push("Select a sponsor before saving.");
      return;
    }
    try {
      await createSponsorship({
        sponsor_member_id: Number(sponsorshipForm.sponsor_member_id),
        beneficiary_member_id: sponsorshipForm.beneficiary_member_id ? Number(sponsorshipForm.beneficiary_member_id) : undefined,
        newcomer_id: sponsorshipForm.newcomer_id ? Number(sponsorshipForm.newcomer_id) : undefined,
        beneficiary_name: sponsorshipForm.beneficiary_name || undefined,
        monthly_amount: Number(sponsorshipForm.monthly_amount),
        start_date: sponsorshipForm.start_date,
        frequency: sponsorshipForm.frequency,
        status: "Active",
        program: sponsorshipForm.program || undefined,
        notes: sponsorshipForm.notes || undefined,
      });
      toast.push("Sponsorship saved.");
      setShowSponsorshipForm(false);
      setSponsorshipFilters((prev) => ({ ...prev }));
    } catch (error) {
      console.error(error);
      toast.push("Could not create sponsorship.");
    }
  };

  const handleNewcomerSubmit = async () => {
    if (!newcomerForm.contact_phone && !newcomerForm.contact_email) {
      toast.push("Provide at least a phone or email.");
      return;
    }
    try {
      await createNewcomer({
        first_name: newcomerForm.first_name.trim(),
        last_name: newcomerForm.last_name.trim(),
        contact_phone: newcomerForm.contact_phone || undefined,
        contact_email: newcomerForm.contact_email || undefined,
        arrival_date: newcomerForm.arrival_date,
        service_type: newcomerForm.service_type || undefined,
        notes: newcomerForm.notes || undefined,
        status: "New",
      });
      toast.push("Newcomer registered.");
      setShowNewcomerForm(false);
      setNewcomers(null);
      reloadNewcomers();
    } catch (error) {
      console.error(error);
      toast.push("Could not save newcomer.");
    }
  };

  const handleConvertSubmit = async () => {
    if (!convertTarget) return;
    try {
      await convertNewcomer(convertTarget.id, {
        phone: convertForm.phone || undefined,
        email: convertForm.email || undefined,
        status: convertForm.status || undefined,
        notes: convertForm.notes || undefined,
      });
      toast.push("Newcomer converted to member.");
      setConvertTarget(null);
      reloadNewcomers();
      setSponsorshipFilters((prev) => ({ ...prev }));
    } catch (error) {
      console.error(error);
      toast.push("Conversion failed.");
    }
  };

  const handleAdvanceStatus = async (record: Newcomer, nextStatus: Newcomer["status"]) => {
    try {
      await updateNewcomer(record.id, { status: nextStatus });
      toast.push(`Marked newcomer as ${nextStatus}.`);
      reloadNewcomers();
    } catch (error) {
      console.error(error);
      toast.push("Unable to update newcomer.");
    }
  };

  const handleRemind = async (id: number) => {
    try {
      await remindSponsorship(id);
      toast.push("Reminder queued.");
      setSponsorshipFilters((prev) => ({ ...prev }));
    } catch (error) {
      console.error(error);
      toast.push("Failed to trigger reminder.");
    }
  };

  if (!canViewBoard && !canViewNewcomers) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sponsorship Management</h1>
          <p className="text-sm text-mute">Pair sponsors with beneficiaries, track newcomer settlement, and monitor budgets.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.manageNewcomers && (
            <Button variant="ghost" onClick={() => setShowNewcomerForm(true)}>
              <PlusCircle className="h-4 w-4" />
              New newcomer
            </Button>
          )}
          {permissions.manageSponsorships && (
            <Button onClick={() => setShowSponsorshipForm(true)}>
              <HandHeart className="h-4 w-4" />
              New sponsorship
            </Button>
          )}
        </div>
      </div>

      {canViewBoard && (
        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-accent" />
              <div>
                <p className="text-sm text-mute uppercase tracking-wide">Active sponsorships</p>
                <p className="text-2xl font-semibold">{sponsorships?.total ?? "—"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Select
                value={sponsorshipFilters.status}
                onChange={(event) =>
                  setSponsorshipFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))
                }
              >
                <option value="">All statuses</option>
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Draft">Draft</option>
                <option value="Completed">Completed</option>
              </Select>
              <Button variant="ghost" onClick={() => setSponsorshipFilters((prev) => ({ ...prev }))}>
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
          {sponsorshipLoading ? (
            <div className="py-12 text-center text-mute flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sponsorships…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-mute border-b border-border">
                  <tr>
                    <th className="pb-2">Sponsor</th>
                    <th className="pb-2">Beneficiary</th>
                    <th className="pb-2">Program</th>
                    <th className="pb-2">Frequency</th>
                    <th className="pb-2 text-right">Pledged</th>
                    <th className="pb-2 text-right">Paid</th>
                    <th className="pb-2 text-right">Outstanding</th>
                    <th className="pb-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sponsorships?.items.map((item) => (
                    <tr key={item.id} className="border-b border-border/60 last:border-none">
                      <td className="py-3">
                        <div className="font-medium">{item.sponsor.first_name} {item.sponsor.last_name}</div>
                        <div className="text-xs text-mute">{item.status}</div>
                      </td>
                      <td className="py-3">
                        <div className="font-medium">{item.beneficiary_name}</div>
                        {item.newcomer && (
                          <div className="text-xs text-accent">Linked newcomer</div>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="font-medium">{item.program || "—"}</div>
                        <div className="text-xs text-mute">
                          {item.budget_slots ? `${item.used_slots}/${item.budget_slots} slots` : "Flexible slots"}
                        </div>
                      </td>
                      <td className="py-3">{item.frequency}</td>
                      <td className="py-3 text-right">{currency(item.pledged_total)}</td>
                      <td className="py-3 text-right">{currency(item.amount_paid)}</td>
                      <td className="py-3 text-right">
                        <span className={item.outstanding_balance > 0 ? "text-rose-600 font-semibold" : ""}>
                          {currency(item.outstanding_balance)}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        {permissions.manageSponsorships ? (
                          <Button
                            variant="ghost"
                            className="text-xs"
                            onClick={() => handleRemind(item.id)}
                          >
                            <Bell className="h-4 w-4" />
                            Remind
                          </Button>
                        ) : (
                          <span className="text-xs text-mute">Read only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!sponsorships?.items.length && (
                    <tr>
                      <td className="py-8 text-center text-mute" colSpan={8}>
                        No sponsorships match your filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {sponsorships && sponsorships.total > sponsorships.page_size && (
            <div className="flex justify-between items-center pt-2 text-sm text-mute">
              <span>
                Page {sponsorshipFilters.page} of {Math.ceil(sponsorships.total / sponsorships.page_size)}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  disabled={sponsorshipFilters.page === 1}
                  onClick={() =>
                    setSponsorshipFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))
                  }
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  disabled={sponsorshipFilters.page >= Math.ceil(sponsorships.total / sponsorships.page_size)}
                  onClick={() =>
                    setSponsorshipFilters((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {canViewNewcomers && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <HandHeart className="h-8 w-8 text-accent" />
              <div>
                <p className="text-sm text-mute uppercase tracking-wide">Newcomer settlement</p>
                <p className="text-2xl font-semibold">{newcomers?.total ?? "—"}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={reloadNewcomers}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
          {newcomerLoading ? (
            <div className="py-10 text-center text-mute flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading newcomer pipeline…
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-5">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{status}</h3>
                    <Badge className="text-xs">{groupedNewcomers[status]?.length ?? 0}</Badge>
                  </div>
                  <div className="space-y-3">
                    {groupedNewcomers[status]?.map((record) => (
                      <div key={record.id} className="rounded-2xl border border-border/80 bg-card/70 p-3 space-y-2">
                        <div className="font-medium">{record.first_name} {record.last_name}</div>
                        <div className="text-xs text-mute">Arrived {new Date(record.arrival_date).toLocaleDateString()}</div>
                        {record.service_type && (
                          <div className="text-xs">{record.service_type}</div>
                        )}
                        <div className="text-xs text-mute">
                          {record.contact_phone || record.contact_email || "No contact yet"}
                        </div>
                        {permissions.manageNewcomers && status !== "Converted" && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {status === "New" && (
                              <Button
                                variant="ghost"
                                className="text-xs"
                                onClick={() => handleAdvanceStatus(record, "InProgress")}
                              >
                                Start follow-up
                              </Button>
                            )}
                            {status === "InProgress" && (
                              <Button
                                variant="ghost"
                                className="text-xs"
                                onClick={() => handleAdvanceStatus(record, "Sponsored")}
                              >
                                Mark sponsored
                              </Button>
                            )}
                            <Button
                              variant="soft"
                              className="text-xs"
                              onClick={() => {
                                setConvertTarget(record);
                                setConvertForm({
                                  phone: record.contact_phone || "",
                                  email: record.contact_email || "",
                                  status: "Pending",
                                  notes: "",
                                });
                              }}
                            >
                              Convert
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {!groupedNewcomers[status]?.length && (
                      <p className="text-xs text-mute italic">No records</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <AnimatePresence>
        {showSponsorshipForm && (
          <Modal title="Create sponsorship" onClose={() => setShowSponsorshipForm(false)}>
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Sponsor search</label>
                <Input
                  placeholder="Search by name"
                  value={sponsorSearch}
                  onChange={(event) => setSponsorSearch(event.target.value)}
                />
                {sponsorLookupLoading ? (
                  <div className="text-xs text-mute mt-1">Searching…</div>
                ) : (
                  sponsorResults.length > 0 && (
                    <ul className="mt-2 border border-border rounded-xl divide-y divide-border/60">
                      {sponsorResults.map((result) => (
                        <li
                          key={result.id}
                          className="px-3 py-2 text-sm hover:bg-accent/10 cursor-pointer"
                          onClick={() => {
                            setSponsorshipForm((prev) => ({
                              ...prev,
                              sponsor_member_id: String(result.id),
                            }));
                            setSponsorResults([]);
                          }}
                        >
                          {result.first_name} {result.last_name} – #{result.id}
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Sponsor ID</label>
                  <Input
                    type="number"
                    value={sponsorshipForm.sponsor_member_id}
                    onChange={(event) =>
                      setSponsorshipForm((prev) => ({ ...prev, sponsor_member_id: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Beneficiary member ID</label>
                  <Input
                    type="number"
                    value={sponsorshipForm.beneficiary_member_id}
                    onChange={(event) =>
                      setSponsorshipForm((prev) => ({ ...prev, beneficiary_member_id: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Link newcomer</label>
                <Select
                  value={sponsorshipForm.newcomer_id}
                  onChange={(event) =>
                    setSponsorshipForm((prev) => ({ ...prev, newcomer_id: event.target.value }))
                  }
                >
                  <option value="">Select newcomer</option>
                  {newcomers?.items
                    .filter((item) => item.status !== "Converted")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.first_name} {item.last_name}
                      </option>
                    ))}
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Beneficiary name (fallback)</label>
                <Input
                  value={sponsorshipForm.beneficiary_name}
                  onChange={(event) =>
                    setSponsorshipForm((prev) => ({ ...prev, beneficiary_name: event.target.value }))
                  }
                  placeholder="Family or newcomer name"
                />
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Monthly amount (CAD)</label>
                  <Input
                    type="number"
                    min="1"
                    step="10"
                    value={sponsorshipForm.monthly_amount}
                    onChange={(event) =>
                      setSponsorshipForm((prev) => ({ ...prev, monthly_amount: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Start date</label>
                  <Input
                    type="date"
                    value={sponsorshipForm.start_date}
                    onChange={(event) =>
                      setSponsorshipForm((prev) => ({ ...prev, start_date: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Frequency</label>
                  <Select
                    value={sponsorshipForm.frequency}
                    onChange={(event) =>
                      setSponsorshipForm((prev) => ({
                        ...prev,
                        frequency: event.target.value as SponsorshipFormState["frequency"],
                      }))
                    }
                  >
                    {FREQUENCIES.map((freq) => (
                      <option key={freq} value={freq}>
                        {freq}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Program</label>
                  <Input
                    value={sponsorshipForm.program}
                    onChange={(event) =>
                      setSponsorshipForm((prev) => ({ ...prev, program: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Notes</label>
                <Textarea
                  rows={3}
                  value={sponsorshipForm.notes}
                  onChange={(event) =>
                    setSponsorshipForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setShowSponsorshipForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSponsorshipSubmit}>Save sponsorship</Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewcomerForm && (
          <Modal title="Register newcomer" onClose={() => setShowNewcomerForm(false)}>
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">First name</label>
                  <Input
                    value={newcomerForm.first_name}
                    onChange={(event) =>
                      setNewcomerForm((prev) => ({ ...prev, first_name: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Last name</label>
                  <Input
                    value={newcomerForm.last_name}
                    onChange={(event) =>
                      setNewcomerForm((prev) => ({ ...prev, last_name: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Phone</label>
                  <Input
                    value={newcomerForm.contact_phone}
                    onChange={(event) =>
                      setNewcomerForm((prev) => ({ ...prev, contact_phone: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Email</label>
                  <Input
                    type="email"
                    value={newcomerForm.contact_email}
                    onChange={(event) =>
                      setNewcomerForm((prev) => ({ ...prev, contact_email: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Arrival date</label>
                  <Input
                    type="date"
                    value={newcomerForm.arrival_date}
                    onChange={(event) =>
                      setNewcomerForm((prev) => ({ ...prev, arrival_date: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Service type</label>
                  <Input
                    value={newcomerForm.service_type}
                    onChange={(event) =>
                      setNewcomerForm((prev) => ({ ...prev, service_type: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Notes</label>
                <Textarea
                  rows={3}
                  value={newcomerForm.notes}
                  onChange={(event) =>
                    setNewcomerForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setShowNewcomerForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleNewcomerSubmit}>Save newcomer</Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {convertTarget && (
          <Modal
            title={`Convert ${convertTarget.first_name} ${convertTarget.last_name}`}
            onClose={() => setConvertTarget(null)}
          >
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Phone</label>
                  <Input
                    value={convertForm.phone}
                    onChange={(event) => setConvertForm((prev) => ({ ...prev, phone: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Email</label>
                  <Input
                    type="email"
                    value={convertForm.email}
                    onChange={(event) => setConvertForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Member status</label>
                <Select
                  value={convertForm.status}
                  onChange={(event) =>
                    setConvertForm((prev) => ({ ...prev, status: event.target.value }))
                  }
                >
                  <option value="Pending">Pending</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Notes</label>
                <Textarea
                  rows={3}
                  value={convertForm.notes}
                  onChange={(event) => setConvertForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConvertTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={handleConvertSubmit}>Convert</Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function currency(value: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(
    value || 0,
  );
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
          className="w-full max-w-2xl bg-card rounded-2xl border border-border shadow-2xl p-6 space-y-4"
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
