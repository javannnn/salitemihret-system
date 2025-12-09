import { Search, RotateCw } from "lucide-react";
import { Input } from "@/components/ui";
import { AdminEmailSummary } from "@/lib/api";
import { useState, useMemo } from "react";

interface EmailListProps {
    emails: AdminEmailSummary[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    loading: boolean;
    folderLabel: string;
    onRefresh: () => void;
    refreshing: boolean;
}

export function EmailList({ emails, selectedId, onSelect, loading, folderLabel, onRefresh, refreshing }: EmailListProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredEmails = useMemo(() => {
        if (!searchQuery.trim()) return emails;
        const query = searchQuery.toLowerCase();
        return emails.filter(
            (email) =>
                email.subject.toLowerCase().includes(query) ||
                email.sender.toLowerCase().includes(query) ||
                email.snippet.toLowerCase().includes(query)
        );
    }, [emails, searchQuery]);

    return (
        <div className="flex h-full flex-col border-r border-border bg-card/50 backdrop-blur-sm">
            <div className="p-4 border-b border-border space-y-3">
                <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-[0.12em] text-muted">Folder</div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onRefresh}
                            className="rounded-full border border-border bg-bg px-2 py-1 text-muted transition hover:text-ink hover:border-accent/50"
                            title="Refresh"
                        >
                            <RotateCw size={14} className={refreshing ? "animate-spin" : ""} />
                        </button>
                        <div className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent border border-accent/30">
                            {folderLabel}
                        </div>
                    </div>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <Input
                        placeholder="Search emails..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-bg border-border focus:bg-card transition-colors"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="divide-y divide-border">
                        {Array.from({ length: 6 }).map((_, idx) => (
                            <div key={idx} className="p-4 animate-pulse">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="h-3 w-24 rounded bg-muted/30" />
                                    <div className="h-3 w-10 rounded bg-muted/20" />
                                </div>
                                <div className="h-4 w-3/4 rounded bg-muted/30 mb-2" />
                                <div className="h-3 w-full rounded bg-muted/20" />
                            </div>
                        ))}
                    </div>
                ) : filteredEmails.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted">
                        {searchQuery ? "No messages match your search" : "No messages found"}
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {filteredEmails.map((email) => (
                            <button
                                key={email.uid}
                                onClick={() => onSelect(email.uid)}
                                className={`w-full p-4 text-left transition-all hover:bg-muted/10 ${selectedId === email.uid
                                        ? "bg-accent/5 border-l-2 border-accent"
                                        : "border-l-2 border-transparent"
                                    } `}
                            >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <span className={`text-sm font-medium truncate ${selectedId === email.uid ? "text-accent" : "text-ink"
                                        } `}>
                                        {email.sender}
                                    </span>
                                    <span className="text-[10px] text-muted whitespace-nowrap">
                                        {email.date ? new Date(email.date).toLocaleDateString() : ""}
                                    </span>
                                </div>
                                <div className="text-sm font-medium text-ink/90 truncate mb-1">
                                    {email.subject || "(no subject)"}
                                </div>
                                <div className="text-xs text-muted line-clamp-2">
                                    {email.snippet}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
