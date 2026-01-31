import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const doctors = await prisma.doctor.findMany({
            include: {
                availability: true,
            },
        });
        return NextResponse.json(doctors);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch doctors' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, department } = body;
        const doctor = await prisma.doctor.create({
            data: { name, department },
        });
        return NextResponse.json(doctor);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create doctor' }, { status: 500 });
    }
}
