## SaliteMiret RBAC Baseline

This Frappe app seeds the core SaliteMihret roles and the curated permission
matrix used across the platform. It enforces deny-by-default access, granting
full control of the Role Permission Matrix DocTypes to System Managers while PR
Administrators have read-only visibility for governance.

### Working with fixtures

```bash
# Export updated fixtures after changing roles or DocPerm entries
bench --site salitemihret.local export-fixtures --app salitemiret
```

The fixtures live under `fixtures/role.json` and `fixtures/custom_docperm.json`.
The former mirrors the personas defined in the security specification; the
latter captures the allowed CRUD actions for the `Role Permission Matrix` and
its child entries.

### Whoami API

```bash
curl -s 'https://<site>/api/method/salitemiret.api.auth.whoami' 
```

The endpoint returns a JSON payload containing the current frappe user, their full name, roles, and derived personas.
Use this from the admin UI's bootstrap (TanStack Query) to hydrate the RBAC context.


### Testing

```bash
bench --site salitemihret.local run-tests --app salitemiret --module salitemiret.salitemiret.tests.test_auth_rbac
```

The test suite verifies fixture structure as well as the custom `has_permission`
hooks exposed via `salitemiret.permissions`.

#### License

MIT
