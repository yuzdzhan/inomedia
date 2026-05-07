<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import Icon from '$lib/components/Icon.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let activeInvoiceId = $state<string | null>(null);
	let filterStatus = $state((data.filters as any)?.status ?? '');

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

	function fmtDate(value: string | Date | null) {
		if (!value) return '—';
		return new Intl.DateTimeFormat('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
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
		return (data as any).user?.role === 'admin' || (data as any).user?.role === 'accountant';
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
		<a href="/invoiceable-work" class="btn btn-secondary btn-sm"><Icon name="plus" size={13}/>Нова фактура</a>
	</div>
</div>

<!-- Global alerts -->
{#if data.draftCreated}
	<div class="alert warning" style="margin-bottom:12px;">Черновата е създадена успешно.</div>
{/if}
{#if data.issuedInvoiceId}
	<div class="alert warning" style="margin-bottom:12px;">
		Фактурата е издадена.
		<a href="/invoices/{data.issuedInvoiceId}" style="font-weight:600;">Отвори</a>
	</div>
{/if}

<!-- Drafts section -->
{#if data.drafts.length > 0}
	<div style="margin-bottom:24px;">
		<div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; font-family:var(--font-mono); color:var(--text-muted); margin-bottom:12px;">
			Чернови · {data.drafts.length}
		</div>
		<div class="col gap-3">
			{#each data.drafts as draft}
				<div class="card">
					<div class="card-header">
						<div>
							<div class="row gap-2" style="margin-bottom:4px;">
								<span class="badge inv-draft">Чернова</span>
								{#if draft.isStaleDraft}
									<span class="badge inv-partial">Остарял</span>
								{/if}
							</div>
							<h3 class="card-title">{draft.client.legalName}</h3>
							<div class="card-sub">Създадена от {draft.createdByUser.firstName} {draft.createdByUser.lastName} · {fmtDate(draft.lastUpdatedAt)}</div>
						</div>
						<div class="col" style="align-items:flex-end;">
							<span class="amount" style="font-size:18px; font-weight:600;">{fmtMoney(draft.grossTotalCents)} {data.company.currency}</span>
							<span class="muted" style="font-size:11px;">{draft.taskSelections.length} реда</span>
						</div>
					</div>

					{#if draftFormState()?.draftId === draft.id && draftFormState()?.draftError}
						<div class="alert danger" style="margin:0 16px 12px;">{draftFormState()?.draftError}</div>
					{/if}

					<form method="POST" style="padding:0 16px 16px;">
						<input type="hidden" name="invoiceId" value={draft.id} />

						<div style="display:grid; grid-template-columns:160px 160px 160px 1fr; gap:12px; margin-bottom:16px;">
							<div class="field">
								<label class="label" for="servicePeriodFrom-{draft.id}">Период от</label>
								<input class="input" id="servicePeriodFrom-{draft.id}" name="servicePeriodFrom" type="date" value={dateInputValue(draft.servicePeriodFrom)} />
							</div>
							<div class="field">
								<label class="label" for="servicePeriodTo-{draft.id}">Период до</label>
								<input class="input" id="servicePeriodTo-{draft.id}" name="servicePeriodTo" type="date" value={dateInputValue(draft.servicePeriodTo)} />
							</div>
							<div class="field">
								<label class="label" for="dueDate-{draft.id}">Падеж</label>
								<input class="input" id="dueDate-{draft.id}" name="dueDate" type="date" value={dateInputValue(draft.dueDate)} />
							</div>
							<div style="display:flex; gap:24px; align-items:flex-end; padding-bottom:2px;">
								<div>
									<div class="muted" style="font-size:11px; margin-bottom:2px;">Без ДДС</div>
									<div class="amount" style="font-weight:500;">{fmtMoney(draft.netTotalCents)}</div>
								</div>
								<div>
									<div class="muted" style="font-size:11px; margin-bottom:2px;">ДДС {(draft.vatRateBasisPoints / 100).toFixed(0)}%</div>
									<div class="amount" style="font-weight:500;">{fmtMoney(draft.vatTotalCents)}</div>
								</div>
								<div>
									<div class="muted" style="font-size:11px; margin-bottom:2px;">Общо</div>
									<div class="amount" style="font-size:16px; font-weight:600;">{fmtMoney(draft.grossTotalCents)}</div>
								</div>
							</div>
						</div>

						<!-- Task selections -->
						<div style="border:1px solid var(--border); border-radius:var(--r-md); overflow:hidden; margin-bottom:16px;">
							{#each draft.taskSelections as sel, idx}
								<div style="padding:10px 14px; border-top:{idx > 0 ? '1px solid var(--border-soft)' : 'none'};">
									<div class="row-between" style="margin-bottom:6px;">
										<span style="font-weight:500; font-size:13px;">{sel.task.title}</span>
										<span class="amount" style="font-weight:500;">{fmtMoney(lineAmount(sel))}</span>
									</div>
									<div class="muted" style="font-size:12px; margin-bottom:6px;">{sel.task.taskList.project.name}</div>
									<div class="field" style="margin:0;">
										<label class="label" for="desc-{sel.id}" style="font-size:10px;">Описание на реда</label>
										<textarea class="input" id="desc-{sel.id}" name="description:{sel.id}" rows="2" style="font-size:12px; resize:none;">{sel.description}</textarea>
									</div>
								</div>
							{/each}
						</div>

						<div class="row gap-2">
							<button class="btn btn-primary btn-sm" type="submit" formaction="?/issueDraft">
								<Icon name="check" size={13}/>Издай фактура
							</button>
							<button class="btn btn-secondary btn-sm" type="submit" formaction="?/saveDraft">Запази</button>
							<button class="btn btn-ghost btn-sm" type="submit" formaction="?/recalculateDraft">
								<Icon name="refresh" size={13}/>Преизчисли
							</button>
						</div>
					</form>
				</div>
			{/each}
		</div>
	</div>
{/if}

<!-- Issued invoices table -->
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
				<option value={client.id} selected={(data.filters as any)?.clientId === client.id}>{client.legalName}</option>
			{/each}
		</select>
		<input class="input" type="date" name="dateFrom" value={(data.filters as any)?.dateFrom ?? ''} style="width:130px;" />
		<input class="input" type="date" name="dateTo" value={(data.filters as any)?.dateTo ?? ''} style="width:130px;" />
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
			{#each data.issuedInvoices as invoice}
				<tr class={invoice.status === 'overdue' ? 'highlight-amber' : ''}>
					<td class="amount" style="font-weight:{invoice.status === 'draft' ? 400 : 500};">
						<a href="/invoices/{invoice.id}" style="color:inherit;">{invoice.invoiceNumber ?? 'Без номер'}</a>
						{#if invoice.isStaleDraft}<Icon name="refresh" size={11}/>{/if}
					</td>
					<td>{invoice.client.legalName}</td>
					<td class="amount muted">{fmtDate(invoice.issueDate)}</td>
					<td class="amount muted">{fmtDate(invoice.dueDate)}</td>
					<td class="num muted">{fmtMoney(invoice.netTotalCents)}</td>
					<td class="num muted">{fmtMoney(invoice.vatTotalCents)}</td>
					<td class="num" style="font-weight:500;">{fmtMoney(invoice.grossTotalCents)}</td>
					<td>
						<span class="badge {statusBadgeClass(invoice.status)}">{statusLabels[invoice.status] ?? invoice.status}</span>
					</td>
					<td>
						<button class="topbar-icon-btn" onclick={() => (activeInvoiceId = activeInvoiceId === invoice.id ? null : invoice.id)}>
							<Icon name={activeInvoiceId === invoice.id ? 'chevron-down' : 'more'} size={13}/>
						</button>
					</td>
				</tr>

				{#if activeInvoiceId === invoice.id}
					<tr>
						<td colspan="9" style="padding:0; background:var(--surface);">
							<div style="padding:16px; border-top:1px solid var(--border);">
								<!-- Payment info -->
								{#if invoice.payments && invoice.payments.length > 0}
									<div style="margin-bottom:12px;">
										<div style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; font-family:var(--font-mono); color:var(--text-muted); margin-bottom:8px;">Плащания</div>
										{#each invoice.payments as payment}
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
								{#if isFinanceUser() && (invoice.status === 'issued' || invoice.status === 'partially_paid')}
									{#if paymentFormState()?.paymentInvoiceId === invoice.id && paymentFormState()?.paymentError}
										<div class="alert danger" style="margin-bottom:8px;">{paymentFormState()?.paymentError}</div>
									{/if}
									<form method="POST" action="?/recordPayment">
										<input type="hidden" name="invoiceId" value={invoice.id} />
										<div style="display:grid; grid-template-columns:160px 160px 160px 1fr auto; gap:10px; align-items:end;">
											<div class="field" style="margin:0;">
												<label class="label" for="amount-{invoice.id}">Сума ({data.company.currency})</label>
												<input class="input" id="amount-{invoice.id}" name="amount" type="number" min="0.01" step="0.01" required />
											</div>
											<div class="field" style="margin:0;">
												<label class="label" for="payDate-{invoice.id}">Дата</label>
												<input class="input" id="payDate-{invoice.id}" name="paymentDate" type="date" value={todayInputValue()} required />
											</div>
											<div class="field" style="margin:0;">
												<label class="label" for="payMethod-{invoice.id}">Метод</label>
												<select class="select" id="payMethod-{invoice.id}" name="paymentMethod">
													<option value="bank_transfer" selected={invoice.paymentMethod === 'bank_transfer'}>Банков превод</option>
													<option value="cash" selected={invoice.paymentMethod === 'cash'}>В брой</option>
												</select>
											</div>
											<div class="field" style="margin:0;">
												<label class="label" for="notes-{invoice.id}">Бележки</label>
												<input class="input" id="notes-{invoice.id}" name="notes" type="text" placeholder="По желание" />
											</div>
											<button type="submit" class="btn btn-primary btn-sm" style="align-self:end;">
												<Icon name="check" size={13}/>Запиши плащане
											</button>
										</div>
									</form>
								{/if}

								<div class="row gap-2" style="margin-top:12px;">
									<a href="/invoices/{invoice.id}" class="btn btn-secondary btn-sm">Детайли</a>
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
