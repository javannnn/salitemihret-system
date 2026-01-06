import { useState, useEffect, useCallback, useRef } from "react";
import { EmailSidebar } from "./components/EmailSidebar";
import { EmailList } from "./components/EmailList";
import { EmailDetail } from "./components/EmailDetail";
import { ComposeEmail } from "./components/ComposeEmail";
import { getAdminInbox, getAdminEmail, sendAdminEmail, AdminEmailSummary, AdminEmailDetail } from "@/lib/api";
import { useToast } from "@/components/Toast";

export default function EmailClient() {
  const folderMap: Record<"inbox" | "sent" | "drafts" | "trash", string> = {
    inbox: "INBOX",
    sent: "INBOX.Sent",
    drafts: "INBOX.Drafts",
    trash: "INBOX.Trash",
  };
  const folderLabels: Record<keyof typeof folderMap, string> = {
    inbox: "Inbox",
    sent: "Sent",
    drafts: "Drafts",
    trash: "Trash",
  };

  const [view, setView] = useState<"inbox" | "sent" | "drafts" | "trash">("inbox");
  const [emails, setEmails] = useState<AdminEmailSummary[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedEmailFolder, setSelectedEmailFolder] = useState<string | null>(folderMap.inbox);
  const [selectedEmail, setSelectedEmail] = useState<AdminEmailDetail | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [composeInitialData, setComposeInitialData] = useState<{
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
  } | undefined>(undefined);
  const listCacheRef = useRef<Record<string, AdminEmailSummary[]>>({});
  const detailCacheRef = useRef<Record<string, AdminEmailDetail>>({});
  const hasSyncedOnceRef = useRef(false);
  const [initialSyncing, setInitialSyncing] = useState(false);
  const prefetchRef = useRef(false);
  const currentFolderRef = useRef(folderMap[view]);
  const listRequestRef = useRef<Record<string, number>>({});
  const detailRequestRef = useRef(0);

  const toast = useToast();
  const currentFolder = folderMap[view];
  const currentFolderLabel = folderLabels[view];

  useEffect(() => {
    currentFolderRef.current = currentFolder;
  }, [currentFolder]);

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
      // show cached messages immediately to avoid flicker
      if (cached && !force && currentFolderRef.current === folder) {
        setEmails(cached);
      }
      try {
        const data = await getAdminInbox(25, folder);
        listCacheRef.current = { ...listCacheRef.current, [folder]: data };
        if (!isActive()) {
          return;
        }
        setEmails(data);
      } catch (error) {
        console.error("Failed to load emails:", error);
        toast.push("Failed to load emails", { type: "error" });
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
    [currentFolder, toast],
  );

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  // Background prefetch of other folders to make subsequent switches instant
  useEffect(() => {
    if (prefetchRef.current) return;
    prefetchRef.current = true;
    const otherFolders = Object.values(folderMap).filter((folder) => folder !== currentFolder);
    (async () => {
      for (const folder of otherFolders) {
        if (listCacheRef.current[folder]) continue;
        try {
          const data = await getAdminInbox(25, folder);
          listCacheRef.current = { ...listCacheRef.current, [folder]: data };
        } catch (error) {
          console.error("Prefetch folder failed", folder, error);
        }
      }
    })();
  }, [currentFolder]);

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
        toast.push("Failed to load email details", { type: "error" });
      } finally {
        if (detailRequestRef.current === requestId) {
          setLoadingDetail(false);
        }
      }
    };

    loadEmailDetail();
  }, [selectedEmailId, selectedEmailFolder, currentFolder, toast]);

  const handleSendEmail = async (data: { to: string[]; cc: string[]; bcc: string[]; subject: string; body: string; audience?: string; attachments?: { filename: string; content_base64: string; content_type: string }[] }) => {
    try {
      await sendAdminEmail({
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        body_text: data.body,
        audience: data.audience as any,
        attachments: data.attachments,
      });
      toast.push("Email sent successfully", { type: "success" });
      setIsComposing(false);
      setComposeInitialData(undefined);
      loadEmails(); // Reload inbox after sending
    } catch (error) {
      console.error("Failed to send email:", error);
      if (error instanceof Error && error.message) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.refused && Array.isArray(parsed.refused)) {
            toast.push(`Skipped invalid recipients: ${parsed.refused.join(", ")}`, { type: "warning" });
            setIsComposing(false);
            setComposeInitialData(undefined);
            loadEmails();
            return;
          }
        } catch {
          // fall through
        }
      }
      toast.push("Failed to send email", { type: "error" });
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
    setSelectedEmailId(null); // Clear selected email when composing
  };

  const handleForward = (email: AdminEmailDetail) => {
    setComposeInitialData({
      subject: email.subject.startsWith("Fwd:") ? email.subject : `Fwd: ${email.subject}`,
      body: `\n\n---------- Forwarded message ---------\nFrom: ${email.sender}\nDate: ${new Date(email.date || "").toLocaleString()}\nSubject: ${email.subject}\nTo: ${email.to.join(", ")}\n\n${email.text_body}`,
    });
    setIsComposing(true);
    setSelectedEmailId(null); // Clear selected email when composing
  };

  const handleComposeOpen = () => {
    setComposeInitialData(undefined);
    setIsComposing(true);
    setSelectedEmailId(null); // Clear selected email when composing
  };

  const handleViewChange = (nextView: "inbox" | "sent" | "drafts" | "trash") => {
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
      setEmails([]); // avoid showing the previous folder while syncing
      setLoadingList(true);
    }
  };

  const handleRefresh = () => {
    loadEmails(true);
  };

  return (
    <div className="relative flex h-[calc(100vh-4rem)] overflow-hidden bg-bg">
      {initialSyncing && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-2xl bg-white/95 px-6 py-4 shadow-2xl ring-1 ring-border/70 dark:bg-neutral-900/95 animate-bounce">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-ink via-accent to-ink animate-pulse shadow-inner" />
            <div className="flex flex-col leading-tight">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Syncing inbox…</div>
              <div className="text-[11px] text-muted/80">Just a moment while we pull your messages</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-full w-full transition-opacity">
        {/* Sidebar - 250px */}
        <div className="w-[250px] flex-shrink-0">
          <EmailSidebar
            currentView={view}
            onViewChange={handleViewChange}
            onCompose={handleComposeOpen}
            unreadCount={0} // TODO: Implement unread count
          />
        </div>

        {/* Email List - 350px */}
        <div className="w-[350px] flex-shrink-0">
          <EmailList
          emails={emails}
          selectedId={selectedEmailId}
          onSelect={(id) => {
            setSelectedEmailId(id);
            setSelectedEmailFolder(currentFolder);
            const cached = detailCacheRef.current[`${currentFolder}:${id}`];
            if (cached) {
              setSelectedEmail(cached);
            }
            setIsComposing(false);
          }}
          loading={loadingList}
          folderLabel={currentFolderLabel}
          onRefresh={handleRefresh}
          refreshing={loadingList}
        />
      </div>

        {/* Main Content - Flexible */}
        <div className="flex-1 min-w-0">
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
