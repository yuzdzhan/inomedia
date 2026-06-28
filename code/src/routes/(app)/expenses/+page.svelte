<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { fmtDate as formatDate } from '$lib/utils/format';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let activeTab = $state<'expenses' | 'recurring' | 'categories'>('expenses');
	let showCreateForm = $state(false);
	let editingExpenseId = $state<string | null>(null);
	let markingPaidExpenseId = $state<string | null>(null);
	let attachingExpenseId = $state<string | null>(null);
	let showAddCategoryForm = $state(false);

	// Recurring template form state
	let showCreateTemplateForm = $state(false);
	let editingTemplateId = $state<string | null>(null);
	let createTemplateClientId = $state('');
	let createTemplateProjectId = $state('');
	let editTemplateClientId = $state('');
	let editTemplateProjectId = $state('');

	// Client/project cascading select state for create form
	let createClientId = $state('');
	let createProjectId = $state('');
	let editClientId = $state('');
	let editProjectId = $state('');

	function formatAmount(cents: number) {
		return (cents / 100).toFixed(2);
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

	function formatFrequency(f: string) {
		return f === 'monthly' ? 'Месечно' : 'Годишно';
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

	function templateCreateFieldError(field: string) {
		return (form as any)?.createTemplateErrors?.[field]?.[0];
	}

	function templateCreateFieldValue(field: string) {
		return (form as any)?.createTemplateValues?.[field] ?? '';
	}

	function templateEditFieldError(templateId: string, field: string) {
		return (form as any)?.editTemplateId === templateId
			? (form as any)?.editTemplateErrors?.[field]?.[0]
			: null;
	}

	function templateEditFieldValue(templateId: string, field: string, fallback: string) {
		return (form as any)?.editTemplateId === templateId
			? ((form as any)?.editTemplateValues?.[field] ?? fallback)
			: fallback;
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
		if ((form as any)?.reopenExpenseSuccess) {
			// nothing to reset — card refreshes automatically
		}
		if ((form as any)?.addCategorySuccess) {
			showAddCategoryForm = false;
		}
		if ((form as any)?.editExpenseId) {
			editingExpenseId = (form as any).editExpenseId;
		}
		if ((form as any)?.createTemplateSuccess) {
			showCreateTemplateForm = false;
			createTemplateClientId = '';
			createTemplateProjectId = '';
		}
		if ((form as any)?.editTemplateSuccess) {
			editingTemplateId = null;
		}
		if ((form as any)?.editTemplateId) {
			editingTemplateId = (form as any).editTemplateId;
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

	function startEditTemplate(tpl: (typeof data.recurringTemplates)[0]) {
		editingTemplateId = tpl.id;
		editTemplateClientId = tpl.clientId ?? '';
		editTemplateProjectId = tpl.projectId ?? '';
	}

	function cancelEditTemplate() {
		editingTemplateId = null;
	}

	// Stat computations for expenses tab
	let totalExpensesAmount = $derived(
		data.expenses.reduce((sum, e) => sum + e.amountCents, 0)
	);
	let recurringCount = $derived(data.expenses.filter((e) => e.isFromTemplate).length);
	let projectLinkedCount = $derived(data.expenses.filter((e) => e.projectId).length);
	let topCategory = $derived(() => {
		const counts: Record<string, number> = {};
		for (const e of data.expenses) {
			const name = e.category?.name ?? 'Непозната';
			counts[name] = (counts[name] ?? 0) + e.amountCents;
		}
		let best = '';
		let bestAmt = 0;
		for (const [name, amt] of Object.entries(counts)) {
			if (amt > bestAmt) { best = name; bestAmt = amt; }
		}
		return best || '—';
	});
</script>

<svelte:head>
	<title>Разходи - Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Разходи</h1>
		<p class="page-sub">Еднократни разходи на компанията, свързани с проекти или режийни.</p>
	</div>
</div>

<!-- Tabs -->
<div class="tabs">
	<button
		type="button"
		class="tab"
		class:active={activeTab === 'expenses'}
		onclick={() => (activeTab = 'expenses')}
	>
		Разходи
	</button>
	{#if data.permissions.canManageRecurring}
		<button
			type="button"
			class="tab"
			class:active={activeTab === 'recurring'}
			onclick={() => (activeTab = 'recurring')}
		>
			Повтарящи се разходи
		</button>
	{/if}
	{#if data.permissions.canManageCategories}
		<button
			type="button"
			class="tab"
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
		<div class="alert danger" style="margin-bottom: 16px;">{(form as any).createExpenseError}</div>
	{/if}
	{#if (form as any)?.createExpenseSuccess}
		<div class="alert warning" style="margin-bottom: 16px;">{(form as any).createExpenseSuccess ? 'Разходът е добавен.' : ''}</div>
	{/if}
	{#if (form as any)?.editExpenseError}
		<div class="alert danger" style="margin-bottom: 16px;">{(form as any).editExpenseError}</div>
	{/if}
	{#if (form as any)?.markPaidError}
		<div class="alert danger" style="margin-bottom: 16px;">{(form as any).markPaidError}</div>
	{/if}
	{#if (form as any)?.reopenExpenseError}
		<div class="alert danger" style="margin-bottom: 16px;">{(form as any).reopenExpenseError}</div>
	{/if}

	<!-- Stat cards -->
	<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
		<div class="stat">
			<div class="stat-label">Общо разходи</div>
			<div class="stat-value">{formatAmount(totalExpensesAmount)}</div>
			<div class="stat-delta">EUR</div>
		</div>
		<div class="stat">
			<div class="stat-label">От шаблон</div>
			<div class="stat-value">{recurringCount}</div>
			<div class="stat-delta">повтарящи се</div>
		</div>
		<div class="stat">
			<div class="stat-label">С проект</div>
			<div class="stat-value">{projectLinkedCount}</div>
			<div class="stat-delta">свързани</div>
		</div>
		<div class="stat">
			<div class="stat-label">Топ категория</div>
			<div class="stat-value" style="font-size: 16px;">{topCategory()}</div>
		</div>
	</div>

	<!-- Filter bar -->
	<form method="GET" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px;">
		<select class="select" name="status" style="width: auto; height: 30px;" onchange={() => (document.activeElement as HTMLSelectElement)?.form?.submit()}>
			<option value="" selected={!data.filters.status}>Всички статуси</option>
			<option value="unpaid" selected={data.filters.status === 'unpaid'}>Неплатен</option>
			<option value="paid" selected={data.filters.status === 'paid'}>Платен</option>
		</select>

		<select class="select" name="categoryId" style="width: auto; height: 30px;" onchange={() => (document.activeElement as HTMLSelectElement)?.form?.submit()}>
			<option value="" selected={!data.filters.categoryId}>Всички категории</option>
			{#each data.categories as cat}
				<option value={cat.id} selected={data.filters.categoryId === cat.id}>{cat.name}</option>
			{/each}
		</select>

		{#if !data.permissions.isManager}
			<select class="select" name="clientId" style="width: auto; height: 30px;" onchange={() => (document.activeElement as HTMLSelectElement)?.form?.submit()}>
				<option value="" selected={!data.filters.clientId}>Всички клиенти</option>
				{#each data.clients as client}
					<option value={client.id} selected={data.filters.clientId === client.id}>{client.legalName}</option>
				{/each}
			</select>
		{/if}

		<select class="select" name="projectId" style="width: auto; height: 30px;" onchange={() => (document.activeElement as HTMLSelectElement)?.form?.submit()}>
			<option value="" selected={!data.filters.projectId}>Всички проекти</option>
			{#each data.allVisibleProjects as project}
				<option value={project.id} selected={data.filters.projectId === project.id}>
					{project.client.legalName} / {project.name}
				</option>
			{/each}
		</select>

		<input
			class="input"
			type="date"
			name="dateFrom"
			value={data.filters.dateFrom}
			title="Разход от дата"
			style="width: auto;"
		/>
		<input
			class="input"
			type="date"
			name="dateTo"
			value={data.filters.dateTo}
			title="Разход до дата"
			style="width: auto;"
		/>

		<button type="submit" class="btn btn-secondary btn-sm">Филтрирай</button>
		<a href="/expenses" class="btn btn-ghost btn-sm">Изчисти</a>

		{#if data.permissions.canManageProject}
			<div style="margin-left: auto;">
				<button class="btn btn-primary btn-sm" onclick={() => (showCreateForm = !showCreateForm)}>
					{showCreateForm ? 'Отказ' : '+ Нов разход'}
				</button>
			</div>
		{/if}
	</form>

	{#if showCreateForm && data.permissions.canManageProject}
		<div class="card" style="margin-bottom: 20px;">
			<div class="card-header">
				<h2 class="card-title">Нов разход</h2>
			</div>
			<div style="padding: 16px;">
				<form method="POST" action="?/createExpense">
					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
						<div class="field">
							<label class="label" for="create-categoryId">Категория</label>
							<select id="create-categoryId" name="categoryId" class="select" required>
								<option value="">-- Изберете категория --</option>
								{#each data.activeCategories as cat}
									<option value={cat.id} selected={createFieldValue('categoryId') === cat.id}>{cat.name}</option>
								{/each}
							</select>
							{#if createFieldError('categoryId')}<span style="font-size: 11px; color: var(--danger);">{createFieldError('categoryId')}</span>{/if}
						</div>

						<div class="field">
							<label class="label" for="create-incurredDate">Дата на разхода</label>
							<input
								id="create-incurredDate"
								name="incurredDate"
								type="date"
								class="input"
								value={createFieldValue('incurredDate')}
								required
							/>
							{#if createFieldError('incurredDate')}<span style="font-size: 11px; color: var(--danger);">{createFieldError('incurredDate')}</span>{/if}
						</div>

						<div class="field">
							<label class="label" for="create-amountCents">Сума (стотинки)</label>
							<input
								id="create-amountCents"
								name="amountCents"
								type="number"
								min="1"
								placeholder="напр. 5000 = 50.00"
								class="input"
								value={createFieldValue('amountCents')}
								required
							/>
							{#if createFieldError('amountCents')}<span style="font-size: 11px; color: var(--danger);">{createFieldError('amountCents')}</span>{/if}
						</div>

						{#if data.permissions.canManageFinance || !data.permissions.isManager}
							<div class="field">
								<label class="label" for="create-clientId">Клиент (по избор)</label>
								<select
									id="create-clientId"
									name="clientId"
									class="select"
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
							<label class="label" for="create-projectId">Проект {data.permissions.isManager ? '(задължителен)' : '(по избор)'}</label>
							<select id="create-projectId" name="projectId" class="select" bind:value={createProjectId} required={data.permissions.isManager}>
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
							{#if createFieldError('projectId')}<span style="font-size: 11px; color: var(--danger);">{createFieldError('projectId')}</span>{/if}
						</div>
					</div>

					<div class="field" style="margin-top: 8px;">
						<label class="label" for="create-description">Описание</label>
						<textarea id="create-description" name="description" class="textarea" rows="3" required>{createFieldValue('description')}</textarea>
						{#if createFieldError('description')}<span style="font-size: 11px; color: var(--danger);">{createFieldError('description')}</span>{/if}
					</div>

					{#if createClientId}
						<div class="field" style="margin-top: 4px;">
							<label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px;">
								<input type="checkbox" name="billableToInvoice" style="width:16px; height:16px;" />
								Таксуване на клиента — добави в следващата фактура
							</label>
						</div>
					{/if}

					<button type="submit" class="btn btn-primary btn-sm">Добави разход</button>
				</form>
			</div>
		</div>
	{/if}

	{#if data.expenses.length === 0}
		<div class="card" style="padding: 40px; text-align: center;">
			<p class="muted">Няма добавени разходи.</p>
		</div>
	{:else}
		<div class="card">
			<table class="tbl">
				<thead>
					<tr>
						<th>Дата</th>
						<th>Категория</th>
						<th>Описание</th>
						<th>Доставчик/Проект</th>
						<th class="num">Сума</th>
						<th>Статус</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.expenses as expense}
						<tr class:highlight-amber={expense.status === 'unpaid'}>
							<td class="amount muted" style="white-space: nowrap;">{formatDate(expense.incurredDate)}</td>
							<td>{expense.category.name}</td>
							<td>
								<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
									<span style="font-weight: 500;">{expense.description}</span>
									{#if expense.isFromTemplate}
										<span class="badge outline" title="Генериран от повтарящ се шаблон">↻ шаблон</span>
									{/if}
									{#if expense.billableToInvoice && !expense.invoicedAt}
										<span class="badge inv-issued" title="Ще бъде включен в следващата фактура за клиента">таксуем</span>
									{:else if expense.billableToInvoice && expense.invoicedAt}
										<span class="badge inv-paid" title="Включен във фактура">фактуриран</span>
									{/if}
								</div>
							</td>
							<td class="muted">
								{#if expense.project}
									{expense.client ? expense.client.legalName + ' / ' : ''}{expense.project.name}
								{:else if expense.client}
									{expense.client.legalName}
								{:else}
									<span class="muted">Режийни</span>
								{/if}
							</td>
							<td class="num amount">{formatAmount(expense.amountCents)} EUR</td>
							<td>
								{#if expense.status === 'paid'}
									<span class="badge inv-paid">Платен</span>
								{:else}
									<span class="badge inv-draft">Неплатен</span>
								{/if}
							</td>
							<td>
								<div class="row gap-2" style="justify-content: flex-end;">
									{#if expense.status === 'unpaid'}
										{#if data.permissions.canManageProject}
											<button
												type="button"
												class="btn btn-secondary btn-sm"
												onclick={() => (editingExpenseId === expense.id ? cancelEdit() : startEdit(expense))}
											>
												{editingExpenseId === expense.id ? 'Затвори' : 'Редактирай'}
											</button>
										{/if}
										{#if data.permissions.canMarkPaid}
											<button
												type="button"
												class="btn btn-accent btn-sm"
												onclick={() => (markingPaidExpenseId === expense.id ? cancelMarkPaid() : startMarkPaid(expense.id))}
											>
												{markingPaidExpenseId === expense.id ? 'Отказ' : 'Маркирай платен'}
											</button>
										{/if}
									{:else if expense.status === 'paid' && data.permissions.canMarkPaid}
										<form
											method="POST"
											action="?/reopenExpense"
											onsubmit={(e) => {
												if (!confirm('Сигурни ли сте? Плащането ще бъде анулирано и разходът ще стане неплатен.')) e.preventDefault();
											}}
										>
											<input type="hidden" name="expenseId" value={expense.id} />
											<button type="submit" class="btn btn-secondary btn-sm">Върни неплатен</button>
										</form>
									{/if}
									{#if data.permissions.canMarkPaid}
										<button
											type="button"
											class="btn btn-secondary btn-sm"
											title={expense.attachments.length > 0 ? `${expense.attachments.length} файл(а)` : 'Прикачи файл'}
											onclick={() => (attachingExpenseId = attachingExpenseId === expense.id ? null : expense.id)}
										>
											📎{expense.attachments.length > 0 ? ` ${expense.attachments.length}` : ''}
										</button>
									{/if}
								</div>
							</td>
						</tr>

						{#if editingExpenseId === expense.id && data.permissions.canManageProject}
							<tr>
								<td colspan="7" style="padding: 0; background: var(--surface);">
									<div style="padding: 16px; border-top: 1px solid var(--border);">
										{#if editFieldError(expense.id, 'general')}
											<div class="alert danger" style="margin-bottom: 12px;">{editFieldError(expense.id, 'general')}</div>
										{/if}
										<form method="POST" action="?/editExpense">
											<input type="hidden" name="expenseId" value={expense.id} />
											<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
												<div class="field">
													<label class="label" for={'edit-cat-' + expense.id}>Категория</label>
													<select id={'edit-cat-' + expense.id} name="categoryId" class="select" required>
														{#each data.activeCategories as cat}
															<option
																value={cat.id}
																selected={editFieldValue(expense.id, 'categoryId', expense.categoryId) === cat.id}
															>{cat.name}</option>
														{/each}
													</select>
													{#if editFieldError(expense.id, 'categoryId')}<span style="font-size: 11px; color: var(--danger);">{editFieldError(expense.id, 'categoryId')}</span>{/if}
												</div>

												<div class="field">
													<label class="label" for={'edit-date-' + expense.id}>Дата на разхода</label>
													<input
														id={'edit-date-' + expense.id}
														name="incurredDate"
														type="date"
														class="input"
														value={editFieldValue(expense.id, 'incurredDate', toInputDate(expense.incurredDate))}
														required
													/>
													{#if editFieldError(expense.id, 'incurredDate')}<span style="font-size: 11px; color: var(--danger);">{editFieldError(expense.id, 'incurredDate')}</span>{/if}
												</div>

												<div class="field">
													<label class="label" for={'edit-amount-' + expense.id}>Сума (стотинки)</label>
													<input
														id={'edit-amount-' + expense.id}
														name="amountCents"
														type="number"
														min="1"
														class="input"
														value={editFieldValue(expense.id, 'amountCents', String(expense.amountCents))}
														required
													/>
													{#if editFieldError(expense.id, 'amountCents')}<span style="font-size: 11px; color: var(--danger);">{editFieldError(expense.id, 'amountCents')}</span>{/if}
												</div>

												{#if data.permissions.canManageFinance}
													<div class="field">
														<label class="label" for={'edit-client-' + expense.id}>Клиент (по избор)</label>
														<select
															id={'edit-client-' + expense.id}
															name="clientId"
															class="select"
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
													<label class="label" for={'edit-project-' + expense.id}>Проект {data.permissions.isManager ? '(задължителен)' : '(по избор)'}</label>
													<select
														id={'edit-project-' + expense.id}
														name="projectId"
														class="select"
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
													{#if editFieldError(expense.id, 'projectId')}<span style="font-size: 11px; color: var(--danger);">{editFieldError(expense.id, 'projectId')}</span>{/if}
												</div>
											</div>

											<div class="field" style="margin-top: 8px;">
												<label class="label" for={'edit-desc-' + expense.id}>Описание</label>
												<textarea id={'edit-desc-' + expense.id} name="description" class="textarea" rows="3" required>{editFieldValue(expense.id, 'description', expense.description)}</textarea>
												{#if editFieldError(expense.id, 'description')}<span style="font-size: 11px; color: var(--danger);">{editFieldError(expense.id, 'description')}</span>{/if}
											</div>

											{#if editClientId || expense.clientId}
												<div class="field" style="margin-top: 4px;">
													<label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px;">
														<input type="checkbox" name="billableToInvoice" style="width:16px; height:16px;" checked={expense.billableToInvoice} />
														Таксуване на клиента — добави в следващата фактура
													</label>
												</div>
											{/if}

											<div class="row gap-2" style="margin-top: 4px;">
												<button type="submit" class="btn btn-primary btn-sm">Запази</button>
												<button type="button" class="btn btn-secondary btn-sm" onclick={cancelEdit}>Отказ</button>
											</div>
										</form>
									</div>
								</td>
							</tr>
						{/if}

						{#if markingPaidExpenseId === expense.id && data.permissions.canMarkPaid}
							<tr>
								<td colspan="7" style="padding: 0; background: var(--surface);">
									<div style="padding: 16px; border-top: 1px solid var(--border);">
										<form method="POST" action="?/markPaid">
											<input type="hidden" name="expenseId" value={expense.id} />
											<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
												<div class="field">
													<label class="label" for={'paid-date-' + expense.id}>Дата на плащане</label>
													<input id={'paid-date-' + expense.id} name="paidDate" type="date" class="input" required />
												</div>
												<div class="field">
													<label class="label" for={'paid-container-' + expense.id}>Платено от сметка</label>
													<select id={'paid-container-' + expense.id} name="containerId" class="select" required>
														<option value="">-- Изберете сметка --</option>
														{#each data.moneyContainers as container}
															<option value={container.id}>
																{container.name}
															</option>
														{/each}
													</select>
												</div>
											</div>
											<div class="row gap-2" style="margin-top: 12px;">
												<button type="submit" class="btn btn-accent btn-sm">Потвърди плащане</button>
												<button type="button" class="btn btn-secondary btn-sm" onclick={cancelMarkPaid}>Отказ</button>
											</div>
										</form>
									</div>
								</td>
							</tr>
						{/if}

						{#if attachingExpenseId === expense.id && data.permissions.canMarkPaid}
							<tr>
								<td colspan="7" style="padding: 0; background: var(--surface);">
									<div style="padding: 16px; border-top: 1px solid var(--border);">
										{#if expense.attachments.length > 0}
											<div style="margin-bottom: 12px;">
												<div class="label" style="margin-bottom: 6px; font-size: 11px;">Прикачени файлове</div>
												<div style="display: flex; flex-direction: column; gap: 4px;">
													{#each expense.attachments as att}
														<a href="/bank-statements/attachments/pdf/expense/{att.id}" target="_blank"
															style="font-size: 13px; color: var(--accent); text-decoration: none;">
															↗ {att.originalFilename}
														</a>
													{/each}
												</div>
											</div>
										{/if}
										{#if (form as any)?.uploadAttachmentError && (form as any)?.uploadAttachmentExpenseId === expense.id}
											<div class="alert danger" style="margin-bottom: 8px; font-size: 13px;">{(form as any).uploadAttachmentError}</div>
										{/if}
										<form method="POST" action="?/uploadExpenseAttachment" enctype="multipart/form-data">
											<input type="hidden" name="expenseId" value={expense.id} />
											<div style="display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap;">
												<div class="field" style="flex: 1; min-width: 200px; margin: 0;">
													<label class="label" for={'att-file-' + expense.id} style="font-size: 11px;">Прикачи PDF или изображение</label>
													<input id={'att-file-' + expense.id} type="file" name="file" class="input"
														accept=".pdf,.jpg,.jpeg,.png" required />
												</div>
												<button type="submit" class="btn btn-primary btn-sm">Качи</button>
												<button type="button" class="btn btn-secondary btn-sm"
													onclick={() => (attachingExpenseId = null)}>Затвори</button>
											</div>
										</form>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}

<!-- ─── RECURRING TEMPLATES TAB ────────────────────────────────────────── -->
{#if activeTab === 'recurring' && data.permissions.canManageRecurring}
	{#if (form as any)?.createTemplateError}
		<div class="alert danger" style="margin-bottom: 16px;">{(form as any).createTemplateError}</div>
	{/if}
	{#if (form as any)?.editTemplateError}
		<div class="alert danger" style="margin-bottom: 16px;">{(form as any).editTemplateError}</div>
	{/if}
	{#if (form as any)?.deactivateTemplateError}
		<div class="alert danger" style="margin-bottom: 16px;">{(form as any).deactivateTemplateError}</div>
	{/if}

	<div class="row-between" style="margin-bottom: 16px;">
		<div></div>
		<button class="btn btn-primary btn-sm" onclick={() => (showCreateTemplateForm = !showCreateTemplateForm)}>
			{showCreateTemplateForm ? 'Отказ' : '+ Нов шаблон'}
		</button>
	</div>

	{#if showCreateTemplateForm}
		<div class="card" style="margin-bottom: 20px;">
			<div class="card-header">
				<h2 class="card-title">Нов повтарящ се разход</h2>
			</div>
			<div style="padding: 16px;">
				<form method="POST" action="?/createRecurringTemplate">
					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
						<div class="field">
							<label class="label" for="tpl-create-categoryId">Категория</label>
							<select id="tpl-create-categoryId" name="categoryId" class="select" required>
								<option value="">-- Изберете категория --</option>
								{#each data.activeCategories as cat}
									<option value={cat.id} selected={templateCreateFieldValue('categoryId') === cat.id}>{cat.name}</option>
								{/each}
							</select>
							{#if templateCreateFieldError('categoryId')}<span style="font-size: 11px; color: var(--danger);">{templateCreateFieldError('categoryId')}</span>{/if}
						</div>

						<div class="field">
							<label class="label" for="tpl-create-frequency">Честота</label>
							<select id="tpl-create-frequency" name="frequency" class="select" required>
								<option value="">-- Изберете честота --</option>
								<option value="monthly" selected={templateCreateFieldValue('frequency') === 'monthly'}>Месечно</option>
								<option value="yearly" selected={templateCreateFieldValue('frequency') === 'yearly'}>Годишно</option>
							</select>
							{#if templateCreateFieldError('frequency')}<span style="font-size: 11px; color: var(--danger);">{templateCreateFieldError('frequency')}</span>{/if}
						</div>

						<div class="field">
							<label class="label" for="tpl-create-amountCents">Сума (стотинки)</label>
							<input
								id="tpl-create-amountCents"
								name="amountCents"
								type="number"
								min="1"
								placeholder="напр. 5000 = 50.00"
								class="input"
								value={templateCreateFieldValue('amountCents')}
								required
							/>
							{#if templateCreateFieldError('amountCents')}<span style="font-size: 11px; color: var(--danger);">{templateCreateFieldError('amountCents')}</span>{/if}
						</div>

						<div class="field">
							<label class="label" for="tpl-create-startDate">Начална дата</label>
							<input
								id="tpl-create-startDate"
								name="startDate"
								type="date"
								class="input"
								value={templateCreateFieldValue('startDate')}
								required
							/>
							{#if templateCreateFieldError('startDate')}<span style="font-size: 11px; color: var(--danger);">{templateCreateFieldError('startDate')}</span>{/if}
						</div>

						<div class="field">
							<label class="label" for="tpl-create-endDate">Крайна дата (по избор)</label>
							<input
								id="tpl-create-endDate"
								name="endDate"
								type="date"
								class="input"
								value={templateCreateFieldValue('endDate')}
							/>
							{#if templateCreateFieldError('endDate')}<span style="font-size: 11px; color: var(--danger);">{templateCreateFieldError('endDate')}</span>{/if}
						</div>

						<div class="field">
							<label class="label" for="tpl-create-clientId">Клиент (по избор)</label>
							<select
								id="tpl-create-clientId"
								name="clientId"
								class="select"
								bind:value={createTemplateClientId}
								onchange={() => (createTemplateProjectId = '')}
							>
								<option value="">-- Режийни (без клиент) --</option>
								{#each data.clients as client}
									<option value={client.id}>{client.legalName}</option>
								{/each}
							</select>
						</div>

						<div class="field">
							<label class="label" for="tpl-create-projectId">Проект (по избор)</label>
							<select id="tpl-create-projectId" name="projectId" class="select" bind:value={createTemplateProjectId}>
								<option value="">-- Без проект --</option>
								{#each getProjectsForClient(createTemplateClientId) as project}
									<option value={project.id}>{project.name}</option>
								{/each}
								{#if !createTemplateClientId}
									{#each data.clients as client}
										{#each getProjectsForClient(client.id) as project}
											<option value={project.id}>{client.legalName} / {project.name}</option>
										{/each}
									{/each}
								{/if}
							</select>
						</div>
					</div>

					<div class="field" style="margin-top: 8px;">
						<label class="label" for="tpl-create-description">Описание</label>
						<textarea id="tpl-create-description" name="description" class="textarea" rows="3" required>{templateCreateFieldValue('description')}</textarea>
						{#if templateCreateFieldError('description')}<span style="font-size: 11px; color: var(--danger);">{templateCreateFieldError('description')}</span>{/if}
					</div>

					<button type="submit" class="btn btn-primary btn-sm">Създай шаблон</button>
				</form>
			</div>
		</div>
	{/if}

	{#if data.recurringTemplates.length === 0}
		<div class="card" style="padding: 40px; text-align: center;">
			<p class="muted">Няма повтарящи се разходи.</p>
		</div>
	{:else}
		<div class="card">
			<table class="tbl">
				<thead>
					<tr>
						<th>Описание</th>
						<th>Категория</th>
						<th>Честота</th>
						<th class="num">Сума</th>
						<th>От дата</th>
						<th>До дата</th>
						<th>Проект/Клиент</th>
						<th>Статус</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.recurringTemplates as tpl}
						<tr style={!tpl.isActive ? 'opacity: 0.6;' : ''}>
							<td style="font-weight: 500;">{tpl.description}</td>
							<td class="muted">{tpl.category.name}</td>
							<td><span class="badge outline">{formatFrequency(tpl.frequency)}</span></td>
							<td class="num amount">{formatAmount(tpl.amountCents)} EUR</td>
							<td class="amount muted">{formatDate(tpl.startDate)}</td>
							<td class="amount muted">{tpl.endDate ? formatDate(tpl.endDate) : '—'}</td>
							<td class="muted">
								{#if tpl.project}
									{tpl.client ? tpl.client.legalName + ' / ' : ''}{tpl.project.name}
								{:else if tpl.client}
									{tpl.client.legalName}
								{:else}
									Режийни
								{/if}
							</td>
							<td>
								{#if tpl.isActive}
									<span class="badge task-done">Активен</span>
								{:else}
									<span class="badge task-cancelled">Неактивен</span>
								{/if}
							</td>
							<td>
								{#if tpl.isActive}
									<div class="row gap-2" style="justify-content: flex-end;">
										<button
											type="button"
											class="btn btn-secondary btn-sm"
											onclick={() => (editingTemplateId === tpl.id ? cancelEditTemplate() : startEditTemplate(tpl))}
										>
											{editingTemplateId === tpl.id ? 'Затвори' : 'Редактирай'}
										</button>
										<form method="POST" action="?/deactivateRecurringTemplate" onsubmit={(e) => { if (!confirm('Сигурни ли сте, че искате да деактивирате шаблона? Всички бъдещи неплатени плащания ще бъдат изтрити.')) e.preventDefault(); }}>
											<input type="hidden" name="templateId" value={tpl.id} />
											<button type="submit" class="btn btn-danger btn-sm">Деактивирай</button>
										</form>
									</div>
								{/if}
							</td>
						</tr>

						{#if editingTemplateId === tpl.id && tpl.isActive}
							<tr>
								<td colspan="9" style="padding: 0; background: var(--surface);">
									<div style="padding: 16px; border-top: 1px solid var(--border);">
										<form method="POST" action="?/editRecurringTemplate">
											<input type="hidden" name="templateId" value={tpl.id} />
											<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
												<div class="field">
													<label class="label" for={'tpl-edit-cat-' + tpl.id}>Категория</label>
													<select id={'tpl-edit-cat-' + tpl.id} name="categoryId" class="select" required>
														{#each data.activeCategories as cat}
															<option
																value={cat.id}
																selected={templateEditFieldValue(tpl.id, 'categoryId', tpl.categoryId) === cat.id}
															>{cat.name}</option>
														{/each}
													</select>
													{#if templateEditFieldError(tpl.id, 'categoryId')}<span style="font-size: 11px; color: var(--danger);">{templateEditFieldError(tpl.id, 'categoryId')}</span>{/if}
												</div>

												<div class="field">
													<label class="label" for={'tpl-edit-freq-' + tpl.id}>Честота</label>
													<select id={'tpl-edit-freq-' + tpl.id} name="frequency" class="select" required>
														<option value="monthly" selected={templateEditFieldValue(tpl.id, 'frequency', tpl.frequency) === 'monthly'}>Месечно</option>
														<option value="yearly" selected={templateEditFieldValue(tpl.id, 'frequency', tpl.frequency) === 'yearly'}>Годишно</option>
													</select>
													{#if templateEditFieldError(tpl.id, 'frequency')}<span style="font-size: 11px; color: var(--danger);">{templateEditFieldError(tpl.id, 'frequency')}</span>{/if}
												</div>

												<div class="field">
													<label class="label" for={'tpl-edit-amount-' + tpl.id}>Сума (стотинки)</label>
													<input
														id={'tpl-edit-amount-' + tpl.id}
														name="amountCents"
														type="number"
														min="1"
														class="input"
														value={templateEditFieldValue(tpl.id, 'amountCents', String(tpl.amountCents))}
														required
													/>
													{#if templateEditFieldError(tpl.id, 'amountCents')}<span style="font-size: 11px; color: var(--danger);">{templateEditFieldError(tpl.id, 'amountCents')}</span>{/if}
												</div>

												<div class="field">
													<label class="label" for={'tpl-edit-start-' + tpl.id}>Начална дата</label>
													<input
														id={'tpl-edit-start-' + tpl.id}
														name="startDate"
														type="date"
														class="input"
														value={templateEditFieldValue(tpl.id, 'startDate', toInputDate(tpl.startDate))}
														required
													/>
													{#if templateEditFieldError(tpl.id, 'startDate')}<span style="font-size: 11px; color: var(--danger);">{templateEditFieldError(tpl.id, 'startDate')}</span>{/if}
												</div>

												<div class="field">
													<label class="label" for={'tpl-edit-end-' + tpl.id}>Крайна дата (по избор)</label>
													<input
														id={'tpl-edit-end-' + tpl.id}
														name="endDate"
														type="date"
														class="input"
														value={templateEditFieldValue(tpl.id, 'endDate', toInputDate(tpl.endDate))}
													/>
													{#if templateEditFieldError(tpl.id, 'endDate')}<span style="font-size: 11px; color: var(--danger);">{templateEditFieldError(tpl.id, 'endDate')}</span>{/if}
												</div>

												<div class="field">
													<label class="label" for={'tpl-edit-client-' + tpl.id}>Клиент (по избор)</label>
													<select
														id={'tpl-edit-client-' + tpl.id}
														name="clientId"
														class="select"
														bind:value={editTemplateClientId}
														onchange={() => (editTemplateProjectId = '')}
													>
														<option value="">-- Режийни (без клиент) --</option>
														{#each data.clients as client}
															<option value={client.id} selected={editTemplateClientId === client.id || (editTemplateClientId === '' && tpl.clientId === client.id)}>{client.legalName}</option>
														{/each}
													</select>
												</div>

												<div class="field">
													<label class="label" for={'tpl-edit-project-' + tpl.id}>Проект (по избор)</label>
													<select
														id={'tpl-edit-project-' + tpl.id}
														name="projectId"
														class="select"
														bind:value={editTemplateProjectId}
													>
														<option value="">-- Без проект --</option>
														{#if editTemplateClientId}
															{#each getProjectsForClient(editTemplateClientId) as project}
																<option value={project.id}>{project.name}</option>
															{/each}
														{:else}
															{#each data.clients as client}
																{#each getProjectsForClient(client.id) as project}
																	<option value={project.id} selected={editTemplateProjectId === '' && tpl.projectId === project.id}>
																		{client.legalName} / {project.name}
																	</option>
																{/each}
															{/each}
														{/if}
													</select>
												</div>
											</div>

											<div class="field" style="margin-top: 8px;">
												<label class="label" for={'tpl-edit-desc-' + tpl.id}>Описание</label>
												<textarea id={'tpl-edit-desc-' + tpl.id} name="description" class="textarea" rows="3" required>{templateEditFieldValue(tpl.id, 'description', tpl.description)}</textarea>
												{#if templateEditFieldError(tpl.id, 'description')}<span style="font-size: 11px; color: var(--danger);">{templateEditFieldError(tpl.id, 'description')}</span>{/if}
											</div>

											<p class="muted" style="font-size: 11px; font-style: italic; margin-bottom: 8px;">При запис всички неплатени бъдещи плащания ще бъдат регенерирани.</p>

											<div class="row gap-2">
												<button type="submit" class="btn btn-primary btn-sm">Запази и регенерирай</button>
												<button type="button" class="btn btn-secondary btn-sm" onclick={cancelEditTemplate}>Отказ</button>
											</div>
										</form>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}

<!-- ─── CATEGORIES TAB ─────────────────────────────────────────────────── -->
{#if activeTab === 'categories' && data.permissions.canManageCategories}
	{#if (form as any)?.addCategoryError}
		<div class="alert danger" style="margin-bottom: 16px;">{(form as any).addCategoryError}</div>
	{/if}
	{#if (form as any)?.deactivateCategoryError}
		<div class="alert danger" style="margin-bottom: 16px;">{(form as any).deactivateCategoryError}</div>
	{/if}

	<div class="row-between" style="margin-bottom: 16px;">
		<div></div>
		<button class="btn btn-primary btn-sm" onclick={() => (showAddCategoryForm = !showAddCategoryForm)}>
			{showAddCategoryForm ? 'Отказ' : '+ Нова категория'}
		</button>
	</div>

	{#if showAddCategoryForm}
		<div class="card" style="margin-bottom: 20px;">
			<div class="card-header">
				<h2 class="card-title">Нова категория</h2>
			</div>
			<div style="padding: 16px;">
				<form method="POST" action="?/addCategory">
					<div class="field">
						<label class="label" for="cat-name">Наименование</label>
						<input id="cat-name" name="name" type="text" class="input" value={categoryFieldValue('name')} required />
						{#if categoryFieldError('name')}<span style="font-size: 11px; color: var(--danger);">{categoryFieldError('name')}</span>{/if}
					</div>
					<button type="submit" class="btn btn-primary btn-sm">Добави категория</button>
				</form>
			</div>
		</div>
	{/if}

	{#if data.categories.length === 0}
		<div class="card" style="padding: 40px; text-align: center;">
			<p class="muted">Няма добавени категории.</p>
		</div>
	{:else}
		<div class="card">
			<table class="tbl">
				<thead>
					<tr>
						<th>Наименование</th>
						<th>Статус</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.categories as cat}
						<tr>
							<td style="font-weight: 500;">{cat.name}</td>
							<td>
								{#if cat.isActive}
									<span class="badge task-done">Активна</span>
								{:else}
									<span class="badge task-cancelled">Неактивна</span>
								{/if}
							</td>
							<td>
								{#if cat.isActive}
									<form method="POST" action="?/deactivateCategory">
										<input type="hidden" name="categoryId" value={cat.id} />
										<button type="submit" class="btn btn-danger btn-sm">Деактивирай</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}
