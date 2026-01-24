/*
  # Add Match Reason Fields to Receipt Analysis
  
  1. Changes
    - Add `vendor_reason` (text) - explains why vendor matches or doesn't match
    - Add `amount_reason` (text) - explains why amount matches or doesn't match  
    - Add `date_reason` (text) - explains why date matches or doesn't match
    - Add `expected_vendor` (text) - the vendor name from purchase request
    - Add `expected_amount` (numeric) - the amount from purchase request
    - Add `expected_date` (date) - the date from purchase request
    
  2. Purpose
    - Provide detailed explanations for each comparison
    - Show expected vs found values for transparency
*/

ALTER TABLE receipt_analyses 
ADD COLUMN IF NOT EXISTS vendor_reason text,
ADD COLUMN IF NOT EXISTS amount_reason text,
ADD COLUMN IF NOT EXISTS date_reason text,
ADD COLUMN IF NOT EXISTS expected_vendor text,
ADD COLUMN IF NOT EXISTS expected_amount numeric(12, 2),
ADD COLUMN IF NOT EXISTS expected_date date;
