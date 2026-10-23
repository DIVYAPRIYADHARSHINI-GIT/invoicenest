<script lang="ts">
	import { app } from '$lib/app.svelte.ts';
</script>

<div class="toast-stack" role="status" aria-live="polite">
	{#each app.toasts as toast (toast.id)}
		<div class="toast toast-{toast.tone}">
			<span>{toast.message}</span>
			<button class="toast-x" onclick={() => app.dismiss(toast.id)} aria-label="Dismiss message">&times;</button>
		</div>
	{/each}
</div>

<style>
	.toast-stack {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		z-index: 90;
		display: grid;
		gap: 0.5rem;
		max-width: min(400px, calc(100vw - 2rem));
	}

	@media (max-width: 900px) {
		.toast-stack {
			bottom: calc(var(--tabbar-h) + 1rem);
			left: 1rem;
			right: 1rem;
			max-width: none;
		}
	}

	.toast {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.7rem 0.85rem;
		border-radius: var(--radius-sm);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		box-shadow: var(--shadow);
		font-size: 0.88rem;
		animation: slide-in 0.18s ease-out;
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}

	.toast-success {
		border-color: color-mix(in srgb, var(--good) 45%, transparent);
		color: var(--good);
	}

	.toast-error {
		border-color: color-mix(in srgb, var(--bad) 45%, transparent);
		color: var(--bad);
	}

	.toast-x {
		margin-left: auto;
		background: none;
		border: none;
		color: inherit;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.15rem;
		min-width: 24px;
		min-height: 24px;
	}
</style>
