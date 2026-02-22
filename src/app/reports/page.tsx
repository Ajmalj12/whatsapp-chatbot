"use client";

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';

interface ReportStats {
    totalAppointments: number;
    bookedCount: number;
    cancelledCount: number;
    todayAppointments: number;
    weekAppointments: number;
    openTickets: number;
    resolvedTickets: number;
    sessionCount: number;
}

export default function ReportsPage() {
    const [stats, setStats] = useState<ReportStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [demoPhone, setDemoPhone] = useState('');
    const [demoStatus, setDemoStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const res = await fetch('/api/reports');
                const data = await res.json();
                if (res.ok) setStats(data);
            } catch (error) {
                console.error('Error fetching reports:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchReports();
    }, []);

    const handleSendDemoReminder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!demoPhone.trim()) return;
        setDemoStatus({ type: 'loading' });
        try {
            const res = await fetch('/api/reports/demo-reminder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: demoPhone.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                setDemoStatus({ type: 'error', message: data.error || 'Failed to schedule' });
                return;
            }
            const at = data.scheduledAt ? new Date(data.scheduledAt).toLocaleString() : 'in 30 minutes';
            setDemoStatus({ type: 'success', message: `Reminder scheduled for ${at}.` });
            setDemoPhone('');
        } catch (error) {
            setDemoStatus({ type: 'error', message: 'Request failed' });
        }
    };

    const cards = stats
        ? [
              { label: 'Total Appointments', value: String(stats.totalAppointments), color: 'bg-blue-50 text-blue-700', icon: '📅' },
              { label: 'Booked', value: String(stats.bookedCount), color: 'bg-emerald-50 text-emerald-700', icon: '✅' },
              { label: 'Cancelled', value: String(stats.cancelledCount), color: 'bg-slate-100 text-slate-700', icon: '❌' },
              { label: "Today's Appointments", value: String(stats.todayAppointments), color: 'bg-orange-50 text-orange-700', icon: '📆' },
              { label: "This Week", value: String(stats.weekAppointments), color: 'bg-purple-50 text-purple-700', icon: '📊' },
              { label: 'Open Tickets', value: String(stats.openTickets), color: 'bg-amber-50 text-amber-700', icon: '🎫' },
              { label: 'Resolved Tickets', value: String(stats.resolvedTickets), color: 'bg-teal-50 text-teal-700', icon: '✔️' },
              { label: 'Chat Sessions', value: String(stats.sessionCount), color: 'bg-indigo-50 text-indigo-700', icon: '💬' },
          ]
        : [];

    return (
        <AdminLayout>
            <div className="space-y-8">
                <header>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Reports</h1>
                    <p className="mt-2 text-sm text-slate-500">Analytics and demo reminder for CarePlus Clinic.</p>
                </header>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {loading ? (
                        <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400">Loading reports...</div>
                    ) : (
                        cards.map((stat) => (
                            <div
                                key={stat.label}
                                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{stat.label}</p>
                                        <p className="mt-2 text-2xl font-bold text-slate-900">{stat.value}</p>
                                    </div>
                                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${stat.color}`}>
                                        {stat.icon}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm ring-1 ring-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">Send demo reminder</h2>
                    <p className="mt-1 text-sm text-slate-500">Schedule a reminder to be sent in 30 minutes. The user will get a message asking to reply 1 to confirm or 2 to reschedule.</p>
                    <form onSubmit={handleSendDemoReminder} className="mt-6 flex flex-wrap items-end gap-4">
                        <div className="min-w-[200px]">
                            <label htmlFor="demo-phone" className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                                Phone number
                            </label>
                            <input
                                id="demo-phone"
                                type="tel"
                                value={demoPhone}
                                onChange={(e) => setDemoPhone(e.target.value)}
                                placeholder="e.g. 919876543210"
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={demoStatus.type === 'loading' || !demoPhone.trim()}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {demoStatus.type === 'loading' ? 'Scheduling…' : 'Send demo reminder'}
                        </button>
                    </form>
                    {demoStatus.type === 'success' && (
                        <p className="mt-3 text-sm font-medium text-emerald-600">{demoStatus.message}</p>
                    )}
                    {demoStatus.type === 'error' && (
                        <p className="mt-3 text-sm font-medium text-red-600">{demoStatus.message}</p>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
