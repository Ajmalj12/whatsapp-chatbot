import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { active } = body;

        const doctor = await prisma.doctor.update({
            where: { id },
            data: { active },
        });

        return NextResponse.json(doctor);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update doctor' }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Delete related availability and appointments first or handle cascading?
        // Prisma cascading should be defined in schema, but for safety in demo:
        await prisma.appointment.deleteMany({ where: { doctorId: id } });
        await prisma.availability.deleteMany({ where: { doctorId: id } });

        await prisma.doctor.delete({
            where: { id },
        });

        return NextResponse.json({ message: 'Doctor deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        return NextResponse.json({ error: 'Failed to delete doctor' }, { status: 500 });
    }
}
