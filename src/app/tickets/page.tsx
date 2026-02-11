'use client';

import { useState, useEffect, useRef } from 'react';
import { getOpenTickets, replyToTicket, resolveTicket } from '../actions/ticket';
import AdminLayout from '@/components/AdminLayout';

interface TicketMessage {
    id: string;
    sender: string;
    content: string;
    createdAt: Date;
}

interface Ticket {
    id: string;
    phone: string;
    query: string;
    status: string;
    createdAt: Date;
    messages: TicketMessage[];
}

export default function TicketsPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [loading, setLoading] = useState(true);
    const [replyMessage, setReplyMessage] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchTickets();
        const interval = setInterval(fetchTickets, 10000); // Poll every 10s for chat
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (selectedTicket) {
            // Update selected ticket from the fresh list to show new messages
            const updated = tickets.find(t => t.id === selectedTicket.id);
            if (updated) setSelectedTicket(updated);
            scrollToBottom();
        }
    }, [tickets, selectedTicket?.id]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchTickets = async () => {
        const res = await getOpenTickets();
        if (res.success && res.data) {
            setTickets(res.data);
        }
        setLoading(false);
    };

    const handleSend = async () => {
        if (!selectedTicket || !replyMessage.trim()) return;
        setSending(true);

        const res = await replyToTicket(selectedTicket.id, selectedTicket.phone, replyMessage);

        if (res.success) {
            setReplyMessage('');
            fetchTickets();
        } else {
            alert('Failed to send message');
        }
        setSending(false);
    };

    const handleResolve = async () => {
        if (!selectedTicket || !confirm('Are you sure you want to resolve and close this ticket?')) return;

        const res = await resolveTicket(selectedTicket.id);
        if (res.success) {
            setSelectedTicket(null);
            fetchTickets();
        } else {
            alert('Failed to resolve ticket');
        }
    };

    return (
        <AdminLayout>
            <div className="flex h-[calc(100vh-64px)] bg-gray-100">
                {/* Sidebar */}
                <div className="w-1/3 border-r bg-white flex flex-col">
                    <div className="p-4 border-b bg-gray-50">
                        <h2 className="font-bold text-lg text-gray-700">Open Tickets</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <p className="p-4 text-gray-500">Loading...</p>
                        ) : tickets.length === 0 ? (
                            <p className="p-4 text-gray-500">No open tickets.</p>
                        ) : (
                            tickets.map(ticket => (
                                <div
                                    key={ticket.id}
                                    onClick={() => setSelectedTicket(ticket)}
                                    className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${selectedTicket?.id === ticket.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-semibold text-gray-800">{ticket.phone}</span>
                                        <span className="text-xs text-gray-500">{new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 truncate">
                                        {ticket.messages.length > 0
                                            ? ticket.messages[ticket.messages.length - 1].content
                                            : ticket.query}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Chat Window */}
                <div className="flex-1 flex flex-col bg-gray-50">
                    {selectedTicket ? (
                        <>
                            {/* Header */}
                            <div className="p-4 bg-white border-b flex justify-between items-center shadow-sm">
                                <div>
                                    <h3 className="font-bold text-gray-800">{selectedTicket.phone}</h3>
                                    <span className="text-xs text-green-600 font-medium">Active Now</span>
                                </div>
                                <button
                                    onClick={handleResolve}
                                    className="bg-green-100 text-green-700 px-3 py-1.5 rounded text-sm hover:bg-green-200 transition-colors"
                                >
                                    ✓ Resolve & Close
                                </button>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {/* Show initial query as the first message if no messages exist yet, 
                                    or relies on webhook creating the first message. 
                                    If webhook creates it, we just map messages. 
                                */}
                                {selectedTicket.messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.sender === 'ADMIN' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[70%] p-3 rounded-lg shadow-sm ${msg.sender === 'ADMIN'
                                                ? 'bg-blue-600 text-white rounded-br-none'
                                                : 'bg-white text-gray-800 border rounded-bl-none'
                                                }`}
                                        >
                                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                            <span className={`text-[10px] block mt-1 ${msg.sender === 'ADMIN' ? 'text-blue-100' : 'text-gray-400'}`}>
                                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="p-4 bg-white border-t">
                                <div className="flex gap-2">
                                    <textarea
                                        value={replyMessage}
                                        onChange={(e) => setReplyMessage(e.target.value)}
                                        placeholder="Type your reply..."
                                        className="flex-1 border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-12 md:h-14"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSend();
                                            }
                                        }}
                                        disabled={sending}
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={sending || !replyMessage.trim()}
                                        className="bg-blue-600 text-white px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                                    >
                                        Send
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400 flex-col">
                            <span className="text-4xl mb-2">💬</span>
                            <p>Select a ticket to view the conversation</p>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}

