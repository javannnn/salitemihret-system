import { AdminEmailDetail } from "@/lib/api";
import { Button, Badge } from "@/components/ui";
import { Reply, ReplyAll, Forward, MoreVertical, Printer, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";

interface EmailDetailProps {
    email: AdminEmailDetail | null;
    loading: boolean;
    folderLabel: string;
    onReply: (email: AdminEmailDetail, all?: boolean) => void;
    onForward: (email: AdminEmailDetail) => void;
}

export function EmailDetail({ email, loading, onReply, onForward, folderLabel }: EmailDetailProps) {
    const toast = useToast();

    const handlePrint = () => {
        window.print();
    };

    const handleDelete = () => {
        toast.push("Delete is not yet supported by the server");
    };

    if (loading && !email) {
        return (
            <div className="flex h-full items-center justify-center text-muted">
                <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
                    <p>Loading message...</p>
                </div>
            </div>
        );
    }

    if (!email) {
        return (
            <div className="flex h-full flex-col items-center justify-center text-muted bg-muted/5">
                <div className="rounded-full bg-muted/20 p-6 mb-4">
                    <div className="h-12 w-12 rounded-lg bg-muted/30" />
                </div>
                <p className="text-lg font-medium text-ink">No message selected</p>
                <p className="text-sm">Select a message from the list to view details</p>
            </div>
        );
    }

    return (
        <div className="relative flex h-full flex-col bg-card">
            {loading && (
                <div className="pointer-events-none absolute inset-0 bg-white/40 dark:bg-black/20 backdrop-blur-[1px]">
                    <div className="absolute right-4 top-4 flex items-center gap-2 text-xs text-muted">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                        <span>Refreshing…</span>
                    </div>
                </div>
            )}
            {/* Header Actions */}
            <div className="flex items-center justify-between border-b border-border p-4">
                <div className="flex gap-2">
                    <Button variant="ghost" title="Reply" onClick={() => onReply(email)}>
                        <Reply size={18} />
                    </Button>
                    <Button variant="ghost" title="Reply All" onClick={() => onReply(email, true)}>
                        <ReplyAll size={18} />
                    </Button>
                    <Button variant="ghost" title="Forward" onClick={() => onForward(email)}>
                        <Forward size={18} />
                    </Button>
                </div>
                <div className="flex gap-2 items-center">
                    <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent border border-accent/30">
                        {folderLabel}
                    </span>
                    <Button variant="ghost" title="Print" onClick={handlePrint}>
                        <Printer size={18} />
                    </Button>
                    <Button variant="ghost" title="Delete" onClick={handleDelete} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20">
                        <Trash2 size={18} />
                    </Button>
                    <Button variant="ghost">
                        <MoreVertical size={18} />
                    </Button>
                </div>
            </div>

            {/* Email Header */}
            <div className="p-6 pb-4">
                <h1 className="text-2xl font-semibold text-ink mb-4">{email.subject || "(no subject)"}</h1>

                <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                        <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-lg">
                            {email.sender.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="font-medium text-ink">
                                {email.sender}
                            </div>
                            <div className="text-sm text-muted">
                                To: {email.to.join(", ") || "Undisclosed recipients"}
                                {email.cc.length > 0 && (
                                    <span className="ml-2">Cc: {email.cc.join(", ")}</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-sm text-muted whitespace-nowrap">
                        {email.date ? new Date(email.date).toLocaleString(undefined, {
                            dateStyle: 'long',
                            timeStyle: 'short'
                        }) : "Unknown date"}
                    </div>
                </div>
            </div>

            {/* Email Body */}
            <div className="flex-1 overflow-y-auto p-6 pt-2">
                <div className="prose prose-slate dark:prose-invert max-w-none">
                    {email.html_body ? (
                        <div dangerouslySetInnerHTML={{ __html: email.html_body }} />
                    ) : (
                        <pre className="whitespace-pre-wrap font-sans text-ink/90">{email.text_body || "(no content)"}</pre>
                    )}
                </div>
            </div>

            {/* Attachments (if any) */}
            {(email.has_attachments) && (
                <div className="border-t border-border p-4 bg-muted/5">
                    <h3 className="text-sm font-medium mb-2">Attachments</h3>
                    <div className="flex gap-2">
                        <Badge className="bg-bg border border-border text-ink">
                            Attachment.pdf
                        </Badge>
                    </div>
                </div>
            )}
        </div>
    );
}
