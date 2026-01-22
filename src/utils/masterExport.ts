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
    .select('*');

  const { data: approvers } = await supabase
    .from('approvers')
    .select('*');

  const { data: budgets } = await supabase
    .from('budgets')
    .select('*');

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

  if (requests) {
    sheets.push({
      name: 'All Requests',
      data: requests.map(r => {
        const profile = profileMap.get(r.requester_id);
        return {
          'Request ID': r.id.substring(0, 8).toUpperCase(),
          'Created Date': new Date(r.created_at).toLocaleDateString(),
          'Status': r.status,
          'Vendor Name': r.vendor_name,
          'Category': r.category,
          'Cardholder Name': r.cardholder_name,
          'P-Card Name': r.p_card_name,
          'Department': profile?.department || '-',
          'Purchase Amount': r.purchase_amount,
          'Tax': r.tax_amount || 0,
          'Shipping': r.shipping_amount || 0,
          'Total Amount': r.total_amount,
          'Business Purpose': r.business_purpose,
          'Description': r.detailed_description || '',
          'Expense Date': new Date(r.expense_date).toLocaleDateString(),
          'Preferred Vendor': r.is_preferred_vendor ? 'Yes' : 'No',
          'Software Subscription': r.is_software_subscription ? 'Yes' : 'No',
          'PO Bypass Reason': r.po_bypass_reason || '-',
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

  if (signatures) {
    sheets.push({
      name: 'Approval History',
      data: signatures.map(s => ({
        'Request ID': s.request_id.substring(0, 8).toUpperCase(),
        'Approver Name': s.approver_name,
        'Approver Title': s.approver_title,
        'Action': s.action,
        'Comments': s.comments || '-',
        'Signed Date': new Date(s.signed_at).toLocaleString(),
      })),
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
    const monthlyData = new Map<string, { month: string; totalSpend: number; count: number; approved: number }>();

    requests.filter(r => r.status === 'approved').forEach(r => {
      const date = new Date(r.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

      const existing = monthlyData.get(monthKey) || { month: monthName, totalSpend: 0, count: 0, approved: 0 };
      existing.totalSpend += r.total_amount;
      existing.count++;
      existing.approved++;
      monthlyData.set(monthKey, existing);
    });

    sheets.push({
      name: 'Monthly Summary',
      data: Array.from(monthlyData.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, data]) => ({
          'Month': data.month,
          'Total Spend': data.totalSpend,
          'Orders': data.count,
          'Avg Order Value': Math.round((data.totalSpend / data.count) * 100) / 100,
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
