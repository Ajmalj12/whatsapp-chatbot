import AdminLayout from '@/components/AdminLayout';

export default function Home() {
  return (
    <AdminLayout>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">Welcome back! Here's what's happening at ABC Hospital today.</p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total Doctors', value: '12', color: 'bg-blue-50 text-blue-700', icon: '🩺' },
            { label: 'Today\'s Appointments', value: '24', color: 'bg-emerald-50 text-emerald-700', icon: '📅' },
            { label: 'Active Slots', value: '48', color: 'bg-orange-50 text-orange-700', icon: '⏰' },
            { label: 'Total Patients', value: '1,280', color: 'bg-purple-50 text-purple-700', icon: '👥' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{stat.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${stat.color}`}>
                  {stat.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Quick Actions</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button className="flex flex-col items-start gap-1 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-left transition-all hover:bg-emerald-50 hover:border-emerald-100 group">
                <span className="text-lg text-emerald-600 group-hover:scale-110 transition-transform">➕</span>
                <span className="font-semibold text-slate-900">Add Doctor</span>
                <span className="text-xs text-slate-500">Register a new specialist</span>
              </button>
              <button className="flex flex-col items-start gap-1 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-left transition-all hover:bg-orange-50 hover:border-orange-100 group">
                <span className="text-lg text-orange-600 group-hover:scale-110 transition-transform">⚡</span>
                <span className="font-semibold text-slate-900">Update Slots</span>
                <span className="text-xs text-slate-500">Change today's availability</span>
              </button>
              <a href="/knowledge" className="flex flex-col items-start gap-1 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-left transition-all hover:bg-blue-50 hover:border-blue-100 group sm:col-span-2">
                <span className="text-lg text-blue-600 group-hover:scale-110 transition-transform">🧠</span>
                <span className="font-semibold text-slate-900">Knowledge Base</span>
                <span className="text-xs text-slate-500">Manage AI training data & FAQs</span>
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-lg font-bold text-slate-900">System Status</h2>
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-green-50/50 border border-green-100">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-sm font-medium text-green-700">WhatsApp Bot Active</span>
                </div>
                <span className="text-xs text-green-600 font-semibold">Live</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/50 border border-blue-100">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                  <span className="text-sm font-medium text-blue-700">Database Connected</span>
                </div>
                <span className="text-xs text-blue-600 font-semibold">Connected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
