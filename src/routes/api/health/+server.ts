// Liveness probe used by the e2e suite. Confirms the only server-side features in
// this app are PDF and CSV generation - there is no database to report on.

import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () =>
	json({
		ok: true,
		app: 'InvoiceNest',
		storage: 'browser-localStorage-only',
		serverFeatures: ['pdf', 'csv'],
		database: false
	});
