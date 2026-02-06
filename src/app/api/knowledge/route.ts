
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const items = await prisma.knowledgeBase.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(items);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch knowledge base' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { question, answer } = body;

        if (!answer) {
            return NextResponse.json({ error: 'Answer is required' }, { status: 400 });
        }

        const newItem = await prisma.knowledgeBase.create({
            data: {
                question: question || '',
                answer
            }
        });
        return NextResponse.json(newItem);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        await prisma.knowledgeBase.delete({
            where: { id }
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
    }
}
