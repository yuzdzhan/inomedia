import { db } from './db';

type AuditEventInput = {
	actorUserId?: string;
	eventType: string;
	entityType?: string;
	entityId?: string;
	oldValueJson?: object;
	newValueJson?: object;
	reason?: string;
	ipAddress?: string;
	userAgent?: string;
};

export async function logAuditEvent(input: AuditEventInput) {
	try {
		await db.auditEvent.create({
			data: {
				actorUserId: input.actorUserId ?? null,
				eventType: input.eventType,
				entityType: input.entityType ?? null,
				entityId: input.entityId ?? null,
				oldValueJson: input.oldValueJson ?? undefined,
				newValueJson: input.newValueJson ?? undefined,
				reason: input.reason ?? null,
				ipAddress: input.ipAddress ?? null,
				userAgent: input.userAgent ?? null
			}
		});
	} catch (e) {
		console.error('[audit] Failed to log event:', input.eventType, e);
	}
}
