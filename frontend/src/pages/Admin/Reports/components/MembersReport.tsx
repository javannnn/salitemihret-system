import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
import { AlertTriangle, UserCheck, UserPlus, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
    const normalizedIndividualRange = useMemo(() => {
        if (individualDateRange.start && individualDateRange.end && individualDateRange.start > individualDateRange.end) {
            return { start: individualDateRange.end, end: individualDateRange.start };
        }
        return individualDateRange;
    }, [individualDateRange]);
    const hasRange = Boolean(normalizedRange.start || normalizedRange.end);

    useEffect(() => {
        if (individualOnly || individualReport) return;
        let cancelled = false;
        const fetchCount = async (params: Record<string, string | number | boolean | undefined>) => {
            const search = new URLSearchParams({ page: "1", page_size: "1" });
            if (hasRange && normalizedRange.start) search.set("created_from", normalizedRange.start);
            if (hasRange && normalizedRange.end) search.set("created_to", normalizedRange.end);
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) search.set(key, String(value));
            });
            const response = await api<Page<Member>>(`/members?${search.toString()}`);
            return response.total;
        };

        const fetchMembers = async () => {
            setLoading(true);
            try {
                const recentParams = new URLSearchParams({ page: "1", page_size: "6", sort: "-created_at" });
                if (hasRange && normalizedRange.start) recentParams.set("created_from", normalizedRange.start);
                if (hasRange && normalizedRange.end) recentParams.set("created_to", normalizedRange.end);
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
                const resolve = <T,>(res: PromiseSettledResult<T>, fallback: T) => (res.status === "fulfilled" ? res.value : fallback);
                setCounts({
                    total: resolve(results[0], 0),
                    active: resolve(results[1], 0),
                    inactive: resolve(results[2], 0),
                    pending: resolve(results[3], 0),
                    archived: resolve(results[4], 0),
                    newThisMonth: resolve(results[5], 0),
                    missingPhone: resolve(results[6], 0),
                    hasChildren: resolve(results[7], 0),
                });
                setRecentMembers(resolve(results[8], { items: [], total: 0, page: 1, page_size: 6 } as Page<Member>).items);
            } catch (error) {
                console.error("Failed to fetch members:", error);
                toast.push(error instanceof ApiError && (error.status === 401 || error.status === 403) ? "Member data access is restricted for this role." : "Failed to load member data", "error");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchMembers();
        return () => {
            cancelled = true;
        };
    }, [toast, hasRange, normalizedRange.start, normalizedRange.end, individualOnly, individualReport]);

    useEffect(() => {
        const term = memberSearch.trim();
        if (selectedMember || term.length < 2) {
            setMemberMatches([]);
            setMemberSearchLoading(false);
            return;
        }
        let cancelled = false;
        setMemberSearchLoading(true);
        const timer = window.setTimeout(() => {
            searchMembers(term, 6)
                .then((response) => {
                    if (!cancelled) setMemberMatches(response.items);
                })
                .catch((error) => {
                    console.error("Failed to search members:", error);
                    if (!cancelled) toast.push(parseApiErrorMessage(error, "Failed to search members"), "error");
                })
                .finally(() => {
                    if (!cancelled) setMemberSearchLoading(false);
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
            if (requestId === individualRequestId.current) setIndividualReport(report);
        } catch (error) {
            if (requestId === individualRequestId.current) {
                console.error("Failed to load individual member report:", error);
                toast.push(parseApiErrorMessage(error, "Failed to load individual member report"), "error");
            }
        } finally {
            if (requestId === individualRequestId.current) setIndividualLoading(false);
        }
    };

    const changeIndividualDateRange = (next: DateRangeValue) => {
        setIndividualDateRange(next);
        if (!selectedMember) return;
        setIndividualReport(null);
        const normalized = next.start && next.end && next.start > next.end ? { start: next.end, end: next.start } : next;
        void loadIndividualReport(selectedMember, normalized);
    };

    const downloadIndividualReport = () => {
        if (!individualReport) return;
        const safeName = `${individualReport.member.first_name}-${individualReport.member.last_name}-${individualReport.member.id}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const url = URL.createObjectURL(new Blob([JSON.stringify(individualReport, null, 2)], { type: "application/json" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `individual-member-report-${safeName || individualReport.member.id}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const statusData = [
        { name: "Active", value: counts.active, color: "#10b981" },
        { name: "Inactive", value: counts.inactive, color: "#ef4444" },
        { name: "Pending", value: counts.pending, color: "#f59e0b" },
        { name: "Archived", value: counts.archived, color: "#6b7280" },
    ];
    const canShowFinancialSections = Boolean(individualReport?.financial_access);
    const showGeneralReport = !individualOnly && !selectedMember && !individualReport;

    return (
        <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-ink">{individualTitle}</h3>
                        <p className="text-sm text-muted">{individualDescription}</p>
                    </div>
                    <div className="flex flex-wrap items-end justify-end gap-3">
                        <DateRangeControls value={individualDateRange} onChange={changeIndividualDateRange} label="Individual report" />
                        {individualReport && (
                            <button type="button" onClick={downloadIndividualReport} className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-ink hover:bg-accent/10">
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
                                            <span className="text-xs text-muted">{member.username} · {member.status} · {member.phone || member.email || "No contact"}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                    <button type="button" onClick={() => loadIndividualReport()} disabled={!selectedMember || individualLoading} className="rounded-xl border border-accent bg-accent px-4 py-3 text-sm font-medium text-accent-foreground transition hover:shadow-ring disabled:cursor-not-allowed disabled:opacity-50">
                        {individualLoading ? "Loading..." : "Load report"}
                    </button>
                </div>

                {individualReport && (
                    <div className="mt-6 space-y-5">
                        {!canShowFinancialSections && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                Financial sections are hidden for this role. Profile, household, Sunday School, sponsorship, and membership details remain available.
                            </div>
                        )}
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Snapshot label="Member" value={`${individualReport.member.first_name} ${individualReport.member.last_name}`} detail={individualReport.member.username} />
                            <Snapshot label="Membership" value={individualReport.membership_health.effective_status} detail={`Next due: ${formatDate(individualReport.membership_health.next_due_at)}`} />
                            <Snapshot label="Household" value={individualReport.household?.name ?? "-"} detail={`${individualReport.children.length} children recorded`} />
                            <Snapshot label="Generated" value={new Date(individualReport.generated_at).toLocaleString()} detail={canShowFinancialSections ? "Finance access confirmed" : "Finance hidden"} />
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <ReportBox title="Profile & Family">
                                <Field label="Membership date" value={formatDate(individualReport.client_report_fields.membership.membership_date)} />
                                <Field label="Phone" value={individualReport.member.phone || "-"} />
                                <Field label="Email" value={individualReport.member.email || "-"} />
                                <Field label="Address" value={individualReport.member.address || "-"} />
                                <Field label="Spouse name" value={individualReport.client_report_fields.membership.spouse_name ?? "-"} />
                                <Field label="Children / birth year" value={individualReport.client_report_fields.membership.children.map((child) => `${child.child_name}${child.birth_year ? ` (${child.birth_year})` : ""}`).join(", ") || "-"} />
                            </ReportBox>
                            <ReportBox title="Tags, Ministries & Sunday School">
                                <Field label="Tags" value={individualReport.tags.map((tag) => tag.name).join(", ") || "-"} />
                                <Field label="Ministries" value={individualReport.ministries.map((ministry) => ministry.name).join(", ") || "-"} />
                                <Field label="Participants" value={individualReport.sunday_school_participants.length} />
                                {canShowFinancialSections && <Field label="Sunday payments" value={individualReport.sunday_school_payments.length} />}
                            </ReportBox>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            {canShowFinancialSections && (
                                <ReportBox title="Payments">
                                    {individualReport.client_report_fields.payments.slice(0, 5).map((payment, index) => (
                                        <Field key={`client-payment-${payment.payment_date}-${index}`} label={`${payment.first_name} ${payment.last_name} · ${formatDate(payment.payment_date)}`} value={formatMoney(payment.amount, payment.currency)} strong />
                                    ))}
                                    {individualReport.contribution_history.slice(0, 5).map((payment) => (
                                        <Field key={`contribution-${payment.id}`} label={`Contribution · ${formatDate(payment.paid_at)}`} value={formatMoney(payment.amount, payment.currency)} strong />
                                    ))}
                                    {individualReport.payments.slice(0, 5).map((payment) => (
                                        <Field key={`payment-${payment.id}`} label={`${payment.service_type?.label ?? "Payment"} · ${formatDate(payment.posted_at)}`} value={formatMoney(payment.amount, payment.currency)} strong />
                                    ))}
                                    {individualReport.contribution_history.length === 0 && individualReport.payments.length === 0 && <div className="text-muted">No payment records found.</div>}
                                </ReportBox>
                            )}
                            {!isPaymentReport && (
                                <ReportBox title="Sponsorship Report Fields">
                                    <Field label="Membership date" value={formatDate(individualReport.client_report_fields.sponsorship.membership_date)} />
                                    <Field label="Last sponsored date" value={formatDate(individualReport.client_report_fields.sponsorship.last_sponsored_date)} />
                                    <Field label="Number sponsored" value={individualReport.client_report_fields.sponsorship.number_sponsored} />
                                    <Field label="Last sponsor status" value={individualReport.client_report_fields.sponsorship.last_sponsor_status || "-"} />
                                    {canShowFinancialSections && individualReport.client_report_fields.sponsorship.payment_information_by_year.slice(0, 5).map((summary) => (
                                        <Field key={`payment-year-${summary.year}`} label={`Payment information · ${summary.year}`} value={`${formatMoney(summary.total_amount, summary.currency)} (${summary.payment_count})`} strong />
                                    ))}
                                    {individualReport.client_report_fields.sponsorship.volunteer_rows.slice(0, 5).map((row, index) => (
                                        <Field key={`volunteer-${row.volunteer_date}-${row.service_type}-${index}`} label={`Volunteer · ${formatDate(row.volunteer_date)}`} value={row.service_type} strong />
                                    ))}
                                    {individualReport.sponsorships.slice(0, 5).map((sponsorship) => (
                                        <Field key={`sponsorship-${sponsorship.id}`} label={`${sponsorship.role} · ${sponsorship.beneficiary_name}`} value={sponsorship.status} strong />
                                    ))}
                                    {individualReport.membership_events.slice(0, 5).map((event) => (
                                        <Field key={`${event.type}-${event.timestamp}`} label={`${event.type} · ${formatDate(event.timestamp)}`} value={event.label} strong />
                                    ))}
                                    {individualReport.sponsorships.length === 0 && individualReport.membership_events.length === 0 && <div className="text-muted">No sponsorship or membership event records found.</div>}
                                </ReportBox>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {showGeneralReport && (
                loading ? (
                    <div className="p-8 text-center text-muted">Loading member statistics...</div>
                ) : (
                    <section className="space-y-6">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-semibold text-ink">Member Report</h2>
                                <p className="text-sm text-muted">Track member growth, status, and data quality.</p>
                            </div>
                            <DateRangeControls value={dateRange} onChange={setDateRange} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <StatCard title={hasRange ? "Members in Range" : "Total Members"} value={counts.total} icon={Users} description={hasRange ? "Created in selected range" : "All registered members"} />
                            <StatCard title={hasRange ? "Active in Range" : "Active Members"} value={counts.active} icon={UserCheck} description={hasRange ? "Active among selected range" : "Currently active"} trend={{ value: counts.total ? Math.round((counts.active / counts.total) * 100) : 0, label: "of total", positive: true }} />
                            <StatCard title={hasRange ? "Pending in Range" : "New This Month"} value={hasRange ? counts.pending : counts.newThisMonth} icon={UserPlus} description={hasRange ? "Pending approvals in range" : "Joined in current month"} />
                            <StatCard title="Missing Phone" value={counts.missingPhone} icon={AlertTriangle} description={hasRange ? "Missing phone in range" : "Profiles missing phone"} />
                        </div>
                        <div className="grid gap-6 lg:grid-cols-3">
                            <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
                                <h3 className="mb-4 text-lg font-semibold text-ink">Member Status Distribution</h3>
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={statusData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                                            <XAxis dataKey="name" stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                                            <Tooltip cursor={{ fill: "var(--color-accent)", opacity: 0.1 }} contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "8px" }} itemStyle={{ color: "var(--color-ink)" }} />
                                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                {statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <ReportBox title="Roster Health">
                                    <Field label="Missing phone numbers" value={counts.missingPhone} strong />
                                    <Field label="Members with children" value={counts.hasChildren} strong />
                                    <Field label="Pending approvals" value={counts.pending} strong />
                                    <Field label="Archived records" value={counts.archived} strong />
                                </ReportBox>
                                <ReportBox title="Recent Members">
                                    {recentMembers.length === 0 ? (
                                        <div className="text-sm text-muted">No recent members found.</div>
                                    ) : (
                                        recentMembers.map((member) => (
                                            <Field key={member.id} label={`${member.first_name} ${member.last_name}`} value={member.created_at ? new Date(member.created_at).toLocaleDateString() : "-"} />
                                        ))
                                    )}
                                </ReportBox>
                            </div>
                        </div>
                    </section>
                )
            )}
        </div>
    );
}

function Snapshot({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="rounded-xl border border-border bg-background/40 p-4">
            <div className="text-xs uppercase text-muted">{label}</div>
            <div className="mt-1 font-semibold text-ink">{value}</div>
            <div className="text-xs text-muted">{detail}</div>
        </div>
    );
}

function ReportBox({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="rounded-xl border border-border bg-background/40 p-4">
            <h4 className="font-semibold text-ink">{title}</h4>
            <div className="mt-3 space-y-2 text-sm">{children}</div>
        </div>
    );
}

function Field({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-muted">{label}</span>
            <span className={strong ? "font-medium text-ink" : "text-ink"}>{value}</span>
        </div>
    );
}
