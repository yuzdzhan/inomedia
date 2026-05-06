import type { ProjectStatus, UserRole } from '@prisma/client';

export const PROJECT_REGISTRY_ROLES = ['admin', 'manager', 'accountant'] as const;
export const PROJECT_MANAGER_ROLES = ['admin', 'manager'] as const;

export function canAccessProjectRegistry(role: string) {
	return PROJECT_REGISTRY_ROLES.includes(role as (typeof PROJECT_REGISTRY_ROLES)[number]);
}

export function canCreateOrManageProjects(role: string) {
	return PROJECT_MANAGER_ROLES.includes(role as (typeof PROJECT_MANAGER_ROLES)[number]);
}

export function canBePrimaryProjectManager(role: UserRole) {
	return PROJECT_MANAGER_ROLES.includes(role as (typeof PROJECT_MANAGER_ROLES)[number]);
}

export function normalizeProjectName(value: string) {
	return value.replace(/\s+/g, ' ').trim();
}

export function normalizeOptionalProjectDescription(value: string) {
	const normalized = value
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	return normalized.length > 0 ? normalized : null;
}

export function parseOptionalMoneyToCents(value: string) {
	const normalized = value.trim().replace(',', '.');
	if (!normalized) {
		return null;
	}

	if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
		return Number.NaN;
	}

	return Math.round(Number(normalized) * 100);
}

export function formatMoneyFromCents(value: number | null | undefined) {
	if (value == null) {
		return '';
	}

	return (value / 100).toFixed(2);
}

export function getProjectStatusLabel(status: ProjectStatus) {
	switch (status) {
		case 'active':
			return 'Активен';
		case 'on_hold':
			return 'На пауза';
		case 'completed':
			return 'Завършен';
		case 'cancelled':
			return 'Отказан';
	}
}
