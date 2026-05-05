<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	function fieldError(field: string) {
		return (form as any)?.errors?.[field]?.[0];
	}

	function val(field: string) {
		return (form as any)?.values?.[field] ?? '';
	}
</script>

<svelte:head>
	<title>Начална настройка – Иномедия</title>
</svelte:head>

<div class="page">
	<div class="card">
		<div class="header">
			<h1>Начална настройка</h1>
			<p>Попълнете данните на фирмата и първия администраторски акаунт.</p>
		</div>

		{#if form?.error}
			<div class="alert">{form.error}</div>
		{/if}

		<form method="POST">
			<section>
				<h2>Данни на фирмата</h2>

				<div class="field">
					<label for="legalName">Правно наименование *</label>
					<input
						id="legalName"
						name="legalName"
						type="text"
						value={val('legalName')}
						placeholder={'„Иномедия" ЕООД'}
						required
					/>
					{#if fieldError('legalName')}<span class="error">{fieldError('legalName')}</span>{/if}
				</div>

				<div class="row">
					<div class="field">
						<label for="eikBulstat">ЕИК / БУЛСТАТ *</label>
						<input
							id="eikBulstat"
							name="eikBulstat"
							type="text"
							value={val('eikBulstat')}
							placeholder="123456789"
							required
						/>
						{#if fieldError('eikBulstat')}<span class="error">{fieldError('eikBulstat')}</span>{/if}
					</div>

					<div class="field">
						<label for="vatNumber">ДДС номер</label>
						<input
							id="vatNumber"
							name="vatNumber"
							type="text"
							value={val('vatNumber')}
							placeholder="BG123456789"
						/>
					</div>
				</div>

				<div class="field">
					<label for="registeredAddress">Регистриран адрес *</label>
					<input
						id="registeredAddress"
						name="registeredAddress"
						type="text"
						value={val('registeredAddress')}
						placeholder={'гр. София, ул. „Витоша" 1'}
						required
					/>
					{#if fieldError('registeredAddress')}<span class="error">{fieldError('registeredAddress')}</span>{/if}
				</div>

				<div class="field">
					<label for="molName">МОЛ (Материално отговорно лице) *</label>
					<input
						id="molName"
						name="molName"
						type="text"
						value={val('molName')}
						placeholder="Иван Петров"
						required
					/>
					{#if fieldError('molName')}<span class="error">{fieldError('molName')}</span>{/if}
				</div>
			</section>

			<section>
				<h2>Администраторски акаунт</h2>

				<div class="row">
					<div class="field">
						<label for="firstName">Собствено ime *</label>
						<input
							id="firstName"
							name="firstName"
							type="text"
							value={val('firstName')}
							required
						/>
						{#if fieldError('firstName')}<span class="error">{fieldError('firstName')}</span>{/if}
					</div>

					<div class="field">
						<label for="lastName">Фамилно ime *</label>
						<input
							id="lastName"
							name="lastName"
							type="text"
							value={val('lastName')}
							required
						/>
						{#if fieldError('lastName')}<span class="error">{fieldError('lastName')}</span>{/if}
					</div>
				</div>

				<div class="field">
					<label for="email">Имейл адрес *</label>
					<input
						id="email"
						name="email"
						type="email"
						value={val('email')}
						placeholder="admin@example.com"
						required
					/>
					{#if fieldError('email')}<span class="error">{fieldError('email')}</span>{/if}
				</div>

				<div class="field">
					<label for="password">Парола *</label>
					<input id="password" name="password" type="password" minlength="8" required />
					{#if fieldError('password')}<span class="error">{fieldError('password')}</span>{/if}
				</div>
			</section>

			<button type="submit" class="btn-primary">Инициализиране на системата</button>
		</form>
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 40px 16px;
		background: #f1f5f9;
	}

	.card {
		width: 100%;
		max-width: 640px;
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
		padding: 40px;
	}

	.header {
		margin-bottom: 32px;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #0f172a;
		margin-bottom: 8px;
	}

	.header p {
		color: #64748b;
	}

	h2 {
		font-size: 1rem;
		font-weight: 600;
		color: #334155;
		margin-bottom: 16px;
		padding-bottom: 8px;
		border-bottom: 1px solid #e2e8f0;
	}

	section {
		margin-bottom: 32px;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
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

	.error {
		font-size: 0.8125rem;
		color: #dc2626;
	}

	.alert {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: 12px 16px;
		border-radius: 6px;
		margin-bottom: 24px;
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
		transition: background 0.15s;
	}

	.btn-primary:hover {
		background: #1d4ed8;
	}
</style>
