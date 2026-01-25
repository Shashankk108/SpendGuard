/**
 * Date formatting utilities that handle timezone conversion correctly
 *
 * IMPORTANT: When parsing dates in YYYY-MM-DD format, JavaScript's Date constructor
 * treats them as UTC midnight. This causes dates to shift to the previous day
 * in timezones behind UTC (e.g., US timezones).
 *
 * These utilities parse dates as local dates to avoid this issue.
 */

/**
 * Format a date string (YYYY-MM-DD) as a localized date
 * Example: "2026-01-25" → "Jan 25, 2026"
 */
export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return '';

  // Parse as local date to avoid timezone conversion
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  return date.toLocaleDateString('en-US', options || defaultOptions);
}

/**
 * Format a date string with full month name
 * Example: "2026-01-25" → "January 25, 2026"
 */
export function formatDateLong(dateStr: string): string {
  return formatDate(dateStr, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a datetime string (ISO 8601) with date and time
 * Example: "2026-01-25T14:30:00Z" → "Jan 25, 2026, 2:30 PM"
 */
export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format a datetime string for display with full date and time
 * Example: "2026-01-25T14:30:00Z" → "January 25, 2026 at 2:30 PM"
 */
export function formatDateTimeLong(dateStr: string): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Get relative time string (e.g., "2 hours ago", "3 days ago")
 */
export function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return formatDate(dateStr);
}
