import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Input, Select, Button, Badge } from "@/components/ui";
import { Member, MemberStatus, Page, api, exportMembers, importMembers } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";

const PAGE_SIZE = 10;

export default function MembersList() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MemberStatus | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Member> | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canManage = useMemo(
    () => user?.roles.some((role) => ["Registrar", "Admin"].includes(role)) ?? false,
    [user]
  );
  const canBulkManage = useMemo(() => user?.roles.includes("Admin") ?? false, [user]);

  const load = async (nextPage: number, nextQuery = query, nextStatus = status) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: String(PAGE_SIZE),
      });
      if (nextQuery) params.set("q", nextQuery);
      if (nextStatus) params.set("status", nextStatus);
      const result = await api<Page<Member>>(`/members?${params.toString()}`);
      setData(result);
    } catch (error) {
      console.error(error);
      toast.push("Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = () => {
    setPage(1);
    load(1, query, status);
  };

  const handleStatusChange = (value: string) => {
    setStatus(value as MemberStatus | "");
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const handleExport = async () => {
    setExporting(true);
    try {
      const filters: Record<string, string | undefined> = {
        q: query || undefined,
        status: status || undefined,
      };
      const blob = await exportMembers(filters);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "members.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.push("Export ready");
    } catch (error) {
      console.error(error);
      toast.push("Failed to export members");
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setImporting(true);
    try {
      const report = await importMembers(file);
      toast.push(`Import complete — inserted ${report.inserted}, updated ${report.updated}, failed ${report.failed}`);
      setPage(1);
      load(1, query, status);
    } catch (error) {
      console.error(error);
      toast.push("Failed to import members");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Members</h1>
          <p className="text-sm text-mute">Browse and manage the SaliteOne parish directory.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canBulkManage && (
            <>
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? "Exporting…" : "Export CSV"}
              </Button>
              <Button variant="outline" onClick={handleImportClick} disabled={importing}>
                {importing ? "Importing…" : "Import CSV"}
              </Button>
            </>
          )}
          {canManage && (
            <Button onClick={() => navigate("/members/new")}>New Member</Button>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleImportChange}
      />

      <Card className="p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_200px_auto]">
          <Input
            placeholder="Search by name or username…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select value={status} onChange={(event) => handleStatusChange(event.target.value)}>
            <option value="">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Archived">Archived</option>
          </Select>
          <Button onClick={handleApply}>Apply</Button>
        </div>
      </Card>

      {loading && <div className="text-sm text-mute">Loading members…</div>}

      {!loading && data && data.items.length === 0 && (
        <Card className="p-6 text-sm text-mute">No members match your filters yet.</Card>
      )}

      <div className="grid gap-3">
        {(data?.items || []).map((member) => (
          <Card key={member.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{member.first_name} {member.last_name}</div>
              <div className="text-xs text-mute">{member.username}</div>
            </div>
            <div className="flex items-center gap-3">
              <Badge>{member.status}</Badge>
              <Button variant="ghost" onClick={() => navigate(`/members/${member.id}/edit`)}>Edit</Button>
            </div>
          </Card>
        ))}
      </div>

      {data && data.items.length > 0 && (
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              const next = Math.max(1, page - 1);
              setPage(next);
              load(next, query, status);
            }}
            disabled={page <= 1 || loading}
          >
            Previous
          </Button>
          <div className="text-sm">
            Page {data.page} of {totalPages} · {data.total} members
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              const next = Math.min(totalPages, page + 1);
              setPage(next);
              load(next, query, status);
            }}
            disabled={page >= totalPages || loading}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
