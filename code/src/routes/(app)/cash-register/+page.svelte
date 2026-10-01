<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { fmtDate as formatDate } from '$lib/utils/format';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let saving = $state(false);

	function formatAmount(cents: number): string {
		const sign = cents < 0 ? '-' : '';
		return `${sign}${(Math.abs(cents) / 100).toFixed(2)} EUR`;
	}

	// Default to the previous month.
	const now = new Date();
	const prevFirst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
	const prevLast = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
	const iso = (d: Date) => d.toISOString().slice(0, 10);

	const groups = [
		{ key: 'A', label: 'А', rate: '0%' },
		{ key: 'B', label: 'Б', rate: '20%' },
		{ key: 'V', label: 'В', rate: '20%' },
		{ key: 'G', label: 'Г', rate: '9%' }
	];
</script>

<svelte:head>
	<title>Касов апарат</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Касов апарат</h1>
		<p class="page-sub">Месечни отчети на фискалната памет и сверка с поръчките</p>
	</div>
</div>

{#if form?.error}
	<div class="alert danger" style="margin-bottom: 16px;">{form.error}</div>
{/if}
{#if form?.success}
	<div class="alert success" style="margin-bottom: 16px;">{form.success}</div>
{/if}

<div class="card" style="margin-bottom: 20px;">
	<div class="card-header">
		<div>
			<h2 class="card-title">Нов отчет</h2>
			<span class="card-sub">Съкратен отчет на ФП за месеца. Отчет за същия период се презаписва.</span>
		</div>
	</div>
	<form
		method="POST"
		action="?/save"
		enctype="multipart/form-data"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update();
			};
		}}
		style="padding:16px; display:flex; flex-direction:column; gap:14px;"
	>
		<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px;">
			<div class="field">
				<label class="label" for="cr-from">От дата</label>
				<input class="input" id="cr-from" type="date" name="periodFrom" value={iso(prevFirst)} required />
			</div>
			<div class="field">
				<label class="label" for="cr-to">До дата</label>
				<input class="input" id="cr-to" type="date" name="periodTo" value={iso(prevLast)} required />
			</div>
			<div class="field">
				<label class="label" for="cr-date">Дата на отчета</label>
				<input class="input" id="cr-date" type="date" name="reportDate" value={iso(now)} required />
			</div>
			<div class="field">
				<label class="label" for="cr-doc">№ на документа</label>
				<input class="input" id="cr-doc" name="documentNumber" placeholder="0000614" required />
			</div>
			<div class="field">
				<label class="label" for="cr-device">№ на ФУ</label>
				<input class="input" id="cr-device" name="deviceNumber" value={data.defaults.deviceNumber} placeholder="DT948904" required />
			</div>
			<div class="field">
				<label class="label" for="cr-fm">№ на ФП</label>
				<input class="input" id="cr-fm" name="fiscalMemoryNumber" value={data.defaults.fiscalMemoryNumber} placeholder="02948904" required />
			</div>
			<div class="field">
				<label class="label" for="cr-z1">Блок от</label>
				<input class="input" id="cr-z1" type="number" name="firstZReport" value={data.defaults.nextZReport ?? ''} placeholder="199" />
			</div>
			<div class="field">
				<label class="label" for="cr-z2">Блок до</label>
				<input class="input" id="cr-z2" type="number" name="lastZReport" placeholder="205" />
			</div>
			<div class="field">
				<label class="label" for="cr-last">№ посл. документ</label>
				<input class="input" id="cr-last" name="lastReceiptNumber" placeholder="0000612" />
			</div>
		</div>

		<div>
			<div class="label" style="margin-bottom:6px;">Сума оборот, ДДС</div>
			<table class="tbl">
				<thead>
					<tr><th>Група</th><th class="num">Оборот</th><th class="num">ДДС</th></tr>
				</thead>
				<tbody>
					{#each groups as g}
						<tr>
							<td>{g.label} <span class="muted">({g.rate})</span></td>
							<td class="num"><input class="input" name="turnover{g.key}" inputmode="decimal" placeholder="0.00" style="max-width:140px; text-align:right; font-family:var(--font-mono);" /></td>
							<td class="num"><input class="input" name="vat{g.key}" inputmode="decimal" placeholder="0.00" style="max-width:140px; text-align:right; font-family:var(--font-mono);" /></td>
						</tr>
					{/each}
					<tr>
						<td><strong>Общ оборот</strong> <span class="muted">(за проверка)</span></td>
						<td class="num"><input class="input" name="totalTurnover" inputmode="decimal" placeholder="0.00" style="max-width:140px; text-align:right; font-family:var(--font-mono);" /></td>
						<td></td>
					</tr>
					<tr>
						<td>Общ сторно оборот</td>
						<td class="num"><input class="input" name="stornoTurnover" inputmode="decimal" placeholder="0.00" style="max-width:140px; text-align:right; font-family:var(--font-mono);" /></td>
						<td class="num"><input class="input" name="stornoVat" inputmode="decimal" placeholder="0.00" style="max-width:140px; text-align:right; font-family:var(--font-mono);" /></td>
					</tr>
				</tbody>
			</table>
		</div>

		<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:10px;">
			<div class="field">
				<label class="label" for="cr-cash">Ръчна изработка, продадена в брой</label>
				<input class="input" id="cr-cash" name="cashSales" inputmode="decimal" placeholder="0.00" style="font-family:var(--font-mono);" />
				<span class="muted" style="font-size:11px;">Записва се като приход в касата. Наложените платежи не се пишат тук.</span>
			</div>
			<div class="field">
				<label class="label" for="cr-photo">Снимка / PDF на отчета</label>
				<input class="input" id="cr-photo" type="file" name="attachment" accept="image/*,application/pdf" />
			</div>
			<div class="field">
				<label class="label" for="cr-notes">Бележка</label>
				<input class="input" id="cr-notes" name="notes" />
			</div>
		</div>

		<div>
			<button type="submit" class="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Записване...' : 'Запиши отчета'}</button>
		</div>
	</form>
</div>

{#each data.reports as r (r.id)}
	{@const rec = r.reconciliation}
	{@const diff = r.totalTurnoverCents - rec.expectedCents}
	<div class="card" style="margin-bottom: 16px;">
		<div class="card-header">
			<div>
				<h2 class="card-title">{formatDate(r.periodFrom)} – {formatDate(r.periodTo)} · {formatAmount(r.totalTurnoverCents)}</h2>
				<span class="card-sub">
					Документ №{r.documentNumber} от {formatDate(r.reportDate)} · ФУ {r.deviceNumber}
					{#if r.firstZReport != null}· блокове {r.firstZReport}–{r.lastZReport}{/if}
					{#if r.lastReceiptNumber}· посл. бележка {r.lastReceiptNumber}{/if}
				</span>
			</div>
			{#if r.attachmentFilename}
				<a href="/cash-register/{r.id}/attachment" target="_blank" class="btn btn-ghost btn-sm">Отчет</a>
			{/if}
		</div>
		<table class="tbl">
			<tbody>
				<tr><td>Оборот по касов апарат (ДДС {formatAmount(r.totalVatCents)}{r.stornoTurnoverCents ? `, сторно ${formatAmount(r.stornoTurnoverCents)}` : ''})</td><td class="num amount">{formatAmount(r.totalTurnoverCents)}</td></tr>
				<tr><td class="muted">Поръчки inobags.com, завършени през периода, без доставка ({rec.shopOrdersCount})</td><td class="num amount muted">{formatAmount(rec.shopOrdersCents)}</td></tr>
				<tr><td class="muted">Ръчна изработка с наложен платеж ({rec.handmadeCodCount} пратки)</td><td class="num amount muted">{formatAmount(rec.handmadeCodCents)}</td></tr>
				<tr><td class="muted">Ръчна изработка в брой</td><td class="num amount muted">{formatAmount(rec.cashSalesCents)}</td></tr>
				<tr>
					<td><strong>Разлика</strong></td>
					<td class="num amount" style="color:{diff === 0 ? 'var(--text)' : 'var(--danger)'};"><strong>{formatAmount(diff)}</strong></td>
				</tr>
			</tbody>
		</table>
		{#if r.notes}<div class="muted" style="padding:8px 16px; font-size:12px;">{r.notes}</div>{/if}
	</div>
{/each}
