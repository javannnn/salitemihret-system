import { useState, useEffect, useMemo } from "react";
import { Overview } from "./components/Overview";
import { MembersReport } from "./components/MembersReport";
import { NewcomersReport } from "./components/NewcomersReport";
import { PaymentsReport } from "./components/PaymentsReport";
import { SponsorshipsReport } from "./components/SponsorshipsReport";
import { SchoolsReport } from "./components/SchoolsReport";
import { ParishCouncilsReport } from "./components/ParishCouncilsReport";
import { ReportAssistantPanel } from "./components/ReportAssistantPanel";
import { LayoutDashboard, Users, UserPlus, CreditCard, Heart, GraduationCap, Sparkles, ArrowUpRight, Building2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";
import { AIReportQAModule } from "@/lib/api";
import { Button } from "@/components/ui";

type ReportTab = "overview" | "members" | "newcomers" | "payments" | "sponsorships" | "schools" | "councils";

export default function ReportsClient() {
    const [activeTab, setActiveTab] = useState<ReportTab>("overview");
    const [assistantOpen, setAssistantOpen] = useState(false);
    const permissions = usePermissions();
    const navigate = useNavigate();
    const canViewOverviewReport = permissions.canAccessReport("overview");
    const canViewMembersReport = permissions.viewMembers && permissions.canAccessReport("members");
    const canViewNewcomersReport = permissions.viewNewcomers && permissions.canAccessReport("newcomers");
    const canViewPaymentsReport = permissions.viewPayments && permissions.canAccessReport("payments");
    const canViewSponsorshipsReport = permissions.viewSponsorships && permissions.canAccessReport("sponsorships");
    const canViewSchoolsReport = permissions.viewSchools && permissions.canAccessReport("schools");
    const canViewCouncilsReport = permissions.canAccessReport("councils");

    const tabs = [
        { id: "overview", label: "Overview", icon: LayoutDashboard, visible: canViewOverviewReport },
        { id: "members", label: "Members", icon: Users, visible: canViewMembersReport },
        { id: "newcomers", label: "Newcomers", icon: UserPlus, visible: canViewNewcomersReport },
        { id: "payments", label: "Financials", icon: CreditCard, visible: canViewPaymentsReport },
        { id: "sponsorships", label: "Sponsorships", icon: Heart, visible: canViewSponsorshipsReport },
        { id: "schools", label: "Schools", icon: GraduationCap, visible: canViewSchoolsReport },
        { id: "councils", label: "Parish Councils", icon: Building2, visible: canViewCouncilsReport },
    ] as const;

    const visibleTabs = tabs.filter(t => t.visible);

    const assistantModules = useMemo(() => {
        switch (activeTab) {
            case "members":
                return canViewMembersReport ? ["members"] as AIReportQAModule[] : [];
            case "payments":
                return canViewPaymentsReport ? ["payments"] as AIReportQAModule[] : [];
            case "newcomers":
                return [
                    ...(canViewNewcomersReport ? ["newcomers" as const] : []),
                    ...(canViewOverviewReport ? ["activity" as const] : []),
                ];
            case "sponsorships":
                return [
                    ...(canViewSponsorshipsReport ? ["sponsorships" as const] : []),
                    ...(canViewNewcomersReport ? ["newcomers" as const] : []),
                ];
            case "schools":
                return canViewSchoolsReport ? ["schools"] as AIReportQAModule[] : [];
            case "councils":
                return [];
            case "overview":
            default:
                return [
                    ...(canViewMembersReport ? ["members" as const] : []),
                    ...(canViewPaymentsReport ? ["payments" as const] : []),
                    ...(canViewSponsorshipsReport ? ["sponsorships" as const] : []),
                    ...(canViewNewcomersReport ? ["newcomers" as const] : []),
                    ...(canViewSchoolsReport ? ["schools" as const] : []),
                    ...(canViewOverviewReport ? ["activity" as const] : []),
                ];
        }
    }, [
        activeTab,
        canViewMembersReport,
        canViewNewcomersReport,
        canViewOverviewReport,
        canViewPaymentsReport,
        canViewSchoolsReport,
        canViewSponsorshipsReport,
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
            case "newcomers":
                return {
                    scopeLabel: "Newcomer reports",
                    suggestions: [
                        "Which newcomer cases need attention first?",
                        "Summarize the newcomer follow-up pressure right now.",
                        "What stands out in newcomer ownership and settlement progress?",
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
            case "councils":
                return {
                    scopeLabel: "Parish council reports",
                    suggestions: [],
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
                return canViewOverviewReport ? <Overview onNavigate={(tab) => setActiveTab(tab as ReportTab)} /> : null;
            case "members":
                return canViewMembersReport ? <MembersReport /> : null;
            case "newcomers":
                return canViewNewcomersReport ? <NewcomersReport /> : null;
            case "payments":
                return canViewPaymentsReport ? <PaymentsReport /> : null;
            case "sponsorships":
                return canViewSponsorshipsReport ? <SponsorshipsReport /> : null;
            case "schools":
                return canViewSchoolsReport ? <SchoolsReport /> : null;
            case "councils":
                return canViewCouncilsReport ? <ParishCouncilsReport /> : null;
            default:
                return canViewOverviewReport ? <Overview onNavigate={(tab) => setActiveTab(tab as ReportTab)} /> : null;
        }
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-bg">
            <div className="border-b border-border bg-card px-6 py-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-ink">Reports & Analytics</h1>
                        <p className="text-sm text-muted">Live operational reporting across members, newcomers, finance, sponsorships, parish councils, schools, and activity.</p>
                    </div>
                    {assistantModules.length > 0 ? (
                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                className="group relative h-12 overflow-hidden rounded-[20px] border border-accent/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(255,255,255,0.94),rgba(251,191,36,0.14))] px-4 text-ink shadow-[0_18px_42px_rgba(245,158,11,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[0_22px_52px_rgba(245,158,11,0.16)] dark:border-amber-400/18 dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(30,41,59,0.96),rgba(15,23,42,0.98))] dark:text-slate-50 dark:shadow-[0_20px_48px_rgba(0,0,0,0.34)] dark:hover:border-amber-300/24"
                                onClick={() => setAssistantOpen(true)}
                            >
                                <span className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.52),transparent_38%),radial-gradient(circle_at_88%_18%,rgba(245,158,11,0.18),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.10),transparent_34%),radial-gradient(circle_at_88%_18%,rgba(245,158,11,0.18),transparent_28%)]" />
                                <span className="relative flex items-center gap-3">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-[14px] border border-white/60 bg-white/85 text-accent shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-amber-200">
                                        <Sparkles size={16} />
                                    </span>
                                    <span className="text-left leading-none">
                                        <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted dark:text-slate-300/80">Ask AI</span>
                                        <span className="mt-1 block text-sm font-semibold text-ink dark:text-slate-50">Open assistant</span>
                                    </span>
                                    <ArrowUpRight size={16} className="ml-1 text-muted transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 dark:text-slate-300" />
                                </span>
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
