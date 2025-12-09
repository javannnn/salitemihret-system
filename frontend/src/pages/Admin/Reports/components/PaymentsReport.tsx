import { useState, useEffect } from "react";
import { getPaymentSummary, PaymentSummaryResponse } from "@/lib/api";
import { StatCard } from "./StatCard";
import { DollarSign, TrendingUp, CreditCard, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { useToast } from "@/components/Toast";

export function PaymentsReport() {
    const [summary, setSummary] = useState<PaymentSummaryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    useEffect(() => {
        const fetchPayments = async () => {
            try {
                const data = await getPaymentSummary();
                setSummary(data);
            } catch (error) {
                console.error("Failed to fetch payment summary:", error);
                toast.push("Failed to load payment data", { type: "error" });
            } finally {
                setLoading(false);
            }
        };

        fetchPayments();
    }, [toast]);

    if (loading) {
        return <div className="p-8 text-center text-muted">Loading payment statistics...</div>;
    }

    if (!summary) {
        return <div className="p-8 text-center text-muted">No payment data available.</div>;
    }

    const chartData = summary.items.map(item => ({
        name: item.service_type_label,
        value: item.total_amount,
        color: "#" + Math.floor(Math.random() * 16777215).toString(16) // Random color for now, can be improved
    }));

    // Sort by value desc
    chartData.sort((a, b) => b.value - a.value);

    const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Revenue"
                    value={`$${summary.grand_total.toLocaleString()}`}
                    icon={DollarSign}
                    description="All time revenue"
                />
                <StatCard
                    title="Top Service"
                    value={chartData[0]?.name || "N/A"}
                    icon={TrendingUp}
                    description={`$${(chartData[0]?.value || 0).toLocaleString()}`}
                />
                <StatCard
                    title="Transactions"
                    value={summary.items.length} // This is actually service types, API limitation? Let's use it as categories for now
                    icon={CreditCard}
                    description="Active service categories"
                />
                <StatCard
                    title="This Month"
                    value="TBD" // API doesn't give monthly breakdown yet without params
                    icon={Calendar}
                    description="Revenue for current month"
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
                </div>
            </div>
        </div>
    );
}
