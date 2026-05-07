<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);

	const roleLabels: Record<string, string> = {
		admin: 'Администратор',
		manager: 'Мениджър',
		employee: 'Служител',
		accountant: 'Счетоводител'
	};

	function fieldError(field: string) {
		return (form as any)?.createErrors?.[field]?.[0];
	}

	function val(field: string, fallback = '') {
		return (form as any)?.createValues?.[field] ?? fallback;
	}

	function selectedRole(userId: string, currentRole: string) {
		return (form as any)?.roleUserId === userId ? ((form as any)?.roleValue ?? currentRole) : currentRole;
	}

	function roleError(userId: string) {
		return (form as any)?.roleUserId === userId ? (form as any)?.roleError : null;
	}

	function rateHistoryValue(userId: string, field: string, fallback = '') {
		if ((form as any)?.rateHistoryUserId === userId) {
			return (form as any)?.rateHistoryValues?.[field] ?? fallback;
		}

		if (field === 'effectiveFrom') {
			return data.today;
		}

		return fallback;
	}

	function rateHistoryError(userId: string, field: string) {
		return (form as any)?.rateHistoryUserId === userId ? (form as any)?.rateHistoryErrors?.[field]?.[0] : null;
	}

	function formatMoneyFromCents(value: number | null | undefined) {
		if (value == null) {
			return '—';
		}

		return `${(value / 100).toFixed(2)} ${data.company?.currency ?? 'EUR'}`;
	}

	function formatDate(value: string | Date) {
		return new Intl.DateTimeFormat('bg-BG', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(value));
	}

	function latestRates(user: PageData['users'][number]) {
		return user.rateHistoryEntries[0] ?? null;
	}

	$effect(() => {
		if ((form as any)?.createSuccess) {
			showCreateForm = false;
		}
	});
</script>

<svelte:head>
	<title>Потребители - Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1>Потребители</h1>
		<p>Ролите, активността и ставките вече се пазят с история по дати.</p>
	</div>
	<button class="btn-primary" onclick={() => (showCreateForm = !showCreateForm)}>
		{showCreateForm ? 'Отказ' : '+ Нов потребител'}
	</button>
</div>

{#if (form as any)?.createError}
	<div class="alert error">{(form as any).createError}</div>
{/if}

{#if showCreateForm}
	<section class="card create-form">
		<h2>Нов потребител</h2>
		<form method="POST" action="?/create">
			<div class="grid two">
				<div class="field">
					<label for="firstName">Собствено име</label>
					<input id="firstName" name="firstName" type="text" value={val('firstName')} required />
					{#if fieldError('firstName')}<span class="error-text">{fieldError('firstName')}</span>{/if}
				</div>
				<div class="field">
					<label for="lastName">Фамилно име</label>
					<input id="lastName" name="lastName" type="text" value={val('lastName')} required />
					{#if fieldError('lastName')}<span class="error-text">{fieldError('lastName')}</span>{/if}
				</div>
				<div class="field">
					<label for="email">Имейл</label>
					<input id="email" name="email" type="email" value={val('email')} required />
					{#if fieldError('email')}<span class="error-text">{fieldError('email')}</span>{/if}
				</div>
				<div class="field">
					<label for="role">Роля</label>
					<select id="role" name="role" value={val('role')} required>
						<option value="">Изберете роля</option>
						{#each Object.entries(roleLabels) as [value, label]}
							<option value={value}>{label}</option>
						{/each}
					</select>
					{#if fieldError('role')}<span class="error-text">{fieldError('role')}</span>{/if}
				</div>
				<div class="field">
					<label for="password">Парола</label>
					<input id="password" name="password" type="password" minlength="8" required />
					{#if fieldError('password')}<span class="error-text">{fieldError('password')}</span>{/if}
				</div>
				<div class="field">
					<label for="effectiveFrom">Ставки в сила от</label>
					<input id="effectiveFrom" name="effectiveFrom" type="date" value={val('effectiveFrom', data.today)} required />
					{#if fieldError('effectiveFrom')}<span class="error-text">{fieldError('effectiveFrom')}</span>{/if}
				</div>
				<div class="field">
					<label for="costRate">Себестойност ({data.company?.currency ?? 'EUR'})</label>
					<input id="costRate" name="costRate" type="text" inputmode="decimal" value={val('costRate')} />
					{#if fieldError('costRate')}<span class="error-text">{fieldError('costRate')}</span>{/if}
				</div>
				<div class="field">
					<label for="defaultBillableRate">Стандартна билируема ставка ({data.company?.currency ?? 'EUR'})</label>
					<input
						id="defaultBillableRate"
						name="defaultBillableRate"
						type="text"
						inputmode="decimal"
						value={val('defaultBillableRate')}
					/>
					{#if fieldError('defaultBillableRate')}<span class="error-text">{fieldError('defaultBillableRate')}</span>{/if}
				</div>
			</div>
			<button type="submit" class="btn-primary">Създай потребител</button>
		</form>
	</section>
{/if}

<section class="card table-wrap">
	<table>
		<thead>
			<tr>
				<th>Потребител</th>
				<th>Роля</th>
				<th>Текущи ставки</th>
				<th>История на ставките</th>
				<th>Статус</th>
				<th>Действия</th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as user}
				{@const currentRates = latestRates(user)}
				<tr class:inactive={user.status === 'inactive'}>
					<td>
						<div class="user-cell">
							<strong>{user.firstName} {user.lastName}</strong>
							<span>{user.email}</span>
						</div>
					</td>
					<td>
						<form method="POST" action="?/setRole" class="inline-form">
							<input type="hidden" name="userId" value={user.id} />
							<select
								name="role"
								value={selectedRole(user.id, user.role)}
								aria-invalid={roleError(user.id) ? 'true' : undefined}
								onchange={(event) => event.currentTarget.form?.requestSubmit()}
							>
								{#each Object.entries(roleLabels) as [value, label]}
									<option value={value}>{label}</option>
								{/each}
							</select>
						</form>
						{#if roleError(user.id)}
							<div class="error-text">{roleError(user.id)}</div>
						{/if}
					</td>
					<td>
						<div class="rate-stack">
							<div>
								<span class="meta-label">Себестойност</span>
								<strong>{formatMoneyFromCents(currentRates?.costRateCents ?? null)}</strong>
							</div>
							<div>
								<span class="meta-label">Билируема</span>
								<strong>{formatMoneyFromCents(currentRates?.billableRateCents ?? null)}</strong>
							</div>
							{#if currentRates}
								<div class="meta-note">В сила от {formatDate(currentRates.effectiveFrom)}</div>
							{/if}
						</div>
					</td>
					<td>
						<div class="history-block">
							<form method="POST" action="?/addRateHistoryEntry" class="history-form">
								<input type="hidden" name="userId" value={user.id} />
								<div class="history-grid">
									<input
										name="effectiveFrom"
										type="date"
										value={rateHistoryValue(user.id, 'effectiveFrom', data.today)}
										aria-label="Дата в сила от"
									/>
									<input
										name="costRate"
										type="text"
										inputmode="decimal"
										placeholder="Себестойност"
										value={rateHistoryValue(user.id, 'costRate')}
										aria-label="Себестойност"
									/>
									<input
										name="defaultBillableRate"
										type="text"
										inputmode="decimal"
										placeholder="Билируема ставка"
										value={rateHistoryValue(user.id, 'defaultBillableRate')}
										aria-label="Билируема ставка"
									/>
									<button type="submit" class="btn-sm btn-primary-subtle">Добави</button>
								</div>
								{#if rateHistoryError(user.id, 'effectiveFrom')}<span class="error-text">{rateHistoryError(user.id, 'effectiveFrom')}</span>{/if}
								{#if rateHistoryError(user.id, 'costRate')}<span class="error-text">{rateHistoryError(user.id, 'costRate')}</span>{/if}
								{#if rateHistoryError(user.id, 'defaultBillableRate')}<span class="error-text">{rateHistoryError(user.id, 'defaultBillableRate')}</span>{/if}
							</form>

							<div class="history-list">
								{#if user.rateHistoryEntries.length === 0}
									<span class="meta-note">Все още няма история.</span>
								{:else}
									{#each user.rateHistoryEntries as entry}
										<div class="history-entry">
											<strong>{formatDate(entry.effectiveFrom)}</strong>
											<span>Себестойност: {formatMoneyFromCents(entry.costRateCents)}</span>
											<span>Билируема: {formatMoneyFromCents(entry.billableRateCents)}</span>
										</div>
									{/each}
								{/if}
							</div>
						</div>
					</td>
					<td>
						<span class="badge" class:active={user.status === 'active'} class:disabled={user.status === 'inactive'}>
							{user.status === 'active' ? 'Активен' : 'Неактивен'}
						</span>
					</td>
					<td>
						{#if user.status === 'active'}
							<form method="POST" action="?/setStatus" class="inline-form">
								<input type="hidden" name="userId" value={user.id} />
								<input type="hidden" name="status" value="inactive" />
								<button type="submit" class="btn-sm btn-danger">Деактивирай</button>
							</form>
						{:else}
							<form method="POST" action="?/setStatus" class="inline-form">
								<input type="hidden" name="userId" value={user.id} />
								<input type="hidden" name="status" value="active" />
								<button type="submit" class="btn-sm btn-success">Активирай</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
			{#if data.users.length === 0}
				<tr>
					<td colspan="6" class="empty-row">Няма потребители.</td>
				</tr>
			{/if}
		</tbody>
	</table>
</section>

<style>
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 24px;
	}

	.page-header p {
		margin: 6px 0 0;
		color: #64748b;
	}

	h1,
	h2 {
		margin: 0;
		color: #0f172a;
	}

	.card {
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
		padding: 24px;
		margin-bottom: 24px;
	}

	.grid {
		display: grid;
		gap: 16px;
	}

	.grid.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.field {
		display: grid;
		gap: 6px;
	}

	label {
		font-size: 0.88rem;
		font-weight: 600;
		color: #334155;
	}

	input,
	select,
	button {
		font: inherit;
	}

	input,
	select {
		width: 100%;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		padding: 10px 12px;
		background: #fff;
		color: #0f172a;
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	.table-wrap {
		padding: 0;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		padding: 16px;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid #e2e8f0;
	}

	th {
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #64748b;
		background: #f8fafc;
	}

	tr:last-child td {
		border-bottom: none;
	}

	tr.inactive td {
		color: #94a3b8;
	}

	.user-cell,
	.rate-stack,
	.history-block,
	.history-list {
		display: grid;
		gap: 8px;
	}

	.user-cell span,
	.meta-note {
		color: #64748b;
		font-size: 0.88rem;
	}

	.meta-label {
		display: block;
		font-size: 0.76rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #64748b;
		margin-bottom: 4px;
	}

	.history-form {
		display: grid;
		gap: 8px;
		padding: 12px;
		border: 1px solid #dbe4f0;
		border-radius: 10px;
		background: #f8fafc;
	}

	.history-grid {
		display: grid;
		grid-template-columns: 1.1fr 1fr 1fr auto;
		gap: 8px;
		align-items: center;
	}

	.history-entry {
		display: grid;
		gap: 2px;
		padding: 10px 12px;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		background: #fff;
		font-size: 0.88rem;
	}

	.inline-form {
		display: inline;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		padding: 4px 10px;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.badge.active {
		background: #dcfce7;
		color: #166534;
	}

	.badge.disabled {
		background: #e2e8f0;
		color: #64748b;
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

	.error-text {
		font-size: 0.8rem;
		color: #dc2626;
	}

	.btn-primary,
	.btn-sm {
		border: none;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
	}

	.btn-primary {
		padding: 10px 16px;
		background: #2563eb;
		color: #fff;
	}

	.btn-sm {
		padding: 8px 12px;
	}

	.btn-primary-subtle {
		background: #dbeafe;
		color: #1d4ed8;
	}

	.btn-danger {
		background: #fee2e2;
		color: #b91c1c;
	}

	.btn-success {
		background: #dcfce7;
		color: #166534;
	}

	.empty-row {
		text-align: center;
		color: #64748b;
	}

	@media (max-width: 1100px) {
		.history-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media (max-width: 900px) {
		.page-header {
			flex-direction: column;
			align-items: stretch;
		}

		.grid.two,
		.history-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
