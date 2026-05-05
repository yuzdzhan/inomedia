<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>Иномедия</title>
</svelte:head>

{@render children()}

<style>
	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		font-family: 'Segoe UI', system-ui, sans-serif;
		background: #f8fafc;
		color: #0f172a;
		font-size: 15px;
		line-height: 1.5;
	}

	:global(button) {
		cursor: pointer;
	}

	:global(a) {
		color: #2563eb;
		text-decoration: none;
	}

	:global(a:hover) {
		text-decoration: underline;
	}
</style>
