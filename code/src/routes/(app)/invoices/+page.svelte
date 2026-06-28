<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import Icon from '$lib/components/Icon.svelte';
	import { fmtDate } from '$lib/utils/format';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let activeInvoiceId = $state<string | null>(null);
	let filterStatus = $derived(data.filters.status);

	// Merge drafts into the single table. Drafts go first when no status filter is active.
	const allInvoices = $derived(() => {
		if (filterStatus === 'draft') return data.drafts as typeof data.drafts;
		if (filterStatus && filterStatus !== 'draft') return data.issuedInvoices as typeof data.issuedInvoices;
		return [...data.drafts, ...data.issuedInvoices] as Array<typeof data.drafts[number] | typeof data.issuedInvoices[number]>;
	});

	function draftFormState() {
		return form as { draftId?: string; draftError?: string; draftSuccess?: string } | null;
	}

	function paymentFormState() {
		return form as {
			paymentInvoiceId?: string; paymentError?: string; paymentSuccess?: string;
			paymentMethodInvoiceId?: string; paymentMethodError?: string; paymentMethodSuccess?: string;
		} | null;
	}

	function fmtMoney(cents: number) {
		return (cents / 100).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function dateInputValue(value: string | Date | null) {
		if (!value) return '';
		return new Date(value).toISOString().slice(0, 10);
	}

	function lineAmount(sel: { hourlyUninvoicedValueCents: number | null; flatFeeValueCents: number | null }) {
		return sel.hourlyUninvoicedValueCents ?? sel.flatFeeValueCents ?? 0;
	}

	const statusLabels: Record<string, string> = {
		issued: 'Издадена', partially_paid: 'Частично', paid: 'Платена',
		overdue: 'Просрочена', draft: 'Чернова', voided: 'Анулирана'
	};

	function statusBadgeClass(status: string) {
		const map: Record<string, string> = {
			draft: 'inv-draft', issued: 'inv-issued', paid: 'inv-paid',
			overdue: 'inv-overdue', partially_paid: 'inv-partial', voided: 'inv-voided'
		};
		return map[status] ?? 'outline';
	}

	function paymentMethodLabel(method: string) {
		return method === 'cash' ? 'В брой' : 'Банков превод';
	}

	function isFinanceUser() {
		return data.user?.role === 'admin' || data.user?.role === 'accountant';
	}

	function todayInputValue() {
		return new Date().toISOString().slice(0, 10);
	}

	const overdueCount = $derived(data.issuedInvoices.filter((i: any) => i.status === 'overdue').length);
	const draftCount = $derived(data.drafts.length);
	const issuedCount = $derived(data.issuedInvoices.filter((i: any) => i.status === 'issued').length);
	const paidCount = $derived(data.issuedInvoices.filter((i: any) => i.status === 'paid').length);
	const totalCount = $derived(draftCount + data.issuedInvoices.length);
</script>

<svelte:head>
	<title>Фактури – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Фактури</h1>
		<p class="page-sub">{totalCount} фактури · {overdueCount > 0 ? `${overdueCount} просрочени` : 'без просрочени'}</p>
	</div>
	<div class="page-header-actions">
		<form method="POST" action="?/createManualDraft" class="row gap-2">
			<select class="select" name="clientId" required style="width:190px;">
				<option value="">Клиент</option>
				{#each data.clients as client}
					<option value={client.id} selected={(form as any)?.manualDraftClientId === client.id}>{client.legalName}</option>
				{/each}
			</select>
			<button type="submit" class="btn btn-primary btn-sm"><Icon name="plus" size={13}/>Ръчна</button>
		</form>
		<a href="/invoiceable-work" class="btn btn-secondary btn-sm"><Icon name="plus" size={13}/>Нова фактура</a>
	</div>
</div>

<!-- Global alerts -->
{#if (form as any)?.manualDraftError}
	<div class="alert danger" style="margin-bottom:12px;">{(form as any).manualDraftError}</div>
{/if}
{#if data.draftCreated}
	<div class="alert warning" style="margin-bottom:12px;">Черновата е създадена успешно.</div>
{/if}
{#if data.issuedInvoiceId}
	<div class="alert warning" style="margin-bottom:12px;">
		Фактурата е издадена.
		<a href="/invoices/{data.issuedInvoiceId}" style="font-weight:600;">Отвори</a>
	</div>
{/if}

<!-- Invoices table -->
<div class="row-between" style="margin-bottom:12px;">
	<div class="chip-group">
		<a href="/invoices" class="chip {filterStatus === '' ? 'active' : ''}">Всички · {totalCount}</a>
		<a href="/invoices?status=draft" class="chip {filterStatus === 'draft' ? 'active' : ''}">Чернови · {draftCount}</a>
		<a href="/invoices?status=issued" class="chip {filterStatus === 'issued' ? 'active' : ''}">Издадени · {issuedCount}</a>
		<a href="/invoices?status=paid" class="chip {filterStatus === 'paid' ? 'active' : ''}">Платени · {paidCount}</a>
		<a href="/invoices?status=overdue" class="chip {filterStatus === 'overdue' ? 'active' : ''}">Просрочени · {overdueCount}</a>
	</div>
	<form method="GET" class="row gap-2">
		<select class="select" name="clientId" style="width:180px;">
			<option value="">Всички клиенти</option>
			{#each data.clients as client}
				<option value={client.id} selected={data.filters.clientId === client.id}>{client.legalName}</option>
			{/each}
		</select>
		<input class="input" type="date" name="dateFrom" value={data.filters.dateFrom} style="width:130px;" />
		<input class="input" type="date" name="dateTo" value={data.filters.dateTo} style="width:130px;" />
		<button type="submit" class="btn btn-secondary btn-sm">Приложи</button>
	</form>
</div>

<div class="card">
	<table class="tbl">
		<thead>
			<tr>
				<th>Номер</th>
				<th>Клиент</th>
				<th>Дата</th>
				<th>Падеж</th>
				<th class="num">Без ДДС</th>
				<th class="num">ДДС</th>
				<th class="num">Общо</th>
				<th>Статус</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each allInvoices() as invoice}
				{@const inv = invoice as any}
				{@const isDraft = inv.status === 'draft'}
				<tr class={inv.status === 'overdue' ? 'highlight-amber' : (isDraft ? 'row-draft' : '')}>
					<td class="amount" style="font-weight:{isDraft ? 400 : 500};">
						<a href="/invoices/{inv.id}" style="color:inherit;">{inv.invoiceNumber ?? 'Без номер'}</a>
					</td>
					<td>{inv.client.legalName}</td>
					<td class="amount muted">{isDraft ? '—' : fmtDate(inv.issueDate)}</td>
					<td class="amount muted">{isDraft ? '—' : fmtDate(inv.dueDate)}</td>
					<td class="num muted">{fmtMoney(inv.netTotalCents)}</td>
					<td class="num muted">{fmtMoney(inv.vatTotalCents)}</td>
					<td class="num" style="font-weight:500;">{fmtMoney(inv.grossTotalCents)}</td>
					<td>
						<span class="badge {statusBadgeClass(inv.status)}">{statusLabels[inv.status] ?? inv.status}</span>
					</td>
					<td>
						{#if isDraft}
							<a href="/invoices/{inv.id}" class="topbar-icon-btn" title="Редактирай чернова">
								<Icon name="edit" size={13}/>
							</a>
						{:else}
							<button class="topbar-icon-btn" onclick={() => (activeInvoiceId = activeInvoiceId === inv.id ? null : inv.id)}>
								<Icon name={activeInvoiceId === inv.id ? 'chevron-down' : 'more'} size={13}/>
							</button>
						{/if}
					</td>
				</tr>

				{#if !isDraft && activeInvoiceId === inv.id}
					<tr>
						<td colspan="9" style="padding:0; background:var(--surface);">
							<div style="padding:16px; border-top:1px solid var(--border);">
								<!-- Payment info -->
								{#if inv.payments && inv.payments.length > 0}
									<div style="margin-bottom:12px;">
										<div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; font-family:var(--font-mono); color:var(--text-muted); margin-bottom:8px;">Плащания</div>
										{#each inv.payments as payment}
											<div class="row gap-3" style="font-size:12px; padding:4px 0;">
												<span class="amount muted">{fmtDate(payment.paymentDate)}</span>
												<span>{paymentMethodLabel(payment.paymentMethod)}</span>
												{#if payment.notes}<span class="muted">{payment.notes}</span>{/if}
												<span class="amount" style="font-weight:500; margin-left:auto;">{fmtMoney(payment.amountCents)} {data.company.currency}</span>
											</div>
										{/each}
									</div>
								{/if}

								<!-- Record payment form -->
								{#if isFinanceUser() && (inv.status === 'issued' || inv.status === 'partially_paid')}
									{#if paymentFormState()?.paymentInvoiceId === inv.id && paymentFormState()?.paymentError}
										<div class="alert danger" style="margin-bottom:8px;">{paymentFormState()?.paymentError}</div>
									{/if}
									<form method="POST" action="?/recordPayment">
										<input type="hidden" name="invoiceId" value={inv.id} />
										<div style="display:grid; grid-template-columns:160px 160px 160px 1fr auto; gap:10px; align-items:end;">
											<div class="field" style="margin:0;">
												<label class="label" for="amount-{inv.id}">Сума ({data.company.currency})</label>
												<input class="input" id="amount-{inv.id}" name="amount" type="number" min="0.01" step="0.01" required />
											</div>
											<div class="field" style="margin:0;">
												<label class="label" for="payDate-{inv.id}">Дата</label>
												<input class="input" id="payDate-{inv.id}" name="paymentDate" type="date" value={todayInputValue()} required />
											</div>
											<div class="field" style="margin:0;">
												<label class="label" for="payMethod-{inv.id}">Метод</label>
												<select class="select" id="payMethod-{inv.id}" name="paymentMethod">
													<option value="bank_transfer" selected={inv.paymentMethod === 'bank_transfer'}>Банков превод</option>
													<option value="cash" selected={inv.paymentMethod === 'cash'}>В брой</option>
												</select>
											</div>
											<div class="field" style="margin:0;">
												<label class="label" for="notes-{inv.id}">Бележки</label>
												<input class="input" id="notes-{inv.id}" name="notes" type="text" placeholder="По желание" />
											</div>
											<button type="submit" class="btn btn-primary btn-sm" style="align-self:end;">
												<Icon name="check" size={13}/>Запиши плащане
											</button>
										</div>
									</form>
								{/if}

								<div class="row gap-2" style="margin-top:12px;">
									<a href="/invoices/{inv.id}" class="btn btn-secondary btn-sm">Детайли</a>
									<button class="btn btn-ghost btn-sm" onclick={() => (activeInvoiceId = null)}>Затвори</button>
								</div>
							</div>
						</td>
					</tr>
				{/if}
			{:else}
				<tr>
					<td colspan="9" class="muted" style="text-align:center; padding:24px;">Няма фактури.</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
