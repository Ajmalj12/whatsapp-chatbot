import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const [totalDoctors, todayAppointments, activeSlots, totalPatients] = await Promise.all([
            prisma.doctor.count({ where: { active: true } }),
            prisma.appointment.count({
                where: {
                    availability: {
                        startTime: { gte: startOfToday, lte: endOfToday },
                    },
                },
            }),
            prisma.availability.count({
                where: {
                    isBooked: false,
                    startTime: { gte: now },
                },
            }),
            prisma.appointment.count(),
        ]);

        return NextResponse.json({
            totalDoctors,
            todayAppointments,
            activeSlots,
            totalPatients,
        });
    } catch (error) {
        console.error('[Stats API]', error);
        return NextResponse.json(
            { error: 'Failed to fetch stats' },
            { status: 500 }
        );
    }
}
