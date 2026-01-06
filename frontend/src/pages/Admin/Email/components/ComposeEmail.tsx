import { useState, useEffect, useRef, KeyboardEvent, ClipboardEvent } from "react";
import { Button, Textarea } from "@/components/ui";
import { X, Paperclip, Send, AlertCircle } from "lucide-react";
import { useToast } from "@/components/Toast";

interface ComposeEmailProps {
    onClose: () => void;
    onSend: (data: {
        to: string[];
        cc: string[];
        bcc: string[];
        subject: string;
        body: string;
        audience?: string;
        attachments?: { filename: string; content_base64: string; content_type: string }[];
    }) => Promise<void>;
    initialData?: {
        to?: string[];
        cc?: string[];
        bcc?: string[];
        subject?: string;
        body?: string;
        audience?: string;
    };
}

// Simple email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailChipInputProps {
    value: string[];
    onChange: (value: string[]) => void;
    label: string;
    disabled?: boolean;
    placeholder?: string;
}

function EmailChipInput({ value, onChange, label, disabled, placeholder }: EmailChipInputProps) {
    const [inputValue, setInputValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const addEmails = (emailsToAdd: string[]) => {
        const uniqueNew = emailsToAdd
            .map(e => e.trim())
            .filter(e => e && !value.includes(e));
        if (uniqueNew.length > 0) {
            onChange([...value, ...uniqueNew]);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (["Enter", "Tab", ",", " "].includes(e.key)) {
            e.preventDefault();
            if (inputValue.trim()) {
                addEmails([inputValue]);
                setInputValue("");
            }
        } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
            // Remove last chip on backspace if input is empty
            onChange(value.slice(0, -1));
        }
    };

    const handleBlur = () => {
        if (inputValue.trim()) {
            addEmails([inputValue]);
            setInputValue("");
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text");
        if (text) {
            const emails = text.split(/[\n,; ]+/).filter(Boolean);
            addEmails(emails);
        }
    };

    const removeEmail = (emailToRemove: string) => {
        onChange(value.filter(e => e !== emailToRemove));
    };

    // Focus input when clicking on the container
    const handleContainerClick = () => {
        inputRef.current?.focus();
    };

    return (
        <div className="grid grid-cols-[60px_1fr] items-start gap-4">
            <label className="text-sm font-medium text-muted text-right pt-2">{label}</label>
            <div
                className={`flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 min-h-[38px] transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-text"}`}
                onClick={!disabled ? handleContainerClick : undefined}
            >
                {value.map((email) => {
                    const isValid = EMAIL_REGEX.test(email);
                    return (
                        <span
                            key={email}
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${isValid ? "bg-accent/10 text-ink" : "bg-red-500/10 text-red-600 dark:text-red-400"
                                } animate-in fade-in zoom-in duration-200`}
                        >
                            {!isValid && <AlertCircle size={10} className="mr-0.5" />}
                            {email}
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeEmail(email);
                                    }}
                                    className="ml-1 text-muted hover:text-ink focus:outline-none"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </span>
                    );
                })}
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    onPaste={handlePaste}
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted placeholder:text-xs min-w-[120px]"
                    placeholder={value.length === 0 ? placeholder : ""}
                    disabled={disabled}
                />
            </div>
        </div>
    );
}

export function ComposeEmail({ onClose, onSend, initialData }: ComposeEmailProps) {
    const [to, setTo] = useState<string[]>(initialData?.to || []);
    const [cc, setCc] = useState<string[]>(initialData?.cc || []);
    const [bcc, setBcc] = useState<string[]>(initialData?.bcc || []);
    const [subject, setSubject] = useState(initialData?.subject || "");
    const [body, setBody] = useState(initialData?.body || "");
    const [audience, setAudience] = useState(initialData?.audience || "manual");
    const [sending, setSending] = useState(false);
    const [attachments, setAttachments] = useState<File[]>([]);
    const toast = useToast();

    // Update state if initialData changes (though typical use case is mount)
    useEffect(() => {
        if (initialData) {
            setTo(initialData.to || []);
            setCc(initialData.cc || []);
            setBcc(initialData.bcc || []);
            setSubject(initialData.subject || "");
            setBody(initialData.body || "");
            if (initialData.audience) setAudience(initialData.audience);
        }
    }, [initialData]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();

        // Basic validation
        if (audience === "manual" && to.length === 0 && cc.length === 0 && bcc.length === 0) {
            toast.push("Please add at least one recipient", { type: "error" });
            return;
        }

        setSending(true);
        try {
            // Process attachments
            const attachmentPayload = await Promise.all(
                attachments.map(
                    (file) =>
                        new Promise<{ filename: string; content_base64: string; content_type: string }>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => {
                                const result = reader.result as string;
                                const base64 = result.split(",")[1];
                                resolve({
                                    filename: file.name,
                                    content_base64: base64,
                                    content_type: file.type || "application/octet-stream"
                                });
                            };
                            reader.onerror = () => reject(reader.error);
                            reader.readAsDataURL(file);
                        })
                )
            );

            await onSend({
                to,
                cc,
                bcc,
                subject,
                body,
                audience: audience === "manual" ? undefined : audience,
                attachments: attachmentPayload,
            });
            onClose();
        } catch (error) {
            console.error("Failed to send email:", error);
            // Error handling is mostly done in parent `handleSendEmail` but we catch here just in case
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
        // Reset input value so same files can be selected again if needed (edge case)
        e.target.value = "";
    };

    const removeAttachment = (indexToRemove: number) => {
        setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    };

    return (
        <div className="flex h-full flex-col bg-card shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between border-b border-border p-4 bg-muted/5">
                <h2 className="text-lg font-semibold text-ink">New Message</h2>
                <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 rounded-full">
                    <X size={18} />
                </Button>
            </div>

            <form onSubmit={handleSend} className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                    <div className="flex flex-col gap-4 p-6">
                        <div className="space-y-4">
                            <div className="grid grid-cols-[60px_1fr] items-center gap-4">
                                <label className="text-sm font-medium text-muted text-right">Audience</label>
                                <div className="relative">
                                    <select
                                        value={audience}
                                        onChange={(e) => setAudience(e.target.value)}
                                        className="w-full appearance-none bg-bg border border-border rounded-md px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring transition-shadow"
                                    >
                                        <option value="manual">Manual Selection</option>
                                        <option value="all_members">All members</option>
                                        <option value="active_members">Active members</option>
                                        <option value="missing_phone">Members missing phone number</option>
                                        <option value="with_children">Members with children</option>
                                        <option value="new_this_month">Joined this month</option>
                                    </select>
                                    {/* Custom arrow could go here if we hide default appearance */}
                                </div>
                            </div>

                            <EmailChipInput
                                label="To"
                                value={to}
                                onChange={setTo}
                                disabled={audience !== "manual"}
                                placeholder="Recipients (comma separated)"
                            />

                            <EmailChipInput
                                label="Cc"
                                value={cc}
                                onChange={setCc}
                                disabled={audience !== "manual"}
                                placeholder="Cc recipients"
                            />

                            <EmailChipInput
                                label="Bcc"
                                value={bcc}
                                onChange={setBcc}
                                disabled={audience !== "manual"}
                                placeholder="Bcc recipients"
                            />

                            <div className="grid grid-cols-[60px_1fr] items-center gap-4">
                                <label className="text-sm font-medium text-muted text-right">Subject</label>
                                <input
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Subject"
                                    className="bg-bg border border-border rounded-md px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none transition-shadow"
                                />
                            </div>
                        </div>

                        <div className="flex-1 min-h-[300px] border border-border rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-shadow">
                            <Textarea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                placeholder="Write your message here..."
                                className="h-full w-full resize-none border-0 bg-bg p-4 focus:ring-0 text-sm leading-relaxed"
                            />
                        </div>
                    </div>
                </div>

                <div className="border-t border-border p-4 bg-muted/5 flex flex-col gap-3">
                    {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2">
                            {attachments.map((file, idx) => (
                                <div key={idx} className="group flex items-center gap-2 rounded-md border border-border bg-bg pl-3 pr-2 py-1.5 text-xs shadow-sm">
                                    <span className="max-w-[150px] truncate">{file.name}</span>
                                    <span className="text-[10px] text-muted">({(file.size / 1024).toFixed(0)} KB)</span>
                                    <button
                                        type="button"
                                        className="text-muted hover:text-red-500 transition-colors"
                                        onClick={() => removeAttachment(idx)}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-2 rounded-md border border-border bg-bg hover:bg-muted/50 px-3 py-2 text-sm font-medium transition-colors cursor-pointer shadow-sm">
                                <Paperclip size={16} />
                                Attach Files
                                <input type="file" multiple className="hidden" onChange={handleAttach} />
                            </label>
                        </div>

                        <div className="flex gap-3">
                            <Button type="button" variant="ghost" onClick={onClose}>
                                Discard
                            </Button>
                            <Button
                                type="submit"
                                disabled={sending}
                                className="min-w-[100px] bg-ink text-white hover:bg-ink/90 dark:bg-white dark:text-black dark:hover:bg-white/90 shadow-sm transition-all active:scale-95"
                            >
                                {sending ? (
                                    <span className="flex items-center gap-2">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        Sending
                                    </span>
                                ) : (
                                    <>
                                        <Send size={16} className="mr-2" />
                                        Send
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
