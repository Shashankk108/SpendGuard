import { useEffect, useState, useMemo } from 'react';
import {
  Users,
  Building2,
  Tag,
  Calendar,
  Download,
  ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PurchaseRequest, Profile } from '../../types/database';
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
  LineChart,
  Line,
  Legend,
} from 'recharts';

type DateRange = 'this_month' | 'last_month' | 'this_quarter' | 'ytd' | 'last_year' | 'all';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

interface EmployeeStats {
  name: string;
  department: string;
  totalSpend: number;
  requestCount: number;
  approvedCount: number;
  rejectedCount: number;
  avgAmount: number;
}

interface VendorStats {
  name: string;
  totalSpend: number;
  requestCount: number;
  isPreferred: boolean;
}

interface CategoryStats {
  name: string;
  totalSpend: number;
  requestCount: number;
}

export default function AnalyticsTab() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('ytd');
  const [activeView, setActiveView] = useState<'employees' | 'vendors' | 'categories' | 'trends'>('employees');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [{ data: requestsData }, { data: profilesData }] = await Promise.all([
      supabase.from('purchase_requests').select('*'),
      supabase.from('profiles').select('*'),
    ]);

    setRequests(requestsData || []);
    setProfiles(profilesData || []);
    setLoading(false);
  }

  const filteredRequests = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (dateRange) {
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        return requests.filter((r) => {
          const d = new Date(r.created_at);
          return d >= startDate && d <= endOfLastMonth;
        });
      case 'this_quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'last_year':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31);
        return requests.filter((r) => {
          const d = new Date(r.created_at);
          return d >= startDate && d <= endOfLastYear;
        });
      case 'all':
      default:
        return requests;
    }

    return requests.filter((r) => new Date(r.created_at) >= startDate);
  }, [requests, dateRange]);

  const employeeStats = useMemo(() => {
    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const statsMap = new Map<string, EmployeeStats>();

    filteredRequests.forEach((r) => {
      const profile = profileMap.get(r.requester_id);
      const key = r.requester_id;

      if (!statsMap.has(key)) {
        statsMap.set(key, {
          name: profile?.full_name || r.cardholder_name,
          department: profile?.department || '-',
          totalSpend: 0,
          requestCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          avgAmount: 0,
        });
      }

      const stats = statsMap.get(key)!;
      stats.requestCount += 1;

      if (r.status === 'approved') {
        stats.totalSpend += r.total_amount;
        stats.approvedCount += 1;
      } else if (r.status === 'rejected') {
        stats.rejectedCount += 1;
      }
    });

    statsMap.forEach((stats) => {
      stats.avgAmount = stats.approvedCount > 0 ? stats.totalSpend / stats.approvedCount : 0;
    });

    return Array.from(statsMap.values()).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [filteredRequests, profiles]);

  const vendorStats = useMemo(() => {
    const statsMap = new Map<string, VendorStats>();

    filteredRequests
      .filter((r) => r.status === 'approved')
      .forEach((r) => {
        const key = r.vendor_name.toLowerCase();

        if (!statsMap.has(key)) {
          statsMap.set(key, {
            name: r.vendor_name,
            totalSpend: 0,
            requestCount: 0,
            isPreferred: r.is_preferred_vendor,
          });
        }

        const stats = statsMap.get(key)!;
        stats.totalSpend += r.total_amount;
        stats.requestCount += 1;
      });

    return Array.from(statsMap.values()).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [filteredRequests]);

  const categoryStats = useMemo(() => {
    const statsMap = new Map<string, CategoryStats>();

    filteredRequests
      .filter((r) => r.status === 'approved')
      .forEach((r) => {
        if (!statsMap.has(r.category)) {
          statsMap.set(r.category, {
            name: r.category,
            totalSpend: 0,
            requestCount: 0,
          });
        }

        const stats = statsMap.get(r.category)!;
        stats.totalSpend += r.total_amount;
        stats.requestCount += 1;
      });

    return Array.from(statsMap.values()).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [filteredRequests]);

  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months: { month: string; approved: number; pending: number; rejected: number }[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      months.push({ month: monthKey, approved: 0, pending: 0, rejected: 0 });
    }

    requests.forEach((r) => {
      const d = new Date(r.created_at);
      const monthKey = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const monthData = months.find((m) => m.month === monthKey);

      if (monthData) {
        if (r.status === 'approved') {
          monthData.approved += r.total_amount;
        } else if (r.status === 'pending') {
          monthData.pending += r.total_amount;
        } else if (r.status === 'rejected') {
          monthData.rejected += r.total_amount;
        }
      }
    });

    return months;
  }, [requests]);

  const preferredVendorPercentage = useMemo(() => {
    const approved = filteredRequests.filter((r) => r.status === 'approved');
    if (approved.length === 0) return 0;
    const preferredCount = approved.filter((r) => r.is_preferred_vendor).length;
    return Math.round((preferredCount / approved.length) * 100);
  }, [filteredRequests]);

  function exportData() {
    let data: Record<string, unknown>[];
    let filename: string;

    switch (activeView) {
      case 'employees':
        data = employeeStats;
        filename = 'employee-spending';
        break;
      case 'vendors':
        data = vendorStats;
        filename = 'vendor-spending';
        break;
      case 'categories':
        data = categoryStats;
        filename = 'category-spending';
        break;
      default:
        data = monthlyTrend;
        filename = 'monthly-trends';
    }

    const headers = Object.keys(data[0] || {});
    const csv = [
      headers.join(','),
      ...data.map((row) => headers.map((h) => `"${row[h]}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const viewTabs = [
    { id: 'employees', label: 'By Employee', icon: Users },
    { id: 'vendors', label: 'By Vendor', icon: Building2 },
    { id: 'categories', label: 'By Category', icon: Tag },
    { id: 'trends', label: 'Trends', icon: Calendar },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
          {viewTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeView === tab.id
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="appearance-none pl-3 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="ytd">Year to Date</option>
              <option value="last_year">Last Year</option>
              <option value="all">All Time</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={exportData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {activeView === 'employees' && (
        <div className="space-y-6">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Top Spenders</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeeStats.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    stroke="#94a3b8"
                    width={120}
                  />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toLocaleString()}`, 'Total Spend']}
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="totalSpend" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">
                    Employee
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">
                    Department
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">
                    Total Spend
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">
                    Requests
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">
                    Approval Rate
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">
                    Avg Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employeeStats.map((emp) => (
                  <tr key={emp.name} className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm font-medium text-slate-800">{emp.name}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{emp.department}</td>
                    <td className="py-3 px-4 text-sm font-semibold text-slate-800 text-right">
                      ${emp.totalSpend.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 text-center">
                      {emp.requestCount}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          emp.approvedCount / (emp.approvedCount + emp.rejectedCount || 1) >= 0.8
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {Math.round(
                          (emp.approvedCount / (emp.approvedCount + emp.rejectedCount || 1)) * 100
                        )}
                        %
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 text-right">
                      ${emp.avgAmount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === 'vendors' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Top Vendors by Spend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={vendorStats.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="totalSpend"
                      nameKey="name"
                    >
                      {vendorStats.slice(0, 8).map((_, index) => (
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
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Vendor Usage</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Preferred Vendor Usage</p>
                    <p className="text-xs text-slate-500">
                      {preferredVendorPercentage}% of approved purchases
                    </p>
                  </div>
                  <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${preferredVendorPercentage}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Unique Vendors</p>
                    <p className="text-xs text-slate-500">Active vendors in period</p>
                  </div>
                  <span className="text-2xl font-bold text-slate-800">{vendorStats.length}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">
                    Vendor
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase">
                    Total Spend
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">
                    Orders
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">
                    Preferred
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendorStats.map((vendor) => (
                  <tr key={vendor.name} className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm font-medium text-slate-800">{vendor.name}</td>
                    <td className="py-3 px-4 text-sm font-semibold text-slate-800 text-right">
                      ${vendor.totalSpend.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 text-center">
                      {vendor.requestCount}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {vendor.isPreferred ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                          Yes
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">
                          No
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === 'categories' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Spending by Category</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      stroke="#94a3b8"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="#94a3b8"
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Total Spend']}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="totalSpend" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Category Distribution</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="totalSpend"
                      nameKey="name"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {categoryStats.map((_, index) => (
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

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {categoryStats.map((cat, index) => (
              <div
                key={cat.name}
                className="bg-white border border-slate-200 rounded-xl p-4"
              >
                <div
                  className="w-3 h-3 rounded-full mb-2"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <p className="text-sm font-medium text-slate-800 truncate">{cat.name}</p>
                <p className="text-lg font-bold text-slate-800">
                  ${cat.totalSpend.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">{cat.requestCount} requests</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeView === 'trends' && (
        <div className="space-y-6">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">12-Month Spending Trend</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="approved"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Approved"
                  />
                  <Line
                    type="monotone"
                    dataKey="pending"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Pending"
                  />
                  <Line
                    type="monotone"
                    dataKey="rejected"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Rejected"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
              <p className="text-sm text-emerald-700 font-medium">Total Approved (12 mo)</p>
              <p className="text-2xl font-bold text-emerald-800 mt-1">
                ${monthlyTrend.reduce((sum, m) => sum + m.approved, 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-sm text-amber-700 font-medium">Total Pending (12 mo)</p>
              <p className="text-2xl font-bold text-amber-800 mt-1">
                ${monthlyTrend.reduce((sum, m) => sum + m.pending, 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <p className="text-sm text-red-700 font-medium">Total Rejected (12 mo)</p>
              <p className="text-2xl font-bold text-red-800 mt-1">
                ${monthlyTrend.reduce((sum, m) => sum + m.rejected, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
