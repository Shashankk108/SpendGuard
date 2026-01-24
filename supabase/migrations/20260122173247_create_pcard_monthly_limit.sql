/*
  # Create P-Card Monthly Limit Tracking

  1. New Tables
    - `pcard_settings`
      - `id` (uuid, primary key)
      - `monthly_limit` (numeric) - The monthly spending limit ($15,000)
      - `card_name` (text) - Name of the P-Card (IT)
      - `reset_day` (integer) - Day of month when limit resets (1 = first day)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `pcard_settings`
    - All authenticated users can view settings
    - Only admins can modify settings

  3. Initial Data
    - Insert default P-Card with $15,000 monthly limit
*/

CREATE TABLE IF NOT EXISTS pcard_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_name text NOT NULL DEFAULT 'IT',
  monthly_limit numeric NOT NULL DEFAULT 15000,
  reset_day integer NOT NULL DEFAULT 1 CHECK (reset_day >= 1 AND reset_day <= 28),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE pcard_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pcard settings"
  ON pcard_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage pcard settings"
  ON pcard_settings
  FOR ALL
  TO authenticated
  USING (is_admin());

INSERT INTO pcard_settings (card_name, monthly_limit, reset_day)
VALUES ('IT', 15000, 1)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION get_pcard_monthly_usage(target_month date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  total_spent numeric,
  remaining_balance numeric,
  monthly_limit numeric,
  transaction_count bigint,
  period_start date,
  period_end date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monthly_limit numeric;
  v_reset_day integer;
  v_period_start date;
  v_period_end date;
BEGIN
  SELECT ps.monthly_limit, ps.reset_day
  INTO v_monthly_limit, v_reset_day
  FROM pcard_settings ps
  LIMIT 1;

  IF v_monthly_limit IS NULL THEN
    v_monthly_limit := 15000;
    v_reset_day := 1;
  END IF;

  v_period_start := date_trunc('month', target_month)::date + (v_reset_day - 1);
  IF target_month < v_period_start THEN
    v_period_start := (date_trunc('month', target_month) - interval '1 month')::date + (v_reset_day - 1);
  END IF;
  v_period_end := (v_period_start + interval '1 month')::date - 1;

  RETURN QUERY
  SELECT 
    COALESCE(SUM(pr.total_amount), 0)::numeric as total_spent,
    (v_monthly_limit - COALESCE(SUM(pr.total_amount), 0))::numeric as remaining_balance,
    v_monthly_limit as monthly_limit,
    COUNT(pr.id)::bigint as transaction_count,
    v_period_start as period_start,
    v_period_end as period_end
  FROM purchase_requests pr
  WHERE pr.status IN ('approved', 'pending')
    AND pr.expense_date >= v_period_start
    AND pr.expense_date <= v_period_end;
END;
$$;