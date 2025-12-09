import { useState, useEffect } from "react";
import { Overview } from "./components/Overview";
import { MembersReport } from "./components/MembersReport";
import { PaymentsReport } from "./components/PaymentsReport";
import { SponsorshipsReport } from "./components/SponsorshipsReport";
import { SchoolsReport } from "./components/SchoolsReport";
import { LayoutDashboard, Users, CreditCard, Heart, GraduationCap } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";

type ReportTab = "overview" | "members" | "payments" | "sponsorships" | "schools";

export default function ReportsClient() {
    const [activeTab, setActiveTab] = useState<ReportTab>("overview");
    const permissions = usePermissions();
    const navigate = useNavigate();

    const tabs = [
        { id: "overview", label: "Overview", icon: LayoutDashboard, visible: true },
        { id: "members", label: "Members", icon: Users, visible: permissions.viewMembers },
        { id: "payments", label: "Financials", icon: CreditCard, visible: permissions.viewPayments },
        { id: "sponsorships", label: "Sponsorships", icon: Heart, visible: permissions.viewSponsorships || permissions.viewNewcomers },
        { id: "schools", label: "Schools", icon: GraduationCap, visible: permissions.viewSchools },
    ] as const;

    const visibleTabs = tabs.filter(t => t.visible);

    useEffect(() => {
        // Redirect if no permissions at all
        if (visibleTabs.length === 0) {
            navigate("/dashboard");
            return;
        }

        // If current tab is not visible, switch to the first visible one
        const currentTabVisible = visibleTabs.find(t => t.id === activeTab);
        if (!currentTabVisible && visibleTabs.length > 0) {
            setActiveTab(visibleTabs[0].id as ReportTab);
        }
    }, [visibleTabs, activeTab, navigate]);

    const renderContent = () => {
        switch (activeTab) {
            case "overview":
                return <Overview onNavigate={(tab) => setActiveTab(tab as ReportTab)} />;
            case "members":
                return permissions.viewMembers ? <MembersReport /> : null;
            case "payments":
                return permissions.viewPayments ? <PaymentsReport /> : null;
            case "sponsorships":
                return (permissions.viewSponsorships || permissions.viewNewcomers) ? <SponsorshipsReport /> : null;
            case "schools":
                return permissions.viewSchools ? <SchoolsReport /> : null;
            default:
                return <Overview onNavigate={(tab) => setActiveTab(tab as ReportTab)} />;
        }
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-bg">
            {/* Header / Navigation */}
            <div className="border-b border-border bg-card px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-ink">Reports & Analytics</h1>
                        <p className="text-sm text-muted">Real-time insights for your organization</p>
                    </div>
                </div>

                <div className="flex space-x-1 overflow-x-auto pb-1 scrollbar-hide">
                    {visibleTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as ReportTab)}
                                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap
                  ${isActive
                                        ? "bg-accent/10 text-accent"
                                        : "text-muted hover:bg-muted/10 hover:text-ink"
                                    }`}
                            >
                                <Icon size={18} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto max-w-7xl">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}
