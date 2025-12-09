import { useState, useEffect } from "react";
import { getSponsorshipMetrics, SponsorshipMetrics } from "@/lib/api";
import { StatCard } from "./StatCard";
import { Heart, Users, PieChart as PieIcon, AlertCircle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useToast } from "@/components/Toast";

export function SponsorshipsReport() {
    const [metrics, setMetrics] = useState<SponsorshipMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const data = await getSponsorshipMetrics();
                setMetrics(data);
            } catch (error) {
                console.error("Failed to fetch sponsorship metrics:", error);
                toast.push("Failed to load sponsorship data", { type: "error" });
            } finally {
                setLoading(false);
            }
        };

        fetchMetrics();
    }, [toast]);

    if (loading) {
        return <div className="p-8 text-center text-muted">Loading sponsorship statistics...</div>;
    }

    if (!metrics) {
        return <div className="p-8 text-center text-muted">No sponsorship data available.</div>;
    }

    const budgetData = [
        { name: "Used", value: metrics.current_budget?.used_slots || 0, color: "#ef4444" },
        { name: "Available", value: (metrics.current_budget?.total_slots || 0) - (metrics.current_budget?.used_slots || 0), color: "#10b981" },
    ];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Active Sponsors"
                    value={metrics.total_active_sponsors}
                    icon={Users}
                    description="Members currently sponsoring"
                />
                <StatCard
                    title="Newcomers Sponsored"
                    value={metrics.newcomers_sponsored}
                    icon={Heart}
                    description="Total beneficiaries"
                />
                <StatCard
                    title="Budget Utilization"
                    value={`${metrics.budget_utilization_percent}%`}
                    icon={PieIcon}
                    description="Current month utilization"
                    trend={{
                        value: metrics.budget_utilization_percent,
                        label: "used",
                        positive: metrics.budget_utilization_percent < 90
                    }}
                />
                <StatCard
                    title="Alerts"
                    value={metrics.alerts.length}
                    icon={AlertCircle}
                    description="Issues requiring attention"
                    trend={{ value: metrics.alerts.length, label: "alerts", positive: metrics.alerts.length === 0 }}
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
    );
}
