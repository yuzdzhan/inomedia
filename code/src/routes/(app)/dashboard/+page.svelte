<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Начало – Иномедия</title>
</svelte:head>

<h1>Добре дошли, {data.user.firstName}!</h1>
<p style="color: #64748b; margin-top: 8px;">Системата е активна и готова за работа.</p>
