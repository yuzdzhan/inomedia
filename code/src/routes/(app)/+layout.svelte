<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const roleLabels: Record<string, string> = {
		admin: 'Администратор',
		manager: 'Мениджър',
		employee: 'Служител',
		accountant: 'Счетоводител'
	};
</script>

<div class="shell">
	<nav class="sidebar">
		<div class="brand">Иномедия</div>

		<ul class="nav-list">
			<li><a href="/dashboard" aria-current={page.url.pathname === '/dashboard' ? 'page' : undefined}>Начало</a></li>
			{#if ['admin', 'manager', 'employee', 'accountant'].includes(data.user.role)}
				<li><a href="/clients" aria-current={page.url.pathname === '/clients' ? 'page' : undefined}>Клиенти</a></li>
				<li><a href="/projects" aria-current={page.url.pathname === '/projects' ? 'page' : undefined}>Проекти</a></li>
			{/if}
			{#if ['admin', 'manager', 'accountant'].includes(data.user.role)}
				<li><a href="/invoiceable-work" aria-current={page.url.pathname === '/invoiceable-work' ? 'page' : undefined}>За фактуриране</a></li>
				<li><a href="/expenses" aria-current={page.url.pathname === '/expenses' ? 'page' : undefined}>Разходи</a></li>
			{/if}
			{#if ['admin', 'accountant'].includes(data.user.role)}
				<li><a href="/invoices" aria-current={page.url.pathname === '/invoices' ? 'page' : undefined}>Чернови фактури</a></li>
				<li><a href="/cashflow" aria-current={page.url.pathname === '/cashflow' ? 'page' : undefined}>Финанси</a></li>
				<li><a href="/bank-statements" aria-current={page.url.pathname.startsWith('/bank-statements') ? 'page' : undefined}>Банк. извлечения</a></li>
			{/if}
			{#if ['admin', 'accountant', 'manager'].includes(data.user.role)}
				<li><a href="/reports/billing" aria-current={page.url.pathname.startsWith('/reports/billing') ? 'page' : undefined}>Отчети: Фактуриране</a></li>
			{/if}
			{#if data.user.role === 'admin'}
				<li><a href="/settings" aria-current={page.url.pathname === '/settings' ? 'page' : undefined}>Настройки</a></li>
				<li><a href="/users" aria-current={page.url.pathname === '/users' ? 'page' : undefined}>Потребители</a></li>
			{/if}
		</ul>

		<div class="user-block">
			<div class="user-name">{data.user.firstName} {data.user.lastName}</div>
			<div class="user-role">{roleLabels[data.user.role] ?? data.user.role}</div>
			<form method="POST" action="/logout">
				<button type="submit" class="btn-logout">Изход</button>
			</form>
		</div>
	</nav>

	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	.shell {
		display: flex;
		min-height: 100vh;
	}

	.sidebar {
		width: 220px;
		min-height: 100vh;
		background: #1e293b;
		color: #cbd5e1;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.brand {
		padding: 24px 20px 20px;
		font-size: 1.125rem;
		font-weight: 700;
		color: #f1f5f9;
		border-bottom: 1px solid #334155;
	}

	.nav-list {
		list-style: none;
		padding: 12px 0;
		flex: 1;
	}

	.nav-list li a {
		display: block;
		padding: 9px 20px;
		color: #94a3b8;
		font-size: 0.9375rem;
		transition: color 0.15s, background 0.15s;
	}

	.nav-list li a:hover,
	.nav-list li a[aria-current='page'] {
		color: #f1f5f9;
		background: #334155;
		text-decoration: none;
	}

	.user-block {
		padding: 16px 20px;
		border-top: 1px solid #334155;
		font-size: 0.875rem;
	}

	.user-name {
		font-weight: 600;
		color: #f1f5f9;
		margin-bottom: 2px;
	}

	.user-role {
		color: #64748b;
		margin-bottom: 10px;
	}

	.btn-logout {
		background: none;
		border: 1px solid #334155;
		color: #94a3b8;
		padding: 6px 12px;
		border-radius: 5px;
		font-size: 0.8125rem;
		font-family: inherit;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}

	.btn-logout:hover {
		border-color: #64748b;
		color: #f1f5f9;
	}

	.content {
		flex: 1;
		padding: 32px;
		overflow-y: auto;
	}
</style>
