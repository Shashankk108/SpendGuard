/*
  # Create User Stories Table

  1. New Tables
    - `user_stories`
      - `id` (uuid, primary key)
      - `story_id` (text, unique) - e.g., "US-001"
      - `persona` (text) - User persona (Employee, Approver, etc.)
      - `title` (text) - Short title for the story
      - `want_statement` (text) - "I want to..." part
      - `benefit_statement` (text) - "So that..." part
      - `problem_context` (text) - Current pain points/Maconomy issues
      - `solution_description` (text) - How SpendGuard solves it
      - `category` (text) - Category grouping
      - `priority` (text) - high, medium, low
      - `status` (text) - draft, active, completed
      - `contributor_name` (text) - Name of person who added
      - `contributor_email` (text) - Email of person who added
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `user_stories` table
    - Allow authenticated users to read all stories
    - Allow admins to insert/update/delete stories
    - Allow authenticated users to insert their own stories (with contributor info)
*/

CREATE TABLE IF NOT EXISTS user_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id text UNIQUE NOT NULL,
  persona text NOT NULL,
  title text NOT NULL,
  want_statement text NOT NULL,
  benefit_statement text NOT NULL,
  problem_context text,
  solution_description text,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  contributor_name text,
  contributor_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read user stories"
  ON user_stories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert user stories"
  ON user_stories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR contributor_email IS NOT NULL
  );

CREATE POLICY "Admins can update user stories"
  ON user_stories
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete user stories"
  ON user_stories
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION generate_story_id()
RETURNS text AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(story_id FROM 4) AS integer)), 0) + 1
  INTO next_num
  FROM user_stories;
  
  RETURN 'US-' || LPAD(next_num::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

INSERT INTO user_stories (story_id, persona, title, want_statement, benefit_statement, problem_context, solution_description, category, priority, status) VALUES
('US-001', 'Employee', 'Mobile-First Quick Submission', 
 'submit a purchase request in under 2 minutes from my phone',
 'I can capture expenses immediately after a vendor meeting or office supply run without needing to return to my desk',
 'Maconomy is desktop-only, requires VPN, and takes 15+ clicks through nested menus. Employees delay submissions until they are at their desks, often forgetting receipts or details.',
 'SpendGuard offers a responsive mobile interface with smart defaults, auto-fill from past vendors, and camera-based receipt capture, reducing submission time to under 2 minutes.',
 'submission', 'high', 'active'),

('US-002', 'Approver (e.g., Ryan Greene)', 'One-Tap Approval Queue',
 'see all pending purchase requests in a single prioritized queue and approve or reject with one tap',
 'I can clear my approval backlog during a 5-minute coffee break instead of scheduling dedicated time at my computer',
 'Maconomy requires navigating through multiple screens to find pending items. Approvers must open each request individually, and there''s no batch processing.',
 'SpendGuard presents a clean approval queue sorted by urgency/age with swipe-to-approve, tap-to-reject, and optional batch approval for low-value items.',
 'approval', 'high', 'active'),

('US-003', 'Employee', 'Real-Time Status Visibility',
 'instantly see where my purchase request is in the approval chain without having to email anyone',
 'I can confidently tell vendors when to expect payment and avoid embarrassing follow-ups',
 'Maconomy shows only "pending" with no visibility into whether it is with Approver 1 or stuck in limbo. Employees email admins asking "where''s my request?"',
 'SpendGuard displays a visual journey tracker showing exactly which approver has the request, how long it has been there, and estimated completion time.',
 'tracking', 'high', 'active'),

('US-004', 'IT Leadership / P-Card Manager', 'Monthly P-Card Spend Dashboard',
 'see total P-Card spend at a glance with remaining monthly budget and top spending categories',
 'I can make informed decisions about discretionary purchases before hitting limits',
 'P-Card tracking in Maconomy requires manual Excel exports and pivot tables. Leadership has no real-time visibility into burn rate.',
 'SpendGuard provides a live dashboard widget showing current month spend, remaining budget, projected end-of-month usage, and category breakdown.',
 'reporting', 'high', 'active'),

('US-005', 'Finance/Admin (e.g., Leadership Team)', 'Automated Receipt Matching',
 'automatically match uploaded receipts to approved purchase requests using AI',
 'I spend less time manually verifying receipts and can focus on exceptions only',
 'Receipt verification in Maconomy is 100% manual. Admins compare paper receipts against request forms, leading to backlogs and errors.',
 'SpendGuard uses AI-powered receipt scanning to extract vendor, amount, and date, then auto-matches to pending requests with confidence scoring.',
 'receipts', 'high', 'active'),

('US-006', 'New Employee', 'Guided Purchase Request Wizard',
 'have a step-by-step wizard guide me through my first purchase request with helpful tips',
 'I submit compliant requests on my first try without having to ask colleagues for help',
 'Maconomy has no onboarding flow. New employees submit incorrect requests that get rejected, creating rework for everyone.',
 'SpendGuard offers an optional guided mode with inline help, field validation, and smart suggestions that ensure first-time-right submissions.',
 'submission', 'medium', 'active'),

('US-007', 'Approver', 'Delegation During PTO',
 'delegate my approval authority to a colleague when I am out of office',
 'purchase requests do not get stuck waiting for me while I am on vacation',
 'Maconomy has no delegation feature. Approvers must either pre-approve everything or let requests pile up during PTO.',
 'SpendGuard allows temporary delegation with date ranges, optional spending limits, and automatic reversion when the approver returns.',
 'approval', 'medium', 'active'),

('US-008', 'Finance Admin', 'AI-Assisted Receipt Verification',
 'have AI highlight mismatches between submitted receipts and purchase requests',
 'I can quickly spot discrepancies without manually comparing every field',
 'Manual verification is error-prone and time-consuming. Small discrepancies (wrong date, partial amounts) slip through.',
 'SpendGuard AI extracts receipt data and flags mismatches in vendor name, amount (with tolerance), and date, showing side-by-side comparison.',
 'receipts', 'high', 'active'),

('US-009', 'Employee', 'Save Draft and Resume Later',
 'save an incomplete purchase request as a draft and return to finish it later',
 'I do not lose my progress if I get interrupted or need to gather more information',
 'Maconomy times out sessions frequently and does not auto-save. Employees lose work and have to start over.',
 'SpendGuard auto-saves drafts every 30 seconds and allows explicit draft saving with easy resumption from My Requests.',
 'submission', 'medium', 'active'),

('US-010', 'IT Leadership', 'Vendor Spending Analytics',
 'see spending trends by vendor over time with the ability to identify consolidation opportunities',
 'I can negotiate better rates with top vendors and reduce vendor sprawl',
 'Maconomy vendor reporting requires custom report building and manual data manipulation.',
 'SpendGuard provides vendor analytics showing spend over time, frequency, average transaction size, and alerts for vendor concentration.',
 'reporting', 'medium', 'active'),

('US-011', 'Approver', 'Mobile Push Notifications',
 'receive push notifications when a purchase request needs my approval',
 'I never miss urgent requests and can maintain fast turnaround times',
 'Maconomy sends emails that get buried in inboxes. Approvers only check when they remember or are reminded.',
 'SpendGuard sends smart push notifications with preview info, allowing quick action directly from the notification.',
 'approval', 'medium', 'active'),

('US-012', 'Employee', 'Receipt Photo Capture',
 'take a photo of my receipt directly in the app and have it automatically attached to my request',
 'I do not need to scan documents or email files to myself',
 'Maconomy requires separate scanning and file upload. Many employees skip this step, causing compliance issues.',
 'SpendGuard integrates camera capture with auto-crop, enhancement, and immediate attachment to the active request.',
 'receipts', 'high', 'active'),

('US-013', 'Finance Admin', 'Export Reports to Excel',
 'export purchase request data and receipt summaries to Excel for end-of-month reconciliation',
 'I can continue using familiar tools while benefiting from SpendGuard''s data collection',
 'Maconomy exports are clunky and often require reformatting.',
 'SpendGuard offers one-click Excel export with customizable columns, date ranges, and pre-formatted for accounting systems.',
 'reporting', 'medium', 'active'),

('US-014', 'All Users', 'Searchable Request History',
 'search my past purchase requests by vendor, amount, date, or keywords',
 'I can quickly find past requests for reference or resubmission',
 'Maconomy history is paginated and non-searchable. Finding old requests requires scrolling through pages.',
 'SpendGuard provides instant search with filters, sorting, and the ability to clone past requests for similar purchases.',
 'tracking', 'medium', 'active'),

('US-015', 'Approver', 'Request Context and History',
 'see the requester''s previous purchase history and any notes when reviewing a request',
 'I can make informed approval decisions with full context',
 'Maconomy shows only the current request with no requester history or context.',
 'SpendGuard displays requester profile, past request patterns, approval rates, and any flagged items to inform decision-making.',
 'approval', 'low', 'active'),

('US-016', 'IT Leadership', 'Budget vs. Actual Dashboard',
 'compare actual spending against allocated department budgets in real-time',
 'I can proactively manage budget utilization and forecast overruns',
 'Budget tracking in Maconomy requires pulling multiple reports and manual comparison.',
 'SpendGuard shows live budget gauges, burn rate trends, and alerts when spending exceeds thresholds.',
 'reporting', 'high', 'active'),

('US-017', 'Employee', 'Recurring Purchase Templates',
 'create templates for purchases I make regularly (e.g., monthly software renewals)',
 'I save time on routine submissions and ensure consistency',
 'Every request in Maconomy starts from scratch, even for identical recurring purchases.',
 'SpendGuard allows saving request templates with pre-filled values and optional scheduling for auto-submission reminders.',
 'submission', 'low', 'active'),

('US-018', 'System', 'GoDaddy Receipt Auto-Fetch',
 'automatically retrieve receipts for GoDaddy domain and hosting purchases',
 'users do not need to manually download and upload receipts for common vendor transactions',
 'GoDaddy purchases require employees to log into GoDaddy, find the invoice, download it, and upload to the procurement system.',
 'SpendGuard integrates with GoDaddy API to auto-fetch order details and receipts, matching them to corresponding purchase requests.',
 'receipts', 'high', 'active'),

('US-019', 'Finance Admin', 'Audit Trail and Compliance',
 'access a complete audit trail of all actions taken on any purchase request',
 'I can demonstrate compliance during audits and investigate discrepancies',
 'Maconomy has limited audit logging and no easy way to see the full history of a request.',
 'SpendGuard maintains immutable audit logs with timestamps, user actions, IP addresses, and before/after snapshots.',
 'compliance', 'high', 'active'),

('US-020', 'Employee', 'Clear Rejection Feedback',
 'receive clear, actionable feedback when my purchase request is rejected',
 'I can correct issues quickly and resubmit without guessing what went wrong',
 'Maconomy shows only "rejected" with no reason. Employees must email approvers to understand why.',
 'SpendGuard requires rejection reasons and displays them prominently with suggestions for correction and one-click resubmission.',
 'approval', 'medium', 'active');
