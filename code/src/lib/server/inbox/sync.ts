import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { InboxDocument, Prisma } from '@prisma/client';
import { db } from '../db';
import { extractPdfText, parseDocumentText, type ParsedDocument } from './parse';
import { matchInvoice, matchPayrollDues, matchPayrollSheets, type MatchOutcome } from './match';

export function inboxConfigured() {
	return Boolean(env.IMAP_HOST && env.IMAP_USER && env.IMAP_PASSWORD);
}

export type InboxSyncResult = { messages: number; documents: number; duplicates: number; matched: number; pending: number; errors: string[] };

const isDocument = (contentType: string, size: number, disposition?: string) =>
	contentType === 'application/pdf' || (/^image\/(png|jpe?g)$/.test(contentType) && size > 30_000 && disposition !== 'inline');

/**
 * Reads new e-mails from invoices@ (read-only: nothing is flagged, moved or
 * deleted), stores their documents once each, and puts every new or still
 * pending document where it belongs.
 */
export async function syncInbox(companyId: string): Promise<InboxSyncResult> {
	const result: InboxSyncResult = { messages: 0, documents: 0, duplicates: 0, matched: 0, pending: 0, errors: [] };

	const client = new ImapFlow({
		host: env.IMAP_HOST!,
		port: Number(env.IMAP_PORT ?? 993),
		secure: true,
		auth: { user: env.IMAP_USER!, pass: env.IMAP_PASSWORD! },
		logger: false
	});
	await client.connect();
	try {
		const lock = await client.getMailboxLock('INBOX', { readOnly: true });
		try {
			const known = new Set(
				(await db.inboxMessage.findMany({ where: { companyId }, select: { messageId: true } })).map((m) => m.messageId)
			);
			for await (const msg of client.fetch('1:*', { uid: true, envelope: true, source: true }, { uid: true })) {
				const messageId = msg.envelope?.messageId ?? `uid-${msg.uid}`;
				if (known.has(messageId) || !msg.source) continue;
				try {
					await storeMessage(companyId, msg.uid, messageId, msg.source, result);
				} catch (e) {
					result.errors.push(`${msg.envelope?.subject ?? messageId}: ${e instanceof Error ? e.message : e}`);
				}
			}
		} finally {
			lock.release();
		}
	} finally {
		await client.logout().catch(() => {});
	}

	await processPending(companyId, result);
	return result;
}

async function storeMessage(companyId: string, uid: number, messageId: string, source: Buffer, result: InboxSyncResult) {
	const mail = await simpleParser(source);
	const message = await db.inboxMessage.create({
		data: {
			companyId,
			imapUid: uid,
			messageId,
			fromAddress: mail.from?.text ?? null,
			subject: mail.subject ?? null,
			receivedAt: mail.date ?? new Date()
		}
	});
	result.messages++;

	for (const att of mail.attachments) {
		if (!isDocument(att.contentType, att.size, att.contentDisposition)) continue;
		const blob = new Uint8Array(att.content);
		const sha256 = createHash('sha256').update(blob).digest('hex');
		if (await db.inboxDocument.findUnique({ where: { companyId_sha256: { companyId, sha256 } }, select: { id: true } })) {
			result.duplicates++;
			continue;
		}
		const filename = att.filename ?? `document-${sha256.slice(0, 8)}`;
		let parsed: ParsedDocument | null = null;
		if (att.contentType === 'application/pdf') {
			try {
				parsed = parseDocumentText(await extractPdfText(blob), filename);
			} catch {
				parsed = null;
			}
		}
		await db.inboxDocument.create({
			data: {
				companyId,
				messageId: message.id,
				filename,
				contentType: att.contentType,
				sizeBytes: blob.length,
				blob,
				sha256,
				kind: parsed?.kind ?? 'unknown',
				supplier: parsed?.supplier ?? null,
				supplierId: parsed?.supplierId ?? null,
				documentNumber: parsed?.documentNumber ?? null,
				documentDate: parsed?.documentDate ? new Date(`${parsed.documentDate}T00:00:00Z`) : null,
				totalCents: parsed?.totalCents ?? null,
				currency: parsed?.currency ?? null,
				paidInCash: parsed?.paidInCash ?? false,
				period: parsed?.period ?? null,
				parsedJson: (parsed ?? {}) as Prisma.InputJsonValue
			}
		});
		result.documents++;
	}
}

/** Tries every pending document again – new bank statements may have arrived since. */
export async function processPending(companyId: string, result?: InboxSyncResult, onlyId?: string) {
	const pending = await db.inboxDocument.findMany({
		where: { companyId, status: 'pending', ...(onlyId ? { id: onlyId } : {}) },
		orderBy: { createdAt: 'asc' }
	});

	// Read unrecognised PDFs again – the parser may have learned their format since.
	for (const [i, doc] of pending.entries()) {
		if (doc.kind !== 'unknown' || doc.contentType !== 'application/pdf') continue;
		const parsed = parseDocumentText(await extractPdfText(doc.blob), doc.filename);
		if (parsed.kind === 'unknown') continue;
		pending[i] = await db.inboxDocument.update({
			where: { id: doc.id },
			data: {
				kind: parsed.kind,
				supplier: parsed.supplier,
				supplierId: parsed.supplierId,
				documentNumber: parsed.documentNumber,
				documentDate: parsed.documentDate ? new Date(`${parsed.documentDate}T00:00:00Z`) : null,
				totalCents: parsed.totalCents,
				currency: parsed.currency,
				paidInCash: parsed.paidInCash,
				period: parsed.period,
				parsedJson: parsed as unknown as Prisma.InputJsonValue
			}
		});
	}

	const apply = async (doc: InboxDocument, outcome: MatchOutcome) => {
		await db.inboxDocument.update({
			where: { id: doc.id },
			data: { status: outcome.status, note: outcome.note, expenseId: outcome.expenseId ?? undefined }
		});
		if (result) outcome.status === 'pending' ? result.pending++ : result.matched++;
	};

	// Payroll sheets are handled per month together, so the net pay is booked once.
	const sheetsByPeriod = new Map<string, InboxDocument[]>();
	for (const doc of pending) {
		try {
			if (doc.kind === 'payroll_sheet' && doc.period) {
				sheetsByPeriod.set(doc.period, [...(sheetsByPeriod.get(doc.period) ?? []), doc]);
			} else if (doc.kind === 'payroll_dues') {
				const parsed = doc.parsedJson as unknown as ParsedDocument;
				await apply(doc, await matchPayrollDues(companyId, doc, parsed.payrollDues ?? []));
			} else if (doc.kind === 'invoice' || doc.kind === 'credit_note') {
				await apply(doc, await matchInvoice(companyId, doc));
			} else if (result) {
				result.pending++;
			}
		} catch (e) {
			result?.errors.push(`${doc.filename}: ${e instanceof Error ? e.message : e}`);
		}
	}
	for (const [period, docs] of sheetsByPeriod) {
		const net = docs
			.map((d) => (d.parsedJson as unknown as ParsedDocument).netPayCents)
			.find((c): c is number => typeof c === 'number' && c > 0) ?? null;
		try {
			const outcome = await matchPayrollSheets(companyId, period, net, docs);
			for (const d of docs) await apply(d, outcome);
		} catch (e) {
			result?.errors.push(`Ведомост ${period}: ${e instanceof Error ? e.message : e}`);
		}
	}
}

let running: Promise<InboxSyncResult | null> | null = null;

/** Periodic sync; skips a run while the previous one is still going. */
export function scheduleInboxSync(intervalMs = 30 * 60_000) {
	const tick = async () => {
		if (running || !inboxConfigured()) return;
		running = (async () => {
			const company = await db.company.findFirst({ select: { id: true } });
			return company ? syncInbox(company.id) : null;
		})()
			.catch((e) => {
				console.error('[inbox] sync failed:', e);
				return null;
			})
			.finally(() => {
				running = null;
			});
	};
	setTimeout(tick, 60_000);
	setInterval(tick, intervalMs);
}
