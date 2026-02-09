import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const departments = await prisma.department.findMany({
            where: { active: true },
            orderBy: { displayOrder: 'asc' }
        });
        return NextResponse.json(departments);
    } catch (error) {
        console.error('Fetch Departments Error:', error);
        return NextResponse.json({
            error: 'Failed to fetch departments',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, description, icon, displayOrder } = body;

        const department = await prisma.department.create({
            data: {
                name,
                description,
                icon,
                displayOrder: displayOrder || 0
            }
        });

        return NextResponse.json(department);
    } catch (error) {
        console.error('Create Department Error:', error);
        return NextResponse.json({
            error: 'Failed to create department',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
