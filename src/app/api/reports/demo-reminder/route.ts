import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').replace(/^0/, '');
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { phone } = body;
        if (!phone || typeof phone !== 'string') {
            return NextResponse.json({ error: 'phone is required' }, { status: 400 });
        }
        const normalized = normalizePhone(phone);
        if (!normalized) {
            return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
        }

        const sendAt = new Date(Date.now() + 30 * 60 * 1000);

        await prisma.scheduledReminder.create({
            data: {
                phone: normalized,
                sendAt,
                type: 'DEMO',
                status: 'PENDING',
            },
        });

        return NextResponse.json({ scheduledAt: sendAt.toISOString() });
    } catch (error) {
        console.error('[API demo-reminder]', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to schedule reminder' },
            { status: 500 }
        );
    }
}
