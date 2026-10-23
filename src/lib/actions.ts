// Browser-side actions: PDF download, CSV download, clipboard, JSON backup.
//
// PDF and CSV go through the two SvelteKit server routes (the only server code in
// this app). Everything else is pure browser work.

import { app } from './app.svelte.ts';
import { plain } from './core/store.ts';
import type { DocView } from './core/select.ts';
import { buildRenderDoc, copySummary } from './doc/model.ts';
import type { RenderDoc } from './doc/model.ts';

function saveBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The PDF writer embeds JPEG only, so PNG/SVG logos are converted here (on a white
 * matte) before being posted. Keeps the server route dependency free.
 */
async function toJpegDataUrl(dataUrl: string, maxEdge = 420): Promise<string> {
	if (!dataUrl) return '';
	if (/^data:image\/jpe?g;base64,/i.test(dataUrl)) return dataUrl;
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const im = new Image();
			im.onload = () => resolve(im);
			im.onerror = () => reject(new Error('image'));
			im.src = dataUrl;
		});
		const scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round((img.width || maxEdge) * scale));
		canvas.height = Math.max(1, Math.round((img.height || maxEdge) * scale));
		const ctx = canvas.getContext('2d');
		if (!ctx) return '';
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL('image/jpeg', 0.9);
	} catch {
		return '';
	}
}

/** Downloads the PDF for a document in the given template. */
export async function downloadPdf(view: DocView, template?: RenderDoc['template']) {
	try {
		const render = buildRenderDoc(plain(app.data), view);
		if (template) render.template = template;
		render.business.logo = await toJpegDataUrl(render.business.logo);
		render.signature = await toJpegDataUrl(render.signature, 320);
		const res = await fetch('/api/pdf', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ render })
		});
		if (!res.ok) {
			const msg = await res.json().catch(() => ({ error: 'PDF generation failed.' }));
			app.toast(msg.error ?? 'PDF generation failed.', 'error');
			return;
		}
		saveBlob(await res.blob(), render.fileName);
		app.toast(`Downloaded ${render.fileName}`, 'success');
	} catch (err) {
		app.toast(`Could not create the PDF: ${(err as Error).message}`, 'error');
	}
}

/** Downloads CSV text through the export route. */
export async function downloadCsv(csv: string, fileName: string) {
	try {
		const res = await fetch('/api/csv', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ csv, fileName })
		});
		if (!res.ok) {
			const msg = await res.json().catch(() => ({ error: 'CSV export failed.' }));
			app.toast(msg.error ?? 'CSV export failed.', 'error');
			return;
		}
		saveBlob(await res.blob(), fileName);
		app.toast(`Downloaded ${fileName}`, 'success');
	} catch (err) {
		app.toast(`Could not export the CSV: ${(err as Error).message}`, 'error');
	}
}

export async function copyText(text: string, label = 'Copied to clipboard.') {
	try {
		await navigator.clipboard.writeText(text);
		app.toast(label, 'success');
	} catch {
		// Clipboard API is blocked in some browsers; fall back to a temporary textarea.
		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			ta.remove();
			app.toast(label, 'success');
		} catch {
			app.toast('Copying is blocked in this browser. Select the text and copy it manually.', 'error');
		}
	}
}

export function copyDocSummary(view: DocView) {
	return copyText(copySummary(plain(app.data), view), 'Summary copied. Paste it into WhatsApp or email.');
}

/** JSON backup: downloads the whole dataset and records the backup date. */
export function exportBackup() {
	const data = plain(app.data);
	const stamp = new Date().toISOString().slice(0, 10);
	saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `invoicenest-backup-${stamp}.json`);
	app.markBackedUp();
	app.toast('Backup downloaded. Keep it somewhere safe.', 'success');
}

/** Restores a JSON backup, replacing everything currently stored. */
export async function importBackup(file: File): Promise<boolean> {
	try {
		const text = await file.text();
		const parsed = JSON.parse(text);
		if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.docs)) {
			app.toast('That file does not look like an InvoiceNest backup.', 'error');
			return false;
		}
		app.replace(parsed, 'Backup restored.');
		return true;
	} catch (err) {
		app.toast(`Could not read that backup: ${(err as Error).message}`, 'error');
		return false;
	}
}
