<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let importing = $state(false);
	let selectedFileName = $state('');

	function formatDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	function formatDateTime(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleString('bg-BG', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

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

	const parseStatusClasses: Record<string, string> = {
		ok: 'status-ok',
		parse_failed: 'status-failed',
		partial: 'status-partial'
	};

	function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		selectedFileName = input.files?.[0]?.name ?? '';
	}
</script>

<svelte:head>
	<title>Банкови извлечения</title>
</svelte:head>

<div class="page-header">
	<h1>Банкови извлечения</h1>
</div>

<!-- Import form -->
<div class="card">
	<h2 class="section-title">Импортиране на извлечение</h2>
	<p class="hint">
		Поддържани формати: CSV или TXT с формат <code>дата;описание;сума</code> (разделени с точка и
		запетая). Датата може да е в ГГГГ-ММ-ДД или ДД.ММ.ГГГГ формат. PDF файловете се съхраняват, но
		не се разбират автоматично.
	</p>

	{#if form?.importError}
		<div class="alert alert-error">{form.importError}</div>
	{/if}
	{#if form?.importSuccess}
		<div class="alert alert-success">{form.importSuccess}</div>
	{/if}

	<form
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
		class="import-form"
	>
		<div class="file-input-wrapper">
			<label class="file-label" for="file-input">
				{selectedFileName || 'Изберете файл (PDF, CSV, TXT)'}
			</label>
			<input
				id="file-input"
				type="file"
				name="file"
				accept=".pdf,.csv,.txt,text/csv,text/plain,application/pdf"
				required
				class="file-input-hidden"
				onchange={handleFileChange}
			/>
		</div>
		<button type="submit" class="btn btn-primary" disabled={importing}>
			{importing ? 'Импортиране...' : 'Импортирай'}
		</button>
	</form>
</div>

<!-- Statements list -->
<div class="card">
	<h2 class="section-title">Импортирани извлечения</h2>

	{#if data.statements.length === 0}
		<p class="empty-text">Все още няма импортирани извлечения.</p>
	{:else}
		<table class="table">
			<thead>
				<tr>
					<th>Файл</th>
					<th>Импортирано на</th>
					<th>От</th>
					<th>Статус</th>
					<th>Редове</th>
					<th>За преглед</th>
					<th>Размер</th>
					<th>Действия</th>
				</tr>
			</thead>
			<tbody>
				{#each data.statements as stmt}
					<tr>
						<td class="filename-cell">{stmt.originalFilename}</td>
						<td>{formatDateTime(stmt.importedAt)}</td>
						<td>{stmt.importedByName}</td>
						<td>
							<span class="status-badge {parseStatusClasses[stmt.parseStatus] ?? 'status-ok'}">
								{parseStatusLabels[stmt.parseStatus] ?? stmt.parseStatus}
							</span>
						</td>
						<td>{stmt.rowCount}</td>
						<td>
							{#if stmt.needsReviewCount > 0}
								<span class="review-badge">{stmt.needsReviewCount}</span>
							{:else}
								—
							{/if}
						</td>
						<td>{formatSize(stmt.sizeBytes)}</td>
						<td>
							<a href="/bank-statements/{stmt.id}" class="btn-link">Преглед</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.page-header {
		margin-bottom: 24px;
	}

	.page-header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #1e293b;
		margin: 0;
	}

	.card {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 24px;
		margin-bottom: 24px;
	}

	.section-title {
		font-size: 1.0625rem;
		font-weight: 600;
		color: #1e293b;
		margin: 0 0 12px;
	}

	.hint {
		font-size: 0.875rem;
		color: #64748b;
		margin-bottom: 16px;
	}

	.hint code {
		background: #f1f5f9;
		padding: 1px 4px;
		border-radius: 3px;
		font-family: monospace;
	}

	.alert {
		padding: 10px 14px;
		border-radius: 6px;
		font-size: 0.9rem;
		margin-bottom: 14px;
	}

	.alert-error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.alert-success {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #15803d;
	}

	.import-form {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.file-input-wrapper {
		position: relative;
	}

	.file-label {
		display: inline-block;
		padding: 8px 14px;
		background: #f8fafc;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 0.9rem;
		color: #475569;
		cursor: pointer;
		transition: border-color 0.15s;
		max-width: 300px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-label:hover {
		border-color: #94a3b8;
	}

	.file-input-hidden {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		width: 100%;
		height: 100%;
	}

	.btn {
		padding: 8px 18px;
		border-radius: 6px;
		font-size: 0.9375rem;
		font-family: inherit;
		font-weight: 500;
		cursor: pointer;
		border: none;
		transition: background 0.15s, opacity 0.15s;
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-primary {
		background: #3b82f6;
		color: #fff;
	}

	.btn-primary:hover:not(:disabled) {
		background: #2563eb;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.table th {
		text-align: left;
		padding: 8px 12px;
		font-weight: 600;
		font-size: 0.8125rem;
		color: #64748b;
		border-bottom: 1px solid #e2e8f0;
		white-space: nowrap;
	}

	.table td {
		padding: 10px 12px;
		border-bottom: 1px solid #f1f5f9;
		color: #334155;
		vertical-align: middle;
	}

	.table tr:last-child td {
		border-bottom: none;
	}

	.filename-cell {
		font-family: monospace;
		font-size: 0.85rem;
		max-width: 220px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.status-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.status-ok {
		background: #dcfce7;
		color: #15803d;
	}

	.status-failed {
		background: #fee2e2;
		color: #b91c1c;
	}

	.status-partial {
		background: #fef9c3;
		color: #a16207;
	}

	.btn-link {
		color: #3b82f6;
		font-size: 0.875rem;
		text-decoration: none;
	}

	.btn-link:hover {
		text-decoration: underline;
	}

	.empty-text {
		color: #94a3b8;
		font-size: 0.9rem;
		margin: 0;
	}

	.review-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 0.8125rem;
		font-weight: 600;
		background: #fef3c7;
		color: #92400e;
	}
</style>
