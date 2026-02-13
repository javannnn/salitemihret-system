import { useState, useEffect, useMemo } from "react";
import {
    ApiError,
    Member,
    Page,
    PaymentSummaryResponse,
    ReportActivityItem,
    SponsorshipMetrics,
    SundaySchoolStats,
    api,
    getPaymentSummary,
    getReportActivity,
    getSponsorshipMetrics,
    getSundaySchoolStats,
} from "@/lib/api";
import { StatCard } from "./StatCard";
import { Users, DollarSign, Heart, GraduationCap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { DateRangeControls, DateRangeValue } from "./DateRangeControls";

interface OverviewProps {
    onNavigate: (tab: string) => void;
}

export function Overview({ onNavigate }: OverviewProps) {
    const permissions = usePermissions();
    const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" });
    const [stats, setStats] = useState({
        members: 0,
        revenue: 0,
        sponsorships: 0,
        students: 0
    });
    const [paymentSummary, setPaymentSummary] = useState<PaymentSummaryResponse | null>(null);
    const [sponsorshipMetrics, setSponsorshipMetrics] = useState<SponsorshipMetrics | null>(null);
    const [schoolStats, setSchoolStats] = useState<SundaySchoolStats | null>(null);
    const [memberHighlights, setMemberHighlights] = useState({ newThisMonth: 0, missingPhone: 0 });
    const [activity, setActivity] = useState<ReportActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const toast = useToast();
    const topPaymentItem = paymentSummary
        ? [...paymentSummary.items].sort((a, b) => b.total_amount - a.total_amount)[0]
        : null;

    const normalizedRange = useMemo(() => {
        if (dateRange.start && dateRange.end && dateRange.start > dateRange.end) {
            return { start: dateRange.end, end: dateRange.start };
        }
        return dateRange;
    }, [dateRange]);
    const hasRange = Boolean(normalizedRange.start || normalizedRange.end);

    useEffect(() => {
        let cancelled = false;
        const fetchMemberCount = async (params: Record<string, string | number | boolean | undefined>) => {
            const search = new URLSearchParams({ page: "1", page_size: "1" });
            if (hasRange && normalizedRange.start) {
                search.set("created_from", normalizedRange.start);
            }
            if (hasRange && normalizedRange.end) {
                search.set("created_to", normalizedRange.end);
            }
            Object.entries(params).forEach(([key, value]) => {
                if (value === undefined) return;
                search.set(key, String(value));
            });
            const response = await api<Page<Member>>(`/members?${search.toString()}`);
            return response.total;
        };

        const fetchAllStats = async () => {
            setLoading(true);
            try {
                const promises: Promise<any>[] = [];
                const keys: string[] = [];

                if (permissions.viewMembers) {
                    promises.push(fetchMemberCount({})); keys.push("members");
                }
                if (permissions.viewPayments) {
                    promises.push(getPaymentSummary({
                        start_date: normalizedRange.start || undefined,
                        end_date: normalizedRange.end || undefined,
                    }));
                    keys.push("payments");
                }
                if (permissions.viewSponsorships || permissions.viewNewcomers) {
                    promises.push(getSponsorshipMetrics({
                        start_date: normalizedRange.start || undefined,
                        end_date: normalizedRange.end || undefined,
                    }));
                    keys.push("sponsorships");
                }
                if (permissions.viewSchools) {
                    promises.push(getSundaySchoolStats({
                        start_date: normalizedRange.start || undefined,
                        end_date: normalizedRange.end || undefined,
                    }));
                    keys.push("schools");
                }

                const highlightPromises = permissions.viewMembers
                    ? [
                        hasRange ? fetchMemberCount({}) : fetchMemberCount({ new_this_month: true }),
                        fetchMemberCount({ missing_phone: true }),
                    ]
                    : [];

                const results = await Promise.allSettled(promises);
                const highlightResults = await Promise.allSettled(highlightPromises);
                const next = { members: 0, revenue: 0, sponsorships: 0, students: 0 };
                let nextPaymentSummary: PaymentSummaryResponse | null = null;
                let nextSponsorshipMetrics: SponsorshipMetrics | null = null;
                let nextSchoolStats: SundaySchoolStats | null = null;

                results.forEach((res, idx) => {
                    const key = keys[idx];
                    if (res.status === "fulfilled") {
                        if (key === "members") next.members = res.value ?? 0;
                        if (key === "payments") {
                            next.revenue = res.value.grand_total ?? 0;
                            nextPaymentSummary = res.value;
                        }
                        if (key === "sponsorships") {
                            next.sponsorships = res.value.active_cases ?? 0;
                            nextSponsorshipMetrics = res.value;
                        }
                        if (key === "schools") {
                            next.students = res.value.total_participants ?? 0;
                            nextSchoolStats = res.value;
                        }
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

                if (cancelled) return;
                setStats(next);
                setPaymentSummary(nextPaymentSummary);
                setSponsorshipMetrics(nextSponsorshipMetrics);
                setSchoolStats(nextSchoolStats);

                if (permissions.viewMembers) {
                    const [newThisMonthResult, missingPhoneResult] = highlightResults;
                    setMemberHighlights({
                        newThisMonth: newThisMonthResult?.status === "fulfilled" ? newThisMonthResult.value : 0,
                        missingPhone: missingPhoneResult?.status === "fulfilled" ? missingPhoneResult.value : 0,
                    });
                } else {
                    setMemberHighlights({ newThisMonth: 0, missingPhone: 0 });
                }
            } catch (error) {
                console.error("Failed to fetch overview stats:", error);
                toast.push("Failed to load dashboard data", { type: "error" });
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchAllStats();
        return () => {
            cancelled = true;
        };
    }, [
        permissions.viewMembers,
        permissions.viewPayments,
        permissions.viewSponsorships,
        permissions.viewNewcomers,
        permissions.viewSchools,
        hasRange,
        normalizedRange.start,
        normalizedRange.end,
        toast,
    ]);

    useEffect(() => {
        let cancelled = false;
        const fetchActivity = async () => {
            try {
                const items = await getReportActivity({
                    start_date: normalizedRange.start || undefined,
                    end_date: normalizedRange.end || undefined,
                    limit: 25,
                });
                if (!cancelled) setActivity(items);
            } catch (error) {
                console.error("Failed to load activity feed:", error);
                if (!cancelled) setActivity([]);
            }
        };
        fetchActivity();
        return () => {
            cancelled = true;
        };
    }, [normalizedRange.start, normalizedRange.end]);

    if (loading) {
        return <div className="p-8 text-center text-muted">Loading dashboard...</div>;
    }

    const memberCardLabel = hasRange ? "Members (Range)" : "Total Members";
    const memberCardDescription = hasRange ? "Created in selected range" : "Active community";
    const revenueCardLabel = hasRange ? "Revenue (Range)" : "Total Revenue";
    const revenueCardDescription = hasRange ? "Selected range" : "All time";

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

            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-ink">Date Range</h2>
                    <p className="text-sm text-muted">Filter report highlights across the tabs.</p>
                </div>
                <DateRangeControls value={dateRange} onChange={setDateRange} />
            </div>

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title={memberCardLabel}
                    value={stats.members}
                    icon={Users}
                    description={memberCardDescription}
                    className="bg-card border-l-4 border-l-blue-500"
                />
                <StatCard
                    title={revenueCardLabel}
                    value={`$${stats.revenue.toLocaleString()}`}
                    icon={DollarSign}
                    description={revenueCardDescription}
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

            <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 text-lg font-semibold text-ink">Operational Highlights</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-muted">{hasRange ? "Members in range" : "New members this month"}</span>
                            <span className="font-semibold text-ink">
                                {permissions.viewMembers ? memberHighlights.newThisMonth : "—"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted">Profiles missing phone</span>
                            <span className="font-semibold text-ink">
                                {permissions.viewMembers ? memberHighlights.missingPhone : "—"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted">Sponsorship alerts</span>
                            <span className="font-semibold text-ink">{sponsorshipMetrics?.alerts.length ?? "—"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted">Pending school content</span>
                            <span className="font-semibold text-ink">
                                {schoolStats
                                    ? schoolStats.pending_lessons + schoolStats.pending_mezmur + schoolStats.pending_art
                                    : "—"}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 text-lg font-semibold text-ink">Revenue Snapshot</h3>
                    {paymentSummary ? (
                        <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Top service category</span>
                                <span className="font-semibold text-ink">
                                    {topPaymentItem?.service_type_label || "—"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Top category revenue</span>
                                <span className="font-semibold text-ink">
                                    ${topPaymentItem?.total_amount?.toLocaleString() || "0"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Active categories</span>
                                <span className="font-semibold text-ink">{paymentSummary.items.length}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Total recorded revenue</span>
                                <span className="font-semibold text-ink">${paymentSummary.grand_total.toLocaleString()}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-muted">Financial data is restricted for this role.</div>
                    )}
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="mb-4 text-lg font-semibold text-ink">Recent Activity</h3>
                {activity.length === 0 ? (
                    <div className="text-sm text-muted">No recent activity for the selected range.</div>
                ) : (
                    <ul className="space-y-3 text-sm">
                        {activity.slice(0, 8).map((item) => (
                            <li key={item.id} className="flex flex-col gap-1 rounded-lg border border-border bg-card/70 px-4 py-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="font-medium text-ink">
                                        {item.action}
                                        {item.target ? ` · ${item.target}` : ""}
                                    </div>
                                    <div className="text-[11px] text-muted">{new Date(item.occurred_at).toLocaleString()}</div>
                                </div>
                                <div className="text-[11px] text-muted">
                                    {item.actor ? `By ${item.actor}` : "System"} {item.detail ? `· ${item.detail}` : ""}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
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
