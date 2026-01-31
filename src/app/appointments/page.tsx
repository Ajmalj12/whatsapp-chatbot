"use client";

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';

interface Appointment {
    id: string;
    patientName: string;
    patientAge: string;
    patientPhone: string;
    doctor: { name: string; department: string };
    availability: { startTime: string; endTime: string };
    status: string;
    createdAt: string;
}

export default function AppointmentsPage() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAppointments = async () => {
            try {
                const res = await fetch('/api/appointments');
                const data = await res.json();
                setAppointments(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error('Error fetching appointments:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchAppointments();
    }, []);

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
                    <p className="text-sm text-slate-500">Track and manage all bookings from WhatsApp</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Patient</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Doctor</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Schedule</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">Loading appointments...</td></tr>
                            ) : appointments.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">No appointments found.</td></tr>
                            ) : (
                                appointments.map((apt) => (
                                    <tr key={apt.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-900">{apt.patientName}</span>
                                                <span className="text-xs text-slate-500">{apt.patientAge} yrs • {apt.patientPhone}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-900">{apt.doctor.name}</span>
                                                <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-tight">{apt.doctor.department}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm text-slate-600">{new Date(apt.availability.startTime).toLocaleDateString()}</span>
                                                <span className="text-xs text-slate-400">
                                                    {new Date(apt.availability.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                                                {apt.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </AdminLayout>
    );
}
