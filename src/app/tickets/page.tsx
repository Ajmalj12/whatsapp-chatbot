'use client';

import { useState, useEffect } from 'react';
import { getOpenTickets, resolveTicket } from '../actions/ticket';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';

interface Ticket {
    id: string;
    phone: string;
    query: string;
    createdAt: Date;
}

export default function TicketsPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyMessage, setReplyMessage] = useState('');
    const [sending, setSending] = useState(false);
    const router = useRouter();

    useEffect(() => {
        fetchTickets();
        // Poll for new tickets every 30 seconds
        const interval = setInterval(fetchTickets, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchTickets = async () => {
        const res = await getOpenTickets();
        if (res.success && res.data) {
            setTickets(res.data);
        }
        setLoading(false);
    };

    const handleReply = async (ticket: Ticket) => {
        if (!replyMessage.trim()) return;
        setSending(true);

        const res = await resolveTicket(ticket.id, ticket.phone, replyMessage);

        if (res.success) {
            setReplyingTo(null);
            setReplyMessage('');
            fetchTickets(); // Refresh list
        } else {
            alert('Failed to send reply');
        }
        setSending(false);
    };

    return (
        <AdminLayout>
            <div className="p-6 max-w-4xl mx-auto">
                <h1 className="text-2xl font-bold mb-6 text-gray-800">Support Tickets (Escalations)</h1>

                {loading ? (
                    <p>Loading tickets...</p>
                ) : tickets.length === 0 ? (
                    <div className="bg-green-50 p-4 rounded text-green-700">
                        ✅ No open tickets. All caught up!
                    </div>
                ) : (
                    <div className="space-y-4">
                        {tickets.map((ticket) => (
                            <div key={ticket.id} className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <span className="font-semibold text-blue-600">{ticket.phone}</span>
                                        <span className="text-gray-400 text-sm ml-2">
                                            {new Date(ticket.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                                        OPEN
                                    </span>
                                </div>

                                <div className="bg-gray-50 p-3 rounded mb-3 text-gray-700">
                                    <strong>User asked:</strong> "{ticket.query}"
                                </div>

                                {replyingTo === ticket.id ? (
                                    <div className="mt-2">
                                        <textarea
                                            className="w-full border rounded p-2 mb-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                            rows={3}
                                            placeholder="Type your reply here..."
                                            value={replyMessage}
                                            onChange={(e) => setReplyMessage(e.target.value)}
                                            disabled={sending}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleReply(ticket)}
                                                disabled={sending || !replyMessage.trim()}
                                                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                {sending ? 'Sending...' : 'Send Reply'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setReplyingTo(null);
                                                    setReplyMessage('');
                                                }}
                                                disabled={sending}
                                                className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setReplyingTo(ticket.id)}
                                        className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                                    >
                                        Reply & Resolve
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
