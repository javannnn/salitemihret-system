import { useState, useEffect, useMemo } from "react";
import { getPaymentSummary, PaymentSummaryResponse } from "@/lib/api";
import { StatCard } from "./StatCard";
import { DollarSign, TrendingUp, CreditCard, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { useToast } from "@/components/Toast";
import { DateRangeControls, DateRangeValue } from "./DateRangeControls";

export function PaymentsReport() {
    const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" });
    const [allTimeSummary, setAllTimeSummary] = useState<PaymentSummaryResponse | null>(null);
    const [rangeSummary, setRangeSummary] = useState<PaymentSummaryResponse | null>(null);
    const [monthSummary, setMonthSummary] = useState<PaymentSummaryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    const normalizedRange = useMemo(() => {
        if (dateRange.start && dateRange.end && dateRange.start > dateRange.end) {
            return { start: dateRange.end, end: dateRange.start };
        }
        return dateRange;
    }, [dateRange]);
    const hasRange = Boolean(normalizedRange.start || normalizedRange.end);

    const displaySummary = hasRange ? rangeSummary ?? allTimeSummary : allTimeSummary;

    const chartData = useMemo(() => {
        if (!displaySummary) return [];
        const data = displaySummary.items.map((item) => ({
            name: item.service_type_label,
            value: item.total_amount,
        }));
        return data.sort((a, b) => b.value - a.value);
    }, [displaySummary]);

    useEffect(() => {
        const fetchPayments = async () => {
            setLoading(true);
            try {
                const today = new Date();
                const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                const formatDate = (value: Date) => value.toISOString().slice(0, 10);

                const rangeParams: { start_date?: string; end_date?: string } = {};
                if (normalizedRange.start) rangeParams.start_date = normalizedRange.start;
                if (normalizedRange.end) rangeParams.end_date = normalizedRange.end;

                const results = await Promise.allSettled([
                    getPaymentSummary(),
                    getPaymentSummary({ start_date: formatDate(monthStart), end_date: formatDate(today) }),
                    hasRange ? getPaymentSummary(rangeParams) : Promise.resolve(null),
                ]);

                const [allTimeResult, monthResult, rangeResult] = results;
                if (allTimeResult.status === "fulfilled") {
                    setAllTimeSummary(allTimeResult.value);
                } else {
                    throw allTimeResult.reason;
                }
                if (monthResult.status === "fulfilled") {
                    setMonthSummary(monthResult.value);
                } else {
                    console.warn("Failed to load month-to-date summary:", monthResult.reason);
                }
                if (rangeResult?.status === "fulfilled") {
                    setRangeSummary(rangeResult.value);
                } else {
                    setRangeSummary(null);
                }
            } catch (error) {
                console.error("Failed to fetch payment summary:", error);
                toast.push("Failed to load payment data", { type: "error" });
            } finally {
                setLoading(false);
            }
        };

        fetchPayments();
    }, [toast, hasRange, normalizedRange.start, normalizedRange.end]);

    if (loading) {
        return <div className="p-8 text-center text-muted">Loading payment statistics...</div>;
    }

    if (!displaySummary) {
        return <div className="p-8 text-center text-muted">No payment data available.</div>;
    }

    const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
    const topService = chartData[0];
    const monthTotal = monthSummary?.grand_total ?? 0;
    const averagePerService = displaySummary.items.length ? displaySummary.grand_total / displaySummary.items.length : 0;
    const contextTitle = hasRange ? "All-time Total" : "Month-to-date";
    const contextValue = hasRange
        ? `$${(allTimeSummary?.grand_total ?? 0).toLocaleString()}`
        : monthSummary
            ? `$${monthTotal.toLocaleString()}`
            : "—";
    const contextDescription = hasRange ? "All time revenue" : "Revenue this month";
    const totalTitle = hasRange ? "Total Revenue (Range)" : "Total Revenue";
    const totalDescription = hasRange ? "Revenue in selected range" : "All time revenue";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-ink">Financial Report</h2>
                    <p className="text-sm text-muted">Track contributions and revenue by service category.</p>
                </div>
                <DateRangeControls value={dateRange} onChange={setDateRange} />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title={totalTitle}
                    value={`$${displaySummary.grand_total.toLocaleString()}`}
                    icon={DollarSign}
                    description={totalDescription}
                />
                <StatCard
                    title="Top Service"
                    value={topService?.name || "N/A"}
                    icon={TrendingUp}
                    description={`$${(topService?.value || 0).toLocaleString()}`}
                />
                <StatCard
                    title="Service Categories"
                    value={displaySummary.items.length}
                    icon={CreditCard}
                    description="Active categories"
                />
                <StatCard
                    title={contextTitle}
                    value={contextValue}
                    icon={Calendar}
                    description={contextDescription}
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 text-lg font-semibold text-ink">Revenue by Service Type</h3>
                    <div className="h-[300px] w-full min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} layout="vertical" margin={{ left: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                                <XAxis type="number" stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    stroke="var(--color-muted)"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    width={100}
                                />
                                <Tooltip
                                    cursor={{ fill: 'var(--color-accent)', opacity: 0.1 }}
                                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                                    itemStyle={{ color: 'var(--color-ink)' }}
                                    formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {displaySummary.items.length === 0 && (
                        <div className="mt-4 text-sm text-muted">No revenue data available for the selected period.</div>
                    )}
                </div>

                <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 text-lg font-semibold text-ink">Revenue Distribution</h3>
                    <div className="h-[300px] w-full min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius={100}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                                    itemStyle={{ color: 'var(--color-ink)' }}
                                    formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 text-sm text-muted">
                        Average per service category: ${averagePerService.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="mb-4 text-lg font-semibold text-ink">Top Categories</h3>
                <div className="grid gap-3 md:grid-cols-2">
                    {chartData.slice(0, 6).map((entry, index) => {
                        const share = displaySummary.grand_total ? Math.round((entry.value / displaySummary.grand_total) * 100) : 0;
                        return (
                            <div key={entry.name} className="flex items-center justify-between rounded-lg border border-border bg-card/70 px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                    <div>
                                        <div className="font-medium text-ink">{entry.name}</div>
                                        <div className="text-[11px] text-muted">{share}% of total revenue</div>
                                    </div>
                                </div>
                                <div className="text-sm font-semibold text-ink">${entry.value.toLocaleString()}</div>
                            </div>
                        );
                    })}
                    {chartData.length === 0 && (
                        <div className="text-sm text-muted">No revenue categories available yet.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
