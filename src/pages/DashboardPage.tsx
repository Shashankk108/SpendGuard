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
  Upload,
  Receipt,
  Calendar,
  Eye,
  Filter,
  Search,
  Users,
  TrendingUp,
  ChevronDown,
  RefreshCw,
  Globe,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import PCardWidget from '../components/PCardWidget';
import ReceiptUploadModal from '../components/ReceiptUploadModal';
import type { PurchaseRequest } from '../types/database';

interface PurchaseWithReceipt extends PurchaseRequest {
  purchase_receipts?: Array<{ id: string; status: string }>;
  requester?: { full_name: string; department: string };
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [recentRequests, setRecentRequests] = useState<PurchaseWithReceipt[]>([]);
  const [monthlyPurchases, setMonthlyPurchases] = useState<PurchaseWithReceipt[]>([]);
  const [allRequests, setAllRequests] = useState<PurchaseWithReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    receiptsNeeded: 0,
  });
  const [teamStats, setTeamStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
    totalAmount: 0,
  });
  const [godaddyStats, setGodaddyStats] = useState({
    unmatched: 0,
    pendingReceipts: 0,
  });
  const [receiptsNeeded, setReceiptsNeeded] = useState<PurchaseWithReceipt[]>([]);
  const [reuploadRequests, setReuploadRequests] = useState<{id: string; vendor_name: string; total_amount: number; reason: string | null}[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PurchaseWithReceipt | null>(null);
  const [isApprover, setIsApprover] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');

  useEffect(() => {
    if (user?.id) {
      checkApproverStatus();
      fetchData();
      fetchReuploadRequests();
    }
  }, [user?.id]);

  useEffect(() => {
    if (isApprover) {
      fetchGodaddyStats();
    }
  }, [isApprover]);

  async function fetchGodaddyStats() {
    const [unmatchedResult, pendingResult] = await Promise.all([
      supabase
        .from('godaddy_orders')
        .select('id', { count: 'exact', head: true })
        .eq('sync_status', 'unmatched'),
      supabase
        .from('purchase_requests')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_type', 'godaddy')
        .eq('external_receipt_status', 'pending'),
    ]);

    setGodaddyStats({
      unmatched: unmatchedResult.count || 0,
      pendingReceipts: pendingResult.count || 0,
    });
  }

  async function fetchReuploadRequests() {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('purchase_receipts')
      .select(`
        id,
        reupload_reason,
        purchase_request:request_id(
          id,
          vendor_name,
          total_amount
        )
      `)
      .eq('user_id', user.id)
      .eq('is_current', true)
      .eq('reupload_requested', true);

    if (!error && data) {
      const formatted = data.map((r: any) => ({
        id: r.id,
        vendor_name: r.purchase_request?.vendor_name || 'Unknown',
        total_amount: r.purchase_request?.total_amount || 0,
        reason: r.reupload_reason,
      }));
      setReuploadRequests(formatted);
    }
  }

  async function checkApproverStatus() {
    if (!profile?.email) return;

    const { data } = await supabase
      .from('approvers')
      .select('id')
      .eq('email', profile.email)
      .eq('is_active', true)
      .maybeSingle();

    setIsApprover(!!data || profile?.role === 'approver' || profile?.role === 'admin');
  }

  async function fetchData() {
    if (!user?.id) return;
    setLoading(true);

    try {
      const { data: myRequests, error: myError } = await supabase
        .from('purchase_requests')
        .select('*, purchase_receipts(id, status)')
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false });

      if (myError) throw myError;

      const requests = myRequests || [];

      setRecentRequests(requests.slice(0, 5));

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const monthly = requests.filter(r => {
        const expenseDate = new Date(r.expense_date);
        return expenseDate >= startOfMonth && expenseDate <= endOfMonth;
      });
      setMonthlyPurchases(monthly);

      const approvedRequests = requests.filter(r => r.status === 'approved');
      const needsReceipt = approvedRequests.filter(r => !r.purchase_receipts || r.purchase_receipts.length === 0);
      setReceiptsNeeded(needsReceipt);

      setStats({
        pending: requests.filter(r => r.status === 'pending').length,
        approved: approvedRequests.length,
        rejected: requests.filter(r => r.status === 'rejected').length,
        receiptsNeeded: needsReceipt.length,
      });

      const isApproverOrLeader = profile?.role === 'approver' || profile?.role === 'admin';
      if (isApproverOrLeader) {
        const { data: allReqs, error: allError } = await supabase
          .from('purchase_requests')
          .select('*, purchase_receipts(id, status), requester:requester_id(full_name, department)')
          .order('created_at', { ascending: false });

        if (!allError && allReqs) {
          setAllRequests(allReqs);
          setTeamStats({
            pending: allReqs.filter(r => r.status === 'pending').length,
            approved: allReqs.filter(r => r.status === 'approved').length,
            rejected: allReqs.filter(r => r.status === 'rejected').length,
            total: allReqs.length,
            totalAmount: allReqs.reduce((sum, r) => sum + r.total_amount, 0),
          });
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleUploadReceipt = (request: PurchaseWithReceipt) => {
    setSelectedRequest(request);
    setUploadModalOpen(true);
  };

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const filteredAllRequests = allRequests
    .filter(r => {
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesSearch = !searchTerm ||
        r.vendor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.business_purpose.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.requester?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'amount') {
        return b.total_amount - a.total_amount;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthlyTotal = monthlyPurchases.reduce((sum, p) => sum + p.total_amount, 0);

  if (isApprover) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">
            Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-slate-500 mt-1">Leadership overview of all purchase requests</p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 sm:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                <Users className="w-3 h-3 sm:w-4 sm:h-4 text-slate-600" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-500 hidden sm:inline">Total</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-slate-800">{teamStats.total}</p>
            <p className="text-[10px] text-slate-500 sm:hidden">Total</p>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-2.5 sm:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-amber-600" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-500 hidden sm:inline">Pending</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-amber-600">{teamStats.pending}</p>
            <p className="text-[10px] text-slate-500 sm:hidden">Pending</p>
          </div>
          <div className="bg-white rounded-xl border border-emerald-200 p-2.5 sm:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-500 hidden sm:inline">Approved</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-emerald-600">{teamStats.approved}</p>
            <p className="text-[10px] text-slate-500 sm:hidden">Approved</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-2.5 sm:p-4 hidden sm:block">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-50 rounded-lg flex items-center justify-center">
                <XCircle className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-500 hidden sm:inline">Rejected</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-red-600">{teamStats.rejected}</p>
          </div>
          <div className="bg-white rounded-xl border border-teal-200 p-2.5 sm:p-4 hidden sm:block">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-teal-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-teal-600" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-500 hidden sm:inline">Spending</span>
            </div>
            <p className="text-base sm:text-xl font-bold text-teal-600">${teamStats.totalAmount.toLocaleString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="p-4 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by vendor, purpose, or employee..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none"
                      >
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    <div className="relative">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')}
                        className="pl-3 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none"
                      >
                        <option value="date">Sort: Date</option>
                        <option value="amount">Sort: Amount</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                <p className="text-xs text-slate-500">{filteredAllRequests.length} requests</p>
              </div>

              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-slate-500">
                    <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading...
                  </div>
                ) : filteredAllRequests.length === 0 ? (
                  <div className="p-8 text-center">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No requests match your filters</p>
                  </div>
                ) : (
                  filteredAllRequests.map((request) => (
                    <Link
                      key={request.id}
                      to={`/request/${request.id}`}
                      className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <DollarSign className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-slate-800 truncate">{request.vendor_name}</p>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadge(request.status)}`}
                            >
                              {getStatusIcon(request.status)}
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </span>
                            {request.status === 'approved' && (
                              request.purchase_receipts && request.purchase_receipts.length > 0 ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  request.purchase_receipts.some(r => r.status === 'approved')
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : request.purchase_receipts.some(r => r.status === 'pending')
                                    ? 'bg-sky-100 text-sky-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  <Receipt className="w-3 h-3" />
                                  {request.purchase_receipts.some(r => r.status === 'approved')
                                    ? 'Receipt Verified'
                                    : request.purchase_receipts.some(r => r.status === 'pending')
                                    ? 'Receipt Pending Review'
                                    : 'Receipt Uploaded'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                                  <Receipt className="w-3 h-3" />
                                  No Receipt
                                </span>
                              )
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{request.business_purpose}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-teal-600 font-medium bg-teal-50 px-1.5 py-0.5 rounded">
                              {request.requester?.full_name || 'Unknown'}
                            </span>
                            <span className="text-[10px] text-slate-400">{request.requester?.department}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-sm font-semibold text-slate-800">
                          ${request.total_amount.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-400">{formatDate(request.expense_date)}</p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <PCardWidget />

            <Link
              to="/new-request"
              className="block bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-5 text-white hover:from-teal-700 hover:to-teal-800 transition-all shadow-lg shadow-teal-600/20"
            >
              <FilePlus className="w-7 h-7 mb-3" />
              <h3 className="text-base font-semibold mb-1">New Purchase Request</h3>
              <p className="text-teal-100 text-sm">
                Submit a new P-Card purchase for approval
              </p>
            </Link>

            {receiptsNeeded.length > 0 && (
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Receipt className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-orange-800 mb-1">
                      {receiptsNeeded.length} Receipt{receiptsNeeded.length !== 1 ? 's' : ''} Needed
                    </h3>
                    <p className="text-xs text-orange-700 mb-2">
                      Your approved purchases need receipts
                    </p>
                    <Link
                      to="/purchase-history"
                      className="text-xs font-medium text-orange-700 hover:text-orange-800"
                    >
                      View all
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {(godaddyStats.unmatched > 0 || godaddyStats.pendingReceipts > 0) && (
              <Link
                to="/leadership?tab=godaddy"
                className="block bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-xl p-4 hover:border-teal-300 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Globe className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-teal-800 mb-1">
                      GoDaddy Orders
                    </h3>
                    <div className="text-xs text-teal-700 space-y-1">
                      {godaddyStats.unmatched > 0 && (
                        <p>{godaddyStats.unmatched} unmatched order{godaddyStats.unmatched !== 1 ? 's' : ''}</p>
                      )}
                      {godaddyStats.pendingReceipts > 0 && (
                        <p>{godaddyStats.pendingReceipts} receipt{godaddyStats.pendingReceipts !== 1 ? 's' : ''} pending import</p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">
                    Pre-Charge Reminders
                  </h3>
                  <ul className="text-xs text-slate-500 space-y-1.5">
                    <li className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-slate-400 rounded-full mt-1.5 flex-shrink-0" />
                      Purchases over $500 require pre-approval
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-slate-400 rounded-full mt-1.5 flex-shrink-0" />
                      No split transactions
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-orange-400 rounded-full mt-1.5 flex-shrink-0" />
                      <span className="text-orange-700 font-medium">Upload receipts after every purchase</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {uploadModalOpen && selectedRequest && (
          <ReceiptUploadModal
            request={selectedRequest}
            onClose={() => {
              setUploadModalOpen(false);
              setSelectedRequest(null);
            }}
            onSuccess={() => {
              fetchData();
              setUploadModalOpen(false);
              setSelectedRequest(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">
          Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-slate-500 mt-1">Here's an overview of your purchase requests</p>
      </div>

      {reuploadRequests.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300 rounded-xl p-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0 animate-pulse">
              <RefreshCw className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-red-800 mb-1">
                Action Required: {reuploadRequests.length} Receipt{reuploadRequests.length !== 1 ? 's' : ''} Need Re-upload
              </h3>
              <p className="text-xs text-red-700 mb-3">
                Your approver has requested clearer images for the following receipts.
              </p>
              <div className="space-y-2">
                {reuploadRequests.slice(0, 2).map(req => (
                  <div key={req.id} className="flex items-center justify-between bg-white/70 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{req.vendor_name}</p>
                      <p className="text-xs text-slate-500">${req.total_amount.toLocaleString()}</p>
                      {req.reason && (
                        <p className="text-xs text-red-600 mt-0.5 italic">"{req.reason}"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Link
                to="/my-receipts"
                className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-red-700 hover:text-red-800"
              >
                Go to My Receipts to re-upload
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {receiptsNeeded.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Receipt className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-orange-800 mb-1">
                {receiptsNeeded.length} Receipt{receiptsNeeded.length !== 1 ? 's' : ''} Required
              </h3>
              <p className="text-xs text-orange-700 mb-3">
                Upload receipts for your approved purchases to complete the process.
              </p>
              <div className="space-y-2">
                {receiptsNeeded.slice(0, 3).map(request => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between bg-white/70 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <DollarSign className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{request.vendor_name}</p>
                        <p className="text-xs text-slate-500">${request.total_amount.toLocaleString()}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUploadReceipt(request)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors flex-shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload
                    </button>
                  </div>
                ))}
                {receiptsNeeded.length > 3 && (
                  <Link
                    to="/purchase-history"
                    className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-800"
                  >
                    View all {receiptsNeeded.length} pending receipts
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={Clock}
          color="amber"
        />
        <StatCard
          title="Approved"
          value={stats.approved}
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          title="Rejected"
          value={stats.rejected}
          icon={XCircle}
          color="red"
        />
        <StatCard
          title="Receipts"
          value={stats.receiptsNeeded}
          icon={Receipt}
          color="orange"
          highlight={stats.receiptsNeeded > 0}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-teal-600" />
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{currentMonth}</h2>
                  <p className="text-xs text-slate-500">
                    {monthlyPurchases.length} purchase{monthlyPurchases.length !== 1 ? 's' : ''} - ${monthlyTotal.toLocaleString()} total
                  </p>
                </div>
              </div>
              <Link
                to="/purchase-history"
                className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
              >
                View History
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="p-8 text-center text-slate-500">
                  <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading...
                </div>
              ) : monthlyPurchases.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 mb-2">No purchases this month</p>
                  <Link
                    to="/new-request"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
                  >
                    <FilePlus className="w-4 h-4" />
                    Create Request
                  </Link>
                </div>
              ) : (
                monthlyPurchases.slice(0, 6).map((request) => {
                  const needsReceipt = request.status === 'approved' && (!request.purchase_receipts || request.purchase_receipts.length === 0);
                  const hasReceipt = request.purchase_receipts && request.purchase_receipts.length > 0;
                  return (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <DollarSign className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-800 truncate">{request.vendor_name}</p>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadge(request.status)}`}
                            >
                              {getStatusIcon(request.status)}
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </span>
                            {needsReceipt && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">
                                <Upload className="w-3 h-3" />
                                Receipt
                              </span>
                            )}
                            {hasReceipt && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-100 text-sky-700">
                                <CheckCircle2 className="w-3 h-3" />
                                Uploaded
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{request.business_purpose}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-800">
                            ${request.total_amount.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-slate-400">{formatDate(request.expense_date)}</p>
                        </div>
                        {needsReceipt ? (
                          <button
                            onClick={() => handleUploadReceipt(request)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors"
                          >
                            <Upload className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <Link
                            to={`/request/${request.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {monthlyPurchases.length > 6 && (
                <div className="p-3 text-center">
                  <Link
                    to="/purchase-history"
                    className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                  >
                    View all {monthlyPurchases.length} purchases
                  </Link>
                </div>
              )}
            </div>
          </div>

          {recentRequests.length > 0 && recentRequests.some(r => !monthlyPurchases.find(m => m.id === r.id)) && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">Recent Activity</h2>
                <Link
                  to="/my-requests"
                  className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
                >
                  View all
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="divide-y divide-slate-100">
                {recentRequests
                  .filter(r => !monthlyPurchases.find(m => m.id === r.id))
                  .slice(0, 3)
                  .map((request) => (
                    <Link
                      key={request.id}
                      to={`/request/${request.id}`}
                      className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                          <DollarSign className="w-4 h-4 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{request.vendor_name}</p>
                          <p className="text-xs text-slate-500">{formatDate(request.expense_date)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-800">
                          ${request.total_amount.toLocaleString()}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadge(request.status)}`}
                        >
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </span>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <PCardWidget />

          <Link
            to="/new-request"
            className="block bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-5 text-white hover:from-teal-700 hover:to-teal-800 transition-all shadow-lg shadow-teal-600/20"
          >
            <FilePlus className="w-7 h-7 mb-3" />
            <h3 className="text-base font-semibold mb-1">New Purchase Request</h3>
            <p className="text-teal-100 text-sm">
              Submit a new P-Card purchase for approval
            </p>
          </Link>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">
                  Pre-Charge Reminders
                </h3>
                <ul className="text-xs text-slate-500 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="w-1 h-1 bg-slate-400 rounded-full mt-1.5 flex-shrink-0" />
                    Purchases over $500 require pre-approval
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1 h-1 bg-slate-400 rounded-full mt-1.5 flex-shrink-0" />
                    No split transactions
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1 h-1 bg-orange-400 rounded-full mt-1.5 flex-shrink-0" />
                    <span className="text-orange-700 font-medium">Upload receipts after every purchase</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {uploadModalOpen && selectedRequest && (
        <ReceiptUploadModal
          request={selectedRequest}
          onClose={() => {
            setUploadModalOpen(false);
            setSelectedRequest(null);
          }}
          onSuccess={() => {
            fetchData();
            setUploadModalOpen(false);
            setSelectedRequest(null);
          }}
        />
      )}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  color: 'amber' | 'emerald' | 'red' | 'slate' | 'orange';
  highlight?: boolean;
}

function StatCard({ title, value, icon: Icon, color, highlight }: StatCardProps) {
  const colors = {
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-3 sm:p-5 ${highlight ? 'border-orange-300 ring-1 ring-orange-200' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        {highlight && (
          <span className="hidden sm:inline px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-semibold rounded-full">
            Action
          </span>
        )}
      </div>
      <p className="text-xl sm:text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs sm:text-sm text-slate-500">{title}</p>
    </div>
  );
}
