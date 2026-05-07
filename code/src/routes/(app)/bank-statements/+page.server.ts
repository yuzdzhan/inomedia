import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { autoMatchStatementRows } from '$lib/server/statement-matching';
import type { Actions, PageServerLoad } from './$types';

function canManageStatements(role: string) {
	return role === 'admin' || role === 'accountant';
}

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst({ select: { id: true } });
	if (!company) {
		redirect(302, '/bootstrap');
	}
	return company;
}

function parseStatementRows(
	text: string
): Array<{ date: Date; description: string; amountCents: number }> {
	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);
	const results = [];
	for (const line of lines) {
		const parts = line.split(';');
		if (parts.length < 3) continue;
		const [dateStr, description, amountStr] = parts;
		let date: Date | null = null;
		if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
			date = new Date(dateStr.trim());
		} else if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr.trim())) {
			const [d, m, y] = dateStr.trim().split('.');
			date = new Date(`${y}-${m}-${d}`);
		}
		if (!date || isNaN(date.getTime())) continue;
		const amount = parseFloat(amountStr.trim().replace(',', '.'));
		if (isNaN(amount)) continue;
		const amountCents = Math.round(amount * 100);
		results.push({ date, description: description.trim(), amountCents });
	}
	return results;
}

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!canManageStatements(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await getCompanyOrRedirect();

	const statements = await db.bankStatement.findMany({
		where: { companyId: company.id },
		orderBy: { importedAt: 'desc' },
		select: {
			id: true,
			originalFilename: true,
			importedAt: true,
			parseStatus: true,
			parsingVersion: true,
			sizeBytes: true,
			importedByUser: { select: { firstName: true, lastName: true } },
			_count: { select: { rows: true } },
			rows: {
				where: { matchState: 'needs_review' },
				select: { id: true }
			}
		}
	});

	return {
		statements: statements.map((s) => ({
			id: s.id,
			originalFilename: s.originalFilename,
			importedAt: s.importedAt,
			parseStatus: s.parseStatus,
			parsingVersion: s.parsingVersion,
			sizeBytes: s.sizeBytes,
			importedByName: `${s.importedByUser.firstName} ${s.importedByUser.lastName}`.trim(),
			rowCount: s._count.rows,
			needsReviewCount: s.rows.length
		}))
	};
};

export const actions: Actions = {
	importStatement: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageStatements(locals.user.role)) {
			return fail(403, { importError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const file = formData.get('file');

		if (!file || !(file instanceof File)) {
			return fail(422, { importError: 'Моля, изберете файл за импортиране.' });
		}

		if (file.size === 0) {
			return fail(422, { importError: 'Избраният файл е празен.' });
		}

		const originalFilename = file.name;
		const contentType = file.type || 'application/octet-stream';
		const sizeBytes = file.size;
		const arrayBuffer = await file.arrayBuffer();
		const fileBlob = Buffer.from(arrayBuffer);

		let parsedRows: Array<{ date: Date; description: string; amountCents: number }> = [];
		let parseStatus = 'ok';

		try {
			const textDecoder = new TextDecoder('utf-8', { fatal: true });
			const text = textDecoder.decode(arrayBuffer);
			parsedRows = parseStatementRows(text);
			if (parsedRows.length === 0 && sizeBytes > 0) {
				parseStatus = 'parse_failed';
			}
		} catch {
			parseStatus = 'parse_failed';
		}

		const statement = await db.$transaction(async (tx) => {
			const stmt = await tx.bankStatement.create({
				data: {
					companyId: company.id,
					originalFilename,
					contentType,
					sizeBytes,
					fileBlob,
					parseStatus,
					parsingVersion: 'v1-csv',
					importedByUserId: locals.user!.id
				}
			});

			if (parsedRows.length > 0) {
				await tx.bankStatementRow.createMany({
					data: parsedRows.map((row, index) => ({
						statementId: stmt.id,
						rowIndex: index,
						transactionDate: row.date,
						description: row.description,
						amountCents: row.amountCents,
						matchState: 'unmatched' as const
					}))
				});
			}

			return stmt;
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'bank_statement_imported',
			entityType: 'bank_statement',
			entityId: statement.id,
			newValueJson: {
				originalFilename,
				sizeBytes,
				parseStatus,
				rowCount: parsedRows.length
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		// Run auto-matching after import (only if rows were parsed)
		let matchResult = { matched: 0, unmatched: parsedRows.length };
		if (parsedRows.length > 0 && parseStatus === 'ok') {
			matchResult = await autoMatchStatementRows(statement.id, company.id, locals.user.id);
		}

		const matchSummary =
			matchResult.matched > 0
				? ` Автоматично съвпадени: ${matchResult.matched}.`
				: '';

		return {
			importSuccess: `Извлечението е импортирано успешно. Разпознати редове: ${parsedRows.length}.${matchSummary}`
		};
	}
};
