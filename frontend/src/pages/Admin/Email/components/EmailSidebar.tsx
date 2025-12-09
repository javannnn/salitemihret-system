import { Button } from "@/components/ui";
import { Inbox, Send, File, Trash2, Plus } from "lucide-react";
import { useToast } from "@/components/Toast";

interface EmailSidebarProps {
    currentView: "inbox" | "sent" | "drafts" | "trash";
    onViewChange: (view: "inbox" | "sent" | "drafts" | "trash") => void;
    onCompose: () => void;
    unreadCount?: number;
}

export function EmailSidebar({ currentView, onViewChange, onCompose, unreadCount = 0 }: EmailSidebarProps) {
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
        </div>
    );
}
