import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { name, description, displayOrder, active, departmentId } = body;
        const existing = await prisma.subDepartment.findUnique({ where: { id } });

        if (!existing) {
            return NextResponse.json({ error: 'Sub department not found' }, { status: 404 });
        }

        const subDepartment = await prisma.subDepartment.update({
            where: { id },
            data: {
                ...(name !== undefined && { name: name.trim() }),
                ...(description !== undefined && { description }),
                ...(displayOrder !== undefined && { displayOrder }),
                ...(active !== undefined && { active }),
                ...(departmentId !== undefined && { departmentId })
            },
            include: {
                department: true
            }
        });

        if (name !== undefined || active === false) {
            await prisma.doctor.updateMany({
                where: { subDepartment: existing.name },
                data: { subDepartment: active === false ? null : subDepartment.name }
            });
        }

        return NextResponse.json(subDepartment);
    } catch (error) {
        console.error('Update Sub Department Error:', error);
        return NextResponse.json({
            error: 'Failed to update sub department',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const subDepartment = await prisma.subDepartment.findUnique({ where: { id } });

        if (!subDepartment) {
            return NextResponse.json({ error: 'Sub department not found' }, { status: 404 });
        }

        await prisma.doctor.updateMany({
            where: {
                subDepartment: subDepartment.name
            },
            data: { subDepartment: null }
        });

        await prisma.subDepartment.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete Sub Department Error:', error);
        return NextResponse.json({
            error: 'Failed to delete sub department',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
