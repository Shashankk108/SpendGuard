import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  Building2,
  Calendar,
  User,
  Download,
  AlertTriangle,
  FileDown,
  Receipt,
  Eye,
  X,
  Upload,
  RefreshCw,
  Globe,
  Link2,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { PurchaseRequest, ApprovalSignature, Profile } from '../types/database';
import { getApprovalTier, validatePurchaseRequest } from '../utils/validation';
import SignaturePad from '../components/SignaturePad';
import { exportRequestToPDF } from '../utils/pdfExport';
import OrderJourney, { calculateJourneySteps } from '../components/OrderJourney';

interface ReceiptData {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  uploaded_at: string;
  status: string;
  notes: string;
  employee_comment: string;
  reupload_requested: boolean;
  reupload_requested_at: string | null;
  reupload_reason: string | null;
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [request, setRequest] = useState<PurchaseRequest | null>(null);
  const [signatures, setSignatures] = useState<ApprovalSignature[]>([]);
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [requesterProfile, setRequesterProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApprover, setIsApprover] = useState(false);
  const [approverRecord, setApproverRecord] = useState<{ id: string; title: string } | null>(null);
  const [hasAlreadyActioned, setHasAlreadyActioned] = useState(false);
  const [approverSignature, setApproverSignature] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signatureError, setSignatureError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [checkingApprover, setCheckingApprover] = useState(true);
  const [viewingReceipt, setViewingReceipt] = useState<ReceiptData | null>(null);
  const [showReuploadForm, setShowReuploadForm] = useState<string | null>(null);
  const [reuploadFile, setReuploadFile] = useState<File | null>(null);
  const [reuploadComment, setReuploadComment] = useState('');
  const [uploadingReupload, setUploadingReupload] = useState(false);
  const [showOrderIdForm, setShowOrderIdForm] = useState(false);
  const [orderIdInput, setOrderIdInput] = useState('');
  const [linkingOrderId, setLinkingOrderId] = useState(false);
  const [orderIdError, setOrderIdError] = useState('');

  useEffect(() => {
    if (id) {
      fetchRequest();
      checkApproverStatus();
    }
  }, [id, profile]);

  async function fetchRequest() {
    const { data, error } = await supabase
      .from('purchase_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching request:', error);
    } else {
      setRequest(data);

      if (data?.requester_id) {
        const { data: reqProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.requester_id)
          .maybeSingle();
        setRequesterProfile(reqProfile);
      }
    }

    const { data: sigs } = await supabase
      .from('approval_signatures')
      .select('*')
      .eq('request_id', id)
      .order('signed_at', { ascending: true });

    setSignatures(sigs || []);

    const { data: receiptData } = await supabase
      .from('purchase_receipts')
      .select('*')
      .eq('request_id', id)
      .order('uploaded_at', { ascending: false });

    setReceipts(receiptData || []);
    setLoading(false);
  }

  async function checkApproverStatus() {
    if (!profile?.email || !id) {
      setCheckingApprover(false);
      return;
    }

    setCheckingApprover(true);

    const { data, error } = await supabase
      .from('approvers')
      .select('id, title')
      .eq('email', profile.email)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Error checking approver status:', error);
    }

    setIsApprover(!!data);
    if (data) {
      setApproverRecord({ id: data.id, title: data.title });
    }

    if (data && profile?.full_name) {
      const { data: existingSignature } = await supabase
        .from('approval_signatures')
        .select('id')
        .eq('request_id', id)
        .eq('approver_name', profile.full_name)
        .maybeSingle();

      setHasAlreadyActioned(!!existingSignature);
    }

    setCheckingApprover(false);
  }

  async function handleExportPDF() {
    if (!request) return;
    setExporting(true);
    try {
      await exportRequestToPDF({
        request,
        signatures,
        requesterName: requesterProfile?.full_name,
        requesterDepartment: requesterProfile?.department,
        receipts: receipts.map(r => ({
          id: r.id,
          file_name: r.file_name,
          status: r.status,
          uploaded_at: r.uploaded_at,
          notes: r.notes,
        })),
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setExporting(false);
    }
  }

  async function handleApproval(action: 'approved' | 'rejected') {
    setApprovalError('');
    setSignatureError('');

    if (!request) {
      setApprovalError('Request data not available. Please refresh the page.');
      return;
    }

    if (!profile) {
      setApprovalError('Your profile is not loaded. Please refresh the page.');
      return;
    }

    if (!approverRecord) {
      setApprovalError('You are not recognized as an approver. Please contact an administrator.');
      return;
    }

    if (!approverSignature) {
      setSignatureError('Signature is required to proceed');
      return;
    }

    if (action === 'rejected' && !comments) {
      setApprovalError('Comments are required when rejecting a request.');
      return;
    }

    setSubmitting(true);

    try {
      const { error: sigError } = await supabase.from('approval_signatures').insert({
        request_id: request.id,
        approver_id: approverRecord.id,
        approver_name: profile.full_name || 'Approver',
        approver_title: approverRecord.title,
        signature_url: approverSignature,
        action,
        comments,
      });

      if (sigError) throw sigError;

      const newStatus = action === 'rejected' ? 'rejected' : 'approved';
      const { error: updateError } = await supabase
        .from('purchase_requests')
        .update({
          status: newStatus,
          rejection_reason: action === 'rejected' ? comments : null,
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      navigate(`/request/${request.id}/receipt`, {
        state: { action },
        replace: true
      });
    } catch (error: unknown) {
      console.error('Error processing approval:', error);
      const errorMessage = error instanceof Error ? error.message :
        (error as { message?: string })?.message || 'Unknown error';
      setApprovalError(`Failed to process: ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReupload(receiptId: string) {
    if (!reuploadFile || !user?.id || !request) return;

    setUploadingReupload(true);
    try {
      const reader = new FileReader();
      const fileUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(reuploadFile);
      });

      const { error: updateError } = await supabase
        .from('purchase_receipts')
        .update({
          file_url: fileUrl,
          file_name: reuploadFile.name,
          file_type: reuploadFile.type,
          uploaded_at: new Date().toISOString(),
          status: 'pending',
          reupload_requested: false,
          reupload_requested_at: null,
          reupload_reason: null,
          employee_comment: reuploadComment || null,
        })
        .eq('id', receiptId);

      if (updateError) throw updateError;

      await supabase
        .from('receipt_analyses')
        .delete()
        .eq('receipt_id', receiptId);

      setShowReuploadForm(null);
      setReuploadFile(null);
      setReuploadComment('');
      fetchRequest();
    } catch (error) {
      console.error('Error re-uploading receipt:', error);
    } finally {
      setUploadingReupload(false);
    }
  }

  async function handleLinkOrderId() {
    if (!orderIdInput.trim() || !request || !user?.id) return;

    setLinkingOrderId(true);
    setOrderIdError('');

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-godaddy-receipt`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            order_id: orderIdInput.trim(),
            request_id: request.id,
            user_id: user.id,
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        await supabase
          .from('purchase_requests')
          .update({ external_order_id: orderIdInput.trim() })
          .eq('id', request.id);

        setShowOrderIdForm(false);
        setOrderIdInput('');
        fetchRequest();
      } else {
        setOrderIdError(result.error || 'Failed to link order. Please check the order ID.');
      }
    } catch (error) {
      console.error('Error linking order:', error);
      setOrderIdError('Failed to connect to GoDaddy. Please try again.');
    } finally {
      setLinkingOrderId(false);
    }
  }

  const isGoDaddyVendor = request?.vendor_name?.toLowerCase().includes('godaddy') ||
    request?.vendor_name?.toLowerCase().includes('go daddy') ||
    (request as any)?.vendor_type === 'godaddy';

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center text-slate-500">Loading...</div>
    );
  }

  if (!request) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <p className="text-slate-500">Request not found</p>
        <Link to="/my-requests" className="text-sky-600 hover:underline mt-4 inline-block">
          Back to My Requests
        </Link>
      </div>
    );
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
        return <Clock className="w-5 h-5" />;
      case 'approved':
        return <CheckCircle2 className="w-5 h-5" />;
      case 'rejected':
        return <XCircle className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const validation = validatePurchaseRequest({
    total_amount: request.total_amount,
    category: request.category,
    is_software_subscription: request.is_software_subscription,
    it_license_confirmed: request.it_license_confirmed,
    is_preferred_vendor: request.is_preferred_vendor,
    po_bypass_reason: request.po_bypass_reason,
    po_bypass_explanation: request.po_bypass_explanation,
  });

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        to="/my-requests"
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to My Requests
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl font-bold text-slate-800">{request.vendor_name}</h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(
                    request.status
                  )}`}
                >
                  {getStatusIcon(request.status)}
                  {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                </span>
              </div>
              <p className="text-slate-500">{request.business_purpose}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-slate-800">
                ${request.total_amount.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500 mt-1">{getApprovalTier(request.total_amount)}</p>
              {(request.status === 'approved' || request.status === 'rejected') && (
                <button
                  onClick={handleExportPDF}
                  disabled={exporting}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  {exporting ? 'Exporting...' : 'Export PDF'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-4">Order Journey</p>
          <OrderJourney
            steps={calculateJourneySteps(
              request,
              signatures,
              receipts.map(r => ({
                id: r.id,
                file_name: r.file_name,
                status: r.status,
                uploaded_at: r.uploaded_at,
                notes: r.notes,
              })),
              (request as any).external_order_id
            )}
          />
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Section title="Requestor Information">
              <InfoRow icon={User} label="Requestor Name" value={request.cardholder_name} />
              <InfoRow icon={FileText} label="Name on P-Card" value={request.p_card_name} />
              <InfoRow icon={Calendar} label="Expense Date" value={formatDate(request.expense_date)} />
            </Section>

            <Section title="Vendor Information">
              <InfoRow icon={Building2} label="Vendor Name" value={request.vendor_name} />
              {request.vendor_location && (
                <InfoRow icon={Building2} label="Location" value={request.vendor_location} />
              )}
            </Section>

            <Section title="Purchase Details">
              <InfoRow icon={DollarSign} label="Purchase Amount" value={`$${request.purchase_amount.toLocaleString()}`} />
              <InfoRow icon={DollarSign} label="Tax" value={`$${request.tax_amount.toLocaleString()}`} />
              <InfoRow icon={DollarSign} label="Shipping" value={`$${request.shipping_amount.toLocaleString()}`} />
              <div className="pt-2 border-t border-slate-200">
                <InfoRow icon={DollarSign} label="Total" value={`$${request.total_amount.toLocaleString()}`} bold />
              </div>
              <InfoRow icon={FileText} label="Category" value={request.category} />
            </Section>
          </div>

          <div className="space-y-6">
            <Section title="Business Justification">
              <p className="text-sm text-slate-600 mb-4">{request.detailed_description}</p>
              {request.po_bypass_reason && (
                <div className="p-4 bg-amber-50 rounded-xl">
                  <p className="text-sm font-medium text-amber-800 mb-1">PO Bypass Reason</p>
                  <p className="text-sm text-amber-700">
                    {request.po_bypass_reason === 'vendor_limitations'
                      ? 'Vendor does not accept POs or does not have wire capabilities'
                      : request.po_bypass_reason === 'time_sensitivity'
                      ? 'Purchase required immediately'
                      : 'Other'}
                  </p>
                  {request.po_bypass_explanation && (
                    <p className="text-sm text-amber-600 mt-2">{request.po_bypass_explanation}</p>
                  )}
                </div>
              )}
            </Section>

            <Section title="Employee Signature">
              {request.employee_signature_url ? (
                <div>
                  <img
                    src={request.employee_signature_url}
                    alt="Employee Signature"
                    className="h-20 bg-slate-50 rounded-lg"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Signed on {formatDateTime(request.employee_signed_at!)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No signature</p>
              )}
            </Section>

            {receipts.length > 0 && (
              <Section title="Uploaded Receipts">
                <div className="space-y-3">
                  {receipts.map((receipt) => (
                    <div
                      key={receipt.id}
                      className={`p-4 border rounded-xl ${
                        receipt.reupload_requested
                          ? 'border-orange-300 bg-orange-50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      {receipt.reupload_requested && (
                        <div className="mb-3 p-3 bg-orange-100 rounded-lg border border-orange-200">
                          <div className="flex items-start gap-2">
                            <RefreshCw className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-orange-800">Re-upload Requested</p>
                              <p className="text-xs text-orange-700 mt-1">
                                {receipt.reupload_reason || 'Please upload a clearer receipt.'}
                              </p>
                              {receipt.reupload_requested_at && (
                                <p className="text-[10px] text-orange-600 mt-1">
                                  Requested on {formatDateTime(receipt.reupload_requested_at)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {receipt.file_type?.startsWith('image/') ? (
                              <img
                                src={receipt.file_url}
                                alt="Receipt thumbnail"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <FileText className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {receipt.file_name}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                receipt.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                receipt.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                receipt.status === 'needs_info' ? 'bg-sky-100 text-sky-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {receipt.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                                {receipt.status === 'rejected' && <XCircle className="w-3 h-3" />}
                                {receipt.status === 'needs_info' && <AlertTriangle className="w-3 h-3" />}
                                {receipt.status === 'pending' && <Clock className="w-3 h-3" />}
                                {receipt.status === 'needs_info' ? 'Info Requested' : receipt.status.charAt(0).toUpperCase() + receipt.status.slice(1)}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {formatDateTime(receipt.uploaded_at)}
                              </span>
                            </div>
                            {(receipt.notes || receipt.employee_comment) && (
                              <p className="text-xs text-slate-600 mt-2 bg-white px-2 py-1 rounded">
                                {receipt.notes || receipt.employee_comment}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {receipt.reupload_requested && (
                            <button
                              onClick={() => setShowReuploadForm(receipt.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Upload New
                            </button>
                          )}
                          <button
                            onClick={() => setViewingReceipt(receipt)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                        </div>
                      </div>

                      {showReuploadForm === receipt.id && (
                        <div className="mt-4 p-4 bg-white rounded-lg border border-orange-200">
                          <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                            <Upload className="w-4 h-4 text-orange-600" />
                            Upload New Receipt
                          </h4>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                Select File <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                onChange={(e) => setReuploadFile(e.target.files?.[0] || null)}
                                className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                Comment (optional)
                              </label>
                              <textarea
                                value={reuploadComment}
                                onChange={(e) => setReuploadComment(e.target.value)}
                                placeholder="Add any notes about this receipt..."
                                rows={2}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                              />
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                              <button
                                onClick={() => {
                                  setShowReuploadForm(null);
                                  setReuploadFile(null);
                                  setReuploadComment('');
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleReupload(receipt.id)}
                                disabled={!reuploadFile || uploadingReupload}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                {uploadingReupload ? 'Uploading...' : 'Upload Receipt'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {request.status === 'approved' && isGoDaddyVendor && user?.id === request.requester_id && (
              <Section title="GoDaddy Order">
                {(request as any).external_order_id ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span className="font-medium text-emerald-800">Order Linked</span>
                    </div>
                    <p className="text-sm text-emerald-700 font-mono">
                      #{(request as any).external_order_id}
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">
                      Receipt will be automatically imported from GoDaddy
                    </p>
                  </div>
                ) : showOrderIdForm ? (
                  <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="w-5 h-5 text-teal-600" />
                      <span className="font-medium text-teal-800">Link GoDaddy Order</span>
                    </div>
                    <p className="text-xs text-teal-700 mb-3">
                      Enter your GoDaddy order number to automatically import the receipt.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Order ID / Order Number
                        </label>
                        <input
                          type="text"
                          value={orderIdInput}
                          onChange={(e) => setOrderIdInput(e.target.value)}
                          placeholder="e.g., 3999851585"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                      </div>
                      {orderIdError && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-xs text-red-700">{orderIdError}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setShowOrderIdForm(false);
                            setOrderIdInput('');
                            setOrderIdError('');
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleLinkOrderId}
                          disabled={!orderIdInput.trim() || linkingOrderId}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
                        >
                          {linkingOrderId ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Linking...
                            </>
                          ) : (
                            <>
                              <Link2 className="w-3.5 h-3.5" />
                              Link & Import Receipt
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-sm text-slate-600 mb-3">
                      Have you placed your GoDaddy order? Link it here to automatically import the receipt.
                    </p>
                    <button
                      onClick={() => setShowOrderIdForm(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                    >
                      <Globe className="w-4 h-4" />
                      Enter GoDaddy Order ID
                    </button>
                    <p className="text-xs text-slate-500 mt-3">
                      Or you can upload a receipt manually below.
                    </p>
                  </div>
                )}
              </Section>
            )}

            {signatures.length > 0 && (
              <Section title="Approval History">
                <div className="space-y-4">
                  {signatures.map((sig) => (
                    <div
                      key={sig.id}
                      className={`p-4 rounded-xl ${
                        sig.action === 'approved' ? 'bg-emerald-50' : 'bg-red-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {sig.action === 'approved' ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600" />
                        )}
                        <span
                          className={`font-medium ${
                            sig.action === 'approved' ? 'text-emerald-800' : 'text-red-800'
                          }`}
                        >
                          {sig.action === 'approved' ? 'Approved' : 'Rejected'} by {sig.approver_name}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{sig.approver_title}</p>
                      {sig.signature_url && (
                        <div className="mt-3 p-2 bg-white rounded-lg inline-block">
                          <img
                            src={sig.signature_url}
                            alt={`${sig.approver_name}'s signature`}
                            className="h-12 max-w-[200px] object-contain"
                          />
                        </div>
                      )}
                      {sig.comments && (
                        <p className="text-sm text-slate-600 mt-2">{sig.comments}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-2">{formatDateTime(sig.signed_at)}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {request.rejection_reason && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <span className="font-medium text-red-800">Rejection Reason</span>
                </div>
                <p className="text-sm text-red-700">{request.rejection_reason}</p>
              </div>
            )}
          </div>
        </div>

        {isApprover && request.status === 'pending' && !hasAlreadyActioned && !checkingApprover && (
          <div className="p-6 border-t border-slate-200 bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Approval Action</h3>

            {approvalError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <p className="text-sm text-red-700">{approvalError}</p>
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Comments <span className="text-slate-400">(required for rejection)</span>
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                placeholder="Add any comments or notes..."
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Approver Signature <span className="text-red-500">*</span>
              </label>
              <SignaturePad onSignatureChange={(sig) => {
                setApproverSignature(sig);
                if (sig) {
                  setSignatureError('');
                  setApprovalError('');
                }
              }} />
              {signatureError && (
                <p className="mt-2 text-sm text-red-600">{signatureError}</p>
              )}
            </div>

            {!approverSignature && (
              <p className="mb-4 text-sm text-slate-500">Please provide your signature to enable the action buttons.</p>
            )}

            <div className="flex items-center gap-4">
              <button
                onClick={() => handleApproval('approved')}
                disabled={submitting || !approverSignature}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                {submitting ? 'Processing...' : 'Approve'}
              </button>
              <button
                onClick={() => handleApproval('rejected')}
                disabled={submitting || !approverSignature || !comments}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <XCircle className="w-5 h-5" />
                {submitting ? 'Processing...' : 'Reject'}
              </button>
            </div>
          </div>
        )}

        {isApprover && request.status === 'pending' && hasAlreadyActioned && (
          <div className="p-6 border-t border-slate-200 bg-amber-50">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <p className="text-amber-800 font-medium">You have already taken action on this request.</p>
            </div>
          </div>
        )}
      </div>

      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setViewingReceipt(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Receipt</h2>
                <p className="text-sm text-slate-500">{viewingReceipt.file_name}</p>
              </div>
              <button
                onClick={() => setViewingReceipt(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {viewingReceipt.file_type?.startsWith('image/') ? (
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
              {(viewingReceipt.notes || viewingReceipt.employee_comment) && (
                <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm font-medium text-slate-700 mb-1">Notes</p>
                  <p className="text-sm text-slate-600">{viewingReceipt.notes || viewingReceipt.employee_comment}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  bold,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-slate-400" />
      <span className="text-sm text-slate-500">{label}:</span>
      <span className={`text-sm ${bold ? 'font-semibold' : ''} text-slate-800`}>{value}</span>
    </div>
  );
}
