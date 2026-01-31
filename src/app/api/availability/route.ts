import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const availability = await prisma.availability.findMany({
            include: {
                doctor: true,
            },
        });
        return NextResponse.json(availability);
    } catch (error) {
        console.error('Prisma Fetch Error (Availability):', error);
        return NextResponse.json({
            error: 'Failed to fetch availability',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { doctorId, startTime, endTime } = body;
        const availability = await prisma.availability.create({
            data: {
                doctorId,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
            },
        });
        return NextResponse.json(availability);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create availability' }, { status: 500 });
    }
}
