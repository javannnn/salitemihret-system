import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckSquare,
  Filter,
  Loader2,
  Search,
  Square,
  Trash2,
  UploadCloud,
  Download,
  ShieldAlert,
  MoreVertical,
  ChevronDown,
  LayoutGrid,
  List as ListIcon,
  UserPlus,
  Home,
} from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";

import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { ChromaGrid, ChromaGridItem } from "@/components/ui/ChromaGrid";
import {
  API_BASE,
  ApiError,
  ImportReport,
  Member,
  MemberDetail,
  MemberStatus,
  MembersMeta,
  Page,
  Priest,
  api,
  createPriest,
  exportMembers,
  getMembersMeta,
  archiveMember,
  searchMembers,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import ImportWizard from "./ImportWizard";
import HouseholdAssignDrawer, { HouseholdTarget } from "./components/HouseholdAssignDrawer";
import PriestDirectoryModal from "./components/PriestDirectoryModal";
import SpouseDrawer, { SpouseDraft } from "./components/SpouseDrawer";
import { usePermissions } from "@/hooks/usePermissions";
import { useMediaQuery } from "@/hooks/useMediaQuery";

type Filters = {
  status: MemberStatus | "";
  gender: string;
  tag: string;
  ministry: string;
  district: string;
  hasChildren: boolean;
  missingPhone: boolean;
  newThisMonth: boolean;
};

const PAGE_SIZE = 15;

const SORT_OPTIONS = [
  { label: "Last updated (newest)", value: "-updated_at" },
  { label: "Recently created", value: "-created_at" },
  { label: "Name (A → Z)", value: "first_name" },
  { label: "Name (Z → A)", value: "-first_name" },
  { label: "Surname (A → Z)", value: "last_name" },
  { label: "Surname (Z → A)", value: "-last_name" },
];

const INITIAL_FILTERS: Filters = {
  status: "",
  gender: "",
  tag: "",
  ministry: "",
  district: "",
  hasChildren: false,
  missingPhone: false,
  newThisMonth: false,
};

function avatarUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const normalized = path.startsWith("/static/")
    ? path
    : `/static/${path.replace(/^\/+/, "")}`;
  return `${API_BASE}${normalized}`;
}

function formatContributionException(reason?: string | null) {
  if (!reason) return null;
  switch (reason) {
    case "LowIncome":
      return "Low income";
    case "Senior":
      return "Senior";
    case "Student":
      return "Student";
    default:
      return reason;
  }
}

export default function MembersList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const { user, token } = useAuth();
  const permissions = usePermissions();
  const isMobile = useMediaQuery("(max-width: 1023px)");

  const canManage = permissions.editCore || permissions.editFinance || permissions.editSpiritual;
  const canCreate = permissions.createMembers;
  const canBulk = permissions.bulkActions;
  const canImport = permissions.importMembers;
  const canExport = permissions.exportMembers;

  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [priestSearch, setPriestSearch] = useState("");
  const [priests, setPriests] = useState<Priest[]>([]);
  const filteredPriests = useMemo(() => {
    if (!priestSearch) return priests;
    const queryLower = priestSearch.toLowerCase();
    return priests.filter((priest) => priest.full_name.toLowerCase().includes(queryLower));
  }, [priests, priestSearch]);
  const syncMeta = useCallback((next: MembersMeta) => {
    setMeta(next);
    setPriests(next.father_confessors.slice().sort((a, b) => a.full_name.localeCompare(b.full_name)));
  }, []);
  const refreshMeta = useCallback(async () => {
    const next = await getMembersMeta();
    syncMeta(next);
  }, [syncMeta]);

  const [meta, setMeta] = useState<MembersMeta | null>(null);
  const [data, setData] = useState<Page<Member> | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);


  const handleArchive = async (id: number) => {
    try {
      await archiveMember(id);
      toast.push("Member archived");
      loadMembers(page);
    } catch (error) {
      console.error(error);
      toast.push("Failed to archive member");
    }
  };

  const handleSelect = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };
  const [accessIssue, setAccessIssue] = useState<{ status: number; message: string } | null>(null);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [draftFilters, setDraftFilters] = useState<Filters>(INITIAL_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("-updated_at");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignContext, setAssignContext] = useState<{ mode: "single"; memberId: number; memberName: string } | { mode: "bulk" } | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [selectedPriestId, setSelectedPriestId] = useState<number | "">("");
  const [newPriestOpen, setNewPriestOpen] = useState(false);
  const [newPriest, setNewPriest] = useState({ fullName: "", phone: "", email: "" });
  const [creatingPriest, setCreatingPriest] = useState(false);
  const [autoOpenedPriest, setAutoOpenedPriest] = useState(false);
  const [householdDrawerOpen, setHouseholdDrawerOpen] = useState(false);
  const [householdTargets, setHouseholdTargets] = useState<HouseholdTarget[]>([]);
  const [householdMode, setHouseholdMode] = useState<"bulk" | "single">("bulk");
  const [priestDirectoryOpen, setPriestDirectoryOpen] = useState(false);
  const [spouseDrawerOpen, setSpouseDrawerOpen] = useState(false);
  const [spouseMember, setSpouseMember] = useState<{ id: number | null; name: string }>({ id: null, name: "" });
  const spouseDraftsRef = useRef<Map<number, SpouseDraft>>(new Map());
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("members-view-mode");
      return (saved === "grid" || saved === "list") ? saved : "list";
    }
    return "list";
  });

  useEffect(() => {
    sessionStorage.setItem("members-view-mode", viewMode);
  }, [viewMode]);

  const syncSearchParams = useCallback(
    ({ query: nextQuery, filters: nextFilters, sort: nextSort, page: nextPage }: {
      query: string;
      filters: Filters;
      sort: string;
      page: number;
    }) => {
      const params = new URLSearchParams();
      if (nextQuery) params.set("q", nextQuery);
      if (nextFilters.status) params.set("status", nextFilters.status);
      if (nextFilters.gender) params.set("gender", nextFilters.gender);
      if (nextFilters.tag) params.set("tag", nextFilters.tag);
      if (nextFilters.ministry) params.set("ministry", nextFilters.ministry);
      if (nextFilters.district) params.set("district", nextFilters.district);
      if (nextFilters.hasChildren) params.set("has_children", "true");
      if (nextFilters.missingPhone) params.set("missing_phone", "true");
      if (nextFilters.newThisMonth) params.set("new_this_month", "true");
      if (nextSort && nextSort !== "-updated_at") params.set("sort", nextSort);
      if (nextPage > 1) params.set("page", String(nextPage));
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  const selectedArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const selectedMembersList = useMemo(() => {
    if (!data) return [];
    return data.items
      .filter((member) => selectedIds.has(member.id))
      .map((member) => ({ id: member.id, name: `${member.first_name} ${member.last_name}` }));
  }, [data, selectedIds]);
  const currentSpouseDraft = spouseMember.id ? spouseDraftsRef.current.get(spouseMember.id) ?? null : null;
  const anySelected = selectedArray.length > 0;
  useEffect(() => {
    if (!canBulk && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [canBulk, selectedIds]);


  const loadMembers = useCallback(
    async (
      nextPage = 1,
      overrides?: Partial<{ query: string; filters: Filters; sort: string }>
    ) => {
      if (!token) {
        setLoading(false);
        return;
      }
      if (!permissions.viewMembers) {
        setAccessIssue({
          status: 403,
          message: "Your role does not have access to the member directory.",
        });
        setLoading(false);
        setData(null);
        return;
      }
      const nextFilters = overrides?.filters ?? filters;
      const nextQuery = overrides?.query ?? query;
      const nextSort = overrides?.sort ?? sort;
      if (overrides?.filters) {
        setFilters(overrides.filters);
        setDraftFilters(overrides.filters);
      }
      if (overrides?.query !== undefined) {
        setQuery(overrides.query);
      }
      if (overrides?.sort !== undefined) {
        setSort(overrides.sort);
      }
      if (nextPage !== page) {
        setPage(nextPage);
      }
      setLoading(true);
      setAccessIssue(null);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          page_size: String(PAGE_SIZE),
        });
        if (nextQuery) params.set("q", nextQuery);
        if (nextFilters.status) params.set("status", nextFilters.status);
        if (nextFilters.gender) params.set("gender", nextFilters.gender);
        if (nextFilters.tag) params.set("tag", nextFilters.tag);
        if (nextFilters.ministry) params.set("ministry", nextFilters.ministry);
        if (nextFilters.district) params.set("district", nextFilters.district);
        if (nextFilters.hasChildren) params.set("has_children", "true");
        if (nextFilters.missingPhone) params.set("missing_phone", "true");
        if (nextFilters.newThisMonth) params.set("new_this_month", "true");
        if (nextSort) params.set("sort", nextSort);

        const result = await api<Page<Member>>(`/members?${params.toString()}`);
        setData(result);
        setRowMenu(null);
        setActionsMenuOpen(false);
        setSelectedIds((prev) => {
          const keep = new Set<number>();
          result.items.forEach((item) => {
            if (prev.has(item.id)) keep.add(item.id);
          });
          return keep;
        });
        syncSearchParams({ query: nextQuery, filters: nextFilters, sort: nextSort, page: nextPage });
      } catch (error) {
        console.error(error);
        if (error instanceof ApiError) {
          if (error.status === 401) {
            setAccessIssue({ status: 401, message: "Your session expired. Please sign in again." });
            setData(null);
            return;
          }
          if (error.status === 403) {
            setAccessIssue({
              status: 403,
              message: "You do not have permission to view members for this parish.",
            });
            setData(null);
            return;
          }
        }
        toast.push("Failed to load members");
      } finally {
        setLoading(false);
      }
    },
    [filters, permissions.viewMembers, query, sort, token, toast, page, syncSearchParams]
  );

  const activeFilters = useMemo(() => {
    const items: { key: keyof Filters; label: string }[] = [];
    if (filters.status) {
      items.push({ key: "status", label: `Status: ${filters.status}` });
    }
    if (filters.gender) {
      items.push({ key: "gender", label: `Gender: ${filters.gender}` });
    }
    if (filters.district) {
      items.push({ key: "district", label: `District: ${filters.district}` });
    }
    if (filters.tag) {
      const tag = meta?.tags.find((item) => item.slug === filters.tag);
      items.push({ key: "tag", label: `Tag: ${tag?.name ?? filters.tag}` });
    }
    if (filters.ministry) {
      const ministry = meta?.ministries.find((item) => item.slug === filters.ministry);
      items.push({ key: "ministry", label: `Ministry: ${ministry?.name ?? filters.ministry}` });
    }
    if (filters.hasChildren) {
      items.push({ key: "hasChildren", label: "Has children" });
    }
    if (filters.missingPhone) {
      items.push({ key: "missingPhone", label: "Missing phone" });
    }
    if (filters.newThisMonth) {
      items.push({ key: "newThisMonth", label: "New this month" });
    }
    return items;
  }, [filters, meta]);

  const clearFilter = (key: keyof Filters) => {
    const next: Filters = { ...filters, [key]: INITIAL_FILTERS[key] } as Filters;
    setFilters(next);
    setDraftFilters(next);
    setPage(1);
    loadMembers(1, { filters: next });
  };

  const clearAllFilters = useCallback(() => {
    const reset: Filters = { ...INITIAL_FILTERS };
    setFilters(reset);
    setDraftFilters(reset);
    setPage(1);
    loadMembers(1, { filters: reset });
  }, [loadMembers]);

  useEffect(() => {
    if (!user || !token || !permissions.viewMembers) {
      return;
    }
    let cancelled = false;
    getMembersMeta()
      .then((next) => {
        if (!cancelled) {
          syncMeta(next);
        }
      })
      .catch((error) => {
        console.error(error);
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return;
        }
        toast.push("Failed to load filters");
      });
    return () => {
      cancelled = true;
    };
  }, [user, token, permissions.viewMembers, toast, syncMeta]);

  useEffect(() => {
    if (!user || !token || initialized) {
      return;
    }
    if (!permissions.viewMembers) {
      setLoading(false);
      setData(null);
      setInitialized(true);
      return;
    }
    const initialQuery = searchParams.get("q") ?? "";
    const initialSort = searchParams.get("sort") ?? "-updated_at";
    const initialPage = Number(searchParams.get("page")) || 1;
    const initialFilters: Filters = {
      ...INITIAL_FILTERS,
      status: (searchParams.get("status") as MemberStatus | null) ?? "",
      gender: searchParams.get("gender") ?? "",
      tag: searchParams.get("tag") ?? "",
      ministry: searchParams.get("ministry") ?? "",
      district: searchParams.get("district") ?? "",
      hasChildren: searchParams.get("has_children") === "true",
      missingPhone: searchParams.get("missing_phone") === "true",
      newThisMonth: searchParams.get("new_this_month") === "true",
    };
    setFilters(initialFilters);
    setDraftFilters(initialFilters);
    setQuery(initialQuery);
    setSort(initialSort);
    setPage(initialPage);
    setInitialized(true);
    loadMembers(initialPage, {
      query: initialQuery,
      filters: initialFilters,
      sort: initialSort,
    });
  }, [user, token, permissions.viewMembers, initialized, searchParams, loadMembers]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    loadMembers(1, { query });
  };

  const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextSort = event.target.value;
    setPage(1);
    loadMembers(1, { sort: nextSort });
  };

  const toggleSelect = (id: number) => {
    if (!canBulk) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!canBulk || !data) return;
    if (!data) return;
    if (selectedIds.size === data.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.items.map((item) => item.id)));
    }
  };

  const handleBulkArchive = async () => {
    if (!canBulk || !anySelected) return;
    const confirmed = window.confirm(
      `Archive ${selectedArray.length} selected member${selectedArray.length === 1 ? "" : "s"}?`
    );
    if (!confirmed) return;
    setBulkWorking(true);
    try {
      await Promise.all(
        selectedArray.map((id) => api(`/members/${id}`, { method: "DELETE" }))
      );
      toast.push("Selected members archived");
      setSelectedIds(new Set());
      loadMembers(page);
    } catch (error) {
      console.error(error);
      toast.push("Archiving failed");
    } finally {
      setBulkWorking(false);
    }
  };

  const downloadCsv = async (
    params: Record<string, string | number | undefined | null>,
    filename = "members.csv"
  ) => {
    const blob = await exportMembers(params);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (!canExport) {
      return;
    }
    setExporting(true);
    try {
      await downloadCsv({
        q: query || undefined,
        status: filters.status || undefined,
        gender: filters.gender || undefined,
        tag: filters.tag || undefined,
        ministry: filters.ministry || undefined,
        district: filters.district || undefined,
        has_children: filters.hasChildren ? "true" : undefined,
        missing_phone: filters.missingPhone ? "true" : undefined,
        new_this_month: filters.newThisMonth ? "true" : undefined,
        sort,
      });
      toast.push("Export ready");
    } catch (error) {
      console.error(error);
      toast.push("Failed to export members");
    } finally {
      setExporting(false);
    }
  };

  const handleImportComplete = (report: ImportReport) => {
    toast.push(
      `Import complete — inserted ${report.inserted}, updated ${report.updated}, failed ${report.failed}`
    );
    setWizardOpen(false);
    setSelectedIds(new Set());
    loadMembers(1);
  };

  const handleArchiveSingle = async (memberId: number) => {
    if (!canManage) {
      toast.push("You do not have permission to archive members.");
      return;
    }
    const confirmed = window.confirm("Archive this member? You can find archived records via the Archived quick filter.");
    if (!confirmed) {
      return;
    }
    setRowMenu(null);
    try {
      await api(`/members/${memberId}`, { method: "DELETE" });
      toast.push("Member archived");
      loadMembers(page);
    } catch (error) {
      console.error(error);
      toast.push("Failed to archive member");
    }
  };

  const handleExportSingle = async (member: Member) => {
    if (!canExport) {
      toast.push("You do not have permission to export members.");
      return;
    }
    setRowMenu(null);
    try {
      await downloadCsv({ ids: String(member.id) }, `${member.username}.csv`);
      toast.push(`Exported ${member.first_name}`);
    } catch (error) {
      console.error(error);
      toast.push("Failed to export member");
    }
  };

  const openAssignModalForMember = async (member: Member) => {
    if (!permissions.editSpiritual) {
      toast.push("You do not have permission to assign father confessors.");
      return;
    }
    setRowMenu(null);
    setAssignError("");
    setPriestSearch("");
    setNewPriestOpen(false);
    setAssignContext({ mode: "single", memberId: member.id, memberName: `${member.first_name} ${member.last_name}` });
    setAssignModalOpen(true);
    setAssignLoading(true);
    setSelectedPriestId("");
    try {
      const detail = await api<MemberDetail>(`/members/${member.id}`);
      setSelectedPriestId(detail.father_confessor?.id ?? "");
    } catch (error) {
      console.error(error);
      toast.push("Failed to load member details");
    } finally {
      setAssignLoading(false);
    }
  };

  const handleBulkAssignFatherConfessor = () => {
    if (!canBulk || !anySelected) {
      toast.push("Select members first");
      return;
    }
    if (!permissions.editSpiritual) {
      toast.push("You do not have permission to assign father confessors.");
      return;
    }
    setRowMenu(null);
    setAssignError("");
    setPriestSearch("");
    setNewPriestOpen(false);
    setAssignContext({ mode: "bulk" });
    setAssignModalOpen(true);
    setAssignLoading(false);
    setSelectedPriestId("");
  };

  const openHouseholdDrawerForTargets = (targets: HouseholdTarget[], mode: "bulk" | "single") => {
    if (!targets.length) {
      toast.push("Select members first");
      return;
    }
    setHouseholdTargets(targets);
    setHouseholdMode(mode);
    setHouseholdDrawerOpen(true);
  };

  const handleBulkSetHousehold = () => {
    if (!canBulk || !anySelected) {
      toast.push("Select members first");
      return;
    }
    const fallbackTargets = selectedArray.map((id) => ({ id, name: `Member #${id}` }));
    const targets = selectedMembersList.length ? selectedMembersList : fallbackTargets;
    openHouseholdDrawerForTargets(targets, "bulk");
  };

  const handleOpenHouseholdForMember = (member: Member) => {
    openHouseholdDrawerForTargets([{ id: member.id, name: `${member.first_name} ${member.last_name}` }], "single");
  };

  const handleHouseholdAssigned = () => {
    loadMembers(page);
    refreshMeta().catch((error) => {
      console.error(error);
    });
  };

  const handleOpenSpouseDrawer = (member: Member) => {
    setSpouseMember({ id: member.id, name: `${member.first_name} ${member.last_name}` });
    setSpouseDrawerOpen(true);
  };

  const persistSpouseDraft = (memberId: number, draft: SpouseDraft) => {
    spouseDraftsRef.current.set(memberId, draft);
  };

  const clearSpouseDraft = (memberId: number) => {
    spouseDraftsRef.current.delete(memberId);
  };

  const handleSpouseSaved = () => {
    loadMembers(page);
  };

  const handlePriestDirectoryUpdate = (next: Priest[]) => {
    setPriests(next);
    setMeta((prev) => (prev ? { ...prev, father_confessors: next } : prev));
  };

  const handleBulkExportSelected = async () => {
    if (!canBulk || !anySelected) {
      toast.push("Select members first");
      return;
    }
    if (!canExport) {
      toast.push("You do not have permission to export members.");
      return;
    }
    try {
      await downloadCsv({ ids: selectedArray.join(",") }, "members-selected.csv");
      toast.push("Export ready");
    } catch (error) {
      console.error(error);
      toast.push("Failed to export selection");
    }
  };

  const handleRowClick = (memberId: number) => {
    navigate(`/members/${memberId}/edit`);
  };

  const closeAssignModal = () => {
    setAssignModalOpen(false);
    setAssignContext(null);
    setAssignError("");
    setSelectedPriestId("");
    setPriestSearch("");
    setNewPriestOpen(false);
    setNewPriest({ fullName: "", phone: "", email: "" });
    setCreatingPriest(false);
    setAssignLoading(false);
    setAutoOpenedPriest(false);
  };

  const handleAssignSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignContext) return;
    if (!permissions.editSpiritual) {
      toast.push("You do not have permission to assign father confessors.");
      return;
    }
    const payload =
      selectedPriestId === ""
        ? { father_confessor_id: null, has_father_confessor: false }
        : { father_confessor_id: Number(selectedPriestId), has_father_confessor: true };
    setAssignLoading(true);
    try {
      if (assignContext.mode === "single") {
        await api(`/members/${assignContext.memberId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.push("Father confessor updated");
      } else {
        await Promise.all(
          selectedArray.map((id) =>
            api(`/members/${id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          )
        );
        toast.push("Father confessor updated for selected members");
      }
      closeAssignModal();
      loadMembers(page);
    } catch (error) {
      console.error(error);
      toast.push("Failed to update father confessor");
    } finally {
      setAssignLoading(false);
    }
  };

  const handleCreatePriest = async () => {
    if (!newPriest.fullName.trim()) {
      setAssignError("Full name is required");
      return;
    }
    setAssignError("");
    setCreatingPriest(true);
    try {
      const created = await createPriest({
        full_name: newPriest.fullName.trim(),
        phone: newPriest.phone || undefined,
        email: newPriest.email || undefined,
      });
      setPriests((prev) =>
        [...prev.filter((option) => option.id !== created.id), created].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        )
      );
      setMeta((prev) =>
        prev
          ? {
            ...prev,
            father_confessors: [
              ...prev.father_confessors.filter((option) => option.id !== created.id),
              created,
            ].sort((a, b) => a.full_name.localeCompare(b.full_name)),
          }
          : prev
      );
      setSelectedPriestId(created.id);
      setNewPriest({ fullName: "", phone: "", email: "" });
      setNewPriestOpen(false);
      toast.push("Father confessor created");
    } catch (error) {
      console.error(error);
      toast.push("Failed to create father confessor");
    } finally {
      setCreatingPriest(false);
    }
  };

  useEffect(() => {
    setRowMenu(null);
    setActionsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (event: MouseEvent | PointerEvent) => {
      if (!actionsMenuOpen) return;
      const target = event.target as Node;
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(target)) {
        setActionsMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [actionsMenuOpen]);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActionsMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [actionsMenuOpen]);

  useEffect(() => {
    if (!assignModalOpen) {
      setAutoOpenedPriest(false);
      return;
    }
    if (
      permissions.editSpiritual &&
      priestSearch.trim() &&
      filteredPriests.length === 0 &&
      !newPriestOpen &&
      !autoOpenedPriest
    ) {
      setNewPriest({ fullName: priestSearch.trim(), phone: "", email: "" });
      setNewPriestOpen(true);
      setAutoOpenedPriest(true);
    } else if (filteredPriests.length > 0 && autoOpenedPriest) {
      setAutoOpenedPriest(false);
    }
  }, [
    assignModalOpen,
    permissions.editSpiritual,
    priestSearch,
    filteredPriests.length,
    newPriestOpen,
    autoOpenedPriest,
  ]);
  const rows = data?.items ?? [];

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
            <p className="text-sm text-mute">
              Search, filter, and manage the SaliteMihret member directory.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(canExport || canImport) && (
              <div className="relative" ref={actionsMenuRef}>
                <Button
                  variant="ghost"
                  aria-haspopup="menu"
                  aria-expanded={actionsMenuOpen}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActionsMenuOpen((prev) => !prev);
                  }}
                >
                  Actions
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${actionsMenuOpen ? "rotate-180" : ""}`}
                  />
                </Button>
                <AnimatePresence>
                  {actionsMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 mt-2 w-48 space-y-1 rounded-xl border border-border bg-card shadow-lg z-30 p-2"
                      role="menu"
                    >
                      {canExport && (
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 text-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            setActionsMenuOpen(false);
                            handleExport();
                          }}
                          disabled={exporting}
                        >
                          <span className="inline-flex items-center gap-2">
                            {exporting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                            Export CSV
                          </span>
                        </button>
                      )}
                      {canImport && (
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 text-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            setActionsMenuOpen(false);
                            setWizardOpen(true);
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <UploadCloud className="h-4 w-4" />
                            Import CSV
                          </span>
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            {canCreate && (
              <Button data-tour="member-create" onClick={() => navigate("/members/new")} className="h-12 rounded-full px-6">
                Create member
              </Button>
            )}
          </div>
        </div>

        <Card className="p-4 space-y-4">
          <form
            className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center"
            onSubmit={handleSearch}
          >
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                data-tour="members-search"
                className="pl-9"
                placeholder="Search by name, username, email, or phone…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Select value={sort} onChange={handleSortChange} className="w-full sm:w-56">
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button type="submit" className="flex-1 sm:flex-none">Search</Button>
              <Button
                type="button"
                variant="ghost"
                data-tour="members-filters"
                className="flex-1 sm:flex-none"
                onClick={() => {
                  setDraftFilters(filters);
                  setFilterOpen(true);
                }}
              >
                <Filter className="h-4 w-4" />
                Filters
                {activeFilters.length > 0 && (
                  <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-accent-foreground">
                    {activeFilters.length}
                  </span>
                )}
              </Button>
            </div>
          </form>
        </Card>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className={`flex items-center gap-2 ${isMobile ? "overflow-x-auto -mx-1 px-1 pb-1" : "flex-wrap"}`}>
            <Button
              variant={filters.status === "Archived" ? "solid" : "ghost"}
              className="whitespace-nowrap"
              onClick={() => {
                const isArchived = filters.status === "Archived";
                const next: Filters = {
                  ...filters,
                  status: isArchived ? "" : "Archived",
                  hasChildren: isArchived ? filters.hasChildren : false,
                  missingPhone: isArchived ? filters.missingPhone : false,
                  newThisMonth: isArchived ? filters.newThisMonth : false,
                };
                setFilters(next);
                setDraftFilters(next);
                setPage(1);
                loadMembers(1, { filters: next });
              }}
            >
              Archived
            </Button>
            <Button
              variant={filters.status === "Active" ? "solid" : "ghost"}
              className="whitespace-nowrap"
              onClick={() => {
                const next: Filters = { ...filters, status: filters.status === "Active" ? "" : "Active" };
                setFilters(next);
                setDraftFilters(next);
                setPage(1);
                loadMembers(1, { filters: next });
              }}
            >
              Active
            </Button>
            <Button
              variant={filters.hasChildren ? "solid" : "ghost"}
              className="whitespace-nowrap"
              onClick={() => {
                const next: Filters = { ...filters, hasChildren: !filters.hasChildren };
                setFilters(next);
                setDraftFilters(next);
                setPage(1);
                loadMembers(1, { filters: next });
              }}
            >
              Has children
            </Button>
            <Button
              variant={filters.missingPhone ? "solid" : "ghost"}
              className="whitespace-nowrap"
              onClick={() => {
                const next: Filters = { ...filters, missingPhone: !filters.missingPhone };
                setFilters(next);
                setDraftFilters(next);
                setPage(1);
                loadMembers(1, { filters: next });
              }}
            >
              Missing phone
            </Button>
            <Button
              variant={filters.newThisMonth ? "solid" : "ghost"}
              className="whitespace-nowrap"
              onClick={() => {
                const next: Filters = { ...filters, newThisMonth: !filters.newThisMonth };
                setFilters(next);
                setDraftFilters(next);
                setPage(1);
                loadMembers(1, { filters: next });
              }}
            >
              New this month
            </Button>
          </div>
          <div className="flex items-center border rounded-lg overflow-hidden self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-2 ${viewMode === "list" ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"}`}
              title="List view"
            >
              <ListIcon className="h-4 w-4" />
            </button>
            <div className="w-px h-4 bg-border" />
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-2 ${viewMode === "grid" ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"}`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <Button
                key={filter.key}
                variant="soft"
                className="text-xs"
                onClick={() => clearFilter(filter.key)}
              >
                {filter.label}
                <span className="ml-1">×</span>
              </Button>
            ))}
            <Button variant="ghost" className="text-xs" onClick={clearAllFilters}>
              Clear all filters
            </Button>
          </div>
        )}

        {accessIssue ? (
          <Card className="p-5 border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Limited access</div>
              <div className="text-sm leading-relaxed">{accessIssue.message}</div>
            </div>
          </Card>
        ) : (
          <>
            {canBulk && anySelected && (
              <Card className="p-4 flex flex-wrap gap-4 items-center justify-between border border-accent/30 bg-accent/5">
                <div className="text-sm">
                  <strong>{selectedArray.length}</strong> member
                  {selectedArray.length === 1 ? "" : "s"} selected
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {permissions.editSpiritual && (
                    <Button
                      variant="soft"
                      disabled={bulkWorking}
                      onClick={handleBulkAssignFatherConfessor}
                    >
                      Assign father confessor
                    </Button>
                  )}
                  <Button
                    variant="soft"
                    disabled={bulkWorking}
                    onClick={handleBulkSetHousehold}
                  >
                    Set household
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={bulkWorking}
                    onClick={handleBulkExportSelected}
                  >
                    <Download className="h-4 w-4" />
                    Export selected
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-red-500 border-red-200 hover:bg-red-500/10"
                    disabled={bulkWorking}
                    onClick={handleBulkArchive}
                  >
                    <Trash2 className="h-4 w-4" />
                    Archive selected
                  </Button>
                </div>
              </Card>
            )}



            {viewMode === "grid" ? (
              <div className="min-h-[600px]">
                {loading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-mute" />
                  </div>
                ) : rows.length === 0 ? (
                  <div className="p-6 text-sm text-mute text-center bg-card rounded-xl border border-border">
                    No members match your filters yet.
                  </div>
                ) : (
                  <ChromaGrid
                    className={isMobile ? "!gap-3" : ""}
                    radius={isMobile ? 180 : 300}
                    columns={isMobile ? 1 : 3}
                    rows={isMobile ? 3 : 2}
                    damping={isMobile ? 0.35 : 0.45}
                    fadeOut={isMobile ? 0.4 : 0.6}
                    items={rows.map((member) => {
                      const statusColor =
                        member.status === "Active"
                          ? "#10B981"
                          : member.status === "Archived"
                            ? "#EF4444"
                            : "#F59E0B";

                      let age: number | string = "";
                      if (member.birth_date) {
                        const birthDate = new Date(member.birth_date);
                        const today = new Date();
                        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
                        const m = today.getMonth() - birthDate.getMonth();
                        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                          calculatedAge--;
                        }
                        age = calculatedAge;
                      }

                      const isSelected = selectedIds.has(member.id);

                      const actions = [
                        {
                          label: "Assign Father Confessor",
                          icon: <UserPlus className="h-4 w-4" />,
                          onClick: () => {
                            setAssignContext({
                              mode: "single",
                              memberId: member.id,
                              memberName: `${member.first_name} ${member.last_name}`
                            });
                            setAssignModalOpen(true);
                          }
                        },
                        {
                          label: "Set Household",
                          icon: <Home className="h-4 w-4" />,
                          onClick: () => {
                            setHouseholdTargets([{
                              id: member.id,
                              name: `${member.first_name} ${member.last_name}`
                            }]);
                            setHouseholdMode("single");
                            setHouseholdDrawerOpen(true);
                          }
                        },
                        {
                          label: "Export",
                          icon: <Download className="h-4 w-4" />,
                          onClick: async () => {
                            try {
                              await downloadCsv({ ids: String(member.id) }, `member-${member.id}.csv`);
                              toast.push("Export ready");
                            } catch (error) {
                              console.error(error);
                              toast.push("Failed to export member");
                            }
                          }
                        },
                        {
                          label: "Archive",
                          icon: <Trash2 className="h-4 w-4 text-red-500" />,
                          onClick: () => {
                            if (window.confirm(`Are you sure you want to archive ${member.first_name}?`)) {
                              handleArchive(member.id);
                            }
                          }
                        }
                      ];

                      return {
                        image: avatarUrl(member.avatar_path) || `https://ui-avatars.com/api/?name=${member.first_name}+${member.last_name}&background=random`,
                        title: `${member.first_name} ${member.last_name}`,
                        subtitle: member.username,
                        handle: member.username,
                        borderColor: statusColor,
                        gradient: `linear-gradient(145deg, ${statusColor}, #000)`,
                        url: `/members/${member.id}/edit`,
                        location: member.district || undefined,
                        id: member.id,
                        age: age,
                        email: member.email || undefined,
                        status: member.status,
                        selected: isSelected,
                        actions: actions
                      };
                    })}
                    onItemClick={(item) => {
                      if (item._isSelectionToggle) {
                        handleSelect(item.id);
                      } else {
                        handleRowClick(item.id);
                      }
                    }}
                  />
                )}
              </div>
            ) : (
              <Card className="relative overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[960px] text-sm">
                  <thead className="bg-card/80 text-xs uppercase tracking-wide text-mute border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left w-12">
                        {canBulk && rows.length > 0 && (
                          <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="text-accent"
                          >
                            {selectedIds.size === rows.length ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </th>
                      <th className="px-4 py-3 text-left">Member</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Family</th>
                      <th className="px-4 py-3 text-left">Giving</th>
                      <th className="px-4 py-3 text-left">Contact</th>
                      <th className="px-4 py-3 text-left">Location</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading &&
                      Array.from({ length: 6 }).map((_, index) => (
                        <tr key={`skeleton-${index}`} className="border-b border-border/60">
                          <td className="px-4 py-4">
                            <div className="h-4 w-4 rounded bg-border animate-pulse" />
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-border animate-pulse" />
                              <div className="space-y-2">
                                <div className="h-3 w-32 rounded bg-border animate-pulse" />
                                <div className="h-3 w-20 rounded bg-border animate-pulse" />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="h-4 w-16 rounded bg-border animate-pulse" />
                          </td>
                          <td className="px-4 py-4">
                            <div className="h-4 w-16 rounded bg-border animate-pulse" />
                          </td>
                          <td className="px-4 py-4">
                            <div className="h-4 w-20 rounded bg-border animate-pulse" />
                          </td>
                          <td className="px-4 py-4">
                            <div className="h-3 w-28 rounded bg-border animate-pulse" />
                          </td>
                          <td className="px-4 py-4">
                            <div className="h-3 w-24 rounded bg-border animate-pulse" />
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="h-8 w-20 rounded bg-border animate-pulse" />
                          </td>
                        </tr>
                      ))}

                    {!loading &&
                      rows.map((member) => {
                        const selected = selectedIds.has(member.id);
                        const url = avatarUrl(member.avatar_path);
                        return (
                          <tr
                            key={member.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleRowClick(member.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleRowClick(member.id);
                              }
                            }}
                            className={`border-b border-border/60 last:border-none transition cursor-pointer hover:bg-accent/5 ${selected ? "bg-accent/10" : ""}`}
                          >
                            <td className="px-4 py-3">
                              {canBulk && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleSelect(member.id);
                                  }}
                                  className="text-accent"
                                >
                                  {selected ? (
                                    <CheckSquare className="h-4 w-4" />
                                  ) : (
                                    <Square className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-border overflow-hidden">
                                  {url ? (
                                    <img
                                      src={url}
                                      alt={`${member.first_name} ${member.last_name}`}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-xs text-mute">
                                      {member.first_name.charAt(0)}
                                      {member.last_name.charAt(0)}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div className="font-medium">
                                    {member.first_name}{" "}
                                    {member.middle_name ? `${member.middle_name} ` : ""}
                                    {member.last_name}
                                  </div>
                                  <div className="text-xs text-mute">{member.username}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="flex flex-col gap-1">
                                <Badge className="normal-case w-fit">{member.status}</Badge>
                                {member.marital_status && (
                                  <span className="text-xs text-mute">
                                    {member.marital_status}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm text-mute align-top">
                              <div className="font-medium">{member.family_count}</div>
                              {member.household_size_override && (
                                <div className="text-xs text-mute/70">
                                  Override: {member.household_size_override}
                                </div>
                              )}
                              <div className="text-xs uppercase tracking-wide text-mute/70">
                                {member.has_father_confessor ? "Father Confessor assigned" : "No Father Confessor"}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm text-mute align-top">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${member.is_tither ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-border text-mute"}`}
                                >
                                  Tithe {member.is_tither ? "Yes" : "No"}
                                </span>
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${member.pays_contribution ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300" : "bg-border text-mute"}`}
                                >
                                  Contribution {member.pays_contribution ? "Yes" : "No"}
                                </span>
                              </div>
                              {(member.contribution_method || member.contribution_amount !== undefined) && (
                                <div className="text-xs text-mute mt-1 flex items-center gap-1">
                                  <span>{member.contribution_method ?? "—"}</span>
                                  <span>
                                    · {member.contribution_currency} {member.contribution_amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  {formatContributionException(member.contribution_exception_reason) && (
                                    <span className="text-amber-600">· {formatContributionException(member.contribution_exception_reason)} exception</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm text-mute space-y-1 align-top">
                              {member.email && <div>{member.email}</div>}
                              <div>{member.phone}</div>
                            </td>
                            <td className="px-4 py-4 text-sm text-mute align-top">
                              {member.district || "—"}
                              {(member.address_city || member.address_region) && (
                                <div className="text-xs text-mute/70">
                                  {[member.address_city, member.address_region]
                                    .filter(Boolean)
                                    .join(", ")}
                                </div>
                              )}
                              {member.gender && (
                                <div className="text-xs uppercase tracking-wide text-mute/70">
                                  {member.gender}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-right align-top relative">
                              <div className="flex justify-end">
                                <Button
                                  data-tour="members-row-menu"
                                  variant="ghost"
                                  className="p-2"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRowMenu((prev) => (prev === member.id ? null : member.id));
                                  }}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </div>
                              {rowMenu === member.id && (
                                <div
                                  className="absolute right-4 mt-2 w-48 p-2 space-y-1 rounded-xl border border-border bg-card shadow-lg z-40"
                                  onMouseLeave={() => setRowMenu(null)}
                                >
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 text-sm"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      event.preventDefault();
                                      setRowMenu(null);
                                      handleRowClick(member.id);
                                    }}
                                  >
                                    View profile
                                  </button>
                                  {permissions.editCore && (
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 text-sm"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        event.preventDefault();
                                        setRowMenu(null);
                                        handleOpenHouseholdForMember(member);
                                      }}
                                    >
                                      Manage household
                                    </button>
                                  )}
                                  {permissions.editCore && (
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 text-sm"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        event.preventDefault();
                                        setRowMenu(null);
                                        handleOpenSpouseDrawer(member);
                                      }}
                                    >
                                      Manage spouse
                                    </button>
                                  )}
                                  {permissions.editSpiritual && (
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 text-sm"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        event.preventDefault();
                                        openAssignModalForMember(member);
                                      }}
                                    >
                                      Assign father confessor
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 text-sm"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      event.preventDefault();
                                      handleExportSingle(member);
                                    }}
                                  >
                                    Export CSV
                                  </button>
                                  {canManage && (
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-500/10 text-sm text-red-600"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        event.preventDefault();
                                        handleArchiveSingle(member.id);
                                      }}
                                    >
                                      Archive member
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  </table>
                </div>

                {!loading && rows.length === 0 && (
                  <div className="p-6 text-sm text-mute text-center">
                    No members match your filters yet.
                  </div>
                )}
              </Card>
            )}

            {data && data.items.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="text-sm text-mute">
                  Page {data.page} of {totalPages} · {data.total.toLocaleString()} members
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => loadMembers(Math.max(1, page - 1))}
                    disabled={page <= 1 || loading}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => loadMembers(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages || loading}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div >

      <AnimatePresence>
        {filterOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFilterOpen(false)}
            />
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card shadow-soft border-l border-border z-50 p-6 overflow-y-auto"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Filters</h2>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraftFilters(filters);
                    setFilterOpen(false);
                  }}
                >
                  Close
                </Button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase text-mute block mb-2">
                    Status
                  </label>
                  <Select
                    value={draftFilters.status}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        status: event.target.value as MemberStatus | "",
                      }))
                    }
                  >
                    <option value="">All statuses</option>
                    {(meta?.statuses || ["Active", "Inactive", "Archived"]).map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="text-xs uppercase text-mute block mb-2">
                    Gender
                  </label>
                  <Select
                    value={draftFilters.gender}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        gender: event.target.value,
                      }))
                    }
                  >
                    <option value="">All genders</option>
                    {(meta?.genders || ["Male", "Female"]).map((gender) => (
                      <option key={gender} value={gender}>
                        {gender}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="text-xs uppercase text-mute block mb-2">
                    District
                  </label>
                  <Select
                    value={draftFilters.district}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        district: event.target.value,
                      }))
                    }
                  >
                    <option value="">All districts</option>
                    {(meta?.districts || []).map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="text-xs uppercase text-mute block mb-2">
                    Tag
                  </label>
                  <Select
                    value={draftFilters.tag}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        tag: event.target.value,
                      }))
                    }
                  >
                    <option value="">All tags</option>
                    {(meta?.tags || []).map((tag) => (
                      <option key={tag.id} value={tag.slug}>
                        {tag.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="text-xs uppercase text-mute block mb-2">
                    Ministry
                  </label>
                  <Select
                    value={draftFilters.ministry}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        ministry: event.target.value,
                      }))
                    }
                  >
                    <option value="">All ministries</option>
                    {(meta?.ministries || []).map((ministry) => (
                      <option key={ministry.id} value={ministry.slug}>
                        {ministry.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="mt-8 flex justify-between gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    clearAllFilters();
                    setFilterOpen(false);
                  }}
                >
                  Clear all
                </Button>
                <Button
                  onClick={() => {
                    setFilters(draftFilters);
                    loadMembers(1, { filters: draftFilters });
                    setFilterOpen(false);
                  }}
                >
                  Apply filters
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {
        assignModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
              onClick={() => closeAssignModal()}
            />
            <Card className="relative z-10 w-full max-w-lg p-6 space-y-5">
              <form onSubmit={handleAssignSubmit} className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Assign Father Confessor</h2>
                    <p className="text-sm text-mute">
                      {assignContext?.mode === "single"
                        ? assignContext.memberName
                        : `${selectedArray.length} members selected`}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" onClick={() => closeAssignModal()}>
                    Close
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase text-mute">Search</label>
                  <Input
                    placeholder="Search father confessors…"
                    value={priestSearch}
                    onChange={(event) => setPriestSearch(event.target.value)}
                    disabled={assignLoading || creatingPriest}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase text-mute">Father Confessor</label>
                  <Select
                    value={selectedPriestId === "" ? "" : String(selectedPriestId)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedPriestId(value ? Number(value) : "");
                      setAssignError("");
                    }}
                    disabled={assignLoading || creatingPriest}
                  >
                    <option value="">No assignment</option>
                    {filteredPriests.map((priest) => (
                      <option key={priest.id} value={priest.id}>
                        {priest.full_name}
                      </option>
                    ))}
                  </Select>
                  {!filteredPriests.length && (
                    <p className="text-xs text-mute">No father confessors match your search.</p>
                  )}
                </div>

                {newPriestOpen ? (
                  <div className="space-y-3 rounded-xl border border-border bg-card/70 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Create new father confessor</div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setNewPriestOpen(false)}
                        disabled={creatingPriest}
                      >
                        Cancel
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase text-mute">Full name</label>
                      <Input
                        value={newPriest.fullName}
                        onChange={(event) => setNewPriest((prev) => ({ ...prev, fullName: event.target.value }))}
                        disabled={creatingPriest}
                        placeholder="Abba Kidus"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs uppercase text-mute">Phone</label>
                        <Input
                          value={newPriest.phone}
                          onChange={(event) => setNewPriest((prev) => ({ ...prev, phone: event.target.value }))}
                          disabled={creatingPriest}
                          placeholder="Optional"
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute">Email</label>
                        <Input
                          value={newPriest.email}
                          onChange={(event) => setNewPriest((prev) => ({ ...prev, email: event.target.value }))}
                          disabled={creatingPriest}
                          placeholder="Optional"
                          type="email"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="soft"
                        onClick={handleCreatePriest}
                        disabled={creatingPriest}
                      >
                        {creatingPriest ? "Saving…" : "Save father confessor"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="soft"
                    onClick={() => {
                      setNewPriest({ fullName: priestSearch, phone: "", email: "" });
                      setNewPriestOpen(true);
                    }}
                    disabled={assignLoading || creatingPriest}
                  >
                    + Create new father confessor
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={() => setPriestDirectoryOpen(true)}>
                  Manage father confessors
                </Button>

                {assignError && <div className="text-sm text-red-600">{assignError}</div>}

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="ghost" onClick={() => closeAssignModal()}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={assignLoading || creatingPriest}>
                    {assignLoading ? "Saving…" : "Save"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )
      }

      <ImportWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={handleImportComplete}
      />
      <HouseholdAssignDrawer
        open={householdDrawerOpen}
        onClose={() => setHouseholdDrawerOpen(false)}
        targets={householdTargets}
        mode={householdMode}
        data-tour="household-drawer"
        onAssigned={handleHouseholdAssigned}
      />
      <SpouseDrawer
        open={spouseDrawerOpen}
        memberId={spouseMember.id}
        memberName={spouseMember.name}
        initialDraft={currentSpouseDraft}
        onPersistDraft={(memberId, draft) => persistSpouseDraft(memberId, draft)}
        onClearDraft={(memberId) => clearSpouseDraft(memberId)}
        onClose={() => setSpouseDrawerOpen(false)}
        data-tour="spouse-drawer"
        onSaved={handleSpouseSaved}
      />
      <PriestDirectoryModal
        open={priestDirectoryOpen}
        onClose={() => setPriestDirectoryOpen(false)}
        priests={priests}
        onUpdate={handlePriestDirectoryUpdate}
      />
    </>
  );
}
