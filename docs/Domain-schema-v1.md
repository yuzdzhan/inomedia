# Domain Schema V1

## Overview

This document translates the PRD into a domain-level schema for the V1 Bulgarian-only internal accounting and project operations app.

The model is designed for:
- one company only
- EUR only
- Bulgarian legal invoicing
- internal users only
- one bank account
- one cashbox

## Core Principles

- Clients are legal entities.
- Every project belongs to exactly one client.
- Tasks belong to exactly one task list.
- A task may have many assignees.
- Employees log time only on tasks assigned to them.
- Invoiced time logs are immutable.
- Invoices are issued per client and may include tasks from multiple projects for that client.
- Hourly billing is incremental by uninvoiced time logs on selected tasks.
- Flat-fee billing is one-time and full-value only.
- Internal projects exist under a protected internal client and are always non-billable.

## Enumerations

### UserRole

- `admin`
- `manager`
- `employee`
- `accountant`

### UserStatus

- `active`
- `inactive`

### ProjectStatus

- `active`
- `on_hold`
- `completed`
- `cancelled`

### TaskStatus

- `todo`
- `in_progress`
- `done`
- `cancelled`

### TaskPriority

- `low`
- `medium`
- `high`

### BillingType

- `hourly`
- `flat_fee`
- `non_billable`

### InvoiceStatus

- `draft`
- `issued`
- `partially_paid`
- `paid`
- `overdue`
- `voided`

### PaymentMethod

- `bank_transfer`
- `cash`

### ExpenseType

- `one_time`
- `recurring`

### RecurrenceType

- `monthly`
- `yearly`

### MoneyContainerType

- `bank_account`
- `cashbox`

### MoneyMovementType

- `invoice_payment`
- `standalone_income`
- `expense_payment`
- `transfer`
- `generic_adjustment`

### StatementMatchStatus

- `auto_matched`
- `needs_review`
- `unmatched`

### AttachmentOwnerType

- `task`
- `task_comment`
- `expense`
- `invoice`
- `bank_statement_import`

## Aggregate Roots

## Company

Represents the single legal entity operating the system.

### Fields

- `id`
- `legal_name`
- `eik_bulstat`
- `vat_number`
- `registered_address`
- `mol_name`
- `default_payment_term_days`
- `vat_registered` = `true`
- `currency` = `EUR`
- `timezone` = `Europe/Sofia`
- `invoice_next_number`
- `created_at`
- `updated_at`

### Owns / References

- expense categories
- bank account
- cashbox
- users
- company settings

## CompanySettings

Operational settings for the single company.

### Fields

- `id`
- `company_id`
- `max_upload_size_mb`
- `bank_statement_pdf_parser_key`
- `invoice_language` = `bg`
- `ui_language` = `bg`
- `created_at`
- `updated_at`

## User

Internal authenticated person.

### Fields

- `id`
- `company_id`
- `email`
- `password_hash`
- `first_name`
- `last_name`
- `status`
- `role`
- `created_at`
- `updated_at`
- `deactivated_at`

### Rules

- Users are never deleted.
- Inactive users cannot log in.

## UserRateHistory

Effective-dated rates for a user.

### Fields

- `id`
- `user_id`
- `effective_from`
- `cost_rate_eur`
- `default_billable_rate_eur`
- `created_at`

### Rules

- Later edits do not rewrite historical time logs.
- Effective range resolution uses latest record active on work date.

## Client

Legal billing entity.

### Fields

- `id`
- `company_id`
- `legal_name`
- `registration_number`
- `vat_number`
- `billing_address`
- `default_payment_term_days`
- `is_internal`
- `status`
- `created_at`
- `updated_at`

### Rules

- Exactly one protected internal client exists.
- Inactive clients remain in history but cannot receive new billing activity.

## ClientContact

Optional operational contacts under a client.

### Fields

- `id`
- `client_id`
- `name`
- `email`
- `phone`
- `role_title`
- `created_at`
- `updated_at`

## Project

Operational container for work under one client.

### Fields

- `id`
- `client_id`
- `name`
- `description`
- `status`
- `primary_manager_user_id`
- `budget_type`
- `budget_hours`
- `budget_amount_eur`
- `monthly_retainer_eur`
- `start_date`
- `target_end_date`
- `created_at`
- `updated_at`

### Rules

- Each project belongs to exactly one client.
- Internal-client projects must be non-billable in practice.
- Closed or inactive projects block new time logs.

## ProjectUser

Membership of users in projects.

### Fields

- `id`
- `project_id`
- `user_id`
- `created_at`

## ProjectUserBillableRateHistory

Effective-dated billable override per user per project.

### Fields

- `id`
- `project_id`
- `user_id`
- `effective_from`
- `effective_to`
- `billable_rate_eur`
- `created_at`

## TaskList

Grouping container for tasks within a project.

### Fields

- `id`
- `project_id`
- `name`
- `description`
- `is_archived`
- `created_at`
- `updated_at`

## Task

Core work item.

### Fields

- `id`
- `task_list_id`
- `title`
- `description`
- `status`
- `priority`
- `deadline_date`
- `billing_type`
- `flat_fee_eur`
- `task_billable_rate_override_eur`
- `created_by_user_id`
- `created_at`
- `updated_at`

### Derived Fields

- `financial_state`
  - `not_billable`
  - `billable_uninvoiced`
  - `fully_invoiced`

### Rules

- Tasks do not support subtasks, dependencies, labels, or checklists in V1.
- Flat-fee tasks are billed once in full.
- Non-billable tasks never appear in invoiceable work.

## TaskAssignment

Task to user assignment.

### Fields

- `id`
- `task_id`
- `user_id`
- `created_at`

## TaskComment

Task discussion entry.

### Fields

- `id`
- `task_id`
- `author_user_id`
- `body`
- `edited_at`
- `deleted_at`
- `created_at`
- `updated_at`

### Rules

- No mentions in V1.
- Soft-delete only.

## TimeLog

Manual time entry against a task.

### Fields

- `id`
- `task_id`
- `user_id`
- `work_date`
- `duration_minutes`
- `start_time`
- `end_time`
- `description`
- `cost_rate_snapshot_eur`
- `billable_rate_snapshot_eur`
- `billing_type_snapshot`
- `invoice_id`
- `invoice_line_id`
- `created_at`
- `updated_at`
- `deleted_at`

### Rules

- Duration must be divisible by 15.
- Future work dates are invalid.
- If `start_time` and `end_time` exist, overlapping logs for same user and date are blocked.
- If linked to an issued invoice, the log is immutable.

## Invoice

Billing document for one client.

### Fields

- `id`
- `company_id`
- `client_id`
- `status`
- `invoice_number`
- `issue_date`
- `due_date`
- `service_period_from`
- `service_period_to`
- `payment_method`
- `vat_rate`
- `net_total_eur`
- `vat_total_eur`
- `gross_total_eur`
- `paid_total_eur`
- `is_stale_draft`
- `last_updated_at`
- `issued_snapshot_json`
- `issued_pdf_attachment_id`
- `void_reason`
- `created_by_user_id`
- `created_at`
- `updated_at`

### Rules

- Draft invoices have no official number.
- Number assigned only on issue.
- Issued invoices are immutable.

## InvoiceTaskSelection

Reserved task content in a draft invoice.

### Fields

- `id`
- `invoice_id`
- `task_id`
- `snapshot_taken_at`
- `hourly_uninvoiced_value_snapshot_eur`
- `flat_fee_snapshot_eur`
- `created_at`

### Rules

- Selected hourly tasks include all uninvoiced billable logs at snapshot time.
- New logs added later are not automatically included.

## InvoiceLine

Client-facing line item.

### Fields

- `id`
- `invoice_id`
- `task_id`
- `description`
- `quantity`
- `unit_price_eur`
- `net_total_eur`
- `vat_rate`
- `vat_total_eur`
- `gross_total_eur`
- `sort_key`
- `created_at`

### Rules

- Lines are grouped by task only.
- Description editable before issue.

## InvoicePayment

Recorded payment against an invoice.

### Fields

- `id`
- `invoice_id`
- `payment_date`
- `amount_eur`
- `reference`
- `notes`
- `payment_method`
- `money_container_type`
- `bank_transaction_id`
- `cash_transaction_id`
- `created_by_user_id`
- `created_at`

## ExpenseCategory

Controlled category list.

### Fields

- `id`
- `company_id`
- `name`
- `is_active`
- `created_at`
- `updated_at`

## Expense

Actual expense record.

### Fields

- `id`
- `company_id`
- `type`
- `category_id`
- `client_id`
- `project_id`
- `title`
- `notes`
- `net_amount_eur`
- `vat_amount_eur`
- `gross_amount_eur`
- `incurred_date`
- `is_paid`
- `paid_date`
- `payment_method`
- `money_container_type`
- `created_by_user_id`
- `created_at`
- `updated_at`

### Rules

- Optional project/client link.
- Only paid expenses affect bank or cash balances.

## RecurringExpenseTemplate

Template for future recurring expenses.

### Fields

- `id`
- `company_id`
- `category_id`
- `client_id`
- `project_id`
- `title`
- `notes`
- `net_amount_eur`
- `vat_amount_eur`
- `gross_amount_eur`
- `recurrence_type`
- `start_date`
- `end_date`
- `is_active`
- `created_at`
- `updated_at`

## RecurringExpenseOccurrence

Generated occurrence instance.

### Fields

- `id`
- `template_id`
- `expense_id`
- `occurrence_date`
- `status`
- `created_at`

### Rules

- Automatically generated.
- Becomes actual expense through linked `expense_id`.

## BankAccount

The single tracked company bank account.

### Fields

- `id`
- `company_id`
- `bank_name`
- `iban`
- `currency` = `EUR`
- `opening_balance_eur`
- `opening_balance_date`
- `created_at`
- `updated_at`

## Cashbox

The single tracked company cashbox.

### Fields

- `id`
- `company_id`
- `name`
- `opening_balance_eur`
- `opening_balance_date`
- `created_at`
- `updated_at`

## BankStatementImport

Uploaded PDF import batch.

### Fields

- `id`
- `company_id`
- `bank_account_id`
- `attachment_id`
- `imported_by_user_id`
- `imported_at`
- `parser_version`

## BankStatementTransaction

Parsed transaction row from imported PDF.

### Fields

- `id`
- `bank_statement_import_id`
- `transaction_date`
- `amount_eur`
- `direction`
- `counterparty_name`
- `reference_text`
- `match_status`
- `matched_invoice_id`
- `linked_standalone_income_id`
- `linked_generic_movement_id`
- `marked_irrelevant_at`
- `reviewed_by_user_id`
- `reviewed_at`
- `created_at`

## StandaloneIncome

Income not represented by an app-issued invoice.

### Fields

- `id`
- `company_id`
- `client_id`
- `income_date`
- `amount_eur`
- `payer`
- `reference`
- `notes`
- `source_type`
- `bank_transaction_id`
- `cash_transaction_id`
- `created_by_user_id`
- `created_at`

## GenericMoneyMovement

Catch-all financial movement affecting bank or cash.

### Fields

- `id`
- `company_id`
- `movement_type`
- `direction`
- `movement_date`
- `amount_eur`
- `money_container_type`
- `reason`
- `notes`
- `created_by_user_id`
- `created_at`

## Transfer

Internal movement between bank account and cashbox.

### Fields

- `id`
- `company_id`
- `transfer_date`
- `amount_eur`
- `from_container_type`
- `to_container_type`
- `note`
- `created_by_user_id`
- `created_at`

## Attachment

Stored file with metadata.

### Fields

- `id`
- `owner_type`
- `owner_id`
- `original_filename`
- `content_type`
- `file_size_bytes`
- `storage_key`
- `uploaded_by_user_id`
- `uploaded_at`
- `deleted_at`

### Rules

- No renaming in V1.
- Images support preview for common image types.
- File count is not explicitly capped in V1.

## AuditEvent

Sensitive finance and security event log.

### Fields

- `id`
- `company_id`
- `actor_user_id`
- `event_type`
- `entity_type`
- `entity_id`
- `old_value_json`
- `new_value_json`
- `reason`
- `created_at`

### Covered Events

- invoice issued
- invoice voided
- invoice payment added or edited
- bank statement import and match actions
- expense create, edit, delete
- user activation and deactivation
- role changes
- login success and failure
- password reset
- manager/admin delete of uninvoiced team time logs
- privileged edits to protected financial records

## Key Relationships

- Company `1 -> many` Users
- Company `1 -> many` Clients
- Client `1 -> many` Projects
- Project `1 -> many` TaskLists
- TaskList `1 -> many` Tasks
- Task `1 -> many` TaskAssignments
- Task `1 -> many` TaskComments
- Task `1 -> many` TimeLogs
- User `1 -> many` TimeLogs
- User `1 -> many` UserRateHistory
- Project + User `1 -> many` ProjectUserBillableRateHistory
- Client `1 -> many` Invoices
- Invoice `1 -> many` InvoiceTaskSelections
- Invoice `1 -> many` InvoiceLines
- Invoice `1 -> many` InvoicePayments
- Company `1 -> many` Expenses
- Company `1 -> many` RecurringExpenseTemplates
- RecurringExpenseTemplate `1 -> many` RecurringExpenseOccurrences
- BankStatementImport `1 -> many` BankStatementTransactions
- Any supported record `1 -> many` Attachments

## Derived Read Models

These should be computed or materialized for performance, but not treated as user-managed truth.

### InvoiceableTaskView

For each task:
- client
- project
- task
- billing_type
- uninvoiced_time_minutes
- uninvoiced_amount_eur
- last_uninvoiced_work_date
- financial_state

### DashboardView

Role-aware summary:
- employee: assigned tasks, overdue tasks, uninvoiced own time
- manager: project summaries, invoiceable task totals
- accountant: unpaid invoices, recurring expenses, import review queue
- admin: combined operational and finance overview

### ProfitabilityView

Per company, client, or project:
- issued_revenue
- collected_revenue
- labor_cost
- direct_expenses
- overhead_separate
- margin_on_issued_basis

### CashPositionView

- bank_balance
- cashbox_balance
- combined_cash_position

## Domain Invariants

- Exactly one company exists in V1.
- Exactly one internal client exists and is protected.
- Exactly one bank account exists in V1.
- Exactly one cashbox exists in V1.
- Employees cannot access financial values.
- A project must belong to exactly one client.
- A task must belong to exactly one task list.
- A time log must belong to exactly one task and one user.
- A time log linked to an issued invoice cannot be edited or deleted.
- A flat-fee task can only be invoiced once.
- A non-billable task can never appear on an invoice.
- An issued invoice cannot be edited.
- Invoice numbers are unique and sequential.
- Money affects bank/cash only through recorded payments, paid expenses, standalone income, generic movements, or transfers.
- Transfers do not count as income or expense.

## Suggested Deep Modules

- `rate-resolution`
  Resolves the effective cost and billable rates for a task and user on a work date.

- `time-log-policy`
  Enforces 15-minute increments, optional overlap checks, edit rules, and invoiced locking.

- `invoice-drafting`
  Selects eligible tasks, snapshots uninvoiced content, creates draft lines, and reserves billable items.

- `invoice-issuance`
  Assigns official number, freezes snapshot, generates totals, and stores final PDF.

- `expense-recurrence`
  Generates recurring occurrences and links them to actual expense records.

- `ledger`
  Applies cash effects to bank and cashbox based on payments and movements.

- `statement-import`
  Parses bank PDFs into transaction rows and applies safe matching rules.

- `reporting`
  Aggregates billing, profitability, and cash-position read models.
