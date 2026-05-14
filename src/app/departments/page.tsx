'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';

type SubDepartment = {
    id: string;
    name: string;
    description?: string | null;
    displayOrder: number;
    active: boolean;
    departmentId: string;
};

type Department = {
    id: string;
    name: string;
    description?: string | null;
    icon?: string | null;
    displayOrder: number;
    active: boolean;
    subDepartments: SubDepartment[];
};

const emptyDepartmentForm = { name: '', description: '', icon: '', displayOrder: 0 };
const emptySubDepartmentForm = { departmentId: '', name: '', description: '', displayOrder: 0 };
const iconChoices = ['+', 'H', 'C', 'N', 'O', 'P', 'D', 'E', 'M', 'S', 'T', 'V'];

export default function DepartmentsPage() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [departmentForm, setDepartmentForm] = useState(emptyDepartmentForm);
    const [subDepartmentForm, setSubDepartmentForm] = useState(emptySubDepartmentForm);
    const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
    const [editingSubDepartmentId, setEditingSubDepartmentId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);

    useEffect(() => {
        fetchDepartments();
    }, []);

    const activeSubDepartments = useMemo(
        () => departments.reduce((count, dept) => count + dept.subDepartments.filter((sub) => sub.active).length, 0),
        [departments]
    );

    const fetchDepartments = async () => {
        try {
            const res = await fetch('/api/departments?includeInactive=true');
            const data = await res.json();
            setDepartments(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching departments:', error);
        } finally {
            setLoading(false);
        }
    };

    const resetDepartmentForm = () => {
        setDepartmentForm(emptyDepartmentForm);
        setEditingDepartmentId(null);
    };

    const resetSubDepartmentForm = () => {
        setSubDepartmentForm({
            ...emptySubDepartmentForm,
            departmentId: departments[0]?.id || ''
        });
        setEditingSubDepartmentId(null);
    };

    const handleDepartmentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const url = editingDepartmentId ? `/api/departments/${editingDepartmentId}` : '/api/departments';

        await fetch(url, {
            method: editingDepartmentId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(departmentForm)
        });

        resetDepartmentForm();
        await fetchDepartments();
        setSaving(false);
    };

    const handleSubDepartmentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const url = editingSubDepartmentId ? `/api/sub-departments/${editingSubDepartmentId}` : '/api/sub-departments';

        await fetch(url, {
            method: editingSubDepartmentId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subDepartmentForm)
        });

        resetSubDepartmentForm();
        await fetchDepartments();
        setSaving(false);
    };

    const editDepartment = (department: Department) => {
        setEditingDepartmentId(department.id);
        setDepartmentForm({
            name: department.name,
            description: department.description || '',
            icon: department.icon || '',
            displayOrder: department.displayOrder
        });
    };

    const editSubDepartment = (subDepartment: SubDepartment) => {
        setEditingSubDepartmentId(subDepartment.id);
        setSubDepartmentForm({
            departmentId: subDepartment.departmentId,
            name: subDepartment.name,
            description: subDepartment.description || '',
            displayOrder: subDepartment.displayOrder
        });
    };

    const toggleDepartment = async (department: Department) => {
        await fetch(`/api/departments/${department.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: !department.active })
        });
        fetchDepartments();
    };

    const toggleSubDepartment = async (subDepartment: SubDepartment) => {
        await fetch(`/api/sub-departments/${subDepartment.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: !subDepartment.active })
        });
        fetchDepartments();
    };

    const deleteDepartment = async (department: Department) => {
        if (!confirm(`Delete ${department.name} and its sub departments?`)) return;
        await fetch(`/api/departments/${department.id}`, { method: 'DELETE' });
        fetchDepartments();
    };

    const deleteSubDepartment = async (subDepartment: SubDepartment) => {
        if (!confirm(`Delete ${subDepartment.name}? Doctors assigned to it will stay in their parent department.`)) return;
        await fetch(`/api/sub-departments/${subDepartment.id}`, { method: 'DELETE' });
        fetchDepartments();
    };

    const handleSeedDepartments = async () => {
        if (!confirm('Create common hospital departments and sub departments?')) return;

        setSeeding(true);
        try {
            const res = await fetch('/api/departments/seed', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(`Created ${data.departmentsCreated} departments and ${data.subDepartmentsCreated || 0} sub departments.`);
                fetchDepartments();
            } else {
                alert(data.error || 'Failed to seed departments');
            }
        } finally {
            setSeeding(false);
        }
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Clinical directory</p>
                        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Departments</h1>
                        <p className="mt-2 max-w-2xl text-sm text-slate-600">
                            Build parent departments, add sub departments beneath them, then assign doctors to the exact service line.
                        </p>
                    </div>
                    <button
                        onClick={handleSeedDepartments}
                        disabled={seeding}
                        className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                    >
                        {seeding ? 'Seeding...' : 'Seed directory'}
                    </button>
                </header>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase text-slate-500">Departments</p>
                        <p className="mt-2 text-2xl font-bold text-slate-950">{departments.length}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase text-slate-500">Active sub departments</p>
                        <p className="mt-2 text-2xl font-bold text-slate-950">{activeSubDepartments}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase text-slate-500">Inactive items</p>
                        <p className="mt-2 text-2xl font-bold text-slate-950">
                            {departments.filter((dept) => !dept.active).length +
                                departments.reduce((count, dept) => count + dept.subDepartments.filter((sub) => !sub.active).length, 0)}
                        </p>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
                    <div className="space-y-4">
                        <form onSubmit={handleDepartmentSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-base font-bold text-slate-950">{editingDepartmentId ? 'Edit department' : 'Add department'}</h2>
                                {editingDepartmentId && (
                                    <button type="button" onClick={resetDepartmentForm} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
                                        Cancel
                                    </button>
                                )}
                            </div>
                            <div className="space-y-3">
                                <input
                                    required
                                    value={departmentForm.name}
                                    onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })}
                                    placeholder="Department name"
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                />
                                <textarea
                                    value={departmentForm.description}
                                    onChange={(e) => setDepartmentForm({ ...departmentForm, description: e.target.value })}
                                    placeholder="Short description"
                                    className="h-20 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                />
                                <div className="grid grid-cols-[1fr_92px] gap-3">
                                    <select
                                        value={departmentForm.icon}
                                        onChange={(e) => setDepartmentForm({ ...departmentForm, icon: e.target.value })}
                                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                    >
                                        <option value="">Icon</option>
                                        {iconChoices.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
                                    </select>
                                    <input
                                        type="number"
                                        min="0"
                                        value={departmentForm.displayOrder}
                                        onChange={(e) => setDepartmentForm({ ...departmentForm, displayOrder: Number(e.target.value) })}
                                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                    />
                                </div>
                                <button disabled={saving} className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">
                                    {saving ? 'Saving...' : editingDepartmentId ? 'Update department' : 'Create department'}
                                </button>
                            </div>
                        </form>

                        <form onSubmit={handleSubDepartmentSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-base font-bold text-slate-950">{editingSubDepartmentId ? 'Edit sub department' : 'Add sub department'}</h2>
                                {editingSubDepartmentId && (
                                    <button type="button" onClick={resetSubDepartmentForm} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
                                        Cancel
                                    </button>
                                )}
                            </div>
                            <div className="space-y-3">
                                <select
                                    required
                                    value={subDepartmentForm.departmentId}
                                    onChange={(e) => setSubDepartmentForm({ ...subDepartmentForm, departmentId: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                >
                                    <option value="">Parent department</option>
                                    {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                                </select>
                                <input
                                    required
                                    value={subDepartmentForm.name}
                                    onChange={(e) => setSubDepartmentForm({ ...subDepartmentForm, name: e.target.value })}
                                    placeholder="Sub department name"
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                />
                                <textarea
                                    value={subDepartmentForm.description}
                                    onChange={(e) => setSubDepartmentForm({ ...subDepartmentForm, description: e.target.value })}
                                    placeholder="Service notes"
                                    className="h-20 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                />
                                <input
                                    type="number"
                                    min="0"
                                    value={subDepartmentForm.displayOrder}
                                    onChange={(e) => setSubDepartmentForm({ ...subDepartmentForm, displayOrder: Number(e.target.value) })}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                                    placeholder="Display order"
                                />
                                <button disabled={saving || departments.length === 0} className="w-full rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">
                                    {saving ? 'Saving...' : editingSubDepartmentId ? 'Update sub department' : 'Create sub department'}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-5 py-4">
                            <h2 className="font-bold text-slate-950">Department hierarchy</h2>
                            <p className="text-sm text-slate-500">Sub departments appear under their parent department and are available on the doctor form.</p>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {loading ? (
                                <p className="p-8 text-center text-sm text-slate-500">Loading departments...</p>
                            ) : departments.length === 0 ? (
                                <p className="p-8 text-center text-sm text-slate-500">No departments yet. Add one to start building the hierarchy.</p>
                            ) : departments.map((dept) => (
                                <section key={dept.id} className="p-5">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="flex gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-sm font-bold text-emerald-800">
                                                {dept.icon || dept.name.slice(0, 1)}
                                            </div>
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-bold text-slate-950">{dept.name}</h3>
                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${dept.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        {dept.active ? 'Active' : 'Inactive'}
                                                    </span>
                                                    <span className="text-xs text-slate-400">Order {dept.displayOrder}</span>
                                                </div>
                                                {dept.description && <p className="mt-1 text-sm text-slate-600">{dept.description}</p>}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button onClick={() => editDepartment(dept)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                                            <button onClick={() => toggleDepartment(dept)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                                {dept.active ? 'Deactivate' : 'Activate'}
                                            </button>
                                            <button onClick={() => deleteDepartment(dept)} className="rounded-md border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Delete</button>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                                        {dept.subDepartments.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                                                No sub departments under {dept.name} yet.
                                            </div>
                                        ) : dept.subDepartments.map((sub) => (
                                            <div key={sub.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h4 className="font-semibold text-slate-900">{sub.name}</h4>
                                                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sub.active ? 'bg-white text-emerald-700 ring-1 ring-emerald-100' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
                                                                {sub.active ? 'Active' : 'Inactive'}
                                                            </span>
                                                        </div>
                                                        {sub.description && <p className="mt-1 text-sm text-slate-600">{sub.description}</p>}
                                                    </div>
                                                    <span className="text-xs text-slate-400">#{sub.displayOrder}</span>
                                                </div>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <button onClick={() => editSubDepartment(sub)} className="text-xs font-semibold text-slate-600 hover:text-slate-950">Edit</button>
                                                    <button onClick={() => toggleSubDepartment(sub)} className="text-xs font-semibold text-slate-600 hover:text-slate-950">
                                                        {sub.active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                    <button onClick={() => deleteSubDepartment(sub)} className="text-xs font-semibold text-red-600 hover:text-red-700">Delete</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
