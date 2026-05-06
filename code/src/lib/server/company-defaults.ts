import type { Prisma, PrismaClient } from '@prisma/client';

const DEFAULT_EXPENSE_CATEGORY_NAMES = [
	'Наем',
	'Софтуер',
	'Маркетинг',
	'Офис консумативи',
	'Пътувания',
	'Счетоводни услуги'
] as const;

export const INTERNAL_CLIENT_LEGAL_NAME = 'Вътрешен клиент';

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function ensureCompanyDefaults(db: DbClient, companyId: string) {
	await ensureInternalClient(db, companyId);
	await ensureDefaultExpenseCategories(db, companyId);
}

export async function ensureInternalClient(db: DbClient, companyId: string) {
	const existingInternalClient = await db.client.findFirst({
		where: { companyId, isInternal: true },
		select: { id: true, legalName: true, isProtectedSystem: true, status: true }
	});

	if (!existingInternalClient) {
		await db.client.create({
			data: {
				companyId,
				legalName: INTERNAL_CLIENT_LEGAL_NAME,
				isInternal: true,
				isProtectedSystem: true,
				status: 'active'
			}
		});
		return;
	}

	if (!existingInternalClient.isProtectedSystem || existingInternalClient.status !== 'active') {
		await db.client.update({
			where: { id: existingInternalClient.id },
			data: {
				isProtectedSystem: true,
				status: 'active'
			}
		});
	}
}

export async function ensureDefaultExpenseCategories(db: DbClient, companyId: string) {
	for (const name of DEFAULT_EXPENSE_CATEGORY_NAMES) {
		await db.expenseCategory.upsert({
			where: {
				companyId_name: {
					companyId,
					name
				}
			},
			update: {},
			create: {
				companyId,
				name
			}
		});
	}
}

export function getDefaultExpenseCategoryNames() {
	return [...DEFAULT_EXPENSE_CATEGORY_NAMES];
}
