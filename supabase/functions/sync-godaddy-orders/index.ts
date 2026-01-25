import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GoDaddyOrder {
  orderId: string;
  createdAt: string;
  currency: string;
  items: Array<{
    label: string;
    productTypeId: number;
    quantity: number;
    pricing: {
      subtotal: number;
      total: number;
    };
  }>;
  pricing: {
    subtotal: number;
    taxes: number;
    total: number;
  };
}

interface PurchaseRequest {
  id: string;
  vendor_name: string;
  total_amount: number;
  expense_date: string;
  status: string;
  vendor_type: string;
  external_order_id: string | null;
}

interface MatchResult {
  request_id: string;
  confidence: number;
  reasons: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const godaddyApiKey = Deno.env.get("GODADDY_API_KEY");
    const godaddyApiSecret = Deno.env.get("GODADDY_API_SECRET");
    const godaddyShopperId = Deno.env.get("GODADDY_SHOPPER_ID");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { action, force_sync } = body;

    if (action === "check_status") {
      const configured = !!(godaddyApiKey && godaddyApiSecret);

      const { data: syncStatus } = await supabase
        .from("external_vendor_sync")
        .select("*")
        .eq("vendor_type", "godaddy")
        .maybeSingle();

      const { count: orderCount } = await supabase
        .from("godaddy_orders")
        .select("*", { count: "exact", head: true });

      const { count: unmatchedCount } = await supabase
        .from("godaddy_orders")
        .select("*", { count: "exact", head: true })
        .eq("sync_status", "unmatched");

      return new Response(
        JSON.stringify({
          configured,
          sync_status: syncStatus,
          total_orders: orderCount || 0,
          unmatched_orders: unmatchedCount || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!godaddyApiKey || !godaddyApiSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "GoDaddy integration not configured",
          message: "Contact your system administrator to enable this feature",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("external_vendor_sync")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("vendor_type", "godaddy");

    console.log("Starting GoDaddy order sync...");

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const startDate = ninetyDaysAgo.toISOString().split("T")[0];

    const ordersUrl = godaddyShopperId
      ? `https://api.godaddy.com/v1/shoppers/${godaddyShopperId}/orders?periodStart=${startDate}`
      : `https://api.godaddy.com/v1/orders?periodStart=${startDate}`;

    console.log("Fetching orders from:", ordersUrl);

    const ordersResponse = await fetch(ordersUrl, {
      headers: {
        "Authorization": `sso-key ${godaddyApiKey}:${godaddyApiSecret}`,
        "Content-Type": "application/json",
      },
    });

    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      console.error("GoDaddy API error:", ordersResponse.status, errorText);

      await supabase
        .from("external_vendor_sync")
        .update({
          status: "failed",
          error_message: `API Error ${ordersResponse.status}: ${errorText}`,
          updated_at: new Date().toISOString(),
        })
        .eq("vendor_type", "godaddy");

      return new Response(
        JSON.stringify({
          success: false,
          error: `GoDaddy API returned ${ordersResponse.status}`,
          details: errorText,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const responseData = await ordersResponse.json();
    console.log("GoDaddy API response type:", typeof responseData, Array.isArray(responseData));

    let orders: GoDaddyOrder[] = [];
    if (Array.isArray(responseData)) {
      orders = responseData;
    } else if (responseData && typeof responseData === 'object') {
      if (Array.isArray(responseData.orders)) {
        orders = responseData.orders;
      } else if (Array.isArray(responseData.data)) {
        orders = responseData.data;
      } else if (Array.isArray(responseData.items)) {
        orders = responseData.items;
      } else {
        console.log("Unexpected response structure:", JSON.stringify(responseData).slice(0, 500));
        await supabase
          .from("external_vendor_sync")
          .update({
            status: "failed",
            error_message: `Unexpected API response format: ${JSON.stringify(responseData).slice(0, 200)}`,
            updated_at: new Date().toISOString(),
          })
          .eq("vendor_type", "godaddy");

        return new Response(
          JSON.stringify({
            success: false,
            error: "Unexpected API response format",
            details: responseData,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Fetched ${orders.length} orders from GoDaddy`);

    let syncedCount = 0;
    let matchedCount = 0;
    const results: Array<{ order_id: string; status: string; matched_to?: string }> = [];

    const { data: approvedRequests } = await supabase
      .from("purchase_requests")
      .select("id, vendor_name, total_amount, expense_date, status, vendor_type, external_order_id")
      .eq("status", "approved")
      .is("external_order_id", null)
      .or("vendor_type.eq.godaddy,vendor_name.ilike.%godaddy%");

    for (const order of orders) {
      const { data: existing } = await supabase
        .from("godaddy_orders")
        .select("id, sync_status, matched_request_id")
        .eq("order_id", order.orderId)
        .maybeSingle();

      if (existing && !force_sync) {
        results.push({ order_id: order.orderId, status: "skipped_existing" });
        continue;
      }

      const productNames = order.items.map(item => item.label).join(", ");
      const productType = order.items[0]?.productTypeId === 2 ? "domain" : "other";

      const orderTotalInDollars = order.pricing.total / 1000000;

      const matchResult = findBestMatch(order, approvedRequests || [], orderTotalInDollars);

      const orderData = {
        order_id: order.orderId,
        domain_or_product: productNames,
        product_type: productType,
        order_date: order.createdAt.split("T")[0],
        order_total: orderTotalInDollars,
        currency: order.currency,
        raw_api_response: order,
        sync_status: matchResult ? "matched" : "unmatched",
        matched_request_id: matchResult?.request_id || null,
        match_confidence: matchResult?.confidence || null,
        match_reasons: matchResult?.reasons || [],
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase
          .from("godaddy_orders")
          .update(orderData)
          .eq("id", existing.id);
      } else {
        await supabase
          .from("godaddy_orders")
          .insert(orderData);
      }

      syncedCount++;

      if (matchResult && matchResult.confidence >= 70) {
        matchedCount++;

        await supabase
          .from("purchase_requests")
          .update({
            external_order_id: order.orderId,
            external_receipt_status: "pending",
          })
          .eq("id", matchResult.request_id);

        results.push({
          order_id: order.orderId,
          status: "matched",
          matched_to: matchResult.request_id,
        });
      } else {
        results.push({ order_id: order.orderId, status: matchResult ? "low_confidence_match" : "unmatched" });
      }
    }

    await supabase
      .from("external_vendor_sync")
      .update({
        status: "success",
        last_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        orders_synced: syncedCount,
        orders_matched: matchedCount,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("vendor_type", "godaddy");

    console.log(`Sync complete: ${syncedCount} synced, ${matchedCount} matched`);

    return new Response(
      JSON.stringify({
        success: true,
        orders_fetched: orders.length,
        orders_synced: syncedCount,
        orders_matched: matchedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await supabase
      .from("external_vendor_sync")
      .update({
        status: "failed",
        error_message: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq("vendor_type", "godaddy");

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function findBestMatch(order: GoDaddyOrder, requests: PurchaseRequest[], orderAmountInDollars: number): MatchResult | null {
  if (!requests || requests.length === 0) return null;

  let bestMatch: MatchResult | null = null;
  let bestScore = 0;

  const orderAmount = orderAmountInDollars;
  const orderDate = new Date(order.createdAt);

  for (const request of requests) {
    const reasons: string[] = [];
    let score = 0;

    const isGoDaddyVendor = request.vendor_type === "godaddy" ||
      request.vendor_name.toLowerCase().includes("godaddy") ||
      request.vendor_name.toLowerCase().includes("go daddy");

    if (isGoDaddyVendor) {
      score += 30;
      reasons.push("Vendor identified as GoDaddy");
    } else {
      continue;
    }

    const amountDiff = Math.abs(orderAmount - request.total_amount);
    const percentDiff = (amountDiff / request.total_amount) * 100;

    if (amountDiff === 0) {
      score += 40;
      reasons.push("Exact amount match");
    } else if (percentDiff <= 5) {
      score += 35;
      reasons.push(`Amount within 5% ($${amountDiff.toFixed(2)} difference)`);
    } else if (percentDiff <= 10) {
      score += 25;
      reasons.push(`Amount within 10% ($${amountDiff.toFixed(2)} difference)`);
    } else if (amountDiff <= 5) {
      score += 20;
      reasons.push(`Amount within $5 ($${amountDiff.toFixed(2)} difference)`);
    }

    const requestDate = new Date(request.expense_date);
    const daysDiff = Math.abs((orderDate.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff <= 1) {
      score += 30;
      reasons.push("Date matches within 1 day");
    } else if (daysDiff <= 3) {
      score += 25;
      reasons.push(`Date within 3 days (${Math.round(daysDiff)} days difference)`);
    } else if (daysDiff <= 7) {
      score += 15;
      reasons.push(`Date within 7 days (${Math.round(daysDiff)} days difference)`);
    } else if (daysDiff <= 14) {
      score += 5;
      reasons.push(`Date within 14 days (${Math.round(daysDiff)} days difference)`);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        request_id: request.id,
        confidence: Math.min(100, score),
        reasons,
      };
    }
  }

  return bestMatch && bestScore >= 50 ? bestMatch : null;
}
