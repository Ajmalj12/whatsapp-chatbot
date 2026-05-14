import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST() {
    try {
        const departments = await prisma.department.findMany({
            where: { active: true },
            include: { subDepartments: { where: { active: true } } }
        });

        if (departments.length === 0) {
            return NextResponse.json({
                error: 'No departments found. Please seed departments first.'
            }, { status: 400 });
        }

        const doctors = [
            { name: 'Dr. Sarah Johnson', department: 'Cardiology', subDepartment: 'Interventional Cardiology', specialization: 'Interventional Cardiology', consultationHours: 'Mon-Fri: 9 AM - 5 PM' },
            { name: 'Dr. Michael Chen', department: 'Cardiology', subDepartment: 'Cardiac Surgery', specialization: 'Cardiac Surgery', consultationHours: 'Mon-Wed: 10 AM - 4 PM' },
            { name: 'Dr. Robert Williams', department: 'Orthopedics', subDepartment: 'Sports Medicine', specialization: 'Sports Medicine', consultationHours: 'Tue-Sat: 9 AM - 3 PM' },
            { name: 'Dr. Emily Davis', department: 'Orthopedics', subDepartment: 'Joint Replacement', specialization: 'Joint Replacement', consultationHours: 'Mon-Fri: 8 AM - 2 PM' },
            { name: 'Dr. James Martinez', department: 'Pediatrics', subDepartment: 'Child Development', specialization: 'Child Development', consultationHours: 'Mon-Fri: 10 AM - 6 PM' },
            { name: 'Dr. Lisa Anderson', department: 'Pediatrics', subDepartment: 'Neonatology', specialization: 'Neonatology', consultationHours: 'Mon-Thu: 9 AM - 5 PM' },
            { name: 'Dr. David Thompson', department: 'Neurology', subDepartment: 'Stroke Care', specialization: 'Stroke Care', consultationHours: 'Mon-Fri: 9 AM - 4 PM' },
            { name: 'Dr. Jennifer Garcia', department: 'Neurology', subDepartment: 'Epilepsy Clinic', specialization: 'Epilepsy', consultationHours: 'Tue-Sat: 10 AM - 5 PM' },
            { name: 'Dr. Christopher Lee', department: 'General Medicine', subDepartment: 'Internal Medicine', specialization: 'Internal Medicine', consultationHours: 'Mon-Sat: 8 AM - 6 PM' },
            { name: 'Dr. Amanda White', department: 'General Medicine', subDepartment: 'Family Medicine', specialization: 'Family Medicine', consultationHours: 'Mon-Fri: 9 AM - 5 PM' },
            { name: 'Dr. Daniel Harris', department: 'Dermatology', subDepartment: 'Cosmetic Dermatology', specialization: 'Cosmetic Dermatology', consultationHours: 'Wed-Sat: 10 AM - 4 PM' },
            { name: 'Dr. Rachel Brown', department: 'Dermatology', subDepartment: 'Skin Cancer Clinic', specialization: 'Skin Cancer', consultationHours: 'Mon-Thu: 9 AM - 3 PM' },
            { name: 'Dr. Kevin Taylor', department: 'ENT', subDepartment: 'Sinus Surgery', specialization: 'Sinus Surgery', consultationHours: 'Mon-Fri: 9 AM - 5 PM' },
            { name: 'Dr. Michelle Wilson', department: 'ENT', subDepartment: 'Hearing Disorders', specialization: 'Hearing Disorders', consultationHours: 'Tue-Fri: 10 AM - 4 PM' },
            { name: 'Dr. Steven Moore', department: 'Ophthalmology', subDepartment: 'Cataract Surgery', specialization: 'Cataract Surgery', consultationHours: 'Mon-Wed: 8 AM - 2 PM' },
            { name: 'Dr. Patricia Jackson', department: 'Ophthalmology', subDepartment: 'Retina Specialist', specialization: 'Retina Specialist', consultationHours: 'Thu-Sat: 10 AM - 5 PM' },
        ];

        const validDoctors = doctors.map((doctor) => {
            const department = departments.find((item) => item.name === doctor.department);
            const hasSubDepartment = department?.subDepartments.some((item) => item.name === doctor.subDepartment);

            return {
                ...doctor,
                subDepartment: hasSubDepartment ? doctor.subDepartment : null
            };
        }).filter((doctor) => departments.some((department) => department.name === doctor.department));

        const result = await prisma.doctor.createMany({
            data: validDoctors
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
