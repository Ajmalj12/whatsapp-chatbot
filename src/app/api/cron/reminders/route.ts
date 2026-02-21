import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { startOfDay, endOfDay, addDays } from 'date-fns';

/**
 * Cron endpoint: find appointments scheduled for tomorrow, send reminder,
 * and set session to REMINDER_REPLY so webhook can handle 1/2.
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

        const now = new Date();
        const tomorrowStart = startOfDay(addDays(now, 1));
        const tomorrowEnd = endOfDay(addDays(now, 1));

        const slots = await prisma.availability.findMany({
            where: {
                isBooked: true,
                startTime: {
                    gte: tomorrowStart,
                    lte: tomorrowEnd,
                },
            },
            include: {
                appointment: {
                    include: { doctor: true },
                },
            },
        });

        let remindersSent = 0;
        for (const slot of slots) {
            const apt = slot.appointment;
            if (!apt || apt.status !== 'Booked') continue;

            const timeStr = new Date(slot.startTime).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            });
            const msg = `Hi 👍 Reminder for your appointment tomorrow at ${timeStr}.\nReply 1 to confirm or 2 to reschedule.`;

            const phone = apt.patientPhone.replace(/\D/g, '').replace(/^0/, '');
            if (!phone) continue;

            await sendWhatsAppMessage(phone, msg);

            await prisma.session.upsert({
                where: { phone },
                create: {
                    phone,
                    currentStep: 'REMINDER_REPLY',
                    data: JSON.stringify({ appointmentId: apt.id }),
                },
                update: {
                    currentStep: 'REMINDER_REPLY',
                    data: JSON.stringify({ appointmentId: apt.id }),
                },
            });
            remindersSent++;
        }

        return NextResponse.json({
            status: 'ok',
            remindersSent,
        });
    } catch (error) {
        console.error('[Cron reminders]', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Reminders failed' },
            { status: 500 }
        );
    }
}
