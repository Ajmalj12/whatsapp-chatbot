'use server';

import prisma from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { revalidatePath } from 'next/cache';

export async function getOpenTickets() {
    try {
        const tickets = await prisma.supportTicket.findMany({
            where: { status: 'OPEN' },
            orderBy: { createdAt: 'desc' }
        });
        return { success: true, data: tickets };
    } catch (error) {
        console.error('Error fetching tickets:', error);
        return { success: false, error: 'Failed to fetch tickets' };
    }
}

export async function resolveTicket(ticketId: string, userPhone: string, replyMessage: string) {
    try {
        // 1. Send WhatsApp message
        await sendWhatsAppMessage(userPhone, replyMessage);

        // 2. Update ticket status
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
