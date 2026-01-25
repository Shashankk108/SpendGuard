import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailPayload {
  to: string;
  toName?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

interface RequestSubmittedPayload {
  requestId: string;
  requesterName: string;
  requesterEmail: string;
  vendorName: string;
  totalAmount: number;
  approverEmails: string[];
}

interface ApprovalActionPayload {
  requestId: string;
  requesterEmail: string;
  requesterName: string;
  vendorName: string;
  totalAmount: number;
  action: "approved" | "rejected";
  approverName: string;
  comments?: string;
  isGodaddy?: boolean;
}

interface GodaddyReceiptPayload {
  requestId: string;
  requesterEmail: string;
  requesterName: string;
  vendorName: string;
  orderId: string;
  totalAmount: number;
}

interface ReceiptReuploadPayload {
  requestId: string;
  requesterEmail: string;
  requesterName: string;
  vendorName: string;
  reason?: string;
  approverName: string;
}

async function sendEmailWithResend(
  to: string,
  subject: string,
  textBody: string,
  htmlBody?: string
): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!resendApiKey) {
    console.log("RESEND_API_KEY not configured - email will be logged only");
    console.log(`Would send to: ${to}, Subject: ${subject}`);
    return { success: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SpendGuard <notifications@spendguard.app>",
        to: [to],
        subject: subject,
        text: textBody,
        html: htmlBody || textBody.replace(/\n/g, "<br>"),
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return { success: false, error: errorData };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

function generateRequestSubmittedEmail(data: RequestSubmittedPayload): { subject: string; text: string; html: string } {
  const subject = `Purchase Request Submitted - ${data.vendorName} ($${data.totalAmount.toLocaleString()})`;

  const text = `
Hi ${data.requesterName},

Your purchase request has been submitted successfully and is now pending approval.

Request Details:
- Vendor: ${data.vendorName}
- Amount: $${data.totalAmount.toLocaleString()}
- Request ID: ${data.requestId}

You will receive a notification when your request has been reviewed.

Best regards,
SpendGuard Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }
    .details { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e2e8f0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .detail-row:last-child { border-bottom: none; }
    .amount { font-size: 24px; font-weight: bold; color: #10b981; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">Purchase Request Submitted</h2>
    </div>
    <div class="content">
      <p>Hi ${data.requesterName},</p>
      <p>Your purchase request has been submitted successfully and is now pending approval.</p>
      <div class="details">
        <div class="detail-row">
          <span>Vendor</span>
          <strong>${data.vendorName}</strong>
        </div>
        <div class="detail-row">
          <span>Amount</span>
          <span class="amount">$${data.totalAmount.toLocaleString()}</span>
        </div>
        <div class="detail-row">
          <span>Request ID</span>
          <span style="font-family: monospace; font-size: 12px;">${data.requestId}</span>
        </div>
      </div>
      <p>You will receive a notification when your request has been reviewed.</p>
      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Best regards,<br>SpendGuard Team</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

function generateApprovalNeededEmail(data: RequestSubmittedPayload, approverEmail: string): { subject: string; text: string; html: string } {
  const subject = `Action Required: Purchase Request from ${data.requesterName} - $${data.totalAmount.toLocaleString()}`;

  const text = `
A new purchase request requires your approval.

Request Details:
- Requester: ${data.requesterName}
- Vendor: ${data.vendorName}
- Amount: $${data.totalAmount.toLocaleString()}
- Request ID: ${data.requestId}

Please log in to SpendGuard to review and approve or reject this request.

Best regards,
SpendGuard Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }
    .details { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e2e8f0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .detail-row:last-child { border-bottom: none; }
    .amount { font-size: 24px; font-weight: bold; color: #f59e0b; }
    .btn { display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">Approval Required</h2>
    </div>
    <div class="content">
      <p>A new purchase request requires your approval.</p>
      <div class="details">
        <div class="detail-row">
          <span>Requester</span>
          <strong>${data.requesterName}</strong>
        </div>
        <div class="detail-row">
          <span>Vendor</span>
          <strong>${data.vendorName}</strong>
        </div>
        <div class="detail-row">
          <span>Amount</span>
          <span class="amount">$${data.totalAmount.toLocaleString()}</span>
        </div>
      </div>
      <p>Please log in to SpendGuard to review and take action on this request.</p>
      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Best regards,<br>SpendGuard Team</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

function generateApprovalActionEmail(data: ApprovalActionPayload): { subject: string; text: string; html: string } {
  const actionText = data.action === "approved" ? "Approved" : "Rejected";
  const actionColor = data.action === "approved" ? "#10b981" : "#ef4444";

  const godaddyNote = data.isGodaddy && data.action === "approved"
    ? "\n\nNote: This is a GoDaddy purchase. Your receipt will be automatically imported once the order is detected in the company GoDaddy account."
    : "";

  const subject = `Purchase Request ${actionText} - ${data.vendorName} ($${data.totalAmount.toLocaleString()})`;

  const text = `
Hi ${data.requesterName},

Your purchase request has been ${data.action} by ${data.approverName}.

Request Details:
- Vendor: ${data.vendorName}
- Amount: $${data.totalAmount.toLocaleString()}
- Request ID: ${data.requestId}
${data.comments ? `\nComments: ${data.comments}` : ""}

${data.action === "approved"
  ? "You may now proceed with the purchase."
  : "Please contact the approver if you have questions."}${godaddyNote}

Best regards,
SpendGuard Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${actionColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }
    .details { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e2e8f0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .detail-row:last-child { border-bottom: none; }
    .amount { font-size: 24px; font-weight: bold; color: ${actionColor}; }
    .comments { background: #fef3c7; border: 1px solid #fcd34d; padding: 12px; border-radius: 8px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">Purchase Request ${actionText}</h2>
    </div>
    <div class="content">
      <p>Hi ${data.requesterName},</p>
      <p>Your purchase request has been <strong>${data.action}</strong> by ${data.approverName}.</p>
      <div class="details">
        <div class="detail-row">
          <span>Vendor</span>
          <strong>${data.vendorName}</strong>
        </div>
        <div class="detail-row">
          <span>Amount</span>
          <span class="amount">$${data.totalAmount.toLocaleString()}</span>
        </div>
      </div>
      ${data.comments ? `<div class="comments"><strong>Comments:</strong> ${data.comments}</div>` : ""}
      <p>${data.action === "approved"
        ? "You may now proceed with the purchase."
        : "Please contact the approver if you have questions."}</p>
      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Best regards,<br>SpendGuard Team</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

function generateGodaddyReceiptEmail(data: GodaddyReceiptPayload): { subject: string; text: string; html: string } {
  const subject = `GoDaddy Receipt Imported - Order #${data.orderId}`;

  const text = `
Hi ${data.requesterName},

Great news! Your GoDaddy receipt has been automatically imported.

Order Details:
- Order ID: ${data.orderId}
- Vendor: ${data.vendorName}
- Amount: $${data.totalAmount.toLocaleString()}

The receipt has been attached to your purchase request and is ready for review.

Best regards,
SpendGuard Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0d9488; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }
    .details { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e2e8f0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .detail-row:last-child { border-bottom: none; }
    .badge { display: inline-block; background: #ccfbf1; color: #0d9488; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">GoDaddy Receipt Imported</h2>
      <span class="badge">Auto-Imported</span>
    </div>
    <div class="content">
      <p>Hi ${data.requesterName},</p>
      <p>Great news! Your GoDaddy receipt has been automatically imported.</p>
      <div class="details">
        <div class="detail-row">
          <span>Order ID</span>
          <strong>#${data.orderId}</strong>
        </div>
        <div class="detail-row">
          <span>Vendor</span>
          <strong>${data.vendorName}</strong>
        </div>
        <div class="detail-row">
          <span>Amount</span>
          <strong>$${data.totalAmount.toLocaleString()}</strong>
        </div>
      </div>
      <p>The receipt has been attached to your purchase request and is ready for review.</p>
      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Best regards,<br>SpendGuard Team</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

function generateReceiptReuploadEmail(data: ReceiptReuploadPayload): { subject: string; text: string; html: string } {
  const subject = `Action Required: Receipt Re-upload Needed - ${data.vendorName}`;

  const text = `
Hi ${data.requesterName},

${data.approverName} has requested a new receipt for your purchase from ${data.vendorName}.

${data.reason ? `Reason: ${data.reason}` : "Please upload a clearer image of your receipt."}

Please log in to SpendGuard and go to My Receipts to upload a new receipt.

Best regards,
SpendGuard Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f97316; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }
    .reason { background: #fef3c7; border: 1px solid #fcd34d; padding: 12px; border-radius: 8px; margin: 16px 0; }
    .btn { display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">Receipt Re-upload Required</h2>
    </div>
    <div class="content">
      <p>Hi ${data.requesterName},</p>
      <p>${data.approverName} has requested a new receipt for your purchase from <strong>${data.vendorName}</strong>.</p>
      ${data.reason ? `<div class="reason"><strong>Reason:</strong> ${data.reason}</div>` : "<p>Please upload a clearer image of your receipt.</p>"}
      <p>Please log in to SpendGuard and go to <strong>My Receipts</strong> to upload a new receipt.</p>
      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Best regards,<br>SpendGuard Team</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await req.json();
    const { type, payload } = body as { type: string; payload: unknown };

    const results: { sent: string[]; failed: string[]; errors: string[] } = {
      sent: [],
      failed: [],
      errors: [],
    };

    switch (type) {
      case "request_submitted": {
        const data = payload as RequestSubmittedPayload;

        const requesterEmail = generateRequestSubmittedEmail(data);
        const result = await sendEmailWithResend(
          data.requesterEmail,
          requesterEmail.subject,
          requesterEmail.text,
          requesterEmail.html
        );

        if (result.success) {
          results.sent.push(data.requesterEmail);
        } else {
          results.failed.push(data.requesterEmail);
          results.errors.push(result.error || "Unknown error");
        }

        await supabaseAdmin.from("email_notifications").insert({
          recipient_email: data.requesterEmail,
          recipient_name: data.requesterName,
          subject: requesterEmail.subject,
          body_text: requesterEmail.text,
          body_html: requesterEmail.html,
          related_entity_type: "purchase_request",
          related_entity_id: data.requestId,
          status: result.success ? "sent" : "failed",
          sent_at: result.success ? new Date().toISOString() : null,
        });

        for (const approverEmail of data.approverEmails) {
          const approverNotification = generateApprovalNeededEmail(data, approverEmail);
          const approverResult = await sendEmailWithResend(
            approverEmail,
            approverNotification.subject,
            approverNotification.text,
            approverNotification.html
          );

          if (approverResult.success) {
            results.sent.push(approverEmail);
          } else {
            results.failed.push(approverEmail);
            results.errors.push(approverResult.error || "Unknown error");
          }

          await supabaseAdmin.from("email_notifications").insert({
            recipient_email: approverEmail,
            subject: approverNotification.subject,
            body_text: approverNotification.text,
            body_html: approverNotification.html,
            related_entity_type: "purchase_request",
            related_entity_id: data.requestId,
            status: approverResult.success ? "sent" : "failed",
            sent_at: approverResult.success ? new Date().toISOString() : null,
          });
        }
        break;
      }

      case "approval_action": {
        const data = payload as ApprovalActionPayload;

        const email = generateApprovalActionEmail(data);
        const result = await sendEmailWithResend(
          data.requesterEmail,
          email.subject,
          email.text,
          email.html
        );

        if (result.success) {
          results.sent.push(data.requesterEmail);
        } else {
          results.failed.push(data.requesterEmail);
          results.errors.push(result.error || "Unknown error");
        }

        await supabaseAdmin.from("email_notifications").insert({
          recipient_email: data.requesterEmail,
          recipient_name: data.requesterName,
          subject: email.subject,
          body_text: email.text,
          body_html: email.html,
          related_entity_type: "purchase_request",
          related_entity_id: data.requestId,
          status: result.success ? "sent" : "failed",
          sent_at: result.success ? new Date().toISOString() : null,
        });
        break;
      }

      case "direct": {
        const data = payload as EmailPayload;
        const result = await sendEmailWithResend(
          data.to,
          data.subject,
          data.bodyText,
          data.bodyHtml
        );

        if (result.success) {
          results.sent.push(data.to);
        } else {
          results.failed.push(data.to);
          results.errors.push(result.error || "Unknown error");
        }

        await supabaseAdmin.from("email_notifications").insert({
          recipient_email: data.to,
          recipient_name: data.toName,
          subject: data.subject,
          body_text: data.bodyText,
          body_html: data.bodyHtml,
          related_entity_type: data.relatedEntityType,
          related_entity_id: data.relatedEntityId,
          status: result.success ? "sent" : "failed",
          sent_at: result.success ? new Date().toISOString() : null,
        });
        break;
      }

      case "godaddy_receipt": {
        const data = payload as GodaddyReceiptPayload;
        const email = generateGodaddyReceiptEmail(data);
        const result = await sendEmailWithResend(
          data.requesterEmail,
          email.subject,
          email.text,
          email.html
        );

        if (result.success) {
          results.sent.push(data.requesterEmail);
        } else {
          results.failed.push(data.requesterEmail);
          results.errors.push(result.error || "Unknown error");
        }

        await supabaseAdmin.from("email_notifications").insert({
          recipient_email: data.requesterEmail,
          recipient_name: data.requesterName,
          subject: email.subject,
          body_text: email.text,
          body_html: email.html,
          related_entity_type: "purchase_request",
          related_entity_id: data.requestId,
          status: result.success ? "sent" : "failed",
          sent_at: result.success ? new Date().toISOString() : null,
        });
        break;
      }

      case "receipt_reupload": {
        const data = payload as ReceiptReuploadPayload;
        const email = generateReceiptReuploadEmail(data);
        const result = await sendEmailWithResend(
          data.requesterEmail,
          email.subject,
          email.text,
          email.html
        );

        if (result.success) {
          results.sent.push(data.requesterEmail);
        } else {
          results.failed.push(data.requesterEmail);
          results.errors.push(result.error || "Unknown error");
        }

        await supabaseAdmin.from("email_notifications").insert({
          recipient_email: data.requesterEmail,
          recipient_name: data.requesterName,
          subject: email.subject,
          body_text: email.text,
          body_html: email.html,
          related_entity_type: "purchase_request",
          related_entity_id: data.requestId,
          status: result.success ? "sent" : "failed",
          sent_at: result.success ? new Date().toISOString() : null,
        });
        break;
      }

      default:
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown email type: ${type}`,
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
    }

    return new Response(JSON.stringify({
      success: true,
      results,
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
