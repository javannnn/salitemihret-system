import { useState, useEffect } from "react";
import { searchMembers, Member } from "@/lib/api";
import { StatCard } from "./StatCard";
import { Users, UserPlus, UserCheck, UserX } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useToast } from "@/components/Toast";

export function MembersReport() {
    const [members, setMembers] = useState<Member[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    useEffect(() => {
        const fetchMembers = async () => {
            try {
                // Fetch recent members to show some data, but use total from response
                const response = await searchMembers("", 100);
                setMembers(response.items);
                setTotalCount(response.total);
            } catch (error) {
                console.error("Failed to fetch members:", error);
                toast.push("Failed to load member data", { type: "error" });
            } finally {
                setLoading(false);
            }
        };

        fetchMembers();
    }, [toast]);

    if (loading) {
        return <div className="p-8 text-center text-muted">Loading member statistics...</div>;
    }

    // Calculate stats based on the fetched sample (recent members)
    // Note: For accurate global stats, we'd need a dedicated endpoint. 
    // Here we use the total count from the API for the main number, 
    // but distribution is based on the recent 100 members sample.
    const sampleSize = members.length;
    const activeMembersSample = members.filter(m => m.status === "Active").length;
    const inactiveMembersSample = members.filter(m => m.status === "Inactive").length;

    // Estimate global active/inactive based on sample ratio
    const estimatedActive = sampleSize > 0 ? Math.round((activeMembersSample / sampleSize) * totalCount) : 0;
    const estimatedInactive = sampleSize > 0 ? Math.round((inactiveMembersSample / sampleSize) * totalCount) : 0;

    const statusData = [
        { name: "Active", value: activeMembersSample, color: "#10b981" },
        { name: "Inactive", value: inactiveMembersSample, color: "#ef4444" },
        { name: "Pending", value: members.filter(m => m.status === "Pending").length, color: "#f59e0b" },
        { name: "Archived", value: members.filter(m => m.status === "Archived").length, color: "#6b7280" },
    ];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Members"
                    value={totalCount}
                    icon={Users}
                    description="All registered members"
                />
                <StatCard
                    title="Active Members (Est.)"
                    value={estimatedActive}
                    icon={UserCheck}
                    description="Estimated based on recent activity"
                    trend={{ value: Math.round((activeMembersSample / sampleSize) * 100) || 0, label: "of sample", positive: true }}
                />
                <StatCard
                    title="New This Month"
                    value={members.filter(m => {
                        if (!m.created_at) return false;
                        const date = new Date(m.created_at);
                        const now = new Date();
                        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                    }).length}
                    icon={UserPlus}
                    description="Joined in current month"
                />
                <StatCard
                    title="Inactive (Est.)"
                    value={estimatedInactive}
                    icon={UserX}
                    description="Estimated based on recent activity"
                    trend={{ value: Math.round((inactiveMembersSample / sampleSize) * 100) || 0, label: "of sample", positive: false }}
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-6">
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
                                    cursor={{ fill: 'var(--color-accent)', opacity: 0.1 }}
                                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                                    itemStyle={{ color: 'var(--color-ink)' }}
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

                {/* Placeholder for Demographics or other charts */}
                <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-center text-muted">
                    <p>More insights coming soon...</p>
                </div>
            </div>
        </div>
    );
}
