 'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Layout({ children, fullWidth = false }: { children: React.ReactNode; fullWidth?: boolean }) {
    const pathname = usePathname();
    const navItems = [
        { href: '/', label: 'Dashboard' },
        { href: '/doctors', label: 'Doctors' },
        { href: '/departments', label: 'Departments' },
        { href: '/availability', label: 'Availability' },
        { href: '/appointments', label: 'Appointments' },
        { href: '/tickets', label: 'Tickets' },
        { href: '/reports', label: 'Reports' },
        { href: '/knowledge', label: 'Knowledge Base', icon: '🧠' },
    ];

    const isActive = (href: string) => {
        if (href === '/') return pathname === '/';
        return pathname.startsWith(href);
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-white font-sans text-slate-900">
            <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
                                <span className="text-xl font-bold">+</span>
                            </div>
                            <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                                CarePlus <span className="text-emerald-600">Clinic</span>
                            </span>
                            <span className="hidden text-xs text-slate-500 lg:inline">Demo clinic management</span>
                        </div>
                        <div className="hidden xl:block">
                            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                                {navItems.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                                            isActive(item.href)
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'text-slate-600 hover:bg-slate-50 hover:text-emerald-600'
                                        }`}
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            {item.icon ? <span className="text-base leading-none">{item.icon}</span> : null}
                                            <span>{item.label}</span>
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="hidden sm:flex flex-col items-end">
                                <span className="text-xs font-semibold text-slate-900">Admin User</span>
                                <span className="text-[10px] text-slate-500">Super Admin</span>
                            </div>
                            <div className="h-9 w-9 rounded-full bg-slate-200 border-2 border-white shadow-sm ring-1 ring-slate-100 uppercase flex items-center justify-center text-xs font-bold text-slate-600">
                                AD
                            </div>
                        </div>
                    </div>
                </div>
                <div className="xl:hidden border-t border-slate-200/70 bg-white/95">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="flex gap-2 overflow-x-auto py-2">
                            {navItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                                        isActive(item.href)
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        {item.icon ? <span>{item.icon}</span> : null}
                                        <span>{item.label}</span>
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </nav>
            <main className={fullWidth ? 'w-full' : 'mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8'}>
                {children}
            </main>
        </div>
    );
}
