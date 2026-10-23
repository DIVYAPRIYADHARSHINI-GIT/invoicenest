// PDF generation route.
//
// The browser posts the already-computed RenderDoc (built by src/lib/doc/model.ts
// from the same data as the on-screen preview) and gets back PDF bytes. Nothing is
// stored on the server: the request is rendered and discarded. No database, no
// blob storage, no external service.

import { json, type RequestHandler } from '@sveltejs/kit';
import { renderInvoicePdf } from '$lib/doc/pdf.ts';
import type { RenderDoc } from '$lib/doc/model.ts';

export const POST: RequestHandler = async ({ request }) => {
	let payload: { render?: RenderDoc };
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}
	const doc = payload?.render;
	if (!doc || typeof doc !== 'object' || !Array.isArray(doc.rows)) {
		return json({ error: 'Missing document data.' }, { status: 400 });
	}
	try {
		const bytes = renderInvoicePdf(doc);
		const name = (doc.fileName || 'invoice.pdf').replace(/[^\w.\-]/g, '');
		return new Response(new Uint8Array(bytes) as unknown as BodyInit, {
			headers: {
				'content-type': 'application/pdf',
				'content-disposition': `attachment; filename="${name}"`,
				'cache-control': 'no-store'
			}
		});
	} catch (err) {
		return json({ error: `Could not build the PDF: ${(err as Error).message}` }, { status: 500 });
	}
};
