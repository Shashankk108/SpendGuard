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
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { PurchaseRequest, ApprovalSignature, Profile } from '../types/database';
import { getApprovalTier, validatePurchaseRequest } from '../utils/validation';
import SignaturePad from '../components/SignaturePad';
import { exportRequestToPDF } from '../utils/pdfExport';

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [request, setRequest] = useState<PurchaseRequest | null>(null);
  const [signatures, setSignatures] = useState<ApprovalSignature[]>([]);
  const [requesterProfile, setRequesterProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApprover, setIsApprover] = useState(false);
  const [hasAlreadyActioned, setHasAlreadyActioned] = useState(false);
  const [approverSignature, setApproverSignature] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signatureError, setSignatureError] = useState('');
  const [exporting, setExporting] = useState(false);

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
    setLoading(false);
  }

  async function checkApproverStatus() {
    if (!profile?.email || !id) return;

    const { data } = await supabase
      .from('approvers')
      .select('*')
      .eq('email', profile.email)
      .eq('is_active', true)
      .maybeSingle();

    setIsApprover(!!data);

    if (data && profile?.full_name) {
      const { data: existingSignature } = await supabase
        .from('approval_signatures')
        .select('id')
        .eq('request_id', id)
        .eq('approver_name', profile.full_name)
        .maybeSingle();

      setHasAlreadyActioned(!!existingSignature);
    }
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
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setExporting(false);
    }
  }

  async function handleApproval(action: 'approved' | 'rejected') {
    if (!request || !profile) return;

    setSignatureError('');

    if (!approverSignature) {
      setSignatureError('Signature is required to proceed');
      return;
    }

    if (action === 'rejected' && !comments) {
      return;
    }

    setSubmitting(true);

    try {
      const { error: sigError } = await supabase.from('approval_signatures').insert({
        request_id: request.id,
        approver_name: profile.full_name || 'Approver',
        approver_title: profile.role === 'admin' ? 'Administrator' : 'Approver',
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

      navigate('/approvals', { replace: true });
    } catch (error) {
      console.error('Error processing approval:', error);
    } finally {
      setSubmitting(false);
    }
  }

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
    return new Date(dateString).toLocaleDateString('en-US', {
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

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Section title="Cardholder Information">
              <InfoRow icon={User} label="Cardholder Name" value={request.cardholder_name} />
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

        {isApprover && request.status === 'pending' && !hasAlreadyActioned && (
          <div className="p-6 border-t border-slate-200 bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Approval Action</h3>

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
                if (sig) setSignatureError('');
              }} />
              {signatureError && (
                <p className="mt-2 text-sm text-red-600">{signatureError}</p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => handleApproval('approved')}
                disabled={submitting}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                Approve
              </button>
              <button
                onClick={() => handleApproval('rejected')}
                disabled={submitting || !comments}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <XCircle className="w-5 h-5" />
                Reject
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
