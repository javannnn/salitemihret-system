import { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    HandHeart,
    Languages,
    LucideIcon,
    MapPinned,
    MessageSquareMore,
    ShieldCheck,
    UserCog,
    Users2,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge, Card } from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
    getNewcomerReport,
    NewcomerReportCaseItem,
    NewcomerReportOwnerBreakdownItem,
    NewcomerReportResponse,
    ReportBreakdownItem,
} from "@/lib/api";
import { StatCard } from "./StatCard";
import { DateRangeControls, DateRangeValue } from "./DateRangeControls";

const STATUS_COLORS: Record<string, string> = {
    New: "#2563eb",
    Contacted: "#0f766e",
    Assigned: "#7c3aed",
    "In progress": "#d97706",
    Settled: "#10b981",
    Closed: "#6b7280",
};

const FOLLOWUP_COLORS = ["#dc2626", "#f59e0b", "#0f766e", "#94a3b8"];

export function NewcomersReport() {
    const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" });
    const [report, setReport] = useState<NewcomerReportResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    const normalizedRange = useMemo(() => {
        if (dateRange.start && dateRange.end && dateRange.start > dateRange.end) {
            return { start: dateRange.end, end: dateRange.start };
        }
        return dateRange;
    }, [dateRange]);

    useEffect(() => {
        let cancelled = false;

        const fetchReport = async () => {
            setLoading(true);
            try {
                const data = await getNewcomerReport({
                    start_date: normalizedRange.start || undefined,
                    end_date: normalizedRange.end || undefined,
                });
                if (!cancelled) {
                    setReport(data);
                }
            } catch (error) {
                console.error("Failed to fetch newcomer report:", error);
                if (!cancelled) {
                    setReport(null);
                }
                toast.push("Failed to load newcomer report", { type: "error" });
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchReport();
        return () => {
            cancelled = true;
        };
    }, [normalizedRange.end, normalizedRange.start, toast]);

    if (loading) {
        return <div className="p-8 text-center text-muted">Loading newcomer reporting...</div>;
    }

    if (!report) {
        return <div className="p-8 text-center text-muted">No newcomer data is available right now.</div>;
    }

    const summary = report.summary;
    const statusData = report.status_breakdown.map((item) => ({
        ...item,
        color: STATUS_COLORS[item.label] || "#64748b",
    }));
    const followupData = report.followup_breakdown.map((item, index) => ({
        ...item,
        color: FOLLOWUP_COLORS[index % FOLLOWUP_COLORS.length],
    }));

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-ink">Newcomer Report</h2>
                    <p className="text-sm text-muted">
                        Intake flow, settlement progress, follow-up pressure, support-case linkage, and care ownership in one view.
                    </p>
                </div>
                <DateRangeControls value={dateRange} onChange={setDateRange} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <StatCard
                    title="Total Cases"
                    value={summary.total_cases}
                    icon={Users2}
                    description="Newcomers in scope"
                />
                <StatCard
                    title="Open Pipeline"
                    value={summary.open_cases}
                    icon={ShieldCheck}
                    description="Still being worked"
                    trend={{
                        value: summary.total_cases ? Math.round((summary.open_cases / summary.total_cases) * 100) : 0,
                        label: "of cases",
                        positive: true,
                    }}
                />
                <StatCard
                    title="Overdue Follow-up"
                    value={summary.followups_overdue}
                    icon={AlertTriangle}
                    description="Cases needing outreach now"
                />
                <StatCard
                    title="Unassigned"
                    value={summary.unassigned_cases}
                    icon={UserCog}
                    description="Open cases without owner"
                />
                <StatCard
                    title="Settled"
                    value={summary.settled_cases}
                    icon={HandHeart}
                    description="Reached settlement stage"
                />
                <StatCard
                    title="Interactions (30d)"
                    value={summary.interactions_last_30_days}
                    icon={MessageSquareMore}
                    description="Recent care touches"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                <Card className="p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-lg font-semibold text-ink">Settlement Pipeline</h3>
                            <p className="text-sm text-muted">Where newcomer cases are sitting today.</p>
                        </div>
                        <Badge className="text-[11px]">{summary.recent_intakes_30_days} recent intakes</Badge>
                    </div>
                    <div className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={statusData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                                <XAxis dataKey="label" stroke="var(--color-muted)" tickLine={false} axisLine={false} fontSize={12} />
                                <YAxis stroke="var(--color-muted)" tickLine={false} axisLine={false} fontSize={12} />
                                <Tooltip
                                    cursor={{ fill: "var(--color-accent)", opacity: 0.08 }}
                                    contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }}
                                    itemStyle={{ color: "var(--color-ink)" }}
                                />
                                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                                    {statusData.map((entry) => (
                                        <Cell key={entry.label} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <div className="space-y-6">
                    <Card className="p-6">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-ink">Follow-up Surface</h3>
                            <p className="text-sm text-muted">How urgent the current care queue is.</p>
                        </div>
                        {followupData.length === 0 ? (
                            <div className="text-sm text-muted">No follow-up data in this view.</div>
                        ) : (
                            <div className="grid gap-5 sm:grid-cols-[0.92fr,1.08fr]">
                                <div className="h-[220px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={followupData}
                                                dataKey="value"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={48}
                                                outerRadius={82}
                                                paddingAngle={4}
                                            >
                                                {followupData.map((entry) => (
                                                    <Cell key={entry.label} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }}
                                                itemStyle={{ color: "var(--color-ink)" }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="space-y-3">
                                    {followupData.map((item) => (
                                        <MetricRow
                                            key={item.label}
                                            label={item.label}
                                            value={item.value}
                                            detail={item.share_percent ? `${item.share_percent}% of open cases` : undefined}
                                            color={item.color}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </Card>

                    <Card className="p-6">
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-ink">Care Coverage</h3>
                            <p className="text-sm text-muted">Support capacity, language needs, and linked sponsorships.</p>
                        </div>
                        <div className="space-y-3">
                            <MetricRow label="Sponsored households" value={summary.sponsored_cases} detail="Assigned parish sponsor" color="#db2777" />
                            <MetricRow label="Interpreter required" value={summary.interpreter_required_cases} detail="Needs language support" color="#2563eb" />
                            <MetricRow label="Family households" value={summary.family_households} detail="Cases marked as family" color="#0f766e" />
                            <MetricRow label="Due in 7 days" value={summary.followups_due_next_7_days} detail="Upcoming contact window" color="#d97706" />
                            <MetricRow label="Stale cases" value={summary.stale_cases} detail="Quiet for 14+ days" color="#dc2626" />
                        </div>
                        <div className="mt-5 rounded-2xl border border-border bg-bg/70 p-4">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Support cases</div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                <SupportPill label="Submitted" value={summary.submitted_support_cases} tone="amber" />
                                <SupportPill label="Active" value={summary.active_support_cases} tone="emerald" />
                                <SupportPill label="Suspended" value={summary.suspended_support_cases} tone="rose" />
                            </div>
                            {report.sponsorship_breakdown.length > 0 ? (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {report.sponsorship_breakdown.map((item) => (
                                        <Badge key={item.label} className="text-[11px] normal-case tracking-normal">
                                            {item.label}: {item.value}
                                        </Badge>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </Card>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                <Card className="p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-lg font-semibold text-ink">Cases Needing Attention</h3>
                            <p className="text-sm text-muted">Escalation-first view across overdue, unassigned, and quiet cases.</p>
                        </div>
                        <Badge className="bg-red-500/10 text-red-600 dark:text-red-300">
                            {report.attention_cases.length} highlighted
                        </Badge>
                    </div>
                    {report.attention_cases.length === 0 ? (
                        <div className="text-sm text-muted">No urgent newcomer cases in this slice.</div>
                    ) : (
                        <div className="space-y-3">
                            {report.attention_cases.map((item) => (
                                <CaseCard key={`attention-${item.id}`} item={item} attention />
                            ))}
                        </div>
                    )}
                </Card>

                <Card className="p-6">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-ink">Owner Workload</h3>
                        <p className="text-sm text-muted">Open-case distribution and follow-up pressure by owner.</p>
                    </div>
                    {report.owner_breakdown.length === 0 ? (
                        <div className="text-sm text-muted">No owner workload data for the current slice.</div>
                    ) : (
                        <div className="space-y-4">
                            {report.owner_breakdown.map((item) => (
                                <OwnerLoadCard key={`${item.owner_id ?? "unassigned"}-${item.owner_name}`} item={item} />
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <BreakdownCard
                    title="County Footprint"
                    subtitle="Where newcomer households are located."
                    icon={MapPinned}
                    items={report.county_breakdown}
                    emptyLabel="No county data recorded."
                />
                <BreakdownCard
                    title="Language Mix"
                    subtitle="Preferred communication languages."
                    icon={Languages}
                    items={report.language_breakdown}
                    emptyLabel="No language preference data recorded."
                />
                <BreakdownCard
                    title="Referral Signals"
                    subtitle="Most common referral paths into intake."
                    icon={HandHeart}
                    items={report.referral_breakdown}
                    emptyLabel="No referral source data recorded."
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
                <Card className="p-6">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-ink">Recent Intakes</h3>
                        <p className="text-sm text-muted">Newest newcomer records in the selected report window.</p>
                    </div>
                    {report.recent_cases.length === 0 ? (
                        <div className="text-sm text-muted">No newcomer intakes found for this range.</div>
                    ) : (
                        <div className="space-y-3">
                            {report.recent_cases.map((item) => (
                                <CaseCard key={`recent-${item.id}`} item={item} />
                            ))}
                        </div>
                    )}
                </Card>

                <Card className="p-6">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-ink">Interaction Mix</h3>
                        <p className="text-sm text-muted">How the last 30 days of follow-up work has been delivered.</p>
                    </div>
                    {report.interaction_breakdown.length === 0 ? (
                        <div className="text-sm text-muted">No interactions were logged in the last 30 days.</div>
                    ) : (
                        <div className="space-y-3">
                            {report.interaction_breakdown.map((item) => (
                                <MetricRow
                                    key={item.label}
                                    label={item.label}
                                    value={item.value}
                                    detail={item.share_percent ? `${item.share_percent}% of interactions` : undefined}
                                    color="#7c3aed"
                                />
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}

function BreakdownCard({
    title,
    subtitle,
    items,
    emptyLabel,
    icon: Icon,
}: {
    title: string;
    subtitle: string;
    items: ReportBreakdownItem[];
    emptyLabel: string;
    icon: LucideIcon;
}) {
    return (
        <Card className="p-6">
            <div className="mb-4 flex items-start gap-3">
                <div className="rounded-2xl bg-accent/10 p-2.5 text-accent">
                    <Icon size={18} />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-ink">{title}</h3>
                    <p className="text-sm text-muted">{subtitle}</p>
                </div>
            </div>
            {items.length === 0 ? (
                <div className="text-sm text-muted">{emptyLabel}</div>
            ) : (
                <div className="space-y-3">
                    {items.map((item) => (
                        <MetricRow
                            key={item.label}
                            label={item.label}
                            value={item.value}
                            detail={item.share_percent ? `${item.share_percent}% of cases` : undefined}
                            color="#2563eb"
                        />
                    ))}
                </div>
            )}
        </Card>
    );
}

function CaseCard({ item, attention = false }: { item: NewcomerReportCaseItem; attention?: boolean }) {
    const statusTone = attention ? "border-red-500/20 bg-red-500/5" : "border-border bg-bg/70";
    return (
        <div className={`rounded-2xl border px-4 py-4 ${statusTone}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-ink">{item.full_name}</div>
                        <Badge className="text-[10px] normal-case tracking-normal">{item.status}</Badge>
                        <Badge className="text-[10px] normal-case tracking-normal">{item.newcomer_code}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                        <span>Arrived {formatDate(item.arrival_date)}</span>
                        <span>Created {formatDate(item.created_at, true)}</span>
                        {item.assigned_owner_name ? <span>Owner {item.assigned_owner_name}</span> : <span>No owner</span>}
                        {item.preferred_language ? <span>{item.preferred_language}</span> : null}
                        {item.county ? <span>{item.county}</span> : null}
                    </div>
                </div>
                <div className="text-right text-xs text-muted">
                    <div>{item.followup_due_date ? `Due ${formatDate(item.followup_due_date)}` : "No due date"}</div>
                    <div>{item.last_interaction_at ? `Last touch ${formatRelative(item.last_interaction_at)}` : "No interaction yet"}</div>
                </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {item.service_type ? <Badge className="text-[10px] normal-case tracking-normal">{item.service_type}</Badge> : null}
                {item.interpreter_required ? (
                    <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] normal-case tracking-normal">
                        Interpreter required
                    </Badge>
                ) : null}
                {item.sponsored_by_member_name ? (
                    <Badge className="bg-pink-500/10 text-pink-700 dark:text-pink-300 text-[10px] normal-case tracking-normal">
                        Sponsor {item.sponsored_by_member_name}
                    </Badge>
                ) : null}
                {item.attention_reason ? (
                    <Badge className="bg-red-500/10 text-red-700 dark:text-red-300 text-[10px] normal-case tracking-normal">
                        {item.attention_reason}
                    </Badge>
                ) : null}
            </div>
        </div>
    );
}

function OwnerLoadCard({ item }: { item: NewcomerReportOwnerBreakdownItem }) {
    return (
        <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-ink">{item.owner_name}</div>
                    <div className="text-xs text-muted">Open newcomer workload</div>
                </div>
                <Badge className="text-[10px] normal-case tracking-normal">{item.total_cases} open</Badge>
            </div>
            <div className="mt-4 space-y-2">
                <MetricRow label="Overdue" value={item.overdue_followups} color="#dc2626" compact />
                <MetricRow label="Stale" value={item.stale_cases} color="#d97706" compact />
            </div>
        </div>
    );
}

function MetricRow({
    label,
    value,
    detail,
    color,
    compact = false,
}: {
    label: string;
    value: number;
    detail?: string;
    color: string;
    compact?: boolean;
}) {
    return (
        <div className={`rounded-2xl border border-border bg-bg/70 px-3 py-3 ${compact ? "py-2.5" : ""}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{label}</div>
                    {detail ? <div className="mt-1 text-xs text-muted">{detail}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm font-semibold text-ink">{value}</span>
                </div>
            </div>
        </div>
    );
}

function SupportPill({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone: "amber" | "emerald" | "rose";
}) {
    const toneClass = {
        amber: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        rose: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    }[tone];

    return (
        <div className={`rounded-2xl border px-3 py-3 ${toneClass}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</div>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
        </div>
    );
}

function formatDate(value?: string | null, includeTime = false) {
    if (!value) return "—";
    const date = new Date(value);
    return includeTime ? date.toLocaleString() : date.toLocaleDateString();
}

function formatRelative(value?: string | null) {
    if (!value) return "—";
    const ms = Date.now() - new Date(value).getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days <= 0) return "today";
    if (days === 1) return "1 day ago";
    if (days < 30) return `${days} days ago`;
    return formatDate(value);
}
