import { useState, useEffect } from "react";
import { searchMembers, getPaymentSummary, getSponsorshipMetrics, getSundaySchoolStats, ApiError } from "@/lib/api";
import { StatCard } from "./StatCard";
import { Users, DollarSign, Heart, GraduationCap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/components/Toast";
import { usePermissions } from "@/hooks/usePermissions";

interface OverviewProps {
    onNavigate: (tab: string) => void;
}

export function Overview({ onNavigate }: OverviewProps) {
    const permissions = usePermissions();
    const [stats, setStats] = useState({
        members: 0,
        revenue: 0,
        sponsorships: 0,
        students: 0
    });
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    useEffect(() => {
        const fetchAllStats = async () => {
            try {
                const promises: Promise<any>[] = [];
                const keys: string[] = [];

                promises.push(searchMembers("", 1)); keys.push("members");
                if (permissions.viewPayments) { promises.push(getPaymentSummary()); keys.push("payments"); }
                if (permissions.viewSponsorships || permissions.viewNewcomers) { promises.push(getSponsorshipMetrics()); keys.push("sponsorships"); }
                if (permissions.viewSchools) { promises.push(getSundaySchoolStats()); keys.push("schools"); }

                const results = await Promise.allSettled(promises);
                const next = { members: 0, revenue: 0, sponsorships: 0, students: 0 };

                results.forEach((res, idx) => {
                    const key = keys[idx];
                    if (res.status === "fulfilled") {
                        if (key === "members") next.members = res.value.total ?? 0;
                        if (key === "payments") next.revenue = res.value.grand_total ?? 0;
                        if (key === "sponsorships") next.sponsorships = res.value.total_active_sponsors ?? 0;
                        if (key === "schools") next.students = res.value.total_participants ?? 0;
                    } else {
                        const err = res.reason;
                        if (err instanceof ApiError && err.status === 403) {
                            // Silence 403s; user lacks permission for this slice
                            return;
                        }
                        console.error(`Failed to load ${key} stats:`, err);
                        toast.push(`Failed to load ${key} stats`, { type: "warning" });
                    }
                });

                setStats(next);
            } catch (error) {
                console.error("Failed to fetch overview stats:", error);
                toast.push("Failed to load dashboard data", { type: "error" });
            } finally {
                setLoading(false);
            }
        };

        fetchAllStats();
    }, [toast]);

    if (loading) {
        return <div className="p-8 text-center text-muted">Loading dashboard...</div>;
    }

    // Mock data for the main activity chart
    const activityData = [
        { name: "Mon", value: 400 },
        { name: "Tue", value: 300 },
        { name: "Wed", value: 550 },
        { name: "Thu", value: 450 },
        { name: "Fri", value: 600 },
        { name: "Sat", value: 800 },
        { name: "Sun", value: 750 },
    ];

    return (
        <div className="space-y-8">
            {/* Hero Section */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-8 text-white shadow-lg">
                <div className="relative z-10">
                    <h1 className="text-3xl font-bold mb-2">Welcome to Admin Reports</h1>
                    <p className="text-white/80 max-w-xl mb-6">
                        Get real-time insights into your organization's performance. Track members, finances, and programs all in one place.
                    </p>
                    <div className="flex gap-3">
                        <Button
                            onClick={() => onNavigate("members")}
                            className="bg-white text-indigo-600 hover:bg-white/90 border-none"
                        >
                            View Members
                        </Button>
                        <Button
                            onClick={() => onNavigate("payments")}
                            variant="outline"
                            className="bg-transparent text-white border-white hover:bg-white/10 hover:text-white"
                        >
                            View Financials
                        </Button>
                    </div>
                </div>
                {/* Decorative circles */}
                <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            </div>

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Members"
                    value={stats.members}
                    icon={Users}
                    description="Active community"
                    className="bg-card border-l-4 border-l-blue-500"
                />
                <StatCard
                    title="Total Revenue"
                    value={`$${stats.revenue.toLocaleString()}`}
                    icon={DollarSign}
                    description="All time"
                    className="bg-card border-l-4 border-l-emerald-500"
                />
                <StatCard
                    title="Active Sponsors"
                    value={stats.sponsorships}
                    icon={Heart}
                    description="Supporting others"
                    className="bg-card border-l-4 border-l-pink-500"
                />
                <StatCard
                    title="Students"
                    value={stats.students}
                    icon={GraduationCap}
                    description="Enrolled in programs"
                    className="bg-card border-l-4 border-l-violet-500"
                />
            </div>

            {/* Activity Chart */}
            <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-semibold text-ink">System Activity</h3>
                        <p className="text-sm text-muted">Overview of system usage over the last 7 days</p>
                    </div>
                </div>
                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={activityData}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
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
                                contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                                itemStyle={{ color: 'var(--color-ink)' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="var(--color-accent)"
                                fillOpacity={1}
                                fill="url(#colorValue)"
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Quick Links */}
            <div className="grid gap-4 md:grid-cols-2">
                <div
                    onClick={() => onNavigate("sponsorships")}
                    className="group cursor-pointer rounded-xl border border-border bg-card p-6 transition-all hover:shadow-md hover:border-accent/50"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-full bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400">
                                <Heart size={24} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-ink group-hover:text-accent transition-colors">Sponsorship Health</h3>
                                <p className="text-sm text-muted">View budget utilization and alerts</p>
                            </div>
                        </div>
                        <ArrowRight className="text-muted group-hover:text-accent transition-colors" />
                    </div>
                </div>

                <div
                    onClick={() => onNavigate("schools")}
                    className="group cursor-pointer rounded-xl border border-border bg-card p-6 transition-all hover:shadow-md hover:border-accent/50"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                                <GraduationCap size={24} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-ink group-hover:text-accent transition-colors">School Performance</h3>
                                <p className="text-sm text-muted">Track enrollment and revenue</p>
                            </div>
                        </div>
                        <ArrowRight className="text-muted group-hover:text-accent transition-colors" />
                    </div>
                </div>
            </div>
        </div>
    );
}
