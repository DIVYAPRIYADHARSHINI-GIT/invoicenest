<script lang="ts">
	// Accessible confirmation dialog for destructive actions.
	// Uses the native <dialog> element so focus trapping and Esc come for free.
	interface Props {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let { open = $bindable(), title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onconfirm, oncancel }: Props = $props();

	let el = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (!el) return;
		if (open && !el.open) el.showModal();
		if (!open && el.open) el.close();
	});
</script>

<dialog
	bind:this={el}
	aria-labelledby="confirm-title"
	onclose={() => {
		if (open) {
			open = false;
			oncancel();
		}
	}}
	oncancel={(e) => {
		e.preventDefault();
		open = false;
		oncancel();
	}}
>
	<h2 id="confirm-title">{title}</h2>
	<p>{message}</p>
	<div class="btn-row dialog-actions">
		<button
			class="btn"
			onclick={() => {
				open = false;
				oncancel();
			}}>{cancelLabel}</button
		>
		<button
			class="btn {danger ? 'btn-danger' : 'btn-primary'}"
			onclick={() => {
				open = false;
				onconfirm();
			}}>{confirmLabel}</button
		>
	</div>
</dialog>

<style>
	dialog {
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		padding: 1.25rem;
		max-width: min(440px, calc(100vw - 2rem));
		box-shadow: var(--shadow);
	}

	dialog::backdrop {
		background: rgba(27, 36, 64, 0.45);
	}

	dialog h2 {
		font-size: 1.05rem;
		margin-bottom: 0.5rem;
	}

	dialog p {
		color: var(--muted);
		font-size: 0.92rem;
		margin-bottom: 1.1rem;
	}

	.dialog-actions {
		justify-content: flex-end;
	}
</style>
