import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const body = await req.json();
        const { name, description, icon, displayOrder, active } = body;

        const department = await prisma.department.update({
            where: { id: params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(icon !== undefined && { icon }),
                ...(displayOrder !== undefined && { displayOrder }),
                ...(active !== undefined && { active })
            }
        });

        return NextResponse.json(department);
    } catch (error) {
        console.error('Update Department Error:', error);
        return NextResponse.json({
            error: 'Failed to update department',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        await prisma.department.delete({
            where: { id: params.id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete Department Error:', error);
        return NextResponse.json({
            error: 'Failed to delete department',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
