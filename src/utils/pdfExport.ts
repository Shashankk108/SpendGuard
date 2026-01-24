import jsPDF from 'jspdf';
import type { PurchaseRequest, ApprovalSignature } from '../types/database';

interface ExportData {
  request: PurchaseRequest;
  signatures: ApprovalSignature[];
  requesterName?: string;
  requesterDepartment?: string;
}

export async function exportRequestToPDF(data: ExportData): Promise<void> {
  const { request, signatures, requesterName, requesterDepartment } = data;
  const doc = new jsPDF();

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const primaryColor: [number, number, number] = [16, 185, 129];
  const textColor: [number, number, number] = [30, 41, 59];
  const lightGray: [number, number, number] = [100, 116, 139];

  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, 50, 'F');

  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 4, 'F');

  doc.setTextColor(...primaryColor);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('SpendGuard', margin, y + 8);

  doc.setTextColor(...lightGray);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('P-Card Pre-Approval System', margin, y + 16);

  const statusColors: Record<string, [number, number, number]> = {
    approved: [16, 185, 129],
    rejected: [239, 68, 68],
    pending: [245, 158, 11],
    draft: [100, 116, 139],
  };
  const statusColor = statusColors[request.status] || statusColors.draft;

  doc.setFillColor(...statusColor);
  const statusText = request.status.toUpperCase();
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const statusWidth = doc.getTextWidth(statusText) + 16;
  doc.roundedRect(pageWidth - margin - statusWidth, y, statusWidth, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(statusText, pageWidth - margin - statusWidth + 8, y + 7);

  y = 60;

  doc.setTextColor(...textColor);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Purchase Request', margin, y);

  doc.setTextColor(...lightGray);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const requestId = request.id.substring(0, 8).toUpperCase();
  doc.text(`Request ID: ${requestId}`, margin, y + 8);

  y += 20;

  doc.setFillColor(...primaryColor);
  doc.rect(pageWidth - margin - 60, y - 5, 60, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('TOTAL AMOUNT', pageWidth - margin - 55, y + 2);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${request.total_amount.toLocaleString()}`, pageWidth - margin - 55, y + 12);

  y += 25;

  function drawSectionHeader(title: string) {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setTextColor(...primaryColor);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 4, y + 6);
    y += 14;
  }

  function drawLabelValue(label: string, value: string, halfWidth = false, isSecond = false) {
    const xPos = isSecond ? margin + contentWidth / 2 : margin;
    const width = halfWidth ? contentWidth / 2 - 5 : contentWidth;

    doc.setTextColor(...lightGray);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(label, xPos, y);

    doc.setTextColor(...textColor);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const lines = doc.splitTextToSize(value, width);
    doc.text(lines, xPos, y + 5);

    if (!isSecond) {
      y += 5 + lines.length * 5;
    }
  }

  drawSectionHeader('Requester Information');

  drawLabelValue('Requestor Name', request.cardholder_name, true);
  drawLabelValue('P-Card Name', request.p_card_name, true, true);
  y += 6;

  drawLabelValue('Department', requesterDepartment || '-', true);
  drawLabelValue('Expense Date', new Date(request.expense_date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }), true, true);
  y += 6;

  drawSectionHeader('Vendor Details');

  drawLabelValue('Vendor Name', request.vendor_name, true);
  drawLabelValue('Category', request.category, true, true);
  y += 6;

  if (request.vendor_location) {
    drawLabelValue('Vendor Location', request.vendor_location);
  }

  drawSectionHeader('Purchase Details');

  const amounts = [
    ['Purchase Amount', `$${request.purchase_amount.toLocaleString()}`],
    ['Tax', `$${(request.tax_amount || 0).toLocaleString()}`],
    ['Shipping', `$${(request.shipping_amount || 0).toLocaleString()}`],
  ];

  amounts.forEach(([label, value]) => {
    doc.setTextColor(...lightGray);
    doc.setFontSize(9);
    doc.text(label, margin, y);
    doc.setTextColor(...textColor);
    doc.setFontSize(10);
    doc.text(value, margin + 60, y);
    y += 6;
  });

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, margin + 100, y);
  y += 4;

  doc.setTextColor(...textColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Total', margin, y);
  doc.text(`$${request.total_amount.toLocaleString()}`, margin + 60, y);
  doc.setFont('helvetica', 'normal');
  y += 10;

  drawSectionHeader('Business Justification');

  drawLabelValue('Purpose', request.business_purpose);
  drawLabelValue('Description', request.detailed_description);

  if (request.po_bypass_reason) {
    y += 4;
    doc.setFillColor(254, 243, 199);
    doc.rect(margin, y - 2, contentWidth, 20, 'F');

    doc.setTextColor(146, 64, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('PO Bypass Reason:', margin + 4, y + 4);
    doc.setFont('helvetica', 'normal');

    const bypassText = request.po_bypass_reason === 'vendor_limitations'
      ? 'Vendor does not accept POs'
      : request.po_bypass_reason === 'time_sensitivity'
      ? 'Purchase required immediately'
      : 'Other';
    doc.text(bypassText, margin + 4, y + 10);

    if (request.po_bypass_explanation) {
      doc.text(request.po_bypass_explanation, margin + 4, y + 16);
    }
    y += 26;
  }

  if (y > 220) {
    doc.addPage();
    y = 20;
  }

  drawSectionHeader('Signatures');

  if (request.employee_signature_url) {
    doc.setTextColor(...lightGray);
    doc.setFontSize(9);
    doc.text('Employee Signature:', margin, y);
    y += 4;

    try {
      doc.addImage(request.employee_signature_url, 'PNG', margin, y, 60, 20);
      y += 22;
    } catch {
      y += 4;
    }

    doc.setTextColor(...textColor);
    doc.setFontSize(9);
    doc.text(request.cardholder_name, margin, y);
    doc.setTextColor(...lightGray);
    doc.setFontSize(8);
    if (request.employee_signed_at) {
      doc.text(`Signed: ${new Date(request.employee_signed_at).toLocaleString()}`, margin, y + 5);
    }
    y += 15;
  }

  if (signatures.length > 0) {
    for (const sig of signatures) {
      if (y > 220) {
        doc.addPage();
        y = 20;
      }

      const sigBgColor: [number, number, number] = sig.action === 'approved'
        ? [236, 253, 245]
        : [254, 242, 242];
      const sigTextColor: [number, number, number] = sig.action === 'approved'
        ? [6, 95, 70]
        : [153, 27, 27];
      const sigBorderColor: [number, number, number] = sig.action === 'approved'
        ? [167, 243, 208]
        : [254, 202, 202];

      doc.setFillColor(...sigBgColor);
      doc.roundedRect(margin, y, contentWidth, 55, 3, 3, 'F');
      doc.setDrawColor(...sigBorderColor);
      doc.roundedRect(margin, y, contentWidth, 55, 3, 3, 'S');

      doc.setTextColor(...sigTextColor);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`${sig.action === 'approved' ? 'APPROVED' : 'REJECTED'} by`, margin + 6, y + 8);

      doc.setTextColor(...textColor);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(sig.approver_name, margin + 6, y + 16);

      doc.setTextColor(...lightGray);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(sig.approver_title, margin + 6, y + 23);

      if (sig.signature_url) {
        try {
          doc.addImage(sig.signature_url, 'PNG', margin + 6, y + 28, 70, 20);
        } catch {
        }
      }

      doc.setTextColor(...lightGray);
      doc.setFontSize(8);
      doc.text(`Signed: ${new Date(sig.signed_at).toLocaleString()}`, margin + 6, y + 52);

      if (sig.comments) {
        doc.setTextColor(...textColor);
        doc.setFontSize(9);
        const commentLines = doc.splitTextToSize(`Comments: ${sig.comments}`, contentWidth / 2 - 10);
        doc.text(commentLines, margin + contentWidth / 2, y + 16);
      }

      y += 62;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, doc.internal.pageSize.getHeight() - 15, pageWidth - margin, doc.internal.pageSize.getHeight() - 15);

    doc.setTextColor(...lightGray);
    doc.setFontSize(8);
    doc.text(
      `Generated on ${new Date().toLocaleString()} | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  const filename = `SpendGuard-Request-${requestId}-${request.vendor_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(filename);
}
