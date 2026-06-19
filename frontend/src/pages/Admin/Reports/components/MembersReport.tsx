import { useState, useEffect, useMemo, useRef } from "react";
import {
    ApiError,
    IndividualMemberReport,
    Member,
    Page,
    api,
    getIndividualMemberReport,
    parseApiErrorMessage,
    searchMembers,
} from "@/lib/api";
import { StatCard } from "./StatCard";
import { Users, UserPlus, UserCheck, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useToast } from "@/components/Toast";
import { DateRangeControls, DateRangeValue } from "./DateRangeControls";

const formatMoney = (amount?: number | string | null, currency = "CAD") => {
    if (amount === undefined || amount === null || amount === "") return "-";
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return `${amount} ${currency}`;
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(numeric);
};

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString() : "-");

const memberName = (member: Pick<Member, "first_name" | "last_name">) => `${member.first_name} ${member.last_name}`.trim();

type MembersReportProps = {
    individualOnly?: boolean;
    individualReportSource?: "members" | "payments";
    individualTitle?: string;
    individualDescription?: string;
};

export function MembersReport({
    individualOnly = false,
    individualReportSource = "members",
    individualTitle = "Individual Member Report",
    individualDescription = "Full single-member report: profile, family, Sunday school, contributions, payments, sponsorships, and membership history.",
}: MembersReportProps = {}) {
    const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" });
    const [individualDateRange, setIndividualDateRange] = useState<DateRangeValue>({ start: "", end: "" });
    const [recentMembers, setRecentMembers] = useState<Member[]>([]);
    const [counts, setCounts] = useState({
        total: 0,
        active: 0,
        inactive: 0,
        pending: 0,
        archived: 0,
        newThisMonth: 0,
        missingPhone: 0,
        hasChildren: 0,
    });
    const [loading, setLoading] = useState(true);
    const [memberSearch, setMemberSearch] = useState("");
    const [memberMatches, setMemberMatches] = useState<Member[]>([]);
    const [memberSearchLoading, setMemberSearchLoading] = useState(false);
    const [selectedMember, setSelectedMember] = useState<Member | null>(null);
    const [individualReport, setIndividualReport] = useState<IndividualMemberReport | null>(null);
    const [individualLoading, setIndividualLoading] = useState(false);
    const individualRequestId = useRef(0);
    const toast = useToast();
    const isPaymentReport = individualReportSource === "payments";

    const normalizedRange = useMemo(() => {
        if (dateRange.start && dateRange.end && dateRange.start > dateRange.end) {
            return { start: dateRange.end, end: dateRange.start };
        }
        return dateRange;
    }, [dateRange]);
    const hasRange = Boolean(normalizedRange.start || normalizedRange.end);
    const normalizedIndividualRange = useMemo(() => {
        if (individualDateRange.start && individualDateRange.end && individualDateRange.start > individualDateRange.end) {
            return { start: individualDateRange.end, end: individualDateRange.start };
        }
        return individualDateRange;
    }, [individualDateRange]);

    useEffect(() => {
        let cancelled = false;
        const fetchCount = async (params: Record<string, string | number | boolean | undefined>) => {
            const search = new URLSearchParams({ page: "1", page_size: "1" });
            if (hasRange && normalizedRange.start) {
                search.set("created_from", normalizedRange.start);
            }
            if (hasRange && normalizedRange.end) {
                search.set("created_to", normalizedRange.end);
            }
            Object.entries(params).forEach(([key, value]) => {
                if (value === undefined) return;
                search.set(key, String(value));
            });
            const response = await api<Page<Member>>(`/members?${search.toString()}`);
            return response.total;
        };

        const fetchMembers = async () => {
            setLoading(true);
            try {
                const recentParams = new URLSearchParams({
                    page: "1",
                    page_size: "6",
                    sort: "-created_at",
                });
                if (hasRange && normalizedRange.start) {
                    recentParams.set("created_from", normalizedRange.start);
                }
                if (hasRange && normalizedRange.end) {
                    recentParams.set("created_to", normalizedRange.end);
                }

                const results = await Promise.allSettled([
                    fetchCount({}),
                    fetchCount({ status: "Active" }),
                    fetchCount({ status: "Inactive" }),
                    fetchCount({ status: "Pending" }),
                    fetchCount({ status: "Archived" }),
                    hasRange ? Promise.resolve(0) : fetchCount({ new_this_month: true }),
                    fetchCount({ missing_phone: true }),
                    fetchCount({ has_children: true }),
                    api<Page<Member>>(`/members?${recentParams.toString()}`),
                ]);

                if (cancelled) return;

                const resolve = <T,>(res: PromiseSettledResult<T>, fallback: T) =>
                    res.status === "fulfilled" ? res.value : fallback;

                const total = resolve(results[0], 0);
                const active = resolve(results[1], 0);
                const inactive = resolve(results[2], 0);
                const pending = resolve(results[3], 0);
                const archived = resolve(results[4], 0);
                const newThisMonth = resolve(results[5], 0);
                const missingPhone = resolve(results[6], 0);
                const hasChildren = resolve(results[7], 0);
                const recent = resolve(results[8], { items: [], total: 0, page: 1, page_size: 6 } as Page<Member>);

                setCounts({
                    total,
                    active,
                    inactive,
                    pending,
                    archived,
                    newThisMonth,
                    missingPhone,
                    hasChildren,
                });
                setRecentMembers(recent.items);
            } catch (error) {
                console.error("Failed to fetch members:", error);
                if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                    toast.push("Member data access is restricted for this role.");
                } else {
                    toast.push("Failed to load member data", "error");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchMembers();
        return () => {
            cancelled = true;
        };
    }, [toast, hasRange, normalizedRange.start, normalizedRange.end]);

    useEffect(() => {
        const term = memberSearch.trim();
        if (selectedMember) {
            setMemberMatches([]);
            setMemberSearchLoading(false);
            return;
        }
        if (term.length < 2) {
            setMemberMatches([]);
            setMemberSearchLoading(false);
            return;
        }

        let cancelled = false;
        setMemberSearchLoading(true);
        const timer = window.setTimeout(() => {
            searchMembers(term, 6)
                .then((response) => {
                    if (!cancelled) {
                        setMemberMatches(response.items);
                    }
                })
                .catch((error) => {
                    console.error("Failed to search members:", error);
                    if (!cancelled) {
                        toast.push(parseApiErrorMessage(error, "Failed to search members"), "error");
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setMemberSearchLoading(false);
                    }
                });
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [memberSearch, selectedMember, toast]);

    const loadIndividualReport = async (member = selectedMember, range = normalizedIndividualRange) => {
        if (!member) {
            toast.push("Select a member first");
            return;
        }
        const requestId = ++individualRequestId.current;
        setIndividualLoading(true);
        try {
            const report = await getIndividualMemberReport(member.id, individualReportSource, {
                start_date: range.start || undefined,
                end_date: range.end || undefined,
            });
            if (requestId === individualRequestId.current) {
                setIndividualReport(report);
            }
        } catch (error) {
            if (requestId === individualRequestId.current) {
                console.error("Failed to load individual member report:", error);
                toast.push(parseApiErrorMessage(error, "Failed to load individual member report"), "error");
            }
        } finally {
            if (requestId === individualRequestId.current) {
                setIndividualLoading(false);
            }
        }
    };

    const changeIndividualDateRange = (next: DateRangeValue) => {
        setIndividualDateRange(next);
        if (!selectedMember) return;
        setIndividualReport(null);
        const normalized = next.start && next.end && next.start > next.end
            ? { start: next.end, end: next.start }
            : next;
        void loadIndividualReport(selectedMember, normalized);
    };

    const downloadIndividualReport = () => {
        if (!individualReport) return;
        const safeName = `${individualReport.member.first_name}-${individualReport.member.last_name}-${individualReport.member.id}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        const blob = new Blob([JSON.stringify(individualReport, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `individual-member-report-${safeName || individualReport.member.id}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    if (loading && !individualOnly) {
        return <div className="p-8 text-center text-muted">Loading member statistics...</div>;
    }

    const statusData = [
        { name: "Active", value: counts.active, color: "#10b981" },
        { name: "Inactive", value: counts.inactive, color: "#ef4444" },
        { name: "Pending", value: counts.pending, color: "#f59e0b" },
        { name: "Archived", value: counts.archived, color: "#6b7280" },
    ];

    const totalLabel = hasRange ? "Members in Range" : "Total Members";
    const totalDescription = hasRange ? "Created in selected range" : "All registered members";
    const activeLabel = hasRange ? "Active in Range" : "Active Members";
    const activeDescription = hasRange ? "Active among selected range" : "Currently active";
    const thirdLabel = hasRange ? "Pending in Range" : "New This Month";
    const thirdValue = hasRange ? counts.pending : counts.newThisMonth;
    const thirdDescription = hasRange ? "Pending approvals in range" : "Joined in current month";
    const fourthLabel = hasRange ? "Missing Phone" : "Missing Phone";
    const fourthDescription = hasRange ? "Missing phone in range" : "Profiles missing phone";

    return (
        <div className="space-y-6">
            {!individualOnly && (
            <>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-ink">Member Report</h2>
                    <p className="text-sm text-muted">Track member growth, status, and data quality.</p>
                </div>
                <DateRangeControls value={dateRange} onChange={setDateRange} />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title={totalLabel}
                    value={counts.total}
                    icon={Users}
                    description={totalDescription}
                />
                <StatCard
                    title={activeLabel}
                    value={counts.active}
                    icon={UserCheck}
                    description={activeDescription}
                    trend={{
                        value: counts.total ? Math.round((counts.active / counts.total) * 100) : 0,
                        label: "of total",
                        positive: true,
                    }}
                />
                <StatCard
                    title={thirdLabel}
                    value={thirdValue}
                    icon={UserPlus}
                    description={thirdDescription}
                />
                <StatCard
                    title={fourthLabel}
                    value={counts.missingPhone}
                    icon={AlertTriangle}
                    description={fourthDescription}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
                    <h3 className="mb-4 text-lg font-semibold text-ink">Member Status Distribution</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={statusData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    stroke="var(--color-muted)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="var(--color-muted)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}`}
                                />
                                <Tooltip
                                    cursor={{ fill: "var(--color-accent)", opacity: 0.1 }}
                                    contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "8px" }}
                                    itemStyle={{ color: "var(--color-ink)" }}
                                />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-card p-6">
                        <h3 className="text-lg font-semibold text-ink">Roster Health</h3>
                        <p className="text-sm text-muted">Data quality and key cohorts</p>
                        <div className="mt-4 space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Missing phone numbers</span>
                                <span className="font-semibold text-ink">{counts.missingPhone}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Members with children</span>
                                <span className="font-semibold text-ink">{counts.hasChildren}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Pending approvals</span>
                                <span className="font-semibold text-ink">{counts.pending}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Archived records</span>
                                <span className="font-semibold text-ink">{counts.archived}</span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-6">
                        <h3 className="text-lg font-semibold text-ink">Recent Members</h3>
                        <p className="text-sm text-muted">Latest registrations</p>
                        {recentMembers.length === 0 ? (
                            <div className="mt-4 text-sm text-muted">No recent members found.</div>
                        ) : (
                            <ul className="mt-4 space-y-3 text-sm">
                                {recentMembers.map((member) => (
                                    <li key={member.id} className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="font-medium text-ink">{member.first_name} {member.last_name}</div>
                                            <div className="text-[11px] text-muted">Status: {member.status || "—"}</div>
                                        </div>
                                        <div className="text-[11px] text-muted">
                                            {member.created_at ? new Date(member.created_at).toLocaleDateString() : "—"}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
            </>
            )}

            <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-ink">{individualTitle}</h3>
                        <p className="text-sm text-muted">
                            {individualDescription}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-end justify-end gap-3">
                        <DateRangeControls
                            value={individualDateRange}
                            onChange={changeIndividualDateRange}
                            label="Individual report"
                        />
                        {individualReport && (
                            <button
                                type="button"
                                onClick={downloadIndividualReport}
                                className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-ink hover:bg-accent/10"
                            >
                                Download JSON
                            </button>
                        )}
                    </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="relative">
                        <input
                            value={memberSearch}
                            onChange={(event) => {
                                individualRequestId.current += 1;
                                setMemberSearch(event.target.value);
                                setSelectedMember(null);
                                setIndividualReport(null);
                                setIndividualLoading(false);
                            }}
                            placeholder="Search member by name, phone, email, or username"
                            className="w-full rounded-xl border border-border bg-card/80 p-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-accent"
                        />
                        {!selectedMember && memberSearch.trim().length >= 2 && (
                            <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                                {memberSearchLoading ? (
                                    <div className="p-3 text-sm text-muted">Searching...</div>
                                ) : memberMatches.length === 0 ? (
                                    <div className="p-3 text-sm text-muted">No members found.</div>
                                ) : (
                                    memberMatches.map((member) => (
                                        <button
                                            key={member.id}
                                            type="button"
                                            className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent/10"
                                            onClick={() => {
                                                setSelectedMember(member);
                                                setMemberSearch(`${memberName(member)} (${member.username})`);
                                                setMemberMatches([]);
                                                setIndividualReport(null);
                                            }}
                                        >
                                            <span className="block font-medium text-ink">{memberName(member)}</span>
                                            <span className="text-xs text-muted">
                                                {member.username} · {member.status} · {member.phone || member.email || "No contact"}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => loadIndividualReport()}
                        disabled={!selectedMember || individualLoading}
                        className="rounded-xl border border-accent bg-accent px-4 py-3 text-sm font-medium text-accent-foreground transition hover:shadow-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {individualLoading ? "Loading..." : "Load report"}
                    </button>
                </div>

                {individualReport && (
                    <div className="mt-6 space-y-5">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border border-border bg-background/40 p-4">
                                <div className="text-xs uppercase text-muted">Member</div>
                                <div className="mt-1 font-semibold text-ink">
                                    {individualReport.member.first_name} {individualReport.member.last_name}
                                </div>
                                <div className="text-xs text-muted">{individualReport.member.username}</div>
                            </div>
                            <div className="rounded-xl border border-border bg-background/40 p-4">
                                <div className="text-xs uppercase text-muted">Membership</div>
                                <div className="mt-1 font-semibold text-ink">{individualReport.membership_health.effective_status}</div>
                                <div className="text-xs text-muted">
                                    Next due: {formatDate(individualReport.membership_health.next_due_at)}
                                </div>
                            </div>
                            <div className="rounded-xl border border-border bg-background/40 p-4">
                                <div className="text-xs uppercase text-muted">Household</div>
                                <div className="mt-1 font-semibold text-ink">{individualReport.household?.name ?? "-"}</div>
                                <div className="text-xs text-muted">{individualReport.children.length} children recorded</div>
                            </div>
                            <div className="rounded-xl border border-border bg-background/40 p-4">
                                <div className="text-xs uppercase text-muted">Generated</div>
                                <div className="mt-1 font-semibold text-ink">{new Date(individualReport.generated_at).toLocaleString()}</div>
                                <div className="text-xs text-muted">Finance access confirmed</div>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-xl border border-border bg-background/40 p-4">
                                <h4 className="font-semibold text-ink">Profile & Family</h4>
                                <div className="mt-3 space-y-2 text-sm">
                                    <div className="flex justify-between gap-3"><span className="text-muted">Membership date</span><span className="text-ink">{formatDate(individualReport.client_report_fields.membership.membership_date)}</span></div>
                                    <div className="flex justify-between gap-3"><span className="text-muted">Phone</span><span className="text-ink">{individualReport.member.phone || "-"}</span></div>
                                    <div className="flex justify-between gap-3"><span className="text-muted">Email</span><span className="text-ink">{individualReport.member.email || "-"}</span></div>
                                    <div className="flex justify-between gap-3"><span className="text-muted">Address</span><span className="text-ink">{individualReport.member.address || "-"}</span></div>
                                    <div className="flex justify-between gap-3"><span className="text-muted">Spouse name</span><span className="text-ink">{individualReport.client_report_fields.membership.spouse_name ?? "-"}</span></div>
                                    <div className="flex justify-between gap-3"><span className="text-muted">Children / birth year</span><span className="text-ink">{individualReport.client_report_fields.membership.children.map((child) => `${child.child_name}${child.birth_year ? ` (${child.birth_year})` : ""}`).join(", ") || "-"}</span></div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-border bg-background/40 p-4">
                                <h4 className="font-semibold text-ink">Tags, Ministries & Sunday School</h4>
                                <div className="mt-3 space-y-2 text-sm">
                                    <div className="flex justify-between gap-3"><span className="text-muted">Tags</span><span className="text-ink">{individualReport.tags.map((tag) => tag.name).join(", ") || "-"}</span></div>
                                    <div className="flex justify-between gap-3"><span className="text-muted">Ministries</span><span className="text-ink">{individualReport.ministries.map((ministry) => ministry.name).join(", ") || "-"}</span></div>
                                    <div className="flex justify-between gap-3"><span className="text-muted">Participants</span><span className="text-ink">{individualReport.sunday_school_participants.length}</span></div>
                                    <div className="flex justify-between gap-3"><span className="text-muted">Sunday payments</span><span className="text-ink">{individualReport.sunday_school_payments.length}</span></div>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-xl border border-border bg-background/40 p-4">
                                <h4 className="font-semibold text-ink">Payments</h4>
                                <div className="mt-3 space-y-2 text-sm">
                                    {individualReport.client_report_fields.payments.slice(0, 5).map((payment, index) => (
                                        <div key={`client-payment-${payment.payment_date}-${index}`} className="flex justify-between gap-3">
                                            <span className="text-muted">
                                                {payment.first_name} {payment.last_name} · {formatDate(payment.payment_date)}
                                            </span>
                                            <span className="font-medium text-ink">{formatMoney(payment.amount, payment.currency)}</span>
                                        </div>
                                    ))}
                                    {individualReport.contribution_history.slice(0, 5).map((payment) => (
                                        <div key={`contribution-${payment.id}`} className="flex justify-between gap-3">
                                            <span className="text-muted">Contribution · {formatDate(payment.paid_at)}</span>
                                            <span className="font-medium text-ink">{formatMoney(payment.amount, payment.currency)}</span>
                                        </div>
                                    ))}
                                    {individualReport.payments.slice(0, 5).map((payment) => (
                                        <div key={`payment-${payment.id}`} className="flex justify-between gap-3">
                                            <span className="text-muted">{payment.service_type?.label ?? "Payment"} · {formatDate(payment.posted_at)}</span>
                                            <span className="font-medium text-ink">{formatMoney(payment.amount, payment.currency)}</span>
                                        </div>
                                    ))}
                                    {individualReport.contribution_history.length === 0 && individualReport.payments.length === 0 && (
                                        <div className="text-muted">No payment records found.</div>
                                    )}
                                </div>
                            </div>

                            {!isPaymentReport && (
                                <div className="rounded-xl border border-border bg-background/40 p-4">
                                    <h4 className="font-semibold text-ink">Sponsorship Report Fields</h4>
                                    <div className="mt-3 space-y-2 text-sm">
                                        <div className="flex justify-between gap-3"><span className="text-muted">Membership date</span><span className="text-ink">{formatDate(individualReport.client_report_fields.sponsorship.membership_date)}</span></div>
                                        <div className="flex justify-between gap-3"><span className="text-muted">Last sponsored date</span><span className="text-ink">{formatDate(individualReport.client_report_fields.sponsorship.last_sponsored_date)}</span></div>
                                        <div className="flex justify-between gap-3"><span className="text-muted">Number sponsored</span><span className="text-ink">{individualReport.client_report_fields.sponsorship.number_sponsored}</span></div>
                                        <div className="flex justify-between gap-3"><span className="text-muted">Last sponsor status</span><span className="text-ink">{individualReport.client_report_fields.sponsorship.last_sponsor_status || "-"}</span></div>
                                        {individualReport.client_report_fields.sponsorship.payment_information_by_year.slice(0, 5).map((summary) => (
                                            <div key={`payment-year-${summary.year}`} className="flex justify-between gap-3">
                                                <span className="text-muted">Payment information · {summary.year}</span>
                                                <span className="font-medium text-ink">{formatMoney(summary.total_amount, summary.currency)} ({summary.payment_count})</span>
                                            </div>
                                        ))}
                                        {individualReport.client_report_fields.sponsorship.volunteer_rows.slice(0, 5).map((row, index) => (
                                            <div key={`volunteer-${row.volunteer_date}-${row.service_type}-${index}`} className="flex justify-between gap-3">
                                                <span className="text-muted">Volunteer · {formatDate(row.volunteer_date)}</span>
                                                <span className="font-medium text-ink">{row.service_type}</span>
                                            </div>
                                        ))}
                                        {individualReport.sponsorships.slice(0, 5).map((sponsorship) => (
                                            <div key={`sponsorship-${sponsorship.id}`} className="flex justify-between gap-3">
                                                <span className="text-muted">{sponsorship.role} · {sponsorship.beneficiary_name}</span>
                                                <span className="font-medium text-ink">{sponsorship.status}</span>
                                            </div>
                                        ))}
                                        {individualReport.membership_events.slice(0, 5).map((event) => (
                                            <div key={`${event.type}-${event.timestamp}`} className="flex justify-between gap-3">
                                                <span className="text-muted">{event.type} · {formatDate(event.timestamp)}</span>
                                                <span className="font-medium text-ink">{event.label}</span>
                                            </div>
                                        ))}
                                        {individualReport.sponsorships.length === 0 && individualReport.membership_events.length === 0 && (
                                            <div className="text-muted">No sponsorship or membership event records found.</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
