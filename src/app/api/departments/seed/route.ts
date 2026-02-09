import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST() {
    try {
        const departments = [
            { name: 'Cardiology', description: 'Heart and cardiovascular care', icon: '❤️', displayOrder: 1 },
            { name: 'Orthopedics', description: 'Bone and joint treatment', icon: '🦴', displayOrder: 2 },
            { name: 'Pediatrics', description: 'Child healthcare', icon: '👶', displayOrder: 3 },
            { name: 'Neurology', description: 'Brain and nervous system', icon: '🧠', displayOrder: 4 },
            { name: 'General Medicine', description: 'General health consultation', icon: '🩺', displayOrder: 5 },
            { name: 'Dermatology', description: 'Skin and hair care', icon: '✨', displayOrder: 6 },
            { name: 'ENT', description: 'Ear, Nose, and Throat', icon: '👂', displayOrder: 7 },
            { name: 'Ophthalmology', description: 'Eye care and vision', icon: '👁️', displayOrder: 8 },
        ];

        const result = await prisma.department.createMany({
            data: departments,
            skipDuplicates: true
        });

        return NextResponse.json({
            success: true,
            message: `Successfully created ${result.count} departments`,
            departmentsCreated: result.count
        });
    } catch (error) {
        console.error('Seed Departments Error:', error);
        return NextResponse.json({
            error: 'Failed to seed departments',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
