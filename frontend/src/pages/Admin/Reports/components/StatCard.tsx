import { Card } from "@/components/ui";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    description?: string;
    trend?: {
        value: number;
        label: string;
        positive?: boolean;
    };
    className?: string;
}

export function StatCard({ title, value, icon: Icon, description, trend, className = "" }: StatCardProps) {
    return (
        <Card className={`p-6 flex flex-col justify-between gap-4 ${className}`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-muted">{title}</p>
                    <h3 className="text-2xl font-bold text-ink mt-1">{value}</h3>
                </div>
                <div className="p-2 bg-accent/10 rounded-lg text-accent">
                    <Icon size={20} />
                </div>
            </div>

            {(description || trend) && (
                <div className="flex items-center gap-2 text-xs">
                    {trend && (
                        <span className={`font-medium ${trend.positive ? "text-emerald-600" : "text-red-600"}`}>
                            {trend.positive ? "+" : ""}{trend.value}%
                        </span>
                    )}
                    <span className="text-muted">{trend ? trend.label : description}</span>
                </div>
            )}
        </Card>
    );
}
