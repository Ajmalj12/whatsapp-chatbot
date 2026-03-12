import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

const INACTIVITY_MINUTES = 10;
const CLOSING_MESSAGE =
    'Thank you for contacting us. This session has been closed due to inactivity. Feel free to message again anytime.';

/**
 * Cron endpoint: find sessions inactive for 10+ minutes, send thank-you message, and delete session.
 * Excludes phones with an open support ticket.
 * Call via GET (e.g. Vercel Cron or external scheduler).
 */
export async function GET(req: Request) {
    try {
        if (process.env.CRON_SECRET) {
            const authHeader = req.headers.get('authorization');
            const secret = authHeader?.replace(/^Bearer\s+/i, '') || new URL(req.url).searchParams.get('secret');
            if (secret !== process.env.CRON_SECRET) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const cutoff = new Date(Date.now() - INACTIVITY_MINUTES * 60 * 1000);

        const inactiveSessions = await prisma.session.findMany({
            where: { updatedAt: { lt: cutoff } },
        });

        const closedPhones: string[] = [];

        for (const session of inactiveSessions) {
            const openTicket = await prisma.supportTicket.findFirst({
                where: { phone: session.phone, status: 'OPEN' },
            });
            if (openTicket) continue;

            try {
                await sendWhatsAppMessage(session.phone, CLOSING_MESSAGE);
                await prisma.session.delete({ where: { phone: session.phone } });
                closedPhones.push(session.phone);
            } catch (err) {
                console.error(`[session-timeout] Failed to close session for ${session.phone}:`, err);
            }
        }

        return NextResponse.json({
            closed: closedPhones.length,
            phones: closedPhones,
        });
    } catch (error) {
        console.error('[session-timeout] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
