import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { startOfDay, endOfDay, subDays } from 'date-fns';

export async function GET() {
    try {
        const now = new Date();
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);
        const weekStart = startOfDay(subDays(now, 7));

        const [
            totalAppointments,
            bookedCount,
            cancelledCount,
            todayAppointments,
            weekAppointments,
            openTickets,
            resolvedTickets,
            sessionCount,
        ] = await Promise.all([
            prisma.appointment.count(),
            prisma.appointment.count({ where: { status: 'Booked' } }),
            prisma.appointment.count({ where: { status: 'Cancelled' } }),
            prisma.appointment.count({
                where: {
                    createdAt: { gte: todayStart, lte: todayEnd },
                    status: 'Booked',
                },
            }),
            prisma.appointment.count({
                where: {
                    createdAt: { gte: weekStart, lte: now },
                    status: 'Booked',
                },
            }),
            prisma.supportTicket.count({ where: { status: 'OPEN' } }),
            prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
            prisma.session.count(),
        ]);

        return NextResponse.json({
            totalAppointments,
            bookedCount,
            cancelledCount,
            todayAppointments,
            weekAppointments,
            openTickets,
            resolvedTickets,
            sessionCount,
        });
    } catch (error) {
        console.error('[API reports]', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch reports' },
            { status: 500 }
        );
    }
}
