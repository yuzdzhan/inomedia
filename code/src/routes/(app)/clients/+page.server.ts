import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { ensureCompanyDefaults } from '$lib/server/company-defaults';
import {
	canAccessClientRegistry,
	canChangeClientLifecycle,
	canCreateOrManageClients,
	canEditClientBilling,
	canManageClientContacts,
	normalizeOptionalMultilineText,
	normalizeOptionalText,
	PROTECTED_CLIENT_EDIT_ERROR
} from '$lib/server/client-policy';
import type { Actions, PageServerLoad } from './$types';

const clientSchema = z.object({
	legalName: z.string().trim().min(2, 'Въведете правното наименование.').max(160, 'Името е твърде дълго.'),
	registrationNumber: z.string().trim().max(64, 'Регистрационният номер е твърде дълъг.').optional(),
	vatNumber: z.string().trim().max(64, 'ДДС номерът е твърде дълъг.').optional(),
	billingAddress: z.string().trim().max(500, 'Адресът е твърде дълъг.').optional(),
	defaultPaymentTermDays: z.union([
		z.literal(''),
		z.coerce
			.number()
			.int('Срокът трябва да е цяло число.')
			.min(1, 'Срокът трябва да е поне 1 ден.')
			.max(365, 'Срокът не може да е над 365 дни.')
	]),
	status: z.enum(['active', 'inactive']).default('active')
});

const contactSchema = z.object({
	name: z.string().trim().min(2, 'Въведете име на контакт.').max(120, 'Името е твърде дълго.'),
	email: z.union([z.literal(''), z.string().trim().email('Невалиден имейл адрес.')]),
	phone: z.string().trim().max(64, 'Телефонът е твърде дълъг.').optional(),
	roleTitle: z.string().trim().max(120, 'Ролята е твърде дълга.').optional()
});

function buildClientInput(formData: FormData) {
	return {
		legalName: String(formData.get('legalName') ?? ''),
		registrationNumber: String(formData.get('registrationNumber') ?? ''),
		vatNumber: String(formData.get('vatNumber') ?? ''),
		billingAddress: String(formData.get('billingAddress') ?? ''),
		defaultPaymentTermDays: String(formData.get('defaultPaymentTermDays') ?? ''),
		status: String(formData.get('status') ?? 'active')
	};
}

function buildContactInput(formData: FormData) {
	return {
		name: String(formData.get('name') ?? ''),
		email: String(formData.get('email') ?? ''),
		phone: String(formData.get('phone') ?? ''),
		roleTitle: String(formData.get('roleTitle') ?? '')
	};
}

function normalizeClientPayload(data: z.infer<typeof clientSchema>) {
	return {
		legalName: data.legalName.replace(/\s+/g, ' ').trim(),
		registrationNumber: normalizeOptionalText(data.registrationNumber ?? ''),
		vatNumber: normalizeOptionalText(data.vatNumber ?? ''),
		billingAddress: normalizeOptionalMultilineText(data.billingAddress ?? ''),
		defaultPaymentTermDays: data.defaultPaymentTermDays === '' ? null : data.defaultPaymentTermDays,
		status: data.status
	};
}

function normalizeContactPayload(data: z.infer<typeof contactSchema>) {
	return {
		name: data.name.replace(/\s+/g, ' ').trim(),
		email: normalizeOptionalText(data.email),
		phone: normalizeOptionalText(data.phone ?? ''),
		roleTitle: normalizeOptionalText(data.roleTitle ?? '')
	};
}

async function getCompanyOrRedirect() {
	const company = await db.company.findFirst();
	if (!company) {
		redirect(302, '/bootstrap');
	}

	await ensureCompanyDefaults(db, company.id);
	return company;
}

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!canAccessClientRegistry(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await getCompanyOrRedirect();

	const clients = await db.client.findMany({
		where: { companyId: company.id },
		orderBy: [{ isProtectedSystem: 'desc' }, { status: 'asc' }, { legalName: 'asc' }],
		include: {
			contacts: {
				orderBy: [{ name: 'asc' }]
			},
			_count: {
				select: { projects: true }
			}
		}
	});

	return {
		clients,
		permissions: {
			canCreateClient: canCreateOrManageClients(user.role),
			canManageContacts: canManageClientContacts(user.role),
			canChangeLifecycle: canChangeClientLifecycle(user.role),
			canEditBilling: canEditClientBilling(user.role)
		}
	};
};

export const actions: Actions = {
	createClient: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canCreateOrManageClients(locals.user.role)) {
			return fail(403, { createClientError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const raw = buildClientInput(formData);
		const parsed = clientSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				createClientErrors: parsed.error.flatten().fieldErrors,
				createClientValues: raw
			});
		}

		const data = normalizeClientPayload(parsed.data);
		const existingClient = await db.client.findFirst({
			where: {
				companyId: company.id,
				legalName: {
					equals: data.legalName,
					mode: 'insensitive'
				}
			}
		});

		if (existingClient) {
			return fail(409, {
				createClientErrors: { legalName: ['Клиент с това име вече съществува.'] },
				createClientValues: raw
			});
		}

		const client = await db.client.create({
			data: {
				companyId: company.id,
				...data
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'client_created',
			entityType: 'client',
			entityId: client.id,
			newValueJson: data,
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { createClientSuccess: true };
	},

	updateClient: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canEditClientBilling(locals.user.role)) {
			return fail(403, { clientFormError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const clientId = String(formData.get('clientId') ?? '');
		const raw = buildClientInput(formData);
		const parsed = clientSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				clientFormErrors: parsed.error.flatten().fieldErrors,
				clientFormValues: raw,
				clientFormClientId: clientId
			});
		}

		const client = await db.client.findUnique({
			where: { id: clientId }
		});

		if (!client) {
			return fail(404, { clientFormError: 'Клиентът не е намерен.', clientFormClientId: clientId });
		}

		if (client.isProtectedSystem) {
			return fail(400, { clientFormError: PROTECTED_CLIENT_EDIT_ERROR, clientFormClientId: clientId });
		}

		const data = normalizeClientPayload(parsed.data);
		const duplicateClient = await db.client.findFirst({
			where: {
				companyId: client.companyId,
				id: { not: client.id },
				legalName: {
					equals: data.legalName,
					mode: 'insensitive'
				}
			}
		});

		if (duplicateClient) {
			return fail(409, {
				clientFormErrors: { legalName: ['Клиент с това име вече съществува.'] },
				clientFormValues: raw,
				clientFormClientId: clientId
			});
		}

		const updateData = canCreateOrManageClients(locals.user.role)
			? data
			: {
					legalName: data.legalName,
					registrationNumber: data.registrationNumber,
					vatNumber: data.vatNumber,
					billingAddress: data.billingAddress,
					defaultPaymentTermDays: data.defaultPaymentTermDays
				};

		const updatedClient = await db.client.update({
			where: { id: client.id },
			data: updateData
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'client_updated',
			entityType: 'client',
			entityId: client.id,
			oldValueJson: {
				legalName: client.legalName,
				registrationNumber: client.registrationNumber,
				vatNumber: client.vatNumber,
				billingAddress: client.billingAddress,
				defaultPaymentTermDays: client.defaultPaymentTermDays,
				status: client.status
			},
			newValueJson: {
				legalName: updatedClient.legalName,
				registrationNumber: updatedClient.registrationNumber,
				vatNumber: updatedClient.vatNumber,
				billingAddress: updatedClient.billingAddress,
				defaultPaymentTermDays: updatedClient.defaultPaymentTermDays,
				status: updatedClient.status
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { clientFormSuccess: true, clientFormClientId: clientId };
	},

	addContact: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageClientContacts(locals.user.role)) {
			return fail(403, { contactFormError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const clientId = String(formData.get('clientId') ?? '');
		const raw = buildContactInput(formData);
		const parsed = contactSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				contactFormErrors: parsed.error.flatten().fieldErrors,
				contactFormValues: raw,
				contactFormClientId: clientId
			});
		}

		const client = await db.client.findUnique({
			where: { id: clientId }
		});

		if (!client) {
			return fail(404, { contactFormError: 'Клиентът не е намерен.', contactFormClientId: clientId });
		}

		if (client.isProtectedSystem) {
			return fail(400, { contactFormError: PROTECTED_CLIENT_EDIT_ERROR, contactFormClientId: clientId });
		}

		const data = normalizeContactPayload(parsed.data);
		const contact = await db.clientContact.create({
			data: {
				clientId,
				...data
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'client_contact_created',
			entityType: 'client_contact',
			entityId: contact.id,
			newValueJson: { clientId, ...data },
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { contactFormSuccess: true, contactFormClientId: clientId };
	},

	updateContact: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canManageClientContacts(locals.user.role)) {
			return fail(403, { contactUpdateError: 'Нямате права за тази операция.' });
		}

		const formData = await request.formData();
		const clientId = String(formData.get('clientId') ?? '');
		const contactId = String(formData.get('contactId') ?? '');
		const raw = buildContactInput(formData);
		const parsed = contactSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				contactUpdateErrors: parsed.error.flatten().fieldErrors,
				contactUpdateValues: raw,
				contactUpdateClientId: clientId,
				contactUpdateContactId: contactId
			});
		}

		const contact = await db.clientContact.findUnique({
			where: { id: contactId },
			include: { client: true }
		});

		if (!contact || contact.clientId !== clientId) {
			return fail(404, { contactUpdateError: 'Контактът не е намерен.', contactUpdateClientId: clientId });
		}

		if (contact.client.isProtectedSystem) {
			return fail(400, { contactUpdateError: PROTECTED_CLIENT_EDIT_ERROR, contactUpdateClientId: clientId });
		}

		const data = normalizeContactPayload(parsed.data);
		const updatedContact = await db.clientContact.update({
			where: { id: contact.id },
			data
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'client_contact_updated',
			entityType: 'client_contact',
			entityId: contact.id,
			oldValueJson: {
				name: contact.name,
				email: contact.email,
				phone: contact.phone,
				roleTitle: contact.roleTitle
			},
			newValueJson: {
				name: updatedContact.name,
				email: updatedContact.email,
				phone: updatedContact.phone,
				roleTitle: updatedContact.roleTitle
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return {
			contactUpdateSuccess: true,
			contactUpdateClientId: clientId,
			contactUpdateContactId: contactId
		};
	}
};
