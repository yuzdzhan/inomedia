# Implementation Plan V1: Deep Testable Slices

## Overview

This plan rewrites the V1 rollout as thin vertical slices inspired by `to-issues`.

Each slice is:
- end to end across schema, backend, permissions, UI, and tests
- demoable on its own
- intentionally narrow
- biased toward AFK implementation unless a human review is genuinely needed

For each slice:
- `Type` means whether it should be implementable without human intervention
- `Blocked by` shows the minimum dependency chain
- `User stories covered` references the PRD numbering

## Slice 1: Company Bootstrap and Admin Login

- **Type**: AFK
- **Blocked by**: None
- **User stories covered**: 1, 2, 3, 4, 7, 121, 122

### What to build

Create the minimum app shell that supports one-company bootstrap, admin login, user creation, role assignment, and security audit events for login and role changes.

### Acceptance criteria

- [ ] A seeded or bootstrapped company can be created exactly once.
- [ ] An admin can log in and create users with the four supported roles.
- [ ] User activation and deactivation work end to end.
- [ ] Login success/failure and role changes are audit-logged.
- [ ] The UI is Bulgarian-only for this flow.

## Slice 2: Company Settings and Protected Internal Client

- **Type**: AFK
- **Blocked by**: Slice 1
- **User stories covered**: 1, 2, 5, 6, 7, 30, 31, 166, 167

### What to build

Add company settings management, initial invoice-number seed, VAT/payment-term settings, expense category management, and automatic creation of the protected internal client.

### Acceptance criteria

- [ ] Admin can edit company legal profile and default payment term.
- [ ] Admin can set the starting invoice number before any invoice is issued.
- [ ] Default expense categories exist and can be extended or deactivated.
- [ ] The protected internal client exists and cannot be deleted.
- [ ] Internal client projects are constrained to non-billable behavior.

## Slice 3: Client Registry

- **Type**: AFK
- **Blocked by**: Slice 2
- **User stories covered**: 8, 9, 16, 33, 79, 148, 149

### What to build

Create client management for legal entities, including billing identity, optional contacts, active/inactive state, and accountant editing of billing/legal fields.

### Acceptance criteria

- [ ] Manager and admin can create and edit clients.
- [ ] Accountant can edit billing/legal client details.
- [ ] Clients support optional contacts.
- [ ] Inactive clients remain visible historically but cannot receive new billing activity.
- [ ] Internal client remains protected from normal edits that would break invariants.

## Slice 4: Project Management

- **Type**: AFK
- **Blocked by**: Slice 3
- **User stories covered**: 10, 11, 12, 13, 14, 17, 18, 27, 34, 61, 148

### What to build

Add projects with one client, one primary manager, project membership, lifecycle status, budget fields, retainer, and active/inactive behavior.

### Acceptance criteria

- [ ] Manager and admin can create projects for exactly one client.
- [ ] A project requires one primary manager.
- [ ] Project members can be assigned.
- [ ] Project status supports active, on hold, completed, and cancelled.
- [ ] Budget and retainer fields are persisted and visible where relevant.

## Slice 5: Task Lists and Tasks

- **Type**: AFK
- **Blocked by**: Slice 4
- **User stories covered**: 19, 20, 21, 23, 24, 25, 26, 55, 56, 68, 69, 70, 150, 155, 156, 157, 158, 161

### What to build

Add task lists and tasks with status, priority, deadline, billing type, flat fee, no ordering, no subtasks, and no labels/checklists/dependencies.

### Acceptance criteria

- [ ] Manager and admin can create archived and active task lists within a project.
- [ ] Tasks belong to exactly one task list.
- [ ] Tasks support status, priority, deadline, and billing type.
- [ ] Default views hide completed and cancelled tasks unless filtered in.
- [ ] Projects and tasks can be reopened by manager/admin.

## Slice 6: Task Assignment and Employee Work View

- **Type**: AFK
- **Blocked by**: Slice 5
- **User stories covered**: 22, 32, 49, 50, 64, 97

### What to build

Add multi-assignee task assignment and the employee-facing task view with operational details visible but financial values hidden.

### Acceptance criteria

- [ ] A task can have multiple assignees.
- [ ] Employees can see only assigned/relevant tasks.
- [ ] Employees can see task billing type but not financial amounts.
- [ ] Managers can see project-scoped financial details while employees cannot.
- [ ] Assignment permissions are enforced consistently in UI and backend.

## Slice 7: Task Comments

- **Type**: AFK
- **Blocked by**: Slice 6
- **User stories covered**: 33, 62, 66, 99, 160

### What to build

Add task comments with author, timestamps, soft delete, edit marker, and continued use on completed or on-hold work.

### Acceptance criteria

- [ ] Employees can add and edit their own task comments.
- [ ] Managers/admins can soft-delete comments.
- [ ] Comments remain available on completed and on-hold tasks/projects.
- [ ] No mentions or notifications exist in this flow.
- [ ] Comment history behavior is verifiable.

## Slice 8: Attachments and File Previews

- **Type**: AFK
- **Blocked by**: Slice 7
- **User stories covered**: 34, 35, 96, 106, 122, 123, 124, 125, 126, 131, 176

### What to build

Add app-managed file upload with metadata, task/comment attachment support, common-image previews, and immutable original filenames.

### Acceptance criteria

- [ ] Files can be uploaded to tasks and task comments.
- [ ] Original filename, content type, size, owner, and uploader metadata are stored.
- [ ] Common image types show previews.
- [ ] Files cannot be renamed in-app.
- [ ] Non-image files remain downloadable.

## Slice 9: Manual Time Logging

- **Type**: AFK
- **Blocked by**: Slice 6
- **User stories covered**: 37, 38, 39, 40, 41, 42, 43, 71, 72, 73, 74, 75

### What to build

Add time-log creation for assigned employees with required work date, required description, 15-minute duration validation, optional start/end, and overlap checking when time ranges exist.

### Acceptance criteria

- [ ] Employees can add manual time logs only on assigned tasks.
- [ ] Duration must be divisible by 15.
- [ ] Work description is required.
- [ ] Future work dates are rejected.
- [ ] If start/end exist, overlapping logs for the same user/day are blocked.

## Slice 10: Time Editing Rules and Invoicing Lock Hooks

- **Type**: AFK
- **Blocked by**: Slice 9
- **User stories covered**: 44, 45, 46, 47, 48, 101, 102, 121, 123

### What to build

Add policy-driven time-log edits: employee current-month edits, manager/admin edits of uninvoiced logs, audited manager/admin deletes, and hard locking for invoiced logs.

### Acceptance criteria

- [ ] Employees can edit/delete only their own uninvoiced current-month logs.
- [ ] Managers can edit uninvoiced team logs on their own projects.
- [ ] Manager/admin deletion of uninvoiced team logs creates audit events.
- [ ] Invoiced logs cannot be edited or deleted.
- [ ] Policy is enforced through backend authorization, not UI only.

## Slice 11: Rate History and Resolution

- **Type**: AFK
- **Blocked by**: Slice 9
- **User stories covered**: 51, 80, 81, 82, 83, 84, 98, 168, 169

### What to build

Add user cost/billable rate history, project-user billable overrides, task-level billable overrides, and rate snapshotting on time-log creation.

### Acceptance criteria

- [ ] User rate history supports effective-from dates.
- [ ] Project-user billable overrides support date-based resolution.
- [ ] Task-level billable override takes precedence when applicable.
- [ ] Time logs snapshot effective cost and billable rates.
- [ ] Managers can view scoped rate data for projects they manage.

## Slice 12: Invoiceable Task View

- **Type**: AFK
- **Blocked by**: Slices 10, 11
- **User stories covered**: 77, 78, 79, 163, 164

### What to build

Create the invoiceable-work screen that lists tasks ready for billing, grouped/filterable by client and project, with uninvoiced values derived from selected task billing rules.

### Acceptance criteria

- [ ] Only invoiceable tasks appear.
- [ ] Hourly task value is derived from uninvoiced time logs using snapshotted rates.
- [ ] Flat-fee tasks show their uninvoiced flat fee once.
- [ ] Managers see scoped project values; accountants/admins see full finance views.
- [ ] Filters by client, project, and billing type work.

## Slice 13: Invoice Draft Creation

- **Type**: AFK
- **Blocked by**: Slice 12
- **User stories covered**: 53, 54, 55, 56, 57, 58, 59, 60, 61, 82, 141, 142

### What to build

Add invoice drafts for one client at a time, task-based selection, reservation of billable items, and snapshotting of selected task content at draft time.

### Acceptance criteria

- [ ] An accountant can create a draft invoice for exactly one client.
- [ ] A draft can include tasks from multiple projects for that client.
- [ ] Selecting an hourly task captures all currently uninvoiced billable time on that task.
- [ ] Selected items become reserved and unavailable to other drafts.
- [ ] New time logged after selection is not auto-added until explicit refresh.

## Slice 14: Invoice Line Editing and Totals

- **Type**: AFK
- **Blocked by**: Slice 13
- **User stories covered**: 63, 64, 65, 66, 77, 78, 79, 81

### What to build

Add task-grouped invoice lines, editable Bulgarian descriptions before issue, service period fields, due-date precedence, VAT totals, and draft recalculation.

### Acceptance criteria

- [ ] Invoice lines are grouped by task only.
- [ ] Description can be edited in draft state.
- [ ] Service period and due date can be reviewed and adjusted before issue.
- [ ] Due date defaults from invoice override, then client default, then company default.
- [ ] Net, VAT, and gross totals recalculate consistently.

## Slice 15: Invoice Issue and Immutable Snapshot

- **Type**: HITL
- **Blocked by**: Slice 14
- **User stories covered**: 67, 68, 69, 70, 104, 105, 170

### What to build

Issue draft invoices by assigning sequential numbers, freezing the invoice snapshot, locking linked time logs, and generating the final Bulgarian PDF.

### Acceptance criteria

- [ ] Official invoice number is assigned only at issue time.
- [ ] Issued invoice becomes immutable.
- [ ] Included time logs become invoiced and locked.
- [ ] Structured issued snapshot and immutable PDF are both stored.
- [ ] Legal invoice field coverage is verified against the sample invoice before signoff.

## Slice 16: Invoice Payments

- **Type**: AFK
- **Blocked by**: Slice 15
- **User stories covered**: 71, 73, 74, 75, 76, 111, 112, 170, 171, 172

### What to build

Add invoice payment recording, partial payment support, unpaid-to-paid state changes, and routing of payment effects to bank or cash based on payment method.

### Acceptance criteria

- [ ] An issued invoice can receive one or more payments.
- [ ] Partial payments move invoice state to partially paid.
- [ ] Full payment moves invoice state to paid.
- [ ] Payment method can be edited while unpaid but not after payment exists without reversal handling.
- [ ] Recorded payment affects the correct money container.

## Slice 17: Expense Categories and One-Time Expenses

- **Type**: AFK
- **Blocked by**: Slice 2
- **User stories covered**: 84, 85, 89, 90, 91, 92, 93, 94, 95, 146, 147

### What to build

Add controlled expense categories and actual one-time expense management, including overhead and optional project/client linkage.

### Acceptance criteria

- [ ] Admin can add and deactivate categories.
- [ ] Accountant can create/edit company-level expenses.
- [ ] Manager can create/edit project-linked expenses only.
- [ ] Expense can be linked to client/project or remain overhead.
- [ ] Only admin/accountant can mark an expense as paid.

## Slice 18: Recurring Expense Templates and Occurrences

- **Type**: AFK
- **Blocked by**: Slice 17
- **User stories covered**: 85, 86, 87, 88, 113

### What to build

Add monthly/yearly recurring expense templates and automatic generation of draft actual occurrences linked back to the template.

### Acceptance criteria

- [ ] Accountant can create monthly and yearly recurring templates.
- [ ] Future occurrences are generated automatically.
- [ ] Generated occurrences can be edited before confirmation as actual expenses.
- [ ] Category and project/client links default from the template.
- [ ] Forecast views can distinguish future recurring cost from actual cost.

## Slice 19: Bank Account, Cashbox, and Generic Money Movements

- **Type**: AFK
- **Blocked by**: Slices 16, 17
- **User stories covered**: 102, 103, 104, 105, 106, 107, 111, 112, 114, 115, 116, 117

### What to build

Introduce one bank account, one cashbox, standalone income, generic money movements, and transfers, all feeding a single ledger engine for balance calculation.

### Acceptance criteria

- [ ] The system stores one bank account and one cashbox with opening balances.
- [ ] Standalone income can be recorded against bank or cashbox.
- [ ] Generic movements can increase or decrease bank or cashbox.
- [ ] Transfers move value between bank and cash without counting as income or expense.
- [ ] Cashbox may go negative and is shown clearly.

## Slice 20: Expense Payment Cash Effects

- **Type**: AFK
- **Blocked by**: Slices 17, 19
- **User stories covered**: 93, 111, 112

### What to build

Wire paid expenses into the ledger so that expenses affect bank/cash balances only when explicitly marked paid.

### Acceptance criteria

- [ ] Unpaid expenses do not affect balances.
- [ ] Paid expenses reduce the selected money container.
- [ ] Expense paid date is captured.
- [ ] Reopening or correcting a paid-state change updates balances consistently.
- [ ] Profitability and cash views do not conflate incurred date with paid date.

## Slice 21: Bank Statement PDF Import

- **Type**: HITL
- **Blocked by**: Slice 19
- **User stories covered**: 96, 97, 98, 99, 100, 101, 106, 107

### What to build

Add PDF bank statement upload, immutable statement storage, parsing into transaction rows, and match-state classification.

### Acceptance criteria

- [ ] A bank statement PDF can be uploaded and stored permanently.
- [ ] Import creates a transaction batch with parsed rows.
- [ ] Each row is marked auto-matched, needs review, or unmatched.
- [ ] Parsing version and import metadata are stored.
- [ ] The imported statement remains reviewable after processing.

## Slice 22: Statement Review and Safe Auto-Matching

- **Type**: AFK
- **Blocked by**: Slices 16, 21
- **User stories covered**: 98, 99, 100, 101, 108, 109

### What to build

Add review workflows for parsed bank transactions, high-confidence invoice auto-match, manual reconciliation, and conversion of non-invoice income into standalone income.

### Acceptance criteria

- [ ] High-confidence full single-invoice matches can auto-close invoices.
- [ ] Partial or ambiguous matches go to review.
- [ ] Unmatched rows can remain unresolved, be marked irrelevant, or become standalone income.
- [ ] No auto-match closes one payment against multiple invoices in V1.
- [ ] Review actions are audit-logged.

## Slice 23: Operational Filters and Scoped Lists

- **Type**: AFK
- **Blocked by**: Slices 5, 6, 9, 12, 17, 19
- **User stories covered**: 58, 120

### What to build

Add consistent filtering and list views across tasks, time logs, expenses, invoices, and movements so the app remains usable with real data volume.

### Acceptance criteria

- [ ] Tasks can be filtered by project, task list, assignee, status, billing type, and deadline state.
- [ ] Time logs can be filtered by user, client, project, task, date range, and invoiced state.
- [ ] Expenses, invoices, and money movements expose the filters defined in the PRD.
- [ ] Filters respect role visibility boundaries.
- [ ] Default sorting is sensible and stable.

## Slice 24: Role-Aware Dashboard

- **Type**: AFK
- **Blocked by**: Slices 12, 16, 18, 19, 22
- **User stories covered**: 115, 116, 117, 118, 119

### What to build

Add the compact Bulgarian dashboard with different summaries for employee, manager, accountant, and admin roles.

### Acceptance criteria

- [ ] Employees see assigned and overdue work plus own uninvoiced time summary.
- [ ] Managers see project and invoiceable-work summaries.
- [ ] Accountants see unpaid invoices, recurring expenses, and statement review items.
- [ ] Admins see a broader combined summary.
- [ ] Dashboard data respects role-scoped finance visibility.

## Slice 25: Billing Reports

- **Type**: AFK
- **Blocked by**: Slices 16, 23
- **User stories covered**: 108, 109

### What to build

Add issued-revenue and collected-revenue views, plus invoice/payment lists for in-app analysis.

### Acceptance criteria

- [ ] Issued invoice totals are viewable separately from collected payment totals.
- [ ] Invoice lists and payment lists can be filtered by date and status.
- [ ] Overdue and unpaid states are visible.
- [ ] Managers see only scoped project/client billing views.
- [ ] Employees do not see these finance reports.

## Slice 26: Expense and Forecast Reports

- **Type**: AFK
- **Blocked by**: Slices 18, 20, 23
- **User stories covered**: 85, 86, 87, 88, 113, 119

### What to build

Add actual expense views, recurring future-expense views, and forecast summaries based on expenses and labor cost.

### Acceptance criteria

- [ ] Actual expenses are visible by date and category.
- [ ] Recurring future expenses are visible separately from actual expenses.
- [ ] Forecasts include future recurring expenses and projected labor cost.
- [ ] Cashflow forecasting is not present.
- [ ] Role visibility rules are enforced.

## Slice 27: Profitability Views

- **Type**: AFK
- **Blocked by**: Slices 16, 20, 23
- **User stories covered**: 51, 89, 90, 108, 109, 110, 111, 112

### What to build

Add company, client, and project profitability views using issued revenue, collected revenue, labor cost, direct expenses, and separate overhead.

### Acceptance criteria

- [ ] Profitability can be viewed at company, client, and project scope.
- [ ] Labor cost uses snapshotted cost rates.
- [ ] Direct expenses are linked to project/client when available.
- [ ] Overhead is shown separately rather than allocated automatically.
- [ ] Managers see scoped profitability only for their projects.

## Slice 28: Cash Position Views

- **Type**: AFK
- **Blocked by**: Slices 19, 20, 22, 23
- **User stories covered**: 109, 110, 111, 112, 114, 118

### What to build

Add bank balance, cashbox balance, and combined cash-position screens backed by the ledger.

### Acceptance criteria

- [ ] Current bank balance is visible.
- [ ] Current cashbox balance is visible and can be negative.
- [ ] Combined cash position is visible.
- [ ] Transfers do not affect income/expense reporting.
- [ ] Statement-imported and manually-entered movements reconcile into the same views.

## Slice 29: Sensitive Audit Review Screens

- **Type**: AFK
- **Blocked by**: Slices 10, 15, 16, 17, 21, 22
- **User stories covered**: 121, 122, 123

### What to build

Add basic audit visibility for security and finance-sensitive events so admins can inspect what happened.

### Acceptance criteria

- [ ] Admin can browse security audit events.
- [ ] Admin and accountant can browse finance-sensitive audit events as allowed.
- [ ] Invoice issuance, voiding, payment changes, expense changes, and statement review actions are visible.
- [ ] Manager/admin uninvoiced-log deletes are visible.
- [ ] Audit records are immutable from normal UI workflows.

## Slice 30: Go-Live Hardening

- **Type**: HITL
- **Blocked by**: Slices 15, 22, 24, 27, 28, 29
- **User stories covered**: 69, 96, 121, 176

### What to build

Complete pre-production hardening: legal PDF field verification, permission sweep, backup checks, attachment retention validation, and smoke-tested business-critical workflows.

### Acceptance criteria

- [ ] Invoice PDF legal field coverage is manually verified against the sample invoice.
- [ ] Role permissions are reviewed across core flows.
- [ ] Backup and restore strategy is validated.
- [ ] Sensitive workflows have smoke-test coverage.
- [ ] The app is ready for internal rollout.

## Dependency Summary

1. Bootstrap first: Slices 1-2
2. Operational backbone: Slices 3-11
3. Billing core: Slices 12-16
4. Expense and ledger core: Slices 17-20
5. Statement ingestion and reconciliation: Slices 21-22
6. Cross-cutting usability and reporting: Slices 23-29
7. Human signoff and release readiness: Slice 30

## Notes on Slice Quality

- Most slices are AFK because they can be implemented and verified without product decisions changing mid-flight.
- The HITL slices are the ones where human verification materially matters:
- invoice legal PDF acceptance
- bank statement parser behavior against real PDFs
- final go-live validation

## Suggested Next Use

This file is ready to be used in three ways:
- as a backlog source for issue creation
- as an implementation order for an AFK coding agent
- as a checkpoint list for product review after each slice
