/**
 * Helpers for formatting bot replies (bullet lists, doctor names).
 */

/** Avoid "Dr. Dr.": use name as-is if it already starts with Dr, otherwise prefix "Dr. " */
export function formatDoctorName(name: string): string {
    const trimmed = (name || '').trim();
    if (/^dr\.?\s/i.test(trimmed)) return trimmed;
    return trimmed ? `Dr. ${trimmed}` : '';
}

/** Format items as a bullet list (one per line). */
export function formatBulletList(items: string[], bullet = '•'): string {
    return items.map((i) => `${bullet} ${i}`).join('\n');
}
