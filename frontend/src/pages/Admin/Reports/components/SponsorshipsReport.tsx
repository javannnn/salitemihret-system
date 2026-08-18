import { useState, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    getIndividualSponsorshipReport,
    getSponsorshipMetrics,
    listSponsorships,
    Sponsorship,
    SponsorshipIndividualCaseReport,
    SponsorshipIndividualReportResponse,
    SponsorshipMetrics,
    SponsorshipSponsorContext,
} from "@/lib/api";
import { AlertCircle, BadgeCheck, CalendarDays, Check, CheckCircle2, Clock, Download, Heart, Layers3, PauseCircle, Search, UserRound, X } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useToast } from "@/components/Toast";
import { DateRangeControls, DateRangeValue } from "./DateRangeControls";

function formatDate(value?: string | null) {
    if (!value) return "-";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}

function formatDateTime(value?: string | null) {
    if (!value) return "-";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
}

function formatMoney(value?: number | string | null) {
    if (value === undefined || value === null || value === "") return "-";
    const amount = Number(value);
    if (Number.isNaN(amount)) return String(value);
    return amount.toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

function humanize(value?: string | null) {
    if (!value) return "-";
    return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function caseCode(id: number) {
    return `SP-${String(id).padStart(4, "0")}`;
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
    const [caseMatchTotal, setCaseMatchTotal] = useState(0);
    const [caseSearchLoading, setCaseSearchLoading] = useState(false);
    const [casePickerOpen, setCasePickerOpen] = useState(false);
    const [selectedCases, setSelectedCases] = useState<Sponsorship[]>([]);
    const [individualLoading, setIndividualLoading] = useState(false);
    const individualRequestId = useRef(0);
    const casePickerRef = useRef<HTMLDivElement>(null);
    const [individualReport, setIndividualReport] = useState<SponsorshipIndividualReportResponse | null>(null);
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
    const selectedCaseIds = useMemo(() => new Set(selectedCases.map((item) => item.id)), [selectedCases]);
    const allMatchesSelected = caseMatches.length > 0 && caseMatches.every((item) => selectedCaseIds.has(item.id));
    const reportGroups = useMemo(() => {
        if (!individualReport) return [];
        const contexts = new Map(individualReport.sponsor_contexts.map((context) => [context.member_id, context]));
        const groups = new Map<number, {
            sponsorId: number;
            context?: SponsorshipSponsorContext;
            cases: SponsorshipIndividualCaseReport[];
        }>();
        individualReport.cases.forEach((caseReport) => {
            const sponsorId = caseReport.detail.sponsor.id;
            const group = groups.get(sponsorId) ?? { sponsorId, context: contexts.get(sponsorId), cases: [] };
            group.cases.push(caseReport);
            groups.set(sponsorId, group);
        });
        return Array.from(groups.values());
    }, [individualReport]);

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
        if (term.length < 2) {
            setCaseMatches([]);
            setCaseMatchTotal(0);
            setCaseSearchLoading(false);
            return;
        }
        let cancelled = false;
        setCaseSearchLoading(true);
        const timeout = window.setTimeout(async () => {
            try {
                const data = await listSponsorships({ q: term, page: 1, page_size: 100 });
                if (!cancelled) {
                    setCaseMatches(data.items);
                    setCaseMatchTotal(data.total);
                    if (casePickerRef.current?.contains(document.activeElement)) {
                        setCasePickerOpen(true);
                    }
                }
            } catch (error) {
                console.error("Failed to search sponsorship cases:", error);
                if (!cancelled) {
                    setCaseMatches([]);
                    setCaseMatchTotal(0);
                }
            } finally {
                if (!cancelled) setCaseSearchLoading(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [caseSearch]);

    useEffect(() => {
        const closePicker = (event: MouseEvent) => {
            if (casePickerRef.current && !casePickerRef.current.contains(event.target as Node)) {
                setCasePickerOpen(false);
            }
        };
        document.addEventListener("mousedown", closePicker);
        return () => document.removeEventListener("mousedown", closePicker);
    }, []);

    const loadIndividualReport = async (caseIds: number[], range = normalizedIndividualRange) => {
        if (caseIds.length === 0) return;
        const requestId = ++individualRequestId.current;
        setIndividualLoading(true);
        try {
            const filters = {
                start_date: range.start || undefined,
                end_date: range.end || undefined,
            };
            const report = await getIndividualSponsorshipReport(caseIds, filters);
            if (requestId === individualRequestId.current) {
                setIndividualReport(report);
                setCasePickerOpen(false);
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
        const caseIds = individualReport
            ? individualReport.cases.map((item) => item.detail.id)
            : selectedCases.map((item) => item.id);
        if (caseIds.length === 0) return;
        const normalized = next.start && next.end && next.start > next.end
            ? { start: next.end, end: next.start }
            : next;
        void loadIndividualReport(caseIds, normalized);
    };

    const toggleCaseSelection = (record: Sponsorship) => {
        setSelectedCases((current) => current.some((item) => item.id === record.id)
            ? current.filter((item) => item.id !== record.id)
            : [...current, record]);
    };

    const toggleAllMatches = () => {
        setSelectedCases((current) => {
            if (allMatchesSelected) {
                const matchIds = new Set(caseMatches.map((item) => item.id));
                return current.filter((item) => !matchIds.has(item.id));
            }
            const merged = new Map(current.map((item) => [item.id, item]));
            caseMatches.forEach((item) => merged.set(item.id, item));
            return Array.from(merged.values());
        });
    };

    const downloadIndividualReport = () => {
        if (!individualReport) return;
        const report = {
            date_range: {
                start: normalizedIndividualRange.start || null,
                end: normalizedIndividualRange.end || null,
            },
            ...individualReport,
        };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
        const anchor = document.createElement("a");
        anchor.href = URL.createObjectURL(blob);
        anchor.download = `individual-sponsorship-report-${individualReport.selected_case_count}-cases.json`;
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
                        <h3 className="text-base font-semibold text-ink">Individual sponsorship report</h3>
                        <p className="mt-1 text-sm text-muted">Search a member, choose one or more cases, and review them together.</p>
                    </div>
                    <div className="flex flex-wrap items-end justify-end gap-3">
                        <DateRangeControls
                            value={individualDateRange}
                            onChange={changeIndividualDateRange}
                            label="Individual report"
                        />
                        <button
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-ink transition hover:border-accent/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50"
                            disabled={!individualReport}
                            onClick={downloadIndividualReport}
                        >
                            <Download className="h-4 w-4" />
                            Download JSON
                        </button>
                    </div>
                </div>
                <div className="px-5 py-5 sm:px-6">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="sponsorship-case-search">Member or case</label>
                    <div ref={casePickerRef} className="relative max-w-3xl">
                        <Search className="pointer-events-none absolute left-3 top-[21px] h-4 w-4 -translate-y-1/2 text-muted" />
                        <input
                            id="sponsorship-case-search"
                            className="w-full rounded-xl border border-border bg-bg py-2.5 pl-10 pr-10 text-sm text-ink outline-none transition focus:border-accent focus:shadow-ring"
                            value={caseSearch}
                            onChange={(event) => setCaseSearch(event.target.value)}
                            onFocus={() => {
                                if (caseSearch.trim().length >= 2) setCasePickerOpen(true);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Escape") setCasePickerOpen(false);
                            }}
                            placeholder="Type a co-sponsor, immigrant, or case ID"
                            autoComplete="off"
                        />
                        {caseSearchLoading && (
                            <span className="absolute right-3 top-[21px] h-2.5 w-2.5 -translate-y-1/2 animate-pulse rounded-full bg-accent" aria-label="Searching" />
                        )}
                        <AnimatePresence>
                        {casePickerOpen && caseSearch.trim().length >= 2 && (
                            <motion.div
                                initial={{ opacity: 0, y: -6, scale: 0.99 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.99 }}
                                transition={{ duration: 0.14 }}
                                className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl"
                            >
                            {caseMatches.length > 0 ? (
                                <>
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={allMatchesSelected}
                                    className="flex w-full items-center gap-3 border-b border-border bg-muted/20 px-4 py-3 text-left transition hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
                                    onClick={toggleAllMatches}
                                >
                                    <SelectionMark checked={allMatchesSelected} />
                                    <span className="flex-1 text-sm font-semibold text-ink">Select all cases</span>
                                    <span className="text-xs tabular-nums text-muted">{caseMatchTotal} {caseMatchTotal === 1 ? "match" : "matches"}</span>
                                </button>
                                <div className="max-h-80 overflow-y-auto overscroll-contain">
                                    {caseMatches.map((item) => {
                                        const checked = selectedCaseIds.has(item.id);
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                role="checkbox"
                                                aria-checked={checked}
                                                className="flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left text-sm transition last:border-0 hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none"
                                                onClick={() => toggleCaseSelection(item)}
                                            >
                                                <SelectionMark checked={checked} />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate font-medium text-ink">{caseCode(item.id)} · {immigrantName(item)}</span>
                                                    <span className="mt-0.5 block truncate text-xs text-muted">Co-sponsor: {item.sponsor.first_name} {item.sponsor.last_name} · {item.status}</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {caseMatchTotal > caseMatches.length && (
                                    <div className="border-t border-border px-4 py-2 text-xs text-muted">Showing the first {caseMatches.length} matches. Refine the member name to see a complete case set.</div>
                                )}
                                {selectedCases.length > 0 && (
                                    <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3">
                                        <span className="text-xs text-muted"><strong className="font-semibold text-ink">{selectedCases.length}</strong> selected</span>
                                        <button
                                            type="button"
                                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-wait disabled:opacity-70"
                                            disabled={individualLoading}
                                            onClick={() => void loadIndividualReport(selectedCases.map((item) => item.id))}
                                        >
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            View report
                                        </button>
                                    </div>
                                )}
                                </>
                            ) : !caseSearchLoading ? (
                                <div className="px-4 py-7 text-center text-sm text-muted">No sponsorship cases match this search.</div>
                            ) : (
                                <div className="px-4 py-7 text-center text-sm text-muted">Searching cases...</div>
                            )}
                            </motion.div>
                        )}
                        </AnimatePresence>
                    </div>

                    <AnimatePresence initial={false}>
                    {selectedCases.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 max-w-5xl overflow-hidden"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                {selectedCases.map((item) => (
                                    <span key={item.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/25 py-1 pl-2.5 pr-1.5 text-xs text-ink">
                                        <span className="truncate">{caseCode(item.id)} · {immigrantName(item)}</span>
                                        <button
                                            type="button"
                                            className="rounded-full p-0.5 text-muted transition hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                                            onClick={() => toggleCaseSelection(item)}
                                            aria-label={`Remove ${caseCode(item.id)}`}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                                <div className="flex items-center gap-2 text-sm text-muted">
                                    <Layers3 className="h-4 w-4" />
                                    <span><strong className="font-semibold text-ink">{selectedCases.length}</strong> {selectedCases.length === 1 ? "case" : "cases"} selected</span>
                                    <button
                                        type="button"
                                        className="ml-1 text-xs font-medium text-muted underline-offset-4 transition hover:text-ink hover:underline"
                                        onClick={() => setSelectedCases([])}
                                    >
                                        Clear
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
                                    disabled={individualLoading}
                                    onClick={() => void loadIndividualReport(selectedCases.map((item) => item.id))}
                                >
                                    {individualLoading ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> : <CheckCircle2 className="h-4 w-4" />}
                                    {individualLoading ? "Building report..." : `View ${selectedCases.length === 1 ? "case" : `${selectedCases.length} cases`}`}
                                </button>
                            </div>
                        </motion.div>
                    )}
                    </AnimatePresence>

                    {individualLoading && !individualReport && (
                        <div className="mt-6 flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 text-sm text-muted">
                            <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-accent" /> Loading the selected case report...
                        </div>
                    )}

                    {individualReport && (
                        <motion.div
                            key={individualReport.cases.map((item) => item.detail.id).join("-")}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: individualLoading ? 0.68 : 1, y: 0 }}
                            className="mt-7 space-y-8"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                                <div>
                                    <h4 className="text-sm font-semibold text-ink">Selected case details</h4>
                                    <p className="mt-0.5 text-xs text-muted">{individualReport.selected_case_count} {individualReport.selected_case_count === 1 ? "case" : "cases"} across {reportGroups.length} {reportGroups.length === 1 ? "co-sponsor" : "co-sponsors"}</p>
                                </div>
                                {individualLoading && <span className="text-xs font-medium text-muted">Updating date range...</span>}
                            </div>
                            {reportGroups.map((group) => (
                                <section key={group.sponsorId} className="space-y-4">
                                    {reportGroups.length > 1 && (
                                        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                                            <UserRound className="h-4 w-4 text-muted" />
                                            {group.context?.member_name ?? `Member ${group.sponsorId}`}
                                        </div>
                                    )}
                                    <div className="grid items-start gap-4 lg:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.6fr)]">
                                        {group.context && (
                                            <SponsorMembershipPanel
                                                context={group.context}
                                                caseCount={group.cases[0]?.detail.sponsorship_case_count ?? 0}
                                                hasRange={hasIndividualRange}
                                            />
                                        )}
                                        <div className="min-w-0 space-y-4">
                                            {group.cases.map((caseReport, index) => (
                                                <CaseReportPanel key={caseReport.detail.id} report={caseReport} index={index + 1} total={group.cases.length} hasRange={hasIndividualRange} />
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            ))}
                        </motion.div>
                    )}
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

function SelectionMark({ checked }: { checked: boolean }) {
    return (
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${checked ? "border-accent bg-accent text-white" : "border-border bg-bg text-transparent"}`}>
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
    );
}

function SponsorMembershipPanel({
    context,
    caseCount,
    hasRange,
}: {
    context: SponsorshipSponsorContext;
    caseCount: number;
    hasRange: boolean;
}) {
    const successfulCase = context.last_sponsorship_id
        ? `${caseCode(context.last_sponsorship_id)} · ${context.last_sponsorship_name || "Beneficiary not recorded"}`
        : null;
    const successfulDate = context.last_sponsorship_completed_at
        ? `Completed ${formatDate(context.last_sponsorship_completed_at)}`
        : context.last_sponsorship_date
            ? `Started ${formatDate(context.last_sponsorship_date)}`
            : null;

    return (
        <aside className="overflow-hidden rounded-xl border border-border bg-muted/10 lg:sticky lg:top-4">
            <div className="border-b border-border bg-muted/20 px-4 py-3.5">
                <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-muted" />
                    <h5 className="text-sm font-semibold text-ink">Co-sponsor membership</h5>
                </div>
                <p className="mt-1 text-xs text-muted">Member-level context across every sponsorship case.</p>
            </div>
            <div className="space-y-2.5 p-4 text-sm">
                <DetailRow label="Name" value={context.member_name} />
                <DetailRow label="Status" value={context.member_status || "-"} />
                <DetailRow label="Membership start" value={formatDate(context.membership_start_date)} />
                <DetailRow label="Phone" value={context.member_phone || "-"} />
                <DetailRow label="Email" value={context.member_email || "-"} />
                <DetailRow label={hasRange ? "Cases in range" : "Cases sponsored"} value={String(caseCount)} />
                <DetailRow label="Incomplete cases" value={String(context.incomplete_sponsorship_count)} />
                <DetailRow label="Contribution payments" value={String(context.payment_history.length)} />
            </div>
            <div className="border-t border-border px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Last successful case</div>
                {successfulCase ? (
                    <div className="mt-2">
                        <div className="text-sm font-semibold leading-snug text-ink">{successfulCase}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                            <span>{successfulDate}</span>
                            <span aria-hidden="true">·</span>
                            <span>{context.last_sponsorship_status}</span>
                        </div>
                    </div>
                ) : (
                    <p className="mt-2 text-sm text-muted">No completed sponsorship case yet.</p>
                )}
            </div>
        </aside>
    );
}

function CaseReportPanel({
    report,
    index,
    total,
    hasRange,
}: {
    report: SponsorshipIndividualCaseReport;
    index: number;
    total: number;
    hasRange: boolean;
}) {
    const detail = report.detail;
    const budgetRound = detail.budget_round
        ? `${detail.budget_round.year} · Round ${detail.budget_round.round_number}`
        : "-";
    const volunteerServices = [
        ...(detail.volunteer_services || []),
        detail.volunteer_service_other,
    ].filter(Boolean).join(", ") || "-";
    const statusTone = ["Completed", "Closed"].includes(detail.status)
        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : detail.status === "Active"
            ? "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300"
            : detail.status === "Rejected" || detail.status === "Suspended"
                ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
                : "border-border bg-muted/30 text-muted";

    return (
        <motion.article layout className="overflow-hidden rounded-xl border border-border bg-card/50">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/15 px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h5 className="text-sm font-semibold text-ink">{caseCode(detail.id)}</h5>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}>{detail.status}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">{immigrantName(detail)}</p>
                </div>
                {total > 1 && <span className="text-xs tabular-nums text-muted">Case {index} of {total}</span>}
            </div>

            <div className="grid divide-y divide-border xl:grid-cols-3 xl:divide-x xl:divide-y-0">
                <CaseInfoSection title="Case" rows={[
                    ["Immigrant", immigrantName(detail)],
                    ["Sponsorship start", formatDate(detail.start_date)],
                    ["Expected end", formatDate(detail.end_date)],
                    ["Completed", formatDateTime(detail.completed_at)],
                    ["Frequency", humanize(detail.frequency)],
                    ["Program", humanize(detail.program)],
                ]} />
                <CaseInfoSection title="Funding" rows={[
                    ["Monthly commitment", formatMoney(detail.monthly_amount)],
                    [hasRange ? "Received in range" : "Received", formatMoney(hasRange ? detail.received_amount_in_range : detail.received_amount)],
                    ...(hasRange ? [["Total received", formatMoney(detail.received_amount)] as [string, string]] : []),
                    ["Trust fund deposit", detail.payment_information || "-"],
                    ["Budget round", budgetRound],
                    ["Slots used / allocated", `${detail.used_slots ?? 0} / ${detail.budget_slots ?? "-"}`],
                ]} />
                <CaseInfoSection title="Assignment & record" rows={[
                    ["Pledge channel", humanize(detail.pledge_channel)],
                    ["Reminder channel", humanize(detail.reminder_channel)],
                    ["Motivation", humanize(detail.motivation)],
                    ["Volunteer services", volunteerServices],
                    ["Father of repentance", detail.father_of_repentance_name || "-"],
                    ["Assigned staff ID", detail.assigned_staff_id ? String(detail.assigned_staff_id) : "-"],
                    ["Created", formatDateTime(detail.created_at)],
                    ["Last updated", formatDateTime(detail.updated_at)],
                ]} />
            </div>

            <div className="border-t border-border px-4 py-4 sm:px-5">
                <div className="grid gap-5 xl:grid-cols-2">
                    <div>
                        <h6 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Lifecycle activity {hasRange ? "in range" : ""}</h6>
                        {report.timeline.items.length > 0 ? (
                            <div className="mt-3 space-y-3">
                                {report.timeline.items.map((event) => (
                                    <div key={event.id} className="relative pl-4 text-sm before:absolute before:left-0 before:top-1.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-accent">
                                        <div className="font-medium text-ink">{event.label}</div>
                                        <div className="mt-0.5 text-xs text-muted">{formatDateTime(event.occurred_at)}{event.actor_name ? ` · ${event.actor_name}` : ""}</div>
                                        {event.reason && <p className="mt-1 text-xs leading-relaxed text-muted">{event.reason}</p>}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-muted">No lifecycle activity in this period.</p>
                        )}
                    </div>
                    <div>
                        <h6 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Case notes {hasRange ? "in range" : ""}</h6>
                        {detail.notes && (
                            <div className="mt-3 rounded-lg bg-muted/25 px-3 py-2.5 text-sm leading-relaxed text-ink">{detail.notes}</div>
                        )}
                        {report.notes.items.length > 0 ? (
                            <div className={`${detail.notes ? "mt-2" : "mt-3"} space-y-2`}>
                                {report.notes.items.map((note) => (
                                    <div key={note.id} className="border-l-2 border-border pl-3 text-sm">
                                        <p className="leading-relaxed text-ink">{note.restricted ? "Restricted note" : note.note || "-"}</p>
                                        <p className="mt-1 text-xs text-muted">{formatDateTime(note.created_at)}{note.created_by_name ? ` · ${note.created_by_name}` : ""}</p>
                                    </div>
                                ))}
                            </div>
                        ) : !detail.notes ? (
                            <p className="mt-3 text-sm text-muted">No case notes in this period.</p>
                        ) : null}
                    </div>
                </div>
                {(detail.last_status || detail.last_status_reason || detail.rejection_reason) && (
                    <div className="mt-5 border-t border-border pt-4">
                        <CaseInfoSection compact title="Decision" rows={[
                            ["Last decision", detail.last_status || "-"],
                            ["Decision reason", detail.last_status_reason || detail.rejection_reason || "-"],
                        ]} />
                    </div>
                )}
            </div>
        </motion.article>
    );
}

function CaseInfoSection({ title, rows, compact = false }: { title: string; rows: Array<[string, string]>; compact?: boolean }) {
    return (
        <section className={compact ? "" : "p-4 sm:p-5"}>
            <h6 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{title}</h6>
            <div className={`mt-3 grid gap-x-4 gap-y-2.5 ${compact ? "sm:grid-cols-2" : ""}`}>
                {rows.map(([label, value]) => <DetailRow key={label} label={label} value={value} />)}
            </div>
        </section>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex min-w-0 items-start justify-between gap-3">
            <span className="shrink-0 text-xs text-muted">{label}</span>
            <span className="min-w-0 break-words text-right text-xs font-medium leading-relaxed text-ink">{value}</span>
        </div>
    );
}
