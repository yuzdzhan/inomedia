<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);
	let activeProjectId = $state<string | null>(null);

	const roleLabels: Record<string, string> = {
		admin: 'Администратор',
		manager: 'Мениджър',
		employee: 'Служител',
		accountant: 'Счетоводител'
	};

	const statusLabels: Record<string, string> = {
		active: 'Активен',
		on_hold: 'На пауза',
		completed: 'Завършен',
		cancelled: 'Отказан'
	};

	function userLabel(user: { firstName: string; lastName: string }) {
		return `${user.firstName} ${user.lastName}`;
	}

	function isManagerRole(user: { role: string }) {
		return ['admin', 'manager'].includes(user.role);
	}

	function projectMemberIds(members: Array<{ userId: string }>) {
		return members.map((member) => member.userId);
	}

	function createFieldError(field: string) {
		return (form as any)?.createProjectErrors?.[field]?.[0];
	}

	function createFieldValue(field: string, fallback: string | boolean = '') {
		return (form as any)?.createProjectValues?.[field] ?? fallback;
	}

	function createFieldValues(field: string) {
		return ((form as any)?.createProjectValues?.[field] ?? []) as string[];
	}

	function isActiveProjectForm(projectId: string) {
		return (form as any)?.projectFormProjectId === projectId;
	}

	function projectFieldError(projectId: string, field: string) {
		return isActiveProjectForm(projectId) ? (form as any)?.projectFormErrors?.[field]?.[0] : null;
	}

	function projectFieldValue(projectId: string, field: string, fallback: string | boolean | null) {
		return isActiveProjectForm(projectId)
			? ((form as any)?.projectFormValues?.[field] ?? fallback ?? '')
			: (fallback ?? '');
	}

	function projectFieldValues(projectId: string, fallback: string[]) {
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
		if (data.permissions.currentUserRole === 'admin' || data.permissions.currentUserRole === 'accountant') {
			return true;
		}

		return (
			data.permissions.currentUserRole === 'manager' &&
			project.primaryManagerUserId === data.permissions.currentUserId
		);
	}

	function formatDate(value: string | Date) {
		return new Intl.DateTimeFormat('bg-BG', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(value));
	}

	function toggleProject(projectId: string) {
		activeProjectId = activeProjectId === projectId ? null : projectId;
	}

	function isExpanded(projectId: string) {
		return activeProjectId === projectId;
	}

	function formatMoneyFromCents(value: number | null | undefined) {
		if (value == null) {
			return '';
		}

		return (value / 100).toFixed(2);
	}

	function formatMoney(value: number | null | undefined) {
		const normalized = formatMoneyFromCents(value);
		return normalized ? `${normalized} ${data.company.currency}` : 'Няма';
	}

	$effect(() => {
		if ((form as any)?.createProjectSuccess) {
			showCreateForm = false;
		}

		if ((form as any)?.projectFormProjectId) {
			activeProjectId = (form as any).projectFormProjectId;
		}
	});
</script>

<svelte:head>
	<title>Проекти - Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1>Проекти</h1>
		<p>Клиентски и вътрешни проекти с основен мениджър, екип, бюджет, абонамент и статус.</p>
	</div>
	{#if data.permissions.canManageProjects}
		<button class="btn-primary" onclick={() => (showCreateForm = !showCreateForm)}>
			{showCreateForm ? 'Отказ' : '+ Нов проект'}
		</button>
	{/if}
</div>

{#if (form as any)?.createProjectError}
	<div class="alert error">{(form as any).createProjectError}</div>
{/if}

{#if (form as any)?.createProjectSuccess}
	<div class="alert success">Проектът е създаден.</div>
{/if}

{#if (form as any)?.projectFormError}
	<div class="alert error">{(form as any).projectFormError}</div>
{/if}

{#if (form as any)?.projectFormSuccess}
	<div class="alert success">Проектът е обновен.</div>
{/if}

{#if (form as any)?.projectRateOverrideError}
	<div class="alert error">{(form as any).projectRateOverrideError}</div>
{/if}

{#if (form as any)?.projectRateOverrideSuccess}
	<div class="alert success">Историята на билируемата ставка е добавена.</div>
{/if}

{#if showCreateForm && data.permissions.canManageProjects}
	<section class="card create-card">
		<h2>Нов проект</h2>
		<form method="POST" action="?/createProject">
			<div class="grid two">
				<div class="field">
					<label for="create-clientId">Клиент</label>
					<select id="create-clientId" name="clientId" required>
						<option value="">Изберете клиент</option>
						{#each data.clients as client}
							<option value={client.id} selected={createFieldValue('clientId') === client.id}>
								{client.legalName}{client.isInternal ? ' · вътрешен' : ''}
							</option>
						{/each}
					</select>
					{#if createFieldError('clientId')}<span class="error-text">{createFieldError('clientId')}</span>{/if}
				</div>
				<div class="field">
					<label for="create-name">Име на проекта</label>
					<input id="create-name" name="name" type="text" value={createFieldValue('name')} required />
					{#if createFieldError('name')}<span class="error-text">{createFieldError('name')}</span>{/if}
				</div>
				<div class="field">
					<label for="create-primaryManagerUserId">Основен мениджър</label>
					<select id="create-primaryManagerUserId" name="primaryManagerUserId" required>
						<option value="">Изберете мениджър</option>
						{#each data.users.filter(isManagerRole) as user}
							<option value={user.id} selected={createFieldValue('primaryManagerUserId') === user.id}>
								{userLabel(user)} · {roleLabels[user.role]}
							</option>
						{/each}
					</select>
					{#if createFieldError('primaryManagerUserId')}<span class="error-text">{createFieldError('primaryManagerUserId')}</span>{/if}
				</div>
				<div class="field short-field">
					<label for="create-status">Статус</label>
					<select id="create-status" name="status">
						{#each Object.entries(statusLabels) as [value, label]}
							<option value={value} selected={createFieldValue('status', 'active') === value}>{label}</option>
						{/each}
					</select>
					{#if createFieldError('status')}<span class="error-text">{createFieldError('status')}</span>{/if}
				</div>
				<div class="field">
					<label for="create-budgetAmount">Бюджет ({data.company.currency})</label>
					<input id="create-budgetAmount" name="budgetAmount" type="text" inputmode="decimal" value={createFieldValue('budgetAmount')} />
					{#if createFieldError('budgetAmount')}<span class="error-text">{createFieldError('budgetAmount')}</span>{/if}
				</div>
				<div class="field">
					<label for="create-retainerAmount">Абонамент ({data.company.currency})</label>
					<input id="create-retainerAmount" name="retainerAmount" type="text" inputmode="decimal" value={createFieldValue('retainerAmount')} />
					{#if createFieldError('retainerAmount')}<span class="error-text">{createFieldError('retainerAmount')}</span>{/if}
				</div>
			</div>

			<div class="field">
				<label for="create-description">Описание</label>
				<textarea id="create-description" name="description" rows="4">{createFieldValue('description')}</textarea>
				{#if createFieldError('description')}<span class="error-text">{createFieldError('description')}</span>{/if}
			</div>

			<label class="checkbox">
				<input type="checkbox" name="isBillable" checked={Boolean(createFieldValue('isBillable', true))} />
				<span>Билируем проект</span>
			</label>
			<p class="hint">Ако изберете вътрешния клиент, проектът ще остане небилируем независимо от тази отметка.</p>

			<div class="members-block">
				<div class="members-title">Екип на проекта</div>
				<p class="hint">Основният мениджър се добавя автоматично към екипа.</p>
				<div class="members-grid">
					{#each data.users as user}
						<label class="member-option">
							<input
								type="checkbox"
								name="memberUserIds"
								value={user.id}
								checked={createFieldValues('memberUserIds').includes(user.id)}
							/>
							<span>{userLabel(user)}</span>
							<small>{roleLabels[user.role]}{user.status === 'inactive' ? ' · неактивен' : ''}</small>
						</label>
					{/each}
				</div>
				{#if createFieldError('memberUserIds')}<span class="error-text">{createFieldError('memberUserIds')}</span>{/if}
			</div>

			<button type="submit" class="btn-primary">Създай проект</button>
		</form>
	</section>
{/if}

<div class="project-list">
	{#each data.projects as project}
		<section class="card project-card">
			<button type="button" class="project-toggle" onclick={() => toggleProject(project.id)} aria-expanded={isExpanded(project.id)}>
				<div class="project-head">
					<div class="project-summary">
						<div class="title-row">
							<h2>{project.name}</h2>
							<span class="badge" class:active={project.status === 'active'} class:inactive={project.status !== 'active'}>
								{statusLabels[project.status]}
							</span>
							{#if project.client.isInternal}
								<span class="badge internal">Вътрешен</span>
							{/if}
							{#if !project.isBillable}
								<span class="badge muted">Небилируем</span>
							{/if}
						</div>

						<div class="project-meta">
							<div>
								<span class="meta-label">Клиент</span>
								<span class="meta-value">{project.client.legalName}</span>
							</div>
							<div>
								<span class="meta-label">Мениджър</span>
								<span class="meta-value">{userLabel(project.primaryManager)}</span>
							</div>
							<div>
								<span class="meta-label">Екип</span>
								<span class="meta-value">{project.members.length}</span>
							</div>
							{#if data.permissions.canViewFinancials}
								<div>
									<span class="meta-label">Бюджет</span>
									<span class="meta-value">{formatMoney(project.budgetAmountCents)}</span>
								</div>
								<div>
									<span class="meta-label">Абонамент</span>
									<span class="meta-value">{formatMoney(project.retainerAmountCents)}</span>
								</div>
							{/if}
						</div>
					</div>

					<span class="expand-indicator" class:expanded={isExpanded(project.id)}>
						{isExpanded(project.id) ? 'Скрий' : 'Отвори'}
					</span>
				</div>
			</button>

			{#if isExpanded(project.id)}
				<form method="POST" action="?/updateProject">
					<input type="hidden" name="projectId" value={project.id} />

					<div class="grid two">
						<div class="field">
							<label for={'clientId-' + project.id}>Клиент</label>
							<select id={'clientId-' + project.id} name="clientId" disabled={!data.permissions.canManageProjects}>
								{#each data.clients as client}
									<option value={client.id} selected={projectFieldValue(project.id, 'clientId', project.clientId) === client.id}>
										{client.legalName}{client.isInternal ? ' · вътрешен' : ''}
									</option>
								{/each}
							</select>
							{#if projectFieldError(project.id, 'clientId')}<span class="error-text">{projectFieldError(project.id, 'clientId')}</span>{/if}
						</div>
						<div class="field">
							<label for={'name-' + project.id}>Име на проекта</label>
							<input
								id={'name-' + project.id}
								name="name"
								type="text"
								value={projectFieldValue(project.id, 'name', project.name)}
								required
								disabled={!data.permissions.canManageProjects}
							/>
							{#if projectFieldError(project.id, 'name')}<span class="error-text">{projectFieldError(project.id, 'name')}</span>{/if}
						</div>
						<div class="field">
							<label for={'primaryManagerUserId-' + project.id}>Основен мениджър</label>
							<select
								id={'primaryManagerUserId-' + project.id}
								name="primaryManagerUserId"
								disabled={!data.permissions.canManageProjects}
							>
								{#each data.users.filter(isManagerRole) as user}
									<option
										value={user.id}
										selected={projectFieldValue(project.id, 'primaryManagerUserId', project.primaryManagerUserId) === user.id}
									>
										{userLabel(user)} · {roleLabels[user.role]}
									</option>
								{/each}
							</select>
							{#if projectFieldError(project.id, 'primaryManagerUserId')}<span class="error-text">{projectFieldError(project.id, 'primaryManagerUserId')}</span>{/if}
						</div>
						<div class="field short-field">
							<label for={'status-' + project.id}>Статус</label>
							<select id={'status-' + project.id} name="status" disabled={!data.permissions.canManageProjects}>
								{#each Object.entries(statusLabels) as [value, label]}
									<option value={value} selected={projectFieldValue(project.id, 'status', project.status) === value}>{label}</option>
								{/each}
							</select>
							{#if projectFieldError(project.id, 'status')}<span class="error-text">{projectFieldError(project.id, 'status')}</span>{/if}
						</div>
						{#if data.permissions.canViewFinancials}
							<div class="field">
								<label for={'budgetAmount-' + project.id}>Бюджет ({data.company.currency})</label>
								<input
									id={'budgetAmount-' + project.id}
									name="budgetAmount"
									type="text"
									inputmode="decimal"
									value={projectFieldValue(project.id, 'budgetAmount', formatMoneyFromCents(project.budgetAmountCents))}
									disabled={!data.permissions.canManageProjects}
								/>
								{#if projectFieldError(project.id, 'budgetAmount')}<span class="error-text">{projectFieldError(project.id, 'budgetAmount')}</span>{/if}
							</div>
							<div class="field">
								<label for={'retainerAmount-' + project.id}>Абонамент ({data.company.currency})</label>
								<input
									id={'retainerAmount-' + project.id}
									name="retainerAmount"
									type="text"
									inputmode="decimal"
									value={projectFieldValue(project.id, 'retainerAmount', formatMoneyFromCents(project.retainerAmountCents))}
									disabled={!data.permissions.canManageProjects}
								/>
								{#if projectFieldError(project.id, 'retainerAmount')}<span class="error-text">{projectFieldError(project.id, 'retainerAmount')}</span>{/if}
							</div>
						{/if}
					</div>

					<div class="field">
						<label for={'description-' + project.id}>Описание</label>
						<textarea
							id={'description-' + project.id}
							name="description"
							rows="4"
							disabled={!data.permissions.canManageProjects}
						>{projectFieldValue(project.id, 'description', project.description)}</textarea>
						{#if projectFieldError(project.id, 'description')}<span class="error-text">{projectFieldError(project.id, 'description')}</span>{/if}
					</div>

					<label class="checkbox">
						<input
							type="checkbox"
							name="isBillable"
							checked={Boolean(projectFieldValue(project.id, 'isBillable', project.isBillable))}
							disabled={!data.permissions.canManageProjects || project.client.isInternal}
						/>
						<span>Билируем проект</span>
					</label>
					{#if project.client.isInternal}
						<p class="hint">Проектите към вътрешния клиент остават небилируеми по правило.</p>
					{/if}

					<div class="members-block">
						<div class="members-title">Екип на проекта</div>
						<div class="members-grid">
							{#each data.users as user}
								<label class="member-option" class:disabled={!data.permissions.canManageProjects}>
									<input
										type="checkbox"
										name="memberUserIds"
										value={user.id}
										checked={projectFieldValues(project.id, projectMemberIds(project.members)).includes(user.id)}
										disabled={!data.permissions.canManageProjects}
									/>
									<span>{userLabel(user)}</span>
									<small>{roleLabels[user.role]}{user.status === 'inactive' ? ' · неактивен' : ''}</small>
								</label>
							{/each}
						</div>
						{#if projectFieldError(project.id, 'memberUserIds')}<span class="error-text">{projectFieldError(project.id, 'memberUserIds')}</span>{/if}
					</div>

					{#if project.members.length > 0}
						<div class="member-summary">
							<div class="meta-label">Текущ екип</div>
							<div class="chips">
								{#each project.members as member}
									<span class="chip">{userLabel(member.user)}{member.user.status === 'inactive' ? ' · неактивен' : ''}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if canViewProjectRates(project)}
						<div class="rate-history-panel">
							<div class="members-title">История на проектни билируеми ставки</div>
							<div class="rate-override-form">
								<input type="hidden" name="projectId" value={project.id} />
								<div class="rate-override-grid">
									<select name="userId" aria-label="Участник">
										<option value="">Изберете участник</option>
										{#each project.members as member}
											<option value={member.userId} selected={projectRateFieldValue(project.id, 'userId') === member.userId}>
												{userLabel(member.user)}
											</option>
										{/each}
									</select>
									<input
										name="effectiveFrom"
										type="date"
										value={projectRateFieldValue(project.id, 'effectiveFrom')}
										aria-label="В сила от"
									/>
									<input
										name="billableRate"
										type="text"
										inputmode="decimal"
										placeholder={`Ставка (${data.company.currency})`}
										value={projectRateFieldValue(project.id, 'billableRate')}
										aria-label="Билируема ставка"
									/>
									<button type="submit" class="btn-primary" formaction="?/addProjectMemberRateOverride" formmethod="POST">
										Добави
									</button>
								</div>
								{#if projectRateFieldError(project.id, 'userId')}<span class="error-text">{projectRateFieldError(project.id, 'userId')}</span>{/if}
								{#if projectRateFieldError(project.id, 'effectiveFrom')}<span class="error-text">{projectRateFieldError(project.id, 'effectiveFrom')}</span>{/if}
								{#if projectRateFieldError(project.id, 'billableRate')}<span class="error-text">{projectRateFieldError(project.id, 'billableRate')}</span>{/if}
							</div>

							<div class="rate-history-list">
								{#if project.memberBillableRateOverrides.length === 0}
									<p class="hint">Все още няма проектни ставки по участници.</p>
								{:else}
									{#each project.memberBillableRateOverrides as override}
										<div class="rate-history-entry">
											<strong>{userLabel(override.user)}</strong>
											<span>В сила от {formatDate(override.effectiveFrom)}</span>
											<span>{formatMoney(override.billableRateCents)}</span>
										</div>
									{/each}
								{/if}
							</div>
						</div>
					{/if}

					{#if data.permissions.canManageProjects}
						<div class="action-row">
							<button type="submit" class="btn-primary">Запази проекта</button>
							<a class="btn-secondary" href={`/projects/${project.id}`}>Задачи и списъци</a>
						</div>
					{:else}
						<a class="btn-secondary" href={`/projects/${project.id}`}>Задачи и списъци</a>
					{/if}
				</form>
			{/if}
		</section>
	{/each}
</div>

{#if data.projects.length === 0}
	<section class="card empty-card">
		<h2>Все още няма проекти</h2>
		<p>Създайте първия проект, за да свържете клиент, мениджър, екип и бюджет в едно място.</p>
	</section>
{/if}

<style>
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 24px;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #0f172a;
	}

	h2 {
		color: #0f172a;
	}

	p {
		color: #64748b;
		margin-top: 6px;
	}

	.project-list {
		display: grid;
		gap: 24px;
	}

	.card {
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
		overflow: hidden;
	}

	.create-card,
	.empty-card {
		padding: 24px;
	}

	.project-toggle {
		width: 100%;
		border: none;
		background: transparent;
		padding: 24px;
		text-align: left;
		cursor: pointer;
	}

	.project-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
	}

	.project-summary {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.project-meta {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 16px;
	}

	.meta-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #64748b;
		margin-bottom: 4px;
	}

	.meta-value {
		font-size: 0.98rem;
		font-weight: 600;
		color: #0f172a;
	}

	.expand-indicator {
		flex-shrink: 0;
		padding-top: 4px;
		font-size: 0.85rem;
		font-weight: 700;
		color: #2563eb;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 0 24px 24px;
		border-top: 1px solid #e2e8f0;
	}

	.grid {
		display: grid;
		gap: 16px;
	}

	.grid.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.short-field {
		max-width: 260px;
	}

	label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #334155;
	}

	input,
	select,
	textarea {
		width: 100%;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		padding: 10px 12px;
		font: inherit;
		color: #0f172a;
		background: #fff;
	}

	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	input:disabled,
	select:disabled,
	textarea:disabled {
		background: #f8fafc;
		color: #64748b;
	}

	textarea {
		resize: vertical;
		min-height: 6.5rem;
		white-space: pre-wrap;
	}

	.checkbox {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}

	.checkbox input {
		width: auto;
	}

	.members-block {
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 16px;
		background: #f8fafc;
	}

	.members-title {
		font-size: 0.95rem;
		font-weight: 700;
		color: #0f172a;
	}

	.members-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		margin-top: 14px;
	}

	.member-option {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px;
		border: 1px solid #dbe4f0;
		border-radius: 10px;
		background: #fff;
	}

	.member-option input {
		width: auto;
		margin-bottom: 4px;
	}

	.member-option.disabled {
		opacity: 0.7;
	}

	.member-option small,
	.hint {
		color: #64748b;
		font-size: 0.82rem;
	}

	.member-summary {
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 14px 16px;
		background: #fff;
	}

	.rate-history-panel {
		display: grid;
		gap: 14px;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 16px;
		background: #fff;
	}

	.rate-override-form,
	.rate-history-list {
		display: grid;
		gap: 10px;
	}

	.rate-override-grid {
		display: grid;
		grid-template-columns: 1.2fr 1fr 1fr auto;
		gap: 10px;
		align-items: center;
	}

	.rate-history-entry {
		display: grid;
		gap: 2px;
		padding: 12px;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		background: #f8fafc;
		font-size: 0.88rem;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		padding: 6px 10px;
		background: #e2e8f0;
		color: #334155;
		font-size: 0.82rem;
		font-weight: 600;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		padding: 4px 10px;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.badge.active {
		background: #dcfce7;
		color: #166534;
	}

	.badge.inactive {
		background: #fef3c7;
		color: #92400e;
	}

	.badge.internal {
		background: #dbeafe;
		color: #1d4ed8;
	}

	.badge.muted {
		background: #e2e8f0;
		color: #475569;
	}

	.alert {
		padding: 12px 14px;
		border-radius: 8px;
		margin-bottom: 18px;
		font-size: 0.92rem;
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
		font-size: 0.8rem;
		color: #dc2626;
	}

	.btn-primary {
		border: none;
		border-radius: 8px;
		padding: 10px 16px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		align-self: flex-start;
		background: #2563eb;
		color: #fff;
	}

	.btn-primary:hover {
		background: #1d4ed8;
	}

	.btn-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		padding: 10px 16px;
		font-weight: 600;
		color: #0f172a;
		background: #fff;
	}

	.btn-secondary:hover {
		border-color: #94a3b8;
		text-decoration: none;
	}

	.action-row {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
	}

	@media (max-width: 1100px) {
		.project-meta,
		.members-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.rate-override-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 900px) {
		.page-header,
		.project-head {
			flex-direction: column;
			align-items: stretch;
		}

		.grid.two,
		.project-meta,
		.members-grid,
		.rate-override-grid {
			grid-template-columns: 1fr;
		}

		.short-field {
			max-width: none;
		}

		.project-toggle,
		form {
			padding-left: 18px;
			padding-right: 18px;
		}

		.btn-primary {
			width: 100%;
		}
	}
</style>
