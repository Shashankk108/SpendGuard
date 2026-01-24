import { useEffect, useState } from 'react';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  FileText,
  Receipt,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import PCardWidget from '../PCardWidget';
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

interface ReceiptStats {
  pendingReview: number;
  needsInfo: number;
  recentUploads: Array<{
    id: string;
    vendor_name: string;
    total_amount: number;
    uploader_name: string;
    uploaded_at: string;
  }>;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface OverviewTabProps {
  onNavigateToReceipts?: () => void;
}

export default function OverviewTab({ onNavigateToReceipts }: OverviewTabProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentRequests, setRecentRequests] = useState<PurchaseRequest[]>([]);
  const [receiptStats, setReceiptStats] = useState<ReceiptStats>({ pendingReview: 0, needsInfo: 0, recentUploads: [] });

  useEffect(() => {
    fetchStats();
    fetchReceiptStats();
  }, []);

  async function fetchReceiptStats() {
    const { data: receipts } = await supabase
      .from('purchase_receipts')
      .select('id, status, created_at, is_current')
      .eq('is_current', true);

    const pendingReview = receipts?.filter(r => r.status === 'pending').length || 0;
    const needsInfo = receipts?.filter(r => r.status === 'needs_info').length || 0;

    const { data: recentReceipts } = await supabase
      .from('purchase_receipts')
      .select('id, uploaded_at, user_id, request_id')
      .eq('is_current', true)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5);

    const recentWithDetails = await Promise.all(
      (recentReceipts || []).map(async (receipt) => {
        const [requestData, userData] = await Promise.all([
          supabase.from('purchase_requests').select('vendor_name, total_amount').eq('id', receipt.request_id).maybeSingle(),
          supabase.from('profiles').select('full_name').eq('id', receipt.user_id).maybeSingle(),
        ]);
        return {
          id: receipt.id,
          vendor_name: requestData.data?.vendor_name || 'Unknown',
          total_amount: requestData.data?.total_amount || 0,
          uploader_name: userData.data?.full_name || 'Unknown',
          uploaded_at: receipt.uploaded_at,
        };
      })
    );

    setReceiptStats({ pendingReview, needsInfo, recentUploads: recentWithDetails });
  }

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

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="space-y-8">
      {(receiptStats.pendingReview > 0 || receiptStats.needsInfo > 0) && (
        <div className="bg-gradient-to-r from-sky-50 via-cyan-50 to-teal-50 border-2 border-sky-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Receipt className="w-6 h-6 text-sky-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-1">
                  Receipts Awaiting Review
                </h3>
                <div className="flex items-center gap-4 mb-3">
                  {receiptStats.pendingReview > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-100 text-sky-700 rounded-full text-xs font-semibold">
                      <span className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
                      {receiptStats.pendingReview} pending review
                    </span>
                  )}
                  {receiptStats.needsInfo > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                      <AlertTriangle className="w-3 h-3" />
                      {receiptStats.needsInfo} needs info
                    </span>
                  )}
                </div>
                {receiptStats.recentUploads.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Recent Uploads</p>
                    {receiptStats.recentUploads.slice(0, 3).map(receipt => (
                      <div key={receipt.id} className="flex items-center gap-3 bg-white/60 rounded-lg px-3 py-2">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Receipt className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{receipt.vendor_name}</p>
                          <p className="text-xs text-slate-500">{receipt.uploader_name} - ${receipt.total_amount.toLocaleString()}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">{formatTimeAgo(receipt.uploaded_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {onNavigateToReceipts && (
              <button
                onClick={onNavigateToReceipts}
                className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
              >
                Review Receipts
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-1">
          <PCardWidget />
        </div>
        <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
