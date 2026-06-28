<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import Icon from '$lib/components/Icon.svelte';
	import { fmtDate } from '$lib/utils/format';

	let { data, form }: { data: PageData; form: ActionData } = $props();

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
			projectGroups: (() => {
				const map = new Map<string, { tasks: { description: string; amountCents: number; hours: number | null }[]; netAmountCents: number }>();
				for (const sel of invoice.taskSelections) {
					const pn = sel.task.taskList.project.name;
					const amt = sel.hourlyUninvoicedValueCents ?? sel.flatFeeValueCents ?? 0;
					if (!map.has(pn)) map.set(pn, { tasks: [], netAmountCents: 0 });
					const g = map.get(pn)!;
					g.tasks.push({ description: sel.description, amountCents: amt, hours: hoursFromSelection(sel) });
					g.netAmountCents += amt;
				}
				return Array.from(map.entries()).map(([projectName, d]) => ({ projectName, tasks: d.tasks, netAmountCents: d.netAmountCents }));
			})(),
			customRows: invoice.customRows.map((r) => ({ description: r.description, amountCents: r.amountCents })),
			netTotalCents: invoice.netTotalCents,
			vatTotalCents: invoice.vatTotalCents,
			grossTotalCents: invoice.grossTotalCents,
			vatRateBasisPoints: invoice.vatRateBasisPoints
		};
	});

	function fmtMoney(cents: number) {
		return (cents / 100).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function currencySymbol(currency: string): string {
		const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', BGN: 'лв.' };
		return symbols[currency] ?? currency;
	}

	function fmtQty(hours: number | null | undefined): string {
		if (hours == null) return '1 бр.';
		const totalMinutes = Math.round(hours * 60);
		const hh = Math.floor(totalMinutes / 60);
		const mm = totalMinutes % 60;
		return mm === 0 ? `${hh} ч` : `${hh}ч ${mm}м`;
	}

	function taskUnitPrice(task: { amountCents: number; hours?: number | null }): number {
		if (task.hours != null && task.hours > 0) return Math.round(task.amountCents / task.hours);
		return task.amountCents;
	}

	function hoursFromSelection(sel: { snapshotJson: unknown; hourlyUninvoicedValueCents: number | null }): number | null {
		if (sel.hourlyUninvoicedValueCents === null) return null;
		if (!sel.snapshotJson || typeof sel.snapshotJson !== 'object' || Array.isArray(sel.snapshotJson)) return null;
		const snap = sel.snapshotJson as { timeLogs?: Array<{ durationMinutes?: number }> };
		const totalMinutes = (snap.timeLogs ?? []).reduce((s, t) => s + (t.durationMinutes ?? 0), 0);
		return totalMinutes > 0 ? totalMinutes / 60 : null;
	}

	const statusLabels: Record<string, string> = {
		issued: 'Издадена',
		partially_paid: 'Частично платена',
		paid: 'Платена',
		overdue: 'Просрочена',
		draft: 'Чернова',
		voided: 'Анулирана'
	};

	function docStatusClass(status: string) {
		const map: Record<string, string> = {
			draft: 'doc-badge-draft',
			issued: 'doc-badge-unpaid',
			partially_paid: 'doc-badge-partial',
			overdue: 'doc-badge-overdue',
			paid: 'doc-badge-paid',
			voided: 'doc-badge-voided'
		};
		return map[status] ?? 'doc-badge-unpaid';
	}

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
	const hasPdf = $derived(
		invoice.status === 'issued' ||
		invoice.status === 'paid' ||
		invoice.status === 'partially_paid' ||
		invoice.status === 'overdue'
	);
	const isDraft = $derived(invoice.status === 'draft');

	function dateVal(d: Date | string | null | undefined) {
		if (!d) return '';
		return new Date(d).toISOString().slice(0, 10);
	}

	function lineAmount(sel: { hourlyUninvoicedValueCents: number | null; flatFeeValueCents: number | null }) {
		return sel.hourlyUninvoicedValueCents ?? sel.flatFeeValueCents ?? 0;
	}
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
			<button class="btn btn-secondary btn-sm" onclick={() => window.print()}>
				<Icon name="printer" size={13} />Печат
			</button>
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

<!-- Draft management panel -->
{#if isDraft}
<div class="card draft-panel">
	<div class="card-header">
		<h2 class="card-title">Управление на чернова</h2>
		{#if (form as any)?.draftSuccess}
			<span style="font-size:12px; color:var(--success);">{(form as any).draftSuccess}</span>
		{/if}
	</div>
	{#if (form as any)?.draftError}
		<div class="alert danger" style="margin:0 16px 12px;">{(form as any).draftError}</div>
	{/if}
	<form method="POST" style="padding:16px;">
		<div style="display:grid; grid-template-columns:160px 160px 160px; gap:12px; margin-bottom:16px;">
			<div class="field">
				<label class="label" for="spFrom">Период от</label>
				<input class="input" id="spFrom" name="servicePeriodFrom" type="date" value={dateVal(invoice.servicePeriodFrom)} />
			</div>
			<div class="field">
				<label class="label" for="spTo">Период до</label>
				<input class="input" id="spTo" name="servicePeriodTo" type="date" value={dateVal(invoice.servicePeriodTo)} />
			</div>
			<div class="field">
				<label class="label" for="due">Падеж</label>
				<input class="input" id="due" name="dueDate" type="date" value={dateVal(invoice.dueDate)} />
			</div>
		</div>

		<!-- Task selections -->
		{#if invoice.taskSelections.length > 0}
		<div class="section-label">Работа по задачи</div>
		<div style="border:1px solid var(--border); border-radius:var(--r-md); overflow:hidden; margin-bottom:16px;">
			{#each invoice.taskSelections as sel, idx}
				<div style="padding:10px 14px; border-top:{idx > 0 ? '1px solid var(--border-soft)' : 'none'};">
					<div class="row-between" style="margin-bottom:6px;">
						<span style="font-weight:500; font-size:13px;">{sel.task.title}</span>
						<span class="amount" style="font-weight:500;">{fmtMoney(lineAmount(sel))} {company.currency}</span>
					</div>
					<div class="muted" style="font-size:12px; margin-bottom:6px;">{sel.task.taskList.project.name}</div>
					<div class="field" style="margin:0;">
						<label class="label" for="desc-{sel.id}" style="font-size:10px;">Описание на реда</label>
						<textarea class="input textarea" id="desc-{sel.id}" name="description:{sel.id}" rows="2" style="font-size:12px; resize:none;">{sel.description}</textarea>
					</div>
				</div>
			{/each}
		</div>
		{/if}

		<!-- Custom rows -->
		{#if invoice.customRows.length > 0}
		<div class="section-label">Допълнителни редове</div>
		<div style="border:1px solid var(--border); border-radius:var(--r-md); overflow:hidden; margin-bottom:16px;">
			{#each invoice.customRows as row, idx}
				<div style="padding:10px 14px; border-top:{idx > 0 ? '1px solid var(--border-soft)' : 'none'}; display:grid; grid-template-columns:1fr 120px auto; gap:10px; align-items:start;">
					<div class="field" style="margin:0;">
						<label class="label" for="crdesc-{row.id}" style="font-size:10px;">Описание</label>
						<textarea class="input textarea" id="crdesc-{row.id}" name="customRowDesc:{row.id}" rows="2" style="font-size:12px; resize:none;">{row.description}</textarea>
						{#if row.sourceExpenseId}
							<div class="muted" style="font-size:11px; margin-top:4px;">
								Ред от разход{row.sourceExpense?.category?.name ? ` · ${row.sourceExpense.category.name}` : ''}
								{#if row.sourceExpense?.incurredDate} · {fmtDate(row.sourceExpense.incurredDate)}{/if}
							</div>
						{/if}
					</div>
					<div class="field" style="margin:0;">
						<label class="label" for="cramount-{row.id}" style="font-size:10px;">Сума ({company.currency})</label>
						<input class="input" id="cramount-{row.id}" name="customRowAmount:{row.id}" type="number" min="0" step="0.01" value={(row.amountCents / 100).toFixed(2)} style="font-size:12px;" />
					</div>
					<div style="padding-top:18px;"></div>
				</div>
			{/each}
		</div>
		{/if}

		<div class="row gap-2" style="margin-bottom:16px;">
			<button class="btn btn-primary btn-sm" type="submit" formaction="?/issueDraft">
				<Icon name="check" size={13} />Издай фактура
			</button>
			<button class="btn btn-secondary btn-sm" type="submit" formaction="?/saveDraft">Запази</button>
			<button class="btn btn-ghost btn-sm" type="submit" formaction="?/recalculateDraft">
				<Icon name="refresh" size={13} />Преизчисли
			</button>
			<button class="btn btn-ghost btn-sm" type="submit" formaction="?/syncDraft">
				<Icon name="refresh" size={13} />Синхронизирай
			</button>
			<a href="/invoices/{invoice.id}/preview-pdf" target="_blank" class="btn btn-ghost btn-sm">
				<Icon name="file" size={13} />Регенерирай PDF
			</a>
		</div>
	</form>

	<!-- Custom rows: remove buttons and add form -->
	<div style="padding:0 16px 16px;">
		{#if invoice.customRows.length > 0}
			<div style="margin-bottom:12px;">
				{#each invoice.customRows as row}
					<form method="POST" action="?/removeCustomRow" style="display:inline; margin-right:8px;">
						<input type="hidden" name="rowId" value={row.id} />
						<button type="submit" class="btn btn-ghost btn-sm" style="font-size:11px; color:var(--text-muted);">
							<Icon name="trash" size={11} />Премахни «{row.description.length > 30 ? row.description.slice(0, 30) + '…' : row.description}»
						</button>
					</form>
				{/each}
			</div>
		{/if}

		<!-- Add custom row form -->
		<details style="margin-bottom:8px;">
			<summary class="btn btn-ghost btn-sm" style="cursor:pointer; list-style:none; display:inline-flex; align-items:center; gap:6px;">
				<Icon name="plus" size={13} />Добави ред
			</summary>
			<div style="margin-top:10px; padding:12px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md);">
				{#if (form as any)?.customRowError}
					<div class="alert danger" style="margin-bottom:8px;">{(form as any).customRowError}</div>
				{/if}
				<form method="POST" action="?/addCustomRow">
					<div style="display:grid; grid-template-columns:1fr 140px auto; gap:10px; align-items:end;">
						<div class="field" style="margin:0;">
							<label class="label" for="newRowDesc">Описание</label>
							<input class="input" id="newRowDesc" name="description" type="text" placeholder="напр. Лиценз за Adobe CC" required />
						</div>
						<div class="field" style="margin:0;">
							<label class="label" for="newRowAmount">Сума ({company.currency})</label>
							<input class="input" id="newRowAmount" name="amountCents" type="number" min="0" step="0.01" placeholder="0.00" required />
						</div>
						<button type="submit" class="btn btn-secondary btn-sm">Добави</button>
					</div>
				</form>
			</div>
		</details>

		<!-- Billable expenses -->
		{#if data.billableExpenses.length > 0}
			<div style="margin-top:12px;">
				<div class="section-label" style="margin-bottom:8px;">Таксуеми разходи на клиента</div>
				{#each data.billableExpenses as exp}
					<form method="POST" action="?/pullBillableExpense" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
						<input type="hidden" name="expenseId" value={exp.id} />
						<span style="flex:1; font-size:13px;">{exp.description}</span>
						<span class="amount muted" style="font-size:12px;">{fmtDate(exp.incurredDate)}</span>
						<span class="amount" style="font-size:13px; font-weight:500;">{fmtMoney(exp.amountCents)} {company.currency}</span>
						<button type="submit" class="btn btn-secondary btn-sm">
							<Icon name="plus" size={12} />Добави
						</button>
					</form>
				{/each}
			</div>
		{/if}
	</div>
</div>
{/if}

<!-- Invoice document snippet (rendered twice for issued: original + copy) -->
{#snippet invoiceDoc(label: string)}
<div class="inv-doc">

	<!-- 1. Header -->
	<header class="inv-header">
		<div class="inv-header-left">
			<h1 class="inv-company-name">{view().company.legalName}</h1>
			{#if company.email}<p class="inv-company-detail">{company.email}</p>{/if}
			{#if company.phone}<p class="inv-company-detail">{company.phone}</p>{/if}
			{#if company.website}<p class="inv-company-detail">{company.website}</p>{/if}
		</div>
		<div class="inv-header-right">
			<h2 class="inv-doc-title">ФАКТУРА</h2>
			<p class="inv-doc-subtitle">({label})</p>
			<div class="inv-meta-grid">
				<span class="inv-mk">Номер:</span>
				<span class="inv-mv">{view().invoiceNumber}</span>
				<span class="inv-mk">Дата:</span>
				<span class="inv-mv">{view().issueDate ?? '—'}</span>
				<span class="inv-mk">Падеж:</span>
				<span class="inv-mv">{view().dueDate ?? '—'}</span>
			</div>
			<div class="inv-doc-badge {docStatusClass(invoice.status)}">
				{statusLabels[invoice.status] ?? invoice.status}
			</div>
		</div>
	</header>

	<!-- 2. Legal Info Grid -->
	<div class="inv-legal">
		<div class="inv-party">
			<h3 class="inv-section-title">ДОСТАВЧИК</h3>
			<div class="inv-fields">
				<span class="inv-fk">Фирма:</span>
				<span class="inv-fv">{view().company.legalName}</span>
				{#if view().company.registrationNumber}
					<span class="inv-fk">ЕИК/БУЛСТАТ:</span>
					<span class="inv-fv inv-fv-num">{view().company.registrationNumber}</span>
				{/if}
				{#if view().company.vatNumber}
					<span class="inv-fk">ИН по ДДС:</span>
					<span class="inv-fv inv-fv-num">{view().company.vatNumber}</span>
				{/if}
				{#if view().company.address}
					<span class="inv-fk">Адрес:</span>
					<span class="inv-fv">{view().company.address}</span>
				{/if}
				{#if view().company.molName}
					<span class="inv-fk">МОЛ:</span>
					<span class="inv-fv">{view().company.molName}</span>
				{/if}
			</div>
		</div>
		<div class="inv-party">
			<h3 class="inv-section-title">КЛИЕНТ</h3>
			<div class="inv-fields">
				<span class="inv-fk">Фирма:</span>
				<span class="inv-fv inv-fv-bold">{view().client.legalName}</span>
				{#if view().client.registrationNumber}
					<span class="inv-fk">ЕИК/БУЛСТАТ:</span>
					<span class="inv-fv inv-fv-num">{view().client.registrationNumber}</span>
				{/if}
				{#if view().client.vatNumber}
					<span class="inv-fk">ИН по ДДС:</span>
					<span class="inv-fv inv-fv-num">{view().client.vatNumber}</span>
				{/if}
				{#if view().client.address}
					<span class="inv-fk">Адрес:</span>
					<span class="inv-fv">{view().client.address}</span>
				{/if}
				{#if view().client.molName}
					<span class="inv-fk">МОЛ:</span>
					<span class="inv-fv">{view().client.molName}</span>
				{/if}
			</div>
		</div>
	</div>

	<!-- 3. Items Table -->
	<div class="inv-table-wrap">
		<table class="inv-table">
			<thead>
				<tr>
					<th class="inv-th inv-th-num">№</th>
					<th class="inv-th">Описание</th>
					<th class="inv-th inv-th-uprice">Единична цена</th>
					<th class="inv-th inv-th-qty">Кол-во</th>
					<th class="inv-th inv-th-total">Цена</th>
				</tr>
			</thead>
			<tbody>
				{#each view().projectGroups as group, gi}
					<tr class="inv-tr inv-tr-project {gi % 2 === 0 ? 'inv-tr-surface' : 'inv-tr-alt'}">
						<td class="inv-td inv-td-num">{gi + 1}</td>
						<td class="inv-td inv-td-desc inv-td-project">{group.projectName}</td>
						<td class="inv-td"></td>
						<td class="inv-td"></td>
						<td class="inv-td inv-td-total">{fmtMoney(group.netAmountCents)} {currencySymbol(view().currency)}</td>
					</tr>
					{#each group.tasks as task}
						<tr class="inv-tr inv-tr-task">
							<td class="inv-td inv-td-num"></td>
							<td class="inv-td inv-td-desc inv-td-task-desc">{task.description}</td>
							<td class="inv-td inv-td-uprice inv-td-task-total">{fmtMoney(taskUnitPrice(task))} {currencySymbol(view().currency)}</td>
							<td class="inv-td inv-td-qty inv-td-task-total">{fmtQty(task.hours)}</td>
							<td class="inv-td inv-td-total inv-td-task-total">{fmtMoney(task.amountCents)} {currencySymbol(view().currency)}</td>
						</tr>
					{/each}
				{/each}
				{#each (view().customRows ?? []) as row, ci}
					{@const idx = view().projectGroups.length + ci}
					<tr class="inv-tr inv-tr-project {idx % 2 === 0 ? 'inv-tr-surface' : 'inv-tr-alt'}">
						<td class="inv-td inv-td-num">{idx + 1}</td>
						<td class="inv-td inv-td-desc inv-td-project">{row.description}</td>
						<td class="inv-td inv-td-uprice">{fmtMoney(row.amountCents)} {currencySymbol(view().currency)}</td>
						<td class="inv-td inv-td-qty">1 бр.</td>
						<td class="inv-td inv-td-total">{fmtMoney(row.amountCents)} {currencySymbol(view().currency)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- 4. Summary -->
	<div class="inv-summary-wrap">
		<div class="inv-summary">
			<div class="inv-sum-row inv-sum-sep">
				<span class="inv-sum-label">Данъчна основа:</span>
				<span class="inv-sum-val">{fmtMoney(view().netTotalCents)} {currencySymbol(view().currency)}</span>
			</div>
			<div class="inv-sum-row inv-sum-sep">
				<span class="inv-sum-label">ДДС {(view().vatRateBasisPoints / 100).toFixed(0)}%:</span>
				<span class="inv-sum-val">{fmtMoney(view().vatTotalCents)} {currencySymbol(view().currency)}</span>
			</div>
			<div class="inv-sum-grand">
				<span class="inv-sum-grand-label">Общо с ДДС:</span>
				<span class="inv-sum-grand-val">{fmtMoney(view().grossTotalCents)} {currencySymbol(view().currency)}</span>
			</div>
		</div>
	</div>

	<!-- 5. Footer -->
	<footer class="inv-footer">
		<div class="inv-bank">
			<div class="inv-bank-head">
				<h3 class="inv-bank-title">
					<svg class="inv-bank-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93V18c0-.55-.45-1-1-1s-1 .45-1 1v1.93C7.06 19.44 4.56 16.94 4.07 14H6c.55 0 1-.45 1-1s-.45-1-1-1H4.07C4.56 8.06 7.06 5.56 10 5.07V7c0 .55.45 1 1 1s1-.45 1-1V5.07C16.94 5.56 19.44 8.06 19.93 11H18c-.55 0-1 .45-1 1s.45 1 1 1h1.93c-.49 2.94-2.99 5.44-5.93 5.93z"/>
					</svg>
					ДАННИ ЗА ПЛАЩАНЕ
				</h3>
				<span class="inv-bank-subtitle">Платежно нареждане</span>
			</div>
			<div class="inv-bank-grid">
				{#if company.bankName}
				<div class="inv-bank-field">
					<span class="inv-bk">Банка</span>
					<span class="inv-bv">{company.bankName}</span>
				</div>
				{/if}
				{#if company.bankIban}
				<div class="inv-bank-field">
					<span class="inv-bk">IBAN</span>
					<span class="inv-bv inv-bv-iban">{company.bankIban}</span>
				</div>
				{/if}
				{#if company.bankBic}
				<div class="inv-bank-field">
					<span class="inv-bk">BIC/SWIFT</span>
					<span class="inv-bv">{company.bankBic}</span>
				</div>
				{/if}
				<div class="inv-bank-field">
					<span class="inv-bk">Получател</span>
					<span class="inv-bv">{view().company.legalName}</span>
				</div>
				<div class="inv-bank-field inv-bank-wide">
					<span class="inv-bk">Основание за плащане</span>
					<span class="inv-bv inv-bv-ref">Плащане по фактура №{view().invoiceNumber}</span>
				</div>
			</div>
			<div class="inv-bank-footer">
				<p>Моля използвайте посоченото основание за автоматична обработка.</p>
				{#if view().dueDate}<p>Краен срок: {view().dueDate}</p>{/if}
			</div>
		</div>
		<div class="inv-page-num">Страница 1 от 1</div>
	</footer>

</div>
{/snippet}

<!-- Invoice document preview -->
<div class="inv-wrap">
	{@render invoiceDoc(isDraft ? 'ЧЕРНОВА' : 'ОРИГИНАЛ')}
	{#if !isDraft}
		<div class="inv-copy-sep"></div>
		{@render invoiceDoc('КОПИЕ')}
	{/if}
</div>

<!-- Payments panel -->
{#if invoice.payments && invoice.payments.length > 0}
	<div class="card payments-section" style="margin-top:20px; max-width:820px;">
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
						<td class="num amount" style="font-weight:500;">{(p.amountCents / 100).toFixed(2)} {company.currency}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	/* ── Document wrapper ─────────────────────────────────────────────────── */
	.inv-wrap {
		max-width: 860px;
		background: #f3f4f6;
		border-radius: 8px;
		padding: 24px;
	}

	.inv-doc {
		background: #ffffff;
		border: 1px solid #E5E7EB;
		border-radius: 2px;
		padding: 20mm 15mm;
		font-family: 'Open Sans', sans-serif;
		color: #1d1b20;
		display: flex;
		flex-direction: column;
	}

	.inv-copy-sep {
		margin: 24px 0;
		border-top: 2px dashed #cbc4d2;
	}

	/* ── 1. Header ─────────────────────────────────────────────────────────── */
	.inv-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 32px;
		padding-bottom: 24px;
		border-bottom: 1px solid #E5E7EB;
	}

	.inv-header-left { width: 50%; }

	.inv-company-name {
		font-family: 'Montserrat', sans-serif;
		font-size: 18px;
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 24px;
		color: #4f378a;
		margin: 0 0 4px 0;
	}

	.inv-company-detail { font-size: 12px; line-height: 18px; color: #494551; margin: 0; }

	.inv-header-right { width: 50%; text-align: right; }

	.inv-doc-title {
		font-family: 'Montserrat', sans-serif;
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 32px;
		color: #334155;
		margin: 0 0 4px 0;
	}

	.inv-doc-subtitle {
		font-family: 'Montserrat', sans-serif;
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: #494551;
		text-transform: uppercase;
		margin: 0 0 8px 0;
	}

	.inv-meta-grid {
		display: grid;
		grid-template-columns: auto auto;
		gap: 4px 8px;
		justify-content: end;
		margin-bottom: 4px;
	}

	.inv-mk { font-family: 'Open Sans', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: #494551; text-align: right; }
	.inv-mv { font-family: 'Open Sans', sans-serif; font-size: 13px; font-weight: 600; color: #1d1b20; text-align: right; font-variant-numeric: tabular-nums; }

	.inv-doc-badge {
		display: inline-block;
		margin-top: 16px;
		padding: 4px 8px;
		border-radius: 2px;
		font-family: 'Open Sans', sans-serif;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.doc-badge-unpaid   { background: #c9a74d; color: #503d00; }
	.doc-badge-draft    { background: #f2ecf4; color: #4f378a; }
	.doc-badge-partial  { background: #fed7aa; color: #7c2d12; }
	.doc-badge-overdue  { background: #fee2e2; color: #7f1d1d; }
	.doc-badge-paid     { background: #dcfce7; color: #15803d; }
	.doc-badge-voided   { background: #e5e7eb; color: #374151; }

	/* ── 2. Legal Info Grid ────────────────────────────────────────────────── */
	.inv-legal {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
		margin-bottom: 32px;
	}

	.inv-section-title {
		font-family: 'Montserrat', sans-serif;
		font-size: 14px;
		font-weight: 600;
		line-height: 20px;
		color: #334155;
		border-bottom: 1px solid #E5E7EB;
		padding-bottom: 4px;
		margin: 0 0 8px 0;
	}

	.inv-fields {
		display: grid;
		grid-template-columns: 100px 1fr;
		gap: 4px 0;
		font-size: 12px;
		line-height: 18px;
	}

	.inv-fk { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: #494551; padding-right: 8px; }
	.inv-fv        { color: #1d1b20; }
	.inv-fv-num    { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
	.inv-fv-bold   { font-weight: 600; }

	/* ── 3. Items Table ─────────────────────────────────────────────────────── */
	.inv-table-wrap { margin-bottom: 32px; flex-grow: 1; }
	.inv-table { width: 100%; border-collapse: collapse; }

	.inv-th {
		background: #F9FAFB;
		font-family: 'Open Sans', sans-serif;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.02em;
		color: #494551;
		padding: 8px;
		text-align: left;
		border-top: 1px solid #E5E7EB;
		border-bottom: 1px solid #E5E7EB;
	}

	.inv-th-num    { width: 36px; text-align: center; }
	.inv-th-uprice { width: 110px; text-align: right; }
	.inv-th-qty    { width: 80px; text-align: right; }
	.inv-th-total  { width: 110px; text-align: right; }

	.inv-tr { border-bottom: 1px solid #ece6ee; }
	.inv-tr-alt     { background: #f8f2fa; }
	.inv-tr-surface { background: #ece6ee; }

	.inv-td {
		font-family: 'Open Sans', sans-serif;
		font-size: 12px;
		line-height: 18px;
		color: #1d1b20;
		padding: 8px;
		vertical-align: top;
	}

	.inv-td-num    { text-align: center; }
	.inv-td-uprice { text-align: right; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.inv-td-qty    { text-align: right; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.inv-td-total  { text-align: right; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

	.inv-td-project   { font-weight: 600; }
	.inv-td-task-desc { font-size: 11px; color: #494551; padding-top: 4px; padding-bottom: 4px; padding-left: 20px; }
	.inv-td-task-total { font-size: 11px; font-weight: 400; color: #494551; padding-top: 4px; padding-bottom: 4px; }

	/* ── 4. Summary ─────────────────────────────────────────────────────────── */
	.inv-summary-wrap { display: flex; justify-content: flex-end; margin-bottom: 32px; }
	.inv-summary { width: 300px; font-family: 'Open Sans', sans-serif; }

	.inv-sum-row { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0; }
	.inv-sum-sep { border-bottom: 1px solid #E5E7EB; }
	.inv-sum-label { font-size: 12px; color: #494551; }
	.inv-sum-val   { font-size: 13px; font-weight: 600; color: #1d1b20; font-variant-numeric: tabular-nums; }

	.inv-sum-grand { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; margin-top: 4px; }
	.inv-sum-grand-label { font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; color: #334155; }
	.inv-sum-grand-val   { font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; color: #334155; font-variant-numeric: tabular-nums; }

	/* ── 5. Footer ──────────────────────────────────────────────────────────── */
	.inv-footer { margin-top: auto; padding-top: 24px; border-top: 1px solid #E5E7EB; }

	.inv-bank {
		background: #f8f2fa;
		border: 2px dashed #cbc4d2;
		border-radius: 2px;
		padding: 16px;
		margin-bottom: 24px;
	}

	.inv-bank-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }

	.inv-bank-title {
		font-family: 'Montserrat', sans-serif;
		font-size: 14px;
		font-weight: 600;
		color: #334155;
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
	}

	.inv-bank-icon { width: 18px; height: 18px; color: #334155; flex-shrink: 0; }
	.inv-bank-subtitle { font-size: 10px; font-weight: 700; letter-spacing: 0.02em; color: #494551; }

	.inv-bank-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px 32px; font-size: 12px; }
	.inv-bank-field { display: flex; flex-direction: column; gap: 2px; }
	.inv-bank-wide { grid-column: span 2; }

	.inv-bk { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: #494551; text-transform: uppercase; }
	.inv-bv { font-weight: 600; color: #1d1b20; }
	.inv-bv-iban { font-size: 13px; font-weight: 700; color: #4f378a; font-variant-numeric: tabular-nums; }
	.inv-bv-ref { background: #f2ecf4; padding: 2px 8px; border-radius: 2px; font-weight: 600; }

	.inv-bank-footer {
		margin-top: 12px;
		padding-top: 8px;
		border-top: 1px dotted #cbc4d2;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 10px;
		color: #494551;
		font-style: italic;
	}

	.inv-bank-footer p { margin: 0; }
	.inv-page-num { text-align: right; font-size: 10px; color: #494551; }

	/* ── Draft panel ─────────────────────────────────────────────────────────── */
	.draft-panel { max-width: 860px; margin-bottom: 20px; }
	.draft-panel .textarea { height: auto; padding: 6px 10px; min-height: 52px; }

	.section-label {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin-bottom: 8px;
		font-family: var(--font-mono);
	}

	@media print {
		:global(.sidebar),
		:global(.topbar),
		:global(.page-header),
		:global(.payments-section) { display: none !important; }

		.draft-panel { display: none; }

		:global(.app-shell) { display: block !important; }
		:global(.main)    { display: block !important; overflow: visible !important; }
		:global(.content) { padding: 0 !important; overflow: visible !important; }

		.inv-wrap { background: white; padding: 0; max-width: none; border-radius: 0; }
		.inv-doc  { border: none; box-shadow: none; }
		.inv-copy-sep { page-break-after: always; border: none; margin: 0; }
	}
</style>
