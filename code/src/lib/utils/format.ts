const SOFIA_TZ = 'Europe/Sofia';

// For date-only fields (stored as UTC midnight): slice ISO string directly — no locale/ICU needed.
export function fmtDate(date: Date | string | null | undefined): string {
	if (!date) return '—';
	const iso = typeof date === 'string' ? date : date.toISOString();
	const [year, month, day] = iso.slice(0, 10).split('-');
	return `${day}.${month}.${year}`;
}

// DD.MM — no year, for compact displays.
export function fmtDateShort(date: Date | string | null | undefined): string {
	if (!date) return '—';
	const iso = typeof date === 'string' ? date : date.toISOString();
	const [, month, day] = iso.slice(0, 10).split('-');
	return `${day}.${month}`;
}

// For timestamps (createdAt etc.): DD.MM.YYYY HH:MM in Sofia timezone.
export function fmtDateTime(date: Date | string | null | undefined): string {
	if (!date) return '—';
	const d = typeof date === 'string' ? new Date(date) : date;
	const parts = new Intl.DateTimeFormat('en-GB', {
		day: '2-digit', month: '2-digit', year: 'numeric',
		hour: '2-digit', minute: '2-digit', hour12: false,
		timeZone: SOFIA_TZ
	}).formatToParts(d);
	const v: Record<string, string> = {};
	for (const p of parts) v[p.type] = p.value;
	return `${v.day}.${v.month}.${v.year} ${v.hour}:${v.minute}`;
}
