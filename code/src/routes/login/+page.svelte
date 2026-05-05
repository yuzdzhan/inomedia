<script lang="ts">
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Вход – Иномедия</title>
</svelte:head>

<div class="page">
	<div class="card">
		<h1>Иномедия</h1>
		<p class="subtitle">Вход в системата</p>

		{#if data.bootstrapped}
			<div class="success">
				Системата е инициализирана успешно. Влезте с администраторския акаунт.
			</div>
		{/if}

		{#if form?.error}
			<div class="alert">{form.error}</div>
		{/if}

		<form method="POST">
			<div class="field">
				<label for="email">Имейл адрес</label>
				<input
					id="email"
					name="email"
					type="email"
					value={form?.email ?? ''}
					autocomplete="email"
					required
					autofocus
				/>
			</div>

			<div class="field">
				<label for="password">Парола</label>
				<input id="password" name="password" type="password" autocomplete="current-password" required />
			</div>

			<button type="submit" class="btn-primary">Вход</button>
		</form>
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f1f5f9;
	}

	.card {
		width: 100%;
		max-width: 400px;
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
		padding: 40px;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #0f172a;
		text-align: center;
		margin-bottom: 4px;
	}

	.subtitle {
		text-align: center;
		color: #64748b;
		margin-bottom: 28px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 16px;
	}

	label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
	}

	input {
		padding: 9px 12px;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.9375rem;
		font-family: inherit;
		color: #0f172a;
		outline: none;
		transition: border-color 0.15s;
	}

	input:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.alert {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: 12px 16px;
		border-radius: 6px;
		margin-bottom: 20px;
		font-size: 0.9rem;
	}

	.success {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #166534;
		padding: 12px 16px;
		border-radius: 6px;
		margin-bottom: 20px;
		font-size: 0.9rem;
	}

	.btn-primary {
		width: 100%;
		padding: 11px 24px;
		background: #2563eb;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.9375rem;
		font-weight: 600;
		font-family: inherit;
		margin-top: 8px;
		transition: background 0.15s;
	}

	.btn-primary:hover {
		background: #1d4ed8;
	}
</style>
