'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';

type Department = {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    displayOrder: number;
    active: boolean;
};

export default function DepartmentsPage() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [form, setForm] = useState({ name: '', description: '', icon: '', displayOrder: 0 });
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        fetchDepartments();
    }, []);

    const fetchDepartments = async () => {
        const res = await fetch('/api/departments');
        if (res.ok) {
            const data = await res.json();
            setDepartments(data);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (editingId) {
            // Update existing
            await fetch(`/api/departments/${editingId}`, {
                method: 'PATCH',
                body: JSON.stringify(form),
            });
            setEditingId(null);
        } else {
            // Create new
            await fetch('/api/departments', {
                method: 'POST',
                body: JSON.stringify(form),
            });
        }

        setForm({ name: '', description: '', icon: '', displayOrder: 0 });
        fetchDepartments();
        setLoading(false);
    };

    const handleEdit = (dept: Department) => {
        setForm({
            name: dept.name,
            description: dept.description || '',
            icon: dept.icon || '',
            displayOrder: dept.displayOrder
        });
        setEditingId(dept.id);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this department?')) return;
        await fetch(`/api/departments/${id}`, { method: 'DELETE' });
        fetchDepartments();
    };

    const handleToggleActive = async (dept: Department) => {
        await fetch(`/api/departments/${dept.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ active: !dept.active }),
        });
        fetchDepartments();
    };

    return (
        <AdminLayout>
            <div className="space-y-8">
                <header>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Department Management</h1>
                    <p className="mt-2 text-sm text-slate-500">Manage hospital departments and their display order.</p>
                </header>

                <div className="grid gap-8 lg:grid-cols-3">
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-100">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">
                                {editingId ? 'Edit Department' : 'Add New Department'}
                            </h2>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                        Department Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                        placeholder="e.g. Cardiology"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                        Description
                                    </label>
                                    <textarea
                                        value={form.description}
                                        onChange={e => setForm({ ...form, description: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                                        placeholder="Brief description of the department"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                        Icon (Emoji)
                                    </label>
                                    <input
                                        type="text"
                                        value={form.icon}
                                        onChange={e => setForm({ ...form, icon: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                        placeholder="e.g. ❤️"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                        Display Order
                                    </label>
                                    <input
                                        type="number"
                                        value={form.displayOrder}
                                        onChange={e => setForm({ ...form, displayOrder: parseInt(e.target.value) })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                        min="0"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 bg-emerald-600 text-white font-semibold py-2.5 rounded-xl hover:bg-emerald-700 disabled:opacity-50 shadow-sm shadow-emerald-200 transition-all"
                                    >
                                        {loading ? 'Saving...' : (editingId ? 'Update' : 'Add Department')}
                                    </button>
                                    {editingId && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingId(null);
                                                setForm({ name: '', description: '', icon: '', displayOrder: 0 });
                                            }}
                                            className="px-4 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <span>Departments</span>
                            <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                {departments.length}
                            </span>
                        </h2>
                        {departments.map(dept => (
                            <div
                                key={dept.id}
                                className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md hover:border-emerald-100"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                        {dept.icon && (
                                            <span className="text-3xl">{dept.icon}</span>
                                        )}
                                        <div>
                                            <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                                {dept.name}
                                                {!dept.active && (
                                                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                                        Inactive
                                                    </span>
                                                )}
                                            </h3>
                                            {dept.description && (
                                                <p className="text-slate-600 mt-1 text-sm">{dept.description}</p>
                                            )}
                                            <p className="text-xs text-slate-400 mt-1">Order: {dept.displayOrder}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleToggleActive(dept)}
                                            className="h-8 px-3 flex items-center justify-center rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-all"
                                            title={dept.active ? 'Deactivate' : 'Activate'}
                                        >
                                            {dept.active ? '🔴' : '🟢'}
                                        </button>
                                        <button
                                            onClick={() => handleEdit(dept)}
                                            className="h-8 px-3 flex items-center justify-center rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 transition-all"
                                        >
                                            ✏️ Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(dept.id)}
                                            className="h-8 px-3 flex items-center justify-center rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-all"
                                        >
                                            🗑️ Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {departments.length === 0 && (
                            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
                                <span className="text-4xl mb-4 block">🏥</span>
                                <p className="text-slate-500 font-medium">No departments yet.</p>
                                <p className="text-slate-400 text-sm mt-1">Add your first department using the form on the left.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
