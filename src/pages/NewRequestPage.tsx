import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  Loader2,
  Upload,
  X,
  FileText,
  DollarSign,
  Building2,
  Calendar,
  Info,
  CreditCard,
  Ban,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import SignaturePad from '../components/SignaturePad';
import { validatePurchaseRequest, getApprovalTier } from '../utils/validation';
import type { ChecklistItem } from '../utils/validation';

interface PCardUsage {
  current_usage: number;
  monthly_limit: number;
  remaining: number;
  utilization_percent: number;
  hard_stop_enabled: boolean;
  is_limit_reached: boolean;
  month: string;
}

const CATEGORIES = [
  'Office Supplies',
  'Software Subscription',
  'Professional Services',
  'Marketing Materials',
  'Equipment Maintenance',
  'Training & Education',
  'Catering & Events',
  'Technology Hardware',
  'Travel - Air',
  'Travel - Rail',
  'Gift Cards',
  'Other',
];

const STEPS = [
  { id: 1, title: 'Cardholder Info', description: 'Your P-Card details' },
  { id: 2, title: 'Purchase Details', description: 'Vendor and amount' },
  { id: 3, title: 'Justification', description: 'Business purpose' },
  { id: 4, title: 'Documentation', description: 'Supporting files' },
  { id: 5, title: 'Review & Sign', description: 'Certification' },
];

interface FormData {
  cardholder_name: string;
  p_card_name: string;
  expense_date: string;
  vendor_name: string;
  vendor_location: string;
  purchase_amount: number;
  currency: string;
  tax_amount: number;
  shipping_amount: number;
  business_purpose: string;
  detailed_description: string;
  po_bypass_reason: string;
  po_bypass_explanation: string;
  category: string;
  is_software_subscription: boolean;
  it_license_confirmed: boolean;
  is_preferred_vendor: boolean;
}

export default function NewRequestPage() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [pcardUsage, setPcardUsage] = useState<PCardUsage | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  const [formData, setFormData] = useState<FormData>({
    cardholder_name: '',
    p_card_name: 'IT',
    expense_date: new Date().toISOString().split('T')[0],
    vendor_name: '',
    vendor_location: '',
    purchase_amount: 0,
    currency: 'USD',
    tax_amount: 0,
    shipping_amount: 0,
    business_purpose: '',
    detailed_description: '',
    po_bypass_reason: '',
    po_bypass_explanation: '',
    category: '',
    is_software_subscription: false,
    it_license_confirmed: false,
    is_preferred_vendor: false,
  });

  useEffect(() => {
    if (profile) {
      setFormData((prev) => ({
        ...prev,
        cardholder_name: profile.full_name || '',
      }));
    }
  }, [profile]);

  useEffect(() => {
    async function loadPcardUsage() {
      setLoadingUsage(true);
      const { data, error } = await supabase.rpc('get_pcard_monthly_usage');
      if (!error && data) {
        setPcardUsage(data as PCardUsage);
      }
      setLoadingUsage(false);
    }
    loadPcardUsage();
  }, []);

  useEffect(() => {
    const totalAmount =
      formData.purchase_amount + formData.tax_amount + formData.shipping_amount;

    const result = validatePurchaseRequest({
      total_amount: totalAmount,
      category: formData.category,
      is_software_subscription: formData.is_software_subscription,
      it_license_confirmed: formData.it_license_confirmed,
      is_preferred_vendor: formData.is_preferred_vendor,
      po_bypass_reason: formData.po_bypass_reason || null,
      po_bypass_explanation: formData.po_bypass_explanation || null,
    });

    setChecklist(result.checklist);
  }, [formData]);

  const totalAmount =
    formData.purchase_amount + formData.tax_amount + formData.shipping_amount;

  const wouldExceedLimit = pcardUsage
    ? (pcardUsage.current_usage + totalAmount) > pcardUsage.monthly_limit
    : false;

  const isBlocked = pcardUsage?.is_limit_reached && pcardUsage?.hard_stop_enabled;

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === 'number'
          ? parseFloat(value) || 0
          : type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: checked,
      ...(name === 'is_software_subscription' && { it_license_confirmed: false }),
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.cardholder_name && formData.p_card_name && formData.expense_date;
      case 2:
        return (
          formData.vendor_name &&
          formData.purchase_amount > 0 &&
          formData.category &&
          !checklist.some((item) => item.id === 'not_prohibited' && item.status === 'fail')
        );
      case 3:
        return (
          formData.business_purpose &&
          formData.detailed_description &&
          (totalAmount <= 500 || formData.po_bypass_reason)
        );
      case 4:
        return true;
      case 5:
        return signature !== null;
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    if (!user || !signature) return;

    setLoading(true);

    try {
      const { data: request, error: requestError } = await supabase
        .from('purchase_requests')
        .insert({
          requester_id: user.id,
          cardholder_name: formData.cardholder_name,
          p_card_name: formData.p_card_name,
          expense_date: formData.expense_date,
          vendor_name: formData.vendor_name,
          vendor_location: formData.vendor_location,
          purchase_amount: formData.purchase_amount,
          currency: formData.currency,
          tax_amount: formData.tax_amount,
          shipping_amount: formData.shipping_amount,
          total_amount: totalAmount,
          business_purpose: formData.business_purpose,
          detailed_description: formData.detailed_description,
          po_bypass_reason: formData.po_bypass_reason || null,
          po_bypass_explanation: formData.po_bypass_explanation || null,
          category: formData.category,
          is_software_subscription: formData.is_software_subscription,
          it_license_confirmed: formData.it_license_confirmed,
          is_preferred_vendor: formData.is_preferred_vendor,
          status: totalAmount <= 500 ? 'approved' : 'pending',
          employee_signature_url: signature,
          employee_signed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (requestError) throw requestError;

      navigate(`/request/${request.id}`);
    } catch (error) {
      console.error('Error submitting request:', error);
      alert('Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingUsage) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-red-200 shadow-lg overflow-hidden">
          <div className="bg-red-50 px-6 py-8 text-center border-b border-red-200">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Ban className="w-10 h-10 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-red-800">Monthly Spending Limit Reached</h1>
            <p className="text-red-600 mt-2">New purchase requests are temporarily blocked</p>
          </div>
          <div className="p-6 space-y-6">
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Current Month Usage</span>
                <span className="font-semibold text-slate-800">${pcardUsage?.current_usage.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Monthly Limit</span>
                <span className="font-semibold text-slate-800">${pcardUsage?.monthly_limit.toLocaleString()}</span>
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-red-500" style={{ width: '100%' }} />
              </div>
              <p className="text-xs text-slate-500 text-center">100% of monthly limit used</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">Why am I seeing this?</p>
                  <p>The P-Card monthly spending limit of ${pcardUsage?.monthly_limit.toLocaleString()} has been reached. New purchase requests cannot be submitted until:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-amber-700">
                    <li>The monthly limit is increased by an administrator</li>
                    <li>The monthly usage is reset</li>
                    <li>A new billing month begins</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="text-center space-y-4">
              <p className="text-sm text-slate-600">Please contact your administrator or supervisor for assistance.</p>
              <div className="flex justify-center gap-3">
                <Link
                  to="/dashboard"
                  className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
                >
                  Back to Dashboard
                </Link>
                <Link
                  to="/my-requests"
                  className="px-6 py-2.5 bg-sky-600 text-white rounded-xl font-medium hover:bg-sky-700 transition-colors"
                >
                  View My Requests
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">New Purchase Request</h1>
        <p className="text-slate-500 mt-1">P-Card Over $500 Purchase Approval Form</p>
      </div>

      {pcardUsage && pcardUsage.utilization_percent >= 80 && !isBlocked && (
        <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 ${
          pcardUsage.utilization_percent >= 95
            ? 'bg-red-50 border border-red-200'
            : 'bg-amber-50 border border-amber-200'
        }`}>
          <CreditCard className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
            pcardUsage.utilization_percent >= 95 ? 'text-red-500' : 'text-amber-500'
          }`} />
          <div>
            <p className={`text-sm font-semibold ${
              pcardUsage.utilization_percent >= 95 ? 'text-red-800' : 'text-amber-800'
            }`}>
              {pcardUsage.utilization_percent >= 95 ? 'P-Card Almost at Limit!' : 'P-Card Usage Warning'}
            </p>
            <p className={`text-sm ${
              pcardUsage.utilization_percent >= 95 ? 'text-red-700' : 'text-amber-700'
            }`}>
              ${pcardUsage.current_usage.toLocaleString()} of ${pcardUsage.monthly_limit.toLocaleString()} used ({pcardUsage.utilization_percent}%).
              {pcardUsage.remaining > 0 && ` Only $${pcardUsage.remaining.toLocaleString()} remaining.`}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-8">
        <div className="flex-1">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                      currentStep > step.id
                        ? 'bg-sky-600 border-sky-600 text-white'
                        : currentStep === step.id
                        ? 'border-sky-600 text-sky-600 bg-sky-50'
                        : 'border-slate-300 text-slate-400'
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <span className="text-sm font-semibold">{step.id}</span>
                    )}
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`w-16 h-0.5 mx-2 transition-all ${
                        currentStep > step.id ? 'bg-sky-600' : 'bg-slate-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm font-medium text-slate-800">{STEPS[currentStep - 1].title}</p>
              <p className="text-xs text-slate-500">{STEPS[currentStep - 1].description}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            {currentStep === 1 && (
              <Step1CardholderInfo formData={formData} onChange={handleInputChange} />
            )}
            {currentStep === 2 && (
              <Step2PurchaseDetails
                formData={formData}
                onChange={handleInputChange}
                onCheckboxChange={handleCheckboxChange}
                totalAmount={totalAmount}
              />
            )}
            {currentStep === 3 && (
              <Step3Justification
                formData={formData}
                onChange={handleInputChange}
                totalAmount={totalAmount}
              />
            )}
            {currentStep === 4 && (
              <Step4Documentation
                files={files}
                onFileChange={handleFileChange}
                onRemoveFile={removeFile}
              />
            )}
            {currentStep === 5 && (
              <Step5ReviewSign
                formData={formData}
                totalAmount={totalAmount}
                signature={signature}
                onSignatureChange={setSignature}
              />
            )}

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200">
              <button
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                disabled={currentStep === 1}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
                Back
              </button>

              {currentStep < 5 ? (
                <button
                  onClick={() => setCurrentStep((prev) => Math.min(5, prev + 1))}
                  disabled={!canProceed()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 text-white rounded-xl font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Continue
                  <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canProceed() || loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 text-white rounded-xl font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Submit Request
                      <Check className="w-5 h-5" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="w-80 flex-shrink-0">
          <div className="sticky top-24">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Amount Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Purchase Amount</span>
                  <span>${formData.purchase_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tax</span>
                  <span>${formData.tax_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Shipping</span>
                  <span>${formData.shipping_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-800 pt-2 border-t border-slate-200">
                  <span>Total</span>
                  <span>${totalAmount.toLocaleString()}</span>
                </div>
              </div>
              <div
                className={`mt-4 p-3 rounded-lg text-xs ${
                  totalAmount <= 500
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {getApprovalTier(totalAmount)}
              </div>
              {pcardUsage && wouldExceedLimit && totalAmount > 0 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-red-700">
                      <p className="font-semibold">Exceeds Monthly Limit</p>
                      <p>This would bring total to ${(pcardUsage.current_usage + totalAmount).toLocaleString()} (${(pcardUsage.current_usage + totalAmount - pcardUsage.monthly_limit).toLocaleString()} over limit)</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Pre-Charge Checklist</h3>
              <div className="space-y-3">
                {checklist.map((item) => (
                  <div key={item.id} className="flex items-start gap-2">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        item.status === 'pass'
                          ? 'bg-emerald-100 text-emerald-600'
                          : item.status === 'fail'
                          ? 'bg-red-100 text-red-600'
                          : item.status === 'warning'
                          ? 'bg-amber-100 text-amber-600'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {item.status === 'pass' ? (
                        <Check className="w-3 h-3" />
                      ) : item.status === 'fail' ? (
                        <X className="w-3 h-3" />
                      ) : item.status === 'warning' ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <div className="w-2 h-2 bg-slate-300 rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-600">{item.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step1CardholderInfo({
  formData,
  onChange,
}: {
  formData: FormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
        <input
          type="text"
          name="cardholder_name"
          value={formData.cardholder_name}
          onChange={onChange}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">P-Card Name</label>
        <input
          type="text"
          name="p_card_name"
          value={formData.p_card_name}
          onChange={onChange}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-sky-500"
          readOnly
        />
        <p className="mt-1.5 text-xs text-slate-500">Company P-Card</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Date of Expense</label>
        <div className="relative">
          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="date"
            name="expense_date"
            value={formData.expense_date}
            onChange={onChange}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            required
          />
        </div>
      </div>
    </div>
  );
}

function Step2PurchaseDetails({
  formData,
  onChange,
  onCheckboxChange,
  totalAmount,
}: {
  formData: FormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onCheckboxChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  totalAmount: number;
}) {
  const isProhibited = ['Technology Hardware', 'Travel - Air', 'Travel - Rail', 'Gift Cards'].includes(
    formData.category
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-2">Vendor Name</label>
          <div className="relative">
            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              name="vendor_name"
              value={formData.vendor_name}
              onChange={onChange}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
              required
            />
          </div>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Vendor Location (City/State)
          </label>
          <input
            type="text"
            name="vendor_location"
            value={formData.vendor_location}
            onChange={onChange}
            placeholder="e.g., San Francisco, CA"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Purchase Amount</label>
          <div className="relative">
            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="number"
              name="purchase_amount"
              value={formData.purchase_amount || ''}
              onChange={onChange}
              min="0"
              step="0.01"
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Tax Amount</label>
          <div className="relative">
            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="number"
              name="tax_amount"
              value={formData.tax_amount || ''}
              onChange={onChange}
              min="0"
              step="0.01"
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Shipping</label>
          <div className="relative">
            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="number"
              name="shipping_amount"
              value={formData.shipping_amount || ''}
              onChange={onChange}
              min="0"
              step="0.01"
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
        <select
          name="category"
          value={formData.category}
          onChange={onChange}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
          required
        >
          <option value="">Select a category</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        {isProhibited && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">
              This category is prohibited on P-Card purchases. Please use the PO system or contact
              Procurement for assistance.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3 pt-4 border-t border-slate-200">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="is_software_subscription"
            checked={formData.is_software_subscription}
            onChange={onCheckboxChange}
            className="w-5 h-5 text-sky-600 border-slate-300 rounded focus:ring-sky-500"
          />
          <span className="text-sm text-slate-700">This is a software subscription</span>
        </label>
        {formData.is_software_subscription && totalAmount <= 500 && (
          <label className="flex items-center gap-3 cursor-pointer ml-8">
            <input
              type="checkbox"
              name="it_license_confirmed"
              checked={formData.it_license_confirmed}
              onChange={onCheckboxChange}
              className="w-5 h-5 text-sky-600 border-slate-300 rounded focus:ring-sky-500"
            />
            <span className="text-sm text-slate-700">
              I confirmed with IT that no enterprise license exists
            </span>
          </label>
        )}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="is_preferred_vendor"
            checked={formData.is_preferred_vendor}
            onChange={onCheckboxChange}
            className="w-5 h-5 text-sky-600 border-slate-300 rounded focus:ring-sky-500"
          />
          <span className="text-sm text-slate-700">This is a preferred vendor</span>
        </label>
      </div>
    </div>
  );
}

function Step3Justification({
  formData,
  onChange,
  totalAmount,
}: {
  formData: FormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  totalAmount: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Business Purpose</label>
        <input
          type="text"
          name="business_purpose"
          value={formData.business_purpose}
          onChange={onChange}
          placeholder="Brief summary of the business need"
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Detailed Description of Goods or Services
        </label>
        <textarea
          name="detailed_description"
          value={formData.detailed_description}
          onChange={onChange}
          rows={4}
          placeholder="Provide a detailed description of what is being purchased..."
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
          required
        />
      </div>

      {totalAmount > 500 && (
        <div className="pt-4 border-t border-slate-200">
          <div className="flex items-start gap-2 mb-4">
            <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600">
              Since your purchase exceeds $500, you must explain why the Purchase Order system was not
              used.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Reason a Purchase Order Was Not Used
              </label>
              <select
                name="po_bypass_reason"
                value={formData.po_bypass_reason}
                onChange={onChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                required
              >
                <option value="">Select a reason</option>
                <option value="vendor_limitations">
                  Vendor limitations - Vendor does not accept POs or does not have wire capabilities
                </option>
                <option value="time_sensitivity">
                  Time sensitivity - Purchase required immediately
                </option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Detailed Explanation
              </label>
              <textarea
                name="po_bypass_explanation"
                value={formData.po_bypass_explanation}
                onChange={onChange}
                rows={3}
                placeholder="Provide additional details explaining why a PO could not be used..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Step4Documentation({
  files,
  onFileChange,
  onRemoveFile,
}: {
  files: File[];
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-slate-800 mb-2">Supporting Documentation</h3>
        <p className="text-sm text-slate-500 mb-6">
          Attach all available documentation related to the purchase, such as a vendor quote or
          invoice, confirmation email, or correspondence showing the necessity of the purchase. This
          supporting material will help substantiate the request and ensure full compliance with
          company policy.
        </p>

        <label className="block border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-sky-400 hover:bg-sky-50/50 transition-colors">
          <Upload className="w-10 h-10 text-slate-400 mx-auto mb-4" />
          <p className="text-sm text-slate-600 mb-1">
            <span className="text-sky-600 font-medium">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-slate-500">PDF, PNG, JPG, DOCX up to 10MB</p>
          <input
            type="file"
            onChange={onFileChange}
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            className="hidden"
          />
        </label>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Uploaded Files</p>
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-700">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemoveFile(index)}
                className="p-1 text-slate-400 hover:text-red-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Step5ReviewSign({
  formData,
  totalAmount,
  signature,
  onSignatureChange,
}: {
  formData: FormData;
  totalAmount: number;
  signature: string | null;
  onSignatureChange: (sig: string | null) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-slate-800 mb-4">Review Your Request</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="col-span-2 pb-4 border-b border-slate-200">
            <p className="text-slate-500">Vendor</p>
            <p className="font-medium text-slate-800">{formData.vendor_name}</p>
            {formData.vendor_location && (
              <p className="text-slate-600">{formData.vendor_location}</p>
            )}
          </div>
          <div>
            <p className="text-slate-500">Total Amount</p>
            <p className="font-semibold text-lg text-slate-800">${totalAmount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-slate-500">Category</p>
            <p className="font-medium text-slate-800">{formData.category}</p>
          </div>
          <div className="col-span-2">
            <p className="text-slate-500">Business Purpose</p>
            <p className="font-medium text-slate-800">{formData.business_purpose}</p>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-200">
        <h3 className="text-lg font-medium text-slate-800 mb-2">Employee Certification</h3>
        <div className="p-4 bg-slate-50 rounded-xl text-sm text-slate-600 italic mb-6">
          <p className="mb-4">
            I certify that the above purchase is for valid business purposes and complies with
            Company policies. I understand that purchases over $500 must normally be processed
            through the Purchase Order process, and that exceptions require additional approval based
            on amount.
          </p>
          <p>
            I further understand that non-compliance with this process, including failure to obtain
            approval or submit the completed form and documentation with the P-Card expense report,
            may result in suspension or termination of P-Card privileges.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-4">Employee Signature</label>
          <SignaturePad onSignatureChange={onSignatureChange} initialSignature={signature} />
        </div>
      </div>
    </div>
  );
}
