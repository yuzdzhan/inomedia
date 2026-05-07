type DraftTaskLog = {
	id: string;
	workDate: Date;
	description: string;
	durationMinutes: number;
	startMinuteOfDay: number | null;
	endMinuteOfDay: number | null;
	snapshotCostRateCents: number | null;
	snapshotBillableRateCents: number | null;
	userId: string;
};

type DraftTask = {
	id: string;
	title: string;
	billingType: 'hourly' | 'flat_fee' | 'non_billable';
	flatFeeAmountCents: number | null;
	taskList: {
		project: {
			id: string;
			name: string;
		};
	};
	timeLogs: DraftTaskLog[];
};

type DraftSelectionSnapshot = {
	taskId: string;
	description: string;
	amountCents: number;
	hourlyUninvoicedValueCents: number | null;
	flatFeeValueCents: number | null;
	firstWorkDate: Date | null;
	lastWorkDate: Date | null;
	snapshotJson: {
		taskTitle: string;
		projectId: string;
		projectName: string;
		clientId: string;
		timeLogs?: Array<{
			id: string;
			workDate: string;
			description: string;
			durationMinutes: number;
			startMinuteOfDay: number | null;
			endMinuteOfDay: number | null;
			snapshotCostRateCents: number | null;
			snapshotBillableRateCents: number | null;
			userId: string;
		}>;
		flatFeeAmountCents?: number;
	};
};

export function formatDateInput(date: Date) {
	return date.toISOString().slice(0, 10);
}

export function parseOptionalDateInput(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return null;
	}

	const parsed = new Date(`${value}T00:00:00.000Z`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function centsFromMinutes(rateCents: number | null, minutes: number) {
	if (rateCents == null) {
		return 0;
	}

	return Math.round((rateCents * minutes) / 60);
}

export function buildDefaultInvoiceLineDescription(task: {
	title: string;
	billingType: 'hourly' | 'flat_fee' | 'non_billable';
}) {
	if (task.billingType === 'flat_fee') {
		return `Фиксирана цена по задача "${task.title}"`;
	}

	return `Работа по задача "${task.title}"`;
}

export function buildDraftSelectionSnapshot(
	task: DraftTask,
	clientId: string,
	description = buildDefaultInvoiceLineDescription(task)
): DraftSelectionSnapshot {
	if (task.billingType === 'hourly') {
		const amountCents = task.timeLogs.reduce(
			(sum, log) => sum + centsFromMinutes(log.snapshotBillableRateCents, log.durationMinutes),
			0
		);

		return {
			taskId: task.id,
			description,
			amountCents,
			hourlyUninvoicedValueCents: amountCents,
			flatFeeValueCents: null,
			firstWorkDate: task.timeLogs[0]?.workDate ?? null,
			lastWorkDate: task.timeLogs.at(-1)?.workDate ?? null,
			snapshotJson: {
				taskTitle: task.title,
				projectId: task.taskList.project.id,
				projectName: task.taskList.project.name,
				clientId,
				timeLogs: task.timeLogs.map((log) => ({
					id: log.id,
					workDate: formatDateInput(log.workDate),
					description: log.description,
					durationMinutes: log.durationMinutes,
					startMinuteOfDay: log.startMinuteOfDay,
					endMinuteOfDay: log.endMinuteOfDay,
					snapshotCostRateCents: log.snapshotCostRateCents,
					snapshotBillableRateCents: log.snapshotBillableRateCents,
					userId: log.userId
				}))
			}
		};
	}

	const flatFeeAmountCents = task.flatFeeAmountCents ?? 0;

	return {
		taskId: task.id,
		description,
		amountCents: flatFeeAmountCents,
		hourlyUninvoicedValueCents: null,
		flatFeeValueCents: flatFeeAmountCents,
		firstWorkDate: null,
		lastWorkDate: null,
		snapshotJson: {
			taskTitle: task.title,
			projectId: task.taskList.project.id,
			projectName: task.taskList.project.name,
			clientId,
			flatFeeAmountCents
		}
	};
}

export function summarizeDraftSelections(
	selections: Array<{
		amountCents: number;
		firstWorkDate: Date | null;
		lastWorkDate: Date | null;
	}>,
	vatRateBasisPoints: number
) {
	const allDates = selections
		.flatMap((selection) => [selection.firstWorkDate, selection.lastWorkDate])
		.filter((date): date is Date => date instanceof Date);
	const servicePeriodFrom =
		allDates.length > 0 ? allDates.reduce((min, date) => (date < min ? date : min)) : null;
	const servicePeriodTo =
		allDates.length > 0 ? allDates.reduce((max, date) => (date > max ? date : max)) : null;
	const netTotalCents = selections.reduce((sum, selection) => sum + selection.amountCents, 0);
	const vatTotalCents = Math.round((netTotalCents * vatRateBasisPoints) / 10000);

	return {
		servicePeriodFrom,
		servicePeriodTo,
		netTotalCents,
		vatTotalCents,
		grossTotalCents: netTotalCents + vatTotalCents
	};
}

export function addUtcDays(date: Date, days: number) {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

export function resolveDraftDueDate(
	existingDueDate: Date | null,
	clientDefaultPaymentTermDays: number | null,
	companyDefaultPaymentTermDays: number
) {
	if (existingDueDate) {
		return existingDueDate;
	}

	const termDays = clientDefaultPaymentTermDays ?? companyDefaultPaymentTermDays;
	return addUtcDays(new Date(), termDays);
}
