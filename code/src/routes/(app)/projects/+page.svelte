<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import Icon from '$lib/components/Icon.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);
	let activeProjectId = $state<string | null>(null);
	let filterStatus = $state<'all' | 'active' | 'on_hold' | 'completed'>('all');

	const statusLabels: Record<string, string> = {
		active: 'Активен', on_hold: 'На пауза', completed: 'Завършен', cancelled: 'Отказан'
	};

	const roleLabels: Record<string, string> = {
		admin: 'Администратор', manager: 'Мениджър', employee: 'Служител', accountant: 'Счетоводител'
	};

	function userLabel(user: { firstName: string; lastName: string }) {
		return `${user.firstName} ${user.lastName}`;
	}

	function userInitials(user: { firstName: string; lastName: string }) {
		return (user.firstName[0] ?? '') + (user.lastName[0] ?? '');
	}

	function isManagerRole(user: { role: string }) {
		return ['admin', 'manager'].includes(user.role);
	}

	function projectMemberIds(members: Array<{ userId: string }>) {
		return members.map((m) => m.userId);
	}

	function createFieldError(field: string) {
		return (form as any)?.createProjectErrors?.[field]?.[0];
	}

	function createFieldValue(field: string, fallback: string | boolean = '') {
		return (form as any)?.createProjectValues?.[field] ?? fallback;
	}

	function createFieldValues(field: string): string[] {
		return ((form as any)?.createProjectValues?.[field] ?? []) as string[];
	}

	function isActiveProjectForm(projectId: string) {
		return (form as any)?.projectFormProjectId === projectId;
	}

	function projectFieldError(projectId: string, field: string) {
		return isActiveProjectForm(projectId) ? (form as any)?.projectFormErrors?.[field]?.[0] : null;
	}

	function projectFieldValue(projectId: string, field: string, fallback: string | boolean | null) {
		return isActiveProjectForm(projectId) ? ((form as any)?.projectFormValues?.[field] ?? fallback ?? '') : (fallback ?? '');
	}

	function projectFieldValues(projectId: string, fallback: string[]): string[] {
		return isActiveProjectForm(projectId)
			? (((form as any)?.projectFormValues?.memberUserIds ?? fallback) as string[])
			: fallback;
	}

	function projectRateFieldError(projectId: string, field: string) {
		return (form as any)?.projectRateOverrideProjectId === projectId
			? (form as any)?.projectRateOverrideErrors?.[field]?.[0]
			: null;
	}

	function projectRateFieldValue(projectId: string, field: string, fallback = '') {
		if ((form as any)?.projectRateOverrideProjectId === projectId) {
			return (form as any)?.projectRateOverrideValues?.[field] ?? fallback;
		}
		return field === 'effectiveFrom' ? new Date().toISOString().slice(0, 10) : fallback;
	}

	function canViewProjectRates(project: { primaryManagerUserId: string }) {
		if (data.permissions.currentUserRole === 'admin' || data.permissions.currentUserRole === 'accountant') return true;
		return data.permissions.currentUserRole === 'manager' && project.primaryManagerUserId === data.permissions.currentUserId;
	}

	function formatDate(value: string | Date) {
		return new Intl.DateTimeFormat('bg-BG', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
	}

	function formatMoneyFromCents(value: number | null | undefined) {
		if (value == null) return '';
		return (value / 100).toFixed(2);
	}

	function formatMoney(value: number | null | undefined) {
		const n = formatMoneyFromCents(value);
		return n ? `${n} ${data.company.currency}` : 'Няма';
	}

	function toggleProject(projectId: string) {
		activeProjectId = activeProjectId === projectId ? null : projectId;
	}

	function isExpanded(projectId: string) {
		return activeProjectId === projectId;
	}

	$effect(() => {
		if ((form as any)?.createProjectSuccess) showCreateForm = false;
		if ((form as any)?.projectFormProjectId) activeProjectId = (form as any).projectFormProjectId;
	});

	const filteredProjects = $derived(
		data.projects.filter((p: any) => filterStatus === 'all' || p.status === filterStatus)
	);

	const avatarColors = ['#4f46e5', '#0891b2', '#dc2626', '#ca8a04', '#059669', '#7c3aed', '#0e7490', '#b45309'];

	function avatarColor(index: number) {
		return avatarColors[index % avatarColors.length];
	}
</script>

<svelte:head>
	<title>Проекти – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Проекти</h1>
		<p class="page-sub">
			{data.projects.filter((p: any) => p.status === 'active').length} активни ·
			{data.projects.filter((p: any) => p.status === 'completed').length} завършени ·
			{data.projects.filter((p: any) => p.status === 'on_hold').length} на пауза
		</p>
	</div>
	<div class="page-header-actions">
		{#if data.permissions.canManageProjects}
			<button class="btn btn-primary btn-sm" onclick={() => (showCreateForm = !showCreateForm)}>
				<Icon name="plus" size={13}/>{showCreateForm ? 'Отказ' : 'Нов проект'}
			</button>
		{/if}
	</div>
</div>

<!-- Alerts -->
{#if (form as any)?.createProjectError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).createProjectError}</div>
{/if}
{#if (form as any)?.createProjectSuccess}
	<div class="alert warning" style="margin-bottom:12px;">Проектът е създаден.</div>
{/if}
{#if (form as any)?.projectFormError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).projectFormError}</div>
{/if}
{#if (form as any)?.projectFormSuccess}
	<div class="alert warning" style="margin-bottom:12px;">Проектът е обновен.</div>
{/if}
{#if (form as any)?.projectRateOverrideError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).projectRateOverrideError}</div>
{/if}
{#if (form as any)?.projectRateOverrideSuccess}
	<div class="alert warning" style="margin-bottom:12px;">Историята на билируемата ставка е добавена.</div>
{/if}

<!-- Create form -->
{#if showCreateForm && data.permissions.canManageProjects}
	<div class="card" style="margin-bottom:16px;">
		<div class="card-header">
			<h3 class="card-title">Нов проект</h3>
		</div>
		<form method="POST" action="?/createProject" style="padding:16px;">
			<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
				<div class="field">
					<label class="label" for="create-clientId">Клиент</label>
					<select class="select" id="create-clientId" name="clientId" required>
						<option value="">Изберете клиент</option>
						{#each data.clients as client}
							<option value={client.id} selected={createFieldValue('clientId') === client.id}>
								{client.legalName}{client.isInternal ? ' · вътрешен' : ''}
							</option>
						{/each}
					</select>
					{#if createFieldError('clientId')}<span style="color:var(--danger); font-size:11px;">{createFieldError('clientId')}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="create-name">Ime на проекта</label>
					<input class="input" id="create-name" name="name" type="text" value={createFieldValue('name')} required />
					{#if createFieldError('name')}<span style="color:var(--danger); font-size:11px;">{createFieldError('name')}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="create-primaryManagerUserId">Основен мениджър</label>
					<select class="select" id="create-primaryManagerUserId" name="primaryManagerUserId" required>
						<option value="">Изберете мениджър</option>
						{#each data.users.filter(isManagerRole) as user}
							<option value={user.id} selected={createFieldValue('primaryManagerUserId') === user.id}>
								{userLabel(user)} · {roleLabels[user.role]}
							</option>
						{/each}
					</select>
					{#if createFieldError('primaryManagerUserId')}<span style="color:var(--danger); font-size:11px;">{createFieldError('primaryManagerUserId')}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="create-status">Статус</label>
					<select class="select" id="create-status" name="status">
						{#each Object.entries(statusLabels) as [val, lbl]}
							<option value={val} selected={createFieldValue('status', 'active') === val}>{lbl}</option>
						{/each}
					</select>
				</div>
				<div class="field">
					<label class="label" for="create-budgetAmount">Бюджет ({data.company.currency})</label>
					<input class="input" id="create-budgetAmount" name="budgetAmount" type="text" inputmode="decimal" value={createFieldValue('budgetAmount')} />
				</div>
				<div class="field">
					<label class="label" for="create-retainerAmount">Абонамент ({data.company.currency})</label>
					<input class="input" id="create-retainerAmount" name="retainerAmount" type="text" inputmode="decimal" value={createFieldValue('retainerAmount')} />
				</div>
			</div>
			<div class="field" style="margin-bottom:12px;">
				<label class="label" for="create-description">Описание</label>
				<textarea class="input" id="create-description" name="description" rows="3" style="resize:vertical;">{createFieldValue('description')}</textarea>
			</div>
			<label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:16px; cursor:pointer;">
				<input type="checkbox" name="isBillable" checked={Boolean(createFieldValue('isBillable', true))} />
				Билируем проект
			</label>
			<div style="margin-bottom:16px;">
				<div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-family:var(--font-mono); margin-bottom:8px;">Екип на проекта</div>
				<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px;">
					{#each data.users as user}
						<label style="display:flex; align-items:center; gap:6px; padding:6px 8px; border:1px solid var(--border); border-radius:var(--r-md); font-size:12px; cursor:pointer;">
							<input type="checkbox" name="memberUserIds" value={user.id} checked={createFieldValues('memberUserIds').includes(user.id)} />
							<span>{userLabel(user)}</span>
							<span class="muted" style="font-size:11px;">· {roleLabels[user.role]}</span>
						</label>
					{/each}
				</div>
			</div>
			<div class="row gap-2">
				<button type="submit" class="btn btn-primary btn-sm">Създай проект</button>
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => (showCreateForm = false)}>Отказ</button>
			</div>
		</form>
	</div>
{/if}

<!-- Filter row -->
<div class="row gap-2" style="margin-bottom:16px;">
	<div class="chip-group">
		<button class="chip {filterStatus === 'all' ? 'active' : ''}" onclick={() => (filterStatus = 'all')}>Всички · {data.projects.length}</button>
		<button class="chip {filterStatus === 'active' ? 'active' : ''}" onclick={() => (filterStatus = 'active')}>Активни · {data.projects.filter((p: any) => p.status === 'active').length}</button>
		<button class="chip {filterStatus === 'completed' ? 'active' : ''}" onclick={() => (filterStatus = 'completed')}>Завършени · {data.projects.filter((p: any) => p.status === 'completed').length}</button>
		<button class="chip {filterStatus === 'on_hold' ? 'active' : ''}" onclick={() => (filterStatus = 'on_hold')}>На пауза · {data.projects.filter((p: any) => p.status === 'on_hold').length}</button>
	</div>
</div>

<!-- Card grid -->
{#if filteredProjects.length === 0}
	<div class="card" style="padding:40px; text-align:center;">
		<div class="muted">Няма проекти в тази категория.</div>
	</div>
{:else}
	<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">
		{#each filteredProjects as project}
			<div class="card" style="cursor:pointer;" role="button" tabindex="0"
				onclick={() => toggleProject(project.id)}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProject(project.id); } }}>
				<div style="padding:16px;">
					<div class="row-between" style="margin-bottom:8px;">
						<span class="amount muted" style="font-size:11px;">{project.client.legalName}</span>
						{#if project.status === 'completed'}
							<span class="badge task-done">Завършен</span>
						{:else if project.status === 'on_hold'}
							<span class="badge inv-partial">На пауза</span>
						{:else if project.status === 'cancelled'}
							<span class="badge task-cancelled">Отказан</span>
						{:else}
							<span class="badge task-progress">В процес</span>
						{/if}
					</div>

					<div style="font-size:14px; font-weight:600; margin-bottom:4px; letter-spacing:-0.005em;">{project.name}</div>
					{#if project.description}
						<div class="muted" style="font-size:12px; margin-bottom:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{project.description}</div>
					{:else}
						<div style="margin-bottom:12px;"></div>
					{/if}

					{#if data.permissions.canViewFinancials && project.budgetAmountCents}
						<div style="margin-bottom:12px;">
							<div class="row-between" style="margin-bottom:4px; font-size:11px;">
								<span class="muted">Бюджет</span>
								<span class="amount" style="font-weight:500;">{formatMoney(project.budgetAmountCents)}</span>
							</div>
						</div>
					{:else}
						<div style="margin-bottom:12px;"></div>
					{/if}

					<div class="row-between" style="border-top:1px solid var(--border-soft); padding-top:10px;">
						<div class="row gap-1">
							{#each project.members.slice(0, 3) as member, idx}
								<div class="sb-avatar" style="width:22px; height:22px; font-size:8px; background:{avatarColor(idx)}; margin-left:{idx > 0 ? '-6px' : '0'}; border:2px solid var(--bg-elevated); z-index:{3-idx}; position:relative;">
									{userInitials(member.user)}
								</div>
							{/each}
							{#if project.members.length > 3}
								<span class="muted" style="font-size:12px; margin-left:4px;">+{project.members.length - 3}</span>
							{/if}
						</div>
						<div class="row gap-2">
							<span class="amount muted" style="font-size:11px;">{project.members.length} в екипа</span>
							<a href="/projects/{project.id}" class="btn btn-ghost btn-sm" style="height:24px; padding:0 8px; font-size:11px;"
								onclick={(e) => e.stopPropagation()}>
								<Icon name="folder" size={12}/>Задачи
							</a>
							{#if data.permissions.canManageProjects}
								<button class="topbar-icon-btn" onclick={(e) => { e.stopPropagation(); toggleProject(project.id); }} aria-label="Настройки">
									<Icon name={isExpanded(project.id) ? 'chevron-down' : 'more'} size={13}/>
								</button>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<!-- Edit panel -->
{#if activeProjectId}
	{@const project = data.projects.find((p: any) => p.id === activeProjectId)}
	{#if project}
		<div class="card" style="margin-top:16px;">
			<div class="card-header">
				<div>
					<h3 class="card-title">Редактиране: {project.name}</h3>
					<div class="card-sub">{project.client.legalName}</div>
				</div>
				<div class="row gap-2">
					<a href="/projects/{project.id}" class="btn btn-secondary btn-sm">
						<Icon name="folder" size={13}/>Задачи и списъци
					</a>
					<button class="btn btn-ghost btn-sm" onclick={() => (activeProjectId = null)}>
						<Icon name="x" size={13}/>Затвори
					</button>
				</div>
			</div>
			<form method="POST" action="?/updateProject" style="padding:16px;">
				<input type="hidden" name="projectId" value={project.id} />
				<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
					<div class="field">
						<label class="label" for="clientId-{project.id}">Клиент</label>
						<select class="select" id="clientId-{project.id}" name="clientId" disabled={!data.permissions.canManageProjects}>
							{#each data.clients as client}
								<option value={client.id} selected={projectFieldValue(project.id, 'clientId', project.clientId) === client.id}>
									{client.legalName}{client.isInternal ? ' · вътрешен' : ''}
								</option>
							{/each}
						</select>
					</div>
					<div class="field">
						<label class="label" for="name-{project.id}">Ime на проекта</label>
						<input class="input" id="name-{project.id}" name="name" type="text"
							value={projectFieldValue(project.id, 'name', project.name)} required
							disabled={!data.permissions.canManageProjects} />
						{#if projectFieldError(project.id, 'name')}<span style="color:var(--danger); font-size:11px;">{projectFieldError(project.id, 'name')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="primaryManagerUserId-{project.id}">Основен мениджър</label>
						<select class="select" id="primaryManagerUserId-{project.id}" name="primaryManagerUserId" disabled={!data.permissions.canManageProjects}>
							{#each data.users.filter(isManagerRole) as user}
								<option value={user.id} selected={projectFieldValue(project.id, 'primaryManagerUserId', project.primaryManagerUserId) === user.id}>
									{userLabel(user)} · {roleLabels[user.role]}
								</option>
							{/each}
						</select>
					</div>
					<div class="field">
						<label class="label" for="status-{project.id}">Статус</label>
						<select class="select" id="status-{project.id}" name="status" disabled={!data.permissions.canManageProjects}>
							{#each Object.entries(statusLabels) as [val, lbl]}
								<option value={val} selected={projectFieldValue(project.id, 'status', project.status) === val}>{lbl}</option>
							{/each}
						</select>
					</div>
					{#if data.permissions.canViewFinancials}
						<div class="field">
							<label class="label" for="budgetAmount-{project.id}">Бюджет ({data.company.currency})</label>
							<input class="input" id="budgetAmount-{project.id}" name="budgetAmount" type="text" inputmode="decimal"
								value={projectFieldValue(project.id, 'budgetAmount', formatMoneyFromCents(project.budgetAmountCents))}
								disabled={!data.permissions.canManageProjects} />
						</div>
						<div class="field">
							<label class="label" for="retainerAmount-{project.id}">Абонамент ({data.company.currency})</label>
							<input class="input" id="retainerAmount-{project.id}" name="retainerAmount" type="text" inputmode="decimal"
								value={projectFieldValue(project.id, 'retainerAmount', formatMoneyFromCents(project.retainerAmountCents))}
								disabled={!data.permissions.canManageProjects} />
						</div>
					{/if}
				</div>
				<div class="field" style="margin-bottom:12px;">
					<label class="label" for="description-{project.id}">Описание</label>
					<textarea class="input" id="description-{project.id}" name="description" rows="3" style="resize:vertical;"
						disabled={!data.permissions.canManageProjects}>{projectFieldValue(project.id, 'description', project.description)}</textarea>
				</div>
				<label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:16px; cursor:pointer;">
					<input type="checkbox" name="isBillable"
						checked={Boolean(projectFieldValue(project.id, 'isBillable', project.isBillable))}
						disabled={!data.permissions.canManageProjects || project.client.isInternal} />
					Билируем проект
				</label>
				<div style="margin-bottom:16px;">
					<div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-family:var(--font-mono); margin-bottom:8px;">Екип на проекта</div>
					<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px;">
						{#each data.users as user}
							<label style="display:flex; align-items:center; gap:6px; padding:6px 8px; border:1px solid var(--border); border-radius:var(--r-md); font-size:12px; cursor:pointer;">
								<input type="checkbox" name="memberUserIds" value={user.id}
									checked={projectFieldValues(project.id, projectMemberIds(project.members)).includes(user.id)}
									disabled={!data.permissions.canManageProjects} />
								<span>{userLabel(user)}</span>
								<span class="muted" style="font-size:11px;">· {roleLabels[user.role]}</span>
							</label>
						{/each}
					</div>
				</div>

				{#if data.permissions.canManageProjects}
					<div class="row gap-2">
						<button type="submit" class="btn btn-primary btn-sm">Запази проекта</button>
						<button type="button" class="btn btn-ghost btn-sm" onclick={() => (activeProjectId = null)}>Отказ</button>
					</div>
				{/if}
			</form>

			{#if canViewProjectRates(project)}
				<div style="padding:16px; border-top:1px solid var(--border);">
					<div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-family:var(--font-mono); margin-bottom:12px;">Проектни билируеми ставки</div>
					<form method="POST" action="?/addProjectMemberRateOverride">
						<input type="hidden" name="projectId" value={project.id} />
						<div style="display:grid; grid-template-columns:1fr 160px 160px auto; gap:8px; margin-bottom:12px; align-items:end;">
							<div class="field" style="margin:0;">
								<label class="label" for="rate-userId-{project.id}">Участник</label>
								<select class="select" id="rate-userId-{project.id}" name="userId">
									<option value="">Изберете</option>
									{#each project.members as member}
										<option value={member.userId} selected={projectRateFieldValue(project.id, 'userId') === member.userId}>
											{userLabel(member.user)}
										</option>
									{/each}
								</select>
								{#if projectRateFieldError(project.id, 'userId')}<span style="color:var(--danger); font-size:11px;">{projectRateFieldError(project.id, 'userId')}</span>{/if}
							</div>
							<div class="field" style="margin:0;">
								<label class="label" for="rate-from-{project.id}">В сила от</label>
								<input class="input" id="rate-from-{project.id}" type="date" name="effectiveFrom" value={projectRateFieldValue(project.id, 'effectiveFrom')} />
							</div>
							<div class="field" style="margin:0;">
								<label class="label" for="rate-val-{project.id}">Ставка ({data.company.currency})</label>
								<input class="input" id="rate-val-{project.id}" type="text" inputmode="decimal" name="billableRate" value={projectRateFieldValue(project.id, 'billableRate')} />
							</div>
							<button type="submit" class="btn btn-secondary btn-sm" style="align-self:end;">Добави</button>
						</div>
					</form>
					{#if project.memberBillableRateOverrides.length > 0}
						<div style="display:flex; flex-direction:column; gap:4px;">
							{#each project.memberBillableRateOverrides as ov}
								<div class="row gap-3" style="font-size:12px; padding:6px 8px; background:var(--surface); border-radius:var(--r-sm);">
									<span style="font-weight:500;">{userLabel(ov.user)}</span>
									<span class="muted">от {formatDate(ov.effectiveFrom)}</span>
									<span class="amount">{formatMoney(ov.billableRateCents)}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
{/if}
