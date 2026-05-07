<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import Icon from '$lib/components/Icon.svelte';
	import type { IconName } from '$lib/components/Icon.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	type NavSection = { section: string };
	type NavItem = {
		id: string;
		label: string;
		icon: IconName;
		href: string;
		badge?: string;
		alert?: boolean;
		roles?: string[];
		active?: (pathname: string) => boolean;
	};
	type NavEntry = NavSection | NavItem;

	const navItems: NavEntry[] = [
		{ section: 'ОСНОВНИ' },
		{ id: 'dashboard', label: 'Табло', icon: 'dashboard', href: '/dashboard' },
		{
			id: 'clients',
			label: 'Клиенти',
			icon: 'building',
			href: '/clients',
			roles: ['admin', 'manager', 'employee', 'accountant']
		},
		{
			id: 'projects',
			label: 'Проекти',
			icon: 'folder',
			href: '/projects',
			active: (p) => p.startsWith('/projects'),
			roles: ['admin', 'manager', 'employee', 'accountant']
		},

		{ section: 'ФАКТУРИРАНЕ' },
		{
			id: 'time-logs',
			label: 'Времелог',
			icon: 'clock',
			href: '/time-logs',
			active: (p) => p.startsWith('/time-logs'),
			roles: ['admin', 'manager', 'employee', 'accountant']
		},
		{
			id: 'invoiceable',
			label: 'Фактурируема работа',
			icon: 'activity',
			href: '/invoiceable-work',
			roles: ['admin', 'manager', 'accountant']
		},
		{
			id: 'invoices',
			label: 'Фактури',
			icon: 'receipt',
			href: '/invoices',
			active: (p) => p.startsWith('/invoices'),
			roles: ['admin', 'accountant']
		},
		{
			id: 'expenses',
			label: 'Разходи',
			icon: 'file',
			href: '/expenses',
			roles: ['admin', 'manager', 'accountant']
		},

		{ section: 'ФИНАНСИ' },
		{
			id: 'bank',
			label: 'Банка и каса',
			icon: 'bank',
			href: '/bank-statements',
			active: (p) => p.startsWith('/bank-statements') || p === '/cashflow',
			roles: ['admin', 'accountant']
		},
		{
			id: 'reports',
			label: 'Отчети',
			icon: 'chart',
			href: '/reports/billing',
			active: (p) => p.startsWith('/reports'),
			roles: ['admin', 'accountant', 'manager']
		},

		{ section: 'АДМИНИСТРАЦИЯ' },
		{ id: 'users', label: 'Потребители', icon: 'users', href: '/users', roles: ['admin'] },
		{ id: 'settings', label: 'Настройки', icon: 'settings', href: '/settings', roles: ['admin'] },
		{
			id: 'audit',
			label: 'Одитен журнал',
			icon: 'activity',
			href: '/audit',
			roles: ['admin', 'accountant']
		}
	];

	const pageLabels: Record<string, string> = {
		'/dashboard': 'Табло',
		'/clients': 'Клиенти',
		'/projects': 'Проекти',
		'/time-logs': 'Времелог',
		'/invoiceable-work': 'Фактурируема работа',
		'/invoices': 'Фактури',
		'/expenses': 'Разходи',
		'/bank-statements': 'Банка и каса',
		'/cashflow': 'Финанси',
		'/reports/billing': 'Отчети',
		'/reports/expenses': 'Отчети',
		'/reports/profitability': 'Отчети',
		'/reports/cash-position': 'Отчети',
		'/users': 'Потребители',
		'/settings': 'Настройки',
		'/audit': 'Одитен журнал'
	};

	const roleLabels: Record<string, string> = {
		admin: 'administrator',
		manager: 'manager',
		employee: 'employee',
		accountant: 'accountant'
	};

	function isSection(entry: NavEntry): entry is NavSection {
		return 'section' in entry;
	}

	function isVisible(item: NavItem): boolean {
		if (!item.roles) return true;
		return item.roles.includes(data.user.role);
	}

	function isActive(item: NavItem): boolean {
		const p = page.url.pathname;
		if (item.active) return item.active(p);
		return p === item.href;
	}

	const pageLabel = $derived(
		(() => {
			const p = page.url.pathname;
			const exact = pageLabels[p];
			if (exact) return exact;
			const prefix = Object.keys(pageLabels).find((k) => p.startsWith(k + '/'));
			return prefix ? pageLabels[prefix] : '';
		})()
	);

	const initials = $derived(
		`${data.user.firstName?.[0] ?? ''}${data.user.lastName?.[0] ?? ''}`.toUpperCase()
	);
</script>

<div class="app-shell">
	<aside class="sidebar">
		<div class="sb-brand">
			<div class="sb-logo">И</div>
			<div class="col">
				<div class="sb-brand-text">Иномедия</div>
				<div class="sb-brand-sub">v1.0 · {roleLabels[data.user.role] ?? data.user.role}</div>
			</div>
		</div>

		<nav class="sb-nav">
			{#each navItems as entry}
				{#if isSection(entry)}
					<div class="sb-section">{entry.section}</div>
				{:else if isVisible(entry)}
					<a
						href={entry.href}
						class="sb-item"
						class:active={isActive(entry)}
					>
						<span class="sb-icon"><Icon name={entry.icon} size={15} /></span>
						<span>{entry.label}</span>
						{#if entry.badge}
							<span class="sb-badge" class:alert={entry.alert}>{entry.badge}</span>
						{/if}
					</a>
				{/if}
			{/each}
		</nav>

		<div class="sb-footer">
			<div class="sb-avatar">{initials}</div>
			<div class="col" style="flex: 1; min-width: 0;">
				<div class="sb-user-name">{data.user.firstName} {data.user.lastName}</div>
				<div class="sb-user-role">{roleLabels[data.user.role] ?? data.user.role}</div>
			</div>
			<form method="POST" action="/logout" style="flex-shrink: 0;">
				<button type="submit" class="topbar-icon-btn" title="Изход">
					<Icon name="logout" size={14} />
				</button>
			</form>
		</div>
	</aside>

	<div class="main">
		<div class="topbar">
			<div class="topbar-crumbs">
				<span>Иномедия ООД</span>
				{#if pageLabel}
					<span class="crumb-sep">/</span>
					<span class="crumb-current">{pageLabel}</span>
				{/if}
			</div>
			<div class="topbar-search">
				<Icon name="search" size={13} />
				<span>Търсене...</span>
				<kbd>⌘K</kbd>
			</div>
			<div class="topbar-actions">
				<button class="topbar-icon-btn" title="Известия">
					<Icon name="bell" size={15} />
				</button>
				<a href="/settings" class="topbar-icon-btn" title="Настройки">
					<Icon name="settings" size={15} />
				</a>
			</div>
		</div>

		<div class="content">
			{@render children()}
		</div>
	</div>
</div>
