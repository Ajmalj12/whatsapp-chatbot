import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { findNextAvailableSlot } from '@/lib/slotMatcher';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const department = searchParams.get('department');

        if (!department) {
            return NextResponse.json({
                error: 'Department parameter is required'
            }, { status: 400 });
        }

        // Fetch doctors in the department
        const doctors = await prisma.doctor.findMany({
            where: {
                department: {
                    contains: department,
                    mode: 'insensitive'
                },
                active: true
            },
            include: {
                availability: {
                    where: {
                        isBooked: false,
                        startTime: { gte: new Date() }
                    },
                    orderBy: { startTime: 'asc' },
                    take: 1
                }
            }
        });

        // Add next available slot info to each doctor
        const doctorsWithSlots = await Promise.all(
            doctors.map(async (doctor) => {
                const nextSlot = await findNextAvailableSlot(doctor.id);
                return {
                    id: doctor.id,
                    name: doctor.name,
                    department: doctor.department,
                    specialization: doctor.specialization,
                    consultationHours: doctor.consultationHours,
                    nextAvailableSlot: nextSlot
                };
            })
        );

        return NextResponse.json({
            department,
            doctors: doctorsWithSlots
        });
    } catch (error) {
        console.error('Fetch Doctors by Department Error:', error);
        return NextResponse.json({
            error: 'Failed to fetch doctors',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
