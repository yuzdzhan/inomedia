<script lang="ts">
	import { onMount } from 'svelte';

	type EChartInstance = {
		setOption(o: Record<string, unknown>, notMerge?: boolean): void;
		dispose(): void;
		resize(): void;
	};

	let { options, height = '280px' }: { options: Record<string, unknown>; height?: string } = $props();

	let chart: EChartInstance | null = $state(null);
	let el: HTMLDivElement;

	$effect(() => {
		const o = options;
		chart?.setOption(o, true);
	});

	onMount(() => {
		let instance: EChartInstance | null = null;
		let ro: ResizeObserver | null = null;

		import('echarts').then(({ init }) => {
			instance = init(el) as unknown as EChartInstance;
			instance.setOption(options);
			chart = instance;

			ro = new ResizeObserver(() => instance?.resize());
			ro.observe(el);
		});

		return () => {
			ro?.disconnect();
			instance?.dispose();
			chart = null;
		};
	});
</script>

<div bind:this={el} style="width:100%;height:{height};"></div>
