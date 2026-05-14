import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const includeInactive = searchParams.get('includeInactive') === 'true';
        const departmentId = searchParams.get('departmentId') || undefined;

        const subDepartments = await prisma.subDepartment.findMany({
            where: {
                ...(departmentId && { departmentId }),
                ...(includeInactive ? {} : { active: true })
            },
            orderBy: [
                { displayOrder: 'asc' },
                { name: 'asc' }
            ],
            include: {
                department: true
            }
        });

        return NextResponse.json(subDepartments);
    } catch (error) {
        console.error('Fetch Sub Departments Error:', error);
        return NextResponse.json({
            error: 'Failed to fetch sub departments',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, description, displayOrder, departmentId } = body;

        if (!name?.trim() || !departmentId) {
            return NextResponse.json({ error: 'Name and department are required' }, { status: 400 });
        }

        const subDepartment = await prisma.subDepartment.create({
            data: {
                name: name.trim(),
                description,
                displayOrder: displayOrder || 0,
                departmentId
            },
            include: {
                department: true
            }
        });

        return NextResponse.json(subDepartment);
    } catch (error) {
        console.error('Create Sub Department Error:', error);
        return NextResponse.json({
            error: 'Failed to create sub department',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
