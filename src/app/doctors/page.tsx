"use client";

import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';

interface SubDepartment {
    id: string;
    name: string;
    active: boolean;
}

interface Department {
    id: string;
    name: string;
    active: boolean;
    subDepartments: SubDepartment[];
}

interface Doctor {
    id: string;
    name: string;
    department: string;
    subDepartment?: string | null;
    specialization?: string | null;
    consultationHours?: string | null;
    active: boolean;
}

const emptyDoctorForm = {
    name: '',
    department: '',
    subDepartment: '',
    specialization: '',
    consultationHours: ''
};

export default function DoctorsPage() {
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [doctorForm, setDoctorForm] = useState(emptyDoctorForm);

    useEffect(() => {
        fetchData();
    }, []);

    const activeDepartments = useMemo(() => departments.filter((department) => department.active), [departments]);
    const selectedDepartment = useMemo(
        () => activeDepartments.find((department) => department.name === doctorForm.department),
        [activeDepartments, doctorForm.department]
    );
    const availableSubDepartments = selectedDepartment?.subDepartments.filter((sub) => sub.active) || [];

    const groupedDoctors = useMemo(() => {
        return doctors.reduce<Record<string, Doctor[]>>((groups, doctor) => {
            const key = doctor.subDepartment ? `${doctor.department} / ${doctor.subDepartment}` : doctor.department || 'Unassigned';
            groups[key] = groups[key] || [];
            groups[key].push(doctor);
            return groups;
        }, {});
    }, [doctors]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [doctorRes, departmentRes] = await Promise.all([
                fetch('/api/doctors'),
                fetch('/api/departments?includeInactive=true')
            ]);
            const [doctorData, departmentData] = await Promise.all([
                doctorRes.json(),
                departmentRes.json()
            ]);
            setDoctors(Array.isArray(doctorData) ? doctorData : []);
            setDepartments(Array.isArray(departmentData) ? departmentData : []);
        } catch (error) {
            console.error('Error fetching doctors:', error);
        } finally {
            setLoading(false);
        }
    };

    const openCreateModal = () => {
        setEditingId(null);
        setDoctorForm(emptyDoctorForm);
        setIsModalOpen(true);
    };

    const openEditModal = (doctor: Doctor) => {
        setEditingId(doctor.id);
        setDoctorForm({
            name: doctor.name,
            department: doctor.department,
            subDepartment: doctor.subDepartment || '',
            specialization: doctor.specialization || '',
            consultationHours: doctor.consultationHours || ''
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
        setDoctorForm(emptyDoctorForm);
    };

    const handleSaveDoctor = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch(editingId ? `/api/doctors/${editingId}` : '/api/doctors', {
                method: editingId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(doctorForm),
            });
            if (res.ok) {
                closeModal();
                fetchData();
            }
        } catch (error) {
            console.error('Error saving doctor:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this doctor and related appointments and slots?')) return;
        try {
            const res = await fetch(`/api/doctors/${id}`, { method: 'DELETE' });
            if (res.ok) fetchData();
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
            if (res.ok) fetchData();
        } catch (error) {
            console.error('Error toggling status:', error);
        }
    };

    const handleSeedDoctors = async () => {
        if (!confirm('Create demo doctors across departments and sub departments?')) return;

        setSeeding(true);
        try {
            const res = await fetch('/api/doctors/seed', { method: 'POST' });
            const data = await res.json();

            if (res.ok) {
                alert(`Created ${data.doctorsCreated} demo doctors.`);
                fetchData();
            } else {
                alert(data.error || 'Failed to seed doctors');
            }
        } catch (error) {
            console.error('Error seeding doctors:', error);
            alert('Failed to seed doctors');
        } finally {
            setSeeding(false);
        }
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Provider directory</p>
                        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Doctors</h1>
                        <p className="mt-2 text-sm text-slate-600">Assign every doctor to a department and optional sub department for cleaner booking flows.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={handleSeedDoctors}
                            disabled={seeding}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                        >
                            {seeding ? 'Seeding...' : 'Seed doctors'}
                        </button>
                        <button
                            onClick={openCreateModal}
                            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
                        >
                            Add doctor
                        </button>
                    </div>
                </header>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase text-slate-500">Doctors</p>
                        <p className="mt-2 text-2xl font-bold text-slate-950">{doctors.length}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase text-slate-500">Active</p>
                        <p className="mt-2 text-2xl font-bold text-slate-950">{doctors.filter((doctor) => doctor.active).length}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase text-slate-500">With sub department</p>
                        <p className="mt-2 text-2xl font-bold text-slate-950">{doctors.filter((doctor) => doctor.subDepartment).length}</p>
                    </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 px-5 py-4">
                        <h2 className="font-bold text-slate-950">Doctor roster</h2>
                        <p className="text-sm text-slate-500">Grouped by department and sub department.</p>
                    </div>

                    {loading ? (
                        <p className="p-8 text-center text-sm text-slate-500">Loading doctors...</p>
                    ) : doctors.length === 0 ? (
                        <p className="p-8 text-center text-sm text-slate-500">No doctors found. Add the first doctor to get started.</p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {Object.entries(groupedDoctors).map(([groupName, groupDoctors]) => (
                                <section key={groupName} className="p-5">
                                    <div className="mb-3 flex items-center justify-between">
                                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">{groupName}</h3>
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{groupDoctors.length}</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[720px] text-left">
                                            <thead>
                                                <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                    <th className="px-3 py-2">Doctor</th>
                                                    <th className="px-3 py-2">Specialization</th>
                                                    <th className="px-3 py-2">Hours</th>
                                                    <th className="px-3 py-2">Status</th>
                                                    <th className="px-3 py-2 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {groupDoctors.map((doctor) => (
                                                    <tr key={doctor.id} className="hover:bg-slate-50">
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold uppercase text-emerald-800">
                                                                    {doctor.name.slice(0, 2)}
                                                                </div>
                                                                <div>
                                                                    <p className="font-semibold text-slate-950">{doctor.name}</p>
                                                                    <p className="text-xs text-slate-500">{doctor.department}{doctor.subDepartment ? ` / ${doctor.subDepartment}` : ''}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-sm text-slate-600">{doctor.specialization || 'Not set'}</td>
                                                        <td className="px-3 py-3 text-sm text-slate-600">{doctor.consultationHours || 'Not set'}</td>
                                                        <td className="px-3 py-3">
                                                            <button
                                                                onClick={() => handleToggleActive(doctor.id, doctor.active)}
                                                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${doctor.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
                                                            >
                                                                {doctor.active ? 'Active' : 'Inactive'}
                                                            </button>
                                                        </td>
                                                        <td className="px-3 py-3 text-right">
                                                            <button onClick={() => openEditModal(doctor)} className="mr-4 text-sm font-semibold text-slate-600 hover:text-slate-950">Edit</button>
                                                            <button onClick={() => handleDelete(doctor.id)} className="text-sm font-semibold text-red-600 hover:text-red-700">Delete</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl ring-1 ring-slate-200">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-950">{editingId ? 'Edit doctor' : 'Add doctor'}</h2>
                                <p className="mt-1 text-sm text-slate-500">Sub department is optional, but recommended when the department has service lines.</p>
                            </div>
                            <button onClick={closeModal} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900">Close</button>
                        </div>
                        <form onSubmit={handleSaveDoctor} className="mt-6 space-y-4">
                            <div>
                                <label className="text-sm font-semibold text-slate-700">Full name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Dr. Anil Kumar"
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                    value={doctorForm.name}
                                    onChange={(e) => setDoctorForm({ ...doctorForm, name: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="text-sm font-semibold text-slate-700">Department</label>
                                    <select
                                        required
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                        value={doctorForm.department}
                                        onChange={(e) => setDoctorForm({ ...doctorForm, department: e.target.value, subDepartment: '' })}
                                    >
                                        <option value="">Select department</option>
                                        {activeDepartments.map((department) => (
                                            <option key={department.id} value={department.name}>{department.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-700">Sub department</label>
                                    <select
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={doctorForm.subDepartment}
                                        disabled={!doctorForm.department || availableSubDepartments.length === 0}
                                        onChange={(e) => setDoctorForm({ ...doctorForm, subDepartment: e.target.value })}
                                    >
                                        <option value="">No sub department</option>
                                        {availableSubDepartments.map((sub) => (
                                            <option key={sub.id} value={sub.name}>{sub.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="text-sm font-semibold text-slate-700">Specialization</label>
                                    <input
                                        type="text"
                                        placeholder="Interventional Cardiology"
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                        value={doctorForm.specialization}
                                        onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-700">Consultation hours</label>
                                    <input
                                        type="text"
                                        placeholder="Mon-Fri: 9 AM - 5 PM"
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                        value={doctorForm.consultationHours}
                                        onChange={(e) => setDoctorForm({ ...doctorForm, consultationHours: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={closeModal} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                    Cancel
                                </button>
                                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                                    {saving ? 'Saving...' : editingId ? 'Save changes' : 'Save doctor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
