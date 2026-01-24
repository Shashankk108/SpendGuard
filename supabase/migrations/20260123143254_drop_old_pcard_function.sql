/*
  # Drop old get_pcard_monthly_usage function variant

  Remove the old function that takes a date parameter
*/

DROP FUNCTION IF EXISTS get_pcard_monthly_usage(date);
