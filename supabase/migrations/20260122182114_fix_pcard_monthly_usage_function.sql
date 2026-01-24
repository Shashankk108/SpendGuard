/*
  # Fix P-Card Monthly Usage Calculation

  Updates the get_pcard_monthly_usage function to:
  - Properly calculate spending for current calendar month only
  - Only count approved and pending requests
  - Reset balance at start of each month
*/

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
  v_period_start date;
  v_period_end date;
  v_total_spent numeric;
  v_count bigint;
BEGIN
  SELECT COALESCE(ps.monthly_limit, 15000)
  INTO v_monthly_limit
  FROM pcard_settings ps
  LIMIT 1;

  IF v_monthly_limit IS NULL THEN
    v_monthly_limit := 15000;
  END IF;

  v_period_start := date_trunc('month', target_month)::date;
  v_period_end := (date_trunc('month', target_month) + interval '1 month' - interval '1 day')::date;

  SELECT 
    COALESCE(SUM(pr.total_amount), 0),
    COUNT(pr.id)
  INTO v_total_spent, v_count
  FROM purchase_requests pr
  WHERE pr.status IN ('approved', 'pending')
    AND pr.expense_date >= v_period_start
    AND pr.expense_date <= v_period_end;

  RETURN QUERY
  SELECT 
    v_total_spent as total_spent,
    GREATEST(v_monthly_limit - v_total_spent, 0) as remaining_balance,
    v_monthly_limit as monthly_limit,
    v_count as transaction_count,
    v_period_start as period_start,
    v_period_end as period_end;
END;
$$;