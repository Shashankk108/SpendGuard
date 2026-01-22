import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  ChevronRight,
  DollarSign,
  AlertTriangle,
  CheckSquare,
  User,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { PurchaseRequest } from '../types/database';
import { getApprovalTier } from '../utils/validation';

export default function ApprovalsPage() {
  const { profile } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isApprover, setIsApprover] = useState(false);

  useEffect(() => {
    checkApproverStatusAndFetch();
  }, [profile]);

  async function checkApproverStatusAndFetch() {
    if (!profile?.email) return;

    const { data: approverData } = await supabase
      .from('approvers')
      .select('*')
      .eq('email', profile.email)
      .eq('is_active', true)
      .maybeSingle();

    setIsApprover(!!approverData);

    if (approverData) {
      const { data: requests, error } = await supabase
        .from('purchase_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching pending requests:', error);
      } else {
        setPendingRequests(requests || []);
      }
    }

    setLoading(false);
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getUrgencyBadge = (amount: number) => {
    if (amount > 100000) return 'bg-red-100 text-red-700';
    if (amount > 5000) return 'bg-amber-100 text-amber-700';
    return 'bg-sky-100 text-sky-700';
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-8 text-center text-slate-500">Loading...</div>
    );
  }

  if (!isApprover) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Access Restricted</h2>
          <p className="text-slate-500 mb-6">
            You don't have approver permissions. This page is only accessible to designated approvers.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Pending Approvals</h1>
        <p className="text-slate-500 mt-1">Review and approve purchase requests</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">{pendingRequests.length}</p>
          <p className="text-sm text-slate-500">Pending Requests</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-sky-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-sky-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            $
            {pendingRequests
              .reduce((sum, r) => sum + r.total_amount, 0)
              .toLocaleString()}
          </p>
          <p className="text-sm text-slate-500">Total Value Pending</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {pendingRequests.filter((r) => r.total_amount > 5000).length}
          </p>
          <p className="text-sm text-slate-500">High-Value Requests (&gt;$5K)</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Requests Awaiting Your Approval</h2>
        </div>

        <div className="divide-y divide-slate-100">
          {pendingRequests.length === 0 ? (
            <div className="p-8 text-center">
              <CheckSquare className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
              <p className="text-slate-500">All caught up! No pending approvals.</p>
            </div>
          ) : (
            pendingRequests.map((request) => (
              <Link
                key={request.id}
                to={`/request/${request.id}`}
                className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Clock className="w-6 h-6 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {request.vendor_name}
                      </p>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadge(
                          request.total_amount
                        )}`}
                      >
                        {getApprovalTier(request.total_amount)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{request.business_purpose}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <p className="text-xs text-slate-400">
                        {request.cardholder_name} &middot; {formatDate(request.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <div className="text-right">
                    <span className="text-lg font-semibold text-slate-800">
                      ${request.total_amount.toLocaleString()}
                    </span>
                    <p className="text-xs text-slate-500">{request.category}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
