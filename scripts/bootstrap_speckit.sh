set -e
mkdir -p docs/spec-kit/adr
mkdir -p docs/spec-kit/modules
mkdir -p .github/ISSUE_TEMPLATE

printf "# Product Vision\n" > docs/spec-kit/00-product-vision.md
printf "# Architecture\n" > docs/spec-kit/01-architecture.md
printf "# UX Principles\n" > docs/spec-kit/02-ux-principles.md
printf "# Domain Model\n" > docs/spec-kit/03-domain-model.md
printf "# API Contracts\n" > docs/spec-kit/04-api-contracts.md
printf "# Security And Privacy\n" > docs/spec-kit/05-security-and-privacy.md
printf "# Testing Strategy\n" > docs/spec-kit/06-testing-strategy.md
printf "# CI CD And Environments\n" > docs/spec-kit/07-ci-cd-and-environments.md
printf "# Data Import Export\n" > docs/spec-kit/08-data-import-export.md
printf "# i18n And Accessibility\n" > docs/spec-kit/09-i18n-and-a11y.md
printf "# Operations And Backups\n" > docs/spec-kit/10-operations-and-backups.md
printf "# Observability\n" > docs/spec-kit/11-observability.md
printf "# Acceptance Criteria\n" > docs/spec-kit/12-acceptance-criteria.md
printf "# Performance Budgets\n" > docs/spec-kit/13-performance-budgets.md
printf "# Dev Standards\n" > docs/spec-kit/14-dev-standards.md

printf "# ADR-0001 Design Language And Motion\n" > docs/spec-kit/adr/ADR-0001-design-language-and-motion.md
printf "# ADR-0002 Auth And RBAC\n" > docs/spec-kit/adr/ADR-0002-auth-and-rbac.md
printf "# ADR-0003 Import Pipeline\n" > docs/spec-kit/adr/ADR-0003-import-pipeline.md

printf "# Membership Module\n" > docs/spec-kit/modules/membership.md
printf "# Payments Module\n" > docs/spec-kit/modules/payments.md
printf "# Sponsorships Module\n" > docs/spec-kit/modules/sponsorships.md
printf "# Newcomers Module\n" > docs/spec-kit/modules/newcomers.md
printf "# Schools Module\n" > docs/spec-kit/modules/schools.md
printf "# Volunteers Module\n" > docs/spec-kit/modules/volunteers.md
printf "# Media Module\n" > docs/spec-kit/modules/media.md
printf "# Councils Module\n" > docs/spec-kit/modules/councils.md
printf "# Reports Module\n" > docs/spec-kit/modules/reports.md

cat > .github/PULL_REQUEST_TEMPLATE.md <<'EOT'
### What’s changing?
- Linked Spec IDs: SPEC-____
- Module(s): ____
- ADR needed? Yes/No

### Checklists
- [ ] Spec updated or confirmed up-to-date
- [ ] Acceptance criteria mapped to tests
- [ ] Security implications considered
- [ ] i18n and a11y considered
EOT

cat > .github/ISSUE_TEMPLATE/spec-item.md <<'EOT'
---
name: SPEC item
about: Track a SpecKit requirement
title: "[SPEC] <short title> (SPEC-____)"
labels: ["spec"]
assignees: []
---

Problem / Goal

Scope (in/out)

Acceptance Criteria

Affected Modules

Owners / Reviewers

Due date / Milestone
EOT

printf "node_modules/\n.env\n.venv/\n__pycache__/\n*.pyc\n.DS_Store\n" > .gitignore
printf "root = true\n\n[*]\nend_of_line = lf\ninsert_final_newline = true\n" > .editorconfig

git add .
git commit -m "chore(spec): bootstrap SpecKit skeleton"
