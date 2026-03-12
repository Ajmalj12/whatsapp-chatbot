export function normalizePhone(value: string | null | undefined): string {
    if (!value) return '';
    const digits = value.replace(/\D/g, '');
    return digits.replace(/^0+/, '');
}

