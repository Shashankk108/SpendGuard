import { utils, write } from 'xlsx';
import { supabase } from '../lib/supabase';

interface SheetData {
  name: string;
  data: Record<string, string | number | boolean>[];
}

export async function exportMasterSpreadsheet(): Promise<void> {
  const sheets: SheetData[] = [];

  const { data: requests } = await supabase
    .from('purchase_requests')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*');

  const { data: signatures } = await supabase
    .from('approval_signatures')
    .select('*')
    .order('signed_at', { ascending: true });

  const { data: approvers } = await supabase
    .from('approvers')
    .select('*');

  const { data: budgets } = await supabase
    .from('budgets')
    .select('*');

  const { data: receipts } = await supabase
    .from('purchase_receipts')
    .select('*')
    .order('created_at', { ascending: false });

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

  const signatureMap = new Map<string, any[]>();
  signatures?.forEach(s => {
    const existing = signatureMap.get(s.request_id) || [];
    existing.push(s);
    signatureMap.set(s.request_id, existing);
  });

  const receiptMap = new Map<string, any[]>();
  receipts?.forEach(r => {
    const existing = receiptMap.get(r.request_id) || [];
    existing.push(r);
    receiptMap.set(r.request_id, existing);
  });

  if (requests) {
    sheets.push({
      name: 'All Requests',
      data: requests.map(r => {
        const profile = profileMap.get(r.requester_id);
        const requestSignatures = signatureMap.get(r.id) || [];
        const approvalSignature = requestSignatures.find(s => s.action === 'approved');
        const rejectionSignature = requestSignatures.find(s => s.action === 'rejected');
        const requestReceipts = receiptMap.get(r.id) || [];
        const currentReceipt = requestReceipts.find(rec => rec.is_current);

        const createdDate = new Date(r.created_at);
        const approvedDate = approvalSignature ? new Date(approvalSignature.signed_at) : null;
        const turnaroundDays = approvedDate ? Math.ceil((approvedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)) : '-';

        return {
          'Request ID': r.id.substring(0, 8).toUpperCase(),
          'Full Request ID': r.id,
          'Status': r.status,
          'Vendor Name': r.vendor_name,
          'Category': r.category,
          'Requestor Name': r.cardholder_name,
          'P-Card Name': r.p_card_name,
          'Employee Name': profile?.full_name || '-',
          'Employee Email': profile?.email || '-',
          'Department': profile?.department || '-',
          'Purchase Amount': r.purchase_amount,
          'Tax': r.tax_amount || 0,
          'Shipping': r.shipping_amount || 0,
          'Total Amount': r.total_amount,
          'Currency': r.currency || 'USD',
          'Business Purpose': r.business_purpose,
          'Description': r.detailed_description || '',
          'Expense/Order Date': new Date(r.expense_date).toLocaleDateString(),
          'Request Created Date': createdDate.toLocaleDateString(),
          'Request Created Time': createdDate.toLocaleTimeString(),
          'Last Updated Date': new Date(r.updated_at).toLocaleDateString(),
          'Last Updated Time': new Date(r.updated_at).toLocaleTimeString(),
          'Employee Signed Date': r.employee_signed_at ? new Date(r.employee_signed_at).toLocaleDateString() : '-',
          'Approval Date': approvedDate ? approvedDate.toLocaleDateString() : '-',
          'Approval Time': approvedDate ? approvedDate.toLocaleTimeString() : '-',
          'Approved By': approvalSignature?.approver_name || '-',
          'Approver Title': approvalSignature?.approver_title || '-',
          'Rejection Date': rejectionSignature ? new Date(rejectionSignature.signed_at).toLocaleDateString() : '-',
          'Rejected By': rejectionSignature?.approver_name || '-',
          'Rejection Reason': r.rejection_reason || '-',
          'Turnaround Days': turnaroundDays,
          'Receipt Status': currentReceipt ? currentReceipt.status : (r.status === 'approved' ? 'Not Uploaded' : '-'),
          'Receipt Upload Date': currentReceipt ? new Date(currentReceipt.created_at).toLocaleDateString() : '-',
          'Receipt Version': currentReceipt?.version || '-',
          'Preferred Vendor': r.is_preferred_vendor ? 'Yes' : 'No',
          'Software Subscription': r.is_software_subscription ? 'Yes' : 'No',
          'IT License Confirmed': r.it_license_confirmed ? 'Yes' : 'No',
          'PO Bypass Reason': r.po_bypass_reason || '-',
          'PO Bypass Explanation': r.po_bypass_explanation || '-',
          'Vendor Location': r.vendor_location || '-',
        };
      }),
    });
  }

  if (profiles) {
    sheets.push({
      name: 'Employees',
      data: profiles.map(p => ({
        'Employee ID': p.id.substring(0, 8).toUpperCase(),
        'Full Name': p.full_name || '',
        'Email': p.email,
        'Department': p.department || '-',
        'Role': p.role || 'employee',
        'P-Card Name': p.p_card_name || '-',
        'Created Date': new Date(p.created_at).toLocaleDateString(),
      })),
    });
  }

  if (requests) {
    const vendorList: { name: string; count: number; totalSpend: number; isPreferred: boolean; categories: Set<string> }[] = [];
    requests.filter(r => r.status === 'approved').forEach(r => {
      const existing = vendorList.find(v => v.name.toLowerCase() === r.vendor_name.toLowerCase());
      if (existing) {
        existing.count++;
        existing.totalSpend += r.total_amount;
        existing.categories.add(r.category);
      } else {
        vendorList.push({
          name: r.vendor_name,
          count: 1,
          totalSpend: r.total_amount,
          isPreferred: r.is_preferred_vendor,
          categories: new Set([r.category]),
        });
      }
    });

    sheets.push({
      name: 'Vendors',
      data: vendorList.sort((a, b) => b.totalSpend - a.totalSpend).map(v => ({
        'Vendor Name': v.name,
        'Total Orders': v.count,
        'Total Spend': v.totalSpend,
        'Avg Order Value': Math.round((v.totalSpend / v.count) * 100) / 100,
        'Preferred Vendor': v.isPreferred ? 'Yes' : 'No',
        'Categories': Array.from(v.categories).join(', '),
      })),
    });
  }

  if (requests) {
    const categoryMap = new Map<string, { count: number; totalSpend: number; approved: number; rejected: number; pending: number }>();
    requests.forEach(r => {
      const existing = categoryMap.get(r.category) || { count: 0, totalSpend: 0, approved: 0, rejected: 0, pending: 0 };
      existing.count++;
      if (r.status === 'approved') {
        existing.totalSpend += r.total_amount;
        existing.approved++;
      } else if (r.status === 'rejected') {
        existing.rejected++;
      } else if (r.status === 'pending') {
        existing.pending++;
      }
      categoryMap.set(r.category, existing);
    });

    sheets.push({
      name: 'Categories',
      data: Array.from(categoryMap.entries())
        .sort((a, b) => b[1].totalSpend - a[1].totalSpend)
        .map(([name, data]) => ({
          'Category': name,
          'Total Requests': data.count,
          'Approved': data.approved,
          'Rejected': data.rejected,
          'Pending': data.pending,
          'Total Spend': data.totalSpend,
          'Approval Rate': `${Math.round((data.approved / (data.approved + data.rejected || 1)) * 100)}%`,
        })),
    });
  }

  if (signatures && requests) {
    const requestMap = new Map(requests.map(r => [r.id, r]));
    sheets.push({
      name: 'Approval History',
      data: signatures.map(s => {
        const request = requestMap.get(s.request_id);
        return {
          'Request ID': s.request_id.substring(0, 8).toUpperCase(),
          'Full Request ID': s.request_id,
          'Vendor': request?.vendor_name || '-',
          'Amount': request?.total_amount || 0,
          'Approver Name': s.approver_name,
          'Approver Title': s.approver_title,
          'Action': s.action.charAt(0).toUpperCase() + s.action.slice(1),
          'Comments': s.comments || '-',
          'Signed Date': new Date(s.signed_at).toLocaleDateString(),
          'Signed Time': new Date(s.signed_at).toLocaleTimeString(),
          'Full Timestamp': new Date(s.signed_at).toISOString(),
        };
      }),
    });
  }

  if (receipts && requests) {
    const requestMap = new Map(requests.map(r => [r.id, r]));
    sheets.push({
      name: 'Receipt Tracking',
      data: receipts.map(r => {
        const request = requestMap.get(r.request_id);
        const uploader = profileMap.get(r.user_id);
        return {
          'Receipt ID': r.id.substring(0, 8).toUpperCase(),
          'Request ID': r.request_id.substring(0, 8).toUpperCase(),
          'Vendor': request?.vendor_name || '-',
          'Purchase Amount': request?.total_amount || 0,
          'Uploader Name': uploader?.full_name || '-',
          'Uploader Email': uploader?.email || '-',
          'Department': uploader?.department || '-',
          'Upload Date': new Date(r.created_at).toLocaleDateString(),
          'Upload Time': new Date(r.created_at).toLocaleTimeString(),
          'File Name': r.file_name,
          'File Type': r.file_type || '-',
          'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1),
          'Version': r.version || 1,
          'Is Current': r.is_current ? 'Yes' : 'No',
          'Re-upload Requested': r.reupload_requested ? 'Yes' : 'No',
          'Re-upload Requested Date': r.reupload_requested_at ? new Date(r.reupload_requested_at).toLocaleDateString() : '-',
          'Re-upload Reason': r.reupload_reason || '-',
          'AI Verification Status': r.ai_verification_status || '-',
          'AI Confidence Score': r.ai_confidence_score !== null ? `${r.ai_confidence_score}%` : '-',
          'Employee Comment': r.employee_comment || '-',
          'Notes': r.notes || '-',
        };
      }),
    });
  }

  if (approvers) {
    sheets.push({
      name: 'Approvers',
      data: approvers.map(a => ({
        'Name': a.name,
        'Email': a.email,
        'Tier': a.tier,
        'Min Amount': a.min_amount || 0,
        'Max Amount': a.max_amount || 'Unlimited',
        'Status': a.is_active ? 'Active' : 'Inactive',
      })),
    });
  }

  if (budgets) {
    sheets.push({
      name: 'Budgets',
      data: budgets.map(b => ({
        'Department': b.department,
        'Fiscal Year': b.fiscal_year,
        'Total Budget': b.total_budget,
        'Spent Amount': b.spent_amount,
        'Remaining': b.total_budget - b.spent_amount,
        'Utilization': `${Math.round((b.spent_amount / b.total_budget) * 100)}%`,
      })),
    });
  }

  if (requests && profiles) {
    const empStats = new Map<string, { name: string; email: string; department: string; totalSpend: number; count: number; approved: number; rejected: number; pending: number }>();

    requests.forEach(r => {
      const profile = profileMap.get(r.requester_id);
      const key = r.requester_id;
      const existing = empStats.get(key) || {
        name: profile?.full_name || r.cardholder_name,
        email: profile?.email || '',
        department: profile?.department || '-',
        totalSpend: 0,
        count: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
      };
      existing.count++;
      if (r.status === 'approved') {
        existing.totalSpend += r.total_amount;
        existing.approved++;
      } else if (r.status === 'rejected') {
        existing.rejected++;
      } else if (r.status === 'pending') {
        existing.pending++;
      }
      empStats.set(key, existing);
    });

    sheets.push({
      name: 'Employee Spending',
      data: Array.from(empStats.values())
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .map(e => ({
          'Employee': e.name,
          'Email': e.email,
          'Department': e.department,
          'Total Requests': e.count,
          'Approved': e.approved,
          'Rejected': e.rejected,
          'Pending': e.pending,
          'Total Spend': e.totalSpend,
          'Avg Amount': e.approved > 0 ? Math.round((e.totalSpend / e.approved) * 100) / 100 : 0,
          'Approval Rate': `${Math.round((e.approved / (e.approved + e.rejected || 1)) * 100)}%`,
        })),
    });
  }

  if (requests) {
    const monthlyData = new Map<string, { month: string; totalSpend: number; count: number; approved: number; rejected: number; pending: number }>();

    requests.forEach(r => {
      const date = new Date(r.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

      const existing = monthlyData.get(monthKey) || { month: monthName, totalSpend: 0, count: 0, approved: 0, rejected: 0, pending: 0 };
      existing.count++;
      if (r.status === 'approved') {
        existing.totalSpend += r.total_amount;
        existing.approved++;
      } else if (r.status === 'rejected') {
        existing.rejected++;
      } else if (r.status === 'pending') {
        existing.pending++;
      }
      monthlyData.set(monthKey, existing);
    });

    sheets.push({
      name: 'Monthly Summary',
      data: Array.from(monthlyData.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, data]) => ({
          'Month': data.month,
          'Total Requests': data.count,
          'Approved': data.approved,
          'Rejected': data.rejected,
          'Pending': data.pending,
          'Total Approved Spend': data.totalSpend,
          'Avg Order Value': data.approved > 0 ? Math.round((data.totalSpend / data.approved) * 100) / 100 : 0,
          'Approval Rate': data.approved + data.rejected > 0 ? `${Math.round((data.approved / (data.approved + data.rejected)) * 100)}%` : '-',
        })),
    });
  }

  if (requests && signatures) {
    const turnaroundData: { range: string; count: number; avgAmount: number; totalAmount: number }[] = [
      { range: 'Same Day', count: 0, avgAmount: 0, totalAmount: 0 },
      { range: '1-2 Days', count: 0, avgAmount: 0, totalAmount: 0 },
      { range: '3-5 Days', count: 0, avgAmount: 0, totalAmount: 0 },
      { range: '6-10 Days', count: 0, avgAmount: 0, totalAmount: 0 },
      { range: '11+ Days', count: 0, avgAmount: 0, totalAmount: 0 },
    ];

    requests.filter(r => r.status === 'approved').forEach(r => {
      const requestSignatures = signatureMap.get(r.id) || [];
      const approvalSignature = requestSignatures.find(s => s.action === 'approved');
      if (!approvalSignature) return;

      const createdDate = new Date(r.created_at);
      const approvedDate = new Date(approvalSignature.signed_at);
      const days = Math.ceil((approvedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

      let bucket: number;
      if (days <= 0) bucket = 0;
      else if (days <= 2) bucket = 1;
      else if (days <= 5) bucket = 2;
      else if (days <= 10) bucket = 3;
      else bucket = 4;

      turnaroundData[bucket].count++;
      turnaroundData[bucket].totalAmount += r.total_amount;
    });

    turnaroundData.forEach(d => {
      d.avgAmount = d.count > 0 ? Math.round((d.totalAmount / d.count) * 100) / 100 : 0;
    });

    sheets.push({
      name: 'Processing Times',
      data: turnaroundData.map(d => ({
        'Turnaround Time': d.range,
        'Number of Requests': d.count,
        'Total Amount': d.totalAmount,
        'Avg Amount': d.avgAmount,
        'Percentage': `${Math.round((d.count / turnaroundData.reduce((sum, x) => sum + x.count, 0) || 1) * 100)}%`,
      })),
    });
  }

  const workbook = utils.book_new();

  for (const sheet of sheets) {
    const worksheet = utils.json_to_sheet(sheet.data);

    const colWidths = sheet.data.length > 0
      ? Object.keys(sheet.data[0]).map(key => ({
          wch: Math.max(
            key.length,
            ...sheet.data.map(row => String(row[key] || '').length)
          ) + 2
        }))
      : [];
    worksheet['!cols'] = colWidths;

    utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  const excelBuffer = write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `SpendGuard-Master-Export-${new Date().toISOString().split('T')[0]}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
