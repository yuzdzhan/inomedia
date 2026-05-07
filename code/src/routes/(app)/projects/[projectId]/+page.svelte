<script lang="ts">
	import type { ActionData, PageData } from './$types';

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

	type CreateTaskModalState = { taskListId: string } | null;
	type TaskBillingTypeValue = 'hourly' | 'flat_fee' | 'non_billable';

	let searchQuery = $state('');
	let createTaskListOpen = $state(false);
	let createTaskModal = $state<CreateTaskModalState>(null);
	let selectedTaskId = $state<string | null>(null);
	let createTaskBillingType = $state<TaskBillingTypeValue>(data.project.client.isInternal ? 'non_billable' : 'hourly');
	let selectedTaskBillingType = $state<TaskBillingTypeValue>(data.project.client.isInternal ? 'non_billable' : 'hourly');

	function userLabel(user: { firstName: string; lastName: string }) {
		return `${user.firstName} ${user.lastName}`;
	}

	function formatMoneyFromCents(value: number | null | undefined) {
		if (value == null) {
			return '';
		}

		return (value / 100).toFixed(2);
	}

	function formatDeadline(value: string) {
		if (!value) {
			return 'Без срок';
		}

		return new Intl.DateTimeFormat('bg-BG', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${value}T00:00:00.000Z`));
	}

	function taskListFieldError(field: string) {
		return (form as any)?.createTaskListErrors?.[field]?.[0];
	}

	function taskListFieldValue(field: string, fallback: string | boolean = '') {
		return (form as any)?.createTaskListValues?.[field] ?? fallback;
	}

	function createTaskFieldError(field: string) {
		return (form as any)?.createTaskErrors?.[field]?.[0];
	}

	function createTaskFieldValue(field: string, fallback = '') {
		return (form as any)?.createTaskValues?.[field] ?? fallback;
	}

	function createTaskFieldValues(field: string, fallback: string[] = []) {
		const value = (form as any)?.createTaskValues?.[field];
		if (Array.isArray(value)) {
			return value.map(String);
		}

		if (typeof value === 'string' && value.length > 0) {
			return [value];
		}

		return fallback;
	}

	function defaultBillingType(): TaskBillingTypeValue {
		return data.project.client.isInternal ? 'non_billable' : 'hourly';
	}

	function createTaskBillingTypeValue() {
		return createTaskFieldValue('billingType', defaultBillingType()) as TaskBillingTypeValue;
	}

	function taskFieldError(field: string) {
		return selectedTaskId ? (form as any)?.taskFormErrors?.[field]?.[0] : null;
	}

	function taskFieldValue(field: string, fallback: string | null = '') {
		return selectedTaskId ? ((form as any)?.taskFormValues?.[field] ?? fallback ?? '') : (fallback ?? '');
	}

	function taskFieldValues(field: string, fallback: string[] = []) {
		if (!selectedTaskId) {
			return fallback;
		}

		const value = (form as any)?.taskFormValues?.[field];
		if (Array.isArray(value)) {
			return value.map(String);
		}

		if (typeof value === 'string' && value.length > 0) {
			return [value];
		}

		return fallback;
	}

	function taskBillingTypeValue(task: { billingType: string }) {
		return taskFieldValue('billingType', task.billingType) as TaskBillingTypeValue;
	}

	function openCreateTaskListModal() {
		createTaskListOpen = true;
	}

	function closeCreateTaskListModal() {
		createTaskListOpen = false;
	}

	function openCreateTaskModal(taskListId?: string) {
		createTaskModal = { taskListId: taskListId ?? data.project.taskLists[0]?.id ?? '' };
		createTaskBillingType = createTaskBillingTypeValue();
	}

	function closeCreateTaskModal() {
		createTaskModal = null;
	}

	function openTaskModal(taskId: string) {
		selectedTaskId = taskId;
		const task = data.project.taskLists.flatMap((taskList) => taskList.tasks).find((entry) => entry.id === taskId);
		selectedTaskBillingType = task ? taskBillingTypeValue(task) : defaultBillingType();
	}

	function closeTaskModal() {
		selectedTaskId = null;
	}

	function activeTask() {
		if (!selectedTaskId) {
			return null;
		}

		for (const taskList of data.project.taskLists) {
			const task = taskList.tasks.find((entry) => entry.id === selectedTaskId);
			if (task) {
				return task;
			}
		}

		return null;
	}

	const selectedTask = $derived(activeTask());

	function currentCreateTaskListId() {
		return String(createTaskFieldValue('taskListId', createTaskModal?.taskListId ?? data.project.taskLists[0]?.id ?? ''));
	}

	function assigneeNames(
		task: {
			assignees: Array<{
				user: { firstName: string; lastName: string };
			}>;
		}
	) {
		if (task.assignees.length === 0) {
			return 'Няма назначени';
		}

		return task.assignees.map((assignee) => userLabel(assignee.user)).join(', ');
	}

	const filteredTaskLists = $derived.by(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) {
			return data.project.taskLists;
		}

		return data.project.taskLists
			.map((taskList) => {
				const listMatches =
					taskList.name.toLowerCase().includes(query) || (taskList.description ?? '').toLowerCase().includes(query);
				const tasks = taskList.tasks.filter((task) => {
					return (
						task.title.toLowerCase().includes(query) ||
						(task.description ?? '').toLowerCase().includes(query) ||
						taskStatusLabels[task.status].toLowerCase().includes(query) ||
						priorityLabels[task.priority].toLowerCase().includes(query) ||
						assigneeNames(task).toLowerCase().includes(query)
					);
				});

				if (listMatches) {
					return taskList;
				}

				return {
					...taskList,
					tasks
				};
			})
			.filter((taskList) => taskList.tasks.length > 0 || taskList.name.toLowerCase().includes(query));
	});

	$effect(() => {
		if ((form as any)?.createTaskListErrors) {
			createTaskListOpen = true;
		}

		if ((form as any)?.createTaskListSuccess) {
			createTaskListOpen = false;
		}

		if ((form as any)?.createTaskTaskListId && ((form as any)?.createTaskErrors || (form as any)?.createTaskSuccess)) {
			createTaskModal = { taskListId: (form as any).createTaskTaskListId };
			createTaskBillingType = createTaskBillingTypeValue();
		}

		if ((form as any)?.createTaskSuccess) {
			createTaskModal = null;
		}

		if ((form as any)?.taskFormTaskId) {
			selectedTaskId = (form as any).taskFormTaskId;
			const task = activeTask();
			selectedTaskBillingType = task ? taskBillingTypeValue(task) : defaultBillingType();
		}

		if ((form as any)?.taskFormSuccess) {
			selectedTaskId = null;
		}
	});
</script>

<svelte:head>
	<title>{data.project.name} · Задачи - Иномедия</title>
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

<a class="back-link" href="/projects">← Към проектите</a>

<section class="hero">
	<div class="hero-copy">
		<div class="eyebrow">Задачи по проект</div>
		<h1>{data.project.name}</h1>
		<p>
			{data.project.client.legalName} · Мениджър {userLabel(data.project.primaryManager)} ·
			{projectStatusLabels[data.project.status]}
		</p>
	</div>

	<div class="hero-side">
		<div class="hero-badges">
			<span class="badge" class:success={data.project.status === 'active'} class:warning={data.project.status === 'on_hold'} class:muted={['completed', 'cancelled'].includes(data.project.status)}>
				{projectStatusLabels[data.project.status]}
			</span>
			{#if data.project.client.isInternal}
				<span class="badge info">Вътрешен проект</span>
			{/if}
		</div>

		<div class="hero-actions">
			{#if data.permissions.canManageTasks && data.project.taskLists.length > 0}
				<button type="button" class="btn-primary" onclick={() => openCreateTaskModal()}>
					+ Нова задача
				</button>
			{/if}
			{#if data.permissions.canManageTasks}
				<button type="button" class="btn-secondary" onclick={openCreateTaskListModal}>
					+ Нов списък
				</button>
			{/if}
			{#if data.permissions.canManageProjects && ['completed', 'cancelled'].includes(data.project.status)}
				<form method="POST" action="?/reopenProject">
					<input type="hidden" name="projectId" value={data.project.id} />
					<button type="submit" class="btn-secondary">Отвори проекта отново</button>
				</form>
			{/if}
		</div>
	</div>
</section>

{#if (form as any)?.reopenProjectError}
	<div class="alert error">{(form as any).reopenProjectError}</div>
{/if}
{#if (form as any)?.reopenProjectSuccess}
	<div class="alert success">Проектът е отворен отново.</div>
{/if}
{#if (form as any)?.createTaskListError}
	<div class="alert error">{(form as any).createTaskListError}</div>
{/if}
{#if (form as any)?.createTaskListSuccess}
	<div class="alert success">Списъкът е създаден.</div>
{/if}
{#if (form as any)?.createTaskError}
	<div class="alert error">{(form as any).createTaskError}</div>
{/if}
{#if (form as any)?.createTaskSuccess}
	<div class="alert success">Задачата е създадена.</div>
{/if}
{#if (form as any)?.taskFormError}
	<div class="alert error">{(form as any).taskFormError}</div>
{/if}
{#if (form as any)?.taskFormSuccess}
	<div class="alert success">Задачата е обновена.</div>
{/if}

<section class="workspace">
	<div class="workspace-toolbar">
		<div class="search-shell">
			<span class="search-icon">⌕</span>
			<input
				type="search"
				placeholder="Търси по списък, задача, статус или приоритет"
				bind:value={searchQuery}
			/>
		</div>

		<div class="toolbar-actions">
			<a class="btn-ghost" href={data.showClosed ? `/projects/${data.project.id}` : `/projects/${data.project.id}?showClosed=1`}>
				{data.showClosed ? 'Скрий приключените' : 'Покажи приключените'}
			</a>
		</div>
	</div>

	<div class="list-legend">
		<span>Списъците са показани като компактни работни изгледи. Натиснете задача, за да отворите детайлите ѝ.</span>
	</div>

	<div class="task-lists">
		{#each filteredTaskLists as taskList}
			<section class="task-list">
				<header class="task-list-header">
					<div>
						<div class="task-list-title-row">
							<h2>{taskList.name}</h2>
							<span class="badge" class:muted={taskList.isArchived} class:success={!taskList.isArchived}>
								{taskList.isArchived ? 'Архивен' : 'Активен'}
							</span>
							<span class="counter">{taskList.tasks.length}</span>
						</div>
						{#if taskList.description}
							<p class="task-list-description">{taskList.description}</p>
						{/if}
					</div>

					<div class="task-list-actions">
						{#if taskList.hiddenClosedTaskCount > 0}
							<span class="hint">{taskList.hiddenClosedTaskCount} скрити</span>
						{/if}
						{#if data.permissions.canManageTasks}
							<button type="button" class="btn-ghost" onclick={() => openCreateTaskModal(taskList.id)}>
								+ Добави задача
							</button>
						{/if}
					</div>
				</header>

				{#if taskList.tasks.length === 0}
					<div class="empty-state">Няма задачи в този изглед.</div>
				{:else}
					<div class="task-table">
						<div class="task-table-head">
							<span>Задача</span>
							<span>Статус</span>
							<span>Срок</span>
							<span>Приоритет</span>
							<span>Таксуване</span>
						</div>

						{#each taskList.tasks as task}
							<button type="button" class="task-row" onclick={() => openTaskModal(task.id)}>
								<span class="task-main">
									<span class="task-title">{task.title}</span>
									<span class="task-secondary">
										{#if task.description}
											{task.description}
										{:else}
											Създадена от {userLabel(task.createdByUser)}
										{/if}
									</span>
									<span class="task-secondary">Назначени: {assigneeNames(task)}</span>
								</span>
								<span class="task-cell">
									<span class="status-pill" data-status={task.status}>{taskStatusLabels[task.status]}</span>
								</span>
								<span class="task-cell">{formatDeadline(task.deadlineDateInput)}</span>
								<span class="task-cell">
									<span class="priority-pill" data-priority={task.priority}>{priorityLabels[task.priority]}</span>
								</span>
								<span class="task-cell billing-cell">
									{billingTypeLabels[task.billingType]}
									{#if data.permissions.canViewFinancials && task.billingType === 'flat_fee'}
										<small>{formatMoneyFromCents(task.flatFeeAmountCents)} {data.company.currency}</small>
									{/if}
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	</div>
</section>

{#if filteredTaskLists.length === 0}
	<section class="empty-card">
		<h2>Няма съвпадения</h2>
		<p>Опитайте с по-кратка дума или покажете приключените задачи.</p>
	</section>
{/if}

{#if createTaskListOpen}
	<div class="modal-backdrop" role="presentation" tabindex="-1" onclick={closeCreateTaskListModal} onkeydown={(event) => event.key === 'Escape' && closeCreateTaskListModal()}>
		<div class="modal" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="task-list-modal-title" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.key === 'Escape' && closeCreateTaskListModal()}>
			<div class="modal-header">
				<div>
					<div class="eyebrow">Нов списък</div>
					<h2 id="task-list-modal-title">Създай списък със задачи</h2>
				</div>
				<button type="button" class="icon-btn" onclick={closeCreateTaskListModal}>✕</button>
			</div>
			<form method="POST" action="?/createTaskList" class="modal-form">
				<input type="hidden" name="projectId" value={data.project.id} />
				<div class="field">
					<label for="task-list-name">Име</label>
					<input id="task-list-name" name="name" type="text" value={taskListFieldValue('name')} required />
					{#if taskListFieldError('name')}<span class="error-text">{taskListFieldError('name')}</span>{/if}
				</div>
				<div class="field">
					<label for="task-list-description">Описание</label>
					<textarea id="task-list-description" name="description" rows="4">{taskListFieldValue('description')}</textarea>
					{#if taskListFieldError('description')}<span class="error-text">{taskListFieldError('description')}</span>{/if}
				</div>
				<label class="checkbox">
					<input type="checkbox" name="isArchived" checked={Boolean(taskListFieldValue('isArchived', false))} />
					<span>Създай като архивен списък</span>
				</label>
				<div class="modal-actions">
					<button type="button" class="btn-secondary" onclick={closeCreateTaskListModal}>Отказ</button>
					<button type="submit" class="btn-primary">Създай списък</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if createTaskModal}
	<div class="modal-backdrop" role="presentation" tabindex="-1" onclick={closeCreateTaskModal} onkeydown={(event) => event.key === 'Escape' && closeCreateTaskModal()}>
		<div class="modal modal-wide" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="task-create-modal-title" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.key === 'Escape' && closeCreateTaskModal()}>
			<div class="modal-header">
				<div>
					<div class="eyebrow">Нова задача</div>
					<h2 id="task-create-modal-title">Добави задача</h2>
				</div>
				<button type="button" class="icon-btn" onclick={closeCreateTaskModal}>✕</button>
			</div>

			<form method="POST" action="?/createTask" class="modal-form">
				<input type="hidden" name="projectId" value={data.project.id} />

				<div class="grid two">
					<div class="field">
						<label for="create-taskListId">Списък</label>
						<select id="create-taskListId" name="taskListId">
							{#each data.project.taskLists as option}
								<option value={option.id} selected={currentCreateTaskListId() === option.id}>
									{option.name}{option.isArchived ? ' · архивен' : ''}
								</option>
							{/each}
						</select>
						{#if createTaskFieldError('taskListId')}<span class="error-text">{createTaskFieldError('taskListId')}</span>{/if}
					</div>

					<div class="field">
						<label for="create-title">Заглавие</label>
						<input id="create-title" name="title" type="text" value={createTaskFieldValue('title')} required />
						{#if createTaskFieldError('title')}<span class="error-text">{createTaskFieldError('title')}</span>{/if}
					</div>

					<div class="field">
						<label for="create-status">Статус</label>
						<select id="create-status" name="status">
							{#each Object.entries(taskStatusLabels) as [value, label]}
								<option value={value} selected={createTaskFieldValue('status', 'todo') === value}>{label}</option>
							{/each}
						</select>
						{#if createTaskFieldError('status')}<span class="error-text">{createTaskFieldError('status')}</span>{/if}
					</div>

					<div class="field">
						<label for="create-priority">Приоритет</label>
						<select id="create-priority" name="priority">
							{#each Object.entries(priorityLabels) as [value, label]}
								<option value={value} selected={createTaskFieldValue('priority', 'medium') === value}>{label}</option>
							{/each}
						</select>
						{#if createTaskFieldError('priority')}<span class="error-text">{createTaskFieldError('priority')}</span>{/if}
					</div>

					<div class="field">
						<label for="create-deadlineDate">Срок</label>
						<input id="create-deadlineDate" name="deadlineDate" type="date" value={createTaskFieldValue('deadlineDate')} />
						{#if createTaskFieldError('deadlineDate')}<span class="error-text">{createTaskFieldError('deadlineDate')}</span>{/if}
					</div>

					<div class="field">
						<label for="create-billingType">Тип таксуване</label>
						<select
							id="create-billingType"
							name="billingType"
							bind:value={createTaskBillingType}
							disabled={data.project.client.isInternal}
						>
							{#each Object.entries(billingTypeLabels) as [value, label]}
								<option value={value}>
									{label}
								</option>
							{/each}
						</select>
						{#if data.project.client.isInternal}
							<input type="hidden" name="billingType" value="non_billable" />
						{/if}
						{#if createTaskFieldError('billingType')}<span class="error-text">{createTaskFieldError('billingType')}</span>{/if}
					</div>

					<div class="field" hidden={createTaskBillingType !== 'flat_fee'}>
						<label for="create-flatFeeAmount">Фиксирана цена ({data.company.currency})</label>
						<input id="create-flatFeeAmount" name="flatFeeAmount" type="text" inputmode="decimal" value={createTaskFieldValue('flatFeeAmount')} />
						{#if createTaskFieldError('flatFeeAmount')}<span class="error-text">{createTaskFieldError('flatFeeAmount')}</span>{/if}
					</div>
				</div>

				<div class="field">
					<label>Назначени изпълнители</label>
					<div class="assignee-grid">
						{#each data.project.members as member}
							<label class="member-option">
								<input
									type="checkbox"
									name="assigneeUserIds"
									value={member.userId}
									checked={createTaskFieldValues('assigneeUserIds').includes(member.userId)}
								/>
								<span>{userLabel(member.user)}</span>
								<small>{member.user.role}{member.user.status === 'inactive' ? ' неактивен' : ''}</small>
							</label>
						{/each}
					</div>
					{#if createTaskFieldError('assigneeUserIds')}<span class="error-text">{createTaskFieldError('assigneeUserIds')}</span>{/if}
				</div>

				<div class="field">
					<label for="create-description">Описание</label>
					<textarea id="create-description" name="description" rows="5">{createTaskFieldValue('description')}</textarea>
					{#if createTaskFieldError('description')}<span class="error-text">{createTaskFieldError('description')}</span>{/if}
				</div>

				<div class="modal-actions">
					<button type="button" class="btn-secondary" onclick={closeCreateTaskModal}>Отказ</button>
					<button type="submit" class="btn-primary">Създай задача</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if selectedTask}
	{@const task = selectedTask}
	<div class="modal-backdrop" role="presentation" tabindex="-1" onclick={closeTaskModal} onkeydown={(event) => event.key === 'Escape' && closeTaskModal()}>
		<div class="modal modal-wide" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="task-details-modal-title" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.key === 'Escape' && closeTaskModal()}>
			<div class="modal-header">
				<div>
					<div class="eyebrow">Детайли по задача</div>
					<h2 id="task-details-modal-title">{task.title}</h2>
				</div>
				<button type="button" class="icon-btn" onclick={closeTaskModal}>x</button>
			</div>
			<div class="detail-strip">
				<span class="status-pill" data-status={task.status}>{taskStatusLabels[task.status]}</span>
				<span class="priority-pill" data-priority={task.priority}>{priorityLabels[task.priority]}</span>
				<span class="meta-chip">{billingTypeLabels[task.billingType]}</span>
				<span class="meta-chip">{formatDeadline(task.deadlineDateInput)}</span>
				<span class="meta-chip">Създадена от {userLabel(task.createdByUser)}</span>
			</div>
			{#if data.permissions.canManageTasks}
				<form method="POST" action="?/updateTask" class="modal-form">
					<input type="hidden" name="taskId" value={task.id} />
					<input type="hidden" name="projectId" value={data.project.id} />
					<div class="grid two">
						<div class="field">
						<label for={'task-title-' + task.id}>Заглавие</label>
							<input id={'task-title-' + task.id} name="title" type="text" value={taskFieldValue('title', task.title)} required />
							{#if taskFieldError('title')}<span class="error-text">{taskFieldError('title')}</span>{/if}
						</div>
						<div class="field">
							<label for={'task-taskListId-' + task.id}>Списък</label>
							<select id={'task-taskListId-' + task.id} name="taskListId">
								{#each data.project.taskLists as option}
									<option value={option.id} selected={taskFieldValue('taskListId', task.taskListId) === option.id}>
										{option.name}{option.isArchived ? ' · архивен' : ''}
									</option>
								{/each}
							</select>
							{#if taskFieldError('taskListId')}<span class="error-text">{taskFieldError('taskListId')}</span>{/if}
						</div>
						<div class="field">
							<label for={'task-status-' + task.id}>Статус</label>
							<select id={'task-status-' + task.id} name="status">
								{#each Object.entries(taskStatusLabels) as [value, label]}
									<option value={value} selected={taskFieldValue('status', task.status) === value}>{label}</option>
								{/each}
							</select>
							{#if taskFieldError('status')}<span class="error-text">{taskFieldError('status')}</span>{/if}
						</div>
						<div class="field">
							<label for={'task-priority-' + task.id}>Приоритет</label>
							<select id={'task-priority-' + task.id} name="priority">
								{#each Object.entries(priorityLabels) as [value, label]}
									<option value={value} selected={taskFieldValue('priority', task.priority) === value}>{label}</option>
								{/each}
							</select>
							{#if taskFieldError('priority')}<span class="error-text">{taskFieldError('priority')}</span>{/if}
						</div>
						<div class="field">
							<label for={'task-deadlineDate-' + task.id}>Срок</label>
							<input id={'task-deadlineDate-' + task.id} name="deadlineDate" type="date" value={taskFieldValue('deadlineDate', task.deadlineDateInput)} />
							{#if taskFieldError('deadlineDate')}<span class="error-text">{taskFieldError('deadlineDate')}</span>{/if}
						</div>
						<div class="field">
							<label for={'task-billingType-' + task.id}>Тип таксуване</label>
							<select
								id={'task-billingType-' + task.id}
								name="billingType"
								bind:value={selectedTaskBillingType}
								disabled={data.project.client.isInternal}
							>
								{#each Object.entries(billingTypeLabels) as [value, label]}
									<option value={value}>{label}</option>
								{/each}
							</select>
							{#if data.project.client.isInternal}
								<input type="hidden" name="billingType" value="non_billable" />
							{/if}
							{#if taskFieldError('billingType')}<span class="error-text">{taskFieldError('billingType')}</span>{/if}
						</div>
						<div class="field" hidden={selectedTaskBillingType !== 'flat_fee'}>
							<label for={'task-flatFeeAmount-' + task.id}>Фиксирана цена ({data.company.currency})</label>
							<input
								id={'task-flatFeeAmount-' + task.id}
								name="flatFeeAmount"
								type="text"
								inputmode="decimal"
								value={taskFieldValue('flatFeeAmount', formatMoneyFromCents(task.flatFeeAmountCents))}
							/>
							{#if taskFieldError('flatFeeAmount')}<span class="error-text">{taskFieldError('flatFeeAmount')}</span>{/if}
						</div>
					</div>
					<div class="field">
						<label>Assignees</label>
						<div class="assignee-grid">
							{#each data.project.members as member}
								<label class="member-option">
									<input
										type="checkbox"
										name="assigneeUserIds"
										value={member.userId}
										checked={taskFieldValues('assigneeUserIds', task.assignees.map((assignee) => assignee.userId)).includes(member.userId)}
									/>
									<span>{userLabel(member.user)}</span>
									<small>{member.user.role}{member.user.status === 'inactive' ? ' - inactive' : ''}</small>
								</label>
							{/each}
						</div>
						{#if taskFieldError('assigneeUserIds')}<span class="error-text">{taskFieldError('assigneeUserIds')}</span>{/if}
					</div>
					<div class="field">
						<label for={'task-description-' + task.id}>Описание</label>
						<textarea id={'task-description-' + task.id} name="description" rows="6">{taskFieldValue('description', task.description)}</textarea>
						{#if taskFieldError('description')}<span class="error-text">{taskFieldError('description')}</span>{/if}
					</div>
					<div class="modal-actions">
						<button type="button" class="btn-secondary" onclick={closeTaskModal}>Close</button>
						<button type="submit" class="btn-primary">
							{['done', 'cancelled'].includes(task.status) ? 'Запази и отвори отново при нужда' : 'Запази задачата'}
						</button>
					</div>
				</form>
			{:else}
				<div class="modal-form">
					<div class="detail-grid">
						<div class="field">
							<label>Списък</label>
							<div class="detail-value">{data.project.taskLists.find((entry) => entry.id === task.taskListId)?.name ?? 'None'}</div>
						</div>
						<div class="field">
							<label>Краен срок</label>
							<div class="detail-value">{formatDeadline(task.deadlineDateInput)}</div>
						</div>
						<div class="field">
							<label>Приоритет</label>
							<div class="detail-value">{priorityLabels[task.priority]}</div>
						</div>
						<div class="field">
							<label>Билинг тип</label>
							<div class="detail-value">{billingTypeLabels[task.billingType]}</div>
						</div>
					</div>
					<div class="field">
						<label>Назначени</label>
						<div class="detail-value">{assigneeNames(task)}</div>
					</div>
					<div class="field">
						<label>Описание</label>
						<div class="detail-value detail-value-block">{task.description || 'Няма описание'}</div>
					</div>
					<div class="modal-actions">
						<button type="button" class="btn-secondary" onclick={closeTaskModal}>Затвори</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	:global(body) {
		background:
			radial-gradient(circle at top left, rgba(244, 190, 108, 0.18), transparent 32%),
			linear-gradient(180deg, #f7f4ec 0%, #eef2f7 100%);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		margin-bottom: 18px;
		color: #295e56;
		font-weight: 700;
	}

	.hero {
		display: flex;
		justify-content: space-between;
		gap: 24px;
		margin-bottom: 18px;
		padding: 28px;
		border: 1px solid rgba(15, 23, 42, 0.06);
		border-radius: 22px;
		background: rgba(255, 255, 255, 0.9);
		box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
		backdrop-filter: blur(10px);
	}

	.eyebrow {
		font-size: 0.76rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #7c6f59;
		margin-bottom: 8px;
	}

	h1,
	h2 {
		margin: 0;
		color: #18212f;
	}

	h1 {
		font-size: clamp(1.7rem, 2vw, 2.35rem);
		line-height: 1.1;
	}

	p {
		margin: 0;
		color: #5a6473;
	}

	.hero-copy {
		display: grid;
		gap: 10px;
		max-width: 720px;
	}

	.hero-side {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 14px;
	}

	.hero-badges,
	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 10px;
	}

	.workspace {
		display: grid;
		gap: 18px;
		padding: 20px;
		border: 1px solid rgba(15, 23, 42, 0.06);
		border-radius: 22px;
		background: rgba(255, 255, 255, 0.82);
		box-shadow: 0 20px 40px rgba(148, 163, 184, 0.12);
		backdrop-filter: blur(10px);
	}

	.workspace-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 14px;
	}

	.search-shell {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		padding: 12px 14px;
		border: 1px solid #d5dde8;
		border-radius: 16px;
		background: #fff;
	}

	.search-icon {
		color: #8a95a6;
		font-size: 1rem;
	}

	.search-shell input {
		border: none;
		outline: none;
		background: transparent;
		width: 100%;
		font: inherit;
		color: #18212f;
	}

	.toolbar-actions {
		display: flex;
		gap: 10px;
	}

	.list-legend {
		padding: 0 2px;
		font-size: 0.9rem;
		color: #6b7280;
	}

	.task-lists {
		display: grid;
		gap: 16px;
	}

	.task-list,
	.empty-card {
		border: 1px solid #e6ebf2;
		border-radius: 20px;
		background: #fff;
		overflow: hidden;
	}

	.task-list-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		padding: 18px 20px;
		border-bottom: 1px solid #eef2f7;
	}

	.task-list-title-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 6px;
	}

	.task-list-description {
		color: #6b7280;
	}

	.task-list-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.task-table {
		display: grid;
	}

	.task-table-head,
	.task-row {
		display: grid;
		grid-template-columns: minmax(260px, 2.4fr) 1fr 1fr 1fr 1.2fr;
		gap: 14px;
		align-items: center;
		padding: 0 20px;
	}

	.task-table-head {
		padding-top: 10px;
		padding-bottom: 10px;
		font-size: 0.77rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #94a3b8;
		background: #fbfcfe;
	}

	.task-row {
		border: none;
		border-top: 1px solid #f1f5f9;
		background: #fff;
		text-align: left;
		cursor: pointer;
		transition: background 0.18s ease, transform 0.18s ease;
		padding-top: 14px;
		padding-bottom: 14px;
	}

	.task-row:hover {
		background: #f8fafc;
	}

	.task-main {
		display: grid;
		gap: 4px;
		min-width: 0;
	}

	.task-title {
		font-weight: 700;
		color: #18212f;
	}

	.task-secondary {
		display: -webkit-box;
		line-clamp: 1;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: 0.9rem;
		color: #6b7280;
	}

	.task-cell {
		display: flex;
		align-items: center;
		font-size: 0.93rem;
		color: #475569;
	}

	.billing-cell {
		display: grid;
		gap: 2px;
	}

	.billing-cell small {
		color: #8a95a6;
	}

	.empty-state,
	.empty-card {
		padding: 22px 20px;
		color: #6b7280;
	}

	input,
	select,
	textarea,
	button {
		font: inherit;
	}

	input,
	select,
	textarea {
		width: 100%;
		border: 1px solid #cfd8e3;
		border-radius: 14px;
		padding: 11px 13px;
		background: #fff;
		color: #18212f;
	}

	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: #2a8c7b;
		box-shadow: 0 0 0 4px rgba(42, 140, 123, 0.12);
	}

	input:disabled,
	select:disabled,
	textarea:disabled {
		background: #f8fafc;
		color: #64748b;
	}

	textarea {
		resize: vertical;
		min-height: 6rem;
		white-space: pre-wrap;
	}

	.field {
		display: grid;
		gap: 6px;
	}

	label {
		font-size: 0.88rem;
		font-weight: 700;
		color: #334155;
	}

	.grid {
		display: grid;
		gap: 16px;
	}

	.grid.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.assignee-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.member-option {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px;
		border: 1px solid #dbe4f0;
		border-radius: 14px;
		background: #fff;
	}

	.member-option input {
		width: auto;
		margin-bottom: 4px;
	}

	.member-option small {
		color: #64748b;
		font-size: 0.82rem;
	}

	.btn-primary,
	.btn-secondary,
	.btn-ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border-radius: 14px;
		padding: 10px 15px;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
	}

	.btn-primary {
		border: none;
		color: #fff;
		background: linear-gradient(135deg, #2a8c7b 0%, #295e56 100%);
		box-shadow: 0 10px 18px rgba(41, 94, 86, 0.18);
	}

	.btn-primary:hover {
		transform: translateY(-1px);
	}

	.btn-secondary {
		border: 1px solid #d5dde8;
		background: #fff;
		color: #18212f;
	}

	.btn-ghost {
		border: none;
		background: #f4f7fb;
		color: #295e56;
	}

	.icon-btn {
		border: none;
		background: transparent;
		color: #64748b;
		font-size: 1rem;
		cursor: pointer;
	}

	.badge,
	.counter,
	.meta-chip,
	.status-pill,
	.priority-pill {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		padding: 5px 10px;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.badge.success,
	.status-pill[data-status='done'] {
		background: #dcfce7;
		color: #166534;
	}

	.badge.warning {
		background: #fef3c7;
		color: #92400e;
	}

	.badge.muted,
	.meta-chip,
	.status-pill[data-status='cancelled'] {
		background: #e2e8f0;
		color: #475569;
	}

	.badge.info,
	.status-pill[data-status='in_progress'] {
		background: #dbeafe;
		color: #1d4ed8;
	}

	.status-pill[data-status='todo'] {
		background: #fef3c7;
		color: #9a3412;
	}

	.priority-pill[data-priority='high'] {
		background: #fee2e2;
		color: #b91c1c;
	}

	.priority-pill[data-priority='medium'] {
		background: #fef3c7;
		color: #92400e;
	}

	.priority-pill[data-priority='low'] {
		background: #e0f2fe;
		color: #0369a1;
	}

	.counter {
		min-width: 28px;
		justify-content: center;
		background: #f1f5f9;
		color: #475569;
	}

	.alert {
		padding: 12px 14px;
		border-radius: 14px;
		margin-bottom: 14px;
		font-size: 0.93rem;
	}

	.alert.error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.alert.success {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #166534;
	}

	.error-text {
		font-size: 0.82rem;
		color: #dc2626;
	}

	.hint {
		font-size: 0.82rem;
		color: #94a3b8;
	}

	.checkbox {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}

	.checkbox input {
		width: auto;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(15, 23, 42, 0.5);
		backdrop-filter: blur(8px);
		z-index: 50;
	}

	.modal {
		width: min(680px, 100%);
		max-height: min(88vh, 920px);
		overflow: auto;
		border-radius: 24px;
		background: #fff;
		box-shadow: 0 30px 60px rgba(15, 23, 42, 0.3);
	}

	.modal-wide {
		width: min(860px, 100%);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		padding: 22px 24px 12px;
	}

	.modal-form {
		display: grid;
		gap: 16px;
		padding: 0 24px 24px;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}

	.detail-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		padding: 0 24px 18px;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}

	.detail-value {
		padding: 12px 14px;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		background: #f8fafc;
		color: #334155;
	}

	.detail-value-block {
		white-space: pre-wrap;
		min-height: 5rem;
	}

	@media (max-width: 980px) {
		.hero,
		.workspace-toolbar,
		.task-list-header {
			flex-direction: column;
		}

		.hero-side,
		.hero-badges,
		.hero-actions {
			align-items: flex-start;
			justify-content: flex-start;
		}

		.task-table-head {
			display: none;
		}

		.task-row {
			grid-template-columns: 1fr;
			gap: 8px;
			padding-top: 16px;
			padding-bottom: 16px;
		}

		.task-cell {
			font-size: 0.88rem;
		}
	}

	@media (max-width: 720px) {
		.workspace,
		.hero,
		.task-list-header,
		.modal-header,
		.modal-form,
		.detail-strip,
		.task-table-head,
		.task-row {
			padding-left: 16px;
			padding-right: 16px;
		}

		.grid.two {
			grid-template-columns: 1fr;
		}

		.assignee-grid,
		.detail-grid {
			grid-template-columns: 1fr;
		}

		.modal-actions {
			flex-direction: column-reverse;
		}

		.btn-primary,
		.btn-secondary,
		.btn-ghost {
			width: 100%;
		}
	}
</style>


