
'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';

type KBItem = {
    id: string;
    question: string;
    answer: string;
};

export default function KnowledgeBase() {
    const [items, setItems] = useState<KBItem[]>([]);
    const [form, setForm] = useState({ question: '', answer: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        const res = await fetch('/api/knowledge');
        if (res.ok) {
            const data = await res.json();
            setItems(data);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.answer) return;
        setLoading(true);
        await fetch('/api/knowledge', {
            method: 'POST',
            body: JSON.stringify(form),
        });
        setForm({ question: '', answer: '' });
        fetchItems();
        setLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        await fetch(`/api/knowledge?id=${id}`, { method: 'DELETE' });
        fetchItems();
    };

    return (
        <AdminLayout>
            <div className="space-y-8">
                <header>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Knowledge Base Management</h1>
                    <p className="mt-2 text-sm text-slate-500">Manage AI training data and frequently asked questions for your WhatsApp bot.</p>
                </header>

                <div className="grid gap-8 lg:grid-cols-3">
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-100">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">Add New Entry</h2>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Question / Topic</label>
                                    <input
                                        type="text"
                                        value={form.question}
                                        onChange={e => setForm({ ...form, question: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                        placeholder="e.g. Opening Hours"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Answer / Content</label>
                                    <textarea
                                        value={form.answer}
                                        onChange={e => setForm({ ...form, answer: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm h-32 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                                        placeholder="e.g. We are open from 9 AM to 5 PM..."
                                        required
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-emerald-600 text-white font-semibold py-2.5 rounded-xl hover:bg-emerald-700 disabled:opacity-50 shadow-sm shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                                >
                                    {loading ? 'Saving...' : (
                                        <>
                                            <span>Add Entry</span>
                                            <span className="text-lg">➕</span>
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <span>Knowledge Entries</span>
                            <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{items.length}</span>
                        </h2>
                        {items.map(item => (
                            <div key={item.id} className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md hover:border-emerald-100">
                                <div className="pr-12">
                                    <h3 className="font-bold text-slate-900">{item.question || '(No Question/Topic)'}</h3>
                                    <p className="text-slate-600 mt-2 text-sm leading-relaxed whitespace-pre-wrap">{item.answer}</p>
                                </div>
                                <button
                                    onClick={() => handleDelete(item.id)}
                                    className="absolute top-6 right-6 h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                    title="Delete Entry"
                                >
                                    🗑️
                                </button>
                            </div>
                        ))}
                        {items.length === 0 && (
                            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
                                <span className="text-4xl mb-4 block">📚</span>
                                <p className="text-slate-500 font-medium">No knowledge entries yet.</p>
                                <p className="text-slate-400 text-sm mt-1">Add your first entry using the form on the left.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
