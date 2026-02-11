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
        const interval = setInterval(fetchTickets, 8000); // Poll every 8s
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (selectedTicket) {
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
            scrollToBottom();
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
        <AdminLayout fullWidth={true}>
            <div className="flex h-[calc(100vh-64px)] bg-gray-50 font-sans">
                {/* Sidebar */}
                <div className="w-80 border-r border-gray-200 bg-white flex flex-col shadow-sm">
                    <div className="h-14 px-4 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center shrink-0">
                        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Tickets</h2>
                        <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">{tickets.length} Open</span>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
                        {loading && tickets.length === 0 ? (
                            <div className="p-4 space-y-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="animate-pulse flex gap-3">
                                        <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                                        <div className="flex-1 space-y-2">
                                            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : tickets.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
                                <span className="text-4xl mb-2 grayscale opacity-50">🎉</span>
                                <p className="text-sm">No open tickets</p>
                            </div>
                        ) : (
                            tickets.map(ticket => (
                                <div
                                    key={ticket.id}
                                    onClick={() => setSelectedTicket(ticket)}
                                    className={`p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-all ${selectedTicket?.id === ticket.id ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent'}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`font-semibold text-sm ${selectedTicket?.id === ticket.id ? 'text-gray-900' : 'text-gray-700'}`}>{ticket.phone}</span>
                                        <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                                            {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
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
                <div className="flex-1 flex flex-col bg-[#eef1f5] relative overflow-hidden">
                    {/* Background Pattern Overlay */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#4b5563 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                    {selectedTicket ? (
                        <>
                            {/* Header */}
                            <div className="h-14 px-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs ring-2 ring-white">
                                        {selectedTicket.phone.slice(-2)}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-800 text-sm">{selectedTicket.phone}</h3>
                                        <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium bg-emerald-50 px-1.5 rounded-full w-fit">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block"></span>
                                            Active Now
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={handleResolve}
                                    className="text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-md text-sm transition-colors border border-transparent hover:border-emerald-100 flex items-center gap-1.5 group"
                                >
                                    <span>Resolve Ticket</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 group-hover:text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </button>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 z-0 scrollbar-thin scrollbar-thumb-gray-300">
                                <div className="flex justify-center mb-6 opacity-60">
                                    <span className="bg-gray-200 text-gray-600 text-[10px] px-3 py-1 rounded-full font-medium shadow-sm border border-white">
                                        {new Date(selectedTicket.createdAt).toLocaleDateString()}
                                    </span>
                                </div>

                                {selectedTicket.messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex w-full ${msg.sender === 'ADMIN' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm text-sm leading-relaxed relative group transition-all ${msg.sender === 'ADMIN'
                                                ? 'bg-emerald-600 text-white rounded-br-none shadow-emerald-100'
                                                : 'bg-white text-gray-800 rounded-bl-none border border-gray-100 shadow-sm'
                                                }`}
                                        >
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                            <span
                                                className={`text-[9px] block text-right mt-1 opacity-70 ${msg.sender === 'ADMIN' ? 'text-emerald-100' : 'text-gray-400'
                                                    }`}
                                            >
                                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="p-3 bg-white border-t border-gray-200 z-10 shrink-0">
                                <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl p-1.5 focus-within:ring-1 focus-within:ring-emerald-500 focus-within:border-emerald-500 transition-all shadow-sm">
                                    <textarea
                                        value={replyMessage}
                                        onChange={(e) => setReplyMessage(e.target.value)}
                                        placeholder="Type your reply..."
                                        className="flex-1 bg-transparent border-none p-2 text-sm focus:ring-0 resize-none max-h-32 min-h-[40px] text-gray-700 placeholder-gray-400 leading-relaxed"
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
                                        className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm mb-0.5 active:scale-95 flex-shrink-0"
                                    >
                                        {sending ? (
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                                <div className="text-center mt-1">
                                    <span className="text-[10px] text-gray-400 font-medium tracking-wide">Enter to send • Shift + Enter for new line</span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50">
                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4 shadow-inner ring-4 ring-white">
                                <span className="text-4xl grayscale opacity-60">👋</span>
                            </div>
                            <h3 className="font-semibold text-gray-600 mb-1">Welcome to Tickets</h3>
                            <p className="text-sm text-gray-400 max-w-xs text-center leading-relaxed">Select a conversation from the sidebar to start chatting with users.</p>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
