import { useState } from 'react';
import {
  Check,
  X,
  Clock,
  FileText,
  Send,
  UserCheck,
  Receipt,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
} from 'lucide-react';

export interface JourneyStep {
  id: string;
  label: string;
  status: 'completed' | 'current' | 'pending' | 'failed';
  timestamp?: string;
  details?: StepDetail[];
}

export interface StepDetail {
  label: string;
  value: string;
  icon?: React.ReactNode;
  imageUrl?: string;
}

interface OrderJourneyProps {
  steps: JourneyStep[];
  onStepClick?: (step: JourneyStep) => void;
  compact?: boolean;
}

const stepIcons: Record<string, React.ReactNode> = {
  submitted: <Send className="w-4 h-4" />,
  pending: <Clock className="w-4 h-4" />,
  approved: <UserCheck className="w-4 h-4" />,
  rejected: <X className="w-4 h-4" />,
  receipt: <Receipt className="w-4 h-4" />,
  verified: <FileText className="w-4 h-4" />,
  complete: <CheckCircle2 className="w-4 h-4" />,
  godaddy: <Globe className="w-4 h-4" />,
};

export default function OrderJourney({ steps, onStepClick, compact = false }: OrderJourneyProps) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const handleStepClick = (step: JourneyStep) => {
    if (step.status === 'completed' || step.status === 'failed') {
      setExpandedStep(expandedStep === step.id ? null : step.id);
      onStepClick?.(step);
    }
  };

  const getStepStyles = (status: JourneyStep['status']) => {
    switch (status) {
      case 'completed':
        return {
          circle: 'bg-emerald-500 border-emerald-500 text-white',
          line: 'bg-emerald-500',
          label: 'text-emerald-700 font-medium',
        };
      case 'current':
        return {
          circle: 'bg-white border-teal-500 text-teal-600 ring-4 ring-teal-100 animate-pulse',
          line: 'bg-slate-200',
          label: 'text-teal-700 font-semibold',
        };
      case 'failed':
        return {
          circle: 'bg-red-500 border-red-500 text-white',
          line: 'bg-red-300',
          label: 'text-red-700 font-medium',
        };
      default:
        return {
          circle: 'bg-white border-slate-300 text-slate-400 border-dashed',
          line: 'bg-slate-200',
          label: 'text-slate-400',
        };
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {steps.map((step, index) => {
          const styles = getStepStyles(step.status);
          return (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full border ${styles.circle} ${
                  step.status === 'current' ? 'ring-2 ring-teal-100' : ''
                }`}
                title={`${step.label}${step.timestamp ? ` - ${formatTimestamp(step.timestamp)}` : ''}`}
              />
              {index < steps.length - 1 && (
                <div className={`w-3 h-0.5 ${styles.line}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="hidden md:flex items-start justify-between relative">
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-slate-200 -z-10" />

        {steps.map((step, index) => {
          const styles = getStepStyles(step.status);
          const isExpanded = expandedStep === step.id;
          const isClickable = step.status === 'completed' || step.status === 'failed';

          return (
            <div key={step.id} className="flex flex-col items-center relative flex-1">
              {index > 0 && (
                <div
                  className={`absolute top-5 right-1/2 h-0.5 w-full -z-10 transition-colors duration-500 ${
                    steps[index - 1].status === 'completed' ? 'bg-emerald-500' :
                    steps[index - 1].status === 'failed' ? 'bg-red-300' : 'bg-slate-200'
                  }`}
                />
              )}

              <button
                onClick={() => handleStepClick(step)}
                disabled={!isClickable}
                className={`
                  w-10 h-10 rounded-full border-2 flex items-center justify-center
                  transition-all duration-300 ${styles.circle}
                  ${isClickable ? 'cursor-pointer hover:scale-110 hover:shadow-lg' : 'cursor-default'}
                `}
              >
                {step.status === 'completed' ? (
                  <Check className="w-5 h-5" />
                ) : step.status === 'failed' ? (
                  <X className="w-5 h-5" />
                ) : (
                  stepIcons[step.id] || <Clock className="w-4 h-4" />
                )}
              </button>

              <div className="mt-3 text-center">
                <p className={`text-xs ${styles.label} flex items-center gap-1`}>
                  {step.label}
                  {isClickable && step.details && step.details.length > 0 && (
                    isExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )
                  )}
                </p>
                {step.timestamp && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {formatTimestamp(step.timestamp)}
                  </p>
                )}
              </div>

              {isExpanded && step.details && step.details.length > 0 && (
                <div className="absolute top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 p-3 z-20 animate-fadeIn">
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-l border-t border-slate-200 rotate-45" />
                  <div className="space-y-2">
                    {step.details.map((detail, idx) => (
                      <div key={idx} className="text-xs">
                        <p className="text-slate-500 flex items-center gap-1">
                          {detail.icon}
                          {detail.label}
                        </p>
                        {detail.imageUrl ? (
                          <img
                            src={detail.imageUrl}
                            alt={detail.label}
                            className="h-12 mt-1 rounded bg-slate-50"
                          />
                        ) : (
                          <p className="font-medium text-slate-700 mt-0.5">{detail.value}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="md:hidden space-y-0">
        {steps.map((step, index) => {
          const styles = getStepStyles(step.status);
          const isExpanded = expandedStep === step.id;
          const isClickable = step.status === 'completed' || step.status === 'failed';
          const isLast = index === steps.length - 1;

          return (
            <div key={step.id} className="flex">
              <div className="flex flex-col items-center mr-4">
                <button
                  onClick={() => handleStepClick(step)}
                  disabled={!isClickable}
                  className={`
                    w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0
                    transition-all duration-300 ${styles.circle}
                    ${isClickable ? 'cursor-pointer active:scale-95' : 'cursor-default'}
                  `}
                >
                  {step.status === 'completed' ? (
                    <Check className="w-4 h-4" />
                  ) : step.status === 'failed' ? (
                    <X className="w-4 h-4" />
                  ) : (
                    stepIcons[step.id] || <Clock className="w-3.5 h-3.5" />
                  )}
                </button>
                {!isLast && (
                  <div
                    className={`w-0.5 flex-1 min-h-[24px] transition-colors duration-500 ${
                      step.status === 'completed' ? 'bg-emerald-500' :
                      step.status === 'failed' ? 'bg-red-300' : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>

              <div className={`flex-1 ${!isLast ? 'pb-4' : ''}`}>
                <div className="flex items-center gap-2">
                  <p className={`text-sm ${styles.label}`}>{step.label}</p>
                  {isClickable && step.details && step.details.length > 0 && (
                    isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )
                  )}
                </div>
                {step.timestamp && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {formatTimestamp(step.timestamp)}
                  </p>
                )}

                {isExpanded && step.details && step.details.length > 0 && (
                  <div className="mt-2 bg-slate-50 rounded-lg p-3 space-y-2 animate-fadeIn">
                    {step.details.map((detail, idx) => (
                      <div key={idx} className="text-xs">
                        <p className="text-slate-500 flex items-center gap-1">
                          {detail.icon}
                          {detail.label}
                        </p>
                        {detail.imageUrl ? (
                          <img
                            src={detail.imageUrl}
                            alt={detail.label}
                            className="h-12 mt-1 rounded bg-white"
                          />
                        ) : (
                          <p className="font-medium text-slate-700 mt-0.5">{detail.value}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function calculateJourneySteps(
  request: {
    status: string;
    employee_signature_url?: string | null;
    employee_signed_at?: string | null;
    created_at: string;
    rejection_reason?: string | null;
  },
  signatures: Array<{
    approver_name: string;
    approver_title: string;
    signature_url?: string | null;
    action: string;
    signed_at: string;
    comments?: string | null;
  }>,
  receipts: Array<{
    id: string;
    file_name: string;
    status: string;
    uploaded_at: string;
    notes?: string | null;
  }>,
  godaddyOrderId?: string | null
): JourneyStep[] {
  const steps: JourneyStep[] = [];
  const isRejected = request.status === 'rejected';
  const isApproved = request.status === 'approved';
  const approvalSignature = signatures.find(s => s.action === 'approved');
  const rejectionSignature = signatures.find(s => s.action === 'rejected');
  const hasReceipt = receipts.length > 0;
  const receiptApproved = receipts.some(r => r.status === 'approved');
  const latestReceipt = receipts[0];

  steps.push({
    id: 'submitted',
    label: 'Submitted',
    status: 'completed',
    timestamp: request.employee_signed_at || request.created_at,
    details: request.employee_signature_url ? [
      { label: 'Employee Signature', value: 'Signed', imageUrl: request.employee_signature_url },
    ] : undefined,
  });

  if (isRejected) {
    steps.push({
      id: 'approved',
      label: 'Rejected',
      status: 'failed',
      timestamp: rejectionSignature?.signed_at,
      details: rejectionSignature ? [
        { label: 'Reviewed By', value: rejectionSignature.approver_name },
        { label: 'Title', value: rejectionSignature.approver_title },
        ...(rejectionSignature.comments ? [{ label: 'Reason', value: rejectionSignature.comments }] : []),
        ...(rejectionSignature.signature_url ? [{ label: 'Signature', value: '', imageUrl: rejectionSignature.signature_url }] : []),
      ] : undefined,
    });

    steps.push({
      id: 'receipt',
      label: 'Receipt',
      status: 'pending',
    });

    steps.push({
      id: 'complete',
      label: 'Complete',
      status: 'pending',
    });

    return steps;
  }

  if (isApproved) {
    steps.push({
      id: 'approved',
      label: 'Approved',
      status: 'completed',
      timestamp: approvalSignature?.signed_at,
      details: approvalSignature ? [
        { label: 'Approved By', value: approvalSignature.approver_name },
        { label: 'Title', value: approvalSignature.approver_title },
        ...(approvalSignature.signature_url ? [{ label: 'Signature', value: '', imageUrl: approvalSignature.signature_url }] : []),
      ] : undefined,
    });

    if (godaddyOrderId) {
      steps.push({
        id: 'godaddy',
        label: 'Order Linked',
        status: 'completed',
        details: [
          { label: 'GoDaddy Order', value: godaddyOrderId },
        ],
      });
    }

    if (hasReceipt) {
      steps.push({
        id: 'receipt',
        label: 'Receipt Uploaded',
        status: 'completed',
        timestamp: latestReceipt.uploaded_at,
        details: [
          { label: 'File', value: latestReceipt.file_name },
          { label: 'Status', value: latestReceipt.status.charAt(0).toUpperCase() + latestReceipt.status.slice(1) },
        ],
      });

      if (receiptApproved) {
        steps.push({
          id: 'complete',
          label: 'Complete',
          status: 'completed',
          timestamp: latestReceipt.uploaded_at,
        });
      } else {
        steps.push({
          id: 'verified',
          label: 'Under Review',
          status: 'current',
        });

        steps.push({
          id: 'complete',
          label: 'Complete',
          status: 'pending',
        });
      }
    } else {
      steps.push({
        id: 'receipt',
        label: 'Upload Receipt',
        status: 'current',
      });

      steps.push({
        id: 'complete',
        label: 'Complete',
        status: 'pending',
      });
    }
  } else {
    steps.push({
      id: 'pending',
      label: 'Pending Approval',
      status: 'current',
    });

    steps.push({
      id: 'receipt',
      label: 'Receipt',
      status: 'pending',
    });

    steps.push({
      id: 'complete',
      label: 'Complete',
      status: 'pending',
    });
  }

  return steps;
}
