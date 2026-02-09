import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST() {
    try {
        // Get all departments to assign doctors
        const departments = await prisma.department.findMany({
            where: { active: true }
        });

        if (departments.length === 0) {
            return NextResponse.json({
                error: 'No departments found. Please seed departments first.'
            }, { status: 400 });
        }

        // Create demo doctors for each department
        const doctors = [
            { name: 'Dr. Sarah Johnson', department: 'Cardiology', specialization: 'Interventional Cardiology', consultationHours: 'Mon-Fri: 9 AM - 5 PM' },
            { name: 'Dr. Michael Chen', department: 'Cardiology', specialization: 'Cardiac Surgery', consultationHours: 'Mon-Wed: 10 AM - 4 PM' },
            { name: 'Dr. Robert Williams', department: 'Orthopedics', specialization: 'Sports Medicine', consultationHours: 'Tue-Sat: 9 AM - 3 PM' },
            { name: 'Dr. Emily Davis', department: 'Orthopedics', specialization: 'Joint Replacement', consultationHours: 'Mon-Fri: 8 AM - 2 PM' },
            { name: 'Dr. James Martinez', department: 'Pediatrics', specialization: 'Child Development', consultationHours: 'Mon-Fri: 10 AM - 6 PM' },
            { name: 'Dr. Lisa Anderson', department: 'Pediatrics', specialization: 'Neonatology', consultationHours: 'Mon-Thu: 9 AM - 5 PM' },
            { name: 'Dr. David Thompson', department: 'Neurology', specialization: 'Stroke Care', consultationHours: 'Mon-Fri: 9 AM - 4 PM' },
            { name: 'Dr. Jennifer Garcia', department: 'Neurology', specialization: 'Epilepsy', consultationHours: 'Tue-Sat: 10 AM - 5 PM' },
            { name: 'Dr. Christopher Lee', department: 'General Medicine', specialization: 'Internal Medicine', consultationHours: 'Mon-Sat: 8 AM - 6 PM' },
            { name: 'Dr. Amanda White', department: 'General Medicine', specialization: 'Family Medicine', consultationHours: 'Mon-Fri: 9 AM - 5 PM' },
            { name: 'Dr. Daniel Harris', department: 'Dermatology', specialization: 'Cosmetic Dermatology', consultationHours: 'Wed-Sat: 10 AM - 4 PM' },
            { name: 'Dr. Rachel Brown', department: 'Dermatology', specialization: 'Skin Cancer', consultationHours: 'Mon-Thu: 9 AM - 3 PM' },
            { name: 'Dr. Kevin Taylor', department: 'ENT', specialization: 'Sinus Surgery', consultationHours: 'Mon-Fri: 9 AM - 5 PM' },
            { name: 'Dr. Michelle Wilson', department: 'ENT', specialization: 'Hearing Disorders', consultationHours: 'Tue-Fri: 10 AM - 4 PM' },
            { name: 'Dr. Steven Moore', department: 'Ophthalmology', specialization: 'Cataract Surgery', consultationHours: 'Mon-Wed: 8 AM - 2 PM' },
            { name: 'Dr. Patricia Jackson', department: 'Ophthalmology', specialization: 'Retina Specialist', consultationHours: 'Thu-Sat: 10 AM - 5 PM' },
        ];

        const result = await prisma.doctor.createMany({
            data: doctors
        });

        return NextResponse.json({
            success: true,
            message: `Successfully created ${result.count} demo doctors`,
            doctorsCreated: result.count
        });
    } catch (error) {
        console.error('Seed Doctors Error:', error);
        return NextResponse.json({
            error: 'Failed to seed doctors',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
