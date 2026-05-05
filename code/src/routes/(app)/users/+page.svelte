<script lang="ts">
	import type { PageData, ActionData } from './$types';

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
	function val(field: string) {
		return (form as any)?.createValues?.[field] ?? '';
	}

	$effect(() => {
		if ((form as any)?.createSuccess) showCreateForm = false;
	});
</script>

<svelte:head>
	<title>Потребители – Иномедия</title>
</svelte:head>

<div class="page-header">
	<h1>Потребители</h1>
	<button class="btn-primary" onclick={() => (showCreateForm = !showCreateForm)}>
		{showCreateForm ? 'Отказ' : '+ Нов потребител'}
	</button>
</div>

{#if (form as any)?.createError}
	<div class="alert">{(form as any).createError}</div>
{/if}

{#if showCreateForm}
	<div class="create-form card">
		<h2>Нов потребител</h2>
		<form method="POST" action="?/create">
			<div class="row">
				<div class="field">
					<label for="firstName">Собствено ime *</label>
					<input id="firstName" name="firstName" type="text" value={val('firstName')} required />
					{#if fieldError('firstName')}<span class="error">{fieldError('firstName')}</span>{/if}
				</div>
				<div class="field">
					<label for="lastName">Фамилно ime *</label>
					<input id="lastName" name="lastName" type="text" value={val('lastName')} required />
					{#if fieldError('lastName')}<span class="error">{fieldError('lastName')}</span>{/if}
				</div>
			</div>
			<div class="row">
				<div class="field">
					<label for="email">Имейл *</label>
					<input id="email" name="email" type="email" value={val('email')} required />
					{#if fieldError('email')}<span class="error">{fieldError('email')}</span>{/if}
				</div>
				<div class="field">
					<label for="role">Роля *</label>
					<select id="role" name="role" value={val('role')} required>
						<option value="">— изберете —</option>
						<option value="admin">Администратор</option>
						<option value="manager">Мениджър</option>
						<option value="employee">Служител</option>
						<option value="accountant">Счетоводител</option>
					</select>
					{#if fieldError('role')}<span class="error">{fieldError('role')}</span>{/if}
				</div>
			</div>
			<div class="field">
				<label for="password">Парола *</label>
				<input id="password" name="password" type="password" minlength="8" required />
				{#if fieldError('password')}<span class="error">{fieldError('password')}</span>{/if}
			</div>
			<button type="submit" class="btn-primary">Създай потребител</button>
		</form>
	</div>
{/if}

<div class="table-wrap card">
	<table>
		<thead>
			<tr>
				<th>Ime</th>
				<th>Имейл</th>
				<th>Роля</th>
				<th>Статус</th>
				<th>Действия</th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as u}
				<tr class:inactive={u.status === 'inactive'}>
					<td>{u.firstName} {u.lastName}</td>
					<td>{u.email}</td>
					<td>
						<form method="POST" action="?/setRole" class="inline-form">
							<input type="hidden" name="userId" value={u.id} />
							<select name="role" onchange="this.form.requestSubmit()">
								{#each Object.entries(roleLabels) as [v, label]}
									<option value={v} selected={u.role === v}>{label}</option>
								{/each}
							</select>
						</form>
					</td>
					<td>
						<span class="badge" class:active={u.status === 'active'} class:disabled={u.status === 'inactive'}>
							{u.status === 'active' ? 'Активен' : 'Неактивен'}
						</span>
					</td>
					<td>
						{#if u.status === 'active'}
							<form method="POST" action="?/setStatus" class="inline-form">
								<input type="hidden" name="userId" value={u.id} />
								<input type="hidden" name="status" value="inactive" />
								<button type="submit" class="btn-sm btn-danger">Деактивирай</button>
							</form>
						{:else}
							<form method="POST" action="?/setStatus" class="inline-form">
								<input type="hidden" name="userId" value={u.id} />
								<input type="hidden" name="status" value="active" />
								<button type="submit" class="btn-sm btn-success">Активирай</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
			{#if data.users.length === 0}
				<tr><td colspan="5" style="text-align:center;color:#64748b;padding:24px">Няма потребители</td></tr>
			{/if}
		</tbody>
	</table>
</div>

<style>
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24px;
	}

	h1 {
		font-size: 1.375rem;
		font-weight: 700;
		color: #0f172a;
	}

	h2 {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 16px;
		color: #334155;
	}

	.card {
		background: #fff;
		border-radius: 10px;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
		padding: 24px;
		margin-bottom: 24px;
	}

	.create-form {
		margin-bottom: 24px;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 14px;
	}

	label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
	}

	input,
	select {
		padding: 8px 10px;
		border: 1px solid #d1d5db;
		border-radius: 5px;
		font-size: 0.9rem;
		font-family: inherit;
		color: #0f172a;
		outline: none;
		background: #fff;
	}

	input:focus,
	select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.error {
		font-size: 0.8rem;
		color: #dc2626;
	}

	.alert {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: 12px 16px;
		border-radius: 6px;
		margin-bottom: 20px;
	}

	.table-wrap {
		overflow-x: auto;
		padding: 0;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		text-align: left;
		padding: 12px 16px;
		font-size: 0.8125rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #64748b;
		border-bottom: 1px solid #e2e8f0;
		background: #f8fafc;
	}

	td {
		padding: 12px 16px;
		font-size: 0.9rem;
		border-bottom: 1px solid #f1f5f9;
		vertical-align: middle;
	}

	tr:last-child td {
		border-bottom: none;
	}

	tr.inactive td {
		color: #94a3b8;
	}

	.badge {
		display: inline-block;
		padding: 3px 10px;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 500;
	}

	.badge.active {
		background: #dcfce7;
		color: #166534;
	}

	.badge.disabled {
		background: #f1f5f9;
		color: #94a3b8;
	}

	.inline-form {
		display: inline;
	}

	.btn-primary {
		padding: 9px 18px;
		background: #2563eb;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-primary:hover {
		background: #1d4ed8;
	}

	.btn-sm {
		padding: 5px 12px;
		border: none;
		border-radius: 5px;
		font-size: 0.8125rem;
		font-family: inherit;
		cursor: pointer;
		font-weight: 500;
	}

	.btn-danger {
		background: #fee2e2;
		color: #dc2626;
	}

	.btn-danger:hover {
		background: #fecaca;
	}

	.btn-success {
		background: #dcfce7;
		color: #166534;
	}

	.btn-success:hover {
		background: #bbf7d0;
	}
</style>
