## Problem Statement

The company needs a single internal web application to manage delivery work, time tracking, client billing, expenses, cash visibility, and Bulgarian-compliant invoicing in one place.

Today, the desired workflow spans several business concerns that are tightly connected:
- internal staff need to collaborate on client projects through task lists, tasks, comments, attachments, assignees, deadlines, and priorities
- employees need to log time against assigned tasks
- managers need to control projects, staffing, and invoiceable work
- accountants need to issue invoices, track payments, import bank statements, manage expenses, and review financial state
- leadership needs reliable views of issued revenue, collected revenue, costs, profitability, bank balance, and cashbox balance

The new system must be Bulgarian-only, EUR-only, suitable for one VAT-registered Bulgarian company, and must generate legally aligned invoice PDFs while keeping operational and financial records consistent.

## Solution

Build a private cloud-hosted internal web application for one company with four roles: `admin`, `manager`, `employee`, and `accountant`.

The product will combine:
- project and task operations for internal staff
- manual time tracking on assigned tasks
- task-based invoice drafting for one client at a time
- immutable issued invoices with sequential numbering and stored PDF snapshots
- expense management including one-time and recurring expenses
- one bank account and one cashbox with balance tracking
- bank statement PDF import with payment matching
- operational, billing, profitability, and cash-position reporting

The application will be Bulgarian-only end to end:
- Bulgarian UI
- Bulgarian invoice documents
- Bulgarian legal terminology
- Bulgaria time conventions
- EUR as the only currency

## User Stories

1. As an admin, I want to maintain the company legal profile, so that generated invoices use the correct Bulgarian legal data.
2. As an admin, I want to configure VAT and default payment settings, so that invoices are generated consistently.
3. As an admin, I want to create and deactivate user accounts, so that only current staff can access the system.
4. As an admin, I want to assign roles to users, so that permissions match business responsibilities.
5. As an admin, I want to define the initial invoice numbering state before issuance begins, so that the first issued invoice follows company policy.
6. As an admin, I want to manage expense categories, so that reports remain structured and controlled.
7. As an admin, I want to manage company settings in one place, so that cross-cutting behavior is predictable.
8. As a manager, I want to create clients, so that projects and billing can be organized by legal entity.
9. As a manager, I want each client to represent a legal entity, so that invoicing is legally coherent.
10. As a manager, I want to create projects for exactly one client, so that work and billing are scoped correctly.
11. As a manager, I want each project to have one primary manager, so that ownership is explicit.
12. As a manager, I want to assign users to projects, so that staffing is visible.
13. As a manager, I want to set project status, so that project lifecycle is controlled operationally.
14. As a manager, I want to mark projects as active, on hold, completed, or cancelled, so that logging and task work follow project reality.
15. As a manager, I want inactive or closed projects to block new time logging, so that historical data stays clean.
16. As a manager, I want to reopen projects when needed, so that real-world changes can be handled without data loss.
17. As a manager, I want to define project budgets by hours or amount, so that budget burn can be tracked.
18. As a manager, I want to optionally set a monthly retainer amount on a project, so that contract context is visible.
19. As a manager, I want to create task lists inside a project, so that work can be grouped cleanly.
20. As a manager, I want task lists to be archivable, so that obsolete groupings can be hidden without deletion.
21. As a manager, I want to create tasks inside exactly one task list, so that task grouping is unambiguous.
22. As a manager, I want tasks to support multiple assignees, so that collaboration can happen on shared work.
23. As a manager, I want tasks to have deadlines, so that the team can track due work.
24. As a manager, I want task deadlines to be date-only, so that scheduling stays simple and Bulgarian-timezone-safe.
25. As a manager, I want tasks to have a small priority model, so that teams can sort urgent work.
26. As a manager, I want tasks to use the statuses todo, in progress, done, and cancelled, so that workflow stays simple.
27. As a manager, I want tasks to remain commentable and attachable after completion, so that wrap-up discussion is still possible.
28. As a manager, I want tasks to support billing types hourly, flat fee, and non-billable, so that delivery work maps to billing rules.
29. As a manager, I want flat-fee tasks and hourly tasks to be mutually exclusive billing models, so that double billing cannot occur.
30. As a manager, I want internal projects under a protected internal client, so that non-billable company work uses the same model as client work.
31. As a manager, I want internal projects to be strictly non-billable, so that internal time never reaches client invoices.
32. As an employee, I want to see the tasks assigned to me, so that I know what work I own.
33. As an employee, I want to comment on tasks, so that I can collaborate with the team.
34. As an employee, I want to upload files and images to tasks and comments, so that work context is preserved.
35. As an employee, I want image previews for common image types, so that I can review visual files quickly.
36. As an employee, I want to log time only on tasks assigned to me, so that time tracking stays disciplined.
37. As an employee, I want to add manual time logs with a work date and duration, so that I can track work without a live timer.
38. As an employee, I want optional start and end times on time logs, so that I can be precise when needed.
39. As an employee, I want duration to be the source of truth, so that time entry stays simple.
40. As an employee, I want time to be entered only in 15-minute increments, so that billing stays consistent.
41. As an employee, I want the system to validate rather than silently round my time, so that my data is not changed unexpectedly.
42. As an employee, I want each time log to require a work description, so that logged work remains understandable.
43. As an employee, I want future-dated time logging to be blocked, so that forecasts are not polluted by speculative logs.
44. As an employee, I want my uninvoiced current-month time logs to remain editable, so that I can correct mistakes quickly.
45. As an employee, I want my older uninvoiced logs to be protected from casual edits, so that historical reporting stays more stable.
46. As a manager, I want to edit uninvoiced time logs on projects I manage, so that billing data can be cleaned up before invoicing.
47. As a manager, I want to delete uninvoiced team time logs with an audit trail, so that invalid entries can be removed safely.
48. As an admin, I want all invoiced time logs to be locked, so that issued invoices remain defensible and consistent.
49. As a manager, I want to see the billing type of tasks without exposing financial values to employees, so that staff know how to log work correctly.
50. As an employee, I want to be hidden from billing rates and financial values, so that sensitive finance data is restricted by role.
51. As a manager, I want to see project-scoped rates and invoiceable amounts, so that I can manage profitability on my projects.
52. As an accountant, I want read-only access to operational task context when needed, so that I can prepare invoices accurately.
53. As an accountant, I want to draft invoices for one client at a time, so that legal billing boundaries remain clean.
54. As an accountant, I want one invoice to include tasks from multiple projects for the same client, so that monthly billing can be consolidated.
55. As an accountant, I want to choose which tasks to include in an invoice, so that I can control what is billed this cycle.
56. As an accountant, I want selected hourly tasks to include all currently uninvoiced billable time on those tasks, so that billing is complete and deterministic.
57. As an accountant, I want selected flat-fee tasks to include the full flat fee once, so that fixed-price work is invoiced correctly.
58. As an accountant, I want non-selected tasks to remain available for future invoices, so that billing can be staged by task.
59. As an accountant, I want invoice drafts to reserve their selected billable items, so that duplicate drafting is prevented.
60. As an accountant, I want invoice drafts to snapshot selected content at draft time, so that reviewed totals do not drift automatically.
61. As an accountant, I want to manually refresh draft content when needed, so that late time can be intentionally pulled in.
62. As an accountant, I want invoice drafts to support stale indicators, so that forgotten reserved drafts are easier to spot.
63. As an accountant, I want invoice lines grouped by task only, so that invoice presentation stays clear and consistent.
64. As an accountant, I want to edit invoice line wording before issue, so that client-facing descriptions can be polished.
65. As an accountant, I want issue date, due date, and service period fields on invoices, so that documents reflect the billing period clearly.
66. As an accountant, I want due dates to default from client or company payment terms, so that billing is fast and consistent.
67. As an accountant, I want official invoice numbers assigned only at issue time, so that drafts do not consume legal numbers.
68. As an accountant, I want issued invoices to become immutable, so that legal and financial snapshots cannot drift afterward.
69. As an accountant, I want the final invoice PDF generated and stored at issue time, so that the legal document is preserved.
70. As an accountant, I want the issued invoice snapshot stored structurally as well, so that the app can render the issued document without depending on live task data.
71. As an accountant, I want invoice status to track draft, issued, partially paid, paid, overdue, and voided states, so that collections are visible.
72. As an accountant, I want issued invoices to be voidable but not editable, so that corrections happen safely through void and reissue.
73. As an accountant, I want manual payment recording on invoices, so that collected income is tracked precisely.
74. As an accountant, I want invoice payment method to support bank transfer or cash, so that money can land in the correct container.
75. As an accountant, I want the payment method on an issued unpaid invoice to remain editable, so that expected settlement method can be corrected.
76. As an accountant, I want recorded invoice payments to affect the bank account or cashbox automatically, so that balances stay accurate.
77. As an accountant, I want a dedicated invoiceable-work view, so that tasks ready for billing are easy to review.
78. As a manager, I want the invoiceable-work view to show invoiceable amounts for my projects, so that I can coordinate delivery with billing.
79. As an accountant, I want uninvoiced hourly task amounts calculated from snapshotted time-log rates, so that pre-invoice values are trustworthy.
80. As an admin, I want user rates to have date-based history, so that historical cost and billing context remain correct.
81. As an admin, I want each user to have both a cost rate and a default billable rate, so that profitability reporting is meaningful.
82. As a manager, I want project-specific billable rate overrides with history, so that client-specific pricing can change over time.
83. As a manager, I want task-level rate overrides for hourly tasks, so that exceptional pricing can be modeled explicitly.
84. As an accountant, I want time logs to snapshot the effective rates at log time, so that later rate changes do not rewrite history.
85. As an accountant, I want expenses to support one-time and recurring types, so that both actual and forecast costs can be managed.
86. As an accountant, I want recurring expenses to support monthly and yearly recurrence, so that predictable company costs can be forecast.
87. As an accountant, I want recurring expenses to auto-generate actual draft occurrences, so that repetitive finance entry is reduced.
88. As an accountant, I want generated recurring occurrences to stay editable, so that real-world deviations can be corrected.
89. As a manager, I want project-linked expenses, so that direct project profitability can be measured.
90. As an accountant, I want overhead expenses not linked to a client or project, so that company-wide costs remain visible.
91. As an accountant, I want managers to create and edit project-linked expenses, so that direct delivery costs can be captured near the work.
92. As an accountant, I want only admin and accountant roles to mark expenses as paid, so that cash-affecting events stay under finance control.
93. As an accountant, I want paid expenses to affect bank or cash balances only when marked paid, so that cash views stay real.
94. As an accountant, I want expense categories from a controlled admin-editable list, so that reporting remains consistent.
95. As an accountant, I want client-level and project-level expense links to be optional, so that overhead and direct costs can coexist.
96. As an accountant, I want imported bank statement PDFs stored permanently, so that payment parsing remains auditable.
97. As an accountant, I want a single statement import to create multiple transaction rows, so that monthly reconciliation is efficient.
98. As an accountant, I want imported transactions classified as auto-matched, needs review, or unmatched, so that statement processing is safe.
99. As an accountant, I want auto-match to apply only to high-confidence full single-invoice matches, so that false positives stay low.
100. As an accountant, I want partial payments supported manually but not auto-matched from PDFs, so that statement automation remains safe.
101. As an accountant, I want unmatched imported transactions preserved, so that not every income must come from an app-generated invoice.
102. As an accountant, I want standalone income records, so that non-invoice income still appears in company financial views.
103. As an accountant, I want one bank account tracked in the system, so that actual bank balance can be monitored.
104. As an accountant, I want one cashbox tracked in the system, so that cash income and cash expenses are visible alongside bank activity.
105. As an accountant, I want the cashbox to allow negative balance, so that delayed or incomplete cash capture does not force fake records.
106. As an accountant, I want generic money movements, so that bank and cash activity that is not a standard invoice or expense can still be recorded.
107. As an accountant, I want transfers between bank account and cashbox, so that internal money movements do not pollute income or expense reports.
108. As a leader, I want billing, profitability, and cash reports separated, so that business performance and money position are not conflated.
109. As a leader, I want both issued and collected revenue views, so that accrual-style and cash-style reporting can coexist.
110. As a leader, I want internal non-billable labor to count toward labor-cost reporting, so that the company sees the cost of internal work.
111. As a leader, I want company, client, and project profitability views, so that margin can be assessed at multiple levels.
112. As a leader, I want overhead shown separately rather than force-allocated, so that the system avoids false precision.
113. As a leader, I want forecast reports based on uninvoiced work, flat-fee work, project budgets, recurring expenses, and projected labor cost, so that planning is grounded in real data.
114. As a leader, I want cashflow forecasting excluded from V1, so that the first release does not imply predictive accuracy it cannot support.
115. As a user, I want a small role-aware dashboard, so that my home screen reflects my responsibilities.
116. As an employee, I want my dashboard to show my tasks and my uninvoiced time summary, so that I can manage my work.
117. As a manager, I want my dashboard to show project and invoiceable-work summaries, so that I can steer delivery.
118. As an accountant, I want my dashboard to show unpaid invoices, recurring expenses, and statement review items, so that daily finance work is obvious.
119. As an admin, I want an overall dashboard view, so that I can supervise operations and finance together.
120. As a user, I want strong filtering across clients, projects, tasks, time logs, expenses, invoices, and money movements, so that large datasets remain workable.
121. As an admin, I want sensitive finance and security audit events recorded, so that important changes and access events are traceable.
122. As an admin, I want login, password reset, activation, deactivation, and role changes audited, so that account access remains reviewable.
123. As an accountant, I want invoice issuance, voiding, payment changes, expense changes, bank import actions, and privileged time-log changes audited, so that sensitive finance activity is defensible.
124. As the company, I want indefinite retention of invoices, statements, and uploaded business documents, so that records are preserved.

## Implementation Decisions

- The product is a greenfield internal monolithic web application for one company only.
- The system is Bulgarian-only in UI and documents, with EUR as the only currency.
- The company is VAT-registered, so VAT is modeled explicitly on invoices and expenses.
- Access roles are `admin`, `manager`, `employee`, and `accountant`.
- The core domain is built around clients, projects, task lists, tasks, comments, attachments, time logs, invoices, expenses, bank transactions, cashbox transactions, and reports.
- Clients are legal entities. Each project belongs to exactly one client.
- A protected built-in internal client is used for internal non-billable projects.
- Internal projects are strictly non-billable.
- Tasks belong to exactly one task list and support multiple assignees.
- Task statuses are `todo`, `in_progress`, `done`, and `cancelled`.
- Task priority is `low`, `medium`, `high`.
- No subtasks, dependencies, checklists, labels, or manual ordering are included in V1.
- Employees can log time only on assigned tasks.
- Time logging is manual/custom only. No live timer is included in V1.
- Time logs require work date, duration, and description; start/end times are optional.
- Duration must be a 15-minute increment. The system validates rather than rounds.
- Future-dated time logs are blocked.
- Employees may edit/delete their own uninvoiced time logs only in the current month.
- Managers may edit/delete uninvoiced logs on their managed projects before invoicing, with sensitive audit logging on deletes.
- Invoiced time logs are immutable.
- User rates are modeled as dated history records with cost rate and default billable rate.
- Project-user billable overrides are supported with effective dating.
- Task billing uses precedence: task override, then project-user override, then user default billable rate.
- Time logs snapshot effective rates at log time.
- Employees do not see financial values. Managers see project-scoped financial data. Accountants and admins see broader finance data.
- Invoices are created for one client at a time and may include tasks from multiple projects for that client.
- Invoice drafting is task-based, not time-log-selective in V1.
- For selected hourly tasks, all current uninvoiced billable time logs are included.
- For selected flat-fee tasks, the task’s full flat fee is included once.
- Non-selected tasks remain available for later invoices.
- Invoice drafts reserve selected billable items and snapshot their content at draft time.
- Invoice lines are grouped by task only.
- Official invoice number assignment and final PDF generation happen only at issue time.
- Invoice numbers are plain sequential and system-managed.
- Issued invoices are immutable. Corrections happen through void and reissue, not direct edit and not credit notes in V1.
- Issued invoice storage includes both immutable PDF and structured issued snapshot data.
- Invoice statuses support draft, issued, partially paid, paid, overdue, and voided.
- Payment method on invoices supports bank transfer and cash.
- Paid invoice records affect cash position only when payment is recorded, not when the invoice is issued.
- Expenses support one-time and recurring records.
- Recurring expenses support monthly and yearly schedules only.
- Recurring expense templates auto-generate actual draft occurrences.
- Expenses may be linked optionally to client and/or project; unlinked expenses are overhead.
- Managers may create/edit project-linked expenses, but only accountants/admins may mark expenses as paid.
- The system tracks exactly one bank account and one cashbox in V1.
- Cashbox balance is allowed to go negative and should be surfaced as a warning state.
- Standalone income, generic money movements, and bank-cash transfers are supported.
- Bank statement import supports PDF only in V1.
- Statement imports store the original PDF permanently and produce transaction rows with match states.
- Automatic statement matching is limited to high-confidence full matches for one invoice.
- Partial payments are supported manually but not auto-matched from statement PDFs.
- Reports are view-only in V1 and separated into billing, expenses, profitability, and cash-position families.
- Forecasting includes uninvoiced work, flat-fee work, project budget burn, recurring future expenses, and projected labor cost.
- Cashflow forecasting is out of scope in V1.
- The app includes a role-aware dashboard with compact operational and finance widgets.
- File storage is app-managed with metadata records and common-image previews.
- File renaming, ZIP download, and merged invoice-plus-supporting-document PDFs are out of scope.
- Documents and uploaded business files are retained indefinitely in V1.
- Hosting is private cloud-hosted with relational data storage, object/file storage, backups, and no microservice split.
- Delivery is planned in phased milestones:
- Milestone 1: core operations
- Milestone 2: billing
- Milestone 3: finance and reporting

## Testing Decisions

- Good tests should validate externally observable behavior and business rules, not internal implementation details.
- High-value tests should focus on irreversible or sensitive workflows: invoice issuance, time-log locking, payment effects, VAT totals, recurring expense generation, and bank/cash balance calculation.
- Modules that should be tested first:
- role-based permission rules
- rate resolution and rate snapshotting
- time-log validation and locking behavior
- task invoiceability calculation
- invoice draft reservation and snapshotting
- invoice numbering and issue-time immutability
- invoice totals, VAT calculation, and payment state transitions
- recurring expense occurrence generation
- bank/cash ledger balance calculation
- bank statement transaction matching rules
- profitability and forecast aggregation logic
- document retention and sensitive audit event recording
- Deep modules should be extracted where possible for deterministic testing:
- billing engine for invoiceable task selection and line generation
- rate engine for effective-rate resolution
- ledger engine for bank/cash balance effects
- reporting engine for profitability and forecast aggregation
- parser/matching pipeline for bank statement imports
- In a greenfield codebase, tests should establish a pattern of:
- domain-level unit tests for pure business rules
- integration tests for end-to-end workflows across persistence boundaries
- PDF-generation verification focused on required legal fields and totals rather than pixel-perfect output
- Because the repository is currently empty, prior art for tests does not yet exist in-code; the initial implementation should create a strong testing baseline around the domain modules above.

## Out of Scope

- Multi-company or multi-tenant support
- Multiple currencies or FX conversion
- Non-Bulgarian UI or multi-language support
- Full Bulgarian accounting software behavior
- General ledger, chart of accounts, VAT declarations, bank reconciliation accounting exports
- Credit notes in V1
- Recurring invoices
- Client portals or external client logins
- Self-signup or SSO
- 2FA or IP allowlisting
- Email/SMS/in-app notifications beyond passive UI state
- Mobile-native applications
- Live timers
- Subtasks, task dependencies, task labels, task checklists
- Manual ordering of task lists or tasks
- Report export or printable non-invoice reports
- Data import/migration features other than bank statement PDF upload
- CSV bank statement import in V1
- Automatic partial-payment matching from PDFs
- Automatic allocation of overhead across projects
- Cashflow forecasting
- File ZIP download
- File renaming
- Merging supporting documents into invoice PDFs
- Pixel-perfect cloning of the provided invoice sample

## Further Notes

- The invoice PDF must remain legally aligned with the provided Bulgarian sample document, but the visual design may be improved rather than copied exactly.
- The implementation should verify the exact required legal invoice fields from the provided sample PDF before final PDF work begins.
- The repository is currently empty, so this PRD assumes a greenfield implementation rather than adaptation of an existing application.
- The chosen phased rollout should be used to avoid coupling invoice/legal correctness work too early with every finance/reporting feature.
