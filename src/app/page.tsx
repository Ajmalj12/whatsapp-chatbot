'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';

type Stats = {
  totalDoctors: number;
  todayAppointments: number;
  activeSlots: number;
  totalPatients: number;
  totalDepartments: number;
  totalSubDepartments: number;
} | null;

export default function Home() {
  const [stats, setStats] = useState<Stats>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setStats(data);
      })
      .catch(() => setStats({
        totalDoctors: 0,
        todayAppointments: 0,
        activeSlots: 0,
        totalPatients: 0,
        totalDepartments: 0,
        totalSubDepartments: 0,
      }))
      .finally(() => setLoading(false));
  }, []);

  const toneBars: Record<string, string> = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    violet: 'bg-violet-500',
    amber: 'bg-amber-500',
    cyan: 'bg-cyan-500',
    rose: 'bg-rose-500',
  };

  const statCards = [
    { label: 'Active doctors', value: stats?.totalDoctors, tone: 'emerald' },
    { label: 'Departments', value: stats?.totalDepartments, tone: 'blue' },
    { label: 'Sub departments', value: stats?.totalSubDepartments, tone: 'violet' },
    { label: 'Today bookings', value: stats?.todayAppointments, tone: 'amber' },
    { label: 'Open slots', value: stats?.activeSlots, tone: 'cyan' },
    { label: 'Total bookings', value: stats?.totalPatients, tone: 'rose' },
  ];

  const actions = [
    { href: '/departments', title: 'Build service hierarchy', detail: 'Add departments and sub departments before assigning doctors.' },
    { href: '/doctors', title: 'Add doctors', detail: 'Place providers inside the right department or sub department.' },
    { href: '/availability', title: 'Publish slots', detail: 'Create the timings patients can book from WhatsApp.' },
    { href: '/tickets', title: 'Review support', detail: 'Reply to escalated patient queries from one place.' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <header className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.5fr_1fr] lg:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Operations overview</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Clinic portal</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Manage departments, sub departments, doctors, availability, bookings, support tickets, and knowledge used by the WhatsApp assistant.
              </p>
            </div>
            <div className="rounded-lg bg-slate-950 p-5 text-white">
              <p className="text-sm font-semibold text-slate-300">System status</p>
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">WhatsApp bot</span>
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">Live</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Database</span>
                  <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-bold text-blue-300">Connected</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {loading && <p className="text-sm text-slate-500">Loading portal metrics...</p>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {statCards.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className={`mb-4 h-1.5 w-10 rounded-full ${toneBars[stat.tone]}`}></div>
              <p className="text-xs font-semibold uppercase text-slate-500">{stat.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{stat.value ?? '-'}</p>
            </div>
          ))}
        </div>

        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-slate-950">Work queue</h2>
              <p className="text-sm text-slate-500">Start with the directory, then publish slots for booking.</p>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {actions.map((action) => (
                <Link key={action.href} href={action.href} className="rounded-lg border border-slate-200 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/40">
                  <p className="font-semibold text-slate-950">{action.title}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{action.detail}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-950">Directory setup</h2>
            <div className="mt-5 space-y-4">
              {['Create departments', 'Add sub departments', 'Assign doctors', 'Open appointment slots'].map((item, index) => (
                <div key={item} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{index + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item}</p>
                    <p className="text-xs text-slate-500">Keeps WhatsApp booking options accurate.</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
