import { useState, useEffect, useMemo } from "react";
import { Overview } from "./components/Overview";
import { MembersReport } from "./components/MembersReport";
import { PaymentsReport } from "./components/PaymentsReport";
import { SponsorshipsReport } from "./components/SponsorshipsReport";
import { SchoolsReport } from "./components/SchoolsReport";
import { ReportAssistantPanel } from "./components/ReportAssistantPanel";
import { LayoutDashboard, Users, CreditCard, Heart, GraduationCap, Sparkles } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";
import { AIReportQAModule } from "@/lib/api";
import { Button } from "@/components/ui";

type ReportTab = "overview" | "members" | "payments" | "sponsorships" | "schools";

export default function ReportsClient() {
    const [activeTab, setActiveTab] = useState<ReportTab>("overview");
    const [assistantOpen, setAssistantOpen] = useState(false);
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

    const assistantModules = useMemo(() => {
        switch (activeTab) {
            case "members":
                return permissions.viewMembers ? ["members"] as AIReportQAModule[] : [];
            case "payments":
                return permissions.viewPayments ? ["payments"] as AIReportQAModule[] : [];
            case "sponsorships":
                return [
                    ...(permissions.viewSponsorships ? ["sponsorships" as const] : []),
                    ...(permissions.viewNewcomers ? ["newcomers" as const] : []),
                ];
            case "schools":
                return permissions.viewSchools ? ["schools"] as AIReportQAModule[] : [];
            case "overview":
            default:
                return [
                    ...(permissions.viewMembers ? ["members" as const] : []),
                    ...(permissions.viewPayments ? ["payments" as const] : []),
                    ...(permissions.viewSponsorships ? ["sponsorships" as const] : []),
                    ...(permissions.viewNewcomers ? ["newcomers" as const] : []),
                    ...(permissions.viewSchools ? ["schools" as const] : []),
                    "activity" as const,
                ];
        }
    }, [
        activeTab,
        permissions.viewMembers,
        permissions.viewPayments,
        permissions.viewSponsorships,
        permissions.viewNewcomers,
        permissions.viewSchools,
    ]);

    const assistantConfig = useMemo(() => {
        switch (activeTab) {
            case "members":
                return {
                    scopeLabel: "Member reports",
                    suggestions: [
                        "How healthy is the member roster right now?",
                        "What data quality issue stands out most in member records?",
                        "Summarize the member status mix for me.",
                    ],
                };
            case "payments":
                return {
                    scopeLabel: "Financial reports",
                    suggestions: [
                        "Which service type is leading revenue?",
                        "Summarize payment performance for this period.",
                        "What is the clearest finance takeaway right now?",
                    ],
                };
            case "sponsorships":
                return {
                    scopeLabel: "Sponsorship reports",
                    suggestions: [
                        "How is sponsorship capacity performing?",
                        "What stands out in the sponsorship and newcomer pipeline?",
                        "Are there any sponsorship alerts I should act on?",
                    ],
                };
            case "schools":
                return {
                    scopeLabel: "School reports",
                    suggestions: [
                        "Summarize school participation and contribution trends.",
                        "What is the most important school metric right now?",
                        "Is the content approval queue building up?",
                    ],
                };
            case "overview":
            default:
                return {
                    scopeLabel: "Overview reports",
                    suggestions: [
                        "Give me a quick operational summary.",
                        "Which area needs the most attention?",
                        "What changed recently across reports?",
                    ],
                };
        }
    }, [activeTab]);

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
            <div className="border-b border-border bg-card px-6 py-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-ink">Reports & Analytics</h1>
                        <p className="text-sm text-muted">Live operational reporting across members, finance, sponsorships, schools, and activity.</p>
                    </div>
                    {assistantModules.length > 0 ? (
                        <div className="flex items-center gap-3">
                            <div className="hidden rounded-2xl border border-border bg-bg/70 px-4 py-3 text-right xl:block">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">AI Assistant</div>
                                <div className="mt-1 text-sm font-medium text-ink">{assistantConfig.scopeLabel}</div>
                            </div>
                            <Button variant="soft" className="h-11 px-4" onClick={() => setAssistantOpen(true)}>
                                <Sparkles size={16} />
                                Open AI Assistant
                            </Button>
                        </div>
                    ) : null}
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

            {assistantModules.length > 0 ? (
                <ReportAssistantPanel
                    open={assistantOpen}
                    onClose={() => setAssistantOpen(false)}
                    modules={assistantModules}
                    scopeLabel={assistantConfig.scopeLabel}
                    suggestions={assistantConfig.suggestions}
                />
            ) : null}
        </div>
    );
}
