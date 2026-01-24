import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Download, CheckCircle, Clock, XCircle, Upload, FileText, ChevronDown, ChevronUp, History, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { exportRequestToPDF } from '../utils/pdfExport';
import ReceiptUploadModal from './ReceiptUploadModal';

interface PurchaseReceipt {
  id: string;
  file_name: string;
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
  receipt_status: string;
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
  approver?: {
    full_name: string;
  };
  approval_signatures?: Array<{
    action: string;
    signature_data: string;
    signature_url: string;
    signed_at: string;
    approver_name: string;
    approver_title: string;
    comments: string;
  }>;
  purchase_receipts?: PurchaseReceipt[];
}

export default function MonthlyPurchases() {
  const { user, profile } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PurchaseRequest | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchPurchases();
    }
  }, [user?.id]);

  async function fetchPurchases() {
    if (!user?.id) return;

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('purchase_requests')
        .select(`
          *,
          approver:approver_id(full_name),
          approval_signatures(action, signature_data, signature_url, signed_at, approver_name, approver_title, comments),
          purchase_receipts(id, file_name, uploaded_at, verified, status)
        `)
        .eq('requester_id', user.id)
        .gte('expense_date', startOfMonth)
        .lte('expense_date', endOfMonth)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPurchases(data || []);
    } catch (error) {
      console.error('Error fetching purchases:', error);
    } finally {
      setLoading(false);
    }
  }

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
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-100 rounded w-1/3" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-slate-50 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
                <Package className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">My Purchases - {currentMonth}</h3>
                <p className="text-xs text-slate-500">{purchases.length} requests this month</p>
              </div>
            </div>
            <Link
              to="/purchase-history"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              View History
            </Link>
          </div>
        </div>

        {purchases.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 mb-1">No purchase requests this month</p>
            <p className="text-xs text-slate-400">Your approved purchases will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {purchases.map(purchase => (
              <div key={purchase.id} className="group">
                <div
                  className="px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(expandedId === purchase.id ? null : purchase.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {getStatusIcon(purchase.status)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {purchase.vendor_name}
                          </p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusBadge(purchase.status)}`}>
                            {purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1)}
                          </span>
                          {getReceiptStatus(purchase)}
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {purchase.business_purpose}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">
                          {formatCurrency(purchase.total_amount)}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {formatDate(purchase.expense_date)}
                        </p>
                      </div>
                      {expandedId === purchase.id ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {expandedId === purchase.id && (
                  <div className="px-5 py-4 bg-slate-50 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Category</p>
                        <p className="text-sm text-slate-700">{purchase.category || 'General'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Expense Date</p>
                        <p className="text-sm text-slate-700">{formatDate(purchase.expense_date)}</p>
                      </div>
                      {purchase.approver && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Approver</p>
                          <p className="text-sm text-slate-700">{purchase.approver.full_name}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Submitted</p>
                        <p className="text-sm text-slate-700">{formatDate(purchase.created_at)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/request/${purchase.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Details
                      </Link>
                      {purchase.status === 'approved' && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadApproval(purchase);
                            }}
                            disabled={downloading === purchase.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {downloading === purchase.id ? 'Generating...' : 'Approval Form'}
                          </button>
                          {(!purchase.purchase_receipts || purchase.purchase_receipts.length === 0) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUploadReceipt(purchase);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Upload Receipt
                            </button>
                          )}
                          {purchase.purchase_receipts && purchase.purchase_receipts.length > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Receipt Uploaded
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
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
    </>
  );
}
