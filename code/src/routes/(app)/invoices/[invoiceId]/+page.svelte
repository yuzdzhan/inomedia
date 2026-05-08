<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/Icon.svelte';

	let { data }: { data: PageData } = $props();

	// Build a unified view object — snapshot for issued invoices, live data for drafts
	const view = $derived(() => {
		const { invoice, company, snapshot } = data;
		if (snapshot) return { ...snapshot, issueDate: snapshot.issueDate as string | null };
		return {
			invoiceNumber: invoice.invoiceNumber ?? '—',
			issueDate: null as string | null,
			dueDate: invoice.dueDate ? fmtDate(invoice.dueDate) : null,
			servicePeriodFrom: invoice.servicePeriodFrom ? fmtDate(invoice.servicePeriodFrom) : null,
			servicePeriodTo: invoice.servicePeriodTo ? fmtDate(invoice.servicePeriodTo) : null,
			currency: company.currency,
			paymentMethod: invoice.paymentMethod,
			company: {
				legalName: company.legalName,
				registrationNumber: company.eikBulstat,
				vatNumber: company.vatNumber,
				address: company.registeredAddress,
				molName: company.molName
			},
			client: {
				legalName: invoice.client.legalName,
				registrationNumber: invoice.client.registrationNumber,
				vatNumber: invoice.client.vatNumber,
				address: invoice.client.billingAddress,
				molName: (invoice.client as Record<string, unknown>).mol as string | null ?? null
			},
			lines: invoice.taskSelections.map((sel: typeof invoice.taskSelections[number]) => ({
				description: sel.description,
				projectName: sel.task.taskList.project.name,
				amountCents: sel.hourlyUninvoicedValueCents ?? sel.flatFeeValueCents ?? 0
			})),
			netTotalCents: invoice.netTotalCents,
			vatTotalCents: invoice.vatTotalCents,
			grossTotalCents: invoice.grossTotalCents,
			vatRateBasisPoints: invoice.vatRateBasisPoints
		};
	});

	function fmtDate(value: string | Date | null) {
		if (!value) return '—';
		return new Intl.DateTimeFormat('bg-BG', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(value));
	}

	function fmtMoney(cents: number) {
		return (cents / 100).toLocaleString('bg-BG', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	function fmtPaymentMethod(method: string) {
		return method === 'cash' ? 'В брой' : 'Банков превод';
	}

	function fmtDateRange(from: string | null, to: string | null) {
		if (from && to) return `${from} – ${to}`;
		if (from) return from;
		if (to) return to;
		return '—';
	}

	const statusLabels: Record<string, string> = {
		issued: 'Издадена',
		partially_paid: 'Частично платена',
		paid: 'Платена',
		overdue: 'Просрочена',
		draft: 'Чернова',
		voided: 'Анулирана'
	};

	function statusClass(status: string) {
		const map: Record<string, string> = {
			draft: 'inv-draft',
			issued: 'inv-issued',
			paid: 'inv-paid',
			overdue: 'inv-overdue',
			partially_paid: 'inv-partial',
			voided: 'inv-voided'
		};
		return map[status] ?? '';
	}

	const invoice = $derived(data.invoice);
	const company = $derived(data.company);
	const hasPdf = $derived(invoice.status === 'issued' || invoice.status === 'paid' ||
		invoice.status === 'partially_paid' || invoice.status === 'overdue');
</script>

<svelte:head>
	<title>Фактура {invoice.invoiceNumber ?? 'Чернова'} – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<a href="/invoices" class="btn btn-ghost btn-sm" style="margin-bottom:6px;">
			<Icon name="chevron-left" size={13} />Фактури
		</a>
		<h1 class="page-title">
			{invoice.invoiceNumber ? `Фактура ${invoice.invoiceNumber}` : 'Чернова'}
		</h1>
		<p class="page-sub">
			<span class="badge {statusClass(invoice.status)}">{statusLabels[invoice.status] ?? invoice.status}</span>
			&nbsp;{invoice.client.legalName}
		</p>
	</div>
	<div class="page-header-actions">
		{#if invoice.status === 'draft'}
			<a href="/invoices/{invoice.id}/preview-pdf" target="_blank" class="btn btn-secondary btn-sm">
				<Icon name="file" size={13} />Преглед PDF
			</a>
		{/if}
		{#if hasPdf}
			<a href="/invoices/{invoice.id}/pdf" target="_blank" class="btn btn-primary btn-sm">
				<Icon name="download" size={13} />Изтегли PDF
			</a>
		{/if}
	</div>
</div>

<!-- Invoice document preview -->
<div class="inv-doc-wrap">
	<div class="inv-doc">

		<!-- ── Header ─────────────────────────────────────────────────────────── -->
		<div class="inv-header">
			<div class="inv-header-left">
				<div class="inv-title">ФАКТУРА</div>
				<div class="inv-number">{view().invoiceNumber}</div>
			</div>
			<div class="inv-header-right">
				<div class="inv-company-name">{view().company.legalName}</div>
				{#if view().company.vatNumber}
					<div class="inv-company-sub">ДДС: {view().company.vatNumber}</div>
				{:else if view().company.registrationNumber}
					<div class="inv-company-sub">ЕИК: {view().company.registrationNumber}</div>
				{/if}
			</div>
		</div>

		<!-- ── Metadata row ───────────────────────────────────────────────────── -->
		<div class="inv-meta">
			<div class="inv-meta-item">
				<div class="inv-meta-label">ДАТА НА ИЗДАВАНЕ</div>
				<div class="inv-meta-value">{view().issueDate ?? '—'}</div>
			</div>
			<div class="inv-meta-item">
				<div class="inv-meta-label">ПАДЕЖ</div>
				<div class="inv-meta-value">{view().dueDate ?? '—'}</div>
			</div>
			<div class="inv-meta-item">
				<div class="inv-meta-label">ПЕРИОД</div>
				<div class="inv-meta-value">{fmtDateRange(view().servicePeriodFrom, view().servicePeriodTo)}</div>
			</div>
			<div class="inv-meta-item">
				<div class="inv-meta-label">ПЛАЩАНЕ</div>
				<div class="inv-meta-value">{fmtPaymentMethod(view().paymentMethod)}</div>
			</div>
		</div>

		<div class="inv-divider"></div>

		<!-- ── Party columns ─────────────────────────────────────────────────── -->
		<div class="inv-parties">
			<div class="inv-party">
				<div class="inv-party-label">ДОСТАВЧИК</div>
				<div class="inv-party-name">{view().company.legalName}</div>
				{#if view().company.registrationNumber}
					<div class="inv-party-row"><span class="inv-party-key">ЕИК:</span> {view().company.registrationNumber}</div>
				{/if}
				{#if view().company.vatNumber}
					<div class="inv-party-row"><span class="inv-party-key">ДДС:</span> {view().company.vatNumber}</div>
				{/if}
				{#if view().company.address}
					<div class="inv-party-row"><span class="inv-party-key">Адрес:</span> {view().company.address}</div>
				{/if}
				{#if view().company.molName}
					<div class="inv-party-row"><span class="inv-party-key">МОЛ:</span> {view().company.molName}</div>
				{/if}
			</div>
			<div class="inv-party">
				<div class="inv-party-label">ПОЛУЧАТЕЛ</div>
				<div class="inv-party-name">{view().client.legalName}</div>
				{#if view().client.registrationNumber}
					<div class="inv-party-row"><span class="inv-party-key">ЕИК:</span> {view().client.registrationNumber}</div>
				{/if}
				{#if view().client.vatNumber}
					<div class="inv-party-row"><span class="inv-party-key">ДДС:</span> {view().client.vatNumber}</div>
				{/if}
				{#if view().client.address}
					<div class="inv-party-row"><span class="inv-party-key">Адрес:</span> {view().client.address}</div>
				{/if}
				{#if view().client.molName}
					<div class="inv-party-row"><span class="inv-party-key">МОЛ:</span> {view().client.molName}</div>
				{/if}
			</div>
		</div>

		<div class="inv-divider"></div>

		<!-- ── Line items table ──────────────────────────────────────────────── -->
		<table class="inv-table">
			<thead>
				<tr>
					<th class="inv-th inv-th-desc">ОПИСАНИЕ</th>
					<th class="inv-th inv-th-proj">ПРОЕКТ</th>
					<th class="inv-th inv-th-amt">СУМА</th>
				</tr>
			</thead>
			<tbody>
				{#each view().lines as line}
					<tr class="inv-tr">
						<td class="inv-td inv-td-desc">{line.description}</td>
						<td class="inv-td inv-td-proj">{line.projectName}</td>
						<td class="inv-td inv-td-amt">{fmtMoney(line.amountCents)} {view().currency}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<!-- ── Totals ────────────────────────────────────────────────────────── -->
		<div class="inv-totals">
			<div class="inv-totals-row">
				<span class="inv-totals-label">Нетна сума</span>
				<span class="inv-totals-value">{fmtMoney(view().netTotalCents)} {view().currency}</span>
			</div>
			<div class="inv-totals-row">
				<span class="inv-totals-label">ДДС ({(view().vatRateBasisPoints / 100).toFixed(0)}%)</span>
				<span class="inv-totals-value">{fmtMoney(view().vatTotalCents)} {view().currency}</span>
			</div>
			<div class="inv-totals-divider"></div>
			<div class="inv-totals-row inv-totals-grand">
				<span class="inv-totals-label">ОБЩО</span>
				<span class="inv-totals-value">{fmtMoney(view().grossTotalCents)} {view().currency}</span>
			</div>
		</div>

		<!-- ── Footer ────────────────────────────────────────────────────────── -->
		<div class="inv-footer">
			Документът е генериран и запазен като неизменима версия при издаване.
		</div>

	</div>
</div>

<!-- Payments panel (if any) -->
{#if invoice.payments && invoice.payments.length > 0}
	<div class="card" style="margin-top:20px; max-width:760px;">
		<div class="card-header">
			<h2 class="card-title">Плащания</h2>
		</div>
		<table class="tbl">
			<thead>
				<tr>
					<th>Дата</th>
					<th>Метод</th>
					<th>Бележки</th>
					<th class="num">Сума</th>
				</tr>
			</thead>
			<tbody>
				{#each invoice.payments as p}
					<tr>
						<td class="amount muted">{fmtDate(p.paymentDate)}</td>
						<td>{p.paymentMethod === 'cash' ? 'В брой' : 'Банков превод'}</td>
						<td class="muted">{p.notes ?? '—'}</td>
						<td class="num amount" style="font-weight:500;">{fmtMoney(p.amountCents)} {company.currency}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.inv-doc-wrap {
		background: var(--surface);
		border-radius: var(--r-lg);
		padding: 32px;
		max-width: 820px;
	}

	.inv-doc {
		background: #fff;
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		overflow: hidden;
		font-size: 13px;
		color: #1d1b20;
	}

	/* Header */
	.inv-header {
		background: #4f378a;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 20px 28px 18px;
		gap: 16px;
	}

	.inv-title {
		font-size: 20px;
		font-weight: 700;
		color: #fff;
		letter-spacing: 0.04em;
		line-height: 1.2;
	}
	.inv-number {
		font-size: 11px;
		color: #cdbfff;
		margin-top: 4px;
		font-variant-numeric: tabular-nums;
	}

	.inv-header-right {
		text-align: right;
		flex-shrink: 0;
	}
	.inv-company-name {
		font-size: 13px;
		font-weight: 600;
		color: #fff;
	}
	.inv-company-sub {
		font-size: 10px;
		color: #cdbfff;
		margin-top: 3px;
	}

	/* Metadata strip */
	.inv-meta {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0;
		padding: 16px 28px 14px;
		border-bottom: 1px solid #e5e7eb;
	}
	.inv-meta-label {
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: #6f7380;
		text-transform: uppercase;
		margin-bottom: 3px;
	}
	.inv-meta-value {
		font-size: 11px;
		color: #1d1b20;
		font-variant-numeric: tabular-nums;
	}

	/* Divider */
	.inv-divider {
		height: 1px;
		background: #e5e7eb;
		margin: 0 28px;
	}

	/* Party columns */
	.inv-parties {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
		padding: 18px 28px 20px;
	}
	.inv-party-label {
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #6f7380;
		margin-bottom: 6px;
	}
	.inv-party-name {
		font-size: 13px;
		font-weight: 600;
		color: #1d1b20;
		margin-bottom: 5px;
	}
	.inv-party-row {
		font-size: 11px;
		color: #1d1b20;
		line-height: 1.6;
	}
	.inv-party-key {
		color: #6f7380;
		font-size: 10px;
	}

	/* Table */
	.inv-table {
		width: 100%;
		border-collapse: collapse;
		margin: 0;
	}
	.inv-th {
		background: #f9fafb;
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #6f7380;
		padding: 8px 10px;
		text-align: left;
		border-top: 1px solid #e5e7eb;
		border-bottom: 1px solid #e5e7eb;
	}
	.inv-th-desc { width: 55%; padding-left: 28px; }
	.inv-th-proj { width: 25%; }
	.inv-th-amt  { width: 20%; text-align: right; padding-right: 28px; }

	.inv-tr:not(:last-child) td {
		border-bottom: 1px solid #f0f1f3;
	}

	.inv-td {
		padding: 10px 10px;
		font-size: 12px;
		vertical-align: top;
		line-height: 1.5;
	}
	.inv-td-desc { padding-left: 28px; }
	.inv-td-proj { color: #6f7380; }
	.inv-td-amt  {
		text-align: right;
		padding-right: 28px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* Totals */
	.inv-totals {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		padding: 16px 28px 20px;
		gap: 6px;
	}
	.inv-totals-row {
		display: flex;
		gap: 32px;
		align-items: baseline;
		min-width: 260px;
		justify-content: space-between;
	}
	.inv-totals-label {
		font-size: 11px;
		color: #6f7380;
	}
	.inv-totals-value {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: #1d1b20;
		text-align: right;
		min-width: 120px;
	}
	.inv-totals-divider {
		width: 260px;
		height: 1px;
		background: #e5e7eb;
		margin: 4px 0;
	}
	.inv-totals-grand .inv-totals-label {
		font-size: 13px;
		font-weight: 600;
		color: #1d1b20;
		letter-spacing: 0.04em;
	}
	.inv-totals-grand .inv-totals-value {
		font-size: 14px;
		font-weight: 700;
		color: #4f378a;
	}

	/* Footer */
	.inv-footer {
		border-top: 1px solid #e5e7eb;
		padding: 12px 28px;
		font-size: 9px;
		color: #9ca3af;
		font-style: italic;
	}
</style>
