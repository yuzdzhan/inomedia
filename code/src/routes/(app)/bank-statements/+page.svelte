<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { fmtDate as formatDate, fmtDateTime as formatDateTime } from '$lib/utils/format';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let importing = $state(false);
	let selectedFileName = $state('');


	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	const parseStatusLabels: Record<string, string> = {
		ok: 'Успешен',
		parse_failed: 'Неуспешен разбор',
		partial: 'Частичен'
	};

	function parseStatusBadgeClass(status: string): string {
		if (status === 'ok') return 'badge inv-paid';
		if (status === 'parse_failed') return 'badge inv-overdue';
		return 'badge inv-partial';
	}

	function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		selectedFileName = input.files?.[0]?.name ?? '';
	}
</script>

<svelte:head>
	<title>Банкови извлечения</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1 class="page-title">Банкови извлечения</h1>
		<p class="page-sub">Импортиране и преглед на банкови извлечения</p>
	</div>
	<div class="page-header-actions">
		<label class="btn btn-secondary btn-sm" style="cursor: pointer; position: relative; overflow: hidden;">
			Избери файл
			<input
				type="file"
				name="file"
				accept=".pdf,.csv,.txt,text/csv,text/plain,application/pdf"
				style="position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;"
				form="import-form"
				onchange={handleFileChange}
			/>
		</label>
		<button
			type="submit"
			form="import-form"
			class="btn btn-primary btn-sm"
			disabled={importing}
		>
			{importing ? 'Импортиране...' : 'Импортирай извлечение'}
		</button>
	</div>
</div>

<!-- Hidden import form -->
<form
	id="import-form"
	method="POST"
	action="?/importStatement"
	enctype="multipart/form-data"
	use:enhance={() => {
		importing = true;
		return async ({ update }) => {
			importing = false;
			selectedFileName = '';
			await update();
		};
	}}
>
</form>

{#if form?.importError}
	<div class="alert danger" style="margin-bottom: 16px;">{form.importError}</div>
{/if}
{#if form?.importSuccess}
	<div class="alert warning" style="margin-bottom: 16px;">{form.importSuccess}</div>
{/if}

{#if selectedFileName}
	<div class="alert warning" style="margin-bottom: 16px;">
		Файл избран: <span class="amount">{selectedFileName}</span>
	</div>
{/if}

<!-- Import hint -->
<div class="card" style="margin-bottom: 20px;">
	<div class="card-header">
		<h2 class="card-title">Формат на файла</h2>
	</div>
	<div style="padding: 12px 16px;">
		<p class="muted" style="font-size: 12px; margin: 0;">
			Поддържани формати: CSV или TXT с формат <code style="background: var(--surface); padding: 1px 4px; border-radius: var(--r-sm); font-family: var(--font-mono);">дата;описание;сума</code> (разделени с точка и
			запетая). Датата може да е в ГГГГ-ММ-ДД или ДД.ММ.ГГГГ формат. PDF файловете се съхраняват, но
			не се разбират автоматично.
		</p>
	</div>
</div>

<!-- Statements list -->
<div class="card">
	<div class="card-header">
		<h2 class="card-title">Импортирани извлечения</h2>
		<span class="card-sub">{data.statements.length} извлечения</span>
	</div>

	{#if data.statements.length === 0}
		<div style="padding: 40px; text-align: center;">
			<p class="muted">Все още няма импортирани извлечения.</p>
		</div>
	{:else}
		<table class="tbl">
			<thead>
				<tr>
					<th>Файл</th>
					<th>Импортирано на</th>
					<th>От</th>
					<th>Статус разбор</th>
					<th class="num">Редове</th>
					<th class="num">За преглед</th>
					<th class="num">Размер</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.statements as stmt}
					<tr class:highlight-amber={stmt.needsReviewCount > 0}>
						<td>
							<span class="amount" style="font-size: 12px; color: var(--text-2);">{stmt.originalFilename}</span>
						</td>
						<td class="amount muted" style="font-size: 12px; white-space: nowrap;">{formatDateTime(stmt.importedAt)}</td>
						<td class="muted">{stmt.importedByName}</td>
						<td>
							<span class={parseStatusBadgeClass(stmt.parseStatus)}>
								{parseStatusLabels[stmt.parseStatus] ?? stmt.parseStatus}
							</span>
						</td>
						<td class="num amount">{stmt.rowCount}</td>
						<td class="num">
							{#if stmt.needsReviewCount > 0}
								<span class="badge inv-partial">{stmt.needsReviewCount}</span>
							{:else}
								<span class="muted">—</span>
							{/if}
						</td>
						<td class="num amount muted" style="font-size: 12px;">{formatSize(stmt.sizeBytes)}</td>
						<td>
							<a href="/bank-statements/{stmt.id}" class="btn btn-ghost btn-sm">Преглед</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
