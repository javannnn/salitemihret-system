import { Button } from "@/components/ui";
import { Inbox, Send, File, Trash2, Plus, AlertTriangle, MailCheck, Signal, Sparkles } from "lucide-react";
import { useToast } from "@/components/Toast";
import type { AdminEmailInboxStatus } from "@/lib/api";

interface EmailSidebarProps {
    currentView: "inbox" | "sent" | "drafts" | "trash";
    onViewChange: (view: "inbox" | "sent" | "drafts" | "trash") => void;
    onCompose: () => void;
    unreadCount?: number;
    mailStatus?: AdminEmailInboxStatus | null;
    onReviewLatest?: () => void;
}

export function EmailSidebar({
    currentView,
    onViewChange,
    onCompose,
    unreadCount = 0,
    mailStatus,
    onReviewLatest,
}: EmailSidebarProps) {
    const toast = useToast();

    const navItems = [
        { id: "inbox", label: "Inbox", icon: Inbox, count: unreadCount },
        { id: "sent", label: "Sent", icon: Send, count: undefined },
        { id: "drafts", label: "Drafts", icon: File, count: undefined },
        { id: "trash", label: "Trash", icon: Trash2, count: undefined },
    ] as const;

    const handleViewChange = (id: typeof navItems[number]["id"]) => {
        onViewChange(id);
        if (id !== "inbox") {
            toast.push(`Switched to ${id} folder`);
        }
    };

    const statusTone =
        mailStatus?.state === "mx_mismatch" || mailStatus?.state === "imap_unreachable"
            ? {
                icon: AlertTriangle,
                shell: "border-amber-200/70 bg-[linear-gradient(160deg,rgba(255,251,235,0.98),rgba(255,244,214,0.88))] text-amber-950",
                eyebrow: "text-amber-700/80",
                iconShell: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-300/50",
                action: "border-amber-300/60 bg-white/80 text-amber-900 hover:bg-white",
                title: "Routing attention needed",
            }
            : mailStatus?.state === "ready"
                ? {
                    icon: MailCheck,
                    shell: "border-emerald-200/70 bg-[linear-gradient(160deg,rgba(240,253,244,0.98),rgba(222,247,236,0.88))] text-emerald-950",
                    eyebrow: "text-emerald-700/80",
                    iconShell: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-300/60",
                    action: "border-emerald-300/60 bg-white/80 text-emerald-900 hover:bg-white",
                    title: "Mail flow verified",
                }
                : {
                    icon: Signal,
                    shell: "border-slate-200/80 bg-[linear-gradient(160deg,rgba(248,250,252,0.98),rgba(241,245,249,0.9))] text-slate-900",
                    eyebrow: "text-slate-500",
                    iconShell: "bg-slate-900/5 text-slate-700 ring-1 ring-slate-200",
                    action: "border-slate-300/70 bg-white/80 text-slate-900 hover:bg-white",
                    title: "Mail flow checking",
                };
    const StatusIcon = statusTone.icon;
    const mailStatusSummary = mailStatus?.summary ?? "Checking inbound routing and mailbox reachability.";
    const mailStatusDetails = mailStatus?.details;

    return (
        <div className="flex h-full flex-col gap-4 border-r border-border bg-card p-4">
            <Button
                onClick={onCompose}
                className="w-full justify-start gap-2 bg-ink text-white hover:bg-ink/90 shadow-md transition-all hover:shadow-lg dark:bg-white dark:text-black dark:hover:bg-white/90"
            >
                <Plus size={18} />
                <span className="font-medium">Compose</span>
            </Button>

            <nav className="flex flex-col gap-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => handleViewChange(item.id)}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${currentView === item.id
                            ? "bg-accent/10 text-accent"
                            : "text-muted hover:bg-accent/5 hover:text-ink"
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <item.icon size={18} />
                            <span>{item.label}</span>
                        </div>
                        {item.count ? (
                            <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                                {item.count}
                            </span>
                        ) : null}
                    </button>
                ))}
            </nav>

            <div className={`mt-auto overflow-hidden rounded-[1.75rem] border p-4 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] ${statusTone.shell}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${statusTone.eyebrow}`}>
                            Mail flow
                        </div>
                        <div className="mt-2 text-sm font-semibold leading-5">
                            {statusTone.title}
                        </div>
                    </div>
                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${statusTone.iconShell}`}>
                        <StatusIcon size={18} />
                    </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-current/85">
                    {mailStatusSummary}
                </p>
                {mailStatusDetails ? (
                    <p className="mt-2 text-[11px] leading-5 text-current/65">
                        {mailStatusDetails}
                    </p>
                ) : null}

                <div className="mt-4 flex items-center gap-2">
                    {unreadCount > 0 && onReviewLatest ? (
                        <button
                            type="button"
                            onClick={onReviewLatest}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${statusTone.action}`}
                        >
                            <Sparkles size={14} />
                            Review {unreadCount} new {unreadCount === 1 ? "message" : "messages"}
                        </button>
                    ) : null}
                    {mailStatus?.mailbox_address ? (
                        <div className="truncate rounded-full border border-white/50 bg-white/55 px-3 py-1 text-[11px] font-medium text-current/75">
                            {mailStatus.mailbox_address}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
