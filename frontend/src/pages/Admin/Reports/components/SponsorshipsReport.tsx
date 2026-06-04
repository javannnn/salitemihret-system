import { useState, useEffect, useMemo, useRef } from "react";
import {
    getSponsorship,
    getSponsorshipMetrics,
    getSponsorshipTimeline,
    listSponsorshipNotes,
    listSponsorships,
    Sponsorship,
    SponsorshipMetrics,
    SponsorshipNotesListResponse,
    SponsorshipTimelineResponse,
} from "@/lib/api";
import { StatCard } from "./StatCard";
import { AlertCircle, CheckCircle2, Clock, Heart, PieChart as PieIcon, PauseCircle, BadgeCheck } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useToast } from "@/components/Toast";
import { DateRangeControls, DateRangeValue } from "./DateRangeControls";

function formatDate(value?: string | null) {
    if (!value) return "-";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}

export function SponsorshipsReport() {
    const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" });
    const [individualDateRange, setIndividualDateRange] = useState<DateRangeValue>({ start: "", end: "" });
    const [metrics, setMetrics] = useState<SponsorshipMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [caseSearch, setCaseSearch] = useState("");
    const [caseMatches, setCaseMatches] = useState<Sponsorship[]>([]);
    const [selectedCase, setSelectedCase] = useState<Sponsorship | null>(null);
    const [individualLoading, setIndividualLoading] = useState(false);
    const individualRequestId = useRef(0);
    const [individualReport, setIndividualReport] = useState<{
        detail: Sponsorship;
        timeline: SponsorshipTimelineResponse;
        notes: SponsorshipNotesListResponse;
    } | null>(null);
    const toast = useToast();

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
        const fetchMetrics = async () => {
            setLoading(true);
            try {
                const data = await getSponsorshipMetrics({
                    start_date: normalizedRange.start || undefined,
                    end_date: normalizedRange.end || undefined,
                });
                setMetrics(data);
            } catch (error) {
                console.error("Failed to fetch sponsorship metrics:", error);
                toast.push("Failed to load sponsorship data", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchMetrics();
    }, [toast, normalizedRange.start, normalizedRange.end]);

    useEffect(() => {
        const term = caseSearch.trim();
        if (selectedCase) {
            setCaseMatches([]);
            return;
        }
        if (term.length < 2) {
            setCaseMatches([]);
            return;
        }
        let cancelled = false;
        const timeout = window.setTimeout(async () => {
            try {
                const data = await listSponsorships({ q: term, page: 1, page_size: 6 });
                if (!cancelled) {
                    setCaseMatches(data.items);
                }
            } catch (error) {
                console.error("Failed to search sponsorship cases:", error);
                if (!cancelled) {
                    setCaseMatches([]);
                }
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [caseSearch, selectedCase]);

    const loadIndividualReport = async (caseRecord: Sponsorship, range = normalizedIndividualRange) => {
        const requestId = ++individualRequestId.current;
        setIndividualLoading(true);
        try {
            const filters = {
                start_date: range.start || undefined,
                end_date: range.end || undefined,
            };
            const [detail, timeline, notes] = await Promise.all([
                getSponsorship(caseRecord.id),
                getSponsorshipTimeline(caseRecord.id, filters),
                listSponsorshipNotes(caseRecord.id, filters),
            ]);
            if (requestId === individualRequestId.current) {
                setSelectedCase(caseRecord);
                setIndividualReport({ detail, timeline, notes });
                setCaseSearch(`SP-${String(detail.id).padStart(4, "0")}`);
                setCaseMatches([]);
            }
        } catch (error) {
            if (requestId === individualRequestId.current) {
                console.error("Failed to load individual sponsorship report:", error);
                toast.push("Failed to load individual sponsorship report", "error");
            }
        } finally {
            if (requestId === individualRequestId.current) {
                setIndividualLoading(false);
            }
        }
    };

    const changeIndividualDateRange = (next: DateRangeValue) => {
        setIndividualDateRange(next);
        if (!selectedCase) return;
        setIndividualReport(null);
        const normalized = next.start && next.end && next.start > next.end
            ? { start: next.end, end: next.start }
            : next;
        void loadIndividualReport(selectedCase, normalized);
    };

    const downloadIndividualReport = () => {
        if (!individualReport) return;
        const blob = new Blob([JSON.stringify(individualReport, null, 2)], { type: "application/json" });
        const anchor = document.createElement("a");
        anchor.href = URL.createObjectURL(blob);
        anchor.download = `individual-sponsorship-report-SP-${String(individualReport.detail.id).padStart(4, "0")}.json`;
        anchor.click();
        URL.revokeObjectURL(anchor.href);
    };

    if (loading) {
        return <div className="p-8 text-center text-muted">Loading sponsorship statistics...</div>;
    }

    if (!metrics) {
        return <div className="p-8 text-center text-muted">No sponsorship data available.</div>;
    }

    const totalSlots = metrics.current_budget?.total_slots || 0;
    const usedSlots = metrics.current_budget?.used_slots || 0;
    const availableSlots = Math.max(0, totalSlots - usedSlots);
    const budgetData = [
        { name: "Used", value: usedSlots, color: "#ef4444" },
        { name: "Available", value: availableSlots, color: "#10b981" },
    ];

    const executedLabel = hasRange ? "Executed (Range)" : "Executed (Month)";
    const executedDescription = hasRange ? "Completed in selected range" : "Completed this month";
    const budgetLabel = hasRange ? "Budget Utilization" : "Budget Utilization";
    const budgetDescription = hasRange ? "Based on range end month" : "Current month utilization";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-ink">Sponsorship Report</h2>
                    <p className="text-sm text-muted">Monitor sponsorship pipeline and budget usage.</p>
                </div>
                <DateRangeControls value={dateRange} onChange={setDateRange} />
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-ink">Individual Sponsorship Report</h3>
                        <p className="text-sm text-muted">Single-case summary with co-sponsor, immigrant, timeline, notes, and allocation details.</p>
                    </div>
                    <div className="flex flex-wrap items-end justify-end gap-3">
                        <DateRangeControls
                            value={individualDateRange}
                            onChange={changeIndividualDateRange}
                            label="Individual report"
                        />
                        <button
                            className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-ink disabled:opacity-50"
                            disabled={!individualReport}
                            onClick={downloadIndividualReport}
                        >
                            Download JSON
                        </button>
                    </div>
                </div>
                <div className="relative max-w-xl">
                    <input
                        className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink"
                        value={caseSearch}
                        onChange={(event) => {
                            individualRequestId.current += 1;
                            setCaseSearch(event.target.value);
                            setSelectedCase(null);
                            setIndividualReport(null);
                            setIndividualLoading(false);
                        }}
                        placeholder="Search by co-sponsor or immigrant name"
                    />
                    {caseMatches.length > 0 && (
                        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                            {caseMatches.map((item) => (
                                <button
                                    key={item.id}
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent/10"
                                    onClick={() => loadIndividualReport(item)}
                                >
                                    <span className="block font-medium text-ink">SP-{String(item.id).padStart(4, "0")} - {item.beneficiary_name}</span>
                                    <span className="text-xs text-muted">{item.sponsor.first_name} {item.sponsor.last_name} - {item.status}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {individualLoading ? (
                    <div className="mt-4 text-sm text-muted">Loading individual report...</div>
                ) : individualReport ? (
                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                        <ReportPanel title="Case" rows={[
                            ["Case", `SP-${String(individualReport.detail.id).padStart(4, "0")}`],
                            ["Status", individualReport.detail.status === "Suspended" ? "Declined" : individualReport.detail.status],
                            ["Immigrant", individualReport.detail.beneficiary_name],
                            ["Start", formatDate(individualReport.detail.start_date)],
                        ]} />
                        <ReportPanel title="Co-sponsor" rows={[
                            ["Name", `${individualReport.detail.sponsor.first_name} ${individualReport.detail.sponsor.last_name}`],
                            ["Status", individualReport.detail.sponsor_status || "-"],
                            ["Bond", individualReport.detail.payment_information || "-"],
                            ["Last sponsored", formatDate(individualReport.detail.last_sponsored_date)],
                        ]} />
                        <ReportPanel title="Records" rows={[
                            ["Timeline events", String(individualReport.timeline.total)],
                            ["Notes", String(individualReport.notes.total)],
                            ["Allocated slots", String(individualReport.detail.budget_slots || 0)],
                            ["Used slots", String(individualReport.detail.used_slots || 0)],
                        ]} />
                    </div>
                ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
                <StatCard
                    title="Active Cases"
                    value={metrics.active_cases}
                    icon={Heart}
                    description="Currently active sponsorships"
                />
                <StatCard
                    title="Submitted"
                    value={metrics.submitted_cases}
                    icon={Clock}
                    description="Pending approval"
                />
                <StatCard
                    title={executedLabel}
                    value={metrics.month_executed}
                    icon={CheckCircle2}
                    description={executedDescription}
                />
                <StatCard
                    title="Suspended Cases"
                    value={metrics.suspended_cases}
                    icon={PauseCircle}
                    description="On hold"
                />
                <StatCard
                    title={budgetLabel}
                    value={`${metrics.budget_utilization_percent}%`}
                    icon={PieIcon}
                    description={budgetDescription}
                    trend={{
                        value: metrics.budget_utilization_percent,
                        label: "used",
                        positive: metrics.budget_utilization_percent < 90,
                    }}
                />
                <StatCard
                    title="Available Slots"
                    value={availableSlots}
                    icon={BadgeCheck}
                    description="Remaining this round"
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 text-lg font-semibold text-ink">Budget Overview</h3>
                    <div className="h-[300px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={budgetData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {budgetData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                                    itemStyle={{ color: 'var(--color-ink)' }}
                                />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                            <div className="text-2xl font-bold text-ink">{metrics.current_budget?.total_slots || 0}</div>
                            <div className="text-xs text-muted">Total Slots</div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-xl border border-border bg-card p-6">
                        <h3 className="mb-4 text-lg font-semibold text-ink">Case Pipeline</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Submitted for review</span>
                                <span className="font-semibold text-ink">{metrics.submitted_cases}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Active cases</span>
                                <span className="font-semibold text-ink">{metrics.active_cases}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Suspended</span>
                                <span className="font-semibold text-ink">{metrics.suspended_cases}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Executed this month</span>
                                <span className="font-semibold text-ink">{metrics.month_executed}</span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-6">
                        <h3 className="mb-4 text-lg font-semibold text-ink">Recent Alerts</h3>
                        {metrics.alerts.length === 0 ? (
                            <div className="flex h-[200px] items-center justify-center text-muted">
                                No active alerts. Great job!
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {metrics.alerts.map((alert, index) => (
                                    <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                        <p className="text-sm text-ink">{alert}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ReportPanel({ title, rows }: { title: string; rows: Array<[string, string]> }) {
    return (
        <div className="rounded-xl border border-border bg-bg/70 p-4">
            <div className="text-sm font-semibold text-ink">{title}</div>
            <div className="mt-3 space-y-2 text-sm">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                        <span className="text-muted">{label}</span>
                        <span className="text-right font-medium text-ink">{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
