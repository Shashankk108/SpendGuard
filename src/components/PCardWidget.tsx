import { useState, useEffect } from 'react';
import { Wifi } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PCardUsage {
  total_spent: number;
  remaining_balance: number;
  monthly_limit: number;
  transaction_count: number;
  period_start: string;
  period_end: string;
}

export default function PCardWidget() {
  const [usage, setUsage] = useState<PCardUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    fetchUsage();
  }, []);

  async function fetchUsage() {
    try {
      const { data, error } = await supabase.rpc('get_pcard_monthly_usage');
      if (error) throw error;

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      if (data) {
        const rawData: any = Array.isArray(data) ? data[0] : data;
        setUsage({
          total_spent: rawData.current_usage || 0,
          remaining_balance: rawData.remaining || rawData.monthly_limit || 15000,
          monthly_limit: rawData.monthly_limit || 15000,
          transaction_count: rawData.transaction_count || 0,
          period_start: rawData.month || currentMonth,
          period_end: rawData.month || currentMonth,
        });
      } else {
        setUsage({
          total_spent: 0,
          remaining_balance: 15000,
          monthly_limit: 15000,
          transaction_count: 0,
          period_start: currentMonth,
          period_end: currentMonth,
        });
      }
    } catch (error) {
      console.error('Error fetching PCard usage:', error);
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      setUsage({
        total_spent: 0,
        remaining_balance: 15000,
        monthly_limit: 15000,
        transaction_count: 0,
        period_start: currentMonth,
        period_end: currentMonth,
      });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="aspect-[1.586/1] w-full max-w-[380px] bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl animate-pulse" />
    );
  }

  if (!usage) return null;

  const usagePercent = Math.min((usage.total_spent / usage.monthly_limit) * 100, 100);
  const remainingPercent = Math.max(100 - usagePercent, 0);
  const isOverBudget = usage.total_spent > usage.monthly_limit;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getMonthName = (dateStr: string) => {
    const [year, month] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, 15).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  return (
    <div
      className={`relative cursor-pointer transition-all duration-500 ease-out ${
        isHovered ? 'scale-105 z-50' : 'scale-100 z-10'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ perspective: '1000px' }}
    >
      <div
        className={`relative aspect-[1.586/1] w-full max-w-[380px] rounded-2xl overflow-hidden transition-all duration-500 ${
          isHovered ? 'shadow-2xl shadow-slate-900/50' : 'shadow-xl shadow-slate-900/30'
        }`}
        style={{
          transform: isHovered ? 'rotateY(-5deg) rotateX(5deg)' : 'rotateY(0) rotateX(0)',
          transformStyle: 'preserve-3d',
        }}
      >
        <div className={`absolute inset-0 ${
          isOverBudget
            ? 'bg-gradient-to-br from-rose-900 via-red-800 to-rose-950'
            : 'bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900'
        }`} />

        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/3 blur-2xl" />
        </div>

        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMDIiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-50" />

        <div className="relative h-full p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-medium text-white/50 uppercase tracking-widest mb-0.5">Corporate Card</p>
              <h3 className="text-base font-bold text-white tracking-wide">SpendGuard</h3>
            </div>
            <div className="flex items-center gap-2">
              <Wifi className="w-5 h-5 text-white/70 rotate-90" />
              <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                isOverBudget
                  ? 'bg-white/20 text-white'
                  : remainingPercent < 20
                  ? 'bg-amber-500/30 text-amber-200'
                  : 'bg-emerald-500/30 text-emerald-200'
              }`}>
                {isOverBudget ? 'Over Limit' : remainingPercent < 20 ? 'Low' : 'Active'}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <div className="mb-1">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Available Balance</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-bold tracking-tight ${isOverBudget ? 'text-white' : 'text-white'}`}>
                  {formatCurrency(Math.max(usage.remaining_balance, 0))}
                </span>
                <span className="text-sm text-white/40">
                  / {formatCurrency(usage.monthly_limit)}
                </span>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-white/50 mb-1.5">
                <span>{formatCurrency(usage.total_spent)} spent</span>
                <span>{usagePercent.toFixed(0)}% used</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    isOverBudget
                      ? 'bg-gradient-to-r from-white/80 to-white/60'
                      : remainingPercent < 20
                      ? 'bg-gradient-to-r from-amber-400 to-amber-300'
                      : 'bg-gradient-to-r from-emerald-400 to-teal-300'
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <p className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">Period</p>
              <p className="text-xs font-medium text-white/80">{getMonthName(usage.period_start)}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">Transactions</p>
              <p className="text-xs font-medium text-white/80">{usage.transaction_count} this month</p>
            </div>
            <div className="flex items-center gap-1 opacity-60">
              <div className="w-7 h-7 rounded-full bg-red-500/80" />
              <div className="w-7 h-7 rounded-full bg-orange-400/80 -ml-3" />
            </div>
          </div>
        </div>

        <div className={`absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none transition-opacity duration-300 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`} />
      </div>

      <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-[90%] h-4 bg-black/20 rounded-full blur-md transition-all duration-500 ${
        isHovered ? 'opacity-70 scale-95' : 'opacity-40 scale-100'
      }`} />
    </div>
  );
}
