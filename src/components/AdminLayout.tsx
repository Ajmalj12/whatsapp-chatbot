'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
    { href: '/', label: 'Dashboard', icon: 'DB' },
    { href: '/doctors', label: 'Doctors', icon: 'DR' },
    { href: '/departments', label: 'Departments', icon: 'DP' },
    { href: '/availability', label: 'Availability', icon: 'AV' },
    { href: '/appointments', label: 'Appointments', icon: 'AP' },
    { href: '/tickets', label: 'Tickets', icon: 'TK' },
    { href: '/reports', label: 'Reports', icon: 'RP' },
    { href: '/knowledge', label: 'Knowledge Base', icon: 'KB' },
];

export default function Layout({ children, fullWidth = false }: { children: React.ReactNode; fullWidth?: boolean }) {
    const pathname = usePathname();
    const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

    return (
        <div className="min-h-screen bg-slate-100 font-sans text-slate-950">
            <div className="flex min-h-screen">
                <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
                    <div className="border-b border-slate-200 px-6 py-5">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-lg font-bold text-white">+</div>
                            <div>
                                <p className="text-base font-bold tracking-tight text-slate-950">CarePlus Clinic</p>
                                <p className="text-xs font-medium text-slate-500">WhatsApp care portal</p>
                            </div>
                        </Link>
                    </div>

                    <nav className="flex-1 space-y-1 px-3 py-4">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                                    isActive(item.href)
                                        ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                                }`}
                            >
                                <span className={`flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold ${
                                    isActive(item.href) ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500'
                                }`}>
                                    {item.icon}
                                </span>
                                {item.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="border-t border-slate-200 p-4">
                        <div className="rounded-lg bg-slate-950 p-4 text-white">
                            <p className="text-sm font-bold">Admin User</p>
                            <p className="mt-1 text-xs text-slate-300">Directory, bookings, support</p>
                        </div>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur lg:hidden">
                        <div className="flex h-16 items-center justify-between px-4">
                            <Link href="/" className="flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 font-bold text-white">+</div>
                                <span className="font-bold text-slate-950">CarePlus</span>
                            </Link>
                            <div className="h-9 w-9 rounded-full bg-slate-200 text-xs font-bold text-slate-600 flex items-center justify-center">AD</div>
                        </div>
                        <div className="flex gap-2 overflow-x-auto border-t border-slate-200 px-4 py-2">
                            {navItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                        isActive(item.href) ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
                                    }`}
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </header>

                    <main className={fullWidth ? 'w-full' : 'mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8'}>
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
