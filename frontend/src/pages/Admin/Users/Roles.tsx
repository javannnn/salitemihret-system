import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import {
  AdminRoleSummary,
  RoleFieldPermissionFlags,
  RoleModuleCatalogEntry,
  RolePermissionFlags,
  createAdminRole,
  deleteAdminRole,
  getRolePermissionCatalog,
  listAdminRoles,
  updateAdminRole,
} from "@/lib/api";
import { notifyAdminRolesUpdated } from "@/lib/adminRolesSync";
import { ROLE_LABELS } from "@/lib/roles";

type RoleDraft = {
  id?: number;
  name: string;
  description: string;
  is_system: boolean;
  module_permissions: Record<string, RolePermissionFlags>;
  field_permissions: Record<string, Record<string, RoleFieldPermissionFlags>>;
};

function buildEmptyModulePermissions(catalog: RoleModuleCatalogEntry[]): Record<string, RolePermissionFlags> {
  const out: Record<string, RolePermissionFlags> = {};
  catalog.forEach((module) => {
    out[module.key] = { read: false, write: false };
  });
  return out;
}

function buildEmptyFieldPermissions(
  catalog: RoleModuleCatalogEntry[],
  modulePermissions: Record<string, RolePermissionFlags>
): Record<string, Record<string, RoleFieldPermissionFlags>> {
  const out: Record<string, Record<string, RoleFieldPermissionFlags>> = {};
  catalog.forEach((module) => {
    if (!module.fields.length) return;
    out[module.key] = {};
    const moduleFlags = modulePermissions[module.key] || { read: false, write: false };
    module.fields.forEach((field) => {
      out[module.key][field.key] = { read: Boolean(moduleFlags.read), write: Boolean(moduleFlags.write) };
    });
  });
  return out;
}

function toDraft(role: AdminRoleSummary, catalog: RoleModuleCatalogEntry[]): RoleDraft {
  const modulePermissions = buildEmptyModulePermissions(catalog);

  Object.entries(role.module_permissions || {}).forEach(([module, flags]) => {
    if (!modulePermissions[module]) return;
    modulePermissions[module] = { read: Boolean(flags.read), write: Boolean(flags.write) };
  });
  const fieldPermissions = buildEmptyFieldPermissions(catalog, modulePermissions);
  Object.entries(role.field_permissions || {}).forEach(([module, fieldMap]) => {
    if (!fieldPermissions[module]) return;
    Object.entries(fieldMap).forEach(([field, flags]) => {
      if (!fieldPermissions[module][field]) return;
      fieldPermissions[module][field] = { read: Boolean(flags.read), write: Boolean(flags.write) };
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

  const load = async (): Promise<{ rolesResp: { items: AdminRoleSummary[] }; catalogResp: { modules: RoleModuleCatalogEntry[] } }> => {
    setLoading(true);
    setError(null);
    try {
      const [rolesResp, catalogResp] = await Promise.all([listAdminRoles(), getRolePermissionCatalog()]);
      setRoles(rolesResp.items);
      setCatalog(catalogResp.modules);
      if (selectedRoleId === null && rolesResp.items.length) {
        const first = rolesResp.items[0];
        setSelectedRoleId(first.id);
        setDraft(toDraft(first, catalogResp.modules));
      } else if (selectedRoleId && selectedRoleId !== "new") {
        const found = rolesResp.items.find((item) => item.id === selectedRoleId);
        if (found) {
          setDraft(toDraft(found, catalogResp.modules));
        }
      }
      return { rolesResp, catalogResp };
    } catch (err) {
      console.error(err);
      setError("Unable to load roles and permission catalog.");
      return { rolesResp: { items: [] }, catalogResp: { modules: [] } };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  const openRole = (role: AdminRoleSummary) => {
    setSelectedRoleId(role.id);
    setDraft(toDraft(role, catalog));
    setError(null);
  };

  const createNewDraft = () => {
    if (!catalog.length) return;
    setSelectedRoleId("new");
    const modulePermissions = buildEmptyModulePermissions(catalog);
    setDraft({
      name: "",
      description: "",
      is_system: false,
      module_permissions: modulePermissions,
      field_permissions: buildEmptyFieldPermissions(catalog, modulePermissions),
    });
    setError(null);
  };

  const selectedRole = useMemo(
    () => (selectedRoleId && selectedRoleId !== "new" ? roles.find((role) => role.id === selectedRoleId) || null : null),
    [selectedRoleId, roles]
  );

  const setModulePermission = (moduleKey: string, key: "read" | "write", value: boolean) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextModule = {
        ...prev.module_permissions[moduleKey],
        [key]: value,
      };
      const currentFields = prev.field_permissions[moduleKey] || {};
      const nextFields: Record<string, RoleFieldPermissionFlags> = {};
      Object.entries(currentFields).forEach(([fieldKey, flags]) => {
        nextFields[fieldKey] = {
          ...flags,
          [key]: value,
        };
      });
      return {
        ...prev,
        module_permissions: {
          ...prev.module_permissions,
          [moduleKey]: nextModule,
        },
        field_permissions: {
          ...prev.field_permissions,
          [moduleKey]: nextFields,
        },
      };
    });
  };

  const setFieldPermission = (moduleKey: string, fieldKey: string, key: "read" | "write", value: boolean) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        field_permissions: {
          ...prev.field_permissions,
          [moduleKey]: {
            ...prev.field_permissions[moduleKey],
            [fieldKey]: {
              ...prev.field_permissions[moduleKey]?.[fieldKey],
              [key]: value,
            },
          },
        },
      };
    });
  };

  const saveRole = async () => {
    if (!draft) return;
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
        const refreshed = await load();
        const found = refreshed.rolesResp.items.find((role) => role.id === created.id) || created;
        setSelectedRoleId(found.id);
        setDraft(toDraft(found, refreshed.catalogResp.modules));
      } else if (selectedRole) {
        const updated = await updateAdminRole(selectedRole.id, payload);
        notifyAdminRolesUpdated();
        toast.push(`Role "${updated.name}" updated.`);
        await load();
        setSelectedRoleId(updated.id);
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to save role.");
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async () => {
    if (!selectedRole || selectedRole.is_system) return;
    if (!window.confirm(`Delete role "${selectedRole.name}"?`)) return;
    setDeleting(true);
    try {
      await deleteAdminRole(selectedRole.id);
      notifyAdminRolesUpdated();
      toast.push(`Role "${selectedRole.name}" deleted.`);
      setSelectedRoleId(null);
      setDraft(null);
      await load();
    } catch (err) {
      console.error(err);
      setError("Unable to delete role.");
    } finally {
      setDeleting(false);
    }
  };

  if (!isSuperAdmin) {
    return <div className="text-sm text-mute">Super Admin access required.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-slate-50 p-6 shadow-soft text-ink dark:bg-black dark:border-slate-800 dark:text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Security Console</p>
            <h1 className="text-3xl font-semibold">Roles & Permissions</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Create custom roles and tune module + field read/write controls.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/users")}>
              Back to users
            </Button>
            <Button onClick={createNewDraft}>New role</Button>
          </div>
        </div>
      </section>

      {loading ? (
        <Card className="p-6 text-sm text-mute">Loading roles…</Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="p-4 space-y-3 max-h-[78vh] overflow-y-auto">
            <h2 className="text-sm uppercase text-mute">Roles</h2>
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => openRole(role)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selectedRoleId === role.id
                    ? "border-accent bg-accent/10"
                    : "border-border bg-card/70 hover:border-accent/40 hover:bg-accent/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{ROLE_LABELS[role.name] || role.name}</span>
                  {role.is_system ? <Badge variant="outline">System</Badge> : <Badge variant="outline">Custom</Badge>}
                </div>
                <div className="mt-1 text-xs text-mute">{role.description || "No description"}</div>
              </button>
            ))}
          </Card>

          <Card className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
            {error && <Card className="p-3 text-sm border-red-200 bg-red-50 text-red-700">{error}</Card>}
            {!draft ? (
              <div className="text-sm text-mute">Select a role to edit.</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedRoleId === "new" ? "Create role" : "Edit role"}</h2>
                    <p className="text-sm text-mute">Module access controls broad capabilities. Field rules refine write/read access.</p>
                  </div>
                  <div className="flex gap-2">
                    {selectedRoleId !== "new" && draft.is_system === false && (
                      <Button variant="ghost" onClick={removeRole} disabled={deleting}>
                        {deleting ? "Deleting…" : "Delete"}
                      </Button>
                    )}
                    <Button onClick={saveRole} disabled={saving}>
                      {saving ? "Saving…" : "Save role"}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Role name</label>
                    <Input
                      value={draft.name}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                      disabled={draft.is_system}
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Description</label>
                    <Input
                      value={draft.description}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm uppercase text-mute">Module permissions</h3>
                  {catalog.map((module) => {
                    const flags = draft.module_permissions[module.key] || { read: false, write: false };
                    return (
                      <Card key={module.key} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{module.label}</div>
                            <div className="text-xs text-mute">{module.description}</div>
                          </div>
                          <div className="flex gap-4 text-sm">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={flags.read}
                                onChange={(event) => setModulePermission(module.key, "read", event.target.checked)}
                              />
                              Read
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={flags.write}
                                onChange={(event) => setModulePermission(module.key, "write", event.target.checked)}
                              />
                              Write
                            </label>
                          </div>
                        </div>

                        {module.fields.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-xs uppercase text-mute">Field-level overrides</div>
                            {module.fields.map((field) => {
                              const fieldFlags = draft.field_permissions[module.key]?.[field.key] || { read: false, write: false };
                              return (
                                <div key={field.key} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                                  <div>
                                    <div className="text-sm font-medium">{field.label}</div>
                                    <div className="text-xs text-mute">{field.description}</div>
                                  </div>
                                  <div className="flex gap-4 text-sm">
                                    <label className="inline-flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={fieldFlags.read}
                                        onChange={(event) =>
                                          setFieldPermission(module.key, field.key, "read", event.target.checked)
                                        }
                                      />
                                      Read
                                    </label>
                                    <label className="inline-flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={fieldFlags.write}
                                        onChange={(event) =>
                                          setFieldPermission(module.key, field.key, "write", event.target.checked)
                                        }
                                      />
                                      Write
                                    </label>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
