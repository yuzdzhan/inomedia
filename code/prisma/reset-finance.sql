-- One-off reset of financial data (2026-10-01), so 2026 can be re-imported from the bank statement.
-- Keeps: users, company, clients, projects, tasks, time logs, expense categories, and every invoice
-- issued in the app (with its stored PDF snapshot). Payments are re-derived from the bank statement,
-- so issued invoices go back to unpaid.
BEGIN;

DELETE FROM courier_payout_line;
DELETE FROM courier_payout;
DELETE FROM shop_order;

DELETE FROM bank_statement_row;
DELETE FROM bank_statement;
DELETE FROM ledger_entry;

DELETE FROM invoice_payment;
UPDATE invoice
SET "paidTotalCents" = 0, status = 'issued', "lastUpdatedAt" = now()
WHERE status IN ('paid', 'partially_paid');

DELETE FROM expense_attachment;
DELETE FROM expense;
DELETE FROM recurring_expense_template;

DELETE FROM standalone_income_attachment;
DELETE FROM standalone_income;

-- Opening balances as of 2026-01-01; the bank one is set separately from the real statement.
UPDATE money_container SET "openingBalanceCents" = 0;

COMMIT;
