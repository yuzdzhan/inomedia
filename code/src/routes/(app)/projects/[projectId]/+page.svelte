<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import Icon from '$lib/components/Icon.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const projectStatusLabels: Record<string, string> = {
		active: 'Активен',
		on_hold: 'На пауза',
		completed: 'Завършен',
		cancelled: 'Отказан'
	};

	const taskStatusLabels: Record<string, string> = {
		todo: 'За изпълнение',
		in_progress: 'В процес',
		done: 'Завършена',
		cancelled: 'Отказана'
	};

	const priorityLabels: Record<string, string> = {
		low: 'Нисък',
		medium: 'Среден',
		high: 'Висок'
	};

	const billingTypeLabels: Record<string, string> = {
		hourly: 'Почасово',
		flat_fee: 'Фиксирана цена',
		non_billable: 'Небилируема'
	};

	const avatarColors = ['#4f46e5', '#0891b2', '#dc2626', '#ca8a04', '#059669', '#7c3aed'];

	type CreateTaskModalState = { taskListId: string } | null;
	type TaskBillingTypeValue = 'hourly' | 'flat_fee' | 'non_billable';
	type AttachmentView = {
		id: string;
		originalFilename: string;
		contentType: string;
		sizeBytes: number;
		createdAt: string | Date;
		uploadedByUser: { firstName: string; lastName: string };
	};
	type TimeLogView = {
		id: string;
		workDate: string | Date;
		description: string;
		durationMinutes: number;
		startMinuteOfDay: number | null;
		endMinuteOfDay: number | null;
		invoicedAt: string | Date | null;
		snapshotCostRateCents: number | null;
		snapshotBillableRateCents: number | null;
		createdAt: string | Date;
		user: { id: string; firstName: string; lastName: string };
	};

	let searchQuery = $state('');
	let createTaskListOpen = $state(false);
	let createTaskModal = $state<CreateTaskModalState>(null);
	let selectedTaskId = $state<string | null>(null);
	let createTaskBillingType = $state<TaskBillingTypeValue>('hourly');
	let selectedTaskBillingType = $state<TaskBillingTypeValue>('hourly');
	let editingCommentId = $state<string | null>(null);
	let editingTimeLogId = $state<string | null>(null);

	function userLabel(user: { firstName: string; lastName: string }) {
		return `${user.firstName} ${user.lastName}`;
	}

	function formatMoneyFromCents(value: number | null | undefined) {
		if (value == null) return '';
		return (value / 100).toFixed(2);
	}

	function formatMoneyLabel(value: number | null | undefined) {
		const normalized = formatMoneyFromCents(value);
		return normalized ? `${normalized} ${data.company.currency}` : 'Няма';
	}

	function formatDeadline(value: string) {
		if (!value) return 'Без срок';
		return new Intl.DateTimeFormat('bg-BG', {
			day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
		}).format(new Date(`${value}T00:00:00.000Z`));
	}

	function formatDateTime(value: string) {
		return new Intl.DateTimeFormat('bg-BG', {
			day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
		}).format(new Date(value));
	}

	function formatAttachmentSize(sizeBytes: number) {
		if (sizeBytes < 1024) return `${sizeBytes} B`;
		if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
		return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function attachmentUrl(attachmentId: string) { return `/attachments/${attachmentId}`; }

	function isPreviewableAttachment(attachment: AttachmentView) {
		return ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'].includes(attachment.contentType);
	}

	function taskListFieldError(field: string) { return (form as any)?.createTaskListErrors?.[field]?.[0]; }
	function taskListFieldValue(field: string, fallback: string | boolean = '') { return (form as any)?.createTaskListValues?.[field] ?? fallback; }
	function createTaskFieldError(field: string) { return (form as any)?.createTaskErrors?.[field]?.[0]; }
	function createTaskFieldValue(field: string, fallback = '') { return (form as any)?.createTaskValues?.[field] ?? fallback; }
	function createTaskFieldValues(field: string, fallback: string[] = []) {
		const value = (form as any)?.createTaskValues?.[field];
		if (Array.isArray(value)) return value.map(String);
		if (typeof value === 'string' && value.length > 0) return [value];
		return fallback;
	}

	function defaultBillingType(): TaskBillingTypeValue {
		return data.project.client.isInternal ? 'non_billable' : 'hourly';
	}

	function createTaskBillingTypeValue() {
		return createTaskFieldValue('billingType', defaultBillingType()) as TaskBillingTypeValue;
	}

	function taskFieldError(field: string) { return selectedTaskId ? (form as any)?.taskFormErrors?.[field]?.[0] : null; }
	function taskFieldValue(field: string, fallback: string | null = '') {
		return selectedTaskId ? ((form as any)?.taskFormValues?.[field] ?? fallback ?? '') : (fallback ?? '');
	}
	function taskFieldValues(field: string, fallback: string[] = []) {
		if (!selectedTaskId) return fallback;
		const value = (form as any)?.taskFormValues?.[field];
		if (Array.isArray(value)) return value.map(String);
		if (typeof value === 'string' && value.length > 0) return [value];
		return fallback;
	}

	function commentFieldError(field: string) { return (form as any)?.commentFormErrors?.[field]?.[0]; }
	function commentFieldValue(field: string, fallback = '') { return (form as any)?.commentFormValues?.[field] ?? fallback; }
	function commentAttachmentFieldError() { return commentFieldError('attachments'); }
	function timeLogFieldError(field: string) { return (form as any)?.timeLogFormErrors?.[field]?.[0]; }
	function timeLogFieldValue(field: string, fallback = '') { return (form as any)?.timeLogFormValues?.[field] ?? fallback; }
	function timeLogFormTimeLogId() { return (form as any)?.timeLogFormTimeLogId ?? null; }
	function createTimeLogFieldValue(field: string, fallback = '') { return timeLogFormTimeLogId() ? fallback : timeLogFieldValue(field, fallback); }
	function createTimeLogFieldError(field: string) { return timeLogFormTimeLogId() ? null : timeLogFieldError(field); }
	function taskBillingTypeValue(task: { billingType: string }) { return taskFieldValue('billingType', task.billingType) as TaskBillingTypeValue; }

	function openCreateTaskListModal() { createTaskListOpen = true; }
	function closeCreateTaskListModal() { createTaskListOpen = false; }

	function openCreateTaskModal(taskListId?: string) {
		createTaskModal = { taskListId: taskListId ?? data.project.taskLists[0]?.id ?? '' };
		createTaskBillingType = createTaskBillingTypeValue();
	}
	function closeCreateTaskModal() { createTaskModal = null; }

	function openTaskModal(taskId: string) {
		selectedTaskId = taskId;
		editingCommentId = null;
		const task = data.project.taskLists.flatMap((tl) => tl.tasks).find((t) => t.id === taskId);
		selectedTaskBillingType = task ? taskBillingTypeValue(task) : defaultBillingType();
	}
	function closeTaskModal() { selectedTaskId = null; editingCommentId = null; }
	function openCommentEditor(commentId: string) { editingCommentId = commentId; }
	function closeCommentEditor() { editingCommentId = null; }
	function openTimeLogEditor(timeLogId: string) { editingTimeLogId = timeLogId; }
	function closeTimeLogEditor() { editingTimeLogId = null; }

	function activeTask() {
		if (!selectedTaskId) return null;
		for (const taskList of data.project.taskLists) {
			const task = taskList.tasks.find((t) => t.id === selectedTaskId);
			if (task) return task;
		}
		return null;
	}

	const selectedTask = $derived(activeTask());

	function currentCreateTaskListId() {
		return String(createTaskFieldValue('taskListId', createTaskModal?.taskListId ?? data.project.taskLists[0]?.id ?? ''));
	}

	function isEditingComment(commentId: string) { return editingCommentId === commentId; }
	function canEditComment(comment: { id: string; authorUserId: string; isDeleted: boolean }) {
		return data.permissions.canCreateComments && !comment.isDeleted && comment.authorUserId === data.permissions.currentUserId;
	}
	function canSoftDeleteComment(comment: { isDeleted: boolean }) { return data.permissions.canSoftDeleteComments && !comment.isDeleted; }
	function canCreateTimeLog(task: { assignees: Array<{ userId: string }> }) {
		return data.permissions.canCreateTimeLogs && task.assignees.some((a) => a.userId === data.permissions.currentUserId);
	}
	function isEditingTimeLog(timeLogId: string) { return editingTimeLogId === timeLogId; }
	function canChangeTimeLog(timeLog: TimeLogView) {
		if ((timeLog as any).invoicedAt) return false;
		if (data.permissions.currentUserRole === 'admin') return true;
		if (data.permissions.currentUserRole === 'manager') return data.project.primaryManagerUserId === data.permissions.currentUserId;
		return timeLog.user.id === data.permissions.currentUserId;
	}

	function assigneeNames(task: { assignees: Array<{ user: { firstName: string; lastName: string } }> }) {
		if (task.assignees.length === 0) return 'Няма назначени';
		return task.assignees.map((a) => userLabel(a.user)).join(', ');
	}

	function formatMinutes(value: number) {
		const h = Math.floor(value / 60);
		const m = value % 60;
		return `${h}ч ${m.toString().padStart(2, '0')}м`;
	}

	function formatShortDate(value: Date | string) {
		const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
		return new Intl.DateTimeFormat('bg-BG', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
	}

	function formatMinuteOfDay(value: number | null) {
		if (value == null) return '';
		const h = Math.floor(value / 60);
		const m = value % 60;
		return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
	}

	function formatDateInputValue(value: string | Date) {
		const date = value instanceof Date ? value : new Date(value);
		return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
	}

	function memberColor(userId: string) {
		const idx = data.project.members.findIndex((m) => m.userId === userId);
		return avatarColors[(idx >= 0 ? idx : 0) % avatarColors.length];
	}

	function firstAssigneeInitials(task: { assignees: Array<{ userId: string; user: { firstName: string; lastName: string } }> }) {
		const first = task.assignees[0];
		if (!first) return '?';
		return (first.user.firstName[0] ?? '') + (first.user.lastName[0] ?? '');
	}

	function taskBadgeClass(status: string) {
		const map: Record<string, string> = { todo: 'task-todo', in_progress: 'task-progress', done: 'task-done', cancelled: 'task-cancelled' };
		return map[status] ?? 'task-todo';
	}

	function projectStatusBadgeClass(status: string) {
		const map: Record<string, string> = { active: 'task-done', on_hold: 'task-progress', completed: 'outline', cancelled: 'task-cancelled' };
		return map[status] ?? 'outline';
	}

	const filteredTaskLists = $derived.by(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return data.project.taskLists;
		return data.project.taskLists
			.map((taskList) => {
				const listMatches = taskList.name.toLowerCase().includes(query) || (taskList.description ?? '').toLowerCase().includes(query);
				const tasks = taskList.tasks.filter((task) =>
					task.title.toLowerCase().includes(query) ||
					(task.description ?? '').toLowerCase().includes(query) ||
					taskStatusLabels[task.status].toLowerCase().includes(query) ||
					priorityLabels[task.priority].toLowerCase().includes(query) ||
					assigneeNames(task).toLowerCase().includes(query)
				);
				if (listMatches) return taskList;
				return { ...taskList, tasks };
			})
			.filter((tl) => tl.tasks.length > 0 || tl.name.toLowerCase().includes(query));
	});

	const totalTaskCount = $derived(filteredTaskLists.reduce((s, tl) => s + tl.tasks.length, 0));
	const allTasksForKpi = $derived(data.project.taskLists.flatMap((tl) => tl.tasks));
	const totalLoggedMinutes = $derived(allTasksForKpi.flatMap((t) => t.timeLogs).reduce((s, l) => s + l.durationMinutes, 0));
	const loggedHours = $derived(+(totalLoggedMinutes / 60).toFixed(1));
	const budgetHours = $derived(data.project.budgetAmountCents ? Math.round(data.project.budgetAmountCents / 10000) : null);
	const burnPct = $derived(budgetHours && budgetHours > 0 ? Math.min(Math.round((loggedHours / budgetHours) * 100), 100) : null);
	const uninvoicedMinutes = $derived(
		allTasksForKpi.filter((t) => t.billingType === 'hourly')
			.flatMap((t) => t.timeLogs.filter((l: any) => !l.invoicedAt))
			.reduce((s: number, l: any) => s + l.durationMinutes, 0)
	);

	$effect(() => {
		if ((form as any)?.createTaskListErrors) createTaskListOpen = true;
		if ((form as any)?.createTaskListSuccess) createTaskListOpen = false;
		if ((form as any)?.createTaskTaskListId && ((form as any)?.createTaskErrors || (form as any)?.createTaskSuccess)) {
			createTaskModal = { taskListId: (form as any).createTaskTaskListId };
			createTaskBillingType = createTaskBillingTypeValue();
		}
		if ((form as any)?.createTaskSuccess) createTaskModal = null;
		if ((form as any)?.taskFormTaskId) {
			selectedTaskId = (form as any).taskFormTaskId;
			const task = activeTask();
			selectedTaskBillingType = task ? taskBillingTypeValue(task) : defaultBillingType();
		}
		if ((form as any)?.taskFormSuccess) selectedTaskId = null;
		if ((form as any)?.commentFormTaskId) selectedTaskId = (form as any).commentFormTaskId;
		if ((form as any)?.commentDeleteTaskId) selectedTaskId = (form as any).commentDeleteTaskId;
		if ((form as any)?.commentFormCommentId && (form as any)?.commentFormErrors) editingCommentId = (form as any).commentFormCommentId;
		if ((form as any)?.commentFormSuccess) editingCommentId = null;
		if ((form as any)?.timeLogFormTaskId) selectedTaskId = (form as any).timeLogFormTaskId;
		if ((form as any)?.timeLogFormTimeLogId && (form as any)?.timeLogFormErrors) editingTimeLogId = (form as any).timeLogFormTimeLogId;
		if ((form as any)?.timeLogFormSuccess) editingTimeLogId = null;
		if ((form as any)?.timeLogDeleteTaskId) selectedTaskId = (form as any).timeLogDeleteTaskId;
	});
</script>

<svelte:head>
	<title>{data.project.name} – Иномедия</title>
</svelte:head>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			closeCreateTaskListModal();
			closeCreateTaskModal();
			closeTaskModal();
		}
	}}
/>

<!-- Page header -->
<div class="page-header">
	<div>
		<div class="row gap-2" style="margin-bottom:6px; font-size:12px; color:var(--text-muted);">
			<a href="/projects" style="color:var(--text-muted); text-decoration:none;">← Проекти</a>
			<span>·</span>
			<span>{data.project.client.legalName}</span>
			<span>·</span>
			<span class="badge {projectStatusBadgeClass(data.project.status)}" style="font-size:10px;">{projectStatusLabels[data.project.status]}</span>
			{#if data.project.client.isInternal}
				<span class="badge outline" style="font-size:10px;">Вътрешен</span>
			{/if}
		</div>
		<h1 class="page-title">{data.project.name}</h1>
		<p class="page-sub">
			{data.project.client.legalName} · Мениджър: {userLabel(data.project.primaryManager)}
		</p>
	</div>
	<div class="page-header-actions">
		{#if data.permissions.canManageProjects && ['completed', 'cancelled'].includes(data.project.status)}
			<form method="POST" action="?/reopenProject" style="display:inline;">
				<input type="hidden" name="projectId" value={data.project.id} />
				<button type="submit" class="btn btn-secondary btn-sm">Отвори отново</button>
			</form>
		{/if}
		{#if data.permissions.canManageTasks}
			<button type="button" class="btn btn-secondary btn-sm" onclick={openCreateTaskListModal}>
				<Icon name="plus" size={12}/>Нов списък
			</button>
		{/if}
		{#if data.permissions.canManageTasks && data.project.taskLists.length > 0}
			<button type="button" class="btn btn-primary btn-sm" onclick={() => openCreateTaskModal()}>
				<Icon name="plus" size={12}/>Нова задача
			</button>
		{/if}
	</div>
</div>

<!-- Alerts -->
{#if (form as any)?.reopenProjectError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).reopenProjectError}</div>
{/if}
{#if (form as any)?.createTaskListError || (form as any)?.createTaskError || (form as any)?.taskFormError}
	<div class="alert danger" style="margin-bottom:12px;">
		{(form as any)?.createTaskListError ?? (form as any)?.createTaskError ?? (form as any)?.taskFormError}
	</div>
{/if}

<!-- KPI strip -->
<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px;">
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Отработени часове</div>
		<div class="row gap-2" style="align-items:baseline;">
			<span class="amount" style="font-size:22px; font-weight:500;">{loggedHours}</span>
			{#if budgetHours}
				<span class="muted amount" style="font-size:12px;">/ {budgetHours}ч</span>
			{/if}
		</div>
		{#if burnPct !== null}
			<div class="burn-bar" style="margin-top:6px;">
				<div class="burn-bar-fill {burnPct > 80 ? 'danger' : burnPct > 60 ? 'warn' : ''}" style="width:{burnPct}%;"></div>
			</div>
		{/if}
	</div>
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Незафактурирано (часова)</div>
		<div class="amount" style="font-size:22px; font-weight:500;">{Math.round(uninvoicedMinutes / 60 * 10) / 10}ч</div>
		<div style="font-size:11px; color:var(--text-muted);">готово за фактуриране</div>
	</div>
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Задачи</div>
		<div class="amount" style="font-size:22px; font-weight:500;">{totalTaskCount}</div>
		<div style="font-size:11px; color:var(--text-muted);">{data.showClosed ? 'всички' : 'активни'}</div>
	</div>
	<div class="stat" style="padding:14px;">
		<div class="stat-label">Екип</div>
		<div class="row gap-1" style="margin-top:6px; flex-wrap:wrap;">
			{#each data.project.members.slice(0, 5) as member, i}
				<div class="sb-avatar" title={userLabel(member.user)}
					style="width:26px; height:26px; font-size:9px; border:2px solid var(--bg-elevated); margin-left:{i ? -8 : 0}px; background:{memberColor(member.userId)};">
					{(member.user.firstName[0] ?? '') + (member.user.lastName[0] ?? '')}
				</div>
			{/each}
			{#if data.project.members.length > 5}
				<span class="muted" style="font-size:12px; margin-left:6px;">+{data.project.members.length - 5}</span>
			{/if}
		</div>
		<div style="font-size:11px; color:var(--text-muted); margin-top:4px;">{data.project.members.length} {data.project.members.length === 1 ? 'член' : 'членове'}</div>
	</div>
</div>

<!-- Tabs + toolbar -->
<div class="tabs" style="margin-bottom:0;">
	<button class="tab active">Задачи <span class="count">{totalTaskCount}</span></button>
</div>

<div style="display:flex; gap:8px; align-items:center; margin-bottom:16px; padding:8px 0; border-bottom:1px solid var(--border);">
	<input class="input" type="search" placeholder="Търси задача, статус, изпълнител..."
		bind:value={searchQuery} style="flex:1; max-width:320px;" />
	<a href={data.showClosed ? `/projects/${data.project.id}` : `/projects/${data.project.id}?showClosed=1`}
		class="btn btn-ghost btn-sm">
		{data.showClosed ? 'Скрий приключените' : 'Покажи приключените'}
	</a>
</div>

<!-- Task lists -->
<div class="col gap-3">
	{#each filteredTaskLists as taskList}
		<div class="card">
			<div class="card-header">
				<div class="row gap-2">
					<Icon name="chevron-down" size={14} />
					<h3 class="card-title">{taskList.name}</h3>
					<span class="badge outline">{taskList.tasks.length}</span>
					{#if taskList.isArchived}
						<span class="badge outline" style="font-size:10px;">Архивен</span>
					{/if}
					{#if taskList.hiddenClosedTaskCount > 0}
						<span class="muted" style="font-size:11px;">{taskList.hiddenClosedTaskCount} скрити</span>
					{/if}
				</div>
				{#if data.permissions.canManageTasks}
					<button type="button" class="btn btn-ghost btn-sm" onclick={() => openCreateTaskModal(taskList.id)}>
						<Icon name="plus" size={12}/>Задача
					</button>
				{/if}
			</div>

			{#if taskList.tasks.length === 0}
				<div style="padding:20px 16px; text-align:center; color:var(--text-muted); font-size:13px;">
					Няма задачи в този изглед.
				</div>
			{:else}
				<div>
					{#each taskList.tasks as task}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div onclick={() => openTaskModal(task.id)}
							style="display:grid; grid-template-columns:14px 24px 1fr 100px 110px 70px 70px; padding:8px 16px; border-top:1px solid var(--border-soft); align-items:center; gap:10px; font-size:13px; cursor:pointer;"
							class="task-row-item">
							<span class="pri-dot {task.priority === 'high' ? 'high' : task.priority === 'medium' ? 'med' : 'low'}"
								title="{priorityLabels[task.priority]}"></span>
							<div class="sb-avatar" style="width:22px; height:22px; font-size:9px; background:{memberColor(task.assignees[0]?.userId ?? '')};">
								{firstAssigneeInitials(task)}
							</div>
							<span style="font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
								text-decoration:{task.status === 'done' ? 'line-through' : 'none'};
								color:{task.status === 'done' ? 'var(--text-muted)' : 'var(--text)'};">
								{task.title}
							</span>
							<span class="badge outline" style="font-size:10px; justify-self:flex-start;">{billingTypeLabels[task.billingType]}</span>
							<span class="badge {taskBadgeClass(task.status)}" style="font-size:10px;">{taskStatusLabels[task.status]}</span>
							<span class="amount muted" style="font-size:11px; text-align:right;">
								{#if task.timeLogs.length > 0}
									{formatMinutes(task.timeLogs.reduce((s: number, l: any) => s + l.durationMinutes, 0))}
								{:else}
									—
								{/if}
							</span>
							<span class="amount muted" style="font-size:11px; text-align:right;">{formatDeadline(task.deadlineDateInput)}</span>
						</div>
					{/each}
					{#if data.permissions.canManageTasks}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div onclick={() => openCreateTaskModal(taskList.id)}
							style="padding:8px 16px; border-top:1px solid var(--border-soft); color:var(--text-muted); font-size:12px; cursor:pointer; display:flex; align-items:center; gap:6px;">
							<Icon name="plus" size={12}/>Добави задача
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/each}

	{#if filteredTaskLists.length === 0}
		<div class="card" style="padding:40px; text-align:center;">
			<div class="muted">Няма съвпадения по търсенето.</div>
		</div>
	{/if}

	{#if data.permissions.canManageTasks}
		<button type="button" class="btn btn-ghost" style="align-self:flex-start; color:var(--text-muted);" onclick={openCreateTaskListModal}>
			<Icon name="plus" size={13}/>Нов списък
		</button>
	{/if}
</div>

<!-- =========================================================
     Create Task List Modal
     ========================================================= -->
{#if createTaskListOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div onclick={closeCreateTaskListModal}
		style="position:fixed; inset:0; background:rgba(0,0,0,0.35); z-index:50; display:grid; place-items:center; padding:16px;">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div onclick={(e) => e.stopPropagation()}
			style="background:var(--bg-elevated); border:1px solid var(--border); border-radius:var(--r-lg); box-shadow:var(--sh-lg); width:100%; max-width:420px; overflow:hidden;">
			<div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
				<div>
					<div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; font-family:var(--font-mono);">Нов списък</div>
					<div style="font-weight:600; font-size:15px;">Създай списък</div>
				</div>
				<button type="button" class="topbar-icon-btn" onclick={closeCreateTaskListModal}>
					<Icon name="x" size={14}/>
				</button>
			</div>
			<form method="POST" action="?/createTaskList" style="padding:16px; display:flex; flex-direction:column; gap:12px;">
				<input type="hidden" name="projectId" value={data.project.id} />
				<div class="field">
					<label class="label" for="tl-name">Наименование</label>
					<input class="input" id="tl-name" name="name" type="text" value={taskListFieldValue('name')} required />
					{#if taskListFieldError('name')}<span style="font-size:11px; color:var(--danger);">{taskListFieldError('name')}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="tl-desc">Описание</label>
					<textarea class="input" id="tl-desc" name="description" rows="3" style="resize:vertical;">{taskListFieldValue('description')}</textarea>
				</div>
				<label style="display:flex; gap:8px; align-items:center; font-size:13px; cursor:pointer;">
					<input type="checkbox" name="isArchived" checked={Boolean(taskListFieldValue('isArchived', false))} />
					<span>Архивен списък</span>
				</label>
				<div class="row gap-2" style="justify-content:flex-end;">
					<button type="button" class="btn btn-secondary btn-sm" onclick={closeCreateTaskListModal}>Отказ</button>
					<button type="submit" class="btn btn-primary btn-sm">Създай</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- =========================================================
     Create Task Modal
     ========================================================= -->
{#if createTaskModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div onclick={closeCreateTaskModal}
		style="position:fixed; inset:0; background:rgba(0,0,0,0.35); z-index:50; display:grid; place-items:center; padding:16px; overflow-y:auto;">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div onclick={(e) => e.stopPropagation()}
			style="background:var(--bg-elevated); border:1px solid var(--border); border-radius:var(--r-lg); box-shadow:var(--sh-lg); width:100%; max-width:600px; overflow:hidden; margin:auto;">
			<div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
				<div>
					<div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; font-family:var(--font-mono);">Нова задача</div>
					<div style="font-weight:600; font-size:15px;">Добави задача</div>
				</div>
				<button type="button" class="topbar-icon-btn" onclick={closeCreateTaskModal}><Icon name="x" size={14}/></button>
			</div>
			<form method="POST" action="?/createTask" enctype="multipart/form-data"
				style="padding:16px; display:flex; flex-direction:column; gap:12px;">
				<input type="hidden" name="projectId" value={data.project.id} />
				<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
					<div class="field">
						<label class="label" for="c-taskListId">Списък</label>
						<select class="select" id="c-taskListId" name="taskListId">
							{#each data.project.taskLists as opt}
								<option value={opt.id} selected={currentCreateTaskListId() === opt.id}>{opt.name}{opt.isArchived ? ' · архивен' : ''}</option>
							{/each}
						</select>
						{#if createTaskFieldError('taskListId')}<span style="font-size:11px;color:var(--danger);">{createTaskFieldError('taskListId')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="c-title">Заглавие</label>
						<input class="input" id="c-title" name="title" type="text" value={createTaskFieldValue('title')} required />
						{#if createTaskFieldError('title')}<span style="font-size:11px;color:var(--danger);">{createTaskFieldError('title')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="c-status">Статус</label>
						<select class="select" id="c-status" name="status">
							{#each Object.entries(taskStatusLabels) as [val, lbl]}
								<option value={val} selected={createTaskFieldValue('status', 'todo') === val}>{lbl}</option>
							{/each}
						</select>
					</div>
					<div class="field">
						<label class="label" for="c-priority">Приоритет</label>
						<select class="select" id="c-priority" name="priority">
							{#each Object.entries(priorityLabels) as [val, lbl]}
								<option value={val} selected={createTaskFieldValue('priority', 'medium') === val}>{lbl}</option>
							{/each}
						</select>
					</div>
					<div class="field">
						<label class="label" for="c-deadlineDate">Краен срок</label>
						<input class="input" id="c-deadlineDate" name="deadlineDate" type="date" value={createTaskFieldValue('deadlineDate')} />
					</div>
					<div class="field">
						<label class="label" for="c-billingType">Таксуване</label>
						<select class="select" id="c-billingType" name="billingType"
							bind:value={createTaskBillingType} disabled={data.project.client.isInternal}>
							{#each Object.entries(billingTypeLabels) as [val, lbl]}
								<option value={val}>{lbl}</option>
							{/each}
						</select>
						{#if data.project.client.isInternal}
							<input type="hidden" name="billingType" value="non_billable" />
						{/if}
					</div>
					{#if createTaskBillingType === 'flat_fee'}
						<div class="field">
							<label class="label" for="c-flatFee">Фиксирана цена ({data.company.currency})</label>
							<input class="input" id="c-flatFee" name="flatFeeAmount" type="text" inputmode="decimal" value={createTaskFieldValue('flatFeeAmount')} />
							{#if createTaskFieldError('flatFeeAmount')}<span style="font-size:11px;color:var(--danger);">{createTaskFieldError('flatFeeAmount')}</span>{/if}
						</div>
					{/if}
					{#if data.permissions.canViewRates && createTaskBillingType === 'hourly'}
						<div class="field">
							<label class="label" for="c-rateOverride">Ставка по задача ({data.company.currency})</label>
							<input class="input" id="c-rateOverride" name="billableRateOverride" type="text" inputmode="decimal" value={createTaskFieldValue('billableRateOverride')} />
						</div>
					{/if}
				</div>
				<fieldset style="border:none; padding:0; margin:0;">
					<legend class="label" style="margin-bottom:4px;">Изпълнители</legend>
					<div style="display:flex; flex-wrap:wrap; gap:8px;">
						{#each data.project.members as member}
							<label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
								<input type="checkbox" name="assigneeUserIds" value={member.userId}
									checked={createTaskFieldValues('assigneeUserIds').includes(member.userId)} />
								<span>{userLabel(member.user)}</span>
							</label>
						{/each}
					</div>
				</fieldset>
				<div class="field">
					<label class="label" for="c-description">Описание</label>
					<textarea class="input" id="c-description" name="description" rows="4" style="resize:vertical;">{createTaskFieldValue('description')}</textarea>
				</div>
				<div class="field">
					<label class="label" for="c-attachments">Прикачени файлове</label>
					<input id="c-attachments" name="attachments" type="file" multiple />
					{#if createTaskFieldError('attachments')}<span style="font-size:11px;color:var(--danger);">{createTaskFieldError('attachments')}</span>{/if}
				</div>
				<div class="row gap-2" style="justify-content:flex-end;">
					<button type="button" class="btn btn-secondary btn-sm" onclick={closeCreateTaskModal}>Отказ</button>
					<button type="submit" class="btn btn-primary btn-sm">Създай задача</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- =========================================================
     Task Drawer (slide-in from right)
     ========================================================= -->
{#if selectedTask}
	{@const task = selectedTask}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div onclick={closeTaskModal}
		style="position:fixed; inset:0; background:rgba(0,0,0,0.3); z-index:50; animation:fadeIn 0.15s;"></div>
	<!-- Drawer panel -->
	<div style="position:fixed; top:0; right:0; bottom:0; width:480px; z-index:51;
		background:var(--bg-elevated); border-left:1px solid var(--border); box-shadow:var(--sh-lg);
		display:flex; flex-direction:column; animation:slideIn 0.2s ease-out;">
		<!-- Drawer header -->
		<div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px; flex-shrink:0;">
			<span class="amount muted" style="font-size:11px;">{data.project.name}</span>
			<button type="button" class="topbar-icon-btn" style="margin-left:auto;" onclick={closeTaskModal}>
				<Icon name="x" size={14}/>
			</button>
		</div>
		<!-- Drawer scrollable content -->
		<div style="flex:1; overflow-y:auto; padding:20px;">
			<h2 style="font-size:18px; font-weight:600; margin:0 0 12px; letter-spacing:-0.01em;">{task.title}</h2>

			<!-- Task meta grid -->
			<div style="display:grid; grid-template-columns:90px 1fr; gap:8px 16px; font-size:12px; margin-bottom:20px; align-items:center;">
				<span class="muted">Статус</span>
				<div><span class="badge {taskBadgeClass(task.status)}">{taskStatusLabels[task.status]}</span></div>
				<span class="muted">Приоритет</span>
				<div class="row gap-2">
					<span class="pri-dot {task.priority === 'high' ? 'high' : task.priority === 'medium' ? 'med' : 'low'}"></span>
					<span>{priorityLabels[task.priority]}</span>
				</div>
				<span class="muted">Таксуване</span>
				<div><span class="badge outline">{billingTypeLabels[task.billingType]}</span></div>
				<span class="muted">Изпълнители</span>
				<div class="row gap-1" style="flex-wrap:wrap;">
					{#if task.assignees.length > 0}
						{#each task.assignees as a}
							<span style="font-size:12px;">{userLabel(a.user)}</span>
						{/each}
					{:else}
						<span class="muted">Няма</span>
					{/if}
				</div>
				<span class="muted">Краен срок</span>
				<div class="amount" style="font-size:12px;">{formatDeadline(task.deadlineDateInput)}</div>
				{#if data.permissions.canViewRates && task.billingType === 'hourly' && task.billableRateOverrideCents != null}
					<span class="muted">Ставка</span>
					<div class="amount" style="font-size:12px;">{formatMoneyLabel(task.billableRateOverrideCents)} / час</div>
				{/if}
			</div>

			{#if data.permissions.canManageTasks}
				<!-- Edit form -->
				<div style="border-top:1px solid var(--border); padding-top:16px; margin-bottom:16px;">
					<div class="label" style="margin-bottom:8px;">Редактирай задача</div>
					<form method="POST" action="?/updateTask" enctype="multipart/form-data"
						style="display:flex; flex-direction:column; gap:10px;">
						<input type="hidden" name="taskId" value={task.id} />
						<input type="hidden" name="projectId" value={data.project.id} />
						<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
							<div class="field" style="margin:0;">
								<label class="label" for="e-title-{task.id}">Заглавие</label>
								<input class="input" id="e-title-{task.id}" name="title" type="text" value={taskFieldValue('title', task.title)} required />
								{#if taskFieldError('title')}<span style="font-size:11px;color:var(--danger);">{taskFieldError('title')}</span>{/if}
							</div>
							<div class="field" style="margin:0;">
								<label class="label" for="e-taskListId-{task.id}">Списък</label>
								<select class="select" id="e-taskListId-{task.id}" name="taskListId">
									{#each data.project.taskLists as opt}
										<option value={opt.id} selected={taskFieldValue('taskListId', task.taskListId) === opt.id}>{opt.name}{opt.isArchived ? ' · архивен' : ''}</option>
									{/each}
								</select>
							</div>
							<div class="field" style="margin:0;">
								<label class="label" for="e-status-{task.id}">Статус</label>
								<select class="select" id="e-status-{task.id}" name="status">
									{#each Object.entries(taskStatusLabels) as [val, lbl]}
										<option value={val} selected={taskFieldValue('status', task.status) === val}>{lbl}</option>
									{/each}
								</select>
							</div>
							<div class="field" style="margin:0;">
								<label class="label" for="e-priority-{task.id}">Приоритет</label>
								<select class="select" id="e-priority-{task.id}" name="priority">
									{#each Object.entries(priorityLabels) as [val, lbl]}
										<option value={val} selected={taskFieldValue('priority', task.priority) === val}>{lbl}</option>
									{/each}
								</select>
							</div>
							<div class="field" style="margin:0;">
								<label class="label" for="e-deadline-{task.id}">Краен срок</label>
								<input class="input" id="e-deadline-{task.id}" name="deadlineDate" type="date" value={taskFieldValue('deadlineDate', task.deadlineDateInput)} />
							</div>
							<div class="field" style="margin:0;">
								<label class="label" for="e-billing-{task.id}">Таксуване</label>
								<select class="select" id="e-billing-{task.id}" name="billingType"
									bind:value={selectedTaskBillingType} disabled={data.project.client.isInternal}>
									{#each Object.entries(billingTypeLabels) as [val, lbl]}
										<option value={val}>{lbl}</option>
									{/each}
								</select>
								{#if data.project.client.isInternal}
									<input type="hidden" name="billingType" value="non_billable" />
								{/if}
							</div>
							{#if selectedTaskBillingType === 'flat_fee'}
								<div class="field" style="margin:0;">
									<label class="label" for="e-flatfee-{task.id}">Фиксирана цена ({data.company.currency})</label>
									<input class="input" id="e-flatfee-{task.id}" name="flatFeeAmount" type="text" inputmode="decimal"
										value={taskFieldValue('flatFeeAmount', formatMoneyFromCents(task.flatFeeAmountCents))} />
								</div>
							{/if}
							{#if data.permissions.canViewRates && selectedTaskBillingType === 'hourly'}
								<div class="field" style="margin:0;">
									<label class="label" for="e-rate-{task.id}">Ставка по задача ({data.company.currency})</label>
									<input class="input" id="e-rate-{task.id}" name="billableRateOverride" type="text" inputmode="decimal"
										value={taskFieldValue('billableRateOverride', formatMoneyFromCents(task.billableRateOverrideCents))} />
								</div>
							{/if}
						</div>
						<fieldset style="border:none; padding:0; margin:0;">
							<legend class="label" style="margin-bottom:4px;">Изпълнители</legend>
							<div style="display:flex; flex-wrap:wrap; gap:8px;">
								{#each data.project.members as member}
									<label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
										<input type="checkbox" name="assigneeUserIds" value={member.userId}
											checked={taskFieldValues('assigneeUserIds', task.assignees.map((a) => a.userId)).includes(member.userId)} />
										<span>{userLabel(member.user)}</span>
									</label>
								{/each}
							</div>
						</fieldset>
						<div class="field" style="margin:0;">
							<label class="label" for="e-desc-{task.id}">Описание</label>
							<textarea class="input" id="e-desc-{task.id}" name="description" rows="4" style="resize:vertical;">{taskFieldValue('description', task.description)}</textarea>
						</div>
						<div class="field" style="margin:0;">
							<label class="label" for="e-files-{task.id}">Прикачени файлове</label>
							{#if task.attachments.length > 0}
								<div style="display:flex; flex-direction:column; gap:4px; margin-bottom:8px;">
									{#each task.attachments as att}
										<a href={attachmentUrl(att.id)} target="_blank" rel="noreferrer"
											style="display:flex; gap:8px; font-size:12px; padding:6px 8px; background:var(--surface); border-radius:var(--r-sm); border:1px solid var(--border-soft); text-decoration:none; color:var(--text);">
											{#if isPreviewableAttachment(att)}
												<img src={attachmentUrl(att.id)} alt={att.originalFilename} style="width:32px; height:32px; object-fit:cover; border-radius:2px;" />
											{/if}
											<div>
												<div style="font-weight:500;">{att.originalFilename}</div>
												<div class="muted" style="font-size:10px;">{formatAttachmentSize(att.sizeBytes)} · {userLabel(att.uploadedByUser)}</div>
											</div>
										</a>
									{/each}
								</div>
							{/if}
							<input id="e-files-{task.id}" name="attachments" type="file" multiple />
						</div>
						<div class="row gap-2" style="justify-content:flex-end;">
							<button type="button" class="btn btn-ghost btn-sm" onclick={closeTaskModal}>Затвори</button>
							<button type="submit" class="btn btn-primary btn-sm">Запази задачата</button>
						</div>
					</form>
				</div>
			{:else}
				<div style="border-top:1px solid var(--border); padding-top:16px; margin-bottom:16px;">
					<div class="label" style="margin-bottom:8px;">Описание</div>
					<div style="font-size:13px; line-height:1.6; padding:10px 12px; background:var(--surface); border-radius:var(--r-md);">
						{task.description || 'Няма описание.'}
					</div>
					{#if task.attachments.length > 0}
						<div style="margin-top:10px; display:flex; flex-direction:column; gap:4px;">
							{#each task.attachments as att}
								<a href={attachmentUrl(att.id)} target="_blank" rel="noreferrer"
									style="display:flex; gap:8px; font-size:12px; padding:6px 8px; background:var(--surface); border-radius:var(--r-sm); border:1px solid var(--border-soft); text-decoration:none; color:var(--text);">
									<div>
										<div style="font-weight:500;">{att.originalFilename}</div>
										<div class="muted" style="font-size:10px;">{formatAttachmentSize(att.sizeBytes)}</div>
									</div>
								</a>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Time log section -->
			<div style="border-top:1px solid var(--border); padding-top:16px; margin-bottom:16px;">
				<div class="row-between" style="margin-bottom:8px;">
					<div class="label" style="margin:0;">
						Времелог · {task.timeLogs.length > 0 ? formatMinutes(task.timeLogs.reduce((s: number, l: any) => s + l.durationMinutes, 0)) : '0ч'}
					</div>
				</div>

				{#if (form as any)?.timeLogFormError}
					<div class="alert danger" style="margin-bottom:8px; font-size:12px;">{(form as any).timeLogFormError}</div>
				{/if}
				{#if (form as any)?.timeLogDeleteError}
					<div class="alert danger" style="margin-bottom:8px; font-size:12px;">{(form as any).timeLogDeleteError}</div>
				{/if}

				{#if canCreateTimeLog(task)}
					<form method="POST" action="?/createTimeLog" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; padding:12px; background:var(--surface); border-radius:var(--r-md); border:1px solid var(--border-soft);">
						<input type="hidden" name="projectId" value={data.project.id} />
						<input type="hidden" name="taskId" value={task.id} />
						<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
							<div class="field" style="margin:0;">
								<label class="label" style="font-size:11px;" for="tl-date-{task.id}">Дата</label>
								<input class="input" style="font-size:12px;" id="tl-date-{task.id}" name="workDate" type="date" max={data.today} value={createTimeLogFieldValue('workDate', data.today)} />
								{#if createTimeLogFieldError('workDate')}<span style="font-size:10px;color:var(--danger);">{createTimeLogFieldError('workDate')}</span>{/if}
							</div>
							<div class="field" style="margin:0;">
								<label class="label" style="font-size:11px;" for="tl-dur-{task.id}">Минути</label>
								<input class="input" style="font-size:12px;" id="tl-dur-{task.id}" name="durationMinutes" type="number" min="15" step="15" value={createTimeLogFieldValue('durationMinutes')} />
								{#if createTimeLogFieldError('durationMinutes')}<span style="font-size:10px;color:var(--danger);">{createTimeLogFieldError('durationMinutes')}</span>{/if}
							</div>
							<div class="field" style="margin:0;">
								<label class="label" style="font-size:11px;" for="tl-start-{task.id}">Начало</label>
								<input class="input" style="font-size:12px;" id="tl-start-{task.id}" name="startTime" type="time" value={createTimeLogFieldValue('startTime')} />
							</div>
							<div class="field" style="margin:0;">
								<label class="label" style="font-size:11px;" for="tl-end-{task.id}">Край</label>
								<input class="input" style="font-size:12px;" id="tl-end-{task.id}" name="endTime" type="time" value={createTimeLogFieldValue('endTime')} />
							</div>
						</div>
						<div class="field" style="margin:0;">
							<label class="label" style="font-size:11px;" for="tl-desc-{task.id}">Извършена работа</label>
							<textarea class="input" style="font-size:12px; resize:vertical;" id="tl-desc-{task.id}" name="description" rows="2" placeholder="Кратко описание...">{createTimeLogFieldValue('description')}</textarea>
							{#if createTimeLogFieldError('description')}<span style="font-size:10px;color:var(--danger);">{createTimeLogFieldError('description')}</span>{/if}
						</div>
						<div style="display:flex; justify-content:flex-end;">
							<button type="submit" class="btn btn-accent btn-sm"><Icon name="plus" size={11}/>Добави</button>
						</div>
					</form>
				{/if}

				{#if task.timeLogs.length > 0}
					<div style="border:1px solid var(--border); border-radius:var(--r-md); overflow:hidden;">
						{#each task.timeLogs as timeLog, i}
							<div style="padding:8px 12px; {i > 0 ? 'border-top:1px solid var(--border-soft);' : ''} background:{(timeLog as any).invoicedAt ? 'var(--surface)' : 'transparent'}; font-size:12px;">
								<div class="row-between">
									<div class="row gap-2">
										<span class="amount muted" style="font-size:11px;">{formatShortDate(timeLog.workDate)}</span>
										<span style="font-weight:500;">{userLabel(timeLog.user)}</span>
										<span class="amount">{formatMinutes(timeLog.durationMinutes)}</span>
										{#if timeLog.startMinuteOfDay != null && timeLog.endMinuteOfDay != null}
											<span class="muted">{formatMinuteOfDay(timeLog.startMinuteOfDay)}–{formatMinuteOfDay(timeLog.endMinuteOfDay)}</span>
										{/if}
										{#if (timeLog as any).invoicedAt}
											<span class="badge inv-paid" style="font-size:9px;">Фактуриран</span>
										{/if}
									</div>
									{#if canChangeTimeLog(timeLog)}
										<div class="row gap-1">
											<button type="button" class="btn btn-ghost btn-sm" style="height:22px; font-size:11px;" onclick={() => openTimeLogEditor(timeLog.id)}>
												Редакция
											</button>
											<form method="POST" action="?/deleteTimeLog" style="display:inline;">
												<input type="hidden" name="taskId" value={task.id} />
												<input type="hidden" name="timeLogId" value={timeLog.id} />
												<button type="submit" class="btn btn-ghost btn-sm" style="height:22px; font-size:11px; color:var(--danger);">Изтрий</button>
											</form>
										</div>
									{/if}
								</div>
								{#if isEditingTimeLog(timeLog.id)}
									<form method="POST" action="?/updateTimeLog" style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
										<input type="hidden" name="projectId" value={data.project.id} />
										<input type="hidden" name="taskId" value={task.id} />
										<input type="hidden" name="timeLogId" value={timeLog.id} />
										<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
											<div class="field" style="margin:0;">
												<label class="label" style="font-size:11px;" for="edit-tl-date-{timeLog.id}">Дата</label>
												<input class="input" style="font-size:12px;" id="edit-tl-date-{timeLog.id}" name="workDate" type="date" max={data.today} value={timeLogFieldValue('workDate', formatDateInputValue(timeLog.workDate))} />
											</div>
											<div class="field" style="margin:0;">
												<label class="label" style="font-size:11px;" for="edit-tl-dur-{timeLog.id}">Минути</label>
												<input class="input" style="font-size:12px;" id="edit-tl-dur-{timeLog.id}" name="durationMinutes" type="number" min="15" step="15" value={timeLogFieldValue('durationMinutes', String(timeLog.durationMinutes))} />
											</div>
											<div class="field" style="margin:0;">
												<label class="label" style="font-size:11px;" for="edit-tl-start-{timeLog.id}">Начало</label>
												<input class="input" style="font-size:12px;" id="edit-tl-start-{timeLog.id}" name="startTime" type="time" value={timeLogFieldValue('startTime', formatMinuteOfDay(timeLog.startMinuteOfDay))} />
											</div>
											<div class="field" style="margin:0;">
												<label class="label" style="font-size:11px;" for="edit-tl-end-{timeLog.id}">Край</label>
												<input class="input" style="font-size:12px;" id="edit-tl-end-{timeLog.id}" name="endTime" type="time" value={timeLogFieldValue('endTime', formatMinuteOfDay(timeLog.endMinuteOfDay))} />
											</div>
										</div>
										<div class="field" style="margin:0;">
											<label class="label" style="font-size:11px;" for="edit-tl-desc-{timeLog.id}">Работа</label>
											<textarea class="input" style="font-size:12px; resize:vertical;" id="edit-tl-desc-{timeLog.id}" name="description" rows="2">{timeLogFieldValue('description', timeLog.description)}</textarea>
										</div>
										<div class="row gap-2" style="justify-content:flex-end;">
											<button type="button" class="btn btn-ghost btn-sm" style="height:24px;" onclick={closeTimeLogEditor}>Отказ</button>
											<button type="submit" class="btn btn-primary btn-sm" style="height:24px;">Запази</button>
										</div>
									</form>
								{:else}
									<div class="muted" style="font-size:12px; margin-top:4px;">{timeLog.description}</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<div class="muted" style="font-size:12px;">Все още няма отчетено време.</div>
				{/if}
			</div>

			<!-- Comments section -->
			<div style="border-top:1px solid var(--border); padding-top:16px;">
				<div class="label" style="margin-bottom:8px;">Коментари · {task.comments.length}</div>

				{#if (form as any)?.commentFormError}
					<div class="alert danger" style="margin-bottom:8px; font-size:12px;">{(form as any).commentFormError}</div>
				{/if}

				{#if data.permissions.canCreateComments}
					<form method="POST" action="?/createComment" enctype="multipart/form-data"
						style="margin-bottom:16px; display:flex; flex-direction:column; gap:8px;">
						<input type="hidden" name="projectId" value={data.project.id} />
						<input type="hidden" name="taskId" value={task.id} />
						<textarea class="input" name="body" rows="3" style="resize:vertical;" placeholder="Добавете уточнение или следваща стъпка...">{(form as any)?.commentFormCommentId ? '' : commentFieldValue('body')}</textarea>
						{#if commentFieldError('body') && !(form as any)?.commentFormCommentId}
							<span style="font-size:11px; color:var(--danger);">{commentFieldError('body')}</span>
						{/if}
						<div class="row-between">
							<input name="attachments" type="file" multiple style="font-size:11px;" />
							<button type="submit" class="btn btn-accent btn-sm">Добави коментар</button>
						</div>
					</form>
				{/if}

				<div class="col gap-3">
					{#each task.comments as comment}
						<div class="row gap-2" style="align-items:flex-start; {comment.isDeleted ? 'opacity:0.5;' : ''}">
							<div class="sb-avatar" style="width:26px; height:26px; font-size:10px; flex-shrink:0; background:{memberColor(comment.author.id)};">
								{(comment.author.firstName[0] ?? '') + (comment.author.lastName[0] ?? '')}
							</div>
							<div style="flex:1; min-width:0;">
								<div class="row gap-2" style="margin-bottom:4px; flex-wrap:wrap;">
									<span style="font-weight:500; font-size:12px;">{userLabel(comment.author)}</span>
									<span class="muted" style="font-size:11px;">{formatDateTime(comment.createdAt.toString())}</span>
									{#if comment.editedAt && !comment.isDeleted}
										<span class="badge outline" style="font-size:9px;">редактиран</span>
									{/if}
								</div>
								{#if isEditingComment(comment.id)}
									<form method="POST" action="?/updateComment" enctype="multipart/form-data"
										style="display:flex; flex-direction:column; gap:8px;">
										<input type="hidden" name="projectId" value={data.project.id} />
										<input type="hidden" name="taskId" value={task.id} />
										<input type="hidden" name="commentId" value={comment.id} />
										<textarea class="input" name="body" rows="3" style="resize:vertical;">{commentFieldValue('body', comment.body)}</textarea>
										<div class="row-between">
											<input name="attachments" type="file" multiple style="font-size:11px;" />
											<div class="row gap-2">
												<button type="button" class="btn btn-ghost btn-sm" onclick={closeCommentEditor}>Отказ</button>
												<button type="submit" class="btn btn-primary btn-sm">Запази</button>
											</div>
										</div>
									</form>
								{:else if comment.isDeleted}
									<div class="muted" style="font-size:12px; font-style:italic;">Коментарът е изтрит.</div>
								{:else}
									<div style="font-size:13px; line-height:1.5;">{comment.body}</div>
									{#if comment.attachments.length > 0}
										<div style="margin-top:6px; display:flex; flex-direction:column; gap:3px;">
											{#each comment.attachments as att}
												<a href={attachmentUrl(att.id)} target="_blank" rel="noreferrer"
													style="font-size:12px; color:var(--accent); text-decoration:none;">
													{att.originalFilename} ({formatAttachmentSize(att.sizeBytes)})
												</a>
											{/each}
										</div>
									{/if}
								{/if}
								{#if !comment.isDeleted}
									<div class="row gap-2" style="margin-top:4px;">
										{#if canEditComment(comment)}
											<button type="button" class="btn btn-ghost btn-sm" style="height:20px; font-size:10px;" onclick={() => openCommentEditor(comment.id)}>
												Редакция
											</button>
										{/if}
										{#if canSoftDeleteComment(comment)}
											<form method="POST" action="?/deleteComment" style="display:inline;">
												<input type="hidden" name="projectId" value={data.project.id} />
												<input type="hidden" name="taskId" value={task.id} />
												<input type="hidden" name="commentId" value={comment.id} />
												<button type="submit" class="btn btn-ghost btn-sm" style="height:20px; font-size:10px; color:var(--danger);">Изтрий</button>
											</form>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					{/each}
					{#if task.comments.length === 0}
						<div class="muted" style="font-size:12px;">Все още няма коментари.</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
	@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
	.task-row-item:hover { background: var(--surface); }
</style>
