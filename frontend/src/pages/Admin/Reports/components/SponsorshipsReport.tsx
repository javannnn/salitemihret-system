import { useState, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    getSponsorContext,
    getSponsorship,
    getSponsorshipMetrics,
    getSponsorshipTimeline,
    listSponsorshipNotes,
    listSponsorships,
    Sponsorship,
    SponsorshipMetrics,
    SponsorshipNotesListResponse,
    SponsorshipSponsorContext,
    SponsorshipTimelineResponse,
} from "@/lib/api";
import { AlertCircle, BadgeCheck, CalendarDays, CheckCircle2, Clock, Heart, PauseCircle, Search } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useToast } from "@/components/Toast";
import { DateRangeControls, DateRangeValue } from "./DateRangeControls";

function formatDate(value?: string | null) {
    if (!value) return "-";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}

function immigrantName(record: Sponsorship) {
    if (record.newcomer) return `${record.newcomer.first_name} ${record.newcomer.last_name}`.trim();
    if (record.beneficiary_member) return `${record.beneficiary_member.first_name} ${record.beneficiary_member.last_name}`.trim();
    return record.beneficiary_name || "-";
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
        sponsorContext: SponsorshipSponsorContext;
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
    const hasIndividualRange = Boolean(normalizedIndividualRange.start || normalizedIndividualRange.end);
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
            const [detail, sponsorContext, timeline, notes] = await Promise.all([
                getSponsorship(caseRecord.id, filters),
                getSponsorContext(caseRecord.sponsor.id, filters),
                getSponsorshipTimeline(caseRecord.id, filters),
                listSponsorshipNotes(caseRecord.id, filters),
            ]);
            if (requestId === individualRequestId.current) {
                setSelectedCase(caseRecord);
                setIndividualReport({ detail, sponsorContext, timeline, notes });
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
        const report = {
            case: {
                id: individualReport.detail.id,
                status: individualReport.detail.status,
                immigrant_name: immigrantName(individualReport.detail),
                start_date: individualReport.detail.start_date,
                expected_end_date: individualReport.detail.end_date,
                completed_at: individualReport.detail.completed_at,
                last_sponsored_date: ["Completed", "Closed"].includes(individualReport.detail.status)
                    ? individualReport.detail.last_sponsored_date
                    : null,
                trust_fund_deposit: individualReport.detail.payment_information,
                notes: individualReport.detail.notes,
            },
            co_sponsor: {
                id: individualReport.detail.sponsor.id,
                name: `${individualReport.detail.sponsor.first_name} ${individualReport.detail.sponsor.last_name}`,
                status: individualReport.detail.sponsor_status,
                membership_start_date: individualReport.sponsorContext.membership_start_date,
                cases_sponsored: individualReport.detail.sponsorship_case_count,
            },
            timeline: individualReport.timeline,
            notes: individualReport.notes,
        };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
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

    const executedLabel = hasRange ? "Executed in range" : "Executed this month";
    const executedDescription = hasRange ? "Completed in selected range" : "Completed this month";
    const budgetDescription = hasRange ? "Based on range end month" : "Current month utilization";

    const summaryItems = [
        { label: "Active cases", value: metrics.active_cases, detail: "Currently supported", icon: Heart },
        { label: "Awaiting review", value: metrics.submitted_cases, detail: "Submitted cases", icon: Clock },
        { label: executedLabel, value: metrics.month_executed, detail: executedDescription, icon: CheckCircle2 },
        { label: "Declined / paused", value: metrics.suspended_cases, detail: "Needs follow-up", icon: PauseCircle },
        { label: "Capacity used", value: `${metrics.budget_utilization_percent}%`, detail: budgetDescription, icon: BadgeCheck },
        { label: "Available slots", value: availableSlots, detail: "Remaining this round", icon: CalendarDays },
    ];

    return (
        <div className="space-y-6 pb-24 md:pb-0">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Reports</p>
                    <h2 className="text-2xl font-semibold tracking-tight text-ink">Sponsorships</h2>
                    <p className="mt-1 text-sm text-muted">Review immigrant support, sponsor eligibility, completion dates, and capacity.</p>
                </div>
                <DateRangeControls value={dateRange} onChange={setDateRange} />
            </div>
            <section className="relative z-30 overflow-visible rounded-2xl border border-border bg-card/70">
                <div className="flex flex-wrap items-start justify-between gap-4 rounded-t-2xl border-b border-border bg-muted/20 px-5 py-4 sm:px-6">
                    <div>
                        <h3 className="text-base font-semibold text-ink">Individual case report</h3>
                        <p className="mt-1 text-sm text-muted">Find a case to see the immigrant, co-sponsor, and lifecycle dates.</p>
                    </div>
                    <div className="flex flex-wrap items-end justify-end gap-3">
                        <DateRangeControls
                            value={individualDateRange}
                            onChange={changeIndividualDateRange}
                            label="Individual report"
                        />
                        <button
                            className="h-9 rounded-lg border border-border bg-card px-3 text-sm font-medium text-ink transition hover:border-accent/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50"
                            disabled={!individualReport}
                            onClick={downloadIndividualReport}
                        >
                            Download JSON
                        </button>
                    </div>
                </div>
                <div className="px-5 py-5 sm:px-6">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="sponsorship-case-search">Search cases</label>
                    <div className="relative max-w-2xl">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                        id="sponsorship-case-search"
                        className="w-full rounded-xl border border-border bg-bg py-2.5 pl-10 pr-3 text-sm text-ink outline-none transition focus:border-accent focus:shadow-ring"
                        value={caseSearch}
                        onChange={(event) => {
                            individualRequestId.current += 1;
                            setCaseSearch(event.target.value);
                            setSelectedCase(null);
                            setIndividualReport(null);
                            setIndividualLoading(false);
                        }}
                        placeholder="Case ID, co-sponsor, or immigrant name"
                    />
                        <AnimatePresence>
                        {caseMatches.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
                        >
                            {caseMatches.map((item) => (
                                <button
                                    key={item.id}
                                    className="block w-full border-b border-border/60 px-4 py-3 text-left text-sm transition last:border-0 hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                                    onClick={() => loadIndividualReport(item)}
                                >
                                    <span className="block font-medium text-ink">SP-{String(item.id).padStart(4, "0")} · {immigrantName(item)}</span>
                                    <span className="mt-0.5 block text-xs text-muted">Co-sponsor: {item.sponsor.first_name} {item.sponsor.last_name} · {item.status}</span>
                                </button>
                            ))}
                        </motion.div>
                        )}
                        </AnimatePresence>
                    </div>
                {individualLoading ? (
                    <div className="mt-5 flex items-center gap-2 text-sm text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Loading case report...</div>
                ) : individualReport ? (
                    <motion.div
                        key={individualReport.detail.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 grid overflow-hidden rounded-xl border border-border md:grid-cols-2"
                    >
                        <ReportPanel title="Case" rows={[
                            ["Case", `SP-${String(individualReport.detail.id).padStart(4, "0")}`],
                            ["Status", individualReport.detail.status === "Suspended" ? "Declined" : individualReport.detail.status],
                            ["Immigrant name", immigrantName(individualReport.detail)],
                            ["Sponsorship start date", formatDate(individualReport.detail.start_date)],
                            ["Completed", formatDate(individualReport.detail.completed_at)],
                        ]} />
                        <ReportPanel title="Co-sponsor membership" rows={[
                            ["Name", `${individualReport.detail.sponsor.first_name} ${individualReport.detail.sponsor.last_name}`],
                            ["Status", individualReport.detail.sponsor_status || "-"],
                            ["Membership start date", formatDate(individualReport.sponsorContext.membership_start_date)],
                            ["Trust fund deposit", individualReport.detail.payment_information || "-"],
                            ["Last sponsored", ["Completed", "Closed"].includes(individualReport.detail.status) ? formatDate(individualReport.detail.last_sponsored_date) : "-"],
                            [hasIndividualRange ? "Cases in range" : "Cases sponsored", String(individualReport.detail.sponsorship_case_count ?? 0)],
                        ]} />
                    </motion.div>
                ) : null}
                </div>
            </section>
            <section className="relative z-0 overflow-hidden rounded-2xl border border-border bg-card/60">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    {summaryItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <div key={item.label} className="group border-b border-border p-4 transition hover:bg-muted/25 sm:border-r lg:last:border-r-0 xl:border-b-0">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-medium text-muted">{item.label}</span>
                                    <Icon className="h-4 w-4 text-muted transition group-hover:text-ink" />
                                </div>
                                <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-ink">{item.value}</div>
                                <div className="mt-1 text-xs text-muted">{item.detail}</div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <div className="grid overflow-hidden rounded-2xl border border-border bg-card/60 md:grid-cols-2">
                <div className="border-b border-border p-5 md:border-b-0 md:border-r sm:p-6">
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

                <div>
                    <div className="border-b border-border p-5 sm:p-6">
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

                    <div className="p-5 sm:p-6">
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
        <div className="border-b border-border p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 sm:p-5">
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
