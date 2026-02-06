
'use client';
import { useState, useEffect } from 'react';

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
        <div className="min-h-screen p-8 bg-gray-50 text-black">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-8">Knowledge Base Management</h1>

                <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                    <h2 className="text-xl font-bold mb-4">Add New Entry</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Question / Topic (Optional)</label>
                            <input
                                type="text"
                                value={form.question}
                                onChange={e => setForm({ ...form, question: e.target.value })}
                                className="w-full p-2 border rounded"
                                placeholder="e.g. Opening Hours"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Answer / Content (Required)</label>
                            <textarea
                                value={form.answer}
                                onChange={e => setForm({ ...form, answer: e.target.value })}
                                className="w-full p-2 border rounded h-32"
                                placeholder="e.g. We are open from 9 AM to 5 PM..."
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Add Entry'}
                        </button>
                    </form>
                </div>

                <div className="space-y-4">
                    {items.map(item => (
                        <div key={item.id} className="bg-white p-6 rounded-lg shadow flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-lg">{item.question || '(No Question/Topic)'}</h3>
                                <p className="text-gray-700 mt-2 whitespace-pre-wrap">{item.answer}</p>
                            </div>
                            <button
                                onClick={() => handleDelete(item.id)}
                                className="text-red-500 hover:text-red-700 ml-4"
                            >
                                Delete
                            </button>
                        </div>
                    ))}
                    {items.length === 0 && <p className="text-gray-500 text-center">No entries yet.</p>}
                </div>
            </div>
        </div>
    );
}
