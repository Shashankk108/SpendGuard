import { useState, useEffect } from 'react';
import {
  Receipt,
  CheckCircle,
  XCircle,
  HelpCircle,
  Eye,
  User,
  Calendar,
  DollarSign,
  FileText,
  X,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Upload,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import FileViewer from '../FileViewer';

interface ReceiptAnalysis {
  id: string;
  extracted_vendor: string | null;
  extracted_amount: number | null;
  extracted_date: string | null;
  extracted_items: Array<{ description: string; amount: number }>;
  vendor_match: boolean;
  amount_match: boolean;
  date_match: boolean;
  vendor_reason: string | null;
  amount_reason: string | null;
  date_reason: string | null;
  expected_vendor: string | null;
  expected_amount: number | null;
  expected_date: string | null;
  confidence_score: number;
  recommendation: 'approve' | 'review' | 'reject';
  analysis_notes: string;
}

interface ReceiptData {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  uploaded_at: string;
  created_at: string;
  status: string;
  employee_comment: string;
  notes: string;
  user_id: string;
  request_id: string;
  reupload_requested: boolean;
  reupload_requested_at: string | null;
  reupload_reason: string | null;
  version: number;
  is_current: boolean;
  previous_receipt_id: string | null;
  purchase_request: {
    id: string;
    vendor_name: string;
    total_amount: number;
    expense_date: string;
    business_purpose: string;
  };
  uploader: {
    full_name: string;
    department: string;
  };
  responses: Array<{
    id: string;
    action: string;
    comment: string;
    created_at: string;
    responder: {
      full_name: string;
    };
  }>;
  previous_receipt?: {
    id: string;
    file_url: string;
    file_type: string;
    created_at: string;
    version: number;
  };
}

type FilterType = 'pending' | 'all' | 'approved' | 'rejected' | 'needs_info';
type ViewType = 'review' | 'completed';

export default function ReceiptsTab() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewType>('review');
  const [filter, setFilter] = useState<FilterType>('pending');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);
  const [responseComment, setResponseComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, needs_info: 0, total: 0 });
  const [analysis, setAnalysis] = useState<ReceiptAnalysis | null>(null);
  const [analyzingReceipt, setAnalyzingReceipt] = useState(false);
  const [reuploadReason, setReuploadReason] = useState('');
  const [showReuploadModal, setShowReuploadModal] = useState(false);
  const [requestingReupload, setRequestingReupload] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    fetchReceipts();
  }, [view, filter]);

  useEffect(() => {
    if (selectedReceipt) {
      analyzeReceipt(selectedReceipt);
    } else {
      setAnalysis(null);
    }
  }, [selectedReceipt]);

  async function analyzeReceipt(receipt: ReceiptData, forceReanalyze = false) {
    if (!receipt.purchase_request) return;

    setAnalyzingReceipt(true);
    setAnalysisError(null);
    setAnalysisStep('Checking for existing analysis...');

    try {
      if (!forceReanalyze) {
        const { data: existingAnalysis } = await supabase
          .from('receipt_analyses')
          .select('*')
          .eq('receipt_id', receipt.id)
          .maybeSingle();

        if (existingAnalysis) {
          setAnalysis(existingAnalysis);
          setAnalyzingReceipt(false);
          setAnalysisStep('');
          return;
        }
      }

      const isPdf = receipt.file_type === 'application/pdf';
      if (isPdf) {
        setAnalysisStep('PDF detected - preparing for analysis...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setAnalysisStep('Sending receipt to AI for analysis...');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-receipt`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receipt_id: receipt.id,
          request_id: receipt.request_id,
          file_url: receipt.file_url,
          file_type: receipt.file_type,
          purchase_request: receipt.purchase_request,
          force_reanalyze: forceReanalyze,
        }),
      });

      setAnalysisStep('Processing AI response...');

      const result = await response.json();
      console.log('Analysis result:', result);

      if (result.error) {
        let errorMsg = result.error;
        if (result.details) errorMsg += `: ${result.details}`;
        if (result.api_configured === false) {
          errorMsg = 'OpenAI API key is not configured. AI analysis is unavailable. Please contact your administrator.';
        }
        if (result.pdf_not_supported) {
          errorMsg = 'PDF files cannot be analyzed by AI. Please ask the employee to upload a JPG or PNG image instead.';
        }
        if (result.openai_error) {
          console.error('OpenAI error details:', result.openai_error);
        }
        setAnalysisError(errorMsg);
      }

      if (result.analysis) {
        setAnalysis(result.analysis);
      } else if (!result.error) {
        setAnalysisError('No analysis returned from server');
      }
    } catch (error) {
      console.error('Error analyzing receipt:', error);
      setAnalysisError(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setAnalyzingReceipt(false);
      setAnalysisStep('');
    }
  }

  async function reanalyzeReceipt() {
    if (!selectedReceipt) return;

    await supabase
      .from('receipt_analyses')
      .delete()
      .eq('receipt_id', selectedReceipt.id);

    setAnalysis(null);
    setAnalysisError(null);
    analyzeReceipt(selectedReceipt, true);
  }

  async function fetchReceipts() {
    setLoading(true);
    try {
      let query = supabase
        .from('purchase_receipts')
        .select('*')
        .eq('is_current', true)
        .order('created_at', { ascending: false });

      if (view === 'completed') {
        query = query.eq('status', 'approved');
      } else if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;

      const receiptsWithDetails = await Promise.all(
        (data || []).map(async (receipt) => {
          const [requestData, uploaderData, responsesData, previousReceiptData] = await Promise.all([
            supabase
              .from('purchase_requests')
              .select('id, vendor_name, total_amount, expense_date, business_purpose')
              .eq('id', receipt.request_id)
              .maybeSingle(),
            supabase
              .from('profiles')
              .select('full_name, department')
              .eq('id', receipt.user_id)
              .maybeSingle(),
            supabase
              .from('receipt_responses')
              .select('id, action, comment, created_at, responder_id')
              .eq('receipt_id', receipt.id),
            receipt.previous_receipt_id
              ? supabase
                  .from('purchase_receipts')
                  .select('id, file_url, file_type, created_at, version')
                  .eq('id', receipt.previous_receipt_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ]);

          const responsesWithResponder = await Promise.all(
            (responsesData.data || []).map(async (response: any) => {
              const { data: responder } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', response.responder_id)
                .maybeSingle();

              return {
                ...response,
                responder
              };
            })
          );

          return {
            ...receipt,
            purchase_request: requestData.data,
            uploader: uploaderData.data,
            responses: responsesWithResponder,
            previous_receipt: previousReceiptData.data || undefined,
          };
        })
      );

      setReceipts(receiptsWithDetails);

      const { data: allReceipts } = await supabase
        .from('purchase_receipts')
        .select('status');

      if (allReceipts) {
        setStats({
          pending: allReceipts.filter(r => r.status === 'pending').length,
          approved: allReceipts.filter(r => r.status === 'approved').length,
          rejected: allReceipts.filter(r => r.status === 'rejected').length,
          needs_info: allReceipts.filter(r => r.status === 'needs_info').length,
          total: allReceipts.length,
        });
      }
    } catch (error) {
      console.error('Error fetching receipts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResponse(action: 'approved' | 'rejected' | 'needs_info') {
    if (!selectedReceipt || !user?.id) return;

    setSubmitting(true);
    try {
      const { error: responseError } = await supabase
        .from('receipt_responses')
        .insert({
          receipt_id: selectedReceipt.id,
          responder_id: user.id,
          action,
          comment: responseComment || null,
        });

      if (responseError) throw responseError;

      const { error: updateError } = await supabase
        .from('purchase_receipts')
        .update({ status: action })
        .eq('id', selectedReceipt.id);

      if (updateError) throw updateError;

      if (action === 'approved') {
        await supabase
          .from('purchase_requests')
          .update({ receipt_status: 'verified' })
          .eq('id', selectedReceipt.request_id);
      }

      setSelectedReceipt(null);
      setResponseComment('');
      fetchReceipts();
    } catch (error) {
      console.error('Error submitting response:', error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestReupload() {
    if (!selectedReceipt || !user?.id || !reuploadReason.trim()) return;

    setRequestingReupload(true);
    try {
      const { error } = await supabase
        .from('purchase_receipts')
        .update({
          reupload_requested: true,
          reupload_requested_at: new Date().toISOString(),
          reupload_requested_by: user.id,
          reupload_reason: reuploadReason.trim(),
          status: 'needs_info',
        })
        .eq('id', selectedReceipt.id);

      if (error) throw error;

      setShowReuploadModal(false);
      setReuploadReason('');
      setSelectedReceipt(null);
      fetchReceipts();
    } catch (error) {
      console.error('Error requesting re-upload:', error);
    } finally {
      setRequestingReupload(false);
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
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

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
      pending: { bg: 'bg-amber-50', text: 'text-amber-700', icon: <Clock className="w-3 h-3" /> },
      approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
      rejected: { bg: 'bg-red-50', text: 'text-red-700', icon: <XCircle className="w-3 h-3" /> },
      needs_info: { bg: 'bg-sky-50', text: 'text-sky-700', icon: <HelpCircle className="w-3 h-3" /> },
    };
    const style = styles[status] || styles.pending;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${style.bg} ${style.text}`}>
        {style.icon}
        {status === 'needs_info' ? 'Info Requested' : status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => { setView('review'); setFilter('pending'); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              view === 'review'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Review Queue
              {stats.pending > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">
                  {stats.pending}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setView('completed')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              view === 'completed'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Completed
              {stats.approved > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
                  {stats.approved}
                </span>
              )}
            </div>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            {stats.pending} Pending
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {stats.approved} Approved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            {stats.rejected} Rejected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            {stats.needs_info} Info Req
          </span>
        </div>
      </div>

      {view === 'review' && (
        <div className="flex items-center gap-2 flex-wrap">
          {(['pending', 'all', 'needs_info', 'rejected'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f === 'needs_info' ? 'Info Requested' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading receipts...</p>
        </div>
      ) : receipts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          {view === 'completed' ? (
            <>
              <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 font-medium mb-1">No completed receipts yet</p>
              <p className="text-sm text-slate-400">
                Approved receipts will appear here
              </p>
            </>
          ) : (
            <>
              <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 font-medium mb-1">No receipts to review</p>
              <p className="text-sm text-slate-400">
                {filter === 'pending'
                  ? 'No pending receipts awaiting review'
                  : `No ${filter === 'needs_info' ? 'info requested' : filter} receipts found`}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-medium text-slate-600">
              {view === 'completed' ? 'Completed Receipts' : 'Receipts Requiring Action'} ({receipts.length})
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {receipts.map(receipt => (
              <div key={receipt.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      view === 'completed' ? 'bg-emerald-50' : 'bg-slate-100'
                    }`}>
                      {view === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <FileText className="w-5 h-5 text-slate-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-medium text-slate-900">
                          {receipt.purchase_request?.vendor_name || 'Unknown Vendor'}
                        </p>
                        {getStatusBadge(receipt.status)}
                        {receipt.version > 1 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200">
                            <RefreshCw className="w-3 h-3" />
                            Re-upload v{receipt.version}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {receipt.uploader?.full_name || 'Unknown'}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          {formatCurrency(receipt.purchase_request?.total_amount || 0)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(receipt.uploaded_at)}
                        </span>
                      </div>
                      {(receipt.notes || receipt.employee_comment) && (
                        <p className="text-xs text-slate-600 bg-slate-50 rounded px-2 py-1 mt-1">
                          <span className="font-medium">Note:</span> {receipt.notes || receipt.employee_comment}
                        </p>
                      )}
                      {receipt.responses && receipt.responses.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {receipt.responses.slice(0, 2).map(response => (
                            <p key={response.id} className="text-xs text-slate-500">
                              <span className="font-medium">{response.responder?.full_name}:</span>{' '}
                              {response.comment || `Marked as ${response.action}`}
                            </p>
                          ))}
                          {receipt.responses.length > 2 && (
                            <p className="text-xs text-slate-400">+{receipt.responses.length - 2} more responses</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedReceipt(receipt)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0 ${
                      view === 'completed'
                        ? 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                        : 'text-teal-700 bg-teal-50 hover:bg-teal-100'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {view === 'completed' ? 'View' : 'Review'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedReceipt(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {view === 'completed' ? 'Receipt Details' : 'Review Receipt'}
                  </h2>
                  {getStatusBadge(selectedReceipt.status)}
                </div>
                <p className="text-sm text-slate-500">
                  {selectedReceipt.purchase_request?.vendor_name} - {formatCurrency(selectedReceipt.purchase_request?.total_amount || 0)}
                </p>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Employee</p>
                  <p className="text-sm text-slate-700">{selectedReceipt.uploader?.full_name}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Department</p>
                  <p className="text-sm text-slate-700">{selectedReceipt.uploader?.department || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Purpose</p>
                  <p className="text-sm text-slate-700">{selectedReceipt.purchase_request?.business_purpose}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Expense Date</p>
                  <p className="text-sm text-slate-700">{formatDate(selectedReceipt.purchase_request?.expense_date || '')}</p>
                </div>
              </div>

              {(selectedReceipt.notes || selectedReceipt.employee_comment) && (
                <div className="mb-6 p-3 bg-slate-50 rounded-lg">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Employee Comments</p>
                  <p className="text-sm text-slate-700">{selectedReceipt.notes || selectedReceipt.employee_comment}</p>
                </div>
              )}

              <div className="mb-6">
                {selectedReceipt.version > 1 && selectedReceipt.previous_receipt && (
                  <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <RefreshCw className="w-4 h-4 text-sky-600" />
                      <span className="text-sm font-medium text-sky-800">Re-uploaded Receipt (Version {selectedReceipt.version})</span>
                    </div>
                    <p className="text-xs text-sky-700 mb-3">This is a new upload replacing the previous version. Compare below:</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                          Previous (v{selectedReceipt.previous_receipt.version})
                        </p>
                        <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-100 opacity-60 h-32">
                          {selectedReceipt.previous_receipt.file_type?.startsWith('image/') ? (
                            <img
                              src={selectedReceipt.previous_receipt.file_url}
                              alt="Previous receipt"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FileText className="w-8 h-8 text-slate-400" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-sky-600 uppercase tracking-wider mb-1.5 font-semibold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
                          New Upload (v{selectedReceipt.version})
                        </p>
                        <div className="border-2 border-sky-400 rounded-lg overflow-hidden bg-white h-32 ring-2 ring-sky-200">
                          {selectedReceipt.file_type?.startsWith('image/') ? (
                            <img
                              src={selectedReceipt.file_url}
                              alt="New receipt"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FileText className="w-8 h-8 text-sky-500" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  Receipt Image
                  {selectedReceipt.version > 1 && (
                    <span className="text-sky-600 font-semibold">(Current Version {selectedReceipt.version})</span>
                  )}
                </p>
                <div className={`border rounded-lg overflow-hidden bg-slate-50 relative ${selectedReceipt.version > 1 ? 'border-sky-300 ring-1 ring-sky-200' : 'border-slate-200'}`}>
                  <FileViewer
                    fileUrl={selectedReceipt.file_url}
                    fileType={selectedReceipt.file_type}
                    fileName={selectedReceipt.file_name}
                  />
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-sm">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">AI Receipt Analysis</p>
                      <p className="text-[10px] text-slate-500">Powered by GPT-4 Vision</p>
                    </div>
                  </div>
                  {analysis && !analyzingReceipt && (
                    <button
                      onClick={reanalyzeReceipt}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Re-analyze
                    </button>
                  )}
                </div>

                {analyzingReceipt ? (
                  <div className="border border-slate-200 rounded-xl p-8 bg-gradient-to-br from-slate-50 via-white to-teal-50/30">
                    <div className="flex flex-col items-center justify-center gap-4">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 flex items-center justify-center">
                          <Sparkles className="w-7 h-7 text-teal-600 animate-pulse" />
                        </div>
                        <div className="absolute inset-0 w-16 h-16 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                      <div className="text-center">
                        <p className="text-base font-semibold text-slate-800">Analyzing Receipt...</p>
                        <p className="text-sm text-slate-500 mt-1">AI is extracting text, amounts, and dates</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-teal-600 bg-teal-50 px-3 py-1.5 rounded-full">
                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
                        <span>{analysisStep || 'Processing with computer vision'}</span>
                      </div>
                    </div>
                  </div>
                ) : analysisError && !analysis ? (
                  <div className="border border-red-200 rounded-xl p-6 bg-gradient-to-br from-red-50 to-rose-50">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-6 h-6 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-base font-semibold text-red-800 mb-1">Analysis Error</p>
                        <p className="text-sm text-red-700 mb-4">{analysisError}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={reanalyzeReceipt}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Try Again
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-3">
                          You can still manually review and approve/reject this receipt using the buttons below.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : analysis ? (
                  <>
                    {analysisError && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-amber-800">{analysisError}</p>
                        </div>
                      </div>
                    )}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className={`px-5 py-4 ${
                      analysis.recommendation === 'approve'
                        ? 'bg-gradient-to-r from-emerald-50 to-green-50 border-b border-emerald-100'
                        : analysis.recommendation === 'reject'
                        ? 'bg-gradient-to-r from-red-50 to-rose-50 border-b border-red-100'
                        : 'bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${
                            analysis.recommendation === 'approve'
                              ? 'bg-emerald-500'
                              : analysis.recommendation === 'reject'
                              ? 'bg-red-500'
                              : 'bg-amber-500'
                          }`}>
                            {analysis.recommendation === 'approve' ? (
                              <ShieldCheck className="w-6 h-6 text-white" />
                            ) : analysis.recommendation === 'reject' ? (
                              <ShieldAlert className="w-6 h-6 text-white" />
                            ) : (
                              <ShieldQuestion className="w-6 h-6 text-white" />
                            )}
                          </div>
                          <div>
                            <p className={`text-base font-bold ${
                              analysis.recommendation === 'approve'
                                ? 'text-emerald-800'
                                : analysis.recommendation === 'reject'
                                ? 'text-red-800'
                                : 'text-amber-800'
                            }`}>
                              {analysis.recommendation === 'approve'
                                ? 'Recommended for Approval'
                                : analysis.recommendation === 'reject'
                                ? 'Issues Detected - Review Required'
                                : 'Manual Review Recommended'}
                            </p>
                            <p className="text-xs text-slate-600 mt-0.5">
                              {analysis.vendor_match && analysis.amount_match && analysis.date_match
                                ? 'All verification checks passed'
                                : `${[analysis.vendor_match, analysis.amount_match, analysis.date_match].filter(Boolean).length}/3 checks passed`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-slate-600">Confidence</span>
                            <span className={`text-sm font-bold ${
                              analysis.confidence_score >= 80 ? 'text-emerald-600' :
                              analysis.confidence_score >= 50 ? 'text-amber-600' : 'text-red-600'
                            }`}>{analysis.confidence_score}%</span>
                          </div>
                          <div className="w-28 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                analysis.confidence_score >= 80
                                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                                  : analysis.confidence_score >= 50
                                  ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                                  : 'bg-gradient-to-r from-red-400 to-red-500'
                              }`}
                              style={{ width: `${analysis.confidence_score}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 bg-white space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div className={`text-center p-3 rounded-lg ${analysis.vendor_match ? 'bg-emerald-50' : 'bg-red-50'}`}>
                          <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center mb-2 ${
                            analysis.vendor_match ? 'bg-emerald-100' : 'bg-red-100'
                          }`}>
                            {analysis.vendor_match ? (
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                          <p className="text-[10px] font-medium text-slate-500 uppercase">Vendor</p>
                          <p className={`text-xs font-bold ${analysis.vendor_match ? 'text-emerald-700' : 'text-red-700'}`}>
                            {analysis.vendor_match ? 'Verified' : 'Mismatch'}
                          </p>
                        </div>
                        <div className={`text-center p-3 rounded-lg ${analysis.amount_match ? 'bg-emerald-50' : 'bg-red-50'}`}>
                          <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center mb-2 ${
                            analysis.amount_match ? 'bg-emerald-100' : 'bg-red-100'
                          }`}>
                            {analysis.amount_match ? (
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                          <p className="text-[10px] font-medium text-slate-500 uppercase">Amount</p>
                          <p className={`text-xs font-bold ${analysis.amount_match ? 'text-emerald-700' : 'text-red-700'}`}>
                            {analysis.amount_match ? 'Verified' : 'Mismatch'}
                          </p>
                        </div>
                        <div className={`text-center p-3 rounded-lg ${analysis.date_match ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                          <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center mb-2 ${
                            analysis.date_match ? 'bg-emerald-100' : 'bg-amber-100'
                          }`}>
                            {analysis.date_match ? (
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-600" />
                            )}
                          </div>
                          <p className="text-[10px] font-medium text-slate-500 uppercase">Date</p>
                          <p className={`text-xs font-bold ${analysis.date_match ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {analysis.date_match ? 'Verified' : 'Review'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className={`p-4 rounded-xl border-l-4 ${
                          analysis.vendor_match
                            ? 'bg-emerald-50/50 border-emerald-500'
                            : 'bg-red-50/50 border-red-500'
                        }`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Vendor Verification</span>
                              {analysis.vendor_match ? (
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded-full">MATCH</span>
                              ) : (
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 rounded-full">MISMATCH</span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mb-3">
                            <div className="bg-white/60 rounded-lg p-2">
                              <p className="text-[10px] text-slate-500 uppercase mb-0.5">Expected</p>
                              <p className="text-sm font-semibold text-slate-800">{analysis.expected_vendor || selectedReceipt.purchase_request?.vendor_name}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-2">
                              <p className="text-[10px] text-slate-500 uppercase mb-0.5">Found on Receipt</p>
                              <p className="text-sm font-semibold text-slate-800">{analysis.extracted_vendor || 'Not detected'}</p>
                            </div>
                          </div>
                          {analysis.vendor_reason && (
                            <div className="flex items-start gap-2 bg-white/80 rounded-lg p-2">
                              <Sparkles className="w-3.5 h-3.5 text-teal-600 mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-slate-700 leading-relaxed">{analysis.vendor_reason}</p>
                            </div>
                          )}
                        </div>

                        <div className={`p-4 rounded-xl border-l-4 ${
                          analysis.amount_match
                            ? 'bg-emerald-50/50 border-emerald-500'
                            : 'bg-red-50/50 border-red-500'
                        }`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Amount Verification</span>
                              {analysis.amount_match ? (
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded-full">MATCH</span>
                              ) : (
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 rounded-full">MISMATCH</span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mb-3">
                            <div className="bg-white/60 rounded-lg p-2">
                              <p className="text-[10px] text-slate-500 uppercase mb-0.5">Expected</p>
                              <p className="text-sm font-semibold text-slate-800">{formatCurrency(analysis.expected_amount || selectedReceipt.purchase_request?.total_amount || 0)}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-2">
                              <p className="text-[10px] text-slate-500 uppercase mb-0.5">Found on Receipt</p>
                              <p className="text-sm font-semibold text-slate-800">{analysis.extracted_amount !== null ? formatCurrency(analysis.extracted_amount) : 'Not detected'}</p>
                            </div>
                          </div>
                          {analysis.amount_reason && (
                            <div className="flex items-start gap-2 bg-white/80 rounded-lg p-2">
                              <Sparkles className="w-3.5 h-3.5 text-teal-600 mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-slate-700 leading-relaxed">{analysis.amount_reason}</p>
                            </div>
                          )}
                        </div>

                        <div className={`p-4 rounded-xl border-l-4 ${
                          analysis.date_match
                            ? 'bg-emerald-50/50 border-emerald-500'
                            : 'bg-amber-50/50 border-amber-500'
                        }`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Date Verification</span>
                              {analysis.date_match ? (
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded-full">MATCH</span>
                              ) : (
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full">REVIEW</span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mb-3">
                            <div className="bg-white/60 rounded-lg p-2">
                              <p className="text-[10px] text-slate-500 uppercase mb-0.5">Expected</p>
                              <p className="text-sm font-semibold text-slate-800">{analysis.expected_date ? formatDate(analysis.expected_date) : formatDate(selectedReceipt.purchase_request?.expense_date || '')}</p>
                            </div>
                            <div className="bg-white/60 rounded-lg p-2">
                              <p className="text-[10px] text-slate-500 uppercase mb-0.5">Found on Receipt</p>
                              <p className="text-sm font-semibold text-slate-800">{analysis.extracted_date ? formatDate(analysis.extracted_date) : 'Not detected'}</p>
                            </div>
                          </div>
                          {analysis.date_reason && (
                            <div className="flex items-start gap-2 bg-white/80 rounded-lg p-2">
                              <Sparkles className="w-3.5 h-3.5 text-teal-600 mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-slate-700 leading-relaxed">{analysis.date_reason}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {analysis.extracted_items && analysis.extracted_items.length > 0 && (
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Items Detected on Receipt</p>
                          <div className="space-y-2">
                            {analysis.extracted_items.slice(0, 5).map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm bg-white px-3 py-2 rounded-lg">
                                <span className="text-slate-700 truncate flex-1">{item.description}</span>
                                <span className="font-medium text-slate-900 ml-3">{formatCurrency(item.amount)}</span>
                              </div>
                            ))}
                            {analysis.extracted_items.length > 5 && (
                              <p className="text-xs text-slate-500 text-center pt-1">
                                +{analysis.extracted_items.length - 5} more items found
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-teal-600" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">AI Analysis Summary</p>
                            <p className="text-sm text-slate-700 leading-relaxed">{analysis.analysis_notes}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  </>
                ) : (
                  <div className="border border-slate-200 rounded-xl p-8 bg-gradient-to-br from-slate-50 to-slate-100 text-center">
                    <div className="w-14 h-14 mx-auto rounded-xl bg-slate-200 flex items-center justify-center mb-4">
                      <AlertTriangle className="w-7 h-7 text-slate-400" />
                    </div>
                    <p className="text-base font-semibold text-slate-700 mb-1">Analysis Not Available</p>
                    <p className="text-sm text-slate-500 mb-4">Click Re-analyze to start AI-powered receipt verification</p>
                    <button
                      onClick={reanalyzeReceipt}
                      disabled={analyzingReceipt}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
                    >
                      <Sparkles className="w-4 h-4" />
                      Analyze Receipt
                    </button>
                  </div>
                )}
              </div>

              {selectedReceipt.responses && selectedReceipt.responses.length > 0 && (
                <div className="mb-6">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Response History</p>
                  <div className="space-y-2">
                    {selectedReceipt.responses.map(response => (
                      <div key={response.id} className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-slate-700">{response.responder?.full_name}</span>
                          {getStatusBadge(response.action)}
                          <span className="text-[10px] text-slate-400">{formatDate(response.created_at)}</span>
                        </div>
                        {response.comment && (
                          <p className="text-sm text-slate-600">{response.comment}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {view === 'review' && selectedReceipt.status !== 'approved' && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Your Response</p>
                  <textarea
                    value={responseComment}
                    onChange={(e) => setResponseComment(e.target.value)}
                    placeholder="Add a comment (optional for approval, required for rejection or info request)..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
                    rows={3}
                  />
                </div>
              )}
            </div>

            {view === 'review' && selectedReceipt.status !== 'approved' ? (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
                <button
                  onClick={() => setShowReuploadModal(true)}
                  disabled={submitting || selectedReceipt.reupload_requested}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-4 h-4" />
                  {selectedReceipt.reupload_requested ? 'Re-upload Requested' : 'Request Re-upload'}
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleResponse('needs_info')}
                    disabled={submitting || !responseComment.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-sky-700 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <HelpCircle className="w-4 h-4" />
                    Request Info
                  </button>
                  <button
                    onClick={() => handleResponse('rejected')}
                    disabled={submitting || !responseComment.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                  <button
                    onClick={() => handleResponse('approved')}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {submitting ? 'Processing...' : 'Approve'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end flex-shrink-0">
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showReuploadModal && selectedReceipt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowReuploadModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Request Receipt Re-upload</h3>
                  <p className="text-sm text-slate-500">Employee will be notified via email</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Please provide a reason for requesting a new receipt. This will help the employee understand what needs to be corrected.
              </p>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Reason for Re-upload <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reuploadReason}
                onChange={(e) => setReuploadReason(e.target.value)}
                placeholder="e.g., Receipt is blurry, amount not visible, wrong document uploaded..."
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                rows={4}
              />
              <div className="mt-3 p-3 bg-amber-50 rounded-lg">
                <p className="text-xs text-amber-700">
                  <strong>Note:</strong> The employee will receive an email notification and will be able to upload a new receipt for this request.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowReuploadModal(false);
                  setReuploadReason('');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestReupload}
                disabled={requestingReupload || !reuploadReason.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                {requestingReupload ? 'Sending Request...' : 'Request Re-upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
