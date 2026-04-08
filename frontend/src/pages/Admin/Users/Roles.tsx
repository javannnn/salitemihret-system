import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button, Card, Input, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { notifyAdminRolesUpdated } from "@/lib/adminRolesSync";
import {
  type AdminRoleSummary,
  type RoleFieldPermissionFlags,
  type RoleModuleCatalogEntry,
  type RolePermissionFlags,
  createAdminRole,
  deleteAdminRole,
  getRolePermissionCatalog,
  listAdminRoles,
  updateAdminRole,
} from "@/lib/api";

import {
  cn,
  formatRoleLabel,
  ToneBadge,
} from "./workspace";

type RoleDraft = {
  id?: number;
  name: string;
  description: string;
  is_system: boolean;
  module_permissions: Record<string, RolePermissionFlags>;
  field_permissions: Record<string, Record<string, RoleFieldPermissionFlags>>;
};

type CompanionAccessPreset = {
  module: string;
  label: string;
  description: string;
  read?: boolean;
  write?: boolean;
};

type ModuleWorkflowHint = {
  title: string;
  description: string;
  presets: CompanionAccessPreset[];
};

type ModuleFilter = "all" | "enabled" | "visible" | "hidden" | "fields";

const MODULE_WORKFLOW_HINTS: Record<string, ModuleWorkflowHint> = {
  sponsorships: {
    title: "Supporting access for full sponsorship work",
    description:
      "Sponsorship operators often need hidden access to supporting modules. These presets keep the workflow functioning without cluttering the main navigation.",
    presets: [
      {
        module: "members",
        label: "Members lookup",
        description: "Search sponsors and open linked member context from the wizard.",
        read: true,
      },
      {
        module: "payments",
        label: "Payment context",
        description: "Show sponsor contribution history in sponsorship reviews.",
        read: true,
      },
      {
        module: "newcomers",
        label: "Newcomer intake",
        description: "Search and create newcomers directly from sponsorship workflows.",
        read: true,
        write: true,
      },
    ],
  },
};

function getFieldPermissionDefaults(
  moduleKey: string,
  fieldKey: string,
  moduleFlags: Pick<RolePermissionFlags, "read" | "write">,
): RoleFieldPermissionFlags {
  if (moduleKey === "sponsorships" && fieldKey === "budget_rounds") {
    return { read: false, write: false };
  }
  return {
    read: Boolean(moduleFlags.read),
    write: Boolean(moduleFlags.write),
  };
}

function buildEmptyModulePermissions(
  catalog: RoleModuleCatalogEntry[],
): Record<string, RolePermissionFlags> {
  const output: Record<string, RolePermissionFlags> = {};
  catalog.forEach((module) => {
    output[module.key] = { read: false, write: false, visible: false };
  });
  return output;
}

function buildEmptyFieldPermissions(
  catalog: RoleModuleCatalogEntry[],
  modulePermissions: Record<string, RolePermissionFlags>,
): Record<string, Record<string, RoleFieldPermissionFlags>> {
  const output: Record<string, Record<string, RoleFieldPermissionFlags>> = {};
  catalog.forEach((module) => {
    if (!module.fields.length) {
      return;
    }
    output[module.key] = {};
    const moduleFlags = modulePermissions[module.key] || {
      read: false,
      write: false,
    };
    module.fields.forEach((field) => {
      output[module.key][field.key] = getFieldPermissionDefaults(
        module.key,
        field.key,
        moduleFlags,
      );
    });
  });
  return output;
}

function toDraft(role: AdminRoleSummary, catalog: RoleModuleCatalogEntry[]): RoleDraft {
  const modulePermissions = buildEmptyModulePermissions(catalog);

  Object.entries(role.module_permissions || {}).forEach(([moduleKey, flags]) => {
    if (!modulePermissions[moduleKey]) {
      return;
    }
    modulePermissions[moduleKey] = {
      read: Boolean(flags.read),
      write: Boolean(flags.write),
      visible: Boolean(flags.visible ?? flags.read ?? flags.write),
    };
  });

  const fieldPermissions = buildEmptyFieldPermissions(catalog, modulePermissions);
  Object.entries(role.field_permissions || {}).forEach(([moduleKey, fieldMap]) => {
    if (!fieldPermissions[moduleKey]) {
      return;
    }
    Object.entries(fieldMap).forEach(([fieldKey, flags]) => {
      if (!fieldPermissions[moduleKey][fieldKey]) {
        return;
      }
      fieldPermissions[moduleKey][fieldKey] = {
        read: Boolean(flags.read),
        write: Boolean(flags.write),
      };
    });
  });

  return {
    id: role.id,
    name: role.name,
    description: role.description || "",
    is_system: role.is_system,
    module_permissions: modulePermissions,
    field_permissions: fieldPermissions,
  };
}

export default function RolesManager() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.is_super_admin ?? false;

  const [roles, setRoles] = useState<AdminRoleSummary[]>([]);
  const [catalog, setCatalog] = useState<RoleModuleCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleQuery, setRoleQuery] = useState("");
  const [moduleQuery, setModuleQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("all");
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  const load = useCallback(
    async (preferredRoleId: number | "new" | null = null) => {
      setLoading(true);
      setError(null);
      try {
        const [rolesResponse, catalogResponse] = await Promise.all([
          listAdminRoles(),
          getRolePermissionCatalog(),
        ]);
        setRoles(rolesResponse.items);
        setCatalog(catalogResponse.modules);

        if (preferredRoleId === null && rolesResponse.items.length) {
          const firstRole = rolesResponse.items[0];
          setSelectedRoleId(firstRole.id);
          setDraft(toDraft(firstRole, catalogResponse.modules));
        } else if (preferredRoleId && preferredRoleId !== "new") {
          const found = rolesResponse.items.find((item) => item.id === preferredRoleId);
          if (found) {
            setSelectedRoleId(found.id);
            setDraft(toDraft(found, catalogResponse.modules));
          }
        }

        return { rolesResponse, catalogResponse };
      } catch (loadError) {
        console.error(loadError);
        setError("Unable to load roles and permission catalog.");
        return {
          rolesResponse: { items: [] as AdminRoleSummary[] },
          catalogResponse: { modules: [] as RoleModuleCatalogEntry[] },
        };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    load(null);
  }, [isSuperAdmin, load]);

  const openRole = (role: AdminRoleSummary) => {
    setSelectedRoleId(role.id);
    setDraft(toDraft(role, catalog));
    setError(null);
  };

  const createNewDraft = () => {
    if (!catalog.length) {
      return;
    }
    const modulePermissions = buildEmptyModulePermissions(catalog);
    setSelectedRoleId("new");
    setDraft({
      name: "",
      description: "",
      is_system: false,
      module_permissions: modulePermissions,
      field_permissions: buildEmptyFieldPermissions(catalog, modulePermissions),
    });
    setExpandedModules({});
    setError(null);
  };

  const selectedRole = useMemo(
    () =>
      selectedRoleId && selectedRoleId !== "new"
        ? roles.find((role) => role.id === selectedRoleId) || null
        : null,
    [roles, selectedRoleId],
  );

  const filteredRoles = useMemo(() => {
    const query = roleQuery.trim().toLowerCase();
    const base = [...roles].sort((left, right) =>
      formatRoleLabel(left.name).localeCompare(formatRoleLabel(right.name)),
    );
    if (!query) {
      return base;
    }
    return base.filter((roleItem) => {
      const haystack = [
        roleItem.name,
        formatRoleLabel(roleItem.name),
        roleItem.description || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [roleQuery, roles]);

  useEffect(() => {
    if (!draft) {
      return;
    }
    const defaults: Record<string, boolean> = {};
    catalog.forEach((module, index) => {
      const flags = draft.module_permissions[module.key] || {
        read: false,
        write: false,
        visible: false,
      };
      if (flags.read || flags.write || index < 2) {
        defaults[module.key] = true;
      }
    });
    setExpandedModules(defaults);
  }, [catalog, draft?.id, selectedRoleId]);

  const moduleAccessSummary = useMemo(() => {
    if (!draft) {
      return { enabled: 0, visible: 0, hidden: 0 };
    }
    return Object.values(draft.module_permissions).reduce(
      (summary, flags) => {
        const enabled = Boolean(flags.read || flags.write);
        if (!enabled) {
          return summary;
        }
        summary.enabled += 1;
        if (flags.visible) {
          summary.visible += 1;
        } else {
          summary.hidden += 1;
        }
        return summary;
      },
      { enabled: 0, visible: 0, hidden: 0 },
    );
  }, [draft]);

  const countFieldOverrides = useCallback(
    (module: RoleModuleCatalogEntry) => {
      if (!draft) {
        return 0;
      }
      const moduleFlags = draft.module_permissions[module.key] || {
        read: false,
        write: false,
      };
      return module.fields.filter((field) => {
        const current =
          draft.field_permissions[module.key]?.[field.key] || {
            read: false,
            write: false,
          };
        const defaults = getFieldPermissionDefaults(
          module.key,
          field.key,
          moduleFlags,
        );
        return (
          current.read !== defaults.read || current.write !== defaults.write
        );
      }).length;
    },
    [draft],
  );

  const filteredModules = useMemo(() => {
    if (!draft) {
      return [];
    }
    const query = moduleQuery.trim().toLowerCase();
    return catalog.filter((module) => {
      const flags = draft.module_permissions[module.key] || {
        read: false,
        write: false,
        visible: false,
      };
      const hasAccess = Boolean(flags.read || flags.write);
      const overrideCount = countFieldOverrides(module);

      if (moduleFilter === "enabled" && !hasAccess) {
        return false;
      }
      if (moduleFilter === "visible" && !flags.visible) {
        return false;
      }
      if (moduleFilter === "hidden" && (!hasAccess || flags.visible)) {
        return false;
      }
      if (moduleFilter === "fields" && overrideCount === 0) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        module.label,
        module.description,
        ...module.fields.map((field) => `${field.label} ${field.description}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [catalog, countFieldOverrides, draft, moduleFilter, moduleQuery]);

  useEffect(() => {
    if (!moduleQuery.trim()) {
      return;
    }
    setExpandedModules((previous) => {
      const next = { ...previous };
      filteredModules.forEach((module) => {
        next[module.key] = true;
      });
      return next;
    });
  }, [filteredModules, moduleQuery]);

  const setModulePermission = (
    moduleKey: string,
    key: "read" | "write",
    value: boolean,
  ) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }
      const currentModule = previous.module_permissions[moduleKey] || {
        read: false,
        write: false,
        visible: false,
      };
      const nextModule = {
        ...currentModule,
        [key]: value,
      };

      if (key === "write" && value) {
        nextModule.read = true;
      }
      if (key === "read" && !value) {
        nextModule.write = false;
      }

      const hadAccess = Boolean(currentModule.read || currentModule.write);
      const hasAccess = Boolean(nextModule.read || nextModule.write);
      nextModule.visible = hasAccess
        ? hadAccess
          ? Boolean(currentModule.visible)
          : true
        : false;

      const currentFields = previous.field_permissions[moduleKey] || {};
      const nextFields: Record<string, RoleFieldPermissionFlags> = {};
      Object.entries(currentFields).forEach(([fieldKey, flags]) => {
        const defaults = getFieldPermissionDefaults(moduleKey, fieldKey, nextModule);
        nextFields[fieldKey] = {
          read: hasAccess
            ? defaults.read
              ? Boolean(nextModule.read)
              : Boolean(flags.read && nextModule.read)
            : false,
          write: hasAccess
            ? defaults.write
              ? Boolean(nextModule.write)
              : Boolean(flags.write && nextModule.write)
            : false,
        };
      });

      return {
        ...previous,
        module_permissions: {
          ...previous.module_permissions,
          [moduleKey]: nextModule,
        },
        field_permissions: {
          ...previous.field_permissions,
          [moduleKey]: nextFields,
        },
      };
    });
  };

  const setModuleVisibility = (moduleKey: string, value: boolean) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }
      const currentModule = previous.module_permissions[moduleKey] || {
        read: false,
        write: false,
        visible: false,
      };
      if (!currentModule.read && !currentModule.write) {
        return previous;
      }
      return {
        ...previous,
        module_permissions: {
          ...previous.module_permissions,
          [moduleKey]: {
            ...currentModule,
            visible: value,
          },
        },
      };
    });
  };

  const setFieldPermission = (
    moduleKey: string,
    fieldKey: string,
    key: "read" | "write",
    value: boolean,
  ) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }
      const moduleFlags = previous.module_permissions[moduleKey] || {
        read: false,
        write: false,
        visible: false,
      };
      if ((key === "read" && !moduleFlags.read) || (key === "write" && !moduleFlags.write)) {
        return previous;
      }
      const currentField = previous.field_permissions[moduleKey]?.[fieldKey] || {
        read: false,
        write: false,
      };
      const nextField = {
        ...currentField,
        [key]: value,
      };
      if (key === "write" && value) {
        nextField.read = true;
      }
      if (key === "read" && !value) {
        nextField.write = false;
      }
      return {
        ...previous,
        field_permissions: {
          ...previous.field_permissions,
          [moduleKey]: {
            ...previous.field_permissions[moduleKey],
            [fieldKey]: nextField,
          },
        },
      };
    });
  };

  const applyCompanionAccess = (presets: CompanionAccessPreset[]) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }
      const nextModulePermissions = { ...previous.module_permissions };
      const nextFieldPermissions = { ...previous.field_permissions };

      presets.forEach((preset) => {
        const currentModule = nextModulePermissions[preset.module] || {
          read: false,
          write: false,
          visible: false,
        };
        const nextModule = {
          read:
            currentModule.read ||
            Boolean(preset.read) ||
            Boolean(preset.write),
          write: currentModule.write || Boolean(preset.write),
          visible: false,
        };
        nextModulePermissions[preset.module] = nextModule;

        const currentFields = nextFieldPermissions[preset.module] || {};
        const patchedFields: Record<string, RoleFieldPermissionFlags> = {};
        Object.entries(currentFields).forEach(([fieldKey, flags]) => {
          patchedFields[fieldKey] = {
            read: Boolean(flags.read) || nextModule.read,
            write: Boolean(flags.write) || nextModule.write,
          };
        });
        nextFieldPermissions[preset.module] = patchedFields;
      });

      return {
        ...previous,
        module_permissions: nextModulePermissions,
        field_permissions: nextFieldPermissions,
      };
    });
  };

  const saveRole = async () => {
    if (!draft) {
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      setError("Role name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        description: draft.description.trim() || undefined,
        module_permissions: draft.module_permissions,
        field_permissions: draft.field_permissions,
      };

      if (selectedRoleId === "new") {
        const created = await createAdminRole(payload);
        notifyAdminRolesUpdated();
        toast.push(`Role "${created.name}" created.`);
        const refreshed = await load(created.id);
        const found =
          refreshed.rolesResponse.items.find((roleItem) => roleItem.id === created.id) ||
          created;
        setSelectedRoleId(found.id);
        setDraft(toDraft(found, refreshed.catalogResponse.modules));
      } else if (selectedRole) {
        const updated = await updateAdminRole(selectedRole.id, payload);
        notifyAdminRolesUpdated();
        toast.push(`Role "${updated.name}" updated.`);
        await load(updated.id);
      }
    } catch (saveError: unknown) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : "Unable to save role.");
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async () => {
    if (!selectedRole || selectedRole.is_system) {
      return;
    }
    if (!window.confirm(`Delete role "${selectedRole.name}"?`)) {
      return;
    }
    setDeleting(true);
    try {
      await deleteAdminRole(selectedRole.id);
      notifyAdminRolesUpdated();
      toast.push(`Role "${selectedRole.name}" deleted.`);
      setSelectedRoleId(null);
      setDraft(null);
      await load(null);
    } catch (deleteError) {
      console.error(deleteError);
      setError("Unable to delete role.");
    } finally {
      setDeleting(false);
    }
  };

  if (!isSuperAdmin) {
    return <div className="text-sm text-mute">Super Admin access required.</div>;
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.98),_rgba(241,245,249,0.92),_rgba(226,232,240,0.84))] p-6 shadow-soft dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.96),_rgba(2,6,23,0.96),_rgba(2,6,23,0.88))]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Permission design
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-[2.5rem]">
                Roles that are easy to scan, safe to change, and hard to misconfigure.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Search roles, focus only on the modules you care about, and keep hidden companion access explicit instead of buried in a long permission wall.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:w-[420px]">
            <Card className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <ToneBadge>Roles</ToneBadge>
              <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {roles.length}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Available in the system
              </p>
            </Card>
            <Card className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <ToneBadge tone="success">Visible</ToneBadge>
              <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {moduleAccessSummary.visible}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Modules exposed in the main UI
              </p>
            </Card>
            <Card className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <ToneBadge tone="warning">Hidden</ToneBadge>
              <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {moduleAccessSummary.hidden}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Companion modules still enabled
              </p>
            </Card>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="ghost" onClick={() => navigate("/admin/users")}>
            Back to users
          </Button>
          <Button
            variant="ghost"
            onClick={() => load(selectedRoleId)}
          >
            <Settings2 className="h-4 w-4" />
            Refresh catalog
          </Button>
          <Button
            className="bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            onClick={createNewDraft}
          >
            <Plus className="h-4 w-4" />
            New role
          </Button>
        </div>
      </section>

      {loading ? (
        <Card className="rounded-[26px] p-6 text-sm text-slate-500 dark:text-slate-400">
          Loading roles…
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="rounded-[26px] border border-slate-200/80 bg-white/92 p-4 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Roles
                </p>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50 pl-10 dark:border-slate-700 dark:bg-slate-900"
                    value={roleQuery}
                    onChange={(event) => setRoleQuery(event.target.value)}
                    placeholder="Search roles"
                  />
                </div>
              </div>

              <div className="space-y-2">
                {filteredRoles.length ? (
                  filteredRoles.map((roleItem) => {
                    const enabledModules = Object.values(
                      roleItem.module_permissions || {},
                    ).filter((flags) => flags.read || flags.write).length;
                    return (
                      <button
                        key={roleItem.id}
                        type="button"
                        onClick={() => openRole(roleItem)}
                        className={cn(
                          "w-full rounded-[22px] border px-4 py-3 text-left transition",
                          selectedRoleId === roleItem.id
                            ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold">
                            {formatRoleLabel(roleItem.name)}
                          </div>
                          <ToneBadge
                            tone={roleItem.is_system ? "info" : "neutral"}
                            className={cn(
                              selectedRoleId === roleItem.id &&
                                "border-white/20 bg-white/10 text-white dark:border-slate-950/10 dark:bg-slate-950/10 dark:text-slate-950",
                            )}
                          >
                            {roleItem.is_system ? "System" : "Custom"}
                          </ToneBadge>
                        </div>
                        <div
                          className={cn(
                            "mt-2 text-xs leading-5",
                            selectedRoleId === roleItem.id
                              ? "text-white/80 dark:text-slate-950/70"
                              : "text-slate-500 dark:text-slate-400",
                          )}
                        >
                          {roleItem.description || "No description"}
                        </div>
                        <div
                          className={cn(
                            "mt-2 text-xs",
                            selectedRoleId === roleItem.id
                              ? "text-white/80 dark:text-slate-950/70"
                              : "text-slate-500 dark:text-slate-400",
                          )}
                        >
                          {enabledModules} enabled module{enabledModules === 1 ? "" : "s"}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                    No roles match this search.
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="rounded-[26px] border border-slate-200/80 bg-white/92 p-5 shadow-soft dark:border-slate-800 dark:bg-slate-950/80">
            {error && (
              <div className="mb-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                {error}
              </div>
            )}

            {!draft ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-8 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                Select a role to edit.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      {selectedRoleId === "new" ? "Create role" : "Edit role"}
                    </p>
                    <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">
                      {selectedRoleId === "new"
                        ? "Build a clear permission profile"
                        : formatRoleLabel(draft.name)}
                    </h2>
                    <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                      Separate backend access from frontend visibility. Hidden companion modules stay usable for dependent workflows without cluttering navigation.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {selectedRoleId !== "new" && draft.is_system === false && (
                      <Button variant="ghost" onClick={removeRole} disabled={deleting}>
                        {deleting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Deleting…
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </>
                        )}
                      </Button>
                    )}
                    <Button onClick={saveRole} disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Save role"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ToneBadge>
                    {moduleAccessSummary.enabled} enabled module
                    {moduleAccessSummary.enabled === 1 ? "" : "s"}
                  </ToneBadge>
                  <ToneBadge tone="success">
                    {moduleAccessSummary.visible} visible in main UI
                  </ToneBadge>
                  <ToneBadge tone="warning">
                    {moduleAccessSummary.hidden} hidden companion module
                    {moduleAccessSummary.hidden === 1 ? "" : "s"}
                  </ToneBadge>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Role name
                    </label>
                    <Input
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((previous) =>
                          previous
                            ? { ...previous, name: event.target.value }
                            : previous,
                        )
                      }
                      disabled={draft.is_system}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Description
                    </label>
                    <Textarea
                      rows={3}
                      className="rounded-[22px] border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((previous) =>
                          previous
                            ? { ...previous, description: event.target.value }
                            : previous,
                        )
                      }
                      placeholder="Summarize which team should use this role and why."
                    />
                  </div>
                </div>

                <Card className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        className="h-12 rounded-2xl border-slate-200 bg-white pl-10 dark:border-slate-700 dark:bg-slate-950"
                        value={moduleQuery}
                        onChange={(event) => setModuleQuery(event.target.value)}
                        placeholder="Search modules or fields"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(["all", "enabled", "visible", "hidden", "fields"] as ModuleFilter[]).map(
                        (filterKey) => (
                          <button
                            key={filterKey}
                            type="button"
                            onClick={() => setModuleFilter(filterKey)}
                            className={cn(
                              "rounded-full border px-4 py-2 text-sm font-medium transition",
                              moduleFilter === filterKey
                                ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900",
                            )}
                          >
                            {filterKey === "all"
                              ? "All modules"
                              : filterKey === "enabled"
                                ? "Enabled"
                                : filterKey === "visible"
                                  ? "Visible"
                                  : filterKey === "hidden"
                                    ? "Hidden"
                                    : "Field overrides"}
                          </button>
                        ),
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setExpandedModules(() =>
                            Object.fromEntries(
                              filteredModules.map((module) => [module.key, true]),
                            ),
                          )
                        }
                      >
                        Expand all
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setExpandedModules({})}
                      >
                        Collapse all
                      </Button>
                    </div>
                  </div>
                </Card>

                <div className="space-y-3">
                  {filteredModules.length ? (
                    filteredModules.map((module) => {
                      const flags = draft.module_permissions[module.key] || {
                        read: false,
                        write: false,
                        visible: false,
                      };
                      const hasAccess = Boolean(flags.read || flags.write);
                      const overrideCount = countFieldOverrides(module);
                      const workflowHint = MODULE_WORKFLOW_HINTS[module.key];
                      const expanded = Boolean(expandedModules[module.key]);

                      return (
                        <Card
                          key={module.key}
                          className="overflow-hidden rounded-[24px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedModules((previous) => ({
                                ...previous,
                                [module.key]: !previous[module.key],
                              }))
                            }
                            className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-base font-semibold text-slate-950 dark:text-white">
                                  {module.label}
                                </div>
                                {!hasAccess ? (
                                  <ToneBadge>No access</ToneBadge>
                                ) : flags.visible ? (
                                  <ToneBadge tone="success">Visible in UI</ToneBadge>
                                ) : (
                                  <ToneBadge tone="warning">Hidden companion</ToneBadge>
                                )}
                                {flags.write && (
                                  <ToneBadge tone="info">Read + write</ToneBadge>
                                )}
                                {flags.read && !flags.write && (
                                  <ToneBadge>Read only</ToneBadge>
                                )}
                                {overrideCount > 0 && (
                                  <ToneBadge tone="info">
                                    {overrideCount} field override
                                    {overrideCount === 1 ? "" : "s"}
                                  </ToneBadge>
                                )}
                              </div>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {module.description}
                              </p>
                            </div>
                            <div className="mt-1 text-slate-400">
                              {expanded ? (
                                <ChevronDown className="h-5 w-5" />
                              ) : (
                                <ChevronRight className="h-5 w-5" />
                              )}
                            </div>
                          </button>

                          <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                                <input
                                  type="checkbox"
                                  checked={flags.read}
                                  onChange={(event) =>
                                    setModulePermission(
                                      module.key,
                                      "read",
                                      event.target.checked,
                                    )
                                  }
                                />
                                Read
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                                <input
                                  type="checkbox"
                                  checked={flags.write}
                                  onChange={(event) =>
                                    setModulePermission(
                                      module.key,
                                      "write",
                                      event.target.checked,
                                    )
                                  }
                                />
                                Write
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                                <input
                                  type="checkbox"
                                  checked={Boolean(flags.visible)}
                                  disabled={!hasAccess}
                                  onChange={(event) =>
                                    setModuleVisibility(
                                      module.key,
                                      event.target.checked,
                                    )
                                  }
                                />
                                Show in main UI
                              </label>
                            </div>

                            {!hasAccess ? (
                              <div className="mt-4 rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                Enable read or write first. UI visibility only matters after the role can actually use the module.
                              </div>
                            ) : !flags.visible ? (
                              <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                                This module stays hidden from main navigation but remains available behind dependent workflows.
                              </div>
                            ) : null}

                            {expanded && (
                              <div className="mt-5 space-y-4">
                                {workflowHint && (
                                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/80">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <div className="text-sm font-semibold text-slate-950 dark:text-white">
                                          {workflowHint.title}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                          {workflowHint.description}
                                        </div>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        className="h-9 rounded-full px-4 text-xs"
                                        onClick={() =>
                                          applyCompanionAccess(workflowHint.presets)
                                        }
                                      >
                                        Apply hidden essentials
                                      </Button>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                                      {workflowHint.presets.map((preset) => (
                                        <div
                                          key={`${module.key}-${preset.module}`}
                                          className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"
                                        >
                                          <div className="text-sm font-medium text-slate-950 dark:text-white">
                                            {preset.label}
                                          </div>
                                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {preset.description}
                                          </div>
                                          <Button
                                            variant="ghost"
                                            className="mt-3 h-8 rounded-full px-3 text-xs"
                                            onClick={() => applyCompanionAccess([preset])}
                                          >
                                            Enable hidden access
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {module.fields.length > 0 && (
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                        Field-level overrides
                                      </div>
                                      <div className="text-xs text-slate-500 dark:text-slate-400">
                                        Only changes that differ from module defaults need attention.
                                      </div>
                                    </div>
                                    {module.fields.map((field) => {
                                      const fieldFlags =
                                        draft.field_permissions[module.key]?.[field.key] || {
                                          read: false,
                                          write: false,
                                        };
                                      const defaults = getFieldPermissionDefaults(
                                        module.key,
                                        field.key,
                                        flags,
                                      );
                                      const overridden =
                                        fieldFlags.read !== defaults.read ||
                                        fieldFlags.write !== defaults.write;

                                      return (
                                        <div
                                          key={field.key}
                                          className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80"
                                        >
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                              <div className="flex flex-wrap items-center gap-2">
                                                <div className="text-sm font-medium text-slate-950 dark:text-white">
                                                  {field.label}
                                                </div>
                                                {overridden && (
                                                  <ToneBadge tone="info">
                                                    Override
                                                  </ToneBadge>
                                                )}
                                              </div>
                                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                {field.description}
                                              </div>
                                            </div>
                                            <div className="flex flex-wrap gap-3 text-sm">
                                              <label className="inline-flex items-center gap-2">
                                                <input
                                                  type="checkbox"
                                                  checked={fieldFlags.read}
                                                  disabled={!flags.read}
                                                  onChange={(event) =>
                                                    setFieldPermission(
                                                      module.key,
                                                      field.key,
                                                      "read",
                                                      event.target.checked,
                                                    )
                                                  }
                                                />
                                                Read
                                              </label>
                                              <label className="inline-flex items-center gap-2">
                                                <input
                                                  type="checkbox"
                                                  checked={fieldFlags.write}
                                                  disabled={!flags.write}
                                                  onChange={(event) =>
                                                    setFieldPermission(
                                                      module.key,
                                                      field.key,
                                                      "write",
                                                      event.target.checked,
                                                    )
                                                  }
                                                />
                                                Write
                                              </label>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })
                  ) : (
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-8 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                      No modules match the current search and filter.
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
