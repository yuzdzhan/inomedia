<script lang="ts">
	import type { PageData } from './$types';
	import Chart from '$lib/components/Chart.svelte';

	let { data }: { data: PageData } = $props();

	let months = $state(12);

	function fmt(cents: number): string {
		return (cents / 100).toFixed(2) + ' ' + data.currency;
	}

	function fmtK(cents: number): string {
		const v = cents / 100;
		if (Math.abs(v) >= 10000) return (v / 1000).toFixed(1) + 'k';
		return v.toFixed(0);
	}

	const filtered = $derived(months === 6 ? data.monthlyData.slice(-6) : data.monthlyData);
	const filteredCash = $derived(months === 6 ? data.cashPositionData.slice(-6) : data.cashPositionData);

	const ttipBase = { backgroundColor: '#fff', borderColor: '#e5e7eb', textStyle: { color: '#0a0a0b', fontSize: 12 } };
	const axisBase = { axisLabel: { color: '#71717a', fontSize: 11 }, axisLine: { lineStyle: { color: '#e5e7eb' } }, splitLine: { show: false } };
	const yAxis = (leftPad = 56) => ({
		type: 'value',
		axisLabel: { color: '#71717a', fontSize: 11, formatter: (v: number) => fmtK(v * 100) },
		splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
		gridIndex: undefined,
		nameLocation: undefined,
		nameGap: undefined,
		offset: leftPad
	});

	const revenueExpensesOpts = $derived({
		backgroundColor: 'transparent',
		tooltip: { ...ttipBase, trigger: 'axis' },
		legend: { data: ['Приходи', 'Разходи'], textStyle: { color: '#71717a', fontSize: 11 }, top: 4 },
		grid: { top: 48, right: 16, bottom: 36, left: 64 },
		xAxis: { ...axisBase, type: 'category', data: filtered.map((m) => m.label) },
		yAxis: { type: 'value', axisLabel: { color: '#71717a', fontSize: 11, formatter: (v: number) => fmtK(v * 100) }, splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } } },
		series: [
			{ name: 'Приходи', type: 'bar', data: filtered.map((m) => +(m.revenueCents / 100).toFixed(2)), itemStyle: { color: '#4f46e5', borderRadius: [2, 2, 0, 0] } },
			{ name: 'Разходи', type: 'bar', data: filtered.map((m) => +(m.expensesCents / 100).toFixed(2)), itemStyle: { color: '#ef4444', borderRadius: [2, 2, 0, 0] } }
		]
	});

	const netProfitOpts = $derived({
		backgroundColor: 'transparent',
		tooltip: { ...ttipBase, trigger: 'axis' },
		legend: { data: ['Нетна печалба', 'С незафактурирано'], textStyle: { color: '#71717a', fontSize: 11 }, top: 4 },
		grid: { top: 40, right: 16, bottom: 36, left: 64 },
		xAxis: { ...axisBase, type: 'category', data: filtered.map((m) => m.label) },
		yAxis: { type: 'value', axisLabel: { color: '#71717a', fontSize: 11, formatter: (v: number) => fmtK(v * 100) }, splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } } },
		series: [
			{
				name: 'Нетна печалба',
				type: 'line',
				data: filtered.map((m) => +(m.netCents / 100).toFixed(2)),
				smooth: true,
				symbol: 'circle',
				symbolSize: 4,
				lineStyle: { color: '#059669', width: 2 },
				itemStyle: { color: '#059669' },
				areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(5,150,105,0.2)' }, { offset: 1, color: 'rgba(5,150,105,0)' }] } }
			},
			{
				name: 'С незафактурирано',
				type: 'line',
				data: filtered.map((m) => +((m.netCents + m.forecastUnbilledCents) / 100).toFixed(2)),
				smooth: true,
				symbol: 'circle',
				symbolSize: 3,
				lineStyle: { color: '#6366f1', width: 2, type: 'dashed' },
				itemStyle: { color: '#6366f1' }
			}
		]
	});

	const categoryOpts = $derived({
		backgroundColor: 'transparent',
		tooltip: { ...ttipBase, trigger: 'item', formatter: '{b}<br/>{c} ' + data.currency + ' ({d}%)' },
		legend: { orient: 'vertical', right: 8, top: 'center', textStyle: { color: '#71717a', fontSize: 10 } },
		series: [{
			type: 'pie',
			radius: ['38%', '65%'],
			center: ['38%', '50%'],
			data: data.categoryBreakdown.map((c) => ({ name: c.name, value: +(c.totalCents / 100).toFixed(2) })),
			label: { show: false },
			emphasis: { label: { show: true, fontSize: 11 } }
		}]
	});

	const statusLabels: Record<string, string> = {
		issued: 'Издадени',
		partially_paid: 'Частично пл.',
		paid: 'Платени',
		overdue: 'Просрочени'
	};
	const statusColors: Record<string, string> = {
		issued: '#1d4ed8',
		partially_paid: '#c2410c',
		paid: '#047857',
		overdue: '#b91c1c'
	};

	const invoiceStatusOpts = $derived({
		backgroundColor: 'transparent',
		tooltip: { ...ttipBase, trigger: 'item', formatter: '{b}<br/>{c} ' + data.currency + ' ({d}%)' },
		legend: { orient: 'vertical', right: 8, top: 'center', textStyle: { color: '#71717a', fontSize: 10 } },
		series: [{
			type: 'pie',
			radius: ['38%', '65%'],
			center: ['38%', '50%'],
			data: data.invoiceStatusData.map((s) => ({
				name: statusLabels[s.status] ?? s.status,
				value: +(s.totalCents / 100).toFixed(2),
				itemStyle: { color: statusColors[s.status] }
			})),
			label: { show: false },
			emphasis: { label: { show: true, fontSize: 11 } }
		}]
	});

	const cashOpts = $derived({
		backgroundColor: 'transparent',
		tooltip: { ...ttipBase, trigger: 'axis' },
		grid: { top: 24, right: 16, bottom: 36, left: 72 },
		xAxis: { ...axisBase, type: 'category', data: filteredCash.map((m) => m.label) },
		yAxis: { type: 'value', axisLabel: { color: '#71717a', fontSize: 11, formatter: (v: number) => fmtK(v * 100) }, splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } } },
		series: [{
			name: 'Парична позиция',
			type: 'line',
			data: filteredCash.map((m) => +(m.balanceCents / 100).toFixed(2)),
			smooth: true,
			symbol: 'circle',
			symbolSize: 4,
			lineStyle: { color: '#0ea5e9', width: 2 },
			itemStyle: { color: '#0ea5e9' },
			areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(14,165,233,0.2)' }, { offset: 1, color: 'rgba(14,165,233,0)' }] } }
		}]
	});
</script>

<svelte:head>
	<title>Отчети: Обобщение – Иномедия</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Финансово обобщение</h1>
		<p class="page-sub">Преглед на здравето на компанията</p>
	</div>
</div>

{#if data.vatRegistered}
	<div class="section-label">ДДС прогноза — {data.vat.monthName} ({data.vat.daysElapsed} / {data.vat.daysInMonth} дни)</div>
	<div class="stats-grid stats-grid-3" style="margin-bottom:24px;">
		<div class="stat">
			<div class="stat-label">ДДС потвърдено</div>
			<div class="amount stat-value">{fmt(data.vat.confirmedCents)}</div>
			<div class="stat-sub">От издадени фактури тази месец</div>
		</div>
		<div class="stat">
			<div class="stat-label">ДДС с чернови</div>
			<div class="amount stat-value" style="color:var(--warning);">{fmt(data.vat.potentialCents)}</div>
			<div class="stat-sub">Включва {data.vat.draftCents > 0 ? fmt(data.vat.draftCents) + ' от чернови' : 'без чернови тази месец'}</div>
		</div>
		<div class="stat">
			<div class="stat-label">ДДС прогноза (до края на месеца)</div>
			<div class="amount stat-value" style="color:var(--accent);">{fmt(data.vat.projectedCents)}</div>
			<div class="stat-sub">Линейна екстраполация на потвърденото</div>
		</div>
	</div>
{/if}

<div class="charts-toolbar">
	<span class="section-label" style="margin-bottom:0;">Графики</span>
	<div class="toggle-group">
		<button class="btn btn-sm" class:btn-secondary={months === 6} class:btn-ghost={months !== 6} onclick={() => months = 6}>6 месеца</button>
		<button class="btn btn-sm" class:btn-secondary={months === 12} class:btn-ghost={months !== 12} onclick={() => months = 12}>12 месеца</button>
	</div>
</div>

<div class="card" style="margin-bottom:16px;">
	<div class="card-header">
		<h3 class="card-title">Приходи срещу Разходи</h3>
	</div>
	<div style="padding:16px;">
		<Chart options={revenueExpensesOpts} height="280px" />
	</div>
</div>

<div class="card" style="margin-bottom:16px;">
	<div class="card-header">
		<h3 class="card-title">Нетна печалба</h3>
	</div>
	<div style="padding:16px;">
		<Chart options={netProfitOpts} height="220px" />
	</div>
</div>

<div class="charts-row" style="margin-bottom:16px;">
	<div class="card">
		<div class="card-header">
			<h3 class="card-title">Разходи по категория</h3>
			<span class="card-sub">последните 12 месеца</span>
		</div>
		<div style="padding:16px;">
			{#if data.categoryBreakdown.length > 0}
				<Chart options={categoryOpts} height="220px" />
			{:else}
				<div class="muted" style="padding:40px 0; text-align:center; font-size:13px;">Няма разходи за периода.</div>
			{/if}
		</div>
	</div>
	<div class="card">
		<div class="card-header">
			<h3 class="card-title">Фактури по статус</h3>
			<span class="card-sub">текущо</span>
		</div>
		<div style="padding:16px;">
			{#if data.invoiceStatusData.length > 0}
				<Chart options={invoiceStatusOpts} height="220px" />
			{:else}
				<div class="muted" style="padding:40px 0; text-align:center; font-size:13px;">Няма фактури.</div>
			{/if}
		</div>
	</div>
	<div class="card">
		<div class="card-header">
			<h3 class="card-title">Парична позиция</h3>
		</div>
		<div style="padding:16px;">
			<Chart options={cashOpts} height="220px" />
		</div>
	</div>
</div>

<style>
	.section-label {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin-bottom: 10px;
	}

	.stats-grid {
		display: grid;
		gap: 12px;
	}
	.stats-grid-3 {
		grid-template-columns: repeat(3, 1fr);
	}

	.stat {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 16px;
	}
	.stat-value {
		font-size: 20px;
		font-weight: 500;
		margin: 4px 0;
	}
	.stat-sub {
		font-size: 11px;
		color: var(--text-muted);
	}

	.charts-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.toggle-group {
		display: flex;
		gap: 4px;
	}

	.charts-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}

	@media (max-width: 900px) {
		.stats-grid-3 {
			grid-template-columns: 1fr;
		}
		.charts-row {
			grid-template-columns: 1fr;
		}
	}
</style>
