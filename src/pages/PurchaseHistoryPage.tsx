import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Package,
  Download,
  CheckCircle,
  Clock,
  XCircle,
  Upload,
  FileText,
  Eye,
  DollarSign,
  Receipt,
  Filter,
  ArrowUpDown,
  Search,
  Image,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { exportRequestToPDF } from '../utils/pdfExport';
import ReceiptUploadModal from '../components/ReceiptUploadModal';

interface PurchaseReceipt {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  uploaded_at: string;
  verified: boolean;
  status: string;
}

interface PurchaseRequest {
  id: string;
  vendor_name: string;
  business_purpose: string;
  detailed_description: string;
  total_amount: number;
  status: string;
  expense_date: string;
  created_at: string;
  category: string;
  cardholder_name: string;
  p_card_name: string;
  purchase_amount: number;
  tax_amount: number;
  shipping_amount: number;
  vendor_location: string;
  po_bypass_reason: string;
  po_bypass_explanation: string;
  employee_signature_url: string;
  employee_signed_at: string;
  approval_signatures?: Array<{
    action: string;
    signature_url: string;
    signed_at: string;
    approver_name: string;
    approver_title: string;
    comments: string;
  }>;
  purchase_receipts?: PurchaseReceipt[];
}

interface MonthlyStats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  receiptsUploaded: number;
  receiptsNeeded: number;
}

export default function PurchaseHistoryPage() {
  const { user, profile } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [purchases, setPurchases] = useState<PurchaseRequest[]>([]);
  const [allPurchases, setAllPurchases] = useState<PurchaseRequest[]>([]);
  const [stats, setStats] = useState<MonthlyStats>({
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    receiptsUploaded: 0,
    receiptsNeeded: 0,
  });
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PurchaseRequest | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingReceipt, setViewingReceipt] = useState<PurchaseReceipt | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchPurchases();
    }
  }, [user?.id, selectedDate]);

  async function fetchPurchases() {
    if (!user?.id) return;

    setLoading(true);
    try {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth();
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

      const { data, error } = await supabase
        .from('purchase_requests')
        .select(`
          *,
          approval_signatures(action, signature_url, signed_at, approver_name, approver_title, comments),
          purchase_receipts(id, file_name, file_url, file_type, uploaded_at, verified, status)
        `)
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const allData = data || [];
      setAllPurchases(allData);

      const purchaseData = allData.filter(p => {
        const createdDate = new Date(p.created_at);
        return createdDate >= startOfMonth && createdDate <= endOfMonth;
      });

      setPurchases(purchaseData);

      const approvedPurchases = purchaseData.filter(p => p.status === 'approved');
      const receiptsUploaded = approvedPurchases.filter(p => p.purchase_receipts && p.purchase_receipts.length > 0).length;

      setStats({
        total: purchaseData.reduce((sum, p) => sum + p.total_amount, 0),
        approved: purchaseData.filter(p => p.status === 'approved').length,
        pending: purchaseData.filter(p => p.status === 'pending').length,
        rejected: purchaseData.filter(p => p.status === 'rejected').length,
        receiptsUploaded,
        receiptsNeeded: approvedPurchases.length - receiptsUploaded,
      });
    } catch (error) {
      console.error('Error fetching purchases:', error);
    } finally {
      setLoading(false);
    }
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const handleDownloadApproval = async (request: PurchaseRequest) => {
    if (request.status !== 'approved') return;
    setDownloading(request.id);
    try {
      await exportRequestToPDF({
        request: request as any,
        signatures: request.approval_signatures || [],
        requesterName: profile?.full_name,
        requesterDepartment: profile?.department,
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setDownloading(null);
    }
  };

  const handleUploadReceipt = (request: PurchaseRequest) => {
    setSelectedRequest(request);
    setUploadModalOpen(true);
  };

  const handleViewReceipt = (receipt: PurchaseReceipt) => {
    setViewingReceipt(receipt);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      rejected: 'bg-red-50 text-red-700 border-red-200',
      draft: 'bg-slate-50 text-slate-600 border-slate-200',
    };
    return styles[status] || styles.draft;
  };

  const getReceiptStatus = (request: PurchaseRequest) => {
    if (request.status !== 'approved') return null;
    const receipts = request.purchase_receipts || [];
    const hasReceipt = receipts.length > 0;
    const latestReceipt = receipts[0];

    if (latestReceipt?.status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
          <CheckCircle className="w-3 h-3" />
          Complete
        </span>
      );
    }
    if (latestReceipt?.status === 'needs_info') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
          <Clock className="w-3 h-3" />
          Info Requested
        </span>
      );
    }
    if (hasReceipt) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-100 text-sky-700">
          <FileText className="w-3 h-3" />
          Under Review
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">
        <Upload className="w-3 h-3" />
        Receipt Required
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const filteredPurchases = purchases
    .filter(p => {
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchesSearch = !searchTerm ||
        p.vendor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.business_purpose.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

  const monthYear = selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isCurrentMonth = selectedDate.getMonth() === new Date().getMonth() &&
                         selectedDate.getFullYear() === new Date().getFullYear();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">Purchase History</h1>
        <p className="text-slate-500 mt-1">View and manage your purchase requests by month</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateMonth('prev')}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200">
            <Calendar className="w-5 h-5 text-teal-600" />
            <span className="font-semibold text-slate-800">{monthYear}</span>
          </div>
          <button
            onClick={() => navigateMonth('next')}
            disabled={isCurrentMonth}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-slate-600" />
            </div>
            <span className="text-xs text-slate-500 uppercase tracking-wider">Your Spending</span>
          </div>
          <p className="text-xl font-bold text-slate-800">{formatCurrency(stats.total)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-xs text-slate-500 uppercase tracking-wider">Approved</span>
          </div>
          <p className="text-xl font-bold text-slate-800">{stats.approved}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-xs text-slate-500 uppercase tracking-wider">Pending</span>
          </div>
          <p className="text-xl font-bold text-slate-800">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-orange-600" />
            </div>
            <span className="text-xs text-slate-500 uppercase tracking-wider">Receipts Needed</span>
          </div>
          <p className="text-xl font-bold text-slate-800">{stats.receiptsNeeded}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by vendor or purpose..."
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
              </div>
              <button
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <ArrowUpDown className="w-4 h-4 text-slate-500" />
                {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-teal-600" />
            <h2 className="text-sm font-semibold text-slate-900">
              {filteredPurchases.length} Purchase{filteredPurchases.length !== 1 ? 's' : ''} in {monthYear}
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading purchases...</p>
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 font-medium mb-1">No purchases found</p>
            <p className="text-sm text-slate-400">
              {purchases.length === 0
                ? 'Purchase requests will appear here once submitted'
                : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredPurchases.map(purchase => (
              <div key={purchase.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {getStatusIcon(purchase.status)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-medium text-slate-900">
                          {purchase.vendor_name}
                        </p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusBadge(purchase.status)}`}>
                          {purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1)}
                        </span>
                        {getReceiptStatus(purchase)}
                      </div>
                      <p className="text-xs text-slate-500 mb-2">
                        {purchase.business_purpose}
                      </p>
                      <div className="flex items-center gap-4 text-[10px] text-slate-400">
                        <span>{purchase.category || 'General'}</span>
                        <span>{formatDate(purchase.created_at)}</span>
                        {purchase.approval_signatures && purchase.approval_signatures.length > 0 && (
                          <span>Approved by: {purchase.approval_signatures[0].approver_name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-semibold text-slate-900 mb-2">
                      {formatCurrency(purchase.total_amount)}
                    </p>
                    <div className="flex items-center gap-2 justify-end flex-wrap">
                      <Link
                        to={`/request/${purchase.id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </Link>
                      {purchase.status === 'approved' && (
                        <>
                          <button
                            onClick={() => handleDownloadApproval(purchase)}
                            disabled={downloading === purchase.id}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors disabled:opacity-50"
                          >
                            <Download className="w-3 h-3" />
                            PDF
                          </button>
                          {purchase.purchase_receipts && purchase.purchase_receipts.length > 0 ? (
                            <button
                              onClick={() => handleViewReceipt(purchase.purchase_receipts![0])}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-sky-600 bg-sky-50 rounded hover:bg-sky-100 transition-colors"
                            >
                              <Image className="w-3 h-3" />
                              View Receipt
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUploadReceipt(purchase)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-white bg-teal-600 rounded hover:bg-teal-700 transition-colors"
                            >
                              <Upload className="w-3 h-3" />
                              Receipt
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {uploadModalOpen && selectedRequest && (
        <ReceiptUploadModal
          request={selectedRequest}
          onClose={() => {
            setUploadModalOpen(false);
            setSelectedRequest(null);
          }}
          onSuccess={() => {
            fetchPurchases();
            setUploadModalOpen(false);
            setSelectedRequest(null);
          }}
        />
      )}

      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setViewingReceipt(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Receipt</h2>
                <p className="text-sm text-slate-500">{viewingReceipt.file_name}</p>
              </div>
              <button
                onClick={() => setViewingReceipt(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {viewingReceipt.file_type.startsWith('image/') ? (
                <img
                  src={viewingReceipt.file_url}
                  alt="Receipt"
                  className="max-w-full h-auto rounded-lg mx-auto"
                />
              ) : viewingReceipt.file_type === 'application/pdf' ? (
                <div className="text-center py-8">
                  <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 mb-4">PDF Receipt</p>
                  <a
                    href={viewingReceipt.file_url}
                    download={viewingReceipt.file_name}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </a>
                </div>
              ) : (
                <p className="text-slate-500 text-center">Unable to preview this file type</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
