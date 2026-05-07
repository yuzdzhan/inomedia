import {
	canAccessProjectRegistry,
	canCreateOrManageProjects,
	canViewProjectFinancials,
	formatMoneyFromCents,
	normalizeOptionalProjectDescription,
	parseOptionalMoneyToCents
} from '$lib/server/project-policy';
import type { TaskBillingType, TaskPriority, TaskStatus } from '@prisma/client';

export { formatMoneyFromCents, parseOptionalMoneyToCents };

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
	todo: 'За изпълнение',
	in_progress: 'В процес',
	done: 'Завършена',
	cancelled: 'Отказана'
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
	low: 'Нисък',
	medium: 'Среден',
	high: 'Висок'
};

export const TASK_BILLING_TYPE_LABELS: Record<TaskBillingType, string> = {
	hourly: 'Почасово',
	flat_fee: 'Фиксирана цена',
	non_billable: 'Небилируема'
};

export function canAccessProjectTasks(role: string) {
	return canAccessProjectRegistry(role);
}

export function canManageProjectTasks(role: string) {
	return canCreateOrManageProjects(role);
}

export { canViewProjectFinancials };

export function normalizeTaskListName(value: string) {
	return value.replace(/\s+/g, ' ').trim();
}

export function normalizeTaskTitle(value: string) {
	return value.replace(/\s+/g, ' ').trim();
}

export function normalizeOptionalTaskDescription(value: string) {
	return normalizeOptionalProjectDescription(value);
}

export function parseOptionalDateInput(value: string) {
	const normalized = value.trim();
	if (!normalized) {
		return null;
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
		return new Date(Number.NaN);
	}

	const date = new Date(`${normalized}T00:00:00.000Z`);
	return Number.isNaN(date.getTime()) ? new Date(Number.NaN) : date;
}

export function formatDateForInput(value: Date | string | null | undefined) {
	if (!value) {
		return '';
	}

	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
