import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEMO_USERS = [
  {
    email: "sarah.johnson@demo.spendguard.com",
    password: "demo123",
    full_name: "Sarah Johnson",
    p_card_name: "SARAH JOHNSON",
    department: "Marketing",
    role: "employee",
  },
  {
    email: "merrill.raman@demo.spendguard.com",
    password: "demo123",
    full_name: "Merrill Raman",
    p_card_name: "MERRILL RAMAN",
    department: "Operations",
    role: "approver",
  },
  {
    email: "ryan.greene@demo.spendguard.com",
    password: "demo123",
    full_name: "Ryan Greene",
    p_card_name: "RYAN GREENE",
    department: "Finance",
    role: "admin",
  },
];

const SAMPLE_REQUESTS = [
  {
    cardholder_name: "Sarah Johnson",
    p_card_name: "SARAH JOHNSON",
    expense_date: "2026-01-15",
    vendor_name: "Office Depot",
    vendor_location: "Austin, TX",
    purchase_amount: 75.50,
    tax_amount: 6.21,
    shipping_amount: 0,
    total_amount: 81.71,
    business_purpose: "Office supplies for Q1 marketing campaign",
    detailed_description: "Notebooks, pens, folders, and presentation materials for upcoming client meetings",
    category: "Office Supplies",
    status: "approved",
  },
  {
    cardholder_name: "Sarah Johnson",
    p_card_name: "SARAH JOHNSON",
    expense_date: "2026-01-17",
    vendor_name: "Adobe Systems",
    vendor_location: "San Jose, CA",
    purchase_amount: 599.88,
    tax_amount: 0,
    shipping_amount: 0,
    total_amount: 599.88,
    business_purpose: "Annual Creative Cloud subscription renewal",
    detailed_description: "Adobe Creative Cloud team license for design work - includes Photoshop, Illustrator, InDesign",
    category: "Software/Subscriptions",
    is_software_subscription: true,
    it_license_confirmed: true,
    status: "approved",
  },
  {
    cardholder_name: "Sarah Johnson",
    p_card_name: "SARAH JOHNSON",
    expense_date: "2026-01-18",
    vendor_name: "Staples Business",
    vendor_location: "Online",
    purchase_amount: 1250.00,
    tax_amount: 103.13,
    shipping_amount: 0,
    total_amount: 1353.13,
    business_purpose: "Conference room equipment upgrade",
    detailed_description: "Presentation screen, wireless presenter, and whiteboard markers for main conference room",
    category: "Office Equipment",
    status: "pending",
  },
  {
    cardholder_name: "Sarah Johnson",
    p_card_name: "SARAH JOHNSON",
    expense_date: "2026-01-19",
    vendor_name: "Vistaprint",
    vendor_location: "Online",
    purchase_amount: 425.00,
    tax_amount: 35.06,
    shipping_amount: 15.99,
    total_amount: 476.05,
    business_purpose: "Marketing collateral for trade show",
    detailed_description: "Business cards, brochures, and banners for upcoming industry conference in February",
    category: "Marketing Materials",
    status: "pending",
  },
  {
    cardholder_name: "Sarah Johnson",
    p_card_name: "SARAH JOHNSON",
    expense_date: "2026-01-10",
    vendor_name: "Amazon Business",
    vendor_location: "Online",
    purchase_amount: 89.99,
    tax_amount: 7.42,
    shipping_amount: 0,
    total_amount: 97.41,
    business_purpose: "Team productivity tools",
    detailed_description: "Desk organizers and cable management supplies for marketing team workstations",
    category: "Office Supplies",
    status: "approved",
  },
  {
    cardholder_name: "Sarah Johnson",
    p_card_name: "SARAH JOHNSON",
    expense_date: "2026-01-12",
    vendor_name: "Canva",
    vendor_location: "Online",
    purchase_amount: 149.99,
    tax_amount: 0,
    shipping_amount: 0,
    total_amount: 149.99,
    business_purpose: "Design platform subscription",
    detailed_description: "Canva Pro annual subscription for social media graphics and quick design work",
    category: "Software/Subscriptions",
    is_software_subscription: true,
    it_license_confirmed: true,
    status: "rejected",
    rejection_reason: "Duplicate subscription - team already has access through enterprise account",
  },
  {
    cardholder_name: "Merrill Raman",
    p_card_name: "MERRILL RAMAN",
    expense_date: "2026-01-16",
    vendor_name: "Dell Technologies",
    vendor_location: "Round Rock, TX",
    purchase_amount: 8500.00,
    tax_amount: 701.25,
    shipping_amount: 0,
    total_amount: 9201.25,
    business_purpose: "Department server upgrade",
    detailed_description: "PowerEdge server for operations department data processing and backup systems",
    category: "IT Equipment",
    status: "pending",
  },
  {
    cardholder_name: "Ryan Greene",
    p_card_name: "RYAN GREENE",
    expense_date: "2026-01-14",
    vendor_name: "QuickBooks",
    vendor_location: "Online",
    purchase_amount: 45000.00,
    tax_amount: 0,
    shipping_amount: 0,
    total_amount: 45000.00,
    business_purpose: "Enterprise accounting software upgrade",
    detailed_description: "QuickBooks Enterprise Diamond subscription with advanced inventory and enhanced payroll for 50 users",
    category: "Software/Subscriptions",
    is_software_subscription: true,
    it_license_confirmed: true,
    status: "pending",
  },
];

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

    const results = {
      usersCreated: [] as string[],
      usersExisted: [] as string[],
      requestsCreated: 0,
      approversUpdated: 0,
      errors: [] as string[],
    };

    const userIdMap: Record<string, string> = {};

    for (const user of DEMO_USERS) {
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === user.email);

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;
        results.usersExisted.push(user.email);
      } else {
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
        });

        if (createError) {
          results.errors.push(`Failed to create user ${user.email}: ${createError.message}`);
          continue;
        }

        userId = newUser.user.id;
        results.usersCreated.push(user.email);
      }

      userIdMap[user.email] = userId;

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          id: userId,
          email: user.email,
          full_name: user.full_name,
          p_card_name: user.p_card_name,
          department: user.department,
          role: user.role,
        });

      if (profileError) {
        results.errors.push(`Failed to create profile for ${user.email}: ${profileError.message}`);
      }
    }

    if (userIdMap["merrill.raman@demo.spendguard.com"]) {
      const { error } = await supabaseAdmin
        .from("approvers")
        .update({
          user_id: userIdMap["merrill.raman@demo.spendguard.com"],
          email: "merrill.raman@demo.spendguard.com"
        })
        .eq("name", "Merrill Raman");

      if (!error) results.approversUpdated++;
    }

    if (userIdMap["ryan.greene@demo.spendguard.com"]) {
      const { error } = await supabaseAdmin
        .from("approvers")
        .update({
          user_id: userIdMap["ryan.greene@demo.spendguard.com"],
          email: "ryan.greene@demo.spendguard.com"
        })
        .eq("name", "Ryan Greene");

      if (!error) results.approversUpdated++;
    }

    const sarahId = userIdMap["sarah.johnson@demo.spendguard.com"];
    const merrillId = userIdMap["merrill.raman@demo.spendguard.com"];
    const ryanId = userIdMap["ryan.greene@demo.spendguard.com"];

    if (sarahId || merrillId || ryanId) {
      const { data: existingRequests } = await supabaseAdmin
        .from("purchase_requests")
        .select("id")
        .limit(1);

      if (!existingRequests || existingRequests.length === 0) {
        for (const request of SAMPLE_REQUESTS) {
          let requesterId: string | undefined;

          if (request.cardholder_name === "Sarah Johnson") {
            requesterId = sarahId;
          } else if (request.cardholder_name === "Merrill Raman") {
            requesterId = merrillId;
          } else if (request.cardholder_name === "Ryan Greene") {
            requesterId = ryanId;
          }

          if (!requesterId) continue;

          const { error } = await supabaseAdmin
            .from("purchase_requests")
            .insert({
              requester_id: requesterId,
              ...request,
            });

          if (!error) {
            results.requestsCreated++;
          } else {
            results.errors.push(`Failed to create request: ${error.message}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Demo data seeding complete",
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
