import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  Building2,
  Calendar,
  User,
  FileDown,
  Printer,
  ClipboardList,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { PurchaseRequest, ApprovalSignature, Profile } from '../types/database';
import { getApprovalTier } from '../utils/validation';
import { exportRequestToPDF } from '../utils/pdfExport';

export default function ApprovalReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const actionTaken = (location.state as { action?: 'approved' | 'rejected' })?.action;

  const [request, setRequest] = useState<PurchaseRequest | null>(null);
  const [signatures, setSignatures] = useState<ApprovalSignature[]>([]);
  const [requesterProfile, setRequesterProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchRequestData();
    }
  }, [id]);

  async function fetchRequestData() {
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

  function handlePrint() {
    window.print();
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
        <Link to="/approvals" className="text-sky-600 hover:underline mt-4 inline-block">
          Back to Approvals
        </Link>
      </div>
    );
  }

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

  const isApproved = request.status === 'approved';
  const isRejected = request.status === 'rejected';

  return (
    <div className="max-w-4xl mx-auto print:max-w-none print:m-0">
      <div className="print:hidden mb-6">
        <Link
          to="/approvals"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Pending Approvals
        </Link>
      </div>

      {actionTaken && (
        <div className={`mb-6 p-4 rounded-xl print:hidden ${
          actionTaken === 'approved' ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center gap-3">
            {actionTaken === 'approved' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            ) : (
              <XCircle className="w-6 h-6 text-red-600" />
            )}
            <div>
              <p className={`font-semibold ${actionTaken === 'approved' ? 'text-emerald-800' : 'text-red-800'}`}>
                Request {actionTaken === 'approved' ? 'Approved' : 'Rejected'} Successfully
              </p>
              <p className={`text-sm ${actionTaken === 'approved' ? 'text-emerald-600' : 'text-red-600'}`}>
                Your action has been recorded. The requester will be notified.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm print:shadow-none print:border-0">
        <div className="p-6 border-b border-slate-200 print:border-b-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                isApproved ? 'bg-emerald-100' : isRejected ? 'bg-red-100' : 'bg-amber-100'
              }`}>
                {isApproved ? (
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                ) : isRejected ? (
                  <XCircle className="w-8 h-8 text-red-600" />
                ) : (
                  <ClipboardList className="w-8 h-8 text-amber-600" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">
                  {isApproved ? 'Approval Receipt' : isRejected ? 'Rejection Notice' : 'Request Summary'}
                </h1>
                <p className="text-slate-500 mt-1">Request ID: {request.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-slate-800">
                ${request.total_amount.toLocaleString()}
              </p>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 mt-2 rounded-full text-sm font-semibold ${
                isApproved ? 'bg-emerald-100 text-emerald-700' : isRejected ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {isApproved ? (
                  <><CheckCircle2 className="w-4 h-4" /> Approved</>
                ) : isRejected ? (
                  <><XCircle className="w-4 h-4" /> Rejected</>
                ) : (
                  'Pending'
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-6 print:hidden">
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              <FileDown className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export PDF'}
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 print:gap-6">
          <div className="space-y-6">
            <Section title="Request Details">
              <InfoRow icon={Building2} label="Vendor" value={request.vendor_name} />
              {request.vendor_location && (
                <InfoRow icon={Building2} label="Location" value={request.vendor_location} />
              )}
              <InfoRow icon={FileText} label="Purpose" value={request.business_purpose} />
              <InfoRow icon={FileText} label="Category" value={request.category} />
            </Section>

            <Section title="Requestor Information">
              <InfoRow icon={User} label="Requestor Name" value={request.cardholder_name} />
              <InfoRow icon={FileText} label="P-Card Name" value={request.p_card_name} />
              <InfoRow icon={Calendar} label="Expense Date" value={formatDate(request.expense_date)} />
              {requesterProfile && (
                <InfoRow icon={Building2} label="Department" value={requesterProfile.department || 'N/A'} />
              )}
            </Section>

            <Section title="Financial Summary">
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Purchase Amount</span>
                  <span className="text-sm font-medium text-slate-800">${request.purchase_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Tax</span>
                  <span className="text-sm font-medium text-slate-800">${request.tax_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Shipping</span>
                  <span className="text-sm font-medium text-slate-800">${request.shipping_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                  <span className="font-semibold text-slate-800">Total</span>
                  <span className="text-lg font-bold text-slate-800">${request.total_amount.toLocaleString()}</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">{getApprovalTier(request.total_amount)}</p>
            </Section>
          </div>

          <div className="space-y-6">
            <Section title="Business Justification">
              <p className="text-sm text-slate-600 leading-relaxed">{request.detailed_description}</p>
              {request.po_bypass_reason && (
                <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
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
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="bg-white rounded-lg p-3 inline-block border border-slate-200">
                    <img
                      src={request.employee_signature_url}
                      alt="Employee Signature"
                      className="h-16 max-w-[200px] object-contain"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Signed by {request.cardholder_name} on {formatDateTime(request.employee_signed_at!)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No signature</p>
              )}
            </Section>

            {signatures.length > 0 && (
              <Section title="Approval Signatures">
                <div className="space-y-4">
                  {signatures.map((sig) => (
                    <div
                      key={sig.id}
                      className={`p-4 rounded-xl border ${
                        sig.action === 'approved'
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {sig.action === 'approved' ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600" />
                        )}
                        <span
                          className={`font-semibold ${
                            sig.action === 'approved' ? 'text-emerald-800' : 'text-red-800'
                          }`}
                        >
                          {sig.action === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-800">{sig.approver_name}</p>
                      <p className="text-xs text-slate-500">{sig.approver_title}</p>
                      {sig.signature_url && (
                        <div className="mt-3 bg-white rounded-lg p-2 inline-block border border-slate-200">
                          <img
                            src={sig.signature_url}
                            alt={`${sig.approver_name}'s signature`}
                            className="h-12 max-w-[180px] object-contain"
                          />
                        </div>
                      )}
                      {sig.comments && (
                        <p className="text-sm text-slate-600 mt-3 italic">"{sig.comments}"</p>
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
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="font-semibold text-red-800">Rejection Reason</span>
                </div>
                <p className="text-sm text-red-700">{request.rejection_reason}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 bg-slate-50 print:bg-transparent">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">
                Request submitted on {formatDateTime(request.created_at)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Last updated on {formatDateTime(request.updated_at)}
              </p>
            </div>
            <p className="text-xs text-slate-400">SpendGuard P-Card Management System</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 mb-3 uppercase tracking-wide">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5" />
      <div>
        <span className="text-xs text-slate-500 block">{label}</span>
        <span className="text-sm text-slate-800">{value}</span>
      </div>
    </div>
  );
}
