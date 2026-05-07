<script lang="ts">
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Вход – Иномедия</title>
</svelte:head>

<div style="height:100%; display:grid; place-items:center; background:var(--surface); position:relative; overflow:hidden;">
	<div style="position:absolute; inset:0; background:radial-gradient(ellipse at top right, rgba(79,70,229,0.06), transparent 50%); pointer-events:none;"></div>
	<div style="width:380px; padding:32px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:var(--r-lg); box-shadow:var(--sh-md); position:relative;">
		<div class="row gap-3" style="margin-bottom:28px;">
			<div class="sb-logo" style="width:32px; height:32px; font-size:16px;">И</div>
			<div class="col">
				<div style="font-weight:600; font-size:16px;">Иномедия ООД</div>
				<div class="amount muted" style="font-size:11px;">internal · v0.4.0</div>
			</div>
		</div>

		<h1 style="font-size:22px; font-weight:600; letter-spacing:-0.015em; margin:0 0 6px 0;">Влез в системата</h1>
		<p class="muted" style="font-size:13px; margin:0 0 24px 0;">Достъп само за служители на компанията.</p>

		{#if data.bootstrapped}
			<div class="alert warning" style="margin-bottom:16px; font-size:13px;">
				Системата е инициализирана успешно. Влезте с администраторския акаунт.
			</div>
		{/if}
		{#if form?.error}
			<div class="alert danger" style="margin-bottom:16px; font-size:13px;">{form.error}</div>
		{/if}

		<form method="POST">
			<div class="field">
				<label class="label" for="email">Имейл</label>
				<input class="input" id="email" name="email" type="email" value={form?.email ?? ''} autocomplete="email" required autofocus />
			</div>
			<div class="field">
				<label class="label" for="password">Парола</label>
				<input class="input" id="password" name="password" type="password" autocomplete="current-password" required />
			</div>
			<button type="submit" class="btn btn-primary btn-lg" style="width:100%; margin-top:8px;">Вход</button>
		</form>

		<div class="row gap-2" style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border); justify-content:center; font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">
			<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
				<path d="M7 11V7a5 5 0 0 1 10 0v4"/>
			</svg>
			<span>Защитено с 2FA · IP whitelist</span>
		</div>
	</div>
</div>
