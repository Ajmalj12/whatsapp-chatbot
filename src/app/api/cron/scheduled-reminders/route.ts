import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

/**
 * Cron endpoint: send due ScheduledReminder (e.g. demo reminder 30 min after schedule).
 * Call via GET every 1–5 min (e.g. Vercel Cron or external scheduler).
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

        const now = new Date();
        const due = await prisma.scheduledReminder.findMany({
            where: {
                status: 'PENDING',
                sendAt: { lte: now },
            },
        });

        let sent = 0;
        for (const reminder of due) {
            const phone = reminder.phone;
            const msg = `Hi 👍 Reminder for your demo appointment. Reply 1 to confirm or 2 to reschedule.`;

            try {
                await sendWhatsAppMessage(phone, msg);
            } catch (err) {
                console.error(`[Cron scheduled-reminders] Failed to send to ${phone}:`, err);
                continue;
            }

            await prisma.session.upsert({
                where: { phone },
                create: {
                    phone,
                    currentStep: 'REMINDER_REPLY',
                    data: JSON.stringify({ demo: true }),
                },
                update: {
                    currentStep: 'REMINDER_REPLY',
                    data: JSON.stringify({ demo: true }),
                },
            });

            await prisma.scheduledReminder.update({
                where: { id: reminder.id },
                data: { status: 'SENT' },
            });
            sent++;
        }

        return NextResponse.json({ status: 'ok', sent });
    } catch (error) {
        console.error('[Cron scheduled-reminders]', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Scheduled reminders failed' },
            { status: 500 }
        );
    }
}
