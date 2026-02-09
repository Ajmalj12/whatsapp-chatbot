"use client";

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';

interface Availability {
    id: string;
    doctorId: string;
    doctor: { name: string };
    startTime: string;
    endTime: string;
    isBooked: boolean;
}

interface Doctor {
    id: string;
    name: string;
}

export default function AvailabilityPage() {
    const [availabilities, setAvailabilities] = useState<Availability[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newSlot, setNewSlot] = useState({ doctorId: '', date: '', startTime: '', endTime: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [availRes, docRes] = await Promise.all([
                fetch('/api/availability'),
                fetch('/api/doctors')
            ]);
            const [availData, docData] = await Promise.all([
                availRes.json(),
                docRes.json()
            ]);
            setAvailabilities(Array.isArray(availData) ? availData : []);
            setDoctors(Array.isArray(docData) ? docData : []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddSlot = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const start = new Date(`${newSlot.date}T${newSlot.startTime}`);
            const end = new Date(`${newSlot.date}T${newSlot.endTime}`);

            const res = await fetch('/api/availability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doctorId: newSlot.doctorId,
                    startTime: start.toISOString(),
                    endTime: end.toISOString(),
                }),
            });
            if (res.ok) {
                setIsModalOpen(false);
                setNewSlot({ doctorId: '', date: '', startTime: '', endTime: '' });
                fetchData();
            }
        } catch (error) {
            console.error('Error adding slot:', error);
        }
    };

    const handleSeedSlots = async () => {
        if (!confirm('This will create availability slots for all active doctors for the next 3 days (9 AM-12 PM, 2 PM-5 PM). Continue?')) {
            return;
        }

        setSeeding(true);
        try {
            const res = await fetch('/api/availability/seed', {
                method: 'POST',
            });
            const data = await res.json();

            if (res.ok) {
                alert(`✅ Success! Created ${data.slotsCreated} slots for ${data.doctorsCount} doctor(s) across ${data.daysCount} days.`);
                fetchData();
            } else {
                alert(`❌ Error: ${data.error || 'Failed to seed slots'}`);
            }
        } catch (error) {
            console.error('Error seeding slots:', error);
            alert('❌ Failed to seed availability slots');
        } finally {
            setSeeding(false);
        }
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Availability</h1>
                        <p className="text-sm text-slate-500">Schedule doctor timings and manage bookable slots</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleSeedSlots}
                            disabled={seeding}
                            className="btn-secondary flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span>🌱</span> {seeding ? 'Seeding...' : 'Seed Next 3 Days'}
                        </button>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="btn-primary flex items-center gap-2"
                        >
                            <span>⏰</span> Add Time Slot
                        </button>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Doctor</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Time Range</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">Loading slots...</td></tr>
                            ) : availabilities.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">No slots defined yet.</td></tr>
                            ) : (
                                availabilities.map((slot) => (
                                    <tr key={slot.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-900">{slot.doctor.name}</td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {new Date(slot.startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 font-mono text-xs">
                                            {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                                            {new Date(slot.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${slot.isBooked ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {slot.isBooked ? 'Booked' : 'Available'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl ring-1 ring-slate-200 animate-in fade-in zoom-in duration-200">
                        <h2 className="text-xl font-bold text-slate-900">Add Availability Slot</h2>
                        <form onSubmit={handleAddSlot} className="mt-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Doctor</label>
                                <select
                                    required
                                    className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
                                    value={newSlot.doctorId}
                                    onChange={(e) => setNewSlot({ ...newSlot, doctorId: e.target.value })}
                                >
                                    <option value="">Select Doctor</option>
                                    {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Date</label>
                                <input
                                    type="date"
                                    required
                                    className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500"
                                    value={newSlot.date}
                                    onChange={(e) => setNewSlot({ ...newSlot, date: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Start Time</label>
                                    <input
                                        type="time"
                                        required
                                        className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500"
                                        value={newSlot.startTime}
                                        onChange={(e) => setNewSlot({ ...newSlot, startTime: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">End Time</label>
                                    <input
                                        type="time"
                                        required
                                        className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500"
                                        value={newSlot.endTime}
                                        onChange={(e) => setNewSlot({ ...newSlot, endTime: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="mt-8 flex gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                                <button type="submit" className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white">Save Slot</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
