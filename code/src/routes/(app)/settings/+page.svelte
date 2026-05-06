<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function companyFieldError(field: string) {
		return (form as any)?.companyErrors?.[field]?.[0];
	}

	function companyValue(field: string, fallback: string | number | boolean) {
		return (form as any)?.companyValues?.[field] ?? fallback;
	}

	function categoryFieldError(field: string) {
		return (form as any)?.categoryErrors?.[field]?.[0];
	}

	function categoryValue(field: string) {
		return (form as any)?.categoryValues?.[field] ?? '';
	}
</script>

<svelte:head>
	<title>Настройки на фирмата - Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1>Настройки на фирмата</h1>
		<p>Правен профил, ДДС настройки, номериране на фактури и категории за разходи.</p>
	</div>
</div>

{#if (form as any)?.companyError}
	<div class="alert error">{(form as any).companyError}</div>
{/if}

{#if (form as any)?.companySuccess}
	<div class="alert success">Настройките на фирмата са обновени.</div>
{/if}

<section class="card">
	<h2>Профил и фактуриране</h2>
	<form method="POST" action="?/updateCompany">
		<div class="grid two">
			<div class="field">
				<label for="legalName">Правно наименование</label>
				<input
					id="legalName"
					name="legalName"
					type="text"
					value={companyValue('legalName', data.company.legalName)}
					required
				/>
				{#if companyFieldError('legalName')}<span class="error-text">{companyFieldError('legalName')}</span>{/if}
			</div>
			<div class="field">
				<label for="eikBulstat">ЕИК / БУЛСТАТ</label>
				<input
					id="eikBulstat"
					name="eikBulstat"
					type="text"
					value={companyValue('eikBulstat', data.company.eikBulstat)}
					required
				/>
				{#if companyFieldError('eikBulstat')}<span class="error-text">{companyFieldError('eikBulstat')}</span>{/if}
			</div>
			<div class="field">
				<label for="vatNumber">ДДС номер</label>
				<input
					id="vatNumber"
					name="vatNumber"
					type="text"
					value={companyValue('vatNumber', data.company.vatNumber ?? '')}
				/>
				{#if companyFieldError('vatNumber')}<span class="error-text">{companyFieldError('vatNumber')}</span>{/if}
			</div>
			<div class="field">
				<label for="molName">МОЛ</label>
				<input
					id="molName"
					name="molName"
					type="text"
					value={companyValue('molName', data.company.molName)}
					required
				/>
				{#if companyFieldError('molName')}<span class="error-text">{companyFieldError('molName')}</span>{/if}
			</div>
		</div>

		<div class="field">
			<label for="registeredAddress">Регистриран адрес</label>
			<textarea
				id="registeredAddress"
				name="registeredAddress"
				rows="3"
				required
			>{companyValue('registeredAddress', data.company.registeredAddress)}</textarea>
			{#if companyFieldError('registeredAddress')}<span class="error-text">{companyFieldError('registeredAddress')}</span>{/if}
		</div>

		<div class="grid three">
			<div class="field">
				<label for="defaultPaymentTermDays">Срок за плащане (дни)</label>
				<input
					id="defaultPaymentTermDays"
					name="defaultPaymentTermDays"
					type="number"
					min="1"
					max="365"
					value={companyValue('defaultPaymentTermDays', data.company.defaultPaymentTermDays)}
					required
				/>
				{#if companyFieldError('defaultPaymentTermDays')}<span class="error-text">{companyFieldError('defaultPaymentTermDays')}</span>{/if}
			</div>
			<div class="field">
				<label for="invoiceNextNumber">Следващ номер на фактура</label>
				<input
					id="invoiceNextNumber"
					name="invoiceNextNumber"
					type="number"
					min="1"
					value={companyValue('invoiceNextNumber', data.company.invoiceNextNumber)}
					required
				/>
				<small>Може да зададете началния номер преди първото издаване на фактура.</small>
				{#if companyFieldError('invoiceNextNumber')}<span class="error-text">{companyFieldError('invoiceNextNumber')}</span>{/if}
			</div>
			<div class="field">
				<label for="vatRatePercent">ДДС ставка (%)</label>
				<input
					id="vatRatePercent"
					name="vatRatePercent"
					type="number"
					min="0"
					max="100"
					step="0.01"
					value={companyValue('vatRatePercent', data.company.vatRateBasisPoints / 100)}
					required
				/>
				{#if companyFieldError('vatRatePercent')}<span class="error-text">{companyFieldError('vatRatePercent')}</span>{/if}
			</div>
		</div>

		<label class="checkbox">
			<input
				type="checkbox"
				name="vatRegistered"
				checked={Boolean(companyValue('vatRegistered', data.company.vatRegistered))}
			/>
			<span>Фирмата е регистрирана по ДДС</span>
		</label>

		<button type="submit" class="btn-primary">Запази настройките</button>
	</form>
</section>

<section class="card">
	<div class="section-head">
		<div>
			<h2>Защитен вътрешен клиент</h2>
			<p>Системният клиент за вътрешни проекти се поддържа автоматично и не може да бъде изтрит.</p>
		</div>
		<span class="badge protected">Защитен</span>
	</div>

	{#if data.internalClient}
		<div class="internal-grid">
			<div>
				<div class="meta-label">Име</div>
				<div class="meta-value">{data.internalClient.legalName}</div>
			</div>
			<div>
				<div class="meta-label">Статус</div>
				<div class="meta-value">{data.internalClient.status === 'active' ? 'Активен' : 'Неактивен'}</div>
			</div>
			<div>
				<div class="meta-label">Проекти</div>
				<div class="meta-value">{data.internalClient._count.projects}</div>
			</div>
		</div>
		<p class="hint">Всички бъдещи проекти към този клиент трябва да останат небилируеми по правило.</p>
	{/if}
</section>

<section class="card">
	<div class="section-head">
		<div>
			<h2>Категории за разходи</h2>
			<p>Системата създава начални категории и позволява да добавяте или деактивирате собствени.</p>
		</div>
	</div>

	{#if (form as any)?.categoryError}
		<div class="alert error">{(form as any).categoryError}</div>
	{/if}

	{#if (form as any)?.categorySuccess}
		<div class="alert success">Категорията е добавена.</div>
	{/if}

	<form method="POST" action="?/addExpenseCategory" class="category-form">
		<div class="field grow">
			<label for="name">Нова категория</label>
			<input id="name" name="name" type="text" value={categoryValue('name')} required />
			{#if categoryFieldError('name')}<span class="error-text">{categoryFieldError('name')}</span>{/if}
		</div>
		<button type="submit" class="btn-primary">Добави категория</button>
	</form>

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Категория</th>
					<th>Статус</th>
					<th>Действие</th>
				</tr>
			</thead>
			<tbody>
				{#each data.expenseCategories as category}
					<tr class:inactive-row={!category.isActive}>
						<td>{category.name}</td>
						<td>
							<span class="badge" class:active={category.isActive} class:inactive={!category.isActive}>
								{category.isActive ? 'Активна' : 'Неактивна'}
							</span>
						</td>
						<td>
							<form method="POST" action="?/toggleExpenseCategory">
								<input type="hidden" name="categoryId" value={category.id} />
								<input type="hidden" name="isActive" value={category.isActive ? 'false' : 'true'} />
								<button type="submit" class="btn-secondary">
									{category.isActive ? 'Деактивирай' : 'Активирай'}
								</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<style>
	.page-header {
		margin-bottom: 24px;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #0f172a;
	}

	h2 {
		font-size: 1.05rem;
		font-weight: 700;
		color: #0f172a;
		margin-bottom: 8px;
	}

	p {
		color: #64748b;
		margin-top: 6px;
	}

	.card {
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
		padding: 24px;
		margin-bottom: 24px;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.grid {
		display: grid;
		gap: 16px;
	}

	.grid.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.grid.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field.grow {
		flex: 1;
	}

	label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #334155;
	}

	input,
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
	textarea:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	textarea {
		resize: vertical;
	}

	small,
	.hint {
		color: #64748b;
		font-size: 0.82rem;
	}

	.checkbox {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-weight: 500;
	}

	.checkbox input {
		width: auto;
	}

	.section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 18px;
	}

	.internal-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
		padding: 16px;
		border-radius: 10px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
	}

	.meta-label {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #64748b;
		margin-bottom: 6px;
	}

	.meta-value {
		font-size: 1rem;
		font-weight: 600;
		color: #0f172a;
	}

	.category-form {
		display: flex;
		flex-direction: row;
		align-items: flex-end;
		margin-bottom: 20px;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		padding: 14px 12px;
		text-align: left;
		border-bottom: 1px solid #e2e8f0;
	}

	th {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #64748b;
		background: #f8fafc;
	}

	.inactive-row td {
		color: #94a3b8;
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
		background: #e2e8f0;
		color: #475569;
	}

	.badge.protected {
		background: #dbeafe;
		color: #1d4ed8;
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

	.btn-primary,
	.btn-secondary {
		border: none;
		border-radius: 8px;
		padding: 10px 16px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-primary {
		background: #2563eb;
		color: #fff;
		align-self: flex-start;
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

	@media (max-width: 900px) {
		.grid.two,
		.grid.three,
		.internal-grid {
			grid-template-columns: 1fr;
		}

		.category-form,
		.section-head {
			flex-direction: column;
			align-items: stretch;
		}

		.btn-primary {
			width: 100%;
		}
	}
</style>
