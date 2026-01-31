"use client";

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';

interface Doctor {
    id: string;
    name: string;
    department: string;
    active: boolean;
}

export default function DoctorsPage() {
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [newDoctor, setNewDoctor] = useState({ name: '', department: '' });

    useEffect(() => {
        fetchDoctors();
    }, []);

    const fetchDoctors = async () => {
        try {
            const res = await fetch('/api/doctors');
            const data = await res.json();
            setDoctors(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching doctors:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddDoctor = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/doctors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newDoctor),
            });
            if (res.ok) {
                setNewDoctor({ name: '', department: '' });
                setIsModalOpen(false);
                fetchDoctors();
            }
        } catch (error) {
            console.error('Error adding doctor:', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this doctor? All related appointments and slots will also be removed.')) return;
        try {
            const res = await fetch(`/api/doctors/${id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                fetchDoctors();
            }
        } catch (error) {
            console.error('Error deleting doctor:', error);
        }
    };

    const handleToggleActive = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch(`/api/doctors/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: !currentStatus }),
            });
            if (res.ok) {
                fetchDoctors();
            }
        } catch (error) {
            console.error('Error toggling status:', error);
        }
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Doctors</h1>
                        <p className="text-sm text-slate-500">Manage your hospital's medical staff</p>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="btn-primary flex items-center gap-2"
                    >
                        <span>➕</span> Add New Doctor
                    </button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Doctor Name</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">Loading doctors...</td>
                                </tr>
                            ) : doctors.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">No doctors found. Add your first doctor to get started!</td>
                                </tr>
                            ) : (
                                doctors.map((doctor) => (
                                    <tr key={doctor.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs uppercase">
                                                    {doctor.name.substring(0, 2)}
                                                </div>
                                                <span className="font-medium text-slate-900">{doctor.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                                                {doctor.department}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => handleToggleActive(doctor.id, doctor.active)}
                                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${doctor.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                            >
                                                <span className={`h-1.5 w-1.5 rounded-full ${doctor.active ? 'bg-green-600' : 'bg-red-600'}`}></span>
                                                {doctor.active ? 'Active' : 'Inactive'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button className="text-slate-400 hover:text-emerald-600 transition-colors mr-4 font-medium text-sm">Edit</button>
                                            <button
                                                onClick={() => handleDelete(doctor.id)}
                                                className="text-slate-400 hover:text-red-500 transition-colors font-medium text-sm"
                                            >
                                                Delete
                                            </button>
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
                        <h2 className="text-xl font-bold text-slate-900">Add New Doctor</h2>
                        <form onSubmit={handleAddDoctor} className="mt-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Dr. Anil Kumar"
                                    className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
                                    value={newDoctor.name}
                                    onChange={(e) => setNewDoctor({ ...newDoctor, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Department</label>
                                <select
                                    required
                                    className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
                                    value={newDoctor.department}
                                    onChange={(e) => setNewDoctor({ ...newDoctor, department: e.target.value })}
                                >
                                    <option value="">Select Department</option>
                                    <option value="Cardiology">Cardiology</option>
                                    <option value="General Medicine">General Medicine</option>
                                    <option value="Orthopedics">Orthopedics</option>
                                    <option value="Pediatrics">Pediatrics</option>
                                </select>
                            </div>
                            <div className="mt-8 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all"
                                >
                                    Save Doctor
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
