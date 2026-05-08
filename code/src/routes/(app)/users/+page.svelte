<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { fmtDate as formatDate } from '$lib/utils/format';

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

	function latestRates(user: PageData['users'][number]) {
		return user.rateHistoryEntries[0] ?? null;
	}

	function userInitials(user: PageData['users'][number]) {
		return (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '');
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
		<h1 class="page-title">Потребители</h1>
		<p class="page-sub">Ролите, активността и ставките вече се пазят с история по дати.</p>
	</div>
	<div class="page-header-actions">
		<button class="btn btn-primary btn-sm" onclick={() => (showCreateForm = !showCreateForm)}>
			{showCreateForm ? 'Отказ' : '+ Нов потребител'}
		</button>
	</div>
</div>

{#if (form as any)?.createError}
	<div class="alert danger" style="margin-bottom: 16px;">{(form as any).createError}</div>
{/if}

{#if showCreateForm}
	<div class="card" style="margin-bottom: 20px;">
		<div class="card-header">
			<h2 class="card-title">Нов потребител</h2>
		</div>
		<div style="padding: 16px;">
			<form method="POST" action="?/create">
				<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
					<div class="field">
						<label class="label" for="firstName">Собствено име</label>
						<input id="firstName" name="firstName" type="text" class="input" value={val('firstName')} required />
						{#if fieldError('firstName')}<span style="font-size: 11px; color: var(--danger);">{fieldError('firstName')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="lastName">Фамилно име</label>
						<input id="lastName" name="lastName" type="text" class="input" value={val('lastName')} required />
						{#if fieldError('lastName')}<span style="font-size: 11px; color: var(--danger);">{fieldError('lastName')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="email">Имейл</label>
						<input id="email" name="email" type="email" class="input" value={val('email')} required />
						{#if fieldError('email')}<span style="font-size: 11px; color: var(--danger);">{fieldError('email')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="role">Роля</label>
						<select id="role" name="role" class="select" value={val('role')} required>
							<option value="">Изберете роля</option>
							{#each Object.entries(roleLabels) as [value, label]}
								<option value={value}>{label}</option>
							{/each}
						</select>
						{#if fieldError('role')}<span style="font-size: 11px; color: var(--danger);">{fieldError('role')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="password">Парола</label>
						<input id="password" name="password" type="password" class="input" minlength="8" required />
						{#if fieldError('password')}<span style="font-size: 11px; color: var(--danger);">{fieldError('password')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="effectiveFrom">Ставки в сила от</label>
						<input id="effectiveFrom" name="effectiveFrom" type="date" class="input" value={val('effectiveFrom', data.today)} required />
						{#if fieldError('effectiveFrom')}<span style="font-size: 11px; color: var(--danger);">{fieldError('effectiveFrom')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="costRate">Себестойност ({data.company?.currency ?? 'EUR'})</label>
						<input id="costRate" name="costRate" type="text" class="input" inputmode="decimal" value={val('costRate')} />
						{#if fieldError('costRate')}<span style="font-size: 11px; color: var(--danger);">{fieldError('costRate')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="defaultBillableRate">Стандартна билируема ставка ({data.company?.currency ?? 'EUR'})</label>
						<input
							id="defaultBillableRate"
							name="defaultBillableRate"
							type="text"
							class="input"
							inputmode="decimal"
							value={val('defaultBillableRate')}
						/>
						{#if fieldError('defaultBillableRate')}<span style="font-size: 11px; color: var(--danger);">{fieldError('defaultBillableRate')}</span>{/if}
					</div>
				</div>
				<div style="margin-top: 4px;">
					<button type="submit" class="btn btn-primary btn-sm">Създай потребител</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<div class="card">
	<table class="tbl">
		<thead>
			<tr>
				<th>Потребител</th>
				<th>Имейл</th>
				<th>Роля</th>
				<th>Текущи ставки</th>
				<th>История на ставките</th>
				<th>Статус</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as user}
				{@const currentRates = latestRates(user)}
				<tr style={user.status === 'inactive' ? 'opacity: 0.6;' : ''}>
					<td>
						<div class="row gap-2">
							<div class="sb-avatar" style="font-size: 11px;">
								{userInitials(user)}
							</div>
							<div>
								<div style="font-weight: 500;">{user.firstName} {user.lastName}</div>
							</div>
						</div>
					</td>
					<td class="amount muted" style="font-size: 12px;">{user.email}</td>
					<td>
						<form method="POST" action="?/setRole" style="display: inline;">
							<input type="hidden" name="userId" value={user.id} />
							<select
								name="role"
								class="select"
								value={selectedRole(user.id, user.role)}
								aria-invalid={roleError(user.id) ? 'true' : undefined}
								style="width: 160px; height: 26px; font-size: 12px;"
								onchange={(event) => event.currentTarget.form?.requestSubmit()}
							>
								{#each Object.entries(roleLabels) as [value, label]}
									<option value={value}>{label}</option>
								{/each}
							</select>
						</form>
						{#if roleError(user.id)}
							<div style="font-size: 11px; color: var(--danger); margin-top: 2px;">{roleError(user.id)}</div>
						{/if}
					</td>
					<td>
						<div class="col gap-1">
							<div>
								<span class="muted" style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-mono);">Себестойност</span>
								<div style="font-weight: 500; font-size: 12px;" class="amount">{formatMoneyFromCents(currentRates?.costRateCents ?? null)}</div>
							</div>
							<div>
								<span class="muted" style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-mono);">Билируема</span>
								<div style="font-weight: 500; font-size: 12px;" class="amount">{formatMoneyFromCents(currentRates?.billableRateCents ?? null)}</div>
							</div>
							{#if currentRates}
								<div class="muted" style="font-size: 11px;">В сила от {formatDate(currentRates.effectiveFrom)}</div>
							{/if}
						</div>
					</td>
					<td>
						<div class="col gap-2">
							<form method="POST" action="?/addRateHistoryEntry" style="display: grid; gap: 6px; padding: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md);">
								<input type="hidden" name="userId" value={user.id} />
								<div style="display: grid; grid-template-columns: 1.1fr 1fr 1fr auto; gap: 6px; align-items: center;">
									<input
										name="effectiveFrom"
										type="date"
										class="input"
										style="height: 26px; font-size: 12px;"
										value={rateHistoryValue(user.id, 'effectiveFrom', data.today)}
										aria-label="Дата в сила от"
									/>
									<input
										name="costRate"
										type="text"
										class="input"
										style="height: 26px; font-size: 12px;"
										inputmode="decimal"
										placeholder="Себестойност"
										value={rateHistoryValue(user.id, 'costRate')}
										aria-label="Себестойност"
									/>
									<input
										name="defaultBillableRate"
										type="text"
										class="input"
										style="height: 26px; font-size: 12px;"
										inputmode="decimal"
										placeholder="Билируема ставка"
										value={rateHistoryValue(user.id, 'defaultBillableRate')}
										aria-label="Билируема ставка"
									/>
									<button type="submit" class="btn btn-secondary btn-sm">Добави</button>
								</div>
								{#if rateHistoryError(user.id, 'effectiveFrom')}<span style="font-size: 11px; color: var(--danger);">{rateHistoryError(user.id, 'effectiveFrom')}</span>{/if}
								{#if rateHistoryError(user.id, 'costRate')}<span style="font-size: 11px; color: var(--danger);">{rateHistoryError(user.id, 'costRate')}</span>{/if}
								{#if rateHistoryError(user.id, 'defaultBillableRate')}<span style="font-size: 11px; color: var(--danger);">{rateHistoryError(user.id, 'defaultBillableRate')}</span>{/if}
							</form>

							<div class="col gap-1">
								{#if user.rateHistoryEntries.length === 0}
									<span class="muted" style="font-size: 11px;">Все още няма история.</span>
								{:else}
									{#each user.rateHistoryEntries as entry}
										<div style="padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--bg-elevated); font-size: 12px;" class="col gap-1">
											<strong class="amount">{formatDate(entry.effectiveFrom)}</strong>
											<span class="muted">Себестойност: {formatMoneyFromCents(entry.costRateCents)}</span>
											<span class="muted">Билируема: {formatMoneyFromCents(entry.billableRateCents)}</span>
										</div>
									{/each}
								{/if}
							</div>
						</div>
					</td>
					<td>
						{#if user.status === 'active'}
							<span class="badge task-done">Активен</span>
						{:else}
							<span class="badge task-cancelled">Неактивен</span>
						{/if}
					</td>
					<td>
						{#if user.status === 'active'}
							<form method="POST" action="?/setStatus" style="display: inline;">
								<input type="hidden" name="userId" value={user.id} />
								<input type="hidden" name="status" value="inactive" />
								<button type="submit" class="btn btn-danger btn-sm">Деактивирай</button>
							</form>
						{:else}
							<form method="POST" action="?/setStatus" style="display: inline;">
								<input type="hidden" name="userId" value={user.id} />
								<input type="hidden" name="status" value="active" />
								<button type="submit" class="btn btn-secondary btn-sm">Активирай</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
			{#if data.users.length === 0}
				<tr>
					<td colspan="7" style="text-align: center; padding: 32px;" class="muted">Няма потребители.</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
