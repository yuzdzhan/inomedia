import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { logAuditEvent } from '$lib/server/audit';
import { ensureCompanyDefaults } from '$lib/server/company-defaults';
import {
	canAccessProjectRegistry,
	canBePrimaryProjectManager,
	canCreateOrManageProjects,
	normalizeOptionalProjectDescription,
	normalizeProjectName,
	parseOptionalMoneyToCents
} from '$lib/server/project-policy';
import type { Actions, PageServerLoad } from './$types';

const moneyField = z
	.string()
	.trim()
	.refine((value) => value.length === 0 || /^\d+([.,]\d{1,2})?$/.test(value), 'Използвайте число с до 2 знака след десетичната запетая.');

const projectSchema = z.object({
	clientId: z.string().trim().min(1, 'Изберете клиент.'),
	name: z.string().trim().min(2, 'Въведете име на проекта.').max(160, 'Името е твърде дълго.'),
	description: z.string().max(4000, 'Описанието е твърде дълго.'),
	status: z.enum(['active', 'on_hold', 'completed', 'cancelled']),
	primaryManagerUserId: z.string().trim().min(1, 'Изберете основен мениджър.'),
	budgetAmount: moneyField,
	retainerAmount: moneyField,
	isBillable: z.boolean(),
	memberUserIds: z.array(z.string().trim()).default([])
});

function parseCheckbox(formData: FormData, key: string) {
	return formData.get(key) === 'on';
}

function buildProjectInput(formData: FormData) {
	return {
		clientId: String(formData.get('clientId') ?? ''),
		name: String(formData.get('name') ?? ''),
		description: String(formData.get('description') ?? ''),
		status: String(formData.get('status') ?? 'active'),
		primaryManagerUserId: String(formData.get('primaryManagerUserId') ?? ''),
		budgetAmount: String(formData.get('budgetAmount') ?? ''),
		retainerAmount: String(formData.get('retainerAmount') ?? ''),
		isBillable: parseCheckbox(formData, 'isBillable'),
		memberUserIds: formData.getAll('memberUserIds').map(String)
	};
}

function dedupeIds(ids: string[]) {
	return [...new Set(ids.filter(Boolean))];
}

function normalizeProjectPayload(data: z.infer<typeof projectSchema>) {
	const memberUserIds = dedupeIds([...data.memberUserIds, data.primaryManagerUserId]);

	return {
		clientId: data.clientId,
		name: normalizeProjectName(data.name),
		description: normalizeOptionalProjectDescription(data.description),
		status: data.status,
		primaryManagerUserId: data.primaryManagerUserId,
		budgetAmountCents: parseOptionalMoneyToCents(data.budgetAmount),
		retainerAmountCents: parseOptionalMoneyToCents(data.retainerAmount),
		isBillable: data.isBillable,
		memberUserIds
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

async function validateProjectRelations(companyId: string, input: ReturnType<typeof normalizeProjectPayload>) {
	const [client, users] = await db.$transaction([
		db.client.findFirst({
			where: {
				id: input.clientId,
				companyId
			}
		}),
		db.user.findMany({
			where: {
				id: {
					in: dedupeIds([input.primaryManagerUserId, ...input.memberUserIds])
				}
			}
		})
	]);

	if (!client) {
		return { clientError: 'Изберете валиден клиент.' };
	}

	const primaryManager = users.find((user) => user.id === input.primaryManagerUserId);
	if (!primaryManager || !canBePrimaryProjectManager(primaryManager.role)) {
		return { managerError: 'Основният мениджър трябва да е потребител с роля администратор или мениджър.' };
	}

	if (users.length !== dedupeIds([input.primaryManagerUserId, ...input.memberUserIds]).length) {
		return { memberError: 'Изберете само съществуващи потребители за екипа на проекта.' };
	}

	return {
		client,
		primaryManager,
		memberUserIds: dedupeIds([input.primaryManagerUserId, ...input.memberUserIds])
	};
}

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!canAccessProjectRegistry(user.role)) {
		redirect(302, '/dashboard');
	}

	const company = await getCompanyOrRedirect();

	const [clients, users, projects] = await db.$transaction([
		db.client.findMany({
			where: { companyId: company.id },
			orderBy: [{ status: 'asc' }, { legalName: 'asc' }],
			select: {
				id: true,
				legalName: true,
				status: true,
				isInternal: true
			}
		}),
		db.user.findMany({
			orderBy: [{ status: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
			select: {
				id: true,
				firstName: true,
				lastName: true,
				role: true,
				status: true
			}
		}),
		db.project.findMany({
			where: {
				client: {
					companyId: company.id
				}
			},
			orderBy: [{ status: 'asc' }, { name: 'asc' }],
			include: {
				client: {
					select: {
						id: true,
						legalName: true,
						status: true,
						isInternal: true
					}
				},
				primaryManager: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						role: true,
						status: true
					}
				},
				members: {
					orderBy: [
						{ user: { status: 'asc' } },
						{ user: { lastName: 'asc' } },
						{ user: { firstName: 'asc' } }
					],
					include: {
						user: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								role: true,
								status: true
							}
						}
					}
				}
			}
		})
	]);

	return {
		company: { currency: company.currency },
		clients,
		users,
		projects,
		permissions: {
			canManageProjects: canCreateOrManageProjects(user.role)
		}
	};
};

export const actions: Actions = {
	createProject: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canCreateOrManageProjects(locals.user.role)) {
			return fail(403, { createProjectError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const raw = buildProjectInput(formData);
		const parsed = projectSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				createProjectErrors: parsed.error.flatten().fieldErrors,
				createProjectValues: raw
			});
		}

		const data = normalizeProjectPayload(parsed.data);
		const relationState = await validateProjectRelations(company.id, data);

		if ('clientError' in relationState) {
			return fail(422, {
				createProjectErrors: { clientId: [relationState.clientError] },
				createProjectValues: raw
			});
		}

		if ('managerError' in relationState) {
			return fail(422, {
				createProjectErrors: { primaryManagerUserId: [relationState.managerError] },
				createProjectValues: raw
			});
		}

		if ('memberError' in relationState) {
			return fail(422, {
				createProjectErrors: { memberUserIds: [relationState.memberError] },
				createProjectValues: raw
			});
		}

		const duplicateProject = await db.project.findFirst({
			where: {
				clientId: data.clientId,
				name: {
					equals: data.name,
					mode: 'insensitive'
				}
			}
		});

		if (duplicateProject) {
			return fail(409, {
				createProjectErrors: { name: ['Проект с това име вече съществува за избрания клиент.'] },
				createProjectValues: raw
			});
		}

		const project = await db.project.create({
			data: {
				clientId: data.clientId,
				name: data.name,
				description: data.description,
				status: data.status,
				primaryManagerUserId: data.primaryManagerUserId,
				budgetAmountCents: data.budgetAmountCents,
				retainerAmountCents: data.retainerAmountCents,
				isBillable: relationState.client.isInternal ? false : data.isBillable,
				members: {
					createMany: {
						data: relationState.memberUserIds.map((userId) => ({ userId }))
					}
				}
			}
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'project_created',
			entityType: 'project',
			entityId: project.id,
			newValueJson: {
				clientId: data.clientId,
				name: data.name,
				status: data.status,
				primaryManagerUserId: data.primaryManagerUserId,
				budgetAmountCents: data.budgetAmountCents,
				retainerAmountCents: data.retainerAmountCents,
				isBillable: relationState.client.isInternal ? false : data.isBillable,
				memberUserIds: relationState.memberUserIds
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { createProjectSuccess: true };
	},

	updateProject: async ({ request, locals, getClientAddress }) => {
		if (!locals.user || !canCreateOrManageProjects(locals.user.role)) {
			return fail(403, { projectFormError: 'Нямате права за тази операция.' });
		}

		const company = await getCompanyOrRedirect();
		const formData = await request.formData();
		const projectId = String(formData.get('projectId') ?? '');
		const raw = buildProjectInput(formData);
		const parsed = projectSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(422, {
				projectFormErrors: parsed.error.flatten().fieldErrors,
				projectFormValues: raw,
				projectFormProjectId: projectId
			});
		}

		const project = await db.project.findUnique({
			where: { id: projectId },
			include: {
				client: true,
				members: {
					select: { userId: true }
				}
			}
		});

		if (!project || project.client.companyId !== company.id) {
			return fail(404, { projectFormError: 'Проектът не е намерен.', projectFormProjectId: projectId });
		}

		const data = normalizeProjectPayload(parsed.data);
		const relationState = await validateProjectRelations(company.id, data);

		if ('clientError' in relationState) {
			return fail(422, {
				projectFormErrors: { clientId: [relationState.clientError] },
				projectFormValues: raw,
				projectFormProjectId: projectId
			});
		}

		if ('managerError' in relationState) {
			return fail(422, {
				projectFormErrors: { primaryManagerUserId: [relationState.managerError] },
				projectFormValues: raw,
				projectFormProjectId: projectId
			});
		}

		if ('memberError' in relationState) {
			return fail(422, {
				projectFormErrors: { memberUserIds: [relationState.memberError] },
				projectFormValues: raw,
				projectFormProjectId: projectId
			});
		}

		const duplicateProject = await db.project.findFirst({
			where: {
				clientId: data.clientId,
				id: { not: projectId },
				name: {
					equals: data.name,
					mode: 'insensitive'
				}
			}
		});

		if (duplicateProject) {
			return fail(409, {
				projectFormErrors: { name: ['Проект с това име вече съществува за избрания клиент.'] },
				projectFormValues: raw,
				projectFormProjectId: projectId
			});
		}

		const updatedProject = await db.$transaction(async (tx) => {
			const nextProject = await tx.project.update({
				where: { id: projectId },
				data: {
					clientId: data.clientId,
					name: data.name,
					description: data.description,
					status: data.status,
					primaryManagerUserId: data.primaryManagerUserId,
					budgetAmountCents: data.budgetAmountCents,
					retainerAmountCents: data.retainerAmountCents,
					isBillable: relationState.client.isInternal ? false : data.isBillable
				}
			});

			await tx.projectMember.deleteMany({
				where: { projectId }
			});

			if (relationState.memberUserIds.length > 0) {
				await tx.projectMember.createMany({
					data: relationState.memberUserIds.map((userId) => ({
						projectId,
						userId
					}))
				});
			}

			return nextProject;
		});

		await logAuditEvent({
			actorUserId: locals.user.id,
			eventType: 'project_updated',
			entityType: 'project',
			entityId: project.id,
			oldValueJson: {
				clientId: project.clientId,
				name: project.name,
				description: project.description,
				status: project.status,
				primaryManagerUserId: project.primaryManagerUserId,
				budgetAmountCents: project.budgetAmountCents,
				retainerAmountCents: project.retainerAmountCents,
				isBillable: project.isBillable,
				memberUserIds: project.members.map((member) => member.userId)
			},
			newValueJson: {
				clientId: updatedProject.clientId,
				name: updatedProject.name,
				description: updatedProject.description,
				status: updatedProject.status,
				primaryManagerUserId: updatedProject.primaryManagerUserId,
				budgetAmountCents: updatedProject.budgetAmountCents,
				retainerAmountCents: updatedProject.retainerAmountCents,
				isBillable: updatedProject.isBillable,
				memberUserIds: relationState.memberUserIds
			},
			ipAddress: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});

		return { projectFormSuccess: true, projectFormProjectId: projectId };
	}
};
