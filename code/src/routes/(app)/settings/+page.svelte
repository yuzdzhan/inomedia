<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let activeTab = $state<'company' | 'categories'>('company');

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
	<title>Настройки – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Настройки</h1>
		<p class="page-sub">Фирмени данни, фактуриране, и одит лог</p>
	</div>
</div>

<div class="tabs" style="margin-bottom:16px;">
	<button class="tab" class:active={activeTab === 'company'} onclick={() => activeTab = 'company'}>Фирмени данни</button>
	<button class="tab" class:active={activeTab === 'categories'} onclick={() => activeTab = 'categories'}>Категории разходи</button>
	<a href="/audit" class="tab">Одит лог</a>
</div>

{#if activeTab === 'company'}
	{#if (form as any)?.companyError}
		<div class="alert danger" style="margin-bottom:12px;">{(form as any).companyError}</div>
	{/if}
	{#if (form as any)?.companySuccess}
		<div class="alert success" style="margin-bottom:12px;">Настройките на фирмата са обновени.</div>
	{/if}

	<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
		<!-- Legal data -->
		<div class="card">
			<div class="card-header"><h3 class="card-title">Юридически данни</h3></div>
			<form method="POST" action="?/updateCompany" style="padding:16px; display:flex; flex-direction:column; gap:12px;">
				<div class="field">
					<label class="label" for="legalName">Правно наименование</label>
					<input class="input" id="legalName" name="legalName" type="text"
						value={companyValue('legalName', data.company.legalName)} required />
					{#if companyFieldError('legalName')}<span style="font-size:11px; color:var(--danger);">{companyFieldError('legalName')}</span>{/if}
				</div>
				<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
					<div class="field">
						<label class="label" for="eikBulstat">ЕИК</label>
						<input class="input" id="eikBulstat" name="eikBulstat" type="text"
							style="font-family:var(--font-mono);"
							value={companyValue('eikBulstat', data.company.eikBulstat)} required />
						{#if companyFieldError('eikBulstat')}<span style="font-size:11px; color:var(--danger);">{companyFieldError('eikBulstat')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="vatNumber">ДДС номер</label>
						<input class="input" id="vatNumber" name="vatNumber" type="text"
							style="font-family:var(--font-mono);"
							value={companyValue('vatNumber', data.company.vatNumber ?? '')} />
						{#if companyFieldError('vatNumber')}<span style="font-size:11px; color:var(--danger);">{companyFieldError('vatNumber')}</span>{/if}
					</div>
				</div>
				<div class="field">
					<label class="label" for="registeredAddress">Адрес на регистрация</label>
					<input class="input" id="registeredAddress" name="registeredAddress" type="text"
						value={companyValue('registeredAddress', data.company.registeredAddress)} required />
					{#if companyFieldError('registeredAddress')}<span style="font-size:11px; color:var(--danger);">{companyFieldError('registeredAddress')}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="molName">МОЛ</label>
					<input class="input" id="molName" name="molName" type="text"
						value={companyValue('molName', data.company.molName)} required />
					{#if companyFieldError('molName')}<span style="font-size:11px; color:var(--danger);">{companyFieldError('molName')}</span>{/if}
				</div>

				<!-- Hidden billing fields so the single form still submits all required fields -->
				<input type="hidden" name="defaultPaymentTermDays" value={companyValue('defaultPaymentTermDays', data.company.defaultPaymentTermDays)} />
				<input type="hidden" name="invoiceNextNumber" value={companyValue('invoiceNextNumber', data.company.invoiceNextNumber)} />
				<input type="hidden" name="vatRatePercent" value={companyValue('vatRatePercent', data.company.vatRateBasisPoints / 100)} />
				{#if companyValue('vatRegistered', data.company.vatRegistered)}
					<input type="hidden" name="vatRegistered" value="on" />
				{/if}

				<div>
					<button type="submit" class="btn btn-primary btn-sm">Запази данните</button>
				</div>
			</form>
		</div>

		<!-- Billing settings -->
		<div class="card">
			<div class="card-header"><h3 class="card-title">Фактуриране</h3></div>
			<form method="POST" action="?/updateCompany" style="padding:16px; display:flex; flex-direction:column; gap:12px;">
				<!-- Hidden legal fields so the single action still gets all required fields -->
				<input type="hidden" name="legalName" value={companyValue('legalName', data.company.legalName)} />
				<input type="hidden" name="eikBulstat" value={companyValue('eikBulstat', data.company.eikBulstat)} />
				<input type="hidden" name="vatNumber" value={companyValue('vatNumber', data.company.vatNumber ?? '')} />
				<input type="hidden" name="registeredAddress" value={companyValue('registeredAddress', data.company.registeredAddress)} />
				<input type="hidden" name="molName" value={companyValue('molName', data.company.molName)} />

				<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
					<div class="field">
						<label class="label" for="invoiceNextNumber">Следващ номер фактура</label>
						<input class="input" id="invoiceNextNumber" name="invoiceNextNumber" type="number" min="1"
							style="font-family:var(--font-mono);"
							value={companyValue('invoiceNextNumber', data.company.invoiceNextNumber)} required />
						{#if companyFieldError('invoiceNextNumber')}<span style="font-size:11px; color:var(--danger);">{companyFieldError('invoiceNextNumber')}</span>{/if}
					</div>
					<div class="field">
						<label class="label" for="vatRatePercent">ДДС ставка (%)</label>
						<input class="input" id="vatRatePercent" name="vatRatePercent" type="number"
							min="0" max="100" step="0.01" style="font-family:var(--font-mono);"
							value={companyValue('vatRatePercent', data.company.vatRateBasisPoints / 100)} required />
						{#if companyFieldError('vatRatePercent')}<span style="font-size:11px; color:var(--danger);">{companyFieldError('vatRatePercent')}</span>{/if}
					</div>
				</div>
				<div class="field">
					<label class="label" for="defaultPaymentTermDays">Стандартен падеж (дни)</label>
					<input class="input" id="defaultPaymentTermDays" name="defaultPaymentTermDays"
						type="number" min="1" max="365" style="font-family:var(--font-mono);"
						value={companyValue('defaultPaymentTermDays', data.company.defaultPaymentTermDays)} required />
					{#if companyFieldError('defaultPaymentTermDays')}<span style="font-size:11px; color:var(--danger);">{companyFieldError('defaultPaymentTermDays')}</span>{/if}
				</div>
				<label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
					<input type="checkbox" name="vatRegistered"
						checked={Boolean(companyValue('vatRegistered', data.company.vatRegistered))} />
					<span>Фирмата е регистрирана по ДДС</span>
				</label>

				<div style="padding:10px 12px; background:var(--accent-subtle); border-radius:var(--r-md); font-size:12px; color:var(--accent); display:flex; gap:8px; align-items:flex-start;">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
					<span>Поредността е заключена. Промяна само от администратор и след одобрение в одит лог.</span>
				</div>

				<div>
					<button type="submit" class="btn btn-primary btn-sm">Запази настройките</button>
				</div>
			</form>
		</div>
	</div>

	{#if (form as any)?.balanceError}
		<div class="alert danger" style="margin-top:12px;">{(form as any).balanceError}</div>
	{/if}

	{#if data.moneyContainers.length > 0}
		<div class="card" style="margin-top:16px;">
			<div class="card-header">
				<div>
					<h3 class="card-title">Начални баланси</h3>
					<div class="card-sub">Начален баланс за банковата сметка и касата — изходна точка за паричния поток.</div>
				</div>
			</div>
			{#each data.moneyContainers as container}
				<div style="padding:14px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:16px;">
					<div style="flex:1;">
						<div style="font-size:13px; font-weight:500;">{container.name}</div>
						<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
							{container.containerType === 'bank' ? 'Банкова сметка' : 'Каса'}
						</div>
					</div>
					<form method="POST" action="?/updateContainerBalance" style="display:flex; gap:8px; align-items:center;">
						<input type="hidden" name="containerId" value={container.id} />
						<input
							class="input"
							name="openingBalance"
							type="number"
							step="0.01"
							value={(container.openingBalanceCents / 100).toFixed(2)}
							style="font-family:var(--font-mono); width:140px; text-align:right;"
						/>
						<span style="font-size:13px; color:var(--text-muted);">EUR</span>
						<button type="submit" class="btn btn-secondary btn-sm">Запази</button>
						{#if (form as any)?.balanceSuccess === container.id}
							<span style="font-size:12px; color:var(--success);">✓</span>
						{/if}
					</form>
				</div>
			{/each}
		</div>
	{/if}

	{#if data.internalClient}
		<div class="card" style="margin-top:16px;">
			<div class="card-header">
				<div>
					<h3 class="card-title">Вътрешен клиент</h3>
					<div class="card-sub">Системният клиент за вътрешни проекти се поддържа автоматично.</div>
				</div>
				<span class="badge outline" style="font-size:10px;">Защитен</span>
			</div>
			<div style="padding:12px 16px; display:grid; grid-template-columns:repeat(3,1fr); gap:16px;">
				<div>
					<div style="font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-family:var(--font-mono); margin-bottom:4px;">Наименование</div>
					<div style="font-size:13px; font-weight:500;">{data.internalClient.legalName}</div>
				</div>
				<div>
					<div style="font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-family:var(--font-mono); margin-bottom:4px;">Статус</div>
					<div style="font-size:13px; font-weight:500;">{data.internalClient.status === 'active' ? 'Активен' : 'Неактивен'}</div>
				</div>
				<div>
					<div style="font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-family:var(--font-mono); margin-bottom:4px;">Проекти</div>
					<div style="font-size:13px; font-weight:500;">{data.internalClient._count.projects}</div>
				</div>
			</div>
		</div>
	{/if}
{/if}

{#if activeTab === 'categories'}
	{#if (form as any)?.categoryError}
		<div class="alert danger" style="margin-bottom:12px;">{(form as any).categoryError}</div>
	{/if}
	{#if (form as any)?.categorySuccess}
		<div class="alert success" style="margin-bottom:12px;">Категорията е добавена.</div>
	{/if}

	<div class="card">
		<div class="card-header">
			<div>
				<h3 class="card-title">Категории разходи</h3>
				<div class="card-sub">Добавяйте или деактивирайте категории за разходи.</div>
			</div>
		</div>
		<div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; gap:8px; align-items:flex-end;">
			<form method="POST" action="?/addExpenseCategory" style="display:flex; gap:8px; align-items:flex-end; flex:1;">
				<div class="field" style="flex:1; margin:0;">
					<label class="label" for="catName">Нова категория</label>
					<input class="input" id="catName" name="name" type="text"
						value={categoryValue('name')} placeholder="напр. Офис консумативи" required />
					{#if categoryFieldError('name')}<span style="font-size:11px; color:var(--danger);">{categoryFieldError('name')}</span>{/if}
				</div>
				<button type="submit" class="btn btn-primary btn-sm">Добави</button>
			</form>
		</div>
		<table class="tbl">
			<thead>
				<tr>
					<th>Категория</th>
					<th>Статус</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.expenseCategories as category}
					<tr style={!category.isActive ? 'opacity:0.5;' : ''}>
						<td style="font-size:13px;">{category.name}</td>
						<td>
							{#if category.isActive}
								<span class="badge task-done"><span class="badge-dot"></span>Активна</span>
							{:else}
								<span class="badge outline">Неактивна</span>
							{/if}
						</td>
						<td style="text-align:right;">
							<form method="POST" action="?/toggleExpenseCategory" style="display:inline;">
								<input type="hidden" name="categoryId" value={category.id} />
								<input type="hidden" name="isActive" value={category.isActive ? 'false' : 'true'} />
								<button type="submit" class="btn btn-ghost btn-sm">
									{category.isActive ? 'Деактивирай' : 'Активирай'}
								</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
