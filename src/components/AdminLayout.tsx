import React from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-lg shadow-emerald-200">
                                <span className="text-xl font-bold">+</span>
                            </div>
                            <span className="text-xl font-bold tracking-tight text-slate-900">
                                ABC <span className="text-emerald-600">Hospital</span>
                            </span>
                        </div>
                        <div className="hidden md:block">
                            <div className="flex items-center gap-8">
                                <a href="/" className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">Dashboard</a>
                                <a href="/doctors" className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">Doctors</a>
                                <a href="/availability" className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">Availability</a>
                                <a href="/appointments" className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">Appointments</a>
                                <a href="/knowledge" className="text-sm font-medium text-emerald-600 font-bold hover:text-emerald-700 transition-colors flex items-center gap-1">
                                    <span className="text-base">🧠</span>
                                    Knowledge Base
                                </a>
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
            </nav>
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    )
}
