import { useEffect, useMemo, useState } from "react";
import { Building2, Clock3, Mail, Phone, ShieldAlert, UserRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ApiError,
  ParishCouncilAssignmentStatus,
  ParishCouncilMeta,
  ParishCouncilReportResponse,
  getParishCouncilMeta,
  getParishCouncilReport,
} from "@/lib/api";

import { DateRangeControls, DateRangeValue } from "./DateRangeControls";
import { StatCard } from "./StatCard";

const BAR_COLORS = ["#B45309", "#1D4ED8", "#0F766E", "#7C3AED", "#DC2626", "#475569"];

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
};

type FilterState = {
  department_id: string;
  status: ParishCouncilAssignmentStatus | "";
  q: string;
  active_only: boolean;
};

export function ParishCouncilsReport() {
  const permissions = usePermissions();
  const toast = useToast();
  const canViewReport = permissions.canAccessReport("councils");
  const [meta, setMeta] = useState<ParishCouncilMeta | null>(null);
  const [report, setReport] = useState<ParishCouncilReportResponse | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    department_id: "",
    status: "",
    q: "",
    active_only: true,
  });
  const [dateRange, setDateRange] = useState<DateRangeValue>({ start: "", end: "" });
  const [loading, setLoading] = useState(true);

  const normalizedRange = useMemo(() => {
    if (dateRange.start && dateRange.end && dateRange.start > dateRange.end) {
      return { start: dateRange.end, end: dateRange.start };
    }
    return dateRange;
  }, [dateRange]);

  useEffect(() => {
    if (!canViewReport) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [metaResponse, reportResponse] = await Promise.all([
          getParishCouncilMeta(),
          getParishCouncilReport({
            department_id: filters.department_id ? Number(filters.department_id) : undefined,
            status: filters.status || undefined,
            q: filters.q || undefined,
            active_only: filters.active_only,
            start_date_from: normalizedRange.start || undefined,
            start_date_to: normalizedRange.end || undefined,
            end_date_from: normalizedRange.start || undefined,
            end_date_to: normalizedRange.end || undefined,
          }),
        ]);
        if (!cancelled) {
          setMeta(metaResponse);
          setReport(reportResponse);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setReport(null);
          setMeta(null);
        }
        if (!(error instanceof ApiError && error.status === 403)) {
          toast.push("Unable to load Parish Councils reporting.", { type: "error" });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [canViewReport, filters.active_only, filters.department_id, filters.q, filters.status, normalizedRange.end, normalizedRange.start, toast]);

  const statusChartData = useMemo(
    () =>
      (report?.status_breakdown ?? []).map((item, index) => ({
        ...item,
        color: BAR_COLORS[index % BAR_COLORS.length],
      })),
    [report],
  );

  const departmentChartData = useMemo(
    () =>
      (report?.department_breakdown ?? []).slice(0, 6).map((item, index) => ({
        ...item,
        color: BAR_COLORS[(index + 1) % BAR_COLORS.length],
      })),
    [report],
  );

  if (!canViewReport) {
    return <div className="p-8 text-center text-muted">Parish Councils reporting is restricted for this role.</div>;
  }

  if (loading) {
    return <div className="p-8 text-center text-muted">Loading Parish Councils reporting...</div>;
  }

  if (!report) {
    return <div className="p-8 text-center text-muted">No Parish Councils report data is available right now.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">Parish Councils Report</h2>
          <p className="text-sm text-muted">
            Lead coverage, trainee assignments, expiring windows, and contact-quality signals across all council departments.
          </p>
        </div>
        <DateRangeControls value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr,1fr,1fr,0.9fr]">
        <Select
          value={filters.department_id}
          onChange={(event) => setFilters((current) => ({ ...current, department_id: event.target.value }))}
        >
          <option value="">All departments</option>
          {(meta?.departments ?? []).map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.status}
          onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as ParishCouncilAssignmentStatus | "" }))}
        >
          <option value="">All statuses</option>
          {(meta?.assignment_statuses ?? []).map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Search lead or trainee"
          value={filters.q}
          onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
        />
        <div className="flex gap-2">
          <Button
            variant={filters.active_only ? "solid" : "ghost"}
            className="w-full"
            onClick={() => setFilters((current) => ({ ...current, active_only: !current.active_only }))}
          >
            {filters.active_only ? "Active only" : "All records"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Rows" value={report.summary.total_rows} icon={Building2} description="Assignments in scope" />
        <StatCard title="Active" value={report.summary.active_assignments} icon={UserRound} description="Open trainee assignments" />
        <StatCard title="Expiring 30d" value={report.summary.expiring_30_days} icon={Clock3} description="Needs extension or closure" />
        <StatCard title="Departments" value={report.summary.departments_covered} icon={Building2} description="Represented in the report" />
        <StatCard title="Missing Contact" value={report.summary.missing_contact_rows} icon={ShieldAlert} description="Rows with incomplete contact data" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Card className="p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-ink">Assignment Status Mix</h3>
            <p className="text-sm text-muted">Where current trainee records sit in the lifecycle.</p>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-muted)" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis stroke="var(--color-muted)" tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip
                  cursor={{ fill: "var(--color-accent)", opacity: 0.08 }}
                  contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }}
                  itemStyle={{ color: "var(--color-ink)" }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {statusChartData.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-ink">Department Coverage</h3>
            <p className="text-sm text-muted">Where trainees are currently distributed.</p>
          </div>
          <div className="space-y-4">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentChartData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--color-muted)" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis type="category" dataKey="label" stroke="var(--color-muted)" tickLine={false} axisLine={false} fontSize={12} width={132} />
                  <Tooltip
                    cursor={{ fill: "var(--color-accent)", opacity: 0.08 }}
                    contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }}
                    itemStyle={{ color: "var(--color-ink)" }}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {departmentChartData.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2">
              {report.department_breakdown.map((item) => (
                <Badge key={item.label} className="text-[11px] normal-case tracking-normal">
                  {item.label}: {item.value}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-ink">Expiring Assignments</h3>
              <p className="text-sm text-muted">Training windows ending soon and likely needing action.</p>
            </div>
            <Badge>{report.expiring_assignments.length} shown</Badge>
          </div>
          {report.expiring_assignments.length === 0 ? (
            <div className="text-sm text-muted">No assignments are expiring in the next 30 days.</div>
          ) : (
            <div className="space-y-3">
              {report.expiring_assignments.map((row) => (
                <div key={`${row.department}-${row.trainee_first_name}-${row.training_to}`} className="rounded-2xl border border-border bg-bg/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-ink">
                        {row.trainee_first_name} {row.trainee_last_name}
                      </div>
                      <div className="mt-1 text-xs text-muted">{row.department}</div>
                    </div>
                    <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-200">{row.status}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1"><Clock3 size={14} />Ends {formatDate(row.training_to)}</span>
                    {row.trainee_email ? <span className="inline-flex items-center gap-1"><Mail size={14} />{row.trainee_email}</span> : null}
                    {row.trainee_phone ? <span className="inline-flex items-center gap-1"><Phone size={14} />{row.trainee_phone}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-0">
          <div className="border-b border-border px-6 py-4">
            <h3 className="text-lg font-semibold text-ink">Detailed Rows</h3>
            <p className="text-sm text-muted">Lead and trainee assignment details for export or review.</p>
          </div>
          {report.rows.length === 0 ? (
            <div className="p-6 text-sm text-muted">No Parish Councils rows match the current filter set.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-bg/70 text-left text-xs uppercase tracking-[0.18em] text-muted">
                  <tr>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Trainee</th>
                    <th className="px-4 py-3">Dates</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {report.rows.map((row, index) => (
                    <tr key={`${row.department}-${row.trainee_first_name}-${row.training_from}-${index}`} className="align-top">
                      <td className="px-4 py-4 font-medium text-ink">{row.department}</td>
                      <td className="px-4 py-4 text-muted">
                        <div className="font-medium text-ink">
                          {[row.lead_first_name, row.lead_last_name].filter(Boolean).join(" ") || "Unassigned"}
                        </div>
                        {row.lead_email ? <div>{row.lead_email}</div> : null}
                        {row.lead_phone ? <div>{row.lead_phone}</div> : null}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        <div className="font-medium text-ink">
                          {row.trainee_first_name} {row.trainee_last_name}
                        </div>
                        {row.trainee_email ? <div>{row.trainee_email}</div> : null}
                        {row.trainee_phone ? <div>{row.trainee_phone}</div> : null}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        <div>{formatDate(row.training_from)}</div>
                        <div>to {formatDate(row.training_to)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge className="bg-accent/10 text-accent dark:text-accent-foreground">{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
