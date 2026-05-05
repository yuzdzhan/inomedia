# Phased Implementation Plan V1

## Overview

This plan breaks the PRD into delivery milestones for a greenfield monolithic internal web app.

Guiding principles:
- deliver operational value early
- isolate legally sensitive billing work
- keep finance and cash logic behind explicit domain modules
- avoid premature complexity

## Recommended Delivery Sequence

1. Foundation
2. Core operations
3. Billing and invoicing
4. Expenses and recurring costs
5. Cash ledger and bank statement import
6. Reporting and dashboards
7. Hardening and go-live readiness

## Phase 1: Foundation

## Goals

- Establish the monolith structure.
- Set up authentication, authorization, and core infrastructure.
- Create the baseline domain model and persistence patterns.

## Scope

- application shell
- Bulgarian-only localization baseline
- authentication with admin-created accounts
- role-based authorization
- company bootstrap
- protected internal client bootstrap
- attachment storage infrastructure
- sensitive audit-event infrastructure
- common UI layout and navigation

## Modules

- auth and session management
- role permission layer
- company settings
- attachment storage
- audit logging
- base CRUD infrastructure

## Deliverables

- users can log in
- admins can manage users and roles
- company settings can be stored
- attachments can be uploaded and linked to records
- sensitive actions can be audit-logged

## Exit Criteria

- one-company bootstrap works
- role restrictions are enforceable
- file storage and metadata work end to end
- Bulgarian UI baseline is in place

## Phase 2: Core Operations

## Goals

- Enable project and task workflow for internal staff.
- Enable manual time tracking with correct restrictions.

## Scope

- clients
- client contacts
- projects
- project memberships
- task lists
- tasks
- task assignments
- task comments
- task attachments and comment attachments
- deadlines and priority
- time logs
- user rate history
- project-user billable override history
- task billing type and pricing fields

## Modules

- client management
- project management
- task management
- collaboration
- time tracking
- rate resolution
- time-log policy engine

## Deliverables

- managers can create clients and projects
- managers can create task lists and tasks
- employees can comment and attach files to tasks
- employees can log manual time on assigned tasks
- managers can edit or delete uninvoiced team logs before invoicing
- employees cannot see financial values

## Exit Criteria

- task and time workflows function reliably
- task assignment restrictions are enforced
- 15-minute validation works
- invoiced-lock policy hooks are ready for billing phase

## Phase 3: Billing and Invoicing

## Goals

- Turn tracked work into draft and issued invoices.
- Lock financial snapshots safely at issue time.

## Scope

- invoiceable task view
- invoice drafts
- task selection for invoice drafting
- reserved invoiceable content
- invoice lines grouped by task
- service period handling
- due date handling
- client and company payment-term precedence
- invoice numbering
- issue-time snapshotting
- Bulgarian invoice PDF generation
- invoice payment recording
- payment method handling
- invoice statuses
- void and reissue flow

## Modules

- invoiceable work projection
- invoice drafting
- invoice issuance
- Bulgarian invoice rendering
- payment recording
- client billing data management

## Deliverables

- accountant can draft invoices for one client
- selected hourly tasks include all uninvoiced time at snapshot time
- selected flat-fee tasks invoice once in full
- issued invoices receive sequential numbers
- issued invoices generate immutable PDFs
- invoice payments can be recorded as bank or cash

## Exit Criteria

- invoice totals and VAT are correct
- issued invoices are immutable
- invoiced time logs are locked
- invoice payment states update correctly

## Phase 4: Expenses and Recurring Costs

## Goals

- Add actual expense tracking and future recurring expense support.

## Scope

- expense categories
- one-time expenses
- recurring expense templates
- generated recurring occurrences
- project-linked and overhead expenses
- paid/unpaid state
- finance-only pay actions

## Modules

- expense management
- recurring expense engine
- expense payment effects

## Deliverables

- admin can manage categories
- accountant can create expenses
- manager can create and edit project-linked expenses
- recurring monthly and yearly templates generate actual draft occurrences
- only admin/accountant can mark expenses as paid

## Exit Criteria

- recurring generation is stable
- expense reports can distinguish actual and future recurring items
- paid expenses are ready to affect cash position in the next phase

## Phase 5: Cash Ledger and Bank Statement Import

## Goals

- Track actual money position across one bank account and one cashbox.
- Add PDF bank statement ingestion and reconciliation support.

## Scope

- bank account
- cashbox
- invoice-payment cash effects
- expense-payment cash effects
- standalone income
- generic money movements
- transfers between bank and cashbox
- bank statement PDF import batches
- parsed statement transactions
- auto-match, needs-review, unmatched states
- manual reconciliation actions

## Modules

- ledger engine
- bank statement import pipeline
- statement matching rules
- cash-position projection

## Deliverables

- accountant can see actual bank balance
- accountant can see cashbox balance, including negative states
- standalone income can be recorded
- generic adjustments can be recorded
- transfers move value between bank and cash without polluting income/expense
- imported statement rows can auto-match or enter review

## Exit Criteria

- cash position is internally consistent
- transfers do not affect profitability
- imported statement PDFs are preserved
- unmatched income can remain stored and classified later

## Phase 6: Reporting and Dashboards

## Goals

- Surface useful operational and financial views without export features.

## Scope

- role-aware dashboard
- billing reports
- expense reports
- profitability reports
- cash-position views
- forecast views
- filtering across major lists

## Modules

- dashboard read models
- reporting engine
- filter/query layer

## Deliverables

- employee dashboard
- manager dashboard
- accountant dashboard
- admin dashboard
- company, client, and project profitability views
- issued vs collected revenue views
- forecast views for uninvoiced work, recurring expenses, labor cost, and budget burn

## Exit Criteria

- reports are understandable and role-scoped
- financial views match underlying ledger and billing truth
- filters keep large datasets manageable

## Phase 7: Hardening and Go-Live Readiness

## Goals

- Stabilize legal, financial, and operational behavior before production use.

## Scope

- legal invoice field verification against sample PDF
- permission review
- audit coverage review
- backup and restore checks
- attachment retention validation
- data integrity checks
- production deployment readiness

## Modules

- validation and safeguards
- operations runbook
- deployment configuration

## Deliverables

- invoice layout and legal field verification complete
- backup strategy confirmed
- sensitive audit events reviewed
- initial admin operating guide prepared

## Exit Criteria

- invoices are legally aligned
- balance-affecting workflows are trusted
- production deployment is supportable

## Cross-Cutting Workstreams

## Permission Model

Apply consistently in every phase:
- `admin`: full access
- `manager`: project/client/task operational control, scoped financial visibility
- `employee`: assigned work and own time only, no financial values
- `accountant`: finance-heavy access, read-only operational context where needed

## Audit Strategy

Implement early, then expand coverage:
- security events in foundation
- billing events in invoicing
- expense and payment events in finance
- statement review actions in bank import

## File Strategy

Single app-managed file storage with metadata:
- invoices
- task files
- comment files
- expense documents
- bank statement PDFs

## Suggested Internal Milestones

## Milestone A

Foundation + Core Operations

Usefulness:
- team can manage work and track time

## Milestone B

Billing and Invoicing

Usefulness:
- company can issue compliant invoices from tracked work

## Milestone C

Expenses + Cash Ledger + Statement Import

Usefulness:
- company can see actual finance state, not just invoices

## Milestone D

Reports + Hardening

Usefulness:
- leadership and finance gain complete V1 visibility

## Suggested Test Focus by Phase

## Phase 1

- authentication and role restrictions
- company bootstrap rules
- attachment metadata persistence
- audit event creation

## Phase 2

- task assignment permissions
- time-log validation
- 15-minute increment rules
- overlap detection when start/end are present
- employee edit window rules
- manager edit/delete rules
- effective rate resolution

## Phase 3

- invoiceable task projection
- task selection snapshot behavior
- reservation behavior
- VAT and total calculation
- invoice numbering
- issue-time locking
- payment status transitions

## Phase 4

- recurring occurrence generation
- expense paid-state behavior
- manager vs accountant expense permissions

## Phase 5

- ledger effects from payments and movements
- transfer neutrality
- statement parsing persistence
- safe auto-match rules
- unmatched transaction handling

## Phase 6

- profitability aggregation
- issued vs collected reporting
- forecast calculations
- dashboard scoping by role

## Key Risks

## Legal Output Risk

Risk:
- invoice PDF may miss required Bulgarian legal details

Mitigation:
- verify sample invoice fields early in Phase 3 and again in Phase 7

## Financial Consistency Risk

Risk:
- cash balances drift if payment and movement effects are duplicated

Mitigation:
- centralize all balance effects in the ledger engine

## Statement Import Risk

Risk:
- PDF parsing is fragile

Mitigation:
- preserve original PDFs
- restrict auto-match to high-confidence cases
- route uncertain rows to review

## Scope Risk

Risk:
- operational, billing, and finance features compete for time

Mitigation:
- keep phase boundaries strict
- ship internal milestones instead of waiting for full completion

## Recommended First Build Order Inside the Repo

1. Auth, roles, company bootstrap, attachments, audit events
2. Clients, projects, task lists, tasks, assignments, comments
3. Time logs, rate history, billing-type rules
4. Invoiceable work read model
5. Invoice draft and issue flows
6. Bulgarian invoice PDF renderer
7. Expenses and recurring engine
8. Ledger for bank and cashbox
9. Statement import and reconciliation
10. Dashboards and reports

## Final Note

The PRD is broad but coherent. The safest path is to treat billing and cash logic as explicit domain modules early, rather than scattering those rules across controllers or screens. That will make later legal adjustments and reporting much easier.
