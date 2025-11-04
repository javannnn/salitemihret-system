import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";

import { Card, Badge, Button } from "@/components/ui";
import { whoami, WhoAmI } from "@/lib/auth";
import {
  ApiError,
  ChildPromotionPreview,
  Member,
  MemberStatus,
  Page,
  api,
  getPromotionPreview,
  runChildPromotions,
} from "@/lib/api";
import { useToast } from "@/components/Toast";
import { usePermissions } from "@/hooks/usePermissions";

type Summary = {
  total: number;
  active: number;
  archived: number;
};

const STATUS_LABEL: Record<MemberStatus, string> = {
  Active: "Active",
  Inactive: "Inactive",
  Archived: "Archived",
};

async function fetchCount(status?: MemberStatus) {
  const params = new URLSearchParams({
    page: "1",
    page_size: "1",
  });
  if (status) {
    params.set("status", status);
  }
  const response = await api<Page<Member>>(`/members?${params.toString()}`);
  return response.total;
}

export default function Dashboard() {
  const [me, setMe] = useState<WhoAmI | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [promotions, setPromotions] = useState<ChildPromotionPreview | null>(null);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const toast = useToast();
  const permissions = usePermissions();

  useEffect(() => {
    whoami()
      .then(setMe)
      .catch(() => toast.push("Failed to load profile"));
  }, [toast]);

  useEffect(() => {
    if (!permissions.viewMembers) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [total, active, archived] = await Promise.all([
          fetchCount(),
          fetchCount("Active"),
          fetchCount("Archived"),
        ]);
        if (!cancelled) {
          setSummary({ total, active, archived });
        }
      } catch (error) {
        console.error(error);
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          if (!cancelled) {
            setSummary(null);
          }
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
        if (!cancelled) {
          setPromotions(data);
        }
      })
      .catch((error) => {
        console.error(error);
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return;
        }
        toast.push("Failed to load promotion preview");
      })
      .finally(() => {
        if (!cancelled) {
          setPromotionsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [permissions.viewPromotions, toast]);

  const handleRunPromotions = async () => {
    if (!permissions.runPromotions) {
      return;
    }
    setPromoting(true);
    try {
      const result = await runChildPromotions();
      if (result.promoted.length === 0) {
        toast.push("No eligible children were promoted today.");
      } else {
        toast.push(`Promoted ${result.promoted.length} child${result.promoted.length === 1 ? "" : "ren"} to members.`);
      }
      const refreshed = await getPromotionPreview(30);
      setPromotions(refreshed);
    } catch (error) {
      console.error(error);
      toast.push("Failed to promote children");
    } finally {
      setPromoting(false);
    }
  };

  const completion = useMemo(() => {
    if (!summary) return 0;
    if (summary.total === 0) return 0;
    const activeRatio = summary.active / summary.total;
    return Math.round(activeRatio * 100);
  }, [summary]);

  const readyCount = useMemo(() => {
    if (!promotions) return 0;
    const today = new Date();
    return promotions.items.filter((item) => new Date(item.turns_on) <= today).length;
  }, [promotions]);

  const sparklinePoints = useMemo(() => {
    if (!summary) return [];
    const baseline = summary.total || 1;
    const values = [summary.total * 0.6, summary.total * 0.7, summary.active, summary.total];
    return values.map((value, index) => ({
      x: (index / (values.length - 1)) * 100,
      y: 100 - (value / baseline) * 100,
    }));
  }, [summary]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-mute">Signed in as</div>
              <div className="text-xl font-semibold">{me?.full_name || me?.user || "…"}</div>
            </div>
            <Badge className="normal-case">{(me?.roles || []).join(", ") || "Guest"}</Badge>
          </div>
          <div className="text-sm text-mute leading-relaxed">
            Welcome back! Use the navigation to manage the parish member directory.
          </div>
        </Card>
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-mute">Membership health</div>
              <div className="text-3xl font-semibold">
                {permissions.viewMembers && summary ? summary.total.toLocaleString() : "—"}
              </div>
            </div>
            <div className="text-xs text-mute text-right">
              Completion
              <div className="text-lg font-semibold text-accent">
                {permissions.viewMembers && summary ? `${completion}% active` : "—"}
              </div>
            </div>
          </div>
          {permissions.viewMembers ? (
            <>
              <div className="h-24 w-full">
                <motion.svg
                  key={completion}
                  viewBox="0 0 100 100"
                  className="h-full w-full text-accent/60"
                >
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    points={sparklinePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  />
                </motion.svg>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs uppercase text-mute">Active</div>
                  <div className="text-lg font-semibold text-accent">
                    {summary ? summary.active.toLocaleString() : "…"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-mute">Archived</div>
                  <div className="text-lg font-semibold">
                    {summary ? summary.archived.toLocaleString() : "…"}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-mute leading-relaxed">
              Membership metrics are hidden for your role. Contact a PR Admin if you need broader access.
            </div>
          )}
        </Card>
        <Card className="p-6 space-y-4">
          <div className="text-xs uppercase tracking-wide text-mute">
            Status distribution
          </div>
          {permissions.viewMembers ? (
            <div className="space-y-3">
              {(["Active", "Inactive", "Archived"] as MemberStatus[]).map((status) => {
                const total = summary?.total || 1;
                const value =
                  status === "Active"
                    ? summary?.active || 0
                    : status === "Archived"
                    ? summary?.archived || 0
                    : total - (summary?.active || 0) - (summary?.archived || 0);
                const pct = total ? Math.round((value / total) * 100) : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-mute">{STATUS_LABEL[status]}</div>
                    <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="h-full rounded-full bg-accent"
                      />
                    </div>
                    <div className="w-10 text-xs text-mute text-right">{pct}%</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-mute leading-relaxed">
              Status breakdown is limited to teams that oversee membership approvals.
            </div>
          )}
        </Card>
      </div>
      {permissions.viewPromotions && promotions && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-mute">Children turning 18</div>
              <div className="text-xl font-semibold">Upcoming promotions</div>
            </div>
            <Badge className="normal-case">Next 30 days</Badge>
          </div>
          {promotionsLoading ? (
            <div className="text-sm text-mute">Checking upcoming promotions…</div>
          ) : promotions.items.length === 0 ? (
            <div className="text-sm text-mute">No children are scheduled to turn 18 in the next 30 days.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {promotions.items.slice(0, 5).map((item) => (
                <li
                  key={item.child_id}
                  className="flex items-center justify-between border border-border rounded-xl px-3 py-2 bg-card/70"
                >
                  <div>
                    <div className="font-medium">{item.child_name}</div>
                    <div className="text-xs text-mute">Turns 18 on {new Date(item.turns_on).toLocaleDateString()}</div>
                  </div>
                  <div className="text-xs text-mute">Guardian: {item.parent_member_name}</div>
                </li>
              ))}
              {promotions.items.length > 5 && (
                <li className="text-xs text-mute">+{promotions.items.length - 5} more</li>
              )}
            </ul>
          )}
          <div className="flex items-center justify-between">
            <div className="text-xs text-mute">{readyCount} eligible for promotion today.</div>
            {permissions.runPromotions ? (
              <Button
                onClick={handleRunPromotions}
                disabled={promotionsLoading || promoting || readyCount === 0}
              >
                {promoting ? "Promoting…" : "Promote eligible"}
              </Button>
            ) : (
              <span className="text-xs text-mute">Contact an Admin to run promotions.</span>
            )}
          </div>
        </Card>
      )}
      {!permissions.viewPromotions && (
        <Card className="p-6 flex gap-3 items-start border-amber-200 bg-amber-50 text-amber-900">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Promotions hidden</div>
            <div className="text-sm leading-relaxed">
              Only Admin and Public Relations roles can preview or promote children turning 18.
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
