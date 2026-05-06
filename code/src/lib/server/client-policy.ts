import type { ClientStatus } from '@prisma/client';

export const CLIENT_REGISTRY_ROLES = ['admin', 'manager', 'accountant'] as const;

export const PROTECTED_CLIENT_EDIT_ERROR =
	'Защитеният вътрешен клиент не може да бъде променян от този екран.';

export const INACTIVE_CLIENT_BILLING_ERROR =
	'Неактивните клиенти остават видими в историята, но не могат да получават нова фактурируема активност.';

export function canAccessClientRegistry(role: string) {
	return CLIENT_REGISTRY_ROLES.includes(role as (typeof CLIENT_REGISTRY_ROLES)[number]);
}

export function canCreateOrManageClients(role: string) {
	return role === 'admin' || role === 'manager';
}

export function canEditClientBilling(role: string) {
	return role === 'admin' || role === 'manager' || role === 'accountant';
}

export function canManageClientContacts(role: string) {
	return role === 'admin' || role === 'manager';
}

export function canChangeClientLifecycle(role: string) {
	return role === 'admin' || role === 'manager';
}

export function normalizeOptionalText(value: string) {
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized.length > 0 ? normalized : null;
}

export function normalizeOptionalMultilineText(value: string) {
	const normalized = value
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	return normalized.length > 0 ? normalized : null;
}

export function assertClientCanReceiveBillingActivity(status: ClientStatus) {
	if (status !== 'active') {
		throw new Error(INACTIVE_CLIENT_BILLING_ERROR);
	}
}
