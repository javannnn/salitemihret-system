import { useState, useEffect, useMemo } from "react";
import { ApiError, Member, Page, api } from "@/lib/api";
import { StatCard } from "./StatCard";
import { Users, UserPlus, UserCheck, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useToast } from "@/components/Toast";
import { DateRangeControls, DateRangeValue } from "./DateRangeControls";

export function MembersReport() {
    const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" });
    const [recentMembers, setRecentMembers] = useState<Member[]>([]);
    const [counts, setCounts] = useState({
        total: 0,
        active: 0,
        inactive: 0,
        pending: 0,
        archived: 0,
        newThisMonth: 0,
        missingPhone: 0,
        hasChildren: 0,
    });
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
        let cancelled = false;
        const fetchCount = async (params: Record<string, string | number | boolean | undefined>) => {
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

        const fetchMembers = async () => {
            setLoading(true);
            try {
                const recentParams = new URLSearchParams({
                    page: "1",
                    page_size: "6",
                    sort: "-created_at",
                });
                if (hasRange && normalizedRange.start) {
                    recentParams.set("created_from", normalizedRange.start);
                }
                if (hasRange && normalizedRange.end) {
                    recentParams.set("created_to", normalizedRange.end);
                }

                const results = await Promise.allSettled([
                    fetchCount({}),
                    fetchCount({ status: "Active" }),
                    fetchCount({ status: "Inactive" }),
                    fetchCount({ status: "Pending" }),
                    fetchCount({ status: "Archived" }),
                    hasRange ? Promise.resolve(0) : fetchCount({ new_this_month: true }),
                    fetchCount({ missing_phone: true }),
                    fetchCount({ has_children: true }),
                    api<Page<Member>>(`/members?${recentParams.toString()}`),
                ]);

                if (cancelled) return;

                const resolve = <T,>(res: PromiseSettledResult<T>, fallback: T) =>
                    res.status === "fulfilled" ? res.value : fallback;

                const total = resolve(results[0], 0);
                const active = resolve(results[1], 0);
                const inactive = resolve(results[2], 0);
                const pending = resolve(results[3], 0);
                const archived = resolve(results[4], 0);
                const newThisMonth = resolve(results[5], 0);
                const missingPhone = resolve(results[6], 0);
                const hasChildren = resolve(results[7], 0);
                const recent = resolve(results[8], { items: [], total: 0, page: 1, page_size: 6 } as Page<Member>);

                setCounts({
                    total,
                    active,
                    inactive,
                    pending,
                    archived,
                    newThisMonth,
                    missingPhone,
                    hasChildren,
                });
                setRecentMembers(recent.items);
            } catch (error) {
                console.error("Failed to fetch members:", error);
                if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                    toast.push("Member data access is restricted for this role.", { type: "warning" });
                } else {
                    toast.push("Failed to load member data", { type: "error" });
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchMembers();
        return () => {
            cancelled = true;
        };
    }, [toast, hasRange, normalizedRange.start, normalizedRange.end]);

    if (loading) {
        return <div className="p-8 text-center text-muted">Loading member statistics...</div>;
    }

    const statusData = [
        { name: "Active", value: counts.active, color: "#10b981" },
        { name: "Inactive", value: counts.inactive, color: "#ef4444" },
        { name: "Pending", value: counts.pending, color: "#f59e0b" },
        { name: "Archived", value: counts.archived, color: "#6b7280" },
    ];

    const totalLabel = hasRange ? "Members in Range" : "Total Members";
    const totalDescription = hasRange ? "Created in selected range" : "All registered members";
    const activeLabel = hasRange ? "Active in Range" : "Active Members";
    const activeDescription = hasRange ? "Active among selected range" : "Currently active";
    const thirdLabel = hasRange ? "Pending in Range" : "New This Month";
    const thirdValue = hasRange ? counts.pending : counts.newThisMonth;
    const thirdDescription = hasRange ? "Pending approvals in range" : "Joined in current month";
    const fourthLabel = hasRange ? "Missing Phone" : "Missing Phone";
    const fourthDescription = hasRange ? "Missing phone in range" : "Profiles missing phone";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-ink">Member Report</h2>
                    <p className="text-sm text-muted">Track member growth, status, and data quality.</p>
                </div>
                <DateRangeControls value={dateRange} onChange={setDateRange} />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title={totalLabel}
                    value={counts.total}
                    icon={Users}
                    description={totalDescription}
                />
                <StatCard
                    title={activeLabel}
                    value={counts.active}
                    icon={UserCheck}
                    description={activeDescription}
                    trend={{
                        value: counts.total ? Math.round((counts.active / counts.total) * 100) : 0,
                        label: "of total",
                        positive: true,
                    }}
                />
                <StatCard
                    title={thirdLabel}
                    value={thirdValue}
                    icon={UserPlus}
                    description={thirdDescription}
                />
                <StatCard
                    title={fourthLabel}
                    value={counts.missingPhone}
                    icon={AlertTriangle}
                    description={fourthDescription}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
                    <h3 className="mb-4 text-lg font-semibold text-ink">Member Status Distribution</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={statusData}>
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
                                    tickFormatter={(value) => `${value}`}
                                />
                                <Tooltip
                                    cursor={{ fill: "var(--color-accent)", opacity: 0.1 }}
                                    contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "8px" }}
                                    itemStyle={{ color: "var(--color-ink)" }}
                                />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-card p-6">
                        <h3 className="text-lg font-semibold text-ink">Roster Health</h3>
                        <p className="text-sm text-muted">Data quality and key cohorts</p>
                        <div className="mt-4 space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Missing phone numbers</span>
                                <span className="font-semibold text-ink">{counts.missingPhone}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Members with children</span>
                                <span className="font-semibold text-ink">{counts.hasChildren}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Pending approvals</span>
                                <span className="font-semibold text-ink">{counts.pending}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">Archived records</span>
                                <span className="font-semibold text-ink">{counts.archived}</span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-6">
                        <h3 className="text-lg font-semibold text-ink">Recent Members</h3>
                        <p className="text-sm text-muted">Latest registrations</p>
                        {recentMembers.length === 0 ? (
                            <div className="mt-4 text-sm text-muted">No recent members found.</div>
                        ) : (
                            <ul className="mt-4 space-y-3 text-sm">
                                {recentMembers.map((member) => (
                                    <li key={member.id} className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="font-medium text-ink">{member.first_name} {member.last_name}</div>
                                            <div className="text-[11px] text-muted">Status: {member.status || "—"}</div>
                                        </div>
                                        <div className="text-[11px] text-muted">
                                            {member.created_at ? new Date(member.created_at).toLocaleDateString() : "—"}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
