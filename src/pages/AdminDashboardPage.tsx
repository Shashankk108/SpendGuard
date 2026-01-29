import { useState, useEffect } from 'react';
import {
  Database,
  Mail,
  History,
  Users,
  Play,
  FileText,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Copy,
  Check,
  Settings,
  CreditCard,
  Trash2,
  RotateCcw,
  Shield,
  AlertTriangle,
  Search,
  User,
  Archive,
  X,
  Zap,
  BookOpen,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import PCardWidget from '../components/PCardWidget';
import UserStoriesTab from '../components/admin/UserStoriesTab';
import type { AuditLog, EmailNotification, Profile } from '../types/database';

type TabType = 'overview' | 'stories' | 'sql' | 'audit' | 'emails' | 'users' | 'controls';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  confirmButtonText: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ isOpen, title, message, confirmText, confirmButtonText, danger, loading, onConfirm, onCancel }: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (!isOpen) setInputValue('');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className={`px-6 py-4 ${danger ? 'bg-red-50 border-b border-red-100' : 'bg-slate-50 border-b border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${danger ? 'bg-red-100' : 'bg-blue-100'}`}>
              <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-600' : 'text-blue-600'}`} />
            </div>
            <h3 className={`text-lg font-semibold ${danger ? 'text-red-800' : 'text-slate-800'}`}>{title}</h3>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">{message}</p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Type <code className={`px-2 py-0.5 rounded text-sm ${danger ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{confirmText}</code> to confirm:
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 ${danger ? 'border-red-200 focus:ring-red-500' : 'border-slate-200 focus:ring-blue-500'}`}
              placeholder="Type confirmation..."
              autoFocus
            />
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={inputValue !== confirmText || loading}
            className={`px-4 py-2 text-white rounded-lg font-medium transition-colors flex items-center gap-2 ${
              danger
                ? 'bg-red-600 hover:bg-red-700 disabled:bg-slate-300'
                : 'bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300'
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}

interface EmployeeStats {
  employee: {
    id: string;
    full_name: string;
    email: string;
    department: string;
    role: string;
    created_at: string;
  };
  stats: {
    total_requests: number;
    approved_requests: number;
    rejected_requests: number;
    pending_requests: number;
    total_spent: number;
    avg_amount: number;
    approval_rate: number;
    first_request: string | null;
    last_request: string | null;
  };
}

interface PCardUsage {
  current_usage: number;
  monthly_limit: number;
  remaining: number;
  utilization_percent: number;
  hard_stop_enabled: boolean;
  is_limit_reached: boolean;
  month: string;
}

interface QueryResult {
  data: Record<string, unknown>[] | null;
  error: string | null;
  rowCount: number;
  executionTime: number;
}

const PREBUILT_QUERIES = [
  {
    name: 'Spending by Department',
    description: 'Total approved spending grouped by department',
    query: `SELECT
  p.department,
  COUNT(pr.id) as request_count,
  SUM(pr.total_amount) as total_spent
FROM purchase_requests pr
JOIN profiles p ON pr.requester_id = p.id
WHERE pr.status = 'approved'
GROUP BY p.department
ORDER BY total_spent DESC;`,
  },
  {
    name: 'Requests by Status',
    description: 'Count of requests in each status',
    query: `SELECT
  status,
  COUNT(*) as count,
  SUM(total_amount) as total_amount
FROM purchase_requests
GROUP BY status
ORDER BY count DESC;`,
  },
  {
    name: 'Top Vendors',
    description: 'Most frequently used vendors',
    query: `SELECT
  vendor_name,
  COUNT(*) as request_count,
  SUM(total_amount) as total_spent
FROM purchase_requests
WHERE status = 'approved'
GROUP BY vendor_name
ORDER BY total_spent DESC
LIMIT 10;`,
  },
  {
    name: 'Recent Activity',
    description: 'Last 20 audit log entries',
    query: `SELECT
  created_at,
  user_email,
  action,
  entity_type,
  entity_id
FROM audit_logs
ORDER BY created_at DESC
LIMIT 20;`,
  },
  {
    name: 'User Activity Summary',
    description: 'Request counts per user',
    query: `SELECT
  p.full_name,
  p.email,
  p.role,
  COUNT(pr.id) as total_requests,
  SUM(CASE WHEN pr.status = 'approved' THEN 1 ELSE 0 END) as approved,
  SUM(CASE WHEN pr.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
  SUM(CASE WHEN pr.status = 'pending' THEN 1 ELSE 0 END) as pending
FROM profiles p
LEFT JOIN purchase_requests pr ON p.id = pr.requester_id
GROUP BY p.id, p.full_name, p.email, p.role
ORDER BY total_requests DESC;`,
  },
  {
    name: 'Pending Approvals Queue',
    description: 'All pending requests awaiting approval',
    query: `SELECT
  pr.id,
  p.full_name as requester,
  pr.vendor_name,
  pr.total_amount,
  pr.business_purpose,
  pr.created_at
FROM purchase_requests pr
JOIN profiles p ON pr.requester_id = p.id
WHERE pr.status = 'pending'
ORDER BY pr.created_at ASC;`,
  },
];

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM profiles LIMIT 10;');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [emails, setEmails] = useState<EmailNotification[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [stats, setStats] = useState({
    totalRequests: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    totalSpend: 0,
    avgProcessingTime: 0,
  });
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);
  const [pcardUsage, setPcardUsage] = useState<PCardUsage | null>(null);
  const [newLimit, setNewLimit] = useState('');
  const [controlLoading, setControlLoading] = useState<string | null>(null);
  const [controlMessage, setControlMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'clear' | 'truncate' | 'reset' | null;
  }>({ isOpen: false, type: null });
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats | null>(null);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [godaddyKey, setGodaddyKey] = useState('');
  const [godaddySecret, setGodaddySecret] = useState('');
  const [godaddyShopperId, setGodaddyShopperId] = useState('');
  const [godaddyConfigured, setGodaddyConfigured] = useState(false);

  useEffect(() => {
    loadData();
    loadGodaddyCredentials();
  }, []);

  async function loadData() {
    setLoading(true);
    await Promise.all([
      loadStats(),
      loadAuditLogs(),
      loadEmails(),
      loadUsers(),
      loadPcardUsage(),
    ]);
    setLoading(false);
  }

  async function loadPcardUsage() {
    const { data, error } = await supabase.rpc('get_pcard_monthly_usage');
    if (!error && data) {
      setPcardUsage(data as PCardUsage);
      setNewLimit(String(data.monthly_limit));
    }
  }

  async function loadStats() {
    const { data: requests } = await supabase
      .from('purchase_requests')
      .select('status, total_amount, created_at, updated_at');

    if (requests) {
      const approved = requests.filter(r => r.status === 'approved');
      const processingTimes = approved.map(r => {
        const created = new Date(r.created_at).getTime();
        const updated = new Date(r.updated_at).getTime();
        return (updated - created) / (1000 * 60 * 60);
      });

      setStats({
        totalRequests: requests.length,
        pendingRequests: requests.filter(r => r.status === 'pending').length,
        approvedRequests: approved.length,
        rejectedRequests: requests.filter(r => r.status === 'rejected').length,
        totalSpend: approved.reduce((sum, r) => sum + (r.total_amount || 0), 0),
        avgProcessingTime: processingTimes.length > 0
          ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
          : 0,
      });
    }
  }

  async function loadAuditLogs() {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setAuditLogs(data);
  }

  async function loadEmails() {
    const { data } = await supabase
      .from('email_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setEmails(data);
  }

  async function loadUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setUsers(data);
  }

  async function loadGodaddyCredentials() {
    const { data } = await supabase
      .from('api_credentials')
      .select('*')
      .eq('service_name', 'godaddy')
      .maybeSingle();

    if (data) {
      setGodaddyKey(data.api_key || '');
      setGodaddySecret(data.api_secret || '');
      setGodaddyShopperId(data.shopper_id || '');
      setGodaddyConfigured(true);
    }
  }

  async function handleSaveGodaddyCredentials() {
    if (!godaddyKey.trim() || !godaddySecret.trim()) {
      setControlMessage({ type: 'error', text: 'API Key and Secret are required' });
      return;
    }

    setControlLoading('godaddy');
    setControlMessage(null);

    const { error } = await supabase.rpc('upsert_api_credentials', {
      p_service_name: 'godaddy',
      p_api_key: godaddyKey.trim(),
      p_api_secret: godaddySecret.trim(),
      p_shopper_id: godaddyShopperId.trim() || null,
      p_additional_config: {}
    });

    if (error) {
      setControlMessage({ type: 'error', text: error.message });
    } else {
      setGodaddyConfigured(true);
      setControlMessage({
        type: 'success',
        text: 'GoDaddy credentials saved successfully! Restart your Edge Functions for changes to take effect.'
      });
      await loadAuditLogs();
    }
    setControlLoading(null);
  }

  async function executeQuery() {
    setQueryLoading(true);
    const startTime = performance.now();

    try {
      const { data, error } = await supabase.rpc('execute_sql_query', {
        query_text: sqlQuery,
      });

      const endTime = performance.now();

      if (error) {
        setQueryResult({
          data: null,
          error: error.message,
          rowCount: 0,
          executionTime: endTime - startTime,
        });
      } else {
        setQueryResult({
          data: data || [],
          error: null,
          rowCount: data?.length || 0,
          executionTime: endTime - startTime,
        });
      }
    } catch (err) {
      const endTime = performance.now();
      setQueryResult({
        data: null,
        error: err instanceof Error ? err.message : 'Query execution failed',
        rowCount: 0,
        executionTime: endTime - startTime,
      });
    }

    setQueryLoading(false);
  }

  function loadPrebuiltQuery(query: string) {
    setSqlQuery(query);
    setQueryResult(null);
  }

  function copyQuery(query: string, name: string) {
    navigator.clipboard.writeText(query);
    setCopiedQuery(name);
    setTimeout(() => setCopiedQuery(null), 2000);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString();
  }

  async function handleResetPcardLimit() {
    const limitValue = parseFloat(newLimit);
    if (isNaN(limitValue) || limitValue < 0) {
      setControlMessage({ type: 'error', text: 'Please enter a valid positive number' });
      return;
    }

    setControlLoading('limit');
    setControlMessage(null);

    const { data, error } = await supabase.rpc('admin_reset_pcard_limit', { new_limit: limitValue });

    if (error) {
      setControlMessage({ type: 'error', text: error.message });
    } else {
      setControlMessage({ type: 'success', text: `P-Card limit updated from $${data.old_limit?.toLocaleString()} to $${data.new_limit?.toLocaleString()}` });
      await loadPcardUsage();
      await loadAuditLogs();
    }
    setControlLoading(null);
  }

  async function handleToggleHardStop() {
    if (!pcardUsage) return;

    setControlLoading('hardstop');
    setControlMessage(null);

    const { data, error } = await supabase.rpc('admin_set_hard_stop', { enabled: !pcardUsage.hard_stop_enabled });

    if (error) {
      setControlMessage({ type: 'error', text: error.message });
    } else {
      setControlMessage({ type: 'success', text: data.message });
      await loadPcardUsage();
      await loadAuditLogs();
    }
    setControlLoading(null);
  }

  async function handleResetMonthlyUsage() {
    setControlLoading('reset');
    setControlMessage(null);

    const { data, error } = await supabase.rpc('admin_reset_monthly_usage');

    if (error) {
      setControlMessage({ type: 'error', text: error.message });
    } else {
      setControlMessage({ type: 'success', text: `Monthly usage reset. ${data.archived_count} requests archived ($${data.previous_usage?.toLocaleString()})` });
      await loadPcardUsage();
      await loadStats();
      await loadAuditLogs();
    }
    setControlLoading(null);
  }

  async function handleClearAllPurchases() {
    setControlLoading('clear');
    setControlMessage(null);

    const { data, error } = await supabase.rpc('admin_clear_all_purchases', {
      confirm_text: 'CONFIRM_DELETE_ALL_PURCHASES',
      create_backup: true
    });

    if (error) {
      setControlMessage({ type: 'error', text: error.message });
    } else {
      setControlMessage({ type: 'success', text: `All data cleared: ${data.deleted_requests} requests, ${data.deleted_receipts} receipts. Backup created for recovery.` });
      await loadPcardUsage();
      await loadStats();
      await loadAuditLogs();
    }
    setControlLoading(null);
    setConfirmDialog({ isOpen: false, type: null });
  }

  async function handleTruncateAll() {
    setControlLoading('truncate');
    setControlMessage(null);

    const { data, error } = await supabase.rpc('admin_truncate_all_data', {
      confirm_text: 'PERMANENTLY_DELETE_EVERYTHING'
    });

    if (error) {
      setControlMessage({ type: 'error', text: error.message });
    } else {
      setControlMessage({ type: 'success', text: data.message });
      await loadPcardUsage();
      await loadStats();
      await loadAuditLogs();
    }
    setControlLoading(null);
    setConfirmDialog({ isOpen: false, type: null });
  }

  async function loadEmployeeStats(employeeId: string) {
    setEmployeeLoading(true);
    setEmployeeStats(null);

    const { data, error } = await supabase.rpc('admin_get_employee_stats', { employee_id: employeeId });

    if (error) {
      setControlMessage({ type: 'error', text: error.message });
    } else {
      setEmployeeStats(data as EmployeeStats);
    }
    setEmployeeLoading(false);
  }

  const filteredUsers = users.filter(user =>
    user.full_name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    user.email?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    user.department?.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Admin Dashboard</h1>
        <p className="text-slate-500 mt-1">System overview, reports, and database tools</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'stories', label: 'User Stories', icon: BookOpen },
          { id: 'controls', label: 'Admin Controls', icon: Settings },
          { id: 'sql', label: 'SQL Console', icon: Database },
          { id: 'audit', label: 'Audit Trail', icon: History },
          { id: 'emails', label: 'Email Log', icon: Mail },
          { id: 'users', label: 'Users', icon: Users },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-1">
              <PCardWidget />
            </div>
            <div className="lg:col-span-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={FileText}
                label="Total Requests"
                value={stats.totalRequests}
                color="blue"
              />
              <StatCard
                icon={Clock}
                label="Pending"
                value={stats.pendingRequests}
                color="amber"
              />
              <StatCard
                icon={CheckCircle}
                label="Approved"
                value={stats.approvedRequests}
                color="emerald"
              />
              <StatCard
                icon={XCircle}
                label="Rejected"
                value={stats.rejectedRequests}
                color="red"
              />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Total Approved Spend</h3>
                  <p className="text-sm text-slate-500">All time</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-800">
                ${stats.totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Avg Processing Time</h3>
                  <p className="text-sm text-slate-500">Hours to approval</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-800">
                {stats.avgProcessingTime.toFixed(1)}h
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-800 mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {auditLogs.slice(0, 5).map((log) => {
                const changes = log.changes as Record<string, unknown> | null;
                const getActivityDescription = () => {
                  if (changes?.action === 'ADMIN_CLEAR_ALL_PURCHASES') {
                    return 'Admin cleared all purchase data';
                  }
                  if (changes?.action === 'ADMIN_TRUNCATE_ALL_DATA') {
                    return 'Admin permanently deleted all data';
                  }
                  if (changes?.action === 'ADMIN_RESET_MONTHLY_USAGE') {
                    return `Admin reset monthly usage (archived ${changes.archived_count || 0} requests)`;
                  }
                  if (changes?.action === 'ADMIN_SET_LIMIT') {
                    return `Admin set monthly limit to $${(changes.new_limit as number)?.toLocaleString() || 0}`;
                  }
                  if (changes?.action === 'ADMIN_SET_HARD_STOP') {
                    return `Admin ${changes.hard_stop_enabled ? 'enabled' : 'disabled'} hard stop`;
                  }

                  const actionMap: Record<string, string> = {
                    INSERT: 'Created',
                    UPDATE: 'Updated',
                    DELETE: 'Deleted',
                  };
                  const entityMap: Record<string, string> = {
                    purchase_requests: 'purchase request',
                    purchase_receipts: 'receipt',
                    approval_signatures: 'approval',
                    profiles: 'profile',
                    budgets: 'budget',
                  };

                  const action = actionMap[log.action] || log.action.toLowerCase();
                  const entity = entityMap[log.entity_type] || log.entity_type.replace(/_/g, ' ');

                  if (changes?.vendor) {
                    return `${action} "${changes.vendor}" ${entity}`;
                  }
                  if (changes?.new_status) {
                    return `${action} request to ${changes.new_status}`;
                  }

                  return `${action} ${entity}`;
                };

                return (
                  <div key={log.id} className="flex items-center gap-3 text-sm">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      log.action === 'INSERT' ? 'bg-emerald-500' :
                      log.action === 'UPDATE' ? 'bg-blue-500' : 'bg-red-500'
                    }`} />
                    <span className="text-slate-600 truncate max-w-[140px]">{log.user_email || 'System'}</span>
                    <span className="text-slate-800 flex-1 truncate">{getActivityDescription()}</span>
                    <span className="text-slate-400 text-xs whitespace-nowrap">{formatDate(log.created_at)}</span>
                  </div>
                );
              })}
              {auditLogs.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'stories' && <UserStoriesTab />}

      {activeTab === 'controls' && (
        <div className="space-y-6">
          {controlMessage && (
            <div className={`p-4 rounded-xl flex items-center gap-3 ${
              controlMessage.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {controlMessage.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-sm">{controlMessage.text}</span>
              <button onClick={() => setControlMessage(null)} className="ml-auto text-current opacity-50 hover:opacity-100">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Settings className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800">GoDaddy API Integration</h3>
                <p className="text-xs text-slate-500">Configure GoDaddy API credentials for automatic receipt syncing</p>
              </div>
              {godaddyConfigured && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">Configured</span>
                </div>
              )}
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={godaddyKey}
                  onChange={(e) => setGodaddyKey(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="dLP4wKzdXY7_VTMfBgHvCcXF5VUjkQKLXvW"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  API Secret <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={godaddySecret}
                  onChange={(e) => setGodaddySecret(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="JbHcZ5PqXxR2Y8nKmQwL"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Shopper ID <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={godaddyShopperId}
                  onChange={(e) => setGodaddyShopperId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="123456789"
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                <p className="font-medium text-blue-800 mb-2">How to get your GoDaddy credentials:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-700">
                  <li>Visit <a href="https://developer.godaddy.com/keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">GoDaddy Developer Portal</a></li>
                  <li>Create a new API key in Production environment</li>
                  <li>Copy both the Key and Secret immediately</li>
                  <li>Find your Shopper ID in your GoDaddy account settings</li>
                </ol>
              </div>
              <button
                onClick={handleSaveGodaddyCredentials}
                disabled={controlLoading === 'godaddy'}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {controlLoading === 'godaddy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save GoDaddy Credentials
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">P-Card Monthly Limit</h3>
                  <p className="text-xs text-slate-500">Set the maximum monthly spending limit</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                {pcardUsage && (
                  <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Current Usage</span>
                      <span className="font-semibold text-slate-800">${pcardUsage.current_usage.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Monthly Limit</span>
                      <span className="font-semibold text-slate-800">${pcardUsage.monthly_limit.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Remaining</span>
                      <span className={`font-semibold ${pcardUsage.remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        ${pcardUsage.remaining.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full transition-all ${pcardUsage.utilization_percent >= 100 ? 'bg-red-500' : pcardUsage.utilization_percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(pcardUsage.utilization_percent, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 text-center">{pcardUsage.utilization_percent}% utilized</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input
                      type="number"
                      value={newLimit}
                      onChange={(e) => setNewLimit(e.target.value)}
                      className="w-full pl-7 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="15000"
                    />
                  </div>
                  <button
                    onClick={handleResetPcardLimit}
                    disabled={controlLoading === 'limit'}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    {controlLoading === 'limit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Update
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Shield className={`w-5 h-5 ${pcardUsage?.hard_stop_enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Hard Stop at Limit</p>
                      <p className="text-xs text-slate-500">Block new requests when limit is reached</p>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleHardStop}
                    disabled={controlLoading === 'hardstop'}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      pcardUsage?.hard_stop_enabled ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    {controlLoading === 'hardstop' ? (
                      <Loader2 className="w-4 h-4 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white animate-spin" />
                    ) : (
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        pcardUsage?.hard_stop_enabled ? 'left-7' : 'left-1'
                      }`} />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Reset Monthly Usage</h3>
                  <p className="text-xs text-slate-500">Archive current month purchases and reset counter</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                  <p className="font-medium mb-1">What this does:</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-700">
                    <li>Archives all approved requests from current month</li>
                    <li>Resets the P-Card usage counter to $0</li>
                    <li>Archived requests remain in history for reporting</li>
                  </ul>
                </div>
                <button
                  onClick={handleResetMonthlyUsage}
                  disabled={controlLoading === 'reset'}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {controlLoading === 'reset' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Reset Monthly Usage
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Data Management - Danger Zone</h3>
                <p className="text-xs text-slate-500">Clear or truncate all purchase data</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/50">
                  <div className="flex items-center gap-3 mb-3">
                    <Archive className="w-5 h-5 text-amber-600" />
                    <h4 className="font-semibold text-amber-800">Clear with Backup</h4>
                  </div>
                  <p className="text-sm text-amber-700 mb-4">
                    Deletes all data but creates a backup for potential recovery within 30 days.
                  </p>
                  <button
                    onClick={() => setConfirmDialog({ isOpen: true, type: 'clear' })}
                    disabled={controlLoading === 'clear'}
                    className="w-full px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {controlLoading === 'clear' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                    Clear All (Safe)
                  </button>
                </div>

                <div className="border border-red-200 rounded-xl p-4 bg-red-50/50">
                  <div className="flex items-center gap-3 mb-3">
                    <Zap className="w-5 h-5 text-red-600" />
                    <h4 className="font-semibold text-red-800">Truncate (Permanent)</h4>
                  </div>
                  <p className="text-sm text-red-700 mb-4">
                    Permanently destroys all data with NO backup. Cannot be recovered.
                  </p>
                  <button
                    onClick={() => setConfirmDialog({ isOpen: true, type: 'truncate' })}
                    disabled={controlLoading === 'truncate'}
                    className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {controlLoading === 'truncate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Truncate All (Danger)
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 text-sm">
                <p className="font-medium text-slate-700 mb-2">What's the difference?</p>
                <ul className="space-y-2 text-slate-600">
                  <li className="flex items-start gap-2">
                    <Archive className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Clear:</strong> Uses DELETE statements, creates backup, data recoverable for 30 days</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Truncate:</strong> Uses TRUNCATE (faster), no backup, instantly destroys data forever</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen && confirmDialog.type === 'clear'}
        title="Clear All Purchase Data"
        message="This will delete all purchase requests, receipts, and approval signatures. A backup will be created that can be restored within 30 days."
        confirmText="CONFIRM_DELETE_ALL_PURCHASES"
        confirmButtonText="Clear All Data"
        danger
        loading={controlLoading === 'clear'}
        onConfirm={handleClearAllPurchases}
        onCancel={() => setConfirmDialog({ isOpen: false, type: null })}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen && confirmDialog.type === 'truncate'}
        title="Permanently Destroy All Data"
        message="WARNING: This will PERMANENTLY destroy all purchase data using TRUNCATE. No backup will be created. This action CANNOT be undone under any circumstances."
        confirmText="PERMANENTLY_DELETE_EVERYTHING"
        confirmButtonText="Destroy Everything"
        danger
        loading={controlLoading === 'truncate'}
        onConfirm={handleTruncateAll}
        onCancel={() => setConfirmDialog({ isOpen: false, type: null })}
      />

      {activeTab === 'sql' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <span className="text-sm font-medium text-slate-700">SQL Query</span>
                  <button
                    onClick={executeQuery}
                    disabled={queryLoading || !sqlQuery.trim()}
                    className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {queryLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Execute
                  </button>
                </div>
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  className="w-full h-48 p-4 font-mono text-sm text-slate-800 focus:outline-none resize-none"
                  placeholder="Enter your SQL query..."
                  spellCheck={false}
                />
              </div>

              {queryResult && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <span className="text-sm font-medium text-slate-700">
                      {queryResult.error ? 'Error' : `Results (${queryResult.rowCount} rows)`}
                    </span>
                    <span className="text-xs text-slate-500">
                      {queryResult.executionTime.toFixed(2)}ms
                    </span>
                  </div>
                  {queryResult.error ? (
                    <div className="p-4 bg-red-50 text-red-700 text-sm">
                      <AlertCircle className="w-4 h-4 inline mr-2" />
                      {queryResult.error}
                    </div>
                  ) : queryResult.data && queryResult.data.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            {Object.keys(queryResult.data[0]).map((key) => (
                              <th key={key} className="px-4 py-2 text-left font-medium text-slate-700 border-b border-slate-200">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.data.map((row, i) => (
                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                              {Object.values(row).map((val, j) => (
                                <td key={j} className="px-4 py-2 text-slate-600 whitespace-nowrap">
                                  {val === null ? <span className="text-slate-400 italic">null</span> : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 text-slate-500 text-sm">No results returned</div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-slate-800">Pre-built Queries</h3>
              <div className="space-y-2">
                {PREBUILT_QUERIES.map((pq) => (
                  <div
                    key={pq.name}
                    className="bg-white rounded-lg border border-slate-200 p-3 hover:border-emerald-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => loadPrebuiltQuery(pq.query)}
                        className="text-left flex-1"
                      >
                        <p className="text-sm font-medium text-slate-800">{pq.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{pq.description}</p>
                      </button>
                      <button
                        onClick={() => copyQuery(pq.query, pq.name)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                        title="Copy query"
                      >
                        {copiedQuery === pq.name ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <span className="text-sm font-medium text-slate-700">Audit Trail ({auditLogs.length} entries)</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No audit logs yet</div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="p-4">
                  <button
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    className="w-full flex items-center gap-3 text-left"
                  >
                    {expandedLog === log.id ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                      log.action === 'INSERT' ? 'bg-emerald-100 text-emerald-700' :
                      log.action === 'UPDATE' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {log.action}
                    </div>
                    <span className="text-sm font-medium text-slate-800">{log.entity_type}</span>
                    <span className="text-sm text-slate-500">{log.user_email || 'System'}</span>
                    <span className="text-xs text-slate-400 ml-auto">{formatDate(log.created_at)}</span>
                  </button>
                  {expandedLog === log.id && (
                    <div className="mt-3 ml-7 space-y-2">
                      {log.entity_id && (
                        <p className="text-xs text-slate-500">
                          <span className="font-medium">Entity ID:</span> {log.entity_id}
                        </p>
                      )}
                      {log.changes && Object.keys(log.changes as object).length > 0 && (
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-slate-700 mb-2">Changes:</p>
                          <pre className="text-xs text-slate-600 overflow-x-auto">
                            {JSON.stringify(log.changes, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.new_data && (
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-slate-700 mb-2">New Data:</p>
                          <pre className="text-xs text-slate-600 overflow-x-auto max-h-48">
                            {JSON.stringify(log.new_data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'emails' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Email Notifications ({emails.length})</span>
            <span className="text-xs text-slate-500">Mock emails - not actually sent</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {emails.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No email notifications yet</div>
            ) : (
              emails.map((email) => (
                <div key={email.id} className="p-4">
                  <button
                    onClick={() => setExpandedEmail(expandedEmail === email.id ? null : email.id)}
                    className="w-full flex items-center gap-3 text-left"
                  >
                    {expandedEmail === email.id ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                      email.status === 'sent' ? 'bg-emerald-100 text-emerald-700' :
                      email.status === 'queued' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {email.status}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{email.subject}</p>
                      <p className="text-xs text-slate-500 truncate">To: {email.recipient_email}</p>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">{formatDate(email.created_at)}</span>
                  </button>
                  {expandedEmail === email.id && (
                    <div className="mt-3 ml-7 space-y-3">
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="flex gap-4 text-xs text-slate-600 mb-3">
                          <span><strong>To:</strong> {email.recipient_name} &lt;{email.recipient_email}&gt;</span>
                        </div>
                        <div className="prose prose-sm max-w-none">
                          {email.body_html ? (
                            <div dangerouslySetInnerHTML={{ __html: email.body_html }} />
                          ) : (
                            <pre className="whitespace-pre-wrap text-sm text-slate-700">{email.body_text}</pre>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Registered Users ({filteredUsers.length})</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Search users..."
                  className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Department</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Role</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className={`hover:bg-slate-50 ${selectedEmployee === user.id ? 'bg-emerald-50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-slate-800">{user.full_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{user.email}</td>
                      <td className="px-4 py-3 text-slate-600">{user.department || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          user.role === 'admin' ? 'bg-amber-100 text-amber-700' :
                          user.role === 'approver' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setSelectedEmployee(user.id);
                            loadEmployeeStats(user.id);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          View Stats
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Employee Details</span>
              </div>
              <div className="p-4">
                {employeeLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                  </div>
                ) : employeeStats ? (
                  <div className="space-y-4">
                    <div className="text-center pb-4 border-b border-slate-200">
                      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <User className="w-8 h-8 text-emerald-600" />
                      </div>
                      <h3 className="font-semibold text-slate-800">{employeeStats.employee.full_name}</h3>
                      <p className="text-sm text-slate-500">{employeeStats.employee.email}</p>
                      <div className="flex items-center justify-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          employeeStats.employee.role === 'admin' ? 'bg-amber-100 text-amber-700' :
                          employeeStats.employee.role === 'approver' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {employeeStats.employee.role}
                        </span>
                        {employeeStats.employee.department && (
                          <span className="text-xs text-slate-500">{employeeStats.employee.department}</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-slate-800">{employeeStats.stats.total_requests}</p>
                        <p className="text-xs text-slate-500">Total Requests</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-emerald-600">{employeeStats.stats.approved_requests}</p>
                        <p className="text-xs text-slate-500">Approved</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-amber-600">{employeeStats.stats.pending_requests}</p>
                        <p className="text-xs text-slate-500">Pending</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-red-600">{employeeStats.stats.rejected_requests}</p>
                        <p className="text-xs text-slate-500">Rejected</p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Total Spent</span>
                        <span className="font-semibold text-slate-800">${employeeStats.stats.total_spent.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Avg Amount</span>
                        <span className="font-semibold text-slate-800">${employeeStats.stats.avg_amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Approval Rate</span>
                        <span className={`font-semibold ${employeeStats.stats.approval_rate >= 80 ? 'text-emerald-600' : employeeStats.stats.approval_rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                          {employeeStats.stats.approval_rate}%
                        </span>
                      </div>
                      {employeeStats.stats.first_request && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">First Request</span>
                          <span className="text-slate-500">{new Date(employeeStats.stats.first_request).toLocaleDateString()}</span>
                        </div>
                      )}
                      {employeeStats.stats.last_request && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Last Request</span>
                          <span className="text-slate-500">{new Date(employeeStats.stats.last_request).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setSelectedEmployee(null);
                        setEmployeeStats(null);
                      }}
                      className="w-full px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Clear Selection
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm">Select a user to view their stats</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  color: 'blue' | 'amber' | 'emerald' | 'red';
}) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    amber: 'bg-amber-100 text-amber-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-sm text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}
