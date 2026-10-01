<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatAmount(cents: number): string {
		const sign = cents < 0 ? '-' : '';
		return `${sign}${(Math.abs(cents) / 100).toFixed(2)} EUR`;
	}

	function changeMonth(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		if (value) goto(`?month=${value}`);
	}

	const checks = $derived([
		{ ok: data.status.unmatchedRows === 0, text: data.status.unmatchedRows ? `${data.status.unmatchedRows} банкови реда без документ/обяснение` : 'Всички банкови редове са свързани', href: '/bank-statements' },
		{ ok: data.status.unresolvedLines === 0, text: data.status.unresolvedLines ? `${data.status.unresolvedLines} неразпознати пратки с наложен платеж` : 'Всички пратки са разпознати', href: `/cod?month=${data.month}` },
		{ ok: data.status.ordersWithoutPdf === 0, text: data.status.ordersWithoutPdf ? `${data.status.ordersWithoutPdf} поръчки без PDF документ` : 'Всички поръчки имат PDF', href: `/cod?month=${data.month}` },
		{ ok: !data.status.missingRegisterReport, text: data.status.missingRegisterReport ? 'Няма въведен отчет от касовия апарат' : 'Отчетът от касовия апарат е въведен', href: '/cash-register' },
		{ ok: data.status.registerDiffs === 0, text: data.status.registerDiffs ? 'Касовият апарат не съвпада с продажбите' : 'Касовият апарат съвпада с продажбите', href: '/cash-register' }
	]);
</script>

<svelte:head>
	<title>Месечен пакет</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Месечен пакет</h1>
		<p class="page-sub">Отчет и всички документи за месеца за счетоводителя, в A4 PDF</p>
	</div>
	<div class="page-header-actions">
		<input class="input" type="month" value={data.month} onchange={changeMonth} style="width:auto;" />
		<a class="btn btn-primary btn-sm" href="/monthly-report/{data.month}/zip" data-sveltekit-reload>Свали месеца (ZIP)</a>
	</div>
</div>

<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-bottom:20px;">
	<div class="stat" style="padding:16px;">
		<div class="stat-label">Банка</div>
		<div class="amount" style="font-size:18px; font-weight:600;">{formatAmount(data.balances.bank.closing)}</div>
		<div class="muted" style="font-size:11px;">начало {formatAmount(data.balances.bank.opening)} · {data.counts.bankRows} движения</div>
	</div>
	<div class="stat" style="padding:16px;">
		<div class="stat-label">Каса</div>
		<div class="amount" style="font-size:18px; font-weight:600;">{formatAmount(data.balances.cash.closing)}</div>
		<div class="muted" style="font-size:11px;">начало {formatAmount(data.balances.cash.opening)} · {data.counts.cashEntries} движения</div>
	</div>
	<div class="stat" style="padding:16px;">
		<div class="stat-label">Издадени фактури</div>
		<div class="amount" style="font-size:18px; font-weight:600;">{data.counts.issuedInvoices}</div>
	</div>
</div>

<div class="card">
	<div class="card-header">
		<h2 class="card-title">{data.status.ready ? 'Месецът е готов' : 'Преди изпращане'}</h2>
		<span class="card-sub">Пакетът може да се свали и с незавършени точки – те са описани в отчета.</span>
	</div>
	<table class="tbl">
		<tbody>
			{#each checks as c}
				<tr>
					<td style="width:28px;"><span class={c.ok ? 'badge inv-paid' : 'badge inv-overdue'}>{c.ok ? '✓' : '!'}</span></td>
					<td>{c.text}</td>
					<td style="text-align:right;">{#if !c.ok}<a class="btn btn-ghost btn-sm" href={c.href}>Оправи</a>{/if}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
