import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FilePlus,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  ArrowRight,
  AlertTriangle,
  DollarSign,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { PurchaseRequest } from '../types/database';

export default function DashboardPage() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    draft: 0,
  });

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    const { data, error } = await supabase
      .from('purchase_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error fetching requests:', error);
    } else {
      setRequests(data || []);
      const allRequests = data || [];
      setStats({
        pending: allRequests.filter((r) => r.status === 'pending').length,
        approved: allRequests.filter((r) => r.status === 'approved').length,
        rejected: allRequests.filter((r) => r.status === 'rejected').length,
        draft: allRequests.filter((r) => r.status === 'draft').length,
      });
    }
    setLoading(false);
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-slate-100 text-slate-600',
      pending: 'bg-amber-100 text-amber-700',
      approved: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'approved':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">
          Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-slate-500 mt-1">Here's an overview of your purchase requests</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={Clock}
          color="amber"
          description="Awaiting approval"
        />
        <StatCard
          title="Approved"
          value={stats.approved}
          icon={CheckCircle2}
          color="emerald"
          description="Ready to charge"
        />
        <StatCard
          title="Rejected"
          value={stats.rejected}
          icon={XCircle}
          color="red"
          description="Needs revision"
        />
        <StatCard
          title="Drafts"
          value={stats.draft}
          icon={FileText}
          color="slate"
          description="Incomplete requests"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800">Recent Requests</h2>
              <Link
                to="/my-requests"
                className="text-sm text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1"
              >
                View all
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="p-8 text-center text-slate-500">Loading...</div>
              ) : requests.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 mb-4">No purchase requests yet</p>
                  <Link
                    to="/new-request"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition-colors"
                  >
                    <FilePlus className="w-4 h-4" />
                    Create your first request
                  </Link>
                </div>
              ) : (
                requests.map((request) => (
                  <Link
                    key={request.id}
                    to={`/request/${request.id}`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{request.vendor_name}</p>
                        <p className="text-xs text-slate-500">{request.business_purpose}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-slate-800">
                        ${request.total_amount.toLocaleString()}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(
                          request.status
                        )}`}
                      >
                        {getStatusIcon(request.status)}
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Link
            to="/new-request"
            className="block bg-gradient-to-br from-sky-600 to-sky-700 rounded-2xl p-6 text-white hover:from-sky-700 hover:to-sky-800 transition-all shadow-lg shadow-sky-600/25"
          >
            <FilePlus className="w-8 h-8 mb-4" />
            <h3 className="text-lg font-semibold mb-2">New Purchase Request</h3>
            <p className="text-sky-100 text-sm">
              Submit a new P-Card purchase for approval
            </p>
          </Link>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">
                  Pre-Charge Reminders
                </h3>
                <ul className="text-xs text-slate-500 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="w-1 h-1 bg-slate-400 rounded-full mt-1.5 flex-shrink-0" />
                    Purchases over $500 require approval before charging
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1 h-1 bg-slate-400 rounded-full mt-1.5 flex-shrink-0" />
                    No split transactions to stay under limits
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1 h-1 bg-slate-400 rounded-full mt-1.5 flex-shrink-0" />
                    Tech hardware, travel, and gift cards are prohibited
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1 h-1 bg-slate-400 rounded-full mt-1.5 flex-shrink-0" />
                    Check with IT for software enterprise licenses
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  color: 'amber' | 'emerald' | 'red' | 'slate';
  description: string;
}

function StatCard({ title, value, icon: Icon, color, description }: StatCardProps) {
  const colors = {
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500">{title}</p>
    </div>
  );
}
