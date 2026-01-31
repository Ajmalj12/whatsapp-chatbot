import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const appointments = await prisma.appointment.findMany({
            include: {
                doctor: true,
                availability: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        return NextResponse.json(appointments);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { doctorId, availabilityId, patientName, patientAge, patientPhone, reason } = body;

        // Update availability to booked
        await prisma.availability.update({
            where: { id: availabilityId },
            data: { isBooked: true },
        });

        const appointment = await prisma.appointment.create({
            data: {
                doctorId,
                availabilityId,
                patientName,
                patientAge,
                patientPhone,
                reason,
            },
        });
        return NextResponse.json(appointment);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to book appointment' }, { status: 500 });
    }
}
