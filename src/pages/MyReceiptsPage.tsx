import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Receipt,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Eye,
  FileText,
  Camera,
  ArrowRight,
  XCircle,
  Sparkles,
  ChevronDown,
  Filter,
  Image,
  Info,
  Globe,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import FileViewer from '../components/FileViewer';

interface ReceiptWithRequest {
  id: string;
  request_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  status: string;
  notes: string | null;
  employee_comment: string | null;
  created_at: string;
  version: number;
  is_current: boolean;
  reupload_requested: boolean;
  reupload_requested_at: string | null;
  reupload_reason: string | null;
  ai_verification_status: string | null;
  ai_confidence_score: number | null;
  purchase_request: {
    id: string;
    vendor_name: string;
    total_amount: number;
    expense_date: string;
    business_purpose: string;
    status: string;
  };
}

interface PendingUpload {
  id: string;
  vendor_name: string;
  total_amount: number;
  expense_date: string;
  business_purpose: string;
  status: string;
}

interface GoDaddyReceiptRequest {
  id: string;
  order_id: string;
  domain_or_product: string;
  order_total: number;
  currency: string;
  order_date: string;
  receipt_requested_at: string;
  matched_request_id: string;
}

export default function MyReceiptsPage() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<ReceiptWithRequest[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [godaddyRequests, setGodaddyRequests] = useState<GoDaddyReceiptRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptWithRequest | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PendingUpload | null>(null);
  const [reuploadReceipt, setReuploadReceipt] = useState<ReceiptWithRequest | null>(null);
  const [selectedGodaddyOrder, setSelectedGodaddyOrder] = useState<GoDaddyReceiptRequest | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reupload' | 'verified' | 'issues'>('all');

  useEffect(() => {
    if (user?.id) {
      fetchReceipts();
    }
  }, [user?.id]);

  async function fetchReceipts() {
    if (!user?.id) return;
    setLoading(true);

    try {
      const { data: myReceipts, error: receiptsError } = await supabase
        .from('purchase_receipts')
        .select(`
          *,
          purchase_request:request_id(
            id,
            vendor_name,
            total_amount,
            expense_date,
            business_purpose,
            status
          )
        `)
        .eq('user_id', user.id)
        .eq('is_current', true)
        .order('created_at', { ascending: false });

      if (receiptsError) {
        console.error('Error fetching receipts:', receiptsError);
        throw receiptsError;
      }
      setReceipts(myReceipts || []);

      const { data: approvedRequests, error: requestsError } = await supabase
        .from('purchase_requests')
        .select('id, vendor_name, total_amount, expense_date, business_purpose, status')
        .eq('requester_id', user.id)
        .eq('status', 'approved');

      if (requestsError) throw requestsError;

      const receiptRequestIds = new Set((myReceipts || []).map(r => r.request_id));
      const pending = (approvedRequests || []).filter(r => !receiptRequestIds.has(r.id));
      setPendingUploads(pending);

      const approvedRequestIds = (approvedRequests || []).map(r => r.id);
      if (approvedRequestIds.length > 0) {
        const { data: godaddyData } = await supabase
          .from('godaddy_orders')
          .select('id, order_id, domain_or_product, order_total, currency, order_date, receipt_requested_at, matched_request_id')
          .in('matched_request_id', approvedRequestIds)
          .eq('receipt_requested', true)
          .eq('receipt_uploaded', false)
          .order('receipt_requested_at', { ascending: false });

        setGodaddyRequests(godaddyData || []);
      }
    } catch (err) {
      console.error('Error fetching receipts:', err);
    } finally {
      setLoading(false);
    }
  }

  const reuploadRequested = receipts.filter(r => r.reupload_requested);
  const pendingReview = receipts.filter(r => r.status === 'pending' && !r.reupload_requested);
  const verified = receipts.filter(r => r.status === 'approved' || r.ai_verification_status === 'verified');
  const issues = receipts.filter(r => r.status === 'rejected' || r.ai_verification_status === 'mismatch');

  const filteredReceipts = filter === 'all' ? receipts
    : filter === 'reupload' ? reuploadRequested
    : filter === 'pending' ? pendingReview
    : filter === 'verified' ? verified
    : issues;

  const getStatusInfo = (receipt: ReceiptWithRequest) => {
    if (receipt.reupload_requested) {
      return {
        label: 'Re-upload Needed',
        color: 'bg-orange-100 text-orange-700 border-orange-200',
        icon: RefreshCw,
        bgColor: 'from-orange-50 to-amber-50',
        borderColor: 'border-orange-300',
      };
    }
    if (receipt.status === 'rejected') {
      return {
        label: 'Rejected',
        color: 'bg-red-100 text-red-700 border-red-200',
        icon: XCircle,
        bgColor: 'from-red-50 to-rose-50',
        borderColor: 'border-red-200',
      };
    }
    if (receipt.ai_verification_status === 'mismatch') {
      return {
        label: 'Needs Review',
        color: 'bg-amber-100 text-amber-700 border-amber-200',
        icon: AlertTriangle,
        bgColor: 'from-amber-50 to-yellow-50',
        borderColor: 'border-amber-200',
      };
    }
    if (receipt.status === 'approved' || receipt.ai_verification_status === 'verified') {
      return {
        label: 'Verified',
        color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        icon: CheckCircle2,
        bgColor: 'from-emerald-50 to-green-50',
        borderColor: 'border-emerald-200',
      };
    }
    return {
      label: 'Pending Review',
      color: 'bg-sky-100 text-sky-700 border-sky-200',
      icon: Clock,
      bgColor: 'from-sky-50 to-blue-50',
      borderColor: 'border-sky-200',
    };
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">My Receipts</h1>
        <p className="text-slate-500 mt-1">Track and manage your purchase receipts</p>
      </div>

      {reuploadRequested.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-300 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-orange-800 mb-1">
                {reuploadRequested.length} Receipt{reuploadRequested.length !== 1 ? 's' : ''} Need Re-upload
              </h3>
              <p className="text-sm text-orange-700 mb-4">
                Your approver has requested clearer images for the following receipts.
              </p>
              <div className="space-y-3">
                {reuploadRequested.map(receipt => (
                  <div
                    key={receipt.id}
                    className="bg-white rounded-lg p-4 border border-orange-200 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800">
                          {receipt.purchase_request.vendor_name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {formatCurrency(receipt.purchase_request.total_amount)}
                        </p>
                        {receipt.reupload_reason && (
                          <div className="mt-2 p-2 bg-orange-50 rounded-lg">
                            <p className="text-xs font-medium text-orange-800 mb-0.5">Reason:</p>
                            <p className="text-sm text-orange-700">{receipt.reupload_reason}</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setReuploadReceipt(receipt)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors flex-shrink-0"
                      >
                        <Upload className="w-4 h-4" />
                        Re-upload
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {godaddyRequests.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-teal-50 to-cyan-50 border-2 border-teal-300 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Globe className="w-6 h-6 text-teal-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-teal-800 mb-1">
                {godaddyRequests.length} GoDaddy Receipt{godaddyRequests.length !== 1 ? 's' : ''} Requested
              </h3>
              <p className="text-sm text-teal-700 mb-4">
                Leadership has requested receipts for your GoDaddy orders. Please download from your GoDaddy account and upload here.
              </p>
              <div className="space-y-3">
                {godaddyRequests.map(order => (
                  <div
                    key={order.id}
                    className="bg-white rounded-lg p-4 border border-teal-200 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-teal-500 flex-shrink-0" />
                          <p className="font-medium text-slate-800">
                            Order #{order.order_id}
                          </p>
                        </div>
                        <p className="text-sm text-slate-600 mt-1 truncate">
                          {order.domain_or_product}
                        </p>
                        <p className="text-sm font-semibold text-teal-700 mt-1">
                          ${order.order_total.toFixed(2)} {order.currency}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedGodaddyOrder(order)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors flex-shrink-0"
                      >
                        <Upload className="w-4 h-4" />
                        Upload Receipt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingUploads.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Receipt className="w-6 h-6 text-sky-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-sky-800 mb-1">
                {pendingUploads.length} Receipt{pendingUploads.length !== 1 ? 's' : ''} Needed
              </h3>
              <p className="text-sm text-sky-700 mb-4">
                Upload receipts for your approved purchases.
              </p>
              <div className="space-y-2">
                {pendingUploads.slice(0, 3).map(request => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between bg-white rounded-lg p-3 border border-teal-100"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-4 h-4 text-teal-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{request.vendor_name}</p>
                        <p className="text-xs text-slate-500">{formatCurrency(request.total_amount)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedRequest(request);
                        setUploadModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors flex-shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload
                    </button>
                  </div>
                ))}
                {pendingUploads.length > 3 && (
                  <button
                    onClick={() => setFilter('all')}
                    className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
                  >
                    View all {pendingUploads.length} pending
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Camera className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-sky-800 mb-1">Receipt Upload Guidelines</h3>
            <ul className="text-sm text-sky-700 space-y-1">
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-sky-500 mt-0.5 flex-shrink-0" />
                <span><strong>JPEG or PNG images preferred</strong> - AI analysis works best with image files</span>
              </li>
              <li className="flex items-start gap-2">
                <Image className="w-4 h-4 text-sky-500 mt-0.5 flex-shrink-0" />
                <span>Ensure the <strong>entire receipt is visible</strong> and text is readable</span>
              </li>
              <li className="flex items-start gap-2">
                <Info className="w-4 h-4 text-sky-500 mt-0.5 flex-shrink-0" />
                <span>Include vendor name, date, itemized list, and total amount</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-800">Receipt History</h2>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <div className="relative">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="pl-3 pr-8 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none"
              >
                <option value="all">All Receipts ({receipts.length})</option>
                <option value="reupload">Re-upload Needed ({reuploadRequested.length})</option>
                <option value="pending">Pending Review ({pendingReview.length})</option>
                <option value="verified">Verified ({verified.length})</option>
                <option value="issues">Issues ({issues.length})</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 text-center">
              <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-slate-500">Loading receipts...</p>
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="p-8 text-center">
              <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 font-medium mb-1">No receipts found</p>
              <p className="text-sm text-slate-500">
                {filter === 'all'
                  ? 'Upload receipts for your approved purchases'
                  : `No receipts match the "${filter}" filter`}
              </p>
            </div>
          ) : (
            filteredReceipts.map(receipt => {
              const status = getStatusInfo(receipt);
              const StatusIcon = status.icon;
              return (
                <div
                  key={receipt.id}
                  className={`p-4 hover:bg-slate-50 transition-colors ${
                    receipt.reupload_requested ? 'bg-orange-50/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-16 h-16 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 cursor-pointer border-2 ${status.borderColor}`}
                      onClick={() => setSelectedReceipt(receipt)}
                    >
                      {receipt.file_type?.startsWith('image/') ? (
                        <img
                          src={receipt.file_url}
                          alt="Receipt thumbnail"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileText className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-slate-800">
                              {receipt.purchase_request.vendor_name}
                            </p>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${status.color}`}>
                              <StatusIcon className="w-3 h-3" />
                              {status.label}
                            </span>
                            {receipt.version > 1 && (
                              <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                v{receipt.version}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {formatCurrency(receipt.purchase_request.total_amount)} - {formatDate(receipt.created_at)}
                          </p>
                          {receipt.reupload_reason && (
                            <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                              <p className="text-xs text-orange-700">
                                <span className="font-medium">Re-upload requested:</span> {receipt.reupload_reason}
                              </p>
                            </div>
                          )}
                          {receipt.ai_confidence_score !== null && (
                            <div className="mt-2 flex items-center gap-2">
                              <Sparkles className="w-3.5 h-3.5 text-teal-500" />
                              <span className="text-xs text-slate-500">
                                AI Confidence: {receipt.ai_confidence_score}%
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {receipt.reupload_requested ? (
                            <button
                              onClick={() => setReuploadReceipt(receipt)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Re-upload
                            </button>
                          ) : (
                            <button
                              onClick={() => setSelectedReceipt(receipt)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </button>
                          )}
                          <Link
                            to={`/request/${receipt.request_id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                          >
                            Details
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedReceipt(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">{selectedReceipt.purchase_request.vendor_name}</h3>
                <p className="text-sm text-slate-500">{formatCurrency(selectedReceipt.purchase_request.total_amount)}</p>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              <FileViewer fileUrl={selectedReceipt.file_url} fileType={selectedReceipt.file_type} />
            </div>
          </div>
        </div>
      )}

      {(uploadModalOpen && selectedRequest) && (
        <ReceiptUploadModalEnhanced
          request={selectedRequest}
          onClose={() => {
            setUploadModalOpen(false);
            setSelectedRequest(null);
          }}
          onSuccess={() => {
            fetchReceipts();
            setUploadModalOpen(false);
            setSelectedRequest(null);
          }}
        />
      )}

      {reuploadReceipt && (
        <ReceiptReuploadModal
          receipt={reuploadReceipt}
          onClose={() => setReuploadReceipt(null)}
          onSuccess={() => {
            fetchReceipts();
            setReuploadReceipt(null);
          }}
        />
      )}

      {selectedGodaddyOrder && (
        <GoDaddyReceiptUploadModal
          order={selectedGodaddyOrder}
          onClose={() => setSelectedGodaddyOrder(null)}
          onSuccess={() => {
            fetchReceipts();
            setSelectedGodaddyOrder(null);
          }}
        />
      )}
    </div>
  );
}

interface ReceiptUploadModalEnhancedProps {
  request: PendingUpload;
  onClose: () => void;
  onSuccess: () => void;
}

function ReceiptUploadModalEnhanced({ request, onClose, onSuccess }: ReceiptUploadModalEnhancedProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = (selectedFile: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 10 * 1024 * 1024;

    if (!validTypes.includes(selectedFile.type)) {
      setError('Please upload a JPEG, PNG, or WebP image. PDFs are not recommended for AI analysis.');
      return;
    }

    if (selectedFile.size > maxSize) {
      setError('File size must be less than 10MB');
      return;
    }

    setError(null);
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleSubmit = async () => {
    if (!file || !user) return;

    setUploading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;

        const { error: insertError } = await supabase
          .from('purchase_receipts')
          .insert({
            request_id: request.id,
            user_id: user.id,
            file_name: file.name,
            file_url: base64Data,
            file_type: file.type,
            file_size: file.size,
            notes: notes || null,
            employee_comment: notes || null,
            status: 'pending',
            version: 1,
            is_current: true,
          });

        if (insertError) throw insertError;

        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 1500);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Error uploading receipt:', err);
      setError(err.message || 'Failed to upload receipt');
      setUploading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Upload Receipt</h2>
            <p className="text-sm text-slate-500">
              {request.vendor_name} - {formatCurrency(request.total_amount)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Receipt Uploaded!</h3>
              <p className="text-sm text-slate-500">AI analysis will run automatically.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-sky-800">
                    <p className="font-medium mb-1">For best AI analysis results:</p>
                    <ul className="text-xs space-y-0.5 text-sky-700">
                      <li>- Upload <strong>JPEG or PNG</strong> images (not PDF)</li>
                      <li>- Ensure receipt is <strong>flat and well-lit</strong></li>
                      <li>- All text must be <strong>clearly readable</strong></li>
                    </ul>
                  </div>
                </div>
              </div>

              <div
                onDrop={(e) => { e.preventDefault(); setDragOver(false); e.dataTransfer.files[0] && handleFileSelect(e.dataTransfer.files[0]); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => document.getElementById('file-input')?.click()}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-teal-500 bg-teal-50' : file ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  id="file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />

                {preview ? (
                  <div className="space-y-3">
                    <img src={preview} alt="Receipt preview" className="max-h-48 mx-auto rounded-lg shadow-md" />
                    <p className="text-sm font-medium text-emerald-700">{file?.name}</p>
                    <p className="text-xs text-slate-500">Click to change file</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto">
                      <Camera className="w-8 h-8 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">Drop your receipt here or click to browse</p>
                      <p className="text-xs text-slate-500 mt-1">JPEG or PNG up to 10MB</p>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this receipt..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 resize-none"
                  rows={2}
                />
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!file || uploading}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Submit Receipt
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface ReceiptReuploadModalProps {
  receipt: ReceiptWithRequest;
  onClose: () => void;
  onSuccess: () => void;
}

function ReceiptReuploadModal({ receipt, onClose, onSuccess }: ReceiptReuploadModalProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileSelect = (selectedFile: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 10 * 1024 * 1024;

    if (!validTypes.includes(selectedFile.type)) {
      setError('Please upload a JPEG, PNG, or WebP image for best AI analysis results.');
      return;
    }

    if (selectedFile.size > maxSize) {
      setError('File size must be less than 10MB');
      return;
    }

    setError(null);
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleSubmit = async () => {
    if (!file || !user) return;

    setUploading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;

        await supabase
          .from('purchase_receipts')
          .update({ is_current: false })
          .eq('id', receipt.id);

        const { error: insertError } = await supabase
          .from('purchase_receipts')
          .insert({
            request_id: receipt.request_id,
            user_id: user.id,
            file_name: file.name,
            file_url: base64Data,
            file_type: file.type,
            file_size: file.size,
            notes: notes || null,
            employee_comment: notes || null,
            status: 'pending',
            version: (receipt.version || 1) + 1,
            is_current: true,
            previous_receipt_id: receipt.id,
            reupload_requested: false,
          });

        if (insertError) throw insertError;

        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 1500);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Error uploading receipt:', err);
      setError(err.message || 'Failed to upload receipt');
      setUploading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-orange-50 to-amber-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Re-upload Receipt</h2>
              <p className="text-sm text-slate-500">
                {receipt.purchase_request.vendor_name} - {formatCurrency(receipt.purchase_request.total_amount)}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">New Receipt Uploaded!</h3>
              <p className="text-sm text-slate-500">Your approver will be notified and AI analysis will run.</p>
            </div>
          ) : (
            <>
              {receipt.reupload_reason && (
                <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                  <p className="text-xs font-medium text-orange-800 uppercase tracking-wide mb-1">Reason for Re-upload</p>
                  <p className="text-sm text-orange-700">{receipt.reupload_reason}</p>
                </div>
              )}

              <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-sky-800">
                    <p className="font-medium mb-1">Tips for a clear receipt:</p>
                    <ul className="text-xs space-y-0.5 text-sky-700">
                      <li>- Take photo in <strong>good lighting</strong></li>
                      <li>- Keep camera <strong>steady and flat</strong> above receipt</li>
                      <li>- Make sure <strong>all edges are visible</strong></li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                <p className="text-xs font-medium text-slate-600 mb-2">Previous Upload (v{receipt.version})</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-200">
                    {receipt.file_type?.startsWith('image/') ? (
                      <img src={receipt.file_url} alt="Previous" className="w-full h-full object-cover opacity-50" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    <p>{receipt.file_name}</p>
                    <p className="text-slate-400">Will be replaced</p>
                  </div>
                </div>
              </div>

              <div
                onDrop={(e) => { e.preventDefault(); e.dataTransfer.files[0] && handleFileSelect(e.dataTransfer.files[0]); }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => document.getElementById('reupload-input')?.click()}
                className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  file ? 'border-emerald-300 bg-emerald-50' : 'border-orange-200 hover:border-orange-300 bg-orange-50/50'
                }`}
              >
                <input
                  id="reupload-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />

                {preview ? (
                  <div className="space-y-3">
                    <img src={preview} alt="New receipt" className="max-h-40 mx-auto rounded-lg shadow-md" />
                    <p className="text-sm font-medium text-emerald-700">{file?.name}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Camera className="w-10 h-10 text-orange-400 mx-auto" />
                    <p className="text-sm font-medium text-orange-700">Upload new receipt image</p>
                    <p className="text-xs text-orange-600">JPEG or PNG recommended</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Response to approver (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Explain what you changed or add clarification..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 resize-none"
                  rows={2}
                />
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!file || uploading}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Submit New Receipt
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface GoDaddyReceiptUploadModalProps {
  order: GoDaddyReceiptRequest;
  onClose: () => void;
  onSuccess: () => void;
}

function GoDaddyReceiptUploadModal({ order, onClose, onSuccess }: GoDaddyReceiptUploadModalProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = (selectedFile: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024;

    if (!validTypes.includes(selectedFile.type)) {
      setError('Please upload a JPEG, PNG, WebP image or PDF file.');
      return;
    }

    if (selectedFile.size > maxSize) {
      setError('File size must be less than 10MB');
      return;
    }

    setError(null);
    setFile(selectedFile);

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleSubmit = async () => {
    if (!file || !user) return;

    setUploading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;

        const { error: updateError } = await supabase
          .from('godaddy_orders')
          .update({
            receipt_uploaded: true,
            receipt_file_url: base64Data,
            receipt_file_name: file.name,
            receipt_uploaded_at: new Date().toISOString(),
            receipt_uploaded_by: user.id,
          })
          .eq('id', order.id);

        if (updateError) throw updateError;

        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 1500);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Error uploading GoDaddy receipt:', err);
      setError(err.message || 'Failed to upload receipt');
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-cyan-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Upload GoDaddy Receipt</h2>
              <p className="text-sm text-slate-500">Order #{order.order_id}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Receipt Uploaded!</h3>
              <p className="text-sm text-slate-500">Your receipt has been submitted successfully.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 p-4 bg-slate-50 rounded-xl">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Order Details</p>
                <p className="text-sm font-medium text-slate-800 mb-1">{order.domain_or_product}</p>
                <p className="text-lg font-bold text-teal-700">${order.order_total.toFixed(2)} {order.currency}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Order date: {new Date(order.order_date).toLocaleDateString()}
                </p>
              </div>

              <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-sky-800">
                    <p className="font-medium mb-1">How to get your GoDaddy receipt:</p>
                    <ol className="text-xs space-y-1 text-sky-700 list-decimal list-inside">
                      <li>Log in to your GoDaddy account</li>
                      <li>Go to Order History</li>
                      <li>Find order #{order.order_id}</li>
                      <li>Download or screenshot the receipt</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div
                onDrop={(e) => { e.preventDefault(); setDragOver(false); e.dataTransfer.files[0] && handleFileSelect(e.dataTransfer.files[0]); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => document.getElementById('godaddy-file-input')?.click()}
                className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-teal-500 bg-teal-50' : file ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  id="godaddy-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />

                {preview ? (
                  <div className="space-y-3">
                    <img src={preview} alt="Receipt preview" className="max-h-40 mx-auto rounded-lg shadow-md" />
                    <p className="text-sm font-medium text-emerald-700">{file?.name}</p>
                    <p className="text-xs text-slate-500">Click to change file</p>
                  </div>
                ) : file ? (
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center mx-auto">
                      <FileText className="w-6 h-6 text-emerald-600" />
                    </div>
                    <p className="text-sm font-medium text-emerald-700">{file.name}</p>
                    <p className="text-xs text-slate-500">Click to change file</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center mx-auto">
                      <Camera className="w-7 h-7 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">Drop your receipt here or click to browse</p>
                      <p className="text-xs text-slate-500 mt-1">JPEG, PNG, or PDF up to 10MB</p>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this receipt..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 resize-none"
                  rows={2}
                />
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!file || uploading}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Submit Receipt
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
