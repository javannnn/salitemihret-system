import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart, Bar, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, Bot, CalendarRange, ChevronRight, MessageSquareText, RefreshCcw, Send, ShieldAlert, Sparkles, X } from "lucide-react";

import { Button, Card, Input, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
    AIReportAnswer,
    AIReportChart,
    AIReportQAModule,
    AIReportQAHistoryMessage,
    ApiError,
    askAIReportQuestion,
    getAICapabilities,
    parseApiErrorMessage,
} from "@/lib/api";

type AssistantMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    response?: AIReportAnswer;
    error?: boolean;
};

type SubmitQuestionOptions = {
    allowBroaderSystemContext?: boolean;
    appendUserMessage?: boolean;
    includeVisualization?: boolean;
};

interface ReportAssistantPanelProps {
    open: boolean;
    onClose: () => void;
    modules: AIReportQAModule[];
    scopeLabel: string;
    suggestions: string[];
}

const CHART_COLORS = ["#0f766e", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#db2777"];
const PANEL_TRANSITION = {
    duration: 0.2,
    ease: [0.16, 1, 0.3, 1],
};

export function ReportAssistantPanel({ open, onClose, modules, scopeLabel, suggestions }: ReportAssistantPanelProps) {
    const toast = useToast();
    const transcriptRef = useRef<HTMLDivElement | null>(null);
    const [question, setQuestion] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [messages, setMessages] = useState<AssistantMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMode, setLoadingMode] = useState<"report" | "broader_system_context">("report");
    const [available, setAvailable] = useState<boolean | null>(null);
    const [availabilityMessage, setAvailabilityMessage] = useState("");

    const scopeModules = useMemo(() => Array.from(new Set(modules)), [modules]);
    const scopeKey = useMemo(() => scopeModules.join("|"), [scopeModules]);
    const visibleSuggestions = useMemo(() => suggestions.slice(0, 4), [suggestions]);
    const scopeModuleLabels = useMemo(() => scopeModules.map(formatModuleLabel), [scopeModules]);

    const normalizedRange = useMemo(() => {
        if (startDate && endDate && startDate > endDate) {
            return { start: endDate, end: startDate };
        }
        return { start: startDate, end: endDate };
    }, [startDate, endDate]);

    useEffect(() => {
        setMessages([]);
        setQuestion("");
    }, [scopeKey, scopeLabel]);

    useEffect(() => {
        if (!open) {
            return;
        }

        let cancelled = false;
        const loadCapabilities = async () => {
            setAvailable(null);
            try {
                const capabilities = await getAICapabilities();
                const reportQa = capabilities.find((item) => item.slug === "report_qa");
                if (cancelled) return;
                if (!reportQa) {
                    setAvailable(false);
                    setAvailabilityMessage("The report assistant capability is not registered in this environment.");
                    return;
                }
                if (!reportQa.enabled) {
                    setAvailable(false);
                    setAvailabilityMessage("The report assistant is configured but not enabled yet.");
                    return;
                }
                setAvailable(true);
                setAvailabilityMessage("");
            } catch (error) {
                if (cancelled) return;
                setAvailable(false);
                setAvailabilityMessage(parseApiErrorMessage(error, "Unable to verify report assistant availability."));
            }
        };

        loadCapabilities();
        return () => {
            cancelled = true;
        };
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose]);

    useEffect(() => {
        if (!open || !transcriptRef.current) {
            return;
        }
        transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }, [open, messages, loading]);

    const submitQuestion = async (requestedQuestion?: string, options: SubmitQuestionOptions = {}) => {
        const nextQuestion = (requestedQuestion ?? question).trim();
        if (!nextQuestion || loading || !available) {
            return;
        }

        const appendUserMessage = options.appendUserMessage ?? true;
        const useBroaderSystemContext = options.allowBroaderSystemContext ?? false;
        const history: AIReportQAHistoryMessage[] = messages
            .slice(-8)
            .map((message) => ({ role: message.role, content: message.content }));

        if (appendUserMessage) {
            const userMessage: AssistantMessage = {
                id: `user-${Date.now()}`,
                role: "user",
                content: nextQuestion,
            };
            setMessages((current) => [...current, userMessage]);
            setQuestion("");
        }
        setLoading(true);
        setLoadingMode(useBroaderSystemContext ? "broader_system_context" : "report");

        try {
            const response = await askAIReportQuestion({
                question: nextQuestion,
                start_date: normalizedRange.start || undefined,
                end_date: normalizedRange.end || undefined,
                modules: scopeModules,
                history,
                include_visualization: options.includeVisualization ?? !useBroaderSystemContext,
                allow_broader_system_context: useBroaderSystemContext,
            });
            setMessages((current) => [
                ...current,
                {
                    id: `assistant-${Date.now()}`,
                    role: "assistant",
                    content: response.answer,
                    response,
                },
            ]);
        } catch (error) {
            const message = parseApiErrorMessage(error, "The report assistant could not answer that question.");
            if (!(error instanceof ApiError && error.status === 403)) {
                toast.push(message, { type: "error" });
            }
            setMessages((current) => [
                ...current,
                {
                    id: `assistant-error-${Date.now()}`,
                    role: "assistant",
                    content: message,
                    error: true,
                },
            ]);
        } finally {
            setLoading(false);
            setLoadingMode("report");
        }
    };

    const resetConversation = () => {
        setMessages([]);
        setQuestion("");
    };

    const availabilityLabel = available === null ? "Checking AI" : available ? "AI enabled" : "AI unavailable";
    const availabilityPillClass =
        available === null
            ? "border-white/10 bg-white/[0.08] text-white/70"
            : available
                ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                : "border-amber-300/20 bg-amber-400/10 text-amber-100";
    const analysisWindowLabel = normalizedRange.start || normalizedRange.end
        ? `${normalizedRange.start || "Beginning"} to ${normalizedRange.end || "Today"}`
        : "Current snapshot";
    const scopeModulesSummaryLabel =
        scopeModuleLabels.length <= 2 ? scopeModuleLabels.join(" · ") : `${scopeModuleLabels.length} report areas`;

    return (
        <AnimatePresence>
            {open ? (
                <div className="fixed inset-0 z-50">
                    <motion.button
                        key="assistant-overlay"
                        type="button"
                        aria-label="Close report assistant"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={PANEL_TRANSITION}
                        className="absolute inset-0 bg-ink/35 backdrop-blur-[3px]"
                        onClick={onClose}
                    />

                    <motion.aside
                        key="assistant-panel"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="report-assistant-title"
                        initial={{ x: 36, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 36, opacity: 0 }}
                        transition={PANEL_TRANSITION}
                        className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col overflow-hidden border-l border-border bg-bg shadow-[0_24px_70px_rgba(15,23,42,0.24)] dark:border-white/10 dark:bg-slate-950 dark:shadow-[0_32px_90px_rgba(0,0,0,0.48)]"
                    >
                        <div className="relative overflow-hidden border-b border-border">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(79,70,229,0.18),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.95))]" />
                            <div className="absolute inset-0 opacity-15 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
                            <div className="relative space-y-3 px-5 py-4 text-white">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex items-center gap-3">
                                        <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.08] p-2.5 text-amber-200 shadow-[0_8px_24px_rgba(245,158,11,0.16)] backdrop-blur">
                                            <Sparkles size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/60">Reports AI Assistant</p>
                                                <PanelPill className={availabilityPillClass}>{availabilityLabel}</PanelPill>
                                            </div>
                                            <h2 id="report-assistant-title" className="mt-1 truncate font-serif text-[1.45rem] leading-none tracking-tight text-white">
                                                {scopeLabel}
                                            </h2>
                                            <p className="mt-2 text-xs leading-5 text-white/70">
                                                Grounded to the reports in view. Charts appear only when they help.
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        className="h-9 w-9 shrink-0 border-white/10 bg-white/[0.06] px-0 text-white hover:border-white/20 hover:bg-white/[0.14]"
                                        onClick={onClose}
                                        aria-label="Close"
                                    >
                                        <X size={16} />
                                    </Button>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <PanelPill
                                        className="border-white/10 bg-white/[0.08] text-white/78"
                                    >
                                        <ShieldAlert size={12} />
                                        <span title="AI can miss nuance. Verify important decisions against the cited sources and the underlying reports.">
                                            Use with care
                                        </span>
                                    </PanelPill>
                                    <PanelPill className="border-white/10 bg-white/[0.08] text-white/78">{scopeModulesSummaryLabel}</PanelPill>
                                </div>

                                <div className="rounded-[22px] border border-white/10 bg-white/[0.06] px-3.5 py-3 backdrop-blur">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/58">
                                                <CalendarRange size={13} className="text-amber-200" />
                                                Analysis window
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-medium text-white">{analysisWindowLabel}</span>
                                                <span className="text-xs text-white/58">
                                                    {normalizedRange.start || normalizedRange.end ? "Date filter active" : "No filter"}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                className="h-8 border-white/10 bg-white/[0.04] px-3 text-xs text-white hover:border-white/20 hover:bg-white/[0.12]"
                                                onClick={() => setFiltersOpen((current) => !current)}
                                            >
                                                {filtersOpen ? "Hide dates" : "Adjust dates"}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="h-8 border-white/10 bg-white/[0.04] px-3 text-xs text-white hover:border-white/20 hover:bg-white/[0.12]"
                                                disabled={!startDate && !endDate}
                                                onClick={() => {
                                                    setStartDate("");
                                                    setEndDate("");
                                                    setFiltersOpen(false);
                                                }}
                                            >
                                                Clear
                                            </Button>
                                        </div>
                                    </div>

                                    <AnimatePresence initial={false}>
                                        {filtersOpen ? (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                                animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                                transition={PANEL_TRANSITION}
                                                className="overflow-hidden"
                                            >
                                                <div className="grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2">
                                                    <label className="space-y-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white/62">
                                                        <span>From</span>
                                                        <Input
                                                            type="date"
                                                            value={startDate}
                                                            onChange={(event) => setStartDate(event.target.value)}
                                                            className="border-white/12 bg-white/95 text-ink [color-scheme:light] dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-100 dark:[color-scheme:dark]"
                                                        />
                                                    </label>
                                                    <label className="space-y-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white/62">
                                                        <span>To</span>
                                                        <Input
                                                            type="date"
                                                            value={endDate}
                                                            onChange={(event) => setEndDate(event.target.value)}
                                                            className="border-white/12 bg-white/95 text-ink [color-scheme:light] dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-100 dark:[color-scheme:dark]"
                                                        />
                                                    </label>
                                                </div>
                                            </motion.div>
                                        ) : null}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </div>

                        {!available && availabilityMessage ? (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={PANEL_TRANSITION}
                                className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/12 dark:text-amber-100"
                            >
                                {availabilityMessage}
                            </motion.div>
                        ) : null}

                        <div className="min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.05),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,250,252,0.96))] dark:bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.08),transparent_28%),radial-gradient(circle_at_88%_14%,rgba(59,130,246,0.10),transparent_26%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.98))]">
                            <div ref={transcriptRef} className="h-full overflow-y-auto px-5 py-5">
                                <div className="mx-auto flex w-full max-w-[392px] flex-col gap-4">
                                    {messages.length === 0 ? (
                                        <AssistantEmptyState
                                            scopeLabel={scopeLabel}
                                            scopeModules={scopeModules}
                                            suggestions={visibleSuggestions}
                                            onSelectSuggestion={submitQuestion}
                                            available={available}
                                            loading={loading}
                                        />
                                    ) : null}

                                    <AnimatePresence initial={false}>
                                        {messages.map((message) => {
                                            const isUser = message.role === "user";
                                            return (
                                                <motion.div
                                                    key={message.id}
                                                    initial={{ opacity: 0, y: 18 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: 10 }}
                                                    transition={PANEL_TRANSITION}
                                                    className="w-full"
                                                >
                                                    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
                                                        <article
                                                            className={`w-full rounded-[28px] border px-4 py-4 shadow-sm ${isUser
                                                                ? "ml-auto max-w-[88%] border-accent/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(255,255,255,0.78))] dark:border-amber-400/20 dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(30,41,59,0.92),rgba(15,23,42,0.98))]"
                                                                : message.error
                                                                    ? "border-red-500/20 bg-red-500/5 dark:border-red-500/30 dark:bg-red-500/12"
                                                                    : "border-border bg-card/90 backdrop-blur dark:border-white/10 dark:bg-slate-900/78"
                                                                }`}
                                                        >
                                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                                <div className="flex items-center gap-2">
                                                                    {!isUser ? (
                                                                        <span className="rounded-2xl bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(51,65,85,0.92))] p-2 text-white shadow-lg">
                                                                            <Bot size={14} />
                                                                        </span>
                                                                    ) : null}
                                                                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                                                                        {isUser ? "You" : "AI analysis"}
                                                                    </span>
                                                                </div>
                                                                {message.response ? (
                                                                    <PanelPill className="border-border/80 bg-bg/75 text-muted">
                                                                        {formatResponseBadgeLabel(message.response)}
                                                                    </PanelPill>
                                                                ) : null}
                                                            </div>
                                                            <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{message.content}</p>
                                                            {message.response ? (
                                                                <AssistantResponseDetails
                                                                    response={message.response}
                                                                    loading={loading}
                                                                    onConfirmBroader={() => {
                                                                        if (!message.response?.confirmation) {
                                                                            return;
                                                                        }
                                                                        void submitQuestion(message.response.confirmation.original_question, {
                                                                            allowBroaderSystemContext: true,
                                                                            appendUserMessage: false,
                                                                            includeVisualization: false,
                                                                        });
                                                                    }}
                                                                />
                                                            ) : null}
                                                        </article>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>

                                    {loading ? (
                                        <motion.div
                                            initial={{ opacity: 0, y: 18 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            transition={PANEL_TRANSITION}
                                            className="w-full"
                                        >
                                            <AssistantThinkingState mode={loadingMode} />
                                        </motion.div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-border bg-card/95 px-5 pb-5 pt-4 backdrop-blur dark:border-white/10 dark:bg-slate-950/92">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="text-xs text-muted">Enter to send. Shift+Enter for a new line.</p>
                                <Button variant="ghost" className="h-8 px-3 text-xs" onClick={resetConversation} disabled={messages.length === 0 && !question}>
                                    <RefreshCcw size={14} />
                                    New chat
                                </Button>
                            </div>

                            <div className="rounded-[28px] border border-border bg-bg/92 p-3 shadow-soft dark:border-white/10 dark:bg-slate-950/80">
                                <Textarea
                                    value={question}
                                    onChange={(event) => setQuestion(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault();
                                            submitQuestion();
                                        }
                                    }}
                                    rows={4}
                                    placeholder={
                                        available
                                            ? "Ask a grounded question about trends, top categories, bottlenecks, recent changes, or a concise operational summary."
                                            : availabilityMessage || "The report assistant is not available."
                                    }
                                    disabled={!available || loading}
                                    className="min-h-[104px] resize-none border-0 bg-transparent p-2 text-ink shadow-none focus:border-0 focus:shadow-none dark:text-slate-100"
                                />
                                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 px-1 pt-3">
                                    <p className="max-w-[16rem] text-xs leading-5 text-muted">
                                        Charts appear only when a visual comparison or breakdown meaningfully helps answer the question.
                                    </p>
                                    <Button
                                        onClick={() => submitQuestion()}
                                        disabled={!available || loading || !question.trim()}
                                        className="min-w-[132px]"
                                    >
                                        <Send size={16} />
                                        {loading ? "Analyzing..." : "Ask AI"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </motion.aside>
                </div>
            ) : null}
        </AnimatePresence>
    );
}

function AssistantEmptyState({
    scopeLabel,
    scopeModules,
    suggestions,
    onSelectSuggestion,
    available,
    loading,
}: {
    scopeLabel: string;
    scopeModules: AIReportQAModule[];
    suggestions: string[];
    onSelectSuggestion: (question: string) => void;
    available: boolean | null;
    loading: boolean;
}) {
    return (
        <Card className="overflow-hidden rounded-[32px] border-border/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.88))] p-0 shadow-[0_18px_48px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(15,23,42,0.88),rgba(30,41,59,0.92))] dark:shadow-[0_24px_64px_rgba(0,0,0,0.34)]">
            <div className="relative overflow-hidden px-6 py-6">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(79,70,229,0.14),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.14),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.14),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.16),transparent_30%)]" />
                <div className="relative">
                    <div className="flex items-start gap-4">
                        <div className="rounded-[1.4rem] border border-accent/15 bg-accent/10 p-3 text-accent shadow-soft dark:border-amber-400/20 dark:bg-amber-400/12 dark:text-amber-200">
                            <Sparkles size={18} />
                        </div>
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Grounded reporting copilot</div>
                            <h3 className="mt-2 font-serif text-2xl tracking-tight text-ink">Start with a reporting question</h3>
                            <p className="mt-3 text-sm leading-6 text-muted">
                                Ask about {scopeLabel.toLowerCase()} for a summary, a comparison, a pressure point, or the most important recent change across the current report scope.
                            </p>
                        </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                        {scopeModules.map((module) => (
                            <PanelPill key={module} className="border-border bg-bg/80 text-muted">
                                {formatModuleLabel(module)}
                            </PanelPill>
                        ))}
                    </div>

                    {suggestions.length > 0 ? (
                        <div className="mt-5 border-t border-border/70 pt-4 dark:border-white/10">
                            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Quick prompts</div>
                            <div className="flex flex-wrap gap-2">
                                {suggestions.map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        onClick={() => onSelectSuggestion(suggestion)}
                                        disabled={!available || loading}
                                        className="rounded-full border border-border bg-bg/85 px-3.5 py-2 text-sm text-ink transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:border-amber-400/30 dark:hover:bg-amber-400/10"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </Card>
    );
}

function AssistantResponseDetails({
    response,
    loading,
    onConfirmBroader,
}: {
    response: AIReportAnswer;
    loading: boolean;
    onConfirmBroader: () => void;
}) {
    return (
        <div className="mt-4 space-y-3">
            {response.confirmation ? (
                <div className="overflow-hidden rounded-[28px] border border-amber-500/15 bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(255,255,255,0.96),rgba(15,23,42,0.03))] shadow-[0_14px_34px_rgba(245,158,11,0.12)] dark:border-amber-400/20 dark:bg-[linear-gradient(145deg,rgba(120,53,15,0.28),rgba(15,23,42,0.97),rgba(245,158,11,0.12))] dark:shadow-[0_20px_44px_rgba(0,0,0,0.34)]">
                    <div className="border-b border-amber-500/10 px-4 py-3 dark:border-amber-400/15">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-900/80 dark:text-amber-100/80">
                                <span className="rounded-2xl bg-amber-500/12 p-2 text-amber-700 dark:bg-amber-400/14 dark:text-amber-200">
                                    <ShieldAlert size={14} />
                                </span>
                                Broader answer option
                            </div>
                            {response.confirmation.estimated_wait_seconds ? (
                                <PanelPill className="border-amber-500/15 bg-white/70 text-amber-900/80 dark:border-amber-400/18 dark:bg-amber-300/10 dark:text-amber-100/85">
                                    About {response.confirmation.estimated_wait_seconds}s
                                </PanelPill>
                            ) : null}
                        </div>
                    </div>
                    <div className="space-y-4 px-4 py-4">
                        <div>
                            <h3 className="text-base font-semibold text-amber-950 dark:text-amber-50">{response.confirmation.title}</h3>
                            <p className="mt-2 text-sm leading-6 text-amber-950/85 dark:text-slate-200">{response.confirmation.message}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <PanelPill className="border-amber-500/12 bg-white/72 text-amber-900/80 dark:border-amber-400/18 dark:bg-amber-300/10 dark:text-amber-100/85">Slower than report answers</PanelPill>
                            <PanelPill className="border-amber-500/12 bg-white/72 text-amber-900/80 dark:border-amber-400/18 dark:bg-amber-300/10 dark:text-amber-100/85">Best for system or workflow questions</PanelPill>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <p className="max-w-[15rem] text-xs leading-5 text-amber-900/70 dark:text-slate-300">
                                If not, ask it another way and I will keep the answer tied to the current reports.
                            </p>
                            <Button
                                variant="soft"
                                className="h-10 px-4"
                                onClick={onConfirmBroader}
                                disabled={loading}
                            >
                                {response.confirmation.confirm_label}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {response.chart && response.chart.data.length > 0 ? (
                <div className="overflow-hidden rounded-[26px] border border-border bg-bg/80 shadow-sm dark:border-white/10 dark:bg-slate-950/62">
                    <div className="border-b border-border/70 bg-card/85 px-4 py-3 dark:border-white/10 dark:bg-slate-900/75">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                                    <BarChart3 size={14} className="text-accent" />
                                    Visual insight
                                </div>
                                <h3 className="mt-1 text-sm font-semibold text-ink">{response.chart.title}</h3>
                                {response.chart.description ? (
                                    <p className="mt-1 text-xs leading-5 text-muted">{response.chart.description}</p>
                                ) : null}
                            </div>
                            <PanelPill className="border-accent/15 bg-accent/10 text-accent">Relevant chart</PanelPill>
                        </div>
                    </div>

                    <div className="px-4 py-4">
                        <div className="h-[232px] w-full">
                            <ChartPreview chart={response.chart} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {response.chart.data.slice(0, 4).map((datum, index) => (
                                <ChartKeyPill key={`${datum.label}-${index}`} color={CHART_COLORS[index % CHART_COLORS.length]}>
                                    {datum.label}: {formatChartValue(datum.value, response.chart.unit)}
                                </ChartKeyPill>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            {response.sources.length > 0 ? (
                <details className="overflow-hidden rounded-[26px] border border-border bg-bg/80 shadow-sm dark:border-white/10 dark:bg-slate-950/62">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Evidence</div>
                            <div className="mt-1 text-sm font-semibold text-ink">Sources and metrics ({response.sources.length})</div>
                        </div>
                        <ChevronRight size={16} className="text-muted" />
                    </summary>
                    <div className="space-y-3 border-t border-border/70 px-4 pb-4 pt-3 dark:border-white/10">
                        {response.sources.map((source) => (
                            <div key={source.id} className="rounded-[24px] border border-border bg-card/85 p-4 dark:border-white/10 dark:bg-slate-900/75">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-semibold text-ink">{source.title}</div>
                                    <PanelPill className="border-border bg-bg/80 text-muted">{formatModuleLabel(source.module)}</PanelPill>
                                </div>
                                <p className="text-sm leading-6 text-muted">{source.summary}</p>
                                {source.metrics.length > 0 ? (
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        {source.metrics.map((metric) => (
                                            <div key={`${source.id}-${metric.label}`} className="rounded-2xl border border-border/80 bg-bg/85 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/70">
                                                <div className="text-[11px] uppercase tracking-[0.16em] text-muted">{metric.label}</div>
                                                <div className="mt-1 text-sm font-semibold text-ink">{metric.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </details>
            ) : null}

            {response.warnings.length > 0 && !response.confirmation ? (
                <div className="rounded-[24px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/12 dark:text-amber-100">
                    <div className="mb-1 flex items-center gap-2 font-semibold uppercase tracking-[0.18em]">
                        <AlertTriangle size={14} />
                        Assistant note
                    </div>
                    <p>{response.warnings.join(" ")}</p>
                </div>
            ) : null}
        </div>
    );
}

function AssistantThinkingState({ mode }: { mode: "report" | "broader_system_context" }) {
    const phases = useMemo(
        () =>
            mode === "broader_system_context"
                ? [
                    {
                        label: "Mapping the system",
                        title: "Finding the right part of the system",
                        description: "Looking beyond the live reports to connect the question to the right module, workflow, and feature path.",
                    },
                    {
                        label: "Checking context",
                        title: "Checking trusted product context",
                        description: "Reviewing the approved app guide, module metadata, and system context before answering.",
                    },
                    {
                        label: "Drafting answer",
                        title: "Composing a broader answer",
                        description: "Turning that system context into a plain-language answer for the user.",
                    },
                ]
                : [
                    {
                        label: "Scanning reports",
                        title: "Scanning the report scope",
                        description: "Reading the approved data in view and locking onto the parts that actually answer this question.",
                    },
                    {
                        label: "Cross-checking",
                        title: "Cross-checking filters and evidence",
                        description: "Making sure the answer matches the current scope, date window, and the strongest signals in the reports.",
                    },
                    {
                        label: "Drafting answer",
                        title: "Composing a grounded answer",
                        description: "Pulling the answer together in plain language and only attaching a visual if it adds real value.",
                    },
                ],
        [mode],
    );
    const [phaseIndex, setPhaseIndex] = useState(0);

    useEffect(() => {
        setPhaseIndex(0);
        const intervalId = window.setInterval(() => {
            setPhaseIndex((current) => (current + 1) % phases.length);
        }, 1800);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [phases]);

    const activePhase = phases[phaseIndex];
    const modeLabel = mode === "broader_system_context" ? "broader look" : "grounded pass";

    return (
        <div className="flex w-full justify-start">
            <div className="relative w-full overflow-hidden rounded-[30px] border border-border bg-card/90 px-4 py-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/78">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.06),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.38),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_65%)]" />
                <div className="relative">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                            <span className="rounded-2xl bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(51,65,85,0.92))] p-2 text-white shadow-lg">
                                <MessageSquareText size={14} />
                            </span>
                            AI thinking
                        </div>
                        <PanelPill className="border-border/80 bg-bg/75 text-muted dark:border-white/10 dark:bg-slate-950/70">
                            {modeLabel}
                        </PanelPill>
                    </div>

                    <div className="flex items-start gap-4">
                        <motion.div
                            className="relative mt-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-border bg-bg/90 shadow-sm dark:border-white/10 dark:bg-slate-950/80"
                            animate={{ y: [0, -2, 0] }}
                            transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                        >
                            <motion.div
                                className="absolute inset-0 rounded-[20px] border border-accent/20 dark:border-cyan-300/20"
                                animate={{ opacity: [0.25, 0.65, 0.25], scale: [1, 1.04, 1] }}
                                transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                            />
                            <Bot size={22} className="relative text-accent dark:text-cyan-200" />
                            <div className="absolute -bottom-2 flex items-center gap-1 rounded-full border border-border bg-card/95 px-2 py-1 shadow-sm dark:border-white/10 dark:bg-slate-900/92">
                                {[0, 1, 2].map((index) => (
                                    <motion.span
                                        key={index}
                                        className="h-1.5 w-1.5 rounded-full bg-accent dark:bg-cyan-300"
                                        animate={{ opacity: [0.35, 1, 0.35], y: [0, -1.5, 0] }}
                                        transition={{
                                            duration: 1,
                                            repeat: Number.POSITIVE_INFINITY,
                                            ease: "easeInOut",
                                            delay: index * 0.12,
                                        }}
                                    />
                                ))}
                            </div>
                        </motion.div>

                        <div className="min-w-0 flex-1">
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.div
                                    key={activePhase.title}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                >
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">In progress</div>
                                    <div className="mt-1 text-base font-semibold tracking-tight text-ink dark:text-slate-50">{activePhase.title}</div>
                                    <p className="mt-2 text-sm leading-6 text-muted">{activePhase.description}</p>
                                </motion.div>
                            </AnimatePresence>

                            <div className="mt-4 flex flex-wrap gap-2">
                                {phases.map((phase, index) => {
                                    const isActive = index === phaseIndex;
                                    return (
                                        <motion.div
                                            key={phase.label}
                                            animate={{ opacity: isActive ? 1 : 0.66 }}
                                            transition={{ duration: 0.18 }}
                                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                                                isActive
                                                    ? "border-accent/20 bg-accent/10 text-accent dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-100"
                                                    : "border-border/80 bg-bg/80 text-muted dark:border-white/10 dark:bg-slate-950/70"
                                            }`}
                                        >
                                            <span className={`h-2 w-2 rounded-full ${isActive ? "bg-accent dark:bg-cyan-300" : "bg-muted/55"}`} />
                                            {phase.label}
                                        </motion.div>
                                    );
                                })}
                            </div>

                            <div className="mt-4 overflow-hidden rounded-full bg-border/70 dark:bg-white/10">
                                <motion.div
                                    className="h-1.5 rounded-full bg-[linear-gradient(90deg,rgba(245,158,11,0.75),rgba(59,130,246,0.65))] dark:bg-[linear-gradient(90deg,rgba(34,211,238,0.8),rgba(245,158,11,0.65))]"
                                    animate={{ x: ["-45%", "110%"] }}
                                    transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                                    style={{ width: "42%" }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PanelPill({ children, className = "" }: { children: ReactNode; className?: string }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium tracking-[0.02em] backdrop-blur ${className}`}>
            {children}
        </span>
    );
}

function ChartKeyPill({ children, color }: { children: ReactNode; color: string }) {
    return (
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/85 px-3 py-1.5 text-xs text-muted dark:border-white/10 dark:bg-slate-900/75">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {children}
        </span>
    );
}

function formatProviderLabel(provider: string) {
    if (provider === "openai_compatible") {
        return "local model";
    }
    if (provider === "system_guide") {
        return "system guide";
    }
    if (provider === "grounded") {
        return "grounded answer";
    }
    if (provider === "mock") {
        return "preview";
    }
    return provider.replaceAll("_", " ");
}

function formatModelLabel(model: string) {
    if (model === "product-metadata") {
        return "app guide";
    }
    if (model === "qwen2.5-3b-instruct-q4_k_m") {
        return "Qwen2.5-3B-Instruct";
    }
    if (model === "report-rules") {
        return "report rules";
    }
    return model;
}

function formatResponseBadgeLabel(response: AIReportAnswer) {
    if (response.status === "confirmation_required") {
        return "broader look available";
    }
    if (response.provider === "system_guide") {
        return formatProviderLabel(response.provider);
    }
    if (response.requires_human_review && response.provider === "openai_compatible" && response.sources.length === 0 && !response.chart) {
        return "broader system answer";
    }
    if (response.provider === "openai_compatible") {
        return formatProviderLabel(response.provider);
    }
    return `${formatProviderLabel(response.provider)} · ${formatModelLabel(response.model)}`;
}

function formatModuleLabel(module: AIReportQAModule) {
    return {
        members: "Members",
        payments: "Payments",
        sponsorships: "Sponsorships",
        newcomers: "Newcomers",
        schools: "Schools",
        activity: "Activity",
    }[module];
}

function ChartPreview({ chart }: { chart: AIReportChart }) {
    if (chart.type === "pie") {
        return (
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie data={chart.data} dataKey="value" cx="50%" cy="50%" outerRadius={88} innerRadius={52}>
                        {chart.data.map((entry, index) => (
                            <Cell key={`${entry.label}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        formatter={(value: number) => [formatChartValue(value, chart.unit), chart.title]}
                        contentStyle={{
                            backgroundColor: "var(--color-card)",
                            borderColor: "var(--color-border)",
                            borderRadius: "16px",
                            color: "var(--color-ink)",
                        }}
                        labelStyle={{ color: "var(--color-ink)" }}
                        itemStyle={{ color: "var(--color-ink)" }}
                    />
                </PieChart>
            </ResponsiveContainer>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart.data} margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-muted)" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                    stroke="var(--color-muted)"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    tickFormatter={(value) => formatAxisValue(value, chart.unit)}
                />
                <Tooltip
                    formatter={(value: number) => [formatChartValue(value, chart.unit), chart.title]}
                    contentStyle={{
                        backgroundColor: "var(--color-card)",
                        borderColor: "var(--color-border)",
                        borderRadius: "16px",
                        color: "var(--color-ink)",
                    }}
                    labelStyle={{ color: "var(--color-ink)" }}
                    itemStyle={{ color: "var(--color-ink)" }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {chart.data.map((entry, index) => (
                        <Cell key={`${entry.label}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function formatChartValue(value: number, unit: AIReportChart["unit"]) {
    if (unit === "currency") {
        return `CAD ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
    if (unit === "percent") {
        return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatAxisValue(value: number, unit: AIReportChart["unit"]) {
    if (unit === "currency") {
        return `CAD ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    if (unit === "percent") {
        return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}%`;
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
