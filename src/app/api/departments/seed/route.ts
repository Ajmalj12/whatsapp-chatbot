import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST() {
    try {
        const departments = [
            { name: 'Cardiology', description: 'Heart and cardiovascular care', icon: 'C', displayOrder: 1, subDepartments: ['Interventional Cardiology', 'Cardiac Surgery', 'Heart Failure Clinic'] },
            { name: 'Orthopedics', description: 'Bone and joint treatment', icon: 'O', displayOrder: 2, subDepartments: ['Sports Medicine', 'Joint Replacement', 'Spine Care'] },
            { name: 'Pediatrics', description: 'Child healthcare', icon: 'P', displayOrder: 3, subDepartments: ['Neonatology', 'Child Development', 'Pediatric Emergency'] },
            { name: 'Neurology', description: 'Brain and nervous system', icon: 'N', displayOrder: 4, subDepartments: ['Stroke Care', 'Epilepsy Clinic', 'Neuro Rehabilitation'] },
            { name: 'General Medicine', description: 'General health consultation', icon: 'M', displayOrder: 5, subDepartments: ['Internal Medicine', 'Family Medicine', 'Preventive Health'] },
            { name: 'Dermatology', description: 'Skin and hair care', icon: 'D', displayOrder: 6, subDepartments: ['Cosmetic Dermatology', 'Skin Cancer Clinic', 'Hair and Scalp'] },
            { name: 'ENT', description: 'Ear, nose, and throat', icon: 'E', displayOrder: 7, subDepartments: ['Sinus Surgery', 'Hearing Disorders', 'Voice Clinic'] },
            { name: 'Ophthalmology', description: 'Eye care and vision', icon: 'V', displayOrder: 8, subDepartments: ['Cataract Surgery', 'Retina Specialist', 'Glaucoma Clinic'] },
        ];

        let departmentsCreated = 0;
        let subDepartmentsCreated = 0;

        for (const department of departments) {
            const createdDepartment = await prisma.department.upsert({
                where: { name: department.name },
                update: {
                    description: department.description,
                    icon: department.icon,
                    displayOrder: department.displayOrder,
                    active: true
                },
                create: {
                    name: department.name,
                    description: department.description,
                    icon: department.icon,
                    displayOrder: department.displayOrder,
                    active: true
                }
            });
            departmentsCreated += 1;

            for (const [index, subDepartmentName] of department.subDepartments.entries()) {
                await prisma.subDepartment.upsert({
                    where: {
                        departmentId_name: {
                            departmentId: createdDepartment.id,
                            name: subDepartmentName
                        }
                    },
                    update: {
                        displayOrder: index + 1,
                        active: true
                    },
                    create: {
                        departmentId: createdDepartment.id,
                        name: subDepartmentName,
                        displayOrder: index + 1,
                        active: true
                    }
                });
                subDepartmentsCreated += 1;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Seeded ${departmentsCreated} departments and ${subDepartmentsCreated} sub departments`,
            departmentsCreated,
            subDepartmentsCreated
        });
    } catch (error) {
        console.error('Seed Departments Error:', error);
        return NextResponse.json({
            error: 'Failed to seed departments',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
