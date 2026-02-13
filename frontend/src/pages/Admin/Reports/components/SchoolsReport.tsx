import { useState, useEffect, useMemo } from "react";
import { getSundaySchoolStats, SundaySchoolStats, ApiError } from "@/lib/api";
import { StatCard } from "./StatCard";
import { GraduationCap, Users, ClipboardList } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useToast } from "@/components/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { DateRangeControls, DateRangeValue } from "./DateRangeControls";

export function SchoolsReport() {
    const permissions = usePermissions();
    const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" });
    const [stats, setStats] = useState<SundaySchoolStats | null>(null);
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
        const fetchStats = async () => {
            setLoading(true);
            try {
                if (!permissions.viewSchools) {
                    setStats(null);
                    return;
                }
                const data = await getSundaySchoolStats({
                    start_date: normalizedRange.start || undefined,
                    end_date: normalizedRange.end || undefined,
                });
                setStats(data);
            } catch (error) {
                console.error("Failed to fetch school stats:", error);
                if (error instanceof ApiError && error.status === 403) {
                    setStats(null);
                } else {
                    toast.push("Failed to load school data", { type: "error" });
                }
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [toast, permissions.viewSchools, normalizedRange.start, normalizedRange.end]);

    if (loading) {
        return <div className="p-8 text-center text-muted">Loading school statistics...</div>;
    }

    if (!stats) {
        return <div className="p-8 text-center text-muted">No school data available.</div>;
    }

    const participantData = [
        { name: "Child", value: stats.count_child, color: "#3b82f6" },
        { name: "Youth", value: stats.count_youth, color: "#8b5cf6" },
        { name: "Adult", value: stats.count_adult, color: "#10b981" },
    ];
    const pendingTotal = stats.pending_lessons + stats.pending_mezmur + stats.pending_art;
    const contributionRate = stats.total_participants
        ? Math.round((stats.count_paying_contribution / stats.total_participants) * 100)
        : 0;
    const revenueLabel = hasRange ? "Revenue (Range)" : "Revenue (30d)";
    const revenueDescription = hasRange ? "Selected range" : "Last 30 days";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-ink">Schools Report</h2>
                    <p className="text-sm text-muted">Enrollment, revenue, and curriculum status.</p>
                </div>
                <DateRangeControls value={dateRange} onChange={setDateRange} />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Participants"
                    value={stats.total_participants}
                    icon={Users}
                    description="Enrolled students"
                />
                <StatCard
                    title="Contribution Rate"
                    value={`${contributionRate}%`}
                    icon={Users}
                    description="Paying contributors"
                />
                <StatCard
                    title={revenueLabel}
                    value={`$${stats.revenue_last_30_days.toLocaleString()}`}
                    icon={GraduationCap}
                    description={revenueDescription}
                />
                <StatCard
                    title="Pending Content"
                    value={pendingTotal}
                    icon={ClipboardList}
                    description="Awaiting approval"
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 text-lg font-semibold text-ink">Participants by Category</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={participantData}>
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
                                />
                                <Tooltip
                                    cursor={{ fill: 'var(--color-accent)', opacity: 0.1 }}
                                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                                    itemStyle={{ color: 'var(--color-ink)' }}
                                />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                    {participantData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-xl border border-border bg-card p-6">
                        <h3 className="mb-4 text-lg font-semibold text-ink">Contribution Status</h3>
                        <div className="flex flex-col justify-center h-[180px] gap-4">
                            <div className="flex items-center justify-between p-4 bg-accent/5 rounded-lg border border-accent/10">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-full">
                                        <Users size={20} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-ink">Paying Contributors</p>
                                        <p className="text-sm text-muted">Regular contributors</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-ink">{stats.count_paying_contribution}</div>
                                    <div className="text-xs text-muted">{contributionRate}% of total</div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-red-500/5 rounded-lg border border-red-500/10">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-500/10 text-red-500 rounded-full">
                                        <Users size={20} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-ink">Non-Contributing</p>
                                        <p className="text-sm text-muted">Not currently paying</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-ink">{stats.count_not_paying_contribution}</div>
                                    <div className="text-xs text-muted">{100 - contributionRate}% of total</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-6">
                        <h3 className="mb-4 text-lg font-semibold text-ink">Content Queue</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Pending lessons</span>
                                <span className="font-semibold text-ink">{stats.pending_lessons}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Pending mezmur</span>
                                <span className="font-semibold text-ink">{stats.pending_mezmur}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Pending art</span>
                                <span className="font-semibold text-ink">{stats.pending_art}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Total pending</span>
                                <span className="font-semibold text-ink">{pendingTotal}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
