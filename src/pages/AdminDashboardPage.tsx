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
  Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AuditLog, EmailNotification, Profile, PurchaseRequest } from '../types/database';

type TabType = 'overview' | 'sql' | 'audit' | 'emails' | 'users';

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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    await Promise.all([
      loadStats(),
      loadAuditLogs(),
      loadEmails(),
      loadUsers(),
    ]);
    setLoading(false);
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              {auditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-center gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full ${
                    log.action === 'INSERT' ? 'bg-emerald-500' :
                    log.action === 'UPDATE' ? 'bg-blue-500' : 'bg-red-500'
                  }`} />
                  <span className="text-slate-600">{log.user_email || 'System'}</span>
                  <span className="text-slate-400">{log.action.toLowerCase()}</span>
                  <span className="text-slate-800 font-medium">{log.entity_type}</span>
                  <span className="text-slate-400 ml-auto">{formatDate(log.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <span className="text-sm font-medium text-slate-700">Registered Users ({users.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Department</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
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
                    <td className="px-4 py-3 text-slate-500">{formatDate(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
