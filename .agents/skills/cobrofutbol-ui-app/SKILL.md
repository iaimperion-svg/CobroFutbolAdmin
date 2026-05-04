---
name: cobrofutbol-ui-app
description: Work on CobroFutbol frontend UI. Use when changing or reviewing Next.js app pages, portal /app, /backoffice, /alta, /activar, receipts drawer, manual review UI, students UI, dashboard, global CSS, responsive layout, app shell, status badges, visual states, locked actions, forms, or any user-facing copy/layout behavior.
---

# CobroFutbol UI App

Use this skill for CobroFutbol UI and frontend workflow changes.

## Required Context

Read [references/ui-map.md](references/ui-map.md) before changing UI.

Then inspect only the relevant files:

- `src/app/globals.css`
- `src/app/app/**`
- `src/app/backoffice/**`
- `src/app/alta/**`
- `src/app/activar/**`
- `src/app/login/**`
- `src/components/**`
- Related server actions/services for the page

## Workflow

1. Identify the screen and user role: public lead, school admin/operator, internal backoffice, or onboarding reviewer.
2. Trace the data source before changing UI labels or actions.
3. Preserve existing visual language and class naming unless a broader redesign is requested.
4. Keep operational tools dense, scannable, and action-oriented.
5. Ensure closed/reconciled/approved states are visually locked and cannot trigger destructive duplicate actions.
6. Run `npm run lint`; add service tests when UI changes depend on server behavior.
7. For visual confidence, inspect the route in a browser when available.

## Core Rules

- Do not turn operational screens into marketing pages.
- Keep finance labels precise: expected, collected, pending, overdue, platform money, school collection money.
- Avoid broad CSS refactors for a narrow UI fix.
- Be careful with existing mojibake/encoding artifacts; fix visible text only in the touched scope.
- Do not expose secrets or raw activation/payment tokens in UI.
- Prefer shared components like `StatusBadge`, `SectionHeader`, `EmptyState`, and existing shell/layout classes.
- Forms should show disabled/loading/error/success states where the user can take action.
- Mobile layout must preserve readable text and reachable actions.

## Common Verification

```powershell
npm run lint
```

If touching behavior behind UI:

```powershell
npm run test -- tests/onboarding.service.test.ts
npm run test -- tests/reconciliation.service.test.ts
npm run test -- tests/receipt-resolution.service.test.ts
npm run test -- tests/students.service.test.ts
```

## Reporting

When reporting UI work, include:

- Routes/components changed.
- User role affected.
- States checked.
- Verification command results.
- Any visual check not performed.
