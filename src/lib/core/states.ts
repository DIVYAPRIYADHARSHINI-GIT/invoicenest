// Official GST state codes (first two digits of a GSTIN).
// Source: einvoice1.gst.gov.in/Others/MasterCodes and docs.ewaybillgst.gov.in.
// Code 25 (Daman and Diu) was merged into 26 in August 2020; it is kept here so
// older GSTINs still validate, but it is flagged as legacy and hidden from pickers.

export interface GstState {
	code: string;
	name: string;
	legacy?: boolean;
}

export const GST_STATES: GstState[] = [
	{ code: '01', name: 'Jammu and Kashmir' },
	{ code: '02', name: 'Himachal Pradesh' },
	{ code: '03', name: 'Punjab' },
	{ code: '04', name: 'Chandigarh' },
	{ code: '05', name: 'Uttarakhand' },
	{ code: '06', name: 'Haryana' },
	{ code: '07', name: 'Delhi' },
	{ code: '08', name: 'Rajasthan' },
	{ code: '09', name: 'Uttar Pradesh' },
	{ code: '10', name: 'Bihar' },
	{ code: '11', name: 'Sikkim' },
	{ code: '12', name: 'Arunachal Pradesh' },
	{ code: '13', name: 'Nagaland' },
	{ code: '14', name: 'Manipur' },
	{ code: '15', name: 'Mizoram' },
	{ code: '16', name: 'Tripura' },
	{ code: '17', name: 'Meghalaya' },
	{ code: '18', name: 'Assam' },
	{ code: '19', name: 'West Bengal' },
	{ code: '20', name: 'Jharkhand' },
	{ code: '21', name: 'Odisha' },
	{ code: '22', name: 'Chhattisgarh' },
	{ code: '23', name: 'Madhya Pradesh' },
	{ code: '24', name: 'Gujarat' },
	{ code: '25', name: 'Daman and Diu (merged into 26)', legacy: true },
	{ code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
	{ code: '27', name: 'Maharashtra' },
	{ code: '29', name: 'Karnataka' },
	{ code: '30', name: 'Goa' },
	{ code: '31', name: 'Lakshadweep' },
	{ code: '32', name: 'Kerala' },
	{ code: '33', name: 'Tamil Nadu' },
	{ code: '34', name: 'Puducherry' },
	{ code: '35', name: 'Andaman and Nicobar Islands' },
	{ code: '36', name: 'Telangana' },
	{ code: '37', name: 'Andhra Pradesh' },
	{ code: '38', name: 'Ladakh' },
	{ code: '97', name: 'Other Territory' },
	{ code: '99', name: 'Other Countries' }
];

const BY_CODE = new Map(GST_STATES.map((s) => [s.code, s]));

export const stateName = (code: string): string => BY_CODE.get(code)?.name ?? '';
export const isStateCode = (code: string): boolean => BY_CODE.has(code);
/** States offered in pickers (legacy codes excluded). */
export const pickableStates = (): GstState[] => GST_STATES.filter((s) => !s.legacy);
