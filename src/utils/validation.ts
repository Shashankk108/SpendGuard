export interface ChecklistItem {
  id: string;
  question: string;
  status: 'pass' | 'fail' | 'warning' | 'pending';
  message?: string;
  required: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  checklist: ChecklistItem[];
  requiredApprovers: RequiredApprover[];
}

export interface RequiredApprover {
  name: string;
  title: string;
  email: string;
  order: number;
}

export interface FormData {
  total_amount: number;
  category: string;
  is_software_subscription: boolean;
  it_license_confirmed: boolean;
  is_preferred_vendor: boolean;
  po_bypass_reason: string | null;
  po_bypass_explanation: string | null;
}

const PROHIBITED_CATEGORIES = [
  'Technology Hardware',
  'Travel - Air',
  'Travel - Rail',
  'Gift Cards',
];

export function validatePurchaseRequest(data: FormData): ValidationResult {
  const checklist: ChecklistItem[] = [];
  const requiredApprovers: RequiredApprover[] = [];

  checklist.push({
    id: 'amount_under_500',
    question: 'Is the total amount, including tax and shipping, $500 or less?',
    status: data.total_amount <= 500 ? 'pass' : 'warning',
    message:
      data.total_amount <= 500
        ? 'Amount is within the standard limit'
        : 'Amount exceeds $500, approval required before charging',
    required: false,
  });

  if (data.total_amount > 500) {
    checklist.push({
      id: 'po_ruled_out',
      question:
        'Has the Purchase Order (PO) system been ruled out due to vendor or system limitations?',
      status: data.po_bypass_reason ? 'pass' : 'fail',
      message: data.po_bypass_reason
        ? `PO bypassed: ${formatBypassReason(data.po_bypass_reason)}`
        : 'You must provide a reason for not using the PO system',
      required: true,
    });
  }

  checklist.push({
    id: 'not_split_transaction',
    question:
      'Is this a single, complete purchase rather than a "split" transaction designed to stay under the $500 limit?',
    status: 'pass',
    message: 'This is a single complete purchase',
    required: true,
  });

  const isProhibited = PROHIBITED_CATEGORIES.includes(data.category);
  checklist.push({
    id: 'not_prohibited',
    question:
      'Is the item a prohibited category, such as technology hardware (laptops/phones), travel (air/rail), or a gift card?',
    status: isProhibited ? 'fail' : 'pass',
    message: isProhibited
      ? `"${data.category}" is a prohibited category and cannot be purchased on P-Card`
      : 'Category is allowed',
    required: true,
  });

  if (data.is_software_subscription && data.total_amount <= 500) {
    checklist.push({
      id: 'software_license_check',
      question:
        'If this is a software subscription under $500, have you confirmed with the IT Business Partner or Procurement that an enterprise license doesn\'t already exist?',
      status: data.it_license_confirmed ? 'pass' : 'warning',
      message: data.it_license_confirmed
        ? 'Confirmed no enterprise license exists'
        : 'Please confirm with IT that an enterprise license is not available',
      required: false,
    });
  }

  if (data.total_amount >= 501 && data.total_amount <= 1499) {
    requiredApprovers.push({
      name: 'Merrill Raman',
      title: 'Department Head',
      email: 'merrill.raman@company.com',
      order: 1,
    });
    checklist.push({
      id: 'approval_501_1499',
      question:
        'If the purchase is between $501 and $1,499, do you have a signed Exception Approval Form from Merrill Raman?',
      status: 'pending',
      message: 'Requires approval from Merrill Raman (Department Head)',
      required: true,
    });
  }

  if (data.total_amount >= 1500) {
    requiredApprovers.push({
      name: 'Merrill Raman',
      title: 'Department Head',
      email: 'merrill.raman@company.com',
      order: 1,
    });
    requiredApprovers.push({
      name: 'Ryan Greene',
      title: 'Finance Director',
      email: 'ryan.greene@company.com',
      order: 2,
    });

    if (data.total_amount > 100000) {
      requiredApprovers.push({
        name: 'CEO',
        title: 'Chief Executive Officer',
        email: 'ceo@company.com',
        order: 3,
      });
    }

    checklist.push({
      id: 'approval_1500_plus',
      question:
        'If the purchase is $1,500 or higher, do you have the additional required signatures from Ryan Greene (and potentially the CEO if over $100k)?',
      status: 'pending',
      message:
        data.total_amount > 100000
          ? 'Requires approval from Merrill Raman, Ryan Greene, and CEO'
          : 'Requires approval from Merrill Raman and Ryan Greene',
      required: true,
    });
  }

  checklist.push({
    id: 'preferred_vendor',
    question:
      'Are you using a preferred vendor to ensure the company is getting competitive pricing?',
    status: data.is_preferred_vendor ? 'pass' : 'warning',
    message: data.is_preferred_vendor
      ? 'Using a preferred vendor'
      : 'Consider using a preferred vendor for better pricing',
    required: false,
  });

  const hasFailures = checklist.some((item) => item.status === 'fail' && item.required);
  const isValid = !hasFailures;

  return {
    isValid,
    checklist,
    requiredApprovers,
  };
}

function formatBypassReason(reason: string): string {
  switch (reason) {
    case 'vendor_limitations':
      return 'Vendor does not accept POs or does not have wire capabilities';
    case 'time_sensitivity':
      return 'Purchase required immediately';
    case 'other':
      return 'Other reason (see explanation)';
    default:
      return reason;
  }
}

export function getApprovalTier(amount: number): string {
  if (amount <= 500) return 'No approval required';
  if (amount <= 1499) return '$501 - $1,499: Merrill Raman only';
  if (amount <= 5000) return '$1,500 - $5,000: Merrill Raman + Ryan Greene';
  if (amount <= 100000) return '$5,001 - $100,000: Merrill Raman + Ryan Greene';
  return 'Over $100,000: Merrill Raman + Ryan Greene + CEO';
}
