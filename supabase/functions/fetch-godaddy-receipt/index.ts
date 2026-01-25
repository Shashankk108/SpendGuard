import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FetchReceiptRequest {
  order_id: string;
  request_id?: string;
  user_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const godaddyApiKey = Deno.env.get("GODADDY_API_KEY");
    const godaddyApiSecret = Deno.env.get("GODADDY_API_SECRET");

    if (!godaddyApiKey || !godaddyApiSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "GoDaddy API credentials not configured",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: FetchReceiptRequest = await req.json();
    const { order_id, request_id, user_id } = body;

    if (!order_id) {
      return new Response(
        JSON.stringify({ success: false, error: "order_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Fetching receipt for GoDaddy order: ${order_id}`);

    const { data: godaddyOrder } = await supabase
      .from("godaddy_orders")
      .select("*")
      .eq("order_id", order_id)
      .maybeSingle();

    let purchaseRequestId = request_id;
    let userId = user_id;

    if (godaddyOrder?.matched_request_id) {
      purchaseRequestId = godaddyOrder.matched_request_id;
    }

    if (purchaseRequestId) {
      const { data: purchaseRequest } = await supabase
        .from("purchase_requests")
        .select("requester_id")
        .eq("id", purchaseRequestId)
        .maybeSingle();

      if (purchaseRequest) {
        userId = purchaseRequest.requester_id;
      }
    }

    if (!purchaseRequestId || !userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Could not determine purchase request or user for this order",
          order_id,
          matched_request_id: godaddyOrder?.matched_request_id,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Fetching invoice from GoDaddy API for order ${order_id}`);

    const invoiceResponse = await fetch(
      `https://api.godaddy.com/v1/orders/${order_id}`,
      {
        headers: {
          "Authorization": `sso-key ${godaddyApiKey}:${godaddyApiSecret}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!invoiceResponse.ok) {
      const errorText = await invoiceResponse.text();
      console.error("GoDaddy invoice fetch error:", invoiceResponse.status, errorText);

      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch invoice from GoDaddy: ${invoiceResponse.status}`,
          details: errorText,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orderDetails = await invoiceResponse.json();
    console.log("Order details fetched successfully");

    const receiptHtml = generateReceiptHtml(orderDetails, godaddyOrder);
    const receiptDataUrl = `data:text/html;base64,${btoa(receiptHtml)}`;

    const { data: existingReceipt } = await supabase
      .from("purchase_receipts")
      .select("id")
      .eq("request_id", purchaseRequestId)
      .eq("is_current", true)
      .maybeSingle();

    if (existingReceipt) {
      await supabase
        .from("purchase_receipts")
        .update({ is_current: false })
        .eq("id", existingReceipt.id);
    }

    const receiptData = {
      request_id: purchaseRequestId,
      user_id: userId,
      file_name: `godaddy_receipt_${order_id}.html`,
      file_url: receiptDataUrl,
      file_type: "text/html",
      file_size: receiptHtml.length,
      status: "pending",
      notes: `Auto-imported from GoDaddy Order #${order_id}`,
      source: "godaddy_auto",
      version: existingReceipt ? 2 : 1,
      is_current: true,
      ai_verification_status: "pending",
    };

    const { data: newReceipt, error: insertError } = await supabase
      .from("purchase_receipts")
      .insert(receiptData)
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting receipt:", insertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to save receipt",
          details: insertError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("purchase_requests")
      .update({ external_receipt_status: "fetched" })
      .eq("id", purchaseRequestId);

    if (godaddyOrder) {
      await supabase
        .from("godaddy_orders")
        .update({
          receipt_url: receiptDataUrl,
          receipt_data: receiptHtml,
          sync_status: "matched",
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", order_id);
    }

    await supabase.rpc("create_notification", {
      p_user_id: userId,
      p_type: "godaddy_receipt_fetched",
      p_title: "GoDaddy Receipt Imported",
      p_message: `Your receipt for GoDaddy order #${order_id} has been automatically imported.`,
      p_action_url: `/request/${purchaseRequestId}`,
      p_metadata: { order_id, request_id: purchaseRequestId, receipt_id: newReceipt.id },
    });

    console.log(`Receipt created successfully: ${newReceipt.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        receipt_id: newReceipt.id,
        request_id: purchaseRequestId,
        order_id,
        message: "Receipt imported successfully from GoDaddy",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Fetch receipt error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateReceiptHtml(orderDetails: any, godaddyOrder: any): string {
  const items = orderDetails.items || godaddyOrder?.raw_api_response?.items || [];
  const pricing = orderDetails.pricing || godaddyOrder?.raw_api_response?.pricing || {};
  const orderId = orderDetails.orderId || godaddyOrder?.order_id || "Unknown";
  const orderDate = orderDetails.createdAt || godaddyOrder?.order_date || new Date().toISOString();

  const convertAmount = (amount: number) => {
    if (amount > 10000) {
      return amount / 1000000;
    }
    return amount;
  };

  const itemsHtml = items.map((item: any) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${item.label || "Product"}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">${item.quantity || 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">$${convertAmount(item.pricing?.total || 0).toFixed(2)}</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GoDaddy Receipt - Order #${orderId}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f8fafc;
    }
    .receipt {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #00A4A6 0%, #1BDBDB 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 5px 0;
      font-size: 28px;
      font-weight: 700;
    }
    .header p {
      margin: 0;
      opacity: 0.9;
    }
    .content {
      padding: 30px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    .info-item {
      background: #f1f5f9;
      padding: 15px;
      border-radius: 8px;
    }
    .info-label {
      font-size: 12px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .info-value {
      font-size: 16px;
      font-weight: 600;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #f1f5f9;
      padding: 12px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
    }
    th:last-child {
      text-align: right;
    }
    th:nth-child(2) {
      text-align: center;
    }
    .totals {
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
    }
    .total-row.grand {
      border-top: 2px solid #e2e8f0;
      margin-top: 10px;
      padding-top: 15px;
      font-size: 18px;
      font-weight: 700;
      color: #00A4A6;
    }
    .footer {
      text-align: center;
      padding: 20px;
      background: #f8fafc;
      color: #64748b;
      font-size: 12px;
    }
    .badge {
      display: inline-block;
      background: #dcfce7;
      color: #166534;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <h1>GoDaddy</h1>
      <p>Order Receipt</p>
      <span class="badge">Auto-Imported</span>
    </div>
    <div class="content">
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Order Number</div>
          <div class="info-value">#${orderId}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Order Date</div>
          <div class="info-value">${new Date(orderDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml || `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #64748b;">Order details</td></tr>`}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <span>Subtotal</span>
          <span>$${convertAmount(pricing.subtotal || 0).toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span>Tax</span>
          <span>$${convertAmount(pricing.taxes || 0).toFixed(2)}</span>
        </div>
        <div class="total-row grand">
          <span>Total</span>
          <span>$${(godaddyOrder?.order_total || convertAmount(pricing.total || 0)).toFixed(2)}</span>
        </div>
      </div>
    </div>
    <div class="footer">
      <p>This receipt was automatically imported from GoDaddy</p>
      <p>GoDaddy Inc. | 14455 N. Hayden Road, Scottsdale, AZ 85260</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
