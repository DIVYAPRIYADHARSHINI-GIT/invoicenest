// Logo and signature handling: resize + compress in the browser to a data URL
// under a hard byte budget, because the image is stored inside localStorage.

export const MAX_LOGO_BYTES = 150_000; // 150 KB as required
export const MAX_LOGO_EDGE = 480;
export const MAX_SIGNATURE_EDGE = 600;

/** Rough decoded size of a data URL in bytes. */
export function dataUrlBytes(dataUrl: string): number {
	const comma = dataUrl.indexOf(',');
	if (comma < 0) return 0;
	const b64 = dataUrl.slice(comma + 1);
	return Math.floor((b64.length * 3) / 4);
}

export interface CompressResult {
	dataUrl: string;
	bytes: number;
	width: number;
	height: number;
}

/**
 * Reads an image file, scales it to fit `maxEdge` and compresses to JPEG/PNG until
 * it fits `maxBytes`. PNG is kept when the source has transparency (logos often do)
 * unless that cannot meet the budget, in which case it falls back to white-matted JPEG.
 */
export async function compressImage(file: File, maxEdge = MAX_LOGO_EDGE, maxBytes = MAX_LOGO_BYTES): Promise<CompressResult> {
	if (!file.type.startsWith('image/')) throw new Error('Choose an image file (PNG, JPG, WEBP or SVG).');
	if (file.size > 12_000_000) throw new Error('That image is very large. Choose a file under 12 MB.');

	const bitmap = await loadBitmap(file);
	const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
	const w = Math.max(1, Math.round(bitmap.width * scale));
	const h = Math.max(1, Math.round(bitmap.height * scale));

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('This browser could not process the image.');
	ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

	// Try PNG first (keeps transparency), then JPEG at falling quality.
	const png = canvas.toDataURL('image/png');
	if (dataUrlBytes(png) <= maxBytes) return { dataUrl: png, bytes: dataUrlBytes(png), width: w, height: h };

	for (const q of [0.92, 0.85, 0.75, 0.65, 0.55, 0.45]) {
		const jpeg = canvas.toDataURL('image/jpeg', q);
		const bytes = dataUrlBytes(jpeg);
		if (bytes <= maxBytes) return { dataUrl: jpeg, bytes, width: w, height: h };
	}

	// Last resort: halve the dimensions once and retry at low quality.
	const small = document.createElement('canvas');
	small.width = Math.max(1, Math.round(w / 2));
	small.height = Math.max(1, Math.round(h / 2));
	small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height);
	const last = small.toDataURL('image/jpeg', 0.6);
	const bytes = dataUrlBytes(last);
	if (bytes > maxBytes) throw new Error('That image could not be compressed under 150 KB. Try a simpler logo.');
	return { dataUrl: last, bytes, width: small.width, height: small.height };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
	// SVG and some formats need the <img> path; createImageBitmap is faster when available.
	if (file.type !== 'image/svg+xml' && typeof createImageBitmap === 'function') {
		try {
			return await createImageBitmap(file);
		} catch {
			/* fall through to the <img> path */
		}
	}
	const url = URL.createObjectURL(file);
	try {
		return await new Promise<HTMLImageElement>((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error('That image could not be read.'));
			img.src = url;
		});
	} finally {
		// Revoked on the next tick so decoding has finished.
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}
}
