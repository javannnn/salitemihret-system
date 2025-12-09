import { useState, useEffect } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import { X, Paperclip, Send } from "lucide-react";
import { useToast } from "@/components/Toast";

interface ComposeEmailProps {
    onClose: () => void;
    onSend: (data: { to: string[]; cc: string[]; bcc: string[]; subject: string; body: string; audience?: string; attachments?: { filename: string; content_base64: string; content_type: string }[] }) => Promise<void>;
    initialData?: {
        to?: string[];
        cc?: string[];
        bcc?: string[];
        subject?: string;
        body?: string;
        audience?: string;
    };
}

export function ComposeEmail({ onClose, onSend, initialData }: ComposeEmailProps) {
    const [to, setTo] = useState(initialData?.to?.join(", ") || "");
    const [cc, setCc] = useState(initialData?.cc?.join(", ") || "");
    const [bcc, setBcc] = useState(initialData?.bcc?.join(", ") || "");
    const [subject, setSubject] = useState(initialData?.subject || "");
    const [body, setBody] = useState(initialData?.body || "");
    const [audience, setAudience] = useState(initialData?.audience || "manual");
    const [sending, setSending] = useState(false);
    const [attachments, setAttachments] = useState<File[]>([]);
    const toast = useToast();

    // Update state if initialData changes
    useEffect(() => {
        if (initialData) {
            setTo(initialData.to?.join(", ") || "");
            setCc(initialData.cc?.join(", ") || "");
            setBcc(initialData.bcc?.join(", ") || "");
            setSubject(initialData.subject || "");
            setBody(initialData.body || "");
        }
    }, [initialData]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);
        try {
            const attachmentPayload = await Promise.all(
                attachments.map(
                    (file) =>
                        new Promise<{ filename: string; content_base64: string; content_type: string }>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => {
                                const result = reader.result as string;
                                const base64 = result.split(",")[1];
                                resolve({ filename: file.name, content_base64: base64, content_type: file.type || "application/octet-stream" });
                            };
                            reader.onerror = () => reject(reader.error);
                            reader.readAsDataURL(file);
                        })
                )
            );
            await onSend({
                to: to.split(",").map((s) => s.trim()).filter(Boolean),
                cc: cc.split(",").map((s) => s.trim()).filter(Boolean),
                bcc: bcc.split(",").map((s) => s.trim()).filter(Boolean),
                subject,
                body,
                audience: audience === "manual" ? undefined : audience,
                attachments: attachmentPayload,
            });
            onClose();
        } catch (error) {
            console.error("Failed to send email:", error);
        } finally {
            setSending(false);
        }
    };

    const handleAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length) {
            setAttachments((prev) => [...prev, ...files]);
            toast.push(`${files.length} file(s) added`);
        }
    };

    const removeAttachment = (name: string) => {
        setAttachments((prev) => prev.filter((file) => file.name !== name));
    };

    return (
        <div className="flex h-full flex-col bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
                <h2 className="text-lg font-semibold text-ink">New Message</h2>
                <Button variant="ghost" onClick={onClose}>
                    <X size={18} />
                </Button>
            </div>

            <form onSubmit={handleSend} className="flex flex-1 flex-col">
                <div className="flex flex-col gap-4 p-6">
                    <div className="grid gap-4">
                        <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                            <label className="text-sm font-medium text-muted text-right">Audience</label>
                            <select
                                value={audience}
                                onChange={(e) => setAudience(e.target.value)}
                                className="bg-bg border border-border rounded-md px-3 py-2 text-sm"
                            >
                                <option value="manual">Manual</option>
                                <option value="all_members">All members</option>
                                <option value="active_members">Active members</option>
                                <option value="missing_phone">Missing phone</option>
                                <option value="with_children">Members with children</option>
                                <option value="new_this_month">Joined this month</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-[60px_1fr] items-center gap-4">
                            <label className="text-sm font-medium text-muted text-right">To</label>
                            <Input
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                placeholder="Recipients (comma separated)"
                                className="bg-bg border-border focus:bg-card"
                                disabled={audience !== "manual"}
                            />
                        </div>
                        <div className="grid grid-cols-[60px_1fr] items-center gap-4">
                            <label className="text-sm font-medium text-muted text-right">Cc</label>
                            <Input
                                value={cc}
                                onChange={(e) => setCc(e.target.value)}
                                placeholder="Cc (comma separated)"
                                className="bg-bg border-border focus:bg-card"
                                disabled={audience !== "manual"}
                            />
                        </div>
                        <div className="grid grid-cols-[60px_1fr] items-center gap-4">
                            <label className="text-sm font-medium text-muted text-right">Bcc</label>
                            <Input
                                value={bcc}
                                onChange={(e) => setBcc(e.target.value)}
                                placeholder="Bcc (comma separated)"
                                className="bg-bg border-border focus:bg-card"
                                disabled={audience !== "manual"}
                            />
                        </div>
                        <div className="grid grid-cols-[60px_1fr] items-center gap-4">
                            <label className="text-sm font-medium text-muted text-right">Subject</label>
                            <Input
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Subject"
                                className="bg-bg border-border focus:bg-card"
                            />
                        </div>
                    </div>

                    <div className="flex-1 min-h-[300px]">
                        <Textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Write your message here..."
                            className="h-full resize-none bg-bg border-border focus:bg-card p-4"
                        />
                    </div>
                </div>

                <div className="border-t border-border p-4 bg-muted/5 flex justify-between items-center">
                    <div className="flex items-center gap-3 flex-wrap">
                        <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                            <Paperclip size={18} />
                            Attach
                            <input type="file" multiple className="hidden" onChange={handleAttach} />
                        </label>
                        {attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 text-xs text-muted">
                                {attachments.map((file) => (
                                    <span key={file.name} className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-1">
                                        {file.name}
                                        <button type="button" className="text-red-500" onClick={() => removeAttachment(file.name)}>
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="ghost" onClick={onClose}>
                            Discard
                        </Button>
                        <Button
                            type="submit"
                            disabled={sending}
                            className="bg-ink text-white hover:bg-ink/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                        >
                            {sending ? "Sending..." : (
                                <>
                                    <Send size={16} className="mr-2" />
                                    Send
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}
