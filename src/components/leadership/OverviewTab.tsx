import { useEffect, useState } from 'react';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Users,
  Building2,
  FileText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PurchaseRequest } from '../../types/database';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface Stats {
  totalRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  totalSpend: number;
  pendingValue: number;
  avgProcessingTime: number;
  monthlyTrend: { month: string; amount: number; count: number }[];
  categoryBreakdown: { name: string; value: number }[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentRequests, setRecentRequests] = useState<PurchaseRequest[]>([]);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    const { data: requests } = await supabase
      .from('purchase_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!requests) {
      setLoading(false);
      return;
    }

    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const approved = requests.filter((r) => r.status === 'approved');
    const pending = requests.filter((r) => r.status === 'pending');
    const rejected = requests.filter((r) => r.status === 'rejected');

    const monthlyData: Record<string, { amount: number; count: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      monthlyData[key] = { amount: 0, count: 0 };
    }

    approved.forEach((r) => {
      const d = new Date(r.created_at);
      if (d >= sixMonthsAgo) {
        const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (monthlyData[key]) {
          monthlyData[key].amount += r.total_amount;
          monthlyData[key].count += 1;
        }
      }
    });

    const categoryTotals: Record<string, number> = {};
    approved.forEach((r) => {
      categoryTotals[r.category] = (categoryTotals[r.category] || 0) + r.total_amount;
    });

    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    setStats({
      totalRequests: requests.length,
      pendingRequests: pending.length,
      approvedRequests: approved.length,
      rejectedRequests: rejected.length,
      totalSpend: approved.reduce((sum, r) => sum + r.total_amount, 0),
      pendingValue: pending.reduce((sum, r) => sum + r.total_amount, 0),
      avgProcessingTime: 2.3,
      monthlyTrend: Object.entries(monthlyData).map(([month, data]) => ({
        month,
        amount: data.amount,
        count: data.count,
      })),
      categoryBreakdown,
    });

    setRecentRequests(requests.slice(0, 5));
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return <p className="text-slate-500 text-center py-8">No data available</p>;
  }

  const statCards = [
    {
      label: 'Total Approved Spend',
      value: `$${stats.totalSpend.toLocaleString()}`,
      icon: DollarSign,
      color: 'emerald',
      subtext: `${stats.approvedRequests} approved requests`,
    },
    {
      label: 'Pending Approval',
      value: `$${stats.pendingValue.toLocaleString()}`,
      icon: Clock,
      color: 'amber',
      subtext: `${stats.pendingRequests} requests waiting`,
    },
    {
      label: 'Approval Rate',
      value: `${stats.totalRequests > 0 ? Math.round((stats.approvedRequests / (stats.approvedRequests + stats.rejectedRequests || 1)) * 100) : 0}%`,
      icon: CheckCircle2,
      color: 'sky',
      subtext: `${stats.rejectedRequests} rejected`,
    },
    {
      label: 'Total Requests',
      value: stats.totalRequests.toString(),
      icon: FileText,
      color: 'slate',
      subtext: 'All time',
    },
  ];

  const colorClasses: Record<string, { bg: string; icon: string }> = {
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600' },
    sky: { bg: 'bg-sky-50', icon: 'text-sky-600' },
    slate: { bg: 'bg-slate-100', icon: 'text-slate-600' },
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-slate-50 rounded-xl p-5 border border-slate-100"
          >
            <div className="flex items-start justify-between mb-3">
              <div
                className={`w-10 h-10 ${colorClasses[card.color].bg} rounded-lg flex items-center justify-center`}
              >
                <card.icon className={`w-5 h-5 ${colorClasses[card.color].icon}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-800">{card.value}</p>
            <p className="text-sm text-slate-500 mt-1">{card.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{card.subtext}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">
            Monthly Spending Trend
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Amount']}
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">
            Spending by Category
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.categoryBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                  labelLine={false}
                >
                  {stats.categoryBreakdown.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Total']}
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {recentRequests.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between py-3 border-b border-slate-200 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    request.status === 'approved'
                      ? 'bg-emerald-500'
                      : request.status === 'pending'
                      ? 'bg-amber-500'
                      : request.status === 'rejected'
                      ? 'bg-red-500'
                      : 'bg-slate-400'
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {request.vendor_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {request.cardholder_name} - {request.category}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-800">
                  ${request.total_amount.toLocaleString()}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(request.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
