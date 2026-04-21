import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, MailOpen, X } from "lucide-react";

import { EmailSidebar } from "./components/EmailSidebar";
import { EmailList } from "./components/EmailList";
import { EmailDetail } from "./components/EmailDetail";
import { ComposeEmail } from "./components/ComposeEmail";
import {
  getAdminInbox,
  getAdminEmail,
  getAdminEmailStatus,
  sendAdminEmail,
  type AdminEmailSummary,
  type AdminEmailDetail,
  type AdminEmailInboxStatus,
  type SendAdminEmailPayload,
} from "@/lib/api";
import { useToast } from "@/components/Toast";

type EmailView = "inbox" | "sent" | "drafts" | "trash";

const folderMap: Record<EmailView, string> = {
  inbox: "INBOX",
  sent: "INBOX.Sent",
  drafts: "INBOX.Drafts",
  trash: "INBOX.Trash",
};

const folderLabels: Record<EmailView, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  trash: "Trash",
};

const INBOX_POLL_INTERVAL_MS = 45000;

type ComposePayload = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  audience?: SendAdminEmailPayload["audience"];
  attachments?: NonNullable<SendAdminEmailPayload["attachments"]>;
};

type IncomingNotice = {
  count: number;
  newest: AdminEmailSummary;
  timestamp: number;
};

export default function EmailClient() {
  const [view, setView] = useState<EmailView>("inbox");
  const [emails, setEmails] = useState<AdminEmailSummary[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedEmailFolder, setSelectedEmailFolder] = useState<string | null>(folderMap.inbox);
  const [selectedEmail, setSelectedEmail] = useState<AdminEmailDetail | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [mailStatus, setMailStatus] = useState<AdminEmailInboxStatus | null>(null);
  const [composeInitialData, setComposeInitialData] = useState<{
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
  } | undefined>(undefined);
  const [incomingNotice, setIncomingNotice] = useState<IncomingNotice | null>(null);
  const [newArrivalIds, setNewArrivalIds] = useState<string[]>([]);
  const [initialSyncing, setInitialSyncing] = useState(false);

  const listCacheRef = useRef<Record<string, AdminEmailSummary[]>>({});
  const detailCacheRef = useRef<Record<string, AdminEmailDetail>>({});
  const hasSyncedOnceRef = useRef(false);
  const prefetchRef = useRef(false);
  const inboxBaselineRef = useRef(false);
  const currentFolderRef = useRef(folderMap[view]);
  const listRequestRef = useRef<Record<string, number>>({});
  const detailRequestRef = useRef(0);

  const toast = useToast();
  const currentFolder = folderMap[view];
  const currentFolderLabel = folderLabels[view];

  useEffect(() => {
    currentFolderRef.current = currentFolder;
  }, [currentFolder]);

  const trackIncomingEmails = useCallback(
    (items: AdminEmailSummary[]) => {
      if (!items.length) {
        return;
      }
      setNewArrivalIds((previous) => {
        const next = new Set(previous);
        items.forEach((item) => next.add(item.uid));
        return Array.from(next);
      });
      setIncomingNotice({
        count: items.length,
        newest: items[0],
        timestamp: Date.now(),
      });
      toast.push(`New email from ${items[0].sender}`);
    },
    [toast],
  );

  const cacheFolderSnapshot = useCallback(
    (
      folder: string,
      data: AdminEmailSummary[],
      options?: {
        announceInboxArrivals?: boolean;
      },
    ) => {
      const previous = listCacheRef.current[folder] ?? [];
      listCacheRef.current = { ...listCacheRef.current, [folder]: data };

      if (folder !== folderMap.inbox) {
        return;
      }

      if (!inboxBaselineRef.current) {
        inboxBaselineRef.current = true;
        return;
      }

      if (!options?.announceInboxArrivals) {
        return;
      }

      const previousIds = new Set(previous.map((item) => item.uid));
      const incoming = data.filter((item) => !previousIds.has(item.uid));
      trackIncomingEmails(incoming);
    },
    [trackIncomingEmails],
  );

  const loadMailStatus = useCallback(async () => {
    try {
      const status = await getAdminEmailStatus();
      setMailStatus(status);
    } catch (error) {
      console.error("Failed to load email status:", error);
    }
  }, []);

  const loadEmails = useCallback(
    async (force = false) => {
      const folder = currentFolder;
      const requestId = (listRequestRef.current[folder] || 0) + 1;
      listRequestRef.current[folder] = requestId;
      const isActive = () =>
        currentFolderRef.current === folder && listRequestRef.current[folder] === requestId;
      const isFirstSync = !hasSyncedOnceRef.current;
      if (isFirstSync) {
        setInitialSyncing(true);
      }

      const cached = listCacheRef.current[folder];
      setLoadingList(force ? true : !cached);
      if (cached && !force && currentFolderRef.current === folder) {
        setEmails(cached);
      }

      try {
        const data = await getAdminInbox(25, folder);
        cacheFolderSnapshot(folder, data, {
          announceInboxArrivals: folder === folderMap.inbox && Boolean(cached || inboxBaselineRef.current),
        });
        if (!isActive()) {
          return;
        }
        setEmails(data);
      } catch (error) {
        console.error("Failed to load emails:", error);
        toast.push("Failed to load emails", "error");
      } finally {
        if (isActive()) {
          setLoadingList(false);
        }
        if (isFirstSync && currentFolderRef.current === folder) {
          hasSyncedOnceRef.current = true;
          setInitialSyncing(false);
        }
      }
    },
    [cacheFolderSnapshot, currentFolder, toast],
  );

  const pollInbox = useCallback(async () => {
    try {
      const data = await getAdminInbox(25, folderMap.inbox);
      cacheFolderSnapshot(folderMap.inbox, data, { announceInboxArrivals: true });
      if (currentFolderRef.current === folderMap.inbox) {
        setEmails(data);
      }
    } catch (error) {
      console.error("Inbox polling failed:", error);
    }
  }, [cacheFolderSnapshot]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  useEffect(() => {
    loadMailStatus();
  }, [loadMailStatus]);

  useEffect(() => {
    if (prefetchRef.current) return;
    prefetchRef.current = true;
    const otherFolders = Object.values(folderMap).filter((folder) => folder !== currentFolder);
    void (async () => {
      for (const folder of otherFolders) {
        if (listCacheRef.current[folder]) continue;
        try {
          const data = await getAdminInbox(25, folder);
          cacheFolderSnapshot(folder, data);
        } catch (error) {
          console.error("Prefetch folder failed", folder, error);
        }
      }
    })();
  }, [cacheFolderSnapshot, currentFolder]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void pollInbox();
    }, INBOX_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [pollInbox]);

  useEffect(() => {
    if (!incomingNotice) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setIncomingNotice((current) =>
        current?.timestamp === incomingNotice.timestamp ? null : current,
      );
    }, 9000);
    return () => window.clearTimeout(timeoutId);
  }, [incomingNotice]);

  useEffect(() => {
    if (!selectedEmailId) {
      setSelectedEmail(null);
      setLoadingDetail(false);
      detailRequestRef.current += 1;
      return;
    }

    const loadEmailDetail = async () => {
      const requestId = detailRequestRef.current + 1;
      detailRequestRef.current = requestId;
      const folderForMessage = selectedEmailFolder || currentFolder;
      const cacheKey = `${folderForMessage}:${selectedEmailId}`;
      const cached = detailCacheRef.current[cacheKey];
      setLoadingDetail(!cached);
      if (cached) {
        setSelectedEmail(cached);
      }
      try {
        const data = await getAdminEmail(selectedEmailId, folderForMessage);
        detailCacheRef.current = { ...detailCacheRef.current, [cacheKey]: data };
        if (detailRequestRef.current !== requestId) {
          return;
        }
        setSelectedEmail(data);
      } catch (error) {
        console.error("Failed to load email detail:", error);
        toast.push("Failed to load email details", "error");
      } finally {
        if (detailRequestRef.current === requestId) {
          setLoadingDetail(false);
        }
      }
    };

    void loadEmailDetail();
  }, [selectedEmailId, selectedEmailFolder, currentFolder, toast]);

  const clearArrivalMarkers = useCallback((ids?: string[]) => {
    if (!ids || ids.length === 0) {
      setNewArrivalIds([]);
      return;
    }
    const removal = new Set(ids);
    setNewArrivalIds((previous) => previous.filter((item) => !removal.has(item)));
  }, []);

  const handleSelectEmail = useCallback(
    (id: string, folder = currentFolder) => {
      setSelectedEmailId(id);
      setSelectedEmailFolder(folder);
      const cached = detailCacheRef.current[`${folder}:${id}`];
      if (cached) {
        setSelectedEmail(cached);
      }
      setIsComposing(false);
      clearArrivalMarkers([id]);
      if (incomingNotice?.newest.uid === id) {
        setIncomingNotice(null);
      }
    },
    [clearArrivalMarkers, currentFolder, incomingNotice],
  );

  const handleSendEmail = async (data: ComposePayload) => {
    try {
      await sendAdminEmail({
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        body_text: data.body,
        audience: data.audience,
        attachments: data.attachments,
      });
      toast.push("Email sent successfully");
      setIsComposing(false);
      setComposeInitialData(undefined);
      void loadEmails(true);
    } catch (error) {
      console.error("Failed to send email:", error);
      if (error instanceof Error && error.message) {
        try {
          const parsed = JSON.parse(error.message) as { refused?: string[] };
          if (parsed.refused && Array.isArray(parsed.refused)) {
            toast.push(`Skipped invalid recipients: ${parsed.refused.join(", ")}`);
            setIsComposing(false);
            setComposeInitialData(undefined);
            void loadEmails(true);
            return;
          }
        } catch {
          // fall through
        }
      }
      toast.push("Failed to send email", "error");
      throw error;
    }
  };

  const handleReply = (email: AdminEmailDetail, all = false) => {
    setComposeInitialData({
      to: [email.sender],
      cc: all ? email.cc : [],
      subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
      body: `\n\nOn ${new Date(email.date || "").toLocaleString()}, ${email.sender} wrote:\n> ${email.text_body.replace(/\n/g, "\n> ")}`,
    });
    setIsComposing(true);
    setSelectedEmailId(null);
  };

  const handleForward = (email: AdminEmailDetail) => {
    setComposeInitialData({
      subject: email.subject.startsWith("Fwd:") ? email.subject : `Fwd: ${email.subject}`,
      body: `\n\n---------- Forwarded message ---------\nFrom: ${email.sender}\nDate: ${new Date(email.date || "").toLocaleString()}\nSubject: ${email.subject}\nTo: ${email.to.join(", ")}\n\n${email.text_body}`,
    });
    setIsComposing(true);
    setSelectedEmailId(null);
  };

  const handleComposeOpen = () => {
    setComposeInitialData(undefined);
    setIsComposing(true);
    setSelectedEmailId(null);
  };

  const handleViewChange = (nextView: EmailView) => {
    setView(nextView);
    setSelectedEmailId(null);
    setSelectedEmail(null);
    setSelectedEmailFolder(null);

    const nextFolder = folderMap[nextView];
    const cached = listCacheRef.current[nextFolder];
    if (cached) {
      setEmails(cached);
      setLoadingList(false);
    } else {
      setEmails([]);
      setLoadingList(true);
    }
  };

  const handleRefresh = () => {
    void loadEmails(true);
    void loadMailStatus();
  };

  const handleReviewLatest = useCallback(() => {
    const latestInboxMessage = incomingNotice?.newest ?? listCacheRef.current[folderMap.inbox]?.[0];
    if (!latestInboxMessage) {
      return;
    }
    setView("inbox");
    setEmails(listCacheRef.current[folderMap.inbox] ?? []);
    setIsComposing(false);
    setIncomingNotice(null);
    clearArrivalMarkers();
    handleSelectEmail(latestInboxMessage.uid, folderMap.inbox);
  }, [clearArrivalMarkers, handleSelectEmail, incomingNotice]);

  return (
    <div className="relative flex h-[calc(100vh-4rem)] overflow-hidden bg-bg">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-amber-200/20 blur-3xl" />
      </div>

      <AnimatePresence>
        {incomingNotice ? (
          <motion.div
            className="pointer-events-none fixed left-1/2 top-20 z-40 -translate-x-1/2"
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.98 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <div className="pointer-events-auto flex items-center gap-4 rounded-[1.75rem] border border-sky-200/70 bg-white/92 px-4 py-3 shadow-[0_30px_80px_-38px_rgba(14,116,144,0.45)] backdrop-blur-xl">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.9),rgba(14,116,144,0.18))] text-sky-950">
                <div className="absolute inset-0 rounded-2xl bg-sky-400/20 animate-ping" />
                <MailOpen size={20} className="relative" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-600/80">
                  {incomingNotice.count > 1 ? `${incomingNotice.count} new emails` : "New email received"}
                </div>
                <div className="truncate text-sm font-semibold text-slate-950">
                  {incomingNotice.newest.sender}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {incomingNotice.newest.subject || "(no subject)"}
                </div>
              </div>
              <button
                type="button"
                onClick={handleReviewLatest}
                className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 transition hover:bg-white"
              >
                Open
                <ArrowRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => setIncomingNotice(null)}
                className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                aria-label="Dismiss new email notification"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {initialSyncing ? (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-2xl bg-white/95 px-6 py-4 shadow-2xl ring-1 ring-border/70 dark:bg-neutral-900/95 animate-bounce">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-ink via-accent to-ink animate-pulse shadow-inner" />
            <div className="flex flex-col leading-tight">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Syncing inbox…</div>
              <div className="text-[11px] text-muted/80">Just a moment while we pull your messages</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative flex h-full w-full transition-opacity">
        <div className="w-[250px] flex-shrink-0">
          <EmailSidebar
            currentView={view}
            onViewChange={handleViewChange}
            onCompose={handleComposeOpen}
            unreadCount={newArrivalIds.length}
            mailStatus={mailStatus}
            onReviewLatest={handleReviewLatest}
          />
        </div>

        <div className="w-[350px] flex-shrink-0">
          <EmailList
            emails={emails}
            selectedId={selectedEmailId}
            onSelect={(id) => handleSelectEmail(id)}
            loading={loadingList}
            folderLabel={currentFolderLabel}
            onRefresh={handleRefresh}
            refreshing={loadingList}
          />
        </div>

        <div className="min-w-0 flex-1">
          {isComposing ? (
            <ComposeEmail
              onClose={() => setIsComposing(false)}
              onSend={handleSendEmail}
              initialData={composeInitialData}
            />
          ) : (
            <EmailDetail
              email={selectedEmail}
              loading={loadingDetail}
              folderLabel={currentFolderLabel}
              onReply={handleReply}
              onForward={handleForward}
            />
          )}
        </div>
      </div>
    </div>
  );
}
