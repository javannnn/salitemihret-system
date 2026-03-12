const ADMIN_ROLES_UPDATED_EVENT = "admin-roles-updated";
const ADMIN_ROLES_UPDATED_KEY = "app:admin-roles-updated-at";

export function notifyAdminRolesUpdated(): void {
  if (typeof window === "undefined") return;
  const marker = String(Date.now());
  window.localStorage.setItem(ADMIN_ROLES_UPDATED_KEY, marker);
  window.dispatchEvent(new CustomEvent(ADMIN_ROLES_UPDATED_EVENT, { detail: marker }));
}

export function subscribeAdminRolesUpdated(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleEvent = () => callback();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === ADMIN_ROLES_UPDATED_KEY) {
      callback();
    }
  };

  window.addEventListener(ADMIN_ROLES_UPDATED_EVENT, handleEvent);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(ADMIN_ROLES_UPDATED_EVENT, handleEvent);
    window.removeEventListener("storage", handleStorage);
  };
}
