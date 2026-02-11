'use server';

import prisma from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { revalidatePath } from 'next/cache';

export async function getOpenTickets() {
    try {
        const tickets = await prisma.supportTicket.findMany({
            where: { status: 'OPEN' },
            orderBy: { createdAt: 'desc' },
            include: { messages: { orderBy: { createdAt: 'asc' } } }
        });
        return { success: true, data: tickets };
    } catch (error) {
        console.error('Error fetching tickets:', error);
        return { success: false, error: 'Failed to fetch tickets' };
    }
}

export async function replyToTicket(ticketId: string, userPhone: string, message: string) {
    try {
        // 1. Send WhatsApp message
        await sendWhatsAppMessage(userPhone, message);

        // 2. Add message to database
        await prisma.ticketMessage.create({
            data: {
                ticketId,
                sender: 'ADMIN',
                content: message
            }
        });

        revalidatePath('/tickets');
        return { success: true };
    } catch (error) {
        console.error('Error replying to ticket:', error);
        return { success: false, error: 'Failed to reply' };
    }
}

export async function resolveTicket(ticketId: string) {
    try {
        await prisma.supportTicket.update({
            where: { id: ticketId },
            data: { status: 'RESOLVED' }
        });

        revalidatePath('/tickets');
        return { success: true };
    } catch (error) {
        console.error('Error resolving ticket:', error);
        return { success: false, error: 'Failed to resolve ticket' };
    }
}
