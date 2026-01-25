import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PurchaseRequest {
  id: string;
  vendor_name: string;
  total_amount: number;
  expense_date: string;
  business_purpose: string;
}

interface AnalysisResult {
  extracted_vendor: string | null;
  extracted_amount: number | null;
  extracted_date: string | null;
  extracted_items: Array<{ description: string; amount: number }>;
  vendor_match: boolean;
  amount_match: boolean;
  date_match: boolean;
  vendor_reason: string;
  amount_reason: string;
  date_reason: string;
  expected_vendor: string;
  expected_amount: number;
  expected_date: string;
  confidence_score: number;
  recommendation: "approve" | "review" | "reject";
  analysis_notes: string;
  raw_extraction: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    if (body.action === "check_status") {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      return new Response(
        JSON.stringify({
          configured: !!apiKey,
          keyPrefix: apiKey ? apiKey.substring(0, 7) + "..." : null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { receipt_id, request_id, file_url, file_type, purchase_request, force_reanalyze } = body;

    const debugInfo: Record<string, unknown> = {
      receipt_id,
      file_type,
      file_url_length: file_url?.length || 0,
      file_url_prefix: file_url?.substring(0, 80),
      has_purchase_request: !!purchase_request,
    };

    console.log("=== Receipt Analysis Request ===");
    console.log(JSON.stringify(debugInfo, null, 2));

    if (!receipt_id || !file_url || !purchase_request) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          debug: debugInfo,
          missing: {
            receipt_id: !receipt_id,
            file_url: !file_url,
            purchase_request: !purchase_request,
          }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(
        JSON.stringify({
          error: "OpenAI API key not configured",
          analysis: createFallbackAnalysis(purchase_request, "AI analysis requires OpenAI API key. Please contact your administrator."),
          api_configured: false,
          debug: debugInfo,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("API Key configured:", apiKey.substring(0, 7) + "...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!force_reanalyze) {
      const { data: existingAnalysis } = await supabase
        .from("receipt_analyses")
        .select("*")
        .eq("receipt_id", receipt_id)
        .maybeSingle();

      if (existingAnalysis) {
        console.log("Returning cached analysis");
        return new Response(
          JSON.stringify({ analysis: existingAnalysis, cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    let imageDataUrl: string;

    if (file_type === "application/pdf") {
      console.log("PDF file detected - returning error");
      return new Response(
        JSON.stringify({
          error: "PDF files cannot be analyzed directly",
          analysis: createFallbackAnalysis(purchase_request, "PDF receipts cannot be analyzed by AI. Please upload a JPG or PNG image of your receipt."),
          pdf_not_supported: true,
          debug: debugInfo,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (file_url.startsWith("data:image/")) {
      imageDataUrl = file_url;
      console.log("Using data URL directly");
    } else if (file_url.startsWith("http")) {
      imageDataUrl = file_url;
      console.log("Using HTTP URL directly");
    } else {
      const mimeType = file_type || "image/jpeg";
      const cleanBase64 = file_url.replace(/\s/g, "");
      imageDataUrl = `data:${mimeType};base64,${cleanBase64}`;
      console.log("Constructed data URL from raw base64");
    }

    console.log("Image URL type:", imageDataUrl.startsWith("data:") ? "base64" : "http");
    console.log("Image URL length:", imageDataUrl.length);

    if (imageDataUrl.length > 20 * 1024 * 1024) {
      return new Response(
        JSON.stringify({
          error: "Image too large",
          analysis: createFallbackAnalysis(purchase_request, "Image file is too large for AI analysis. Please upload a smaller image (under 20MB)."),
          debug: { ...debugInfo, image_size_bytes: imageDataUrl.length },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Calling OpenAI Vision API...");
    const analysisResult = await analyzeWithOpenAI(apiKey, imageDataUrl, purchase_request);

    if (analysisResult.error) {
      console.error("OpenAI analysis failed:", analysisResult.error);
      return new Response(
        JSON.stringify({
          error: analysisResult.error,
          analysis: analysisResult.analysis,
          openai_error: analysisResult.openai_error,
          debug: debugInfo,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const analysis = analysisResult.analysis!;
    console.log("Analysis successful, confidence:", analysis.confidence_score);

    const { data: savedAnalysis, error: saveError } = await supabase
      .from("receipt_analyses")
      .insert({
        receipt_id,
        request_id: request_id || purchase_request.id,
        ...analysis,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save analysis:", saveError);
    }

    await supabase
      .from("purchase_receipts")
      .update({
        ai_verification_status: analysis.recommendation === "approve" ? "verified" :
                                analysis.recommendation === "reject" ? "mismatch" : "inconclusive",
        ai_confidence_score: analysis.confidence_score,
        ai_verified_at: new Date().toISOString(),
      })
      .eq("id", receipt_id);

    return new Response(
      JSON.stringify({
        analysis: savedAnalysis || analysis,
        cached: false,
        success: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(
      JSON.stringify({
        error: "Analysis failed",
        details: error.message,
        stack: error.stack,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function analyzeWithOpenAI(
  apiKey: string,
  imageUrl: string,
  purchaseRequest: PurchaseRequest
): Promise<{ analysis?: AnalysisResult; error?: string; openai_error?: unknown }> {
  const systemPrompt = `You are an expert receipt/invoice analyzer. Your job is to ACCURATELY extract information EXACTLY as shown on the receipt image.

CRITICAL EXTRACTION RULES:
1. VENDOR: Extract the EXACT business/store name as printed (usually at top, on logo, or header)
2. TOTAL: Find the EXACT final total amount (look for "Total", "Grand Total", "Amount Due", "TOTAL")
3. DATE EXTRACTION (MOST IMPORTANT - READ CAREFULLY):
   - Look for the main receipt/transaction date on the document
   - Common labels: "Receipt Date:", "Date:", "Transaction Date:", "Invoice Date:", or just a date near the top
   - Read the EXACT day, month, and year shown
   - If you see "01/25/2026" - this is January 25, 2026 (not January 24!)
   - If you see "01/24/2026" - this is January 24, 2026
   - If you see "Receipt Date: 01/25/2026" - extract January 25, 2026
   - DO NOT subtract or add days
   - DO NOT use today's date or any assumed date
   - Convert to YYYY-MM-DD format: "01/25/2026" becomes "2026-01-25"
   - TRIPLE CHECK: If the receipt says 25, extract 25 (not 24 or 26)
4. ITEMS: List all purchased items with their prices

PURCHASE REQUEST CONTEXT (for comparison):
- Expected Vendor: ${purchaseRequest.vendor_name}
- Expected Amount: $${purchaseRequest.total_amount.toFixed(2)}
- Expected Date: ${purchaseRequest.expense_date}

MATCHING RULES:
- Vendor MATCHES if names are similar (ignore case, punctuation, "Inc", "LLC", etc.)
- Amount MATCHES if within 2% or $2 difference
- Date MATCHES if within 7 days of expected date

CRITICAL WARNING: Extract dates EXACTLY as shown. If receipt shows 01/25/2026, you must return "2026-01-25". Do not modify the day number.

Respond with ONLY valid JSON:
{
  "extracted_vendor": "exact vendor name or null",
  "extracted_amount": exact_number or null,
  "extracted_date": "YYYY-MM-DD or null",
  "extracted_items": [{"description": "item name", "amount": 0.00}],
  "confidence_score": 0-100,
  "vendor_match": true/false,
  "amount_match": true/false,
  "date_match": true/false,
  "vendor_reason": "explanation with extracted vs expected",
  "amount_reason": "explanation with extracted vs expected",
  "date_reason": "explanation with extracted date vs expected date",
  "analysis_notes": "summary of findings"
}`;

  try {
    const requestBody = {
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this receipt image and extract the vendor, amount, date, and items." },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.1,
      response_format: { type: "json_object" }
    };

    console.log("Sending OpenAI request...");
    const startTime = Date.now();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const elapsed = Date.now() - startTime;
    console.log(`OpenAI response in ${elapsed}ms, status: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("OpenAI error response:", errorBody);

      let errorMessage = `OpenAI API error (${response.status})`;
      let openaiError: unknown = errorBody;

      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.error?.message || errorMessage;
        openaiError = errorJson;
      } catch {}

      return {
        error: errorMessage,
        analysis: createFallbackAnalysis(purchaseRequest, `AI service error: ${errorMessage}`),
        openai_error: openaiError,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("Empty OpenAI response:", JSON.stringify(data));
      return {
        error: "Empty response from AI",
        analysis: createFallbackAnalysis(purchaseRequest, "AI returned empty response"),
        openai_error: data,
      };
    }

    console.log("OpenAI response content:", content);

    const parsed = JSON.parse(content);

    const vendorMatch = checkVendorMatch(parsed.extracted_vendor, purchaseRequest.vendor_name);
    const amountMatch = checkAmountMatch(parsed.extracted_amount, purchaseRequest.total_amount);
    const dateMatch = checkDateMatch(parsed.extracted_date, purchaseRequest.expense_date);
    const dateDiff = getDateDifferenceInDays(parsed.extracted_date, purchaseRequest.expense_date);
    const isExactDateMatch = dateDiff !== null && dateDiff === 0;

    const concerns: string[] = [];
    const matchCount = [vendorMatch, amountMatch, dateMatch].filter(Boolean).length;
    let confidence: number;
    let recommendation: "approve" | "review" | "reject" = "review";

    if (matchCount === 3) {
      confidence = 95;
      recommendation = "approve";
      if (!isExactDateMatch && dateDiff !== null) {
        concerns.push(`Receipt date is ${Math.abs(dateDiff)} day${Math.abs(dateDiff) > 1 ? 's' : ''} ${dateDiff > 0 ? 'after' : 'before'} the expected purchase date, but within acceptable tolerance.`);
      }
    } else if (matchCount === 2) {
      if (vendorMatch && amountMatch) {
        confidence = 75;
        if (!dateMatch) {
          concerns.push(`Date mismatch: Receipt shows ${parsed.extracted_date || 'unknown'}, expected ${purchaseRequest.expense_date}.`);
        }
      } else if (vendorMatch && dateMatch) {
        confidence = 60;
        concerns.push(`Amount mismatch: Receipt shows $${parsed.extracted_amount?.toFixed(2) || 'unknown'}, expected $${purchaseRequest.total_amount.toFixed(2)}.`);
      } else {
        confidence = 50;
        concerns.push(`Vendor mismatch: Receipt shows "${parsed.extracted_vendor || 'unknown'}", expected "${purchaseRequest.vendor_name}".`);
      }
      recommendation = "review";
    } else if (matchCount === 1) {
      confidence = 30;
      recommendation = "review";
      if (!vendorMatch) concerns.push(`Vendor does not match expected "${purchaseRequest.vendor_name}".`);
      if (!amountMatch) concerns.push(`Amount does not match expected $${purchaseRequest.total_amount.toFixed(2)}.`);
      if (!dateMatch) concerns.push(`Date does not match expected ${purchaseRequest.expense_date}.`);
    } else {
      confidence = 15;
      recommendation = "reject";
      concerns.push("No verification checks passed. This receipt may not match the purchase request.");
    }

    if (!vendorMatch && !amountMatch) {
      recommendation = "reject";
      if (!concerns.some(c => c.includes("may not match"))) {
        concerns.push("Both vendor and amount do not match - this receipt likely belongs to a different purchase.");
      }
    }

    return {
      analysis: {
        extracted_vendor: parsed.extracted_vendor || null,
        extracted_amount: parsed.extracted_amount != null ? Number(parsed.extracted_amount) : null,
        extracted_date: parsed.extracted_date || null,
        extracted_items: Array.isArray(parsed.extracted_items) ? parsed.extracted_items : [],
        vendor_match: vendorMatch,
        amount_match: amountMatch,
        date_match: dateMatch,
        vendor_reason: parsed.vendor_reason || generateReason("vendor", parsed.extracted_vendor, purchaseRequest.vendor_name, vendorMatch),
        amount_reason: parsed.amount_reason || generateReason("amount", parsed.extracted_amount, purchaseRequest.total_amount, amountMatch),
        date_reason: generateDateReason(parsed.extracted_date, purchaseRequest.expense_date, dateMatch, dateDiff),
        expected_vendor: purchaseRequest.vendor_name,
        expected_amount: purchaseRequest.total_amount,
        expected_date: purchaseRequest.expense_date,
        confidence_score: confidence,
        recommendation,
        concerns,
        analysis_notes: parsed.analysis_notes || "Analysis complete.",
        raw_extraction: { openai_response: parsed },
      }
    };
  } catch (error) {
    console.error("OpenAI call failed:", error);
    return {
      error: `Analysis error: ${error.message}`,
      analysis: createFallbackAnalysis(purchaseRequest, `Analysis failed: ${error.message}`),
    };
  }
}

function checkVendorMatch(extracted: string | null, expected: string): boolean {
  if (!extracted) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const e = norm(extracted);
  const x = norm(expected);
  return e.includes(x) || x.includes(e) || e === x;
}

function checkAmountMatch(extracted: number | null, expected: number): boolean {
  if (extracted == null) return false;
  const diff = Math.abs(extracted - expected);
  return (diff / expected) * 100 <= 2 || diff <= 2;
}

function getDateDifferenceInDays(extracted: string | null, expected: string): number | null {
  if (!extracted) return null;
  try {
    const e = new Date(extracted + 'T00:00:00');
    const x = new Date(expected + 'T00:00:00');
    return Math.round((e.getTime() - x.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function checkDateMatch(extracted: string | null, expected: string): boolean {
  const diff = getDateDifferenceInDays(extracted, expected);
  if (diff === null) return false;
  return Math.abs(diff) <= 1;
}

function generateReason(type: string, extracted: unknown, expected: unknown, match: boolean): string {
  if (extracted == null) {
    return `Could not extract ${type} from receipt. Expected: ${JSON.stringify(expected)}.`;
  }
  if (match) {
    return `${type.charAt(0).toUpperCase() + type.slice(1)} matches expected value.`;
  }
  return `${type.charAt(0).toUpperCase() + type.slice(1)} "${extracted}" differs from expected "${expected}".`;
}

function generateDateReason(extracted: string | null, expected: string, match: boolean, dateDiff: number | null): string {
  if (extracted == null) {
    return `Could not extract date from receipt. Expected: ${expected}.`;
  }
  if (dateDiff === 0) {
    return `Extracted date ${extracted} matches expected date ${expected}.`;
  }
  if (dateDiff !== null && Math.abs(dateDiff) === 1) {
    const direction = dateDiff > 0 ? 'after' : 'before';
    return `Extracted date ${extracted} is 1 day ${direction} expected date ${expected}. Close match within tolerance.`;
  }
  if (dateDiff !== null) {
    const direction = dateDiff > 0 ? 'after' : 'before';
    return `Extracted date ${extracted} is ${Math.abs(dateDiff)} days ${direction} expected date ${expected}. Does not match.`;
  }
  return `Date "${extracted}" differs from expected "${expected}".`;
}

function createFallbackAnalysis(pr: PurchaseRequest, note?: string): AnalysisResult {
  return {
    extracted_vendor: null,
    extracted_amount: null,
    extracted_date: null,
    extracted_items: [],
    vendor_match: false,
    amount_match: false,
    date_match: false,
    vendor_reason: `Unable to verify vendor. Expected: "${pr.vendor_name}".`,
    amount_reason: `Unable to verify amount. Expected: $${pr.total_amount.toFixed(2)}.`,
    date_reason: `Unable to verify date. Expected: ${pr.expense_date}.`,
    expected_vendor: pr.vendor_name,
    expected_amount: pr.total_amount,
    expected_date: pr.expense_date,
    confidence_score: 0,
    recommendation: "review",
    concerns: ["Automated analysis could not extract receipt details. Manual review required."],
    analysis_notes: note || "Automated analysis could not be completed. Please review manually.",
    raw_extraction: {},
  };
}
