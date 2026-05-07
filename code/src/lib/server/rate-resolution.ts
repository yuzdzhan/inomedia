import { db } from '$lib/server/db';

type ResolvedRates = {
	costRateCents: number | null;
	defaultBillableRateCents: number | null;
	projectBillableRateCents: number | null;
	taskBillableRateOverrideCents: number | null;
	resolvedBillableRateCents: number | null;
};

export async function resolveRatesForTimeLog(params: {
	userId: string;
	projectId: string;
	taskId: string;
	workDate: Date;
}) {
	const [userRate, projectOverride, task, user] = await db.$transaction([
		db.userRateHistory.findFirst({
			where: {
				userId: params.userId,
				effectiveFrom: { lte: params.workDate }
			},
			orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }]
		}),
		db.projectMemberBillableRateOverride.findFirst({
			where: {
				projectId: params.projectId,
				userId: params.userId,
				effectiveFrom: { lte: params.workDate }
			},
			orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }]
		}),
		db.task.findUnique({
			where: { id: params.taskId },
			select: {
				billableRateOverrideCents: true
			}
		}),
		db.user.findUnique({
			where: { id: params.userId },
			select: {
				hourlyRateCents: true
			}
		})
	]);

	const costRateCents = userRate?.costRateCents ?? user?.hourlyRateCents ?? null;
	const defaultBillableRateCents = userRate?.billableRateCents ?? user?.hourlyRateCents ?? null;
	const projectBillableRateCents = projectOverride?.billableRateCents ?? null;
	const taskBillableRateOverrideCents = task?.billableRateOverrideCents ?? null;
	const resolvedBillableRateCents =
		taskBillableRateOverrideCents ?? projectBillableRateCents ?? defaultBillableRateCents;

	return {
		costRateCents,
		defaultBillableRateCents,
		projectBillableRateCents,
		taskBillableRateOverrideCents,
		resolvedBillableRateCents
	} satisfies ResolvedRates;
}
