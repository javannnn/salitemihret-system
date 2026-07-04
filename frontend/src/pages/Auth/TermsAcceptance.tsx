import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, FileText, Loader2, ShieldCheck } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { acceptTerms } from "@/lib/auth";
import { parseApiErrorMessage } from "@/lib/api";

const TERMS_VERSION = "2026-07-03";

const sections = [
  {
    title: "1. Purpose and Scope",
    body:
      "This system is provided for authorized StMaryEotcEdmonton-Church ministry, administrative, membership, finance, Sunday School, newcomer, sponsorship, parish council, volunteer, reporting, and communication work. Access is granted only for church-approved responsibilities. By using the system, you agree to use it carefully, respectfully, and only for legitimate church operations.",
  },
  {
    title: "2. Authorized Use",
    body:
      "You may view, enter, update, export, or communicate information only when it is required for your assigned role. You must not browse records out of curiosity, use church data for personal purposes, share access with another person, or attempt to bypass permissions. Actions performed through your account may be logged and reviewed for security, support, compliance, and audit purposes.",
  },
  {
    title: "3. Confidential Church and Member Information",
    body:
      "The system may contain personal, family, contact, pastoral, payment, sponsorship, school, newcomer, and internal administrative information. Treat this information as confidential. Do not copy, screenshot, print, download, forward, or discuss it outside approved church work unless leadership has authorized it and the disclosure is necessary.",
  },
  {
    title: "4. Accuracy and Stewardship",
    body:
      "You agree to enter information truthfully, keep records as accurate and current as reasonably possible, and correct mistakes promptly when you discover them. Financial, membership, sponsorship, and attendance records should be handled with extra care because they may affect member status, receipts, reporting, follow-up, and church decision-making.",
  },
  {
    title: "5. Account Security",
    body:
      "You are responsible for protecting your username, password, session, and device. Use a strong password, sign out on shared devices, and report suspected account misuse, lost devices, unexpected access, or incorrect permissions to an administrator as soon as possible. Administrators may suspend or reset access to protect the church and its members.",
  },
  {
    title: "6. Communications and Respectful Conduct",
    body:
      "Messages, notes, emails, reports, and internal comments created in the system should be professional, factual, respectful, and consistent with the values of the church. Do not enter abusive, misleading, discriminatory, harassing, or unnecessary personal commentary. Sensitive pastoral matters should be recorded only when appropriate for the system and your role.",
  },
  {
    title: "7. Data Retention, Monitoring, and Availability",
    body:
      "The church may retain records, audit logs, uploaded files, and activity history according to operational, legal, financial, and ministry needs. The system may be monitored to protect security and data integrity. Access may be interrupted for maintenance, upgrades, connectivity issues, licensing, security response, or other operational reasons.",
  },
  {
    title: "8. Exports and External Tools",
    body:
      "If your role allows exports, reports, downloads, email, or external website handoff, you must protect that information after it leaves the system. Store files securely, limit recipients, verify addresses before sending, and delete local copies when they are no longer needed. Do not upload church data to unapproved external tools or personal accounts.",
  },
  {
    title: "9. Changes to These Terms",
    body:
      "The church may update these terms when system features, ministry practices, security needs, or legal obligations change. Continued access may require accepting a revised version. If you do not understand or cannot comply with these terms, contact an administrator before continuing.",
  },
];

export default function TermsAcceptance() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const from = typeof location.state === "object" && location.state && "from" in location.state
    ? String((location.state as { from?: unknown }).from || "/dashboard")
    : "/dashboard";

  useEffect(() => {
    if (user?.terms_accepted_at) {
      navigate(user.must_change_password ? "/account" : from, { replace: true });
    }
  }, [from, navigate, user?.must_change_password, user?.terms_accepted_at]);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (remaining <= 12) {
      setHasScrolled(true);
    }
  };

  const handleAccept = async () => {
    if (!hasScrolled || !confirmed || saving) return;
    setSaving(true);
    setError("");
    try {
      await acceptTerms();
      await refresh();
      navigate(user?.must_change_password ? "/account" : from, { replace: true });
    } catch (err) {
      setError(parseApiErrorMessage(err, "Unable to accept terms. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between border-b border-border pb-5"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-bg">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">StMaryEotcEdmonton-Church</div>
              <div className="text-xs text-mute">System access agreement</div>
            </div>
          </div>
          <div className="hidden text-right text-xs text-mute sm:block">
            Version {TERMS_VERSION}
          </div>
        </motion.header>

        <main className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[0.78fr_1.22fr]">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
          >
            <div className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card/70 px-4 text-sm text-mute">
              <FileText size={16} />
              Required before first access
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                Terms and Conditions
              </h1>
              <p className="max-w-lg text-sm leading-6 text-mute sm:text-base">
                Review the full agreement, scroll to the end, then confirm acceptance to continue.
              </p>
            </div>
            <div className="grid max-w-lg gap-3 text-sm text-mute sm:grid-cols-3">
              <div className="border-t border-border pt-3">Confidential records</div>
              <div className="border-t border-border pt-3">Role-based access</div>
              <div className="border-t border-border pt-3">Audit trail</div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.48, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_24px_70px_rgba(15,23,42,0.12)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.36)]"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-base font-semibold">Use of church systems</h2>
                <p className="mt-1 text-xs text-mute">Scroll is required before acceptance.</p>
              </div>
              <div className={`hidden rounded-full px-3 py-1 text-xs font-medium sm:block ${hasScrolled ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted/40 text-mute"}`}>
                {hasScrolled ? "Read" : "Unread"}
              </div>
            </div>

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-[48vh] min-h-[22rem] overflow-y-auto px-5 py-5 sm:px-6"
            >
              <div className="mx-auto max-w-2xl space-y-6 text-sm leading-7 text-ink/82 dark:text-white/82">
                <p>
                  These Terms and Conditions govern access to and use of the StMaryEotcEdmonton-Church administrative system. They apply to every user account, including administrators, ministry leads, committee members, staff, volunteers, and any other authorized person.
                </p>
                {sections.map((section) => (
                  <section key={section.title} className="space-y-2">
                    <h3 className="text-sm font-semibold text-ink dark:text-white">{section.title}</h3>
                    <p>{section.body}</p>
                  </section>
                ))}
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-ink dark:text-white">10. Acceptance</h3>
                  <p>
                    By selecting acceptance, you confirm that you have read these terms, understand your responsibilities, and agree to follow them while using the church system. If you are unsure whether an action is permitted, pause and ask an administrator or church leadership before proceeding.
                  </p>
                </section>
              </div>
            </div>

            <div className="border-t border-border bg-bg/70 px-5 py-5 sm:px-6">
              <label className={`flex items-start gap-3 text-sm ${hasScrolled ? "text-ink" : "text-mute"}`}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!hasScrolled || saving}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border accent-[var(--color-accent)] disabled:opacity-40"
                />
                <span>I have read and agree to these Terms and Conditions.</span>
              </label>
              {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100">{error}</div> : null}
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-mute">
                  {hasScrolled ? "You may now confirm acceptance." : "Scroll to the end to unlock acceptance."}
                </div>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={!hasScrolled || !confirmed || saving}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-sm font-semibold text-bg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {saving ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}
                  Accept and continue
                </button>
              </div>
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  );
}
