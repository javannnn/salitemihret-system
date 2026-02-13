import { useState, useEffect, useMemo } from "react";
import { getSponsorshipMetrics, SponsorshipMetrics } from "@/lib/api";
import { StatCard } from "./StatCard";
import { AlertCircle, CheckCircle2, Clock, Heart, PieChart as PieIcon, PauseCircle, BadgeCheck } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useToast } from "@/components/Toast";
import { DateRangeControls, DateRangeValue } from "./DateRangeControls";

export function SponsorshipsReport() {
    const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" });
    const [metrics, setMetrics] = useState<SponsorshipMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    const normalizedRange = useMemo(() => {
        if (dateRange.start && dateRange.end && dateRange.start > dateRange.end) {
            return { start: dateRange.end, end: dateRange.start };
        }
        return dateRange;
    }, [dateRange]);
    const hasRange = Boolean(normalizedRange.start || normalizedRange.end);

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
                toast.push("Failed to load sponsorship data", { type: "error" });
            } finally {
                setLoading(false);
            }
        };

        fetchMetrics();
    }, [toast, normalizedRange.start, normalizedRange.end]);

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
