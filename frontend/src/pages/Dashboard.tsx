import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, CreditCard, Activity, ArrowUpRight, Bell, GraduationCap, CalendarDays, Shield, Search } from "lucide-react";

import { Card, Badge, Button } from "@/components/ui";
import {
  ApiError,
  ChildPromotionPreview,
  Member,
  Page,
  Payment,
  PaymentSummaryResponse,
  api,
  getPaymentSummary,
  getPromotionPreview,
  listAdminUsers,
  listHouseholds,
  listPayments,
} from "@/lib/api";
import { useToast } from "@/components/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/AuthContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";

type Summary = {
  total: number;
  active: number;
  archived: number;
};

type SmartSearchResult = {
  id: string;
  section: string;
  title: string;
  subtitle: string;
  badge: string;
  href?: string;
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay, duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98] },
  }),
};

const fetchMemberCount = async (status?: string) => {
  const params = new URLSearchParams({ page: "1", page_size: "1" });
  if (status) params.set("status", status);
  const response = await api<Page<Member>>(`/members?${params.toString()}`);
  return response.total;
};

const formatCurrencyValue = (value: number, currency = "USD") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [promotions, setPromotions] = useState<ChildPromotionPreview | null>(null);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [financeSummary, setFinanceSummary] = useState<PaymentSummaryResponse | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SmartSearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "ready" | "empty" | "restricted" | "error">("idle");
  const [searchMessage, setSearchMessage] = useState("Type at least two characters to search globally.");
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [recentPaymentsStatus, setRecentPaymentsStatus] = useState<"idle" | "loading" | "ready" | "empty" | "restricted" | "error">("idle");

  const toast = useToast();
  const permissions = usePermissions();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.is_super_admin ?? false;
  const isMobile = useMediaQuery("(max-width: 1023px)");

  useEffect(() => {
    if (!permissions.viewMembers) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [total, active, archived] = await Promise.all([
          fetchMemberCount(),
          fetchMemberCount("Active"),
          fetchMemberCount("Archived"),
        ]);
        if (!cancelled) {
          setSummary({ total, active, archived });
        }
      } catch (error) {
        console.error(error);
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return;
        }
        toast.push("Failed to load member summary");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permissions.viewMembers, toast]);

  useEffect(() => {
    if (!permissions.viewPromotions) {
      setPromotions(null);
      setPromotionsLoading(false);
      return;
    }
    let cancelled = false;
    setPromotionsLoading(true);
    getPromotionPreview(30)
      .then((data) => {
        if (!cancelled) setPromotions(data);
      })
      .catch((error) => {
        console.error(error);
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return;
        toast.push("Failed to load promotion preview");
      })
      .finally(() => {
        if (!cancelled) setPromotionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [permissions.viewPromotions, toast]);

  useEffect(() => {
    if (!permissions.viewPayments) {
      setFinanceSummary(null);
      setFinanceLoading(false);
      return;
    }
    let cancelled = false;
    setFinanceLoading(true);
    getPaymentSummary()
      .then((data) => {
        if (!cancelled) setFinanceSummary(data);
      })
      .catch((error) => {
        console.error(error);
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return;
        toast.push("Failed to load finance summary");
      })
      .finally(() => {
        if (!cancelled) setFinanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [permissions.viewPayments, toast]);

  useEffect(() => {
    if (!permissions.viewPayments) {
      setRecentPayments([]);
      setRecentPaymentsStatus("restricted");
      return;
    }
    let cancelled = false;
    setRecentPaymentsStatus("loading");
    listPayments({ page: 1, page_size: 6 })
      .then((data) => {
        if (cancelled) return;
        setRecentPayments(data.items);
        setRecentPaymentsStatus(data.items.length ? "ready" : "empty");
      })
      .catch((error) => {
        console.error(error);
        if (cancelled) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setRecentPaymentsStatus("restricted");
        } else {
          setRecentPaymentsStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [permissions.viewPayments]);

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchStatus("idle");
      setSearchMessage("Type at least two characters to search globally.");
      setSearchResults([]);
      return;
    }
    const normalizedTerm = term.toLowerCase();
    const tasks: Promise<SmartSearchResult[]>[] = [];
    if (permissions.viewMembers) {
      const params = new URLSearchParams({ page: "1", page_size: "5", search: term });
      tasks.push(
        api<Page<Member>>(`/members?${params.toString()}`).then((rs) =>
          rs.items.map((member) => ({
            id: `member-${member.id}`,
            section: "Members",
            title: `${member.first_name} ${member.last_name}`.trim(),
            subtitle: `ID ${member.id} · ${member.username}`,
            badge: member.status,
            href: `/members/${member.id}/edit`,
          }))
        )
      );
      tasks.push(
        listHouseholds({ q: term, page_size: 5 }).then((rs) =>
          rs.items.map((household) => ({
            id: `household-${household.id}`,
            section: "Households",
            title: household.name,
            subtitle: household.head_member_name ? `Head: ${household.head_member_name}` : "No head assigned",
            badge: `${household.members_count} members`,
            href: `/members?household=${household.id}`,
          }))
        )
      );
    }
    if (isSuperAdmin) {
      tasks.push(
        listAdminUsers({ search: term, limit: 5 }).then((rs) =>
          rs.items.map((admin) => ({
            id: `admin-${admin.id}`,
            section: "Admin users",
            title: admin.full_name || admin.username,
            subtitle: `${admin.username} · ${admin.email}`,
            badge: admin.is_super_admin ? "Super admin" : "Admin",
            href: `/admin/users/${admin.id}`,
          }))
        )
      );
    }
    if (permissions.viewPayments) {
      tasks.push(
        listPayments({ page: 1, page_size: 20 }).then((response) =>
          response.items
            .filter((payment) => {
              const memberName = payment.member?.full_name || "";
              const haystack = `${memberName} ${payment.memo ?? ""} ${payment.service_type.label} ${payment.service_type.code}`.toLowerCase();
              return haystack.includes(term.toLowerCase());
            })
            .slice(0, 5)
            .map((payment) => ({
              id: `payment-${payment.id}`,
              section: "Payments",
              title: payment.member?.full_name || payment.service_type.label,
              subtitle: `${payment.service_type.label} · ${payment.status}`,
              badge: formatCurrencyValue(payment.amount, payment.currency),
              href: "/payments",
            }))
        )
      );
    }
    if (!tasks.length) {
      setSearchStatus("restricted");
      setSearchMessage("Global search is disabled for this role.");
      setSearchResults([]);
      return;
    }
    setSearchStatus("loading");
    setSearchMessage("Searching records…");
    setSearchResults([]);
    let cancelled = false;
    Promise.all(tasks)
      .then((groups) => {
        if (cancelled) return;
        const flattened = groups
          .flat()
          .filter((item) => `${item.title} ${item.subtitle} ${item.badge}`.toLowerCase().includes(normalizedTerm));
        if (flattened.length === 0) {
          setSearchStatus("empty");
          setSearchMessage("No matches found.");
        } else {
          setSearchStatus("ready");
          setSearchMessage("Select a result to open details.");
        }
        setSearchResults(flattened);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(error);
        setSearchStatus("error");
        setSearchMessage("We couldn't search right now. Try again later.");
        setSearchResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [searchTerm, permissions.viewMembers, permissions.viewPayments, isSuperAdmin]);

  const completion = useMemo(() => {
    if (!summary) return 0;
    if (summary.total === 0) return 0;
    return Math.round((summary.active / summary.total) * 100);
  }, [summary]);

  const readyCount = useMemo(() => {
    if (!promotions) return 0;
    const today = new Date();
    return promotions.items.filter((item) => new Date(item.turns_on) <= today).length;
  }, [promotions]);

  const statusBreakdown = useMemo(() => {
    if (!summary) return [];
    const total = summary.total || 1;
    const inactive = Math.max(summary.total - summary.active - summary.archived, 0);
    return [
      { label: "Active", value: summary.active, percent: Math.round((summary.active / total) * 100), color: "bg-emerald-500" },
      { label: "Inactive", value: inactive, percent: Math.round((inactive / total) * 100), color: "bg-slate-400" },
      { label: "Archived", value: summary.archived, percent: Math.round((summary.archived / total) * 100), color: "bg-slate-500" },
    ];
  }, [summary]);

  const notifications = useMemo(() => {
    const timestamp = `Updated ${new Date().toLocaleTimeString()}`;
    const list = [] as { title: string; detail: string; time: string }[];
    list.push({
      title: "Member roster",
      detail: summary ? `${summary.active} active · ${summary.total} total` : "Loading member metrics…",
      time: timestamp,
    });
    list.push({
      title: "Giving",
      detail: financeSummary ? formatCurrencyValue(financeSummary.grand_total, financeSummary.items[0]?.currency ?? "USD") : "Fetching finance data…",
      time: timestamp,
    });
    list.push({
      title: "Promotions",
      detail: promotions ? `${readyCount} ready · ${promotions.total} upcoming` : "Preparing promotion preview…",
      time: timestamp,
    });
    return list;
  }, [summary, financeSummary, promotions, readyCount]);

  const searchSections = useMemo(
    () =>
      Object.entries(
        searchResults.reduce<Record<string, SmartSearchResult[]>>((acc, item) => {
          acc[item.section] = acc[item.section] ? [...acc[item.section], item] : [item];
          return acc;
        }, {})
      ).map(([section, entries]) => ({ section, entries })),
    [searchResults]
  );

  const quickActions = useMemo(
    () => [
      { label: "Add new member", href: "/members/new", enabled: permissions.createMembers, description: "Open the member intake form." },
      { label: "Record a payment", href: "/payments", enabled: permissions.managePayments, description: "Post a new contribution." },
      {
        label: "Open sponsorship board",
        href: "/sponsorships",
        enabled: permissions.manageSponsorships || permissions.viewSponsorships,
        description: "Review sponsorship cases.",
      },
      { label: "User management", href: "/admin/users", enabled: isSuperAdmin, description: "Invite or manage admins." },
    ],
    [permissions.createMembers, permissions.managePayments, permissions.manageSponsorships, permissions.viewSponsorships, isSuperAdmin]
  ).filter((action) => action.enabled);

  const mobileQuickActions = useMemo(() => quickActions.slice(0, 4), [quickActions]);

  return (
    <div className="relative">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-10 h-72 w-72 rounded-full bg-gray-200/20 dark:bg-neutral-800/20 blur-3xl" />
        <div className="absolute top-32 -right-10 h-80 w-80 rounded-full bg-gray-200/20 dark:bg-neutral-800/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-gray-200/20 dark:bg-neutral-800/20 blur-3xl" />
      </div>

      <div className="relative z-10 space-y-6 px-4 py-6">
        {isMobile && mobileQuickActions.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {mobileQuickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="flex items-center justify-between rounded-2xl border border-border bg-card/90 px-3 py-3 text-left text-sm shadow-soft"
                onClick={() => action.href && navigate(action.href)}
              >
                <span className="font-medium text-ink">{action.label}</span>
                <ArrowUpRight className="h-4 w-4 text-mute" />
              </button>
            ))}
          </div>
        )}

        <section className="rounded-3xl border border-white/80 bg-white/95 dark:bg-[#0A0A0A]/90 backdrop-blur-2xl p-5 sm:p-6 shadow-sm space-y-4 dark:border-white/5">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Global search</h2>
            <p className="text-[12px] text-muted">Search members, admins, and payments from one place.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 rounded-2xl sm:rounded-full border border-border bg-card px-4 py-3 text-base text-ink shadow-sm">
              <Search className="h-4 w-4 text-muted" />
              <input
                data-tour="dashboard-search"
                className="flex-1 bg-transparent focus:outline-none placeholder:text-muted text-base text-ink"
                placeholder="Search members, admins, payments..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <span className="rounded-full bg-accent/5 px-2 py-0.5 text-[11px] text-muted">
                Type 2+ letters
              </span>
            </div>
            <div className="min-h-[96px] rounded-2xl border border-dashed border-border bg-card/50 px-5 py-4 text-sm text-muted">
              {searchStatus === "idle" && <p className="text-xs text-muted">{searchMessage}</p>}
              {searchStatus === "loading" && <p className="text-xs text-muted">Searching…</p>}
              {searchStatus === "restricted" && <p className="text-xs text-amber-600">{searchMessage}</p>}
              {searchStatus === "error" && <p className="text-xs text-red-500">{searchMessage}</p>}
              {searchStatus === "empty" && <p className="text-xs text-muted">{searchMessage}</p>}
              {searchStatus === "ready" && (
                <div className="space-y-4">
                  {searchSections.map((section) => (
                    <div key={section.section} className="space-y-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted">{section.section}</p>
                      <ul className="space-y-2">
                        {section.entries.map((entry) => (
                          <li key={entry.id}>
                            <button
                              type="button"
                              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-left transition hover:bg-accent/5"
                              onClick={() => entry.href && navigate(entry.href)}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-ink">{entry.title}</div>
                                  <div className="text-[11px] text-muted">{entry.subtitle}</div>
                                </div>
                                <Badge className="normal-case text-[10px] bg-ink text-card">{entry.badge}</Badge>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <motion.section
          initial="hidden"
          animate="visible"
          variants={cardVariants}
          className="grid gap-4 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)]"
        >
          <motion.div
            whileHover={{ y: -2 }}
            className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/95 backdrop-blur-2xl p-4 sm:p-5 shadow-sm dark:bg-[#0A0A0A]/90 dark:border-white/5"
          >
            <div className="absolute inset-0 opacity-70 pointer-events-none">
              <div className="absolute -top-24 right-0 h-44 w-44 rounded-full bg-gray-100 dark:bg-neutral-800 blur-3xl" />
            </div>
            <div className="relative flex flex-col gap-3">
              <div>
                <p className="text-[11px] font-medium tracking-[0.18em] text-muted uppercase mb-1">Today overview</p>
                <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-ink flex items-center gap-2">
                  Parish health snapshot
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800">
                    <ArrowUpRight className="h-3 w-3" />
                    {summary ? `${completion}% active` : "—"}
                  </span>
                </h2>
              </div>
              <div className="grid gap-3 md:grid-cols-3 text-xs">
                <div className="flex items-center gap-3 rounded-2xl bg-ink text-card px-3 py-2.5 ring-1 ring-ink/10 shadow-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-card text-ink">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-card/80">Members</span>
                    <span className="text-sm font-semibold">{summary ? `${summary.total} total` : "Requires permissions"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-ink text-card px-3 py-2.5 ring-1 ring-ink/10 shadow-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-card text-ink">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-card/80">Last 30 days giving</span>
                    <span className="text-sm font-semibold">
                      {financeSummary ? formatCurrencyValue(financeSummary.grand_total, financeSummary.items[0]?.currency ?? "USD") : "Restricted"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-ink text-card px-3 py-2.5 ring-1 ring-ink/10 shadow-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-card text-ink">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-card/80">Promotion readiness</span>
                    <span className="text-sm font-semibold">
                      {promotions ? `${readyCount} ready · ${promotions.total} upcoming` : "Loading…"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3 text-xs text-muted">
              {notifications.map((notification) => (
                <div key={notification.title} className="flex items-start gap-2 rounded-2xl bg-card px-3 py-2 border border-border">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/5 text-ink shadow-sm">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="font-semibold text-ink">{notification.title}</div>
                    <div className="text-[11px] text-muted">{notification.detail}</div>
                  </div>
                  <div className="text-[10px] text-muted">{notification.time}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            data-tour="dashboard-quick-actions"
            custom={0.18}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="rounded-3xl border border-white/80 bg-white/90 backdrop-blur-2xl p-4 shadow-sm dark:bg-[#0A0A0A]/90 dark:border-white/5"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-xs font-semibold tracking-wide text-ink uppercase">Quick actions</h2>
                <p className="text-[11px] text-muted">RBAC-aware shortcuts</p>
              </div>
            </div>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-left text-sm text-ink hover:bg-accent/5 transition-colors flex items-center justify-between"
                  onClick={() => action.href && navigate(action.href)}
                >
                  <div>
                    <div className="font-medium">{action.label}</div>
                    <div className="text-[11px] text-muted">{action.description}</div>
                  </div>
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              ))}
            </div>
          </motion.div>
        </motion.section>

        <section className="grid gap-4 lg:grid-cols-3">
          <motion.div
            custom={0.27}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="rounded-2xl bg-white/90 backdrop-blur-xl border border-white/80 p-4 shadow-sm dark:bg-[#0A0A0A]/85 dark:border-white/5"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-xs font-semibold tracking-wide text-ink uppercase">Status distribution</h2>
                <p className="text-[11px] text-muted">Members by status</p>
              </div>
            </div>
            {summary ? (
              <div className="space-y-4 text-sm">
                {statusBreakdown.map((status) => (
                  <div key={status.label} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-ink">
                        <span className={`h-2 w-2 rounded-full ${status.color}`} /> {status.label}
                      </span>
                      <span className="text-xs font-medium text-muted">{status.value} ({status.percent}%)</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-accent/10 overflow-hidden">
                      <div className={`h-full ${status.color}`} style={{ width: `${status.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted">Member metrics limited for this role.</div>
            )}
          </motion.div>

          <motion.div
            custom={0.3}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="rounded-2xl bg-white/90 backdrop-blur-xl border border-white/80 p-4 shadow-sm dark:bg-[#0A0A0A]/85 dark:border-white/5"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-xs font-semibold tracking-wide text-ink uppercase">Upcoming promotions</h2>
                <p className="text-[11px] text-muted">Children moving to membership</p>
              </div>
            </div>
            {permissions.viewPromotions ? (
              promotions ? (
                promotions.items.length ? (
                  <ul className="space-y-2 text-sm">
                    {promotions.items.slice(0, 3).map((item) => (
                      <li key={item.child_id} className="rounded-xl border border-border bg-card px-3 py-2">
                        <div className="font-medium text-ink">{item.child_name}</div>
                        <div className="text-[11px] text-muted flex items-center gap-2">
                          <CalendarDays className="h-3 w-3 text-amber-500" />
                          {new Date(item.turns_on).toLocaleDateString()}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted">
                    No eligible children in this window.
                  </div>
                )
              ) : promotionsLoading ? (
                <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted">
                  Loading promotion preview…
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted">
                  No promotion data available.
                </div>
              )
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted">
                Promotion metrics limited for this role.
              </div>
            )}
          </motion.div>

          <motion.div
            custom={0.33}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="rounded-2xl bg-white/90 backdrop-blur-xl border border-white/80 p-4 shadow-sm flex flex-col gap-3 dark:bg-[#0A0A0A]/85 dark:border-white/5"
          >
            <h2 className="text-xs font-semibold tracking-wide text-ink uppercase">Recent payments</h2>
            {recentPaymentsStatus === "restricted" && <p className="text-sm text-muted">Payment activity is restricted.</p>}
            {recentPaymentsStatus === "loading" && <p className="text-sm text-muted">Loading payments…</p>}
            {recentPaymentsStatus === "error" && <p className="text-sm text-muted">Unable to load payments.</p>}
            {recentPaymentsStatus === "empty" && <p className="text-sm text-muted">No recent payments recorded.</p>}
            {recentPaymentsStatus === "ready" && (
              <ul className="space-y-2 text-[11px]">
                {recentPayments.map((payment) => (
                  <li key={payment.id} className="flex items-start justify-between gap-3 rounded-2xl bg-card px-3 py-2 border border-border">
                    <div>
                      <div className="font-medium text-ink">{payment.member?.full_name || payment.service_type.label}</div>
                      <div className="text-[11px] text-muted">{payment.service_type.label}</div>
                    </div>
                    <div className="text-right text-muted">
                      <div className="font-semibold text-ink">{formatCurrencyValue(payment.amount, payment.currency)}</div>
                      <div className="text-[10px]">{new Date(payment.posted_at).toLocaleString()}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </section>

      </div>
    </div>
  );
}
