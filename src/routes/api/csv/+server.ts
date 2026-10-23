// CSV export route. The browser posts already-built CSV text (assembled by
// src/lib/core/csv.ts so the numbers match the PDF exactly) and this route just
// returns it with download headers. Nothing is stored server-side.

import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	let payload: { csv?: string; fileName?: string };
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}
	if (typeof payload?.csv !== 'string' || !payload.csv) {
		return json({ error: 'Missing CSV content.' }, { status: 400 });
	}
	if (payload.csv.length > 8_000_000) {
		return json({ error: 'That export is too large. Narrow the filters and try again.' }, { status: 413 });
	}
	const name = (payload.fileName || 'export.csv').replace(/[^\w.\-]/g, '') || 'export.csv';
	return new Response(payload.csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${name}"`,
			'cache-control': 'no-store'
		}
	});
};
