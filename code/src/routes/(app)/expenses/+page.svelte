<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let activeTab = $state<'expenses' | 'categories'>('expenses');
	let showCreateForm = $state(false);
	let editingExpenseId = $state<string | null>(null);
	let markingPaidExpenseId = $state<string | null>(null);
	let showAddCategoryForm = $state(false);

	// Client/project cascading select state for create form
	let createClientId = $state('');
	let createProjectId = $state('');
	let editClientId = $state('');
	let editProjectId = $state('');

	function formatAmount(cents: number) {
		return (cents / 100).toFixed(2);
	}

	function formatDate(d: string | Date) {
		if (!d) return '';
		const date = typeof d === 'string' ? new Date(d) : d;
		return date.toLocaleDateString('bg-BG');
	}

	function toInputDate(d: string | Date | null) {
		if (!d) return '';
		const date = typeof d === 'string' ? new Date(d) : d;
		return date.toISOString().slice(0, 10);
	}

	function getProjectsForClient(clientId: string) {
		const client = data.clients.find((c) => c.id === clientId);
		if (!client) return [];
		if (data.permissions.isManager) {
			return client.projects.filter((p) => data.accessibleProjects.includes(p.id));
		}
		return client.projects;
	}

	function createFieldError(field: string) {
		return (form as any)?.createExpenseErrors?.[field]?.[0];
	}

	function createFieldValue(field: string) {
		return (form as any)?.createExpenseValues?.[field] ?? '';
	}

	function editFieldError(expenseId: string, field: string) {
		return (form as any)?.editExpenseId === expenseId
			? (form as any)?.editExpenseErrors?.[field]?.[0]
			: null;
	}

	function editFieldValue(expenseId: string, field: string, fallback: string) {
		return (form as any)?.editExpenseId === expenseId
			? ((form as any)?.editExpenseValues?.[field] ?? fallback)
			: fallback;
	}

	function categoryFieldError(field: string) {
		return (form as any)?.addCategoryErrors?.[field]?.[0];
	}

	function categoryFieldValue(field: string) {
		return (form as any)?.addCategoryValues?.[field] ?? '';
	}

	$effect(() => {
		if ((form as any)?.createExpenseSuccess) {
			showCreateForm = false;
			createClientId = '';
			createProjectId = '';
		}
		if ((form as any)?.editExpenseSuccess) {
			editingExpenseId = null;
		}
		if ((form as any)?.markPaidSuccess) {
			markingPaidExpenseId = null;
		}
		if ((form as any)?.addCategorySuccess) {
			showAddCategoryForm = false;
		}
		if ((form as any)?.editExpenseId) {
			editingExpenseId = (form as any).editExpenseId;
		}
	});

	function startEdit(expense: (typeof data.expenses)[0]) {
		editingExpenseId = expense.id;
		editClientId = expense.clientId ?? '';
		editProjectId = expense.projectId ?? '';
	}

	function cancelEdit() {
		editingExpenseId = null;
	}

	function startMarkPaid(expenseId: string) {
		markingPaidExpenseId = expenseId;
	}

	function cancelMarkPaid() {
		markingPaidExpenseId = null;
	}
</script>

<svelte:head>
	<title>Разходи - Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1>Разходи</h1>
		<p>Еднократни разходи на компанията, свързани с проекти или режийни.</p>
	</div>
</div>

<!-- Tabs -->
<div class="tabs">
	<button
		type="button"
		class="tab-btn"
		class:active={activeTab === 'expenses'}
		onclick={() => (activeTab = 'expenses')}
	>
		Разходи
	</button>
	{#if data.permissions.canManageCategories}
		<button
			type="button"
			class="tab-btn"
			class:active={activeTab === 'categories'}
			onclick={() => (activeTab = 'categories')}
		>
			Категории
		</button>
	{/if}
</div>

<!-- ─── EXPENSES TAB ────────────────────────────────────────────────────── -->
{#if activeTab === 'expenses'}
	{#if (form as any)?.createExpenseError}
		<div class="alert error">{(form as any).createExpenseError}</div>
	{/if}
	{#if (form as any)?.createExpenseSuccess}
		<div class="alert success">Разходът е добавен.</div>
	{/if}
	{#if (form as any)?.editExpenseError}
		<div class="alert error">{(form as any).editExpenseError}</div>
	{/if}
	{#if (form as any)?.editExpenseSuccess}
		<div class="alert success">Разходът е обновен.</div>
	{/if}
	{#if (form as any)?.markPaidError}
		<div class="alert error">{(form as any).markPaidError}</div>
	{/if}
	{#if (form as any)?.markPaidSuccess}
		<div class="alert success">Разходът е маркиран като платен.</div>
	{/if}

	<div class="section-actions">
		{#if data.permissions.canManageProject}
			<button class="btn-primary" onclick={() => (showCreateForm = !showCreateForm)}>
				{showCreateForm ? 'Отказ' : '+ Нов разход'}
			</button>
		{/if}
	</div>

	{#if showCreateForm && data.permissions.canManageProject}
		<section class="card create-card">
			<h2>Нов разход</h2>
			<form method="POST" action="?/createExpense">
				<div class="grid two">
					<div class="field">
						<label for="create-categoryId">Категория</label>
						<select id="create-categoryId" name="categoryId" required>
							<option value="">-- Изберете категория --</option>
							{#each data.activeCategories as cat}
								<option value={cat.id} selected={createFieldValue('categoryId') === cat.id}>{cat.name}</option>
							{/each}
						</select>
						{#if createFieldError('categoryId')}<span class="error-text">{createFieldError('categoryId')}</span>{/if}
					</div>

					<div class="field">
						<label for="create-incurredDate">Дата на разхода</label>
						<input
							id="create-incurredDate"
							name="incurredDate"
							type="date"
							value={createFieldValue('incurredDate')}
							required
						/>
						{#if createFieldError('incurredDate')}<span class="error-text">{createFieldError('incurredDate')}</span>{/if}
					</div>

					<div class="field">
						<label for="create-amountCents">Сума (стотинки)</label>
						<input
							id="create-amountCents"
							name="amountCents"
							type="number"
							min="1"
							placeholder="напр. 5000 = 50.00"
							value={createFieldValue('amountCents')}
							required
						/>
						{#if createFieldError('amountCents')}<span class="error-text">{createFieldError('amountCents')}</span>{/if}
					</div>

					{#if data.permissions.canManageFinance || !data.permissions.isManager}
						<div class="field">
							<label for="create-clientId">Клиент (по избор)</label>
							<select
								id="create-clientId"
								name="clientId"
								bind:value={createClientId}
								onchange={() => (createProjectId = '')}
							>
								<option value="">-- Режийни (без клиент) --</option>
								{#each data.clients as client}
									<option value={client.id}>{client.legalName}</option>
								{/each}
							</select>
						</div>
					{/if}

					<div class="field">
						<label for="create-projectId">Проект {data.permissions.isManager ? '(задължителен)' : '(по избор)'}</label>
						<select id="create-projectId" name="projectId" bind:value={createProjectId} required={data.permissions.isManager}>
							<option value="">-- Без проект --</option>
							{#each getProjectsForClient(createClientId) as project}
								<option value={project.id}>{project.name}</option>
							{/each}
							{#if !createClientId}
								{#each data.clients as client}
									{#each getProjectsForClient(client.id) as project}
										<option value={project.id}>{client.legalName} / {project.name}</option>
									{/each}
								{/each}
							{/if}
						</select>
						{#if createFieldError('projectId')}<span class="error-text">{createFieldError('projectId')}</span>{/if}
					</div>
				</div>

				<div class="field">
					<label for="create-description">Описание</label>
					<textarea id="create-description" name="description" rows="3" required>{createFieldValue('description')}</textarea>
					{#if createFieldError('description')}<span class="error-text">{createFieldError('description')}</span>{/if}
				</div>

				<button type="submit" class="btn-primary">Добави разход</button>
			</form>
		</section>
	{/if}

	{#if data.expenses.length === 0}
		<p class="empty-state">Няма добавени разходи.</p>
	{:else}
		<div class="expense-list">
			{#each data.expenses as expense}
				<section class="card expense-card">
					<div class="expense-header">
						<div class="expense-meta">
							<div class="expense-title">
								<span class="expense-description">{expense.description}</span>
								<span
									class="badge"
									class:badge-paid={expense.status === 'paid'}
									class:badge-unpaid={expense.status === 'unpaid'}
								>
									{expense.status === 'paid' ? 'Платен' : 'Неплатен'}
								</span>
							</div>
							<div class="expense-details">
								<span class="detail-item">
									<span class="detail-label">Категория:</span>
									{expense.category.name}
								</span>
								<span class="detail-item">
									<span class="detail-label">Сума:</span>
									{formatAmount(expense.amountCents)} лв.
								</span>
								<span class="detail-item">
									<span class="detail-label">Дата:</span>
									{formatDate(expense.incurredDate)}
								</span>
								{#if expense.project}
									<span class="detail-item">
										<span class="detail-label">Проект:</span>
										{expense.client ? expense.client.legalName + ' / ' : ''}{expense.project.name}
									</span>
								{:else if expense.client}
									<span class="detail-item">
										<span class="detail-label">Клиент:</span>
										{expense.client.legalName}
									</span>
								{:else}
									<span class="detail-item">
										<span class="detail-label">Тип:</span>
										Режийни
									</span>
								{/if}
								{#if expense.status === 'paid' && expense.paidDate}
									<span class="detail-item">
										<span class="detail-label">Платено на:</span>
										{formatDate(expense.paidDate)}
										{#if expense.paidByUser}
											от {expense.paidByUser.firstName} {expense.paidByUser.lastName}
										{/if}
									</span>
								{/if}
							</div>
						</div>

						<div class="expense-actions">
							{#if expense.status === 'unpaid'}
								{#if data.permissions.canManageProject}
									<button
										type="button"
										class="btn-secondary btn-sm"
										onclick={() => (editingExpenseId === expense.id ? cancelEdit() : startEdit(expense))}
									>
										{editingExpenseId === expense.id ? 'Затвори' : 'Редактирай'}
									</button>
								{/if}
								{#if data.permissions.canMarkPaid}
									<button
										type="button"
										class="btn-success btn-sm"
										onclick={() => (markingPaidExpenseId === expense.id ? cancelMarkPaid() : startMarkPaid(expense.id))}
									>
										{markingPaidExpenseId === expense.id ? 'Отказ' : 'Маркирай като платен'}
									</button>
								{/if}
							{/if}
						</div>
					</div>

					{#if editingExpenseId === expense.id && data.permissions.canManageProject}
						<div class="expense-edit-form">
							{#if editFieldError(expense.id, 'general')}
								<div class="alert error">{editFieldError(expense.id, 'general')}</div>
							{/if}
							<form method="POST" action="?/editExpense">
								<input type="hidden" name="expenseId" value={expense.id} />
								<div class="grid two">
									<div class="field">
										<label for={'edit-cat-' + expense.id}>Категория</label>
										<select id={'edit-cat-' + expense.id} name="categoryId" required>
											{#each data.activeCategories as cat}
												<option
													value={cat.id}
													selected={editFieldValue(expense.id, 'categoryId', expense.categoryId) === cat.id}
												>{cat.name}</option>
											{/each}
										</select>
										{#if editFieldError(expense.id, 'categoryId')}<span class="error-text">{editFieldError(expense.id, 'categoryId')}</span>{/if}
									</div>

									<div class="field">
										<label for={'edit-date-' + expense.id}>Дата на разхода</label>
										<input
											id={'edit-date-' + expense.id}
											name="incurredDate"
											type="date"
											value={editFieldValue(expense.id, 'incurredDate', toInputDate(expense.incurredDate))}
											required
										/>
										{#if editFieldError(expense.id, 'incurredDate')}<span class="error-text">{editFieldError(expense.id, 'incurredDate')}</span>{/if}
									</div>

									<div class="field">
										<label for={'edit-amount-' + expense.id}>Сума (стотинки)</label>
										<input
											id={'edit-amount-' + expense.id}
											name="amountCents"
											type="number"
											min="1"
											value={editFieldValue(expense.id, 'amountCents', String(expense.amountCents))}
											required
										/>
										{#if editFieldError(expense.id, 'amountCents')}<span class="error-text">{editFieldError(expense.id, 'amountCents')}</span>{/if}
									</div>

									{#if data.permissions.canManageFinance}
										<div class="field">
											<label for={'edit-client-' + expense.id}>Клиент (по избор)</label>
											<select
												id={'edit-client-' + expense.id}
												name="clientId"
												bind:value={editClientId}
												onchange={() => (editProjectId = '')}
											>
												<option value="">-- Режийни (без клиент) --</option>
												{#each data.clients as client}
													<option value={client.id} selected={editClientId === client.id || (editClientId === '' && expense.clientId === client.id)}>{client.legalName}</option>
												{/each}
											</select>
										</div>
									{/if}

									<div class="field">
										<label for={'edit-project-' + expense.id}>Проект {data.permissions.isManager ? '(задължителен)' : '(по избор)'}</label>
										<select
											id={'edit-project-' + expense.id}
											name="projectId"
											bind:value={editProjectId}
											required={data.permissions.isManager}
										>
											<option value="">-- Без проект --</option>
											{#if editClientId}
												{#each getProjectsForClient(editClientId) as project}
													<option value={project.id}>{project.name}</option>
												{/each}
											{:else}
												{#each data.clients as client}
													{#each getProjectsForClient(client.id) as project}
														<option value={project.id} selected={editProjectId === '' && expense.projectId === project.id}>
															{client.legalName} / {project.name}
														</option>
													{/each}
												{/each}
											{/if}
										</select>
										{#if editFieldError(expense.id, 'projectId')}<span class="error-text">{editFieldError(expense.id, 'projectId')}</span>{/if}
									</div>
								</div>

								<div class="field">
									<label for={'edit-desc-' + expense.id}>Описание</label>
									<textarea id={'edit-desc-' + expense.id} name="description" rows="3" required>{editFieldValue(expense.id, 'description', expense.description)}</textarea>
									{#if editFieldError(expense.id, 'description')}<span class="error-text">{editFieldError(expense.id, 'description')}</span>{/if}
								</div>

								<div class="form-actions">
									<button type="submit" class="btn-primary">Запази</button>
									<button type="button" class="btn-secondary" onclick={cancelEdit}>Отказ</button>
								</div>
							</form>
						</div>
					{/if}

					{#if markingPaidExpenseId === expense.id && data.permissions.canMarkPaid}
						<div class="mark-paid-form">
							<form method="POST" action="?/markPaid">
								<input type="hidden" name="expenseId" value={expense.id} />
								<div class="field">
									<label for={'paid-date-' + expense.id}>Дата на плащане</label>
									<input id={'paid-date-' + expense.id} name="paidDate" type="date" required />
								</div>
								<div class="form-actions">
									<button type="submit" class="btn-success">Потвърди плащане</button>
									<button type="button" class="btn-secondary" onclick={cancelMarkPaid}>Отказ</button>
								</div>
							</form>
						</div>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
{/if}

<!-- ─── CATEGORIES TAB ─────────────────────────────────────────────────── -->
{#if activeTab === 'categories' && data.permissions.canManageCategories}
	{#if (form as any)?.addCategoryError}
		<div class="alert error">{(form as any).addCategoryError}</div>
	{/if}
	{#if (form as any)?.addCategorySuccess}
		<div class="alert success">Категорията е добавена.</div>
	{/if}
	{#if (form as any)?.deactivateCategoryError}
		<div class="alert error">{(form as any).deactivateCategoryError}</div>
	{/if}
	{#if (form as any)?.deactivateCategorySuccess}
		<div class="alert success">Категорията е деактивирана.</div>
	{/if}

	<div class="section-actions">
		<button class="btn-primary" onclick={() => (showAddCategoryForm = !showAddCategoryForm)}>
			{showAddCategoryForm ? 'Отказ' : '+ Нова категория'}
		</button>
	</div>

	{#if showAddCategoryForm}
		<section class="card create-card">
			<h2>Нова категория</h2>
			<form method="POST" action="?/addCategory">
				<div class="field">
					<label for="cat-name">Наименование</label>
					<input id="cat-name" name="name" type="text" value={categoryFieldValue('name')} required />
					{#if categoryFieldError('name')}<span class="error-text">{categoryFieldError('name')}</span>{/if}
				</div>
				<button type="submit" class="btn-primary">Добави категория</button>
			</form>
		</section>
	{/if}

	{#if data.categories.length === 0}
		<p class="empty-state">Няма добавени категории.</p>
	{:else}
		<div class="category-list">
			{#each data.categories as cat}
				<div class="card category-row">
					<div class="category-info">
						<span class="category-name">{cat.name}</span>
						<span
							class="badge"
							class:badge-active={cat.isActive}
							class:badge-inactive={!cat.isActive}
						>
							{cat.isActive ? 'Активна' : 'Неактивна'}
						</span>
					</div>
					{#if cat.isActive}
						<form method="POST" action="?/deactivateCategory" class="inline-form">
							<input type="hidden" name="categoryId" value={cat.id} />
							<button type="submit" class="btn-danger btn-sm">Деактивирай</button>
						</form>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
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
		font-size: 1.1rem;
		font-weight: 700;
		margin-bottom: 16px;
	}

	p {
		color: #64748b;
		margin-top: 6px;
	}

	.tabs {
		display: flex;
		gap: 4px;
		border-bottom: 2px solid #e2e8f0;
		margin-bottom: 24px;
	}

	.tab-btn {
		padding: 10px 20px;
		border: none;
		background: none;
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		color: #64748b;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		transition: color 0.15s, border-color 0.15s;
	}

	.tab-btn.active {
		color: #2563eb;
		border-bottom-color: #2563eb;
	}

	.tab-btn:hover:not(.active) {
		color: #0f172a;
	}

	.section-actions {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 16px;
	}

	.card {
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
	}

	.create-card {
		padding: 24px;
		margin-bottom: 24px;
	}

	.expense-list {
		display: grid;
		gap: 16px;
	}

	.expense-card {
		overflow: hidden;
	}

	.expense-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 20px 24px;
	}

	.expense-meta {
		flex: 1;
	}

	.expense-title {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
		flex-wrap: wrap;
	}

	.expense-description {
		font-weight: 700;
		color: #0f172a;
		font-size: 1rem;
	}

	.expense-details {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
	}

	.detail-item {
		font-size: 0.875rem;
		color: #475569;
	}

	.detail-label {
		font-weight: 600;
		color: #334155;
		margin-right: 4px;
	}

	.expense-actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: flex-end;
		flex-shrink: 0;
	}

	.expense-edit-form,
	.mark-paid-form {
		border-top: 1px solid #e2e8f0;
		padding: 20px 24px;
		background: #f8fafc;
	}

	.form-actions {
		display: flex;
		gap: 10px;
	}

	/* Categories */
	.category-list {
		display: grid;
		gap: 10px;
	}

	.category-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px;
	}

	.category-info {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.category-name {
		font-weight: 600;
		color: #0f172a;
	}

	.inline-form {
		display: contents;
	}

	/* Forms */
	form {
		display: flex;
		flex-direction: column;
		gap: 16px;
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

	textarea {
		resize: vertical;
		min-height: 5rem;
	}

	/* Badges */
	.badge {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		padding: 3px 10px;
		font-size: 0.78rem;
		font-weight: 600;
	}

	.badge-paid,
	.badge-active {
		background: #dcfce7;
		color: #166534;
	}

	.badge-unpaid,
	.badge-inactive {
		background: #fef9c3;
		color: #854d0e;
	}

	.badge-inactive {
		background: #e2e8f0;
		color: #475569;
	}

	/* Alerts */
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

	/* Buttons */
	.btn-primary,
	.btn-secondary,
	.btn-success,
	.btn-danger {
		border: none;
		border-radius: 8px;
		padding: 10px 16px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		align-self: flex-start;
	}

	.btn-primary {
		background: #2563eb;
		color: #fff;
	}

	.btn-primary:hover {
		background: #1d4ed8;
	}

	.btn-secondary {
		background: #e2e8f0;
		color: #0f172a;
	}

	.btn-secondary:hover {
		background: #cbd5e1;
	}

	.btn-success {
		background: #16a34a;
		color: #fff;
	}

	.btn-success:hover {
		background: #15803d;
	}

	.btn-danger {
		background: #fee2e2;
		color: #b91c1c;
	}

	.btn-danger:hover {
		background: #fecaca;
	}

	.btn-sm {
		padding: 6px 12px;
		font-size: 0.875rem;
	}

	.empty-state {
		color: #64748b;
		font-size: 0.9rem;
		padding: 32px 0;
		text-align: center;
	}

	@media (max-width: 900px) {
		.grid.two {
			grid-template-columns: 1fr;
		}

		.expense-header {
			flex-direction: column;
		}

		.expense-actions {
			align-items: flex-start;
			flex-direction: row;
			flex-wrap: wrap;
		}

		.category-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		}
	}
</style>
