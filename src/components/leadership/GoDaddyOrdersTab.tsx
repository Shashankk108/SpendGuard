import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Link2,
  ExternalLink,
  Search,
  Filter,
  ChevronDown,
  Settings,
  Download,
  XCircle,
  Loader2,
  Calendar,
  Send,
  FileCheck,
  FileText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface GoDaddyOrder {
  id: string;
  order_id: string;
  domain_or_product: string;
  product_type: string | null;
  order_date: string;
  order_total: number;
  currency: string;
  sync_status: string;
  matched_request_id: string | null;
  match_confidence: number | null;
  match_reasons: string[];
  synced_at: string | null;
  created_at: string;
  receipt_requested: boolean;
  receipt_requested_at: string | null;
  receipt_uploaded: boolean;
  receipt_file_url: string | null;
  receipt_file_name: string | null;
  receipt_uploaded_at: string | null;
  matched_request?: {
    id: string;
    vendor_name: string;
    total_amount: number;
    requester: { full_name: string } | null;
  } | null;
}

interface SyncStatus {
  id: string;
  vendor_type: string;
  last_sync_at: string | null;
  next_sync_at: string | null;
  orders_synced: number;
  orders_matched: number;
  status: string;
  error_message: string | null;
}

interface ApiStatus {
  configured: boolean;
  api_key_prefix: string | null;
  shopper_id: string | null;
  total_orders: number;
  unmatched_orders: number;
}

export default function GoDaddyOrdersTab() {
  const [orders, setOrders] = useState<GoDaddyOrder[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('90');
  const [linkingOrder, setLinkingOrder] = useState<GoDaddyOrder | null>(null);
  const [availableRequests, setAvailableRequests] = useState<any[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [viewingOrder, setViewingOrder] = useState<GoDaddyOrder | null>(null);
  const [fetchingReceipt, setFetchingReceipt] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    checkApiStatus();
  }, []);

  async function fetchData() {
    setLoading(true);

    const [ordersResult, syncResult] = await Promise.all([
      supabase
        .from('godaddy_orders')
        .select(`
          *,
          matched_request:matched_request_id(
            id,
            vendor_name,
            total_amount,
            requester:requester_id(full_name)
          )
        `)
        .order('order_date', { ascending: false }),
      supabase
        .from('external_vendor_sync')
        .select('*')
        .eq('vendor_type', 'godaddy')
        .maybeSingle(),
    ]);

    if (ordersResult.data) {
      setOrders(ordersResult.data);
    }
    if (syncResult.data) {
      setSyncStatus(syncResult.data);
    }

    setLoading(false);
  }

  async function checkApiStatus() {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-godaddy-orders`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'check_status' }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setApiStatus(data);
      }
    } catch (error) {
      console.error('Error checking API status:', error);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-godaddy-orders`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ force_sync: false }),
        }
      );

      const result = await response.json();
      console.log('Sync result:', result);

      await fetchData();
      await checkApiStatus();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  }

  async function openLinkModal(order: GoDaddyOrder) {
    setLinkingOrder(order);
    setSelectedRequestId('');

    const { data } = await supabase
      .from('purchase_requests')
      .select('id, vendor_name, total_amount, expense_date, requester:requester_id(full_name)')
      .eq('status', 'approved')
      .is('external_order_id', null)
      .order('expense_date', { ascending: false });

    setAvailableRequests(data || []);
  }

  async function handleLinkOrder() {
    if (!linkingOrder || !selectedRequestId) return;

    await supabase
      .from('godaddy_orders')
      .update({
        matched_request_id: selectedRequestId,
        sync_status: 'matched',
        match_confidence: 100,
        match_reasons: ['Manual link by administrator'],
      })
      .eq('id', linkingOrder.id);

    await supabase
      .from('purchase_requests')
      .update({
        external_order_id: linkingOrder.order_id,
        external_receipt_status: 'pending',
      })
      .eq('id', selectedRequestId);

    setLinkingOrder(null);
    fetchData();
  }

  async function requestReceipt(order: GoDaddyOrder) {
    if (!order.matched_request_id) return;

    setFetchingReceipt(order.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error, data } = await supabase
        .from('godaddy_orders')
        .update({
          receipt_requested: true,
          receipt_requested_at: new Date().toISOString(),
          receipt_requested_by: user?.id,
        })
        .eq('id', order.id)
        .select();

      if (error) {
        console.error('Failed to request receipt:', error);
        alert('Failed to request receipt. Please try again.');
      } else {
        setOrders(prev => prev.map(o =>
          o.id === order.id
            ? { ...o, receipt_requested: true, receipt_requested_at: new Date().toISOString() }
            : o
        ));
      }
    } catch (error) {
      console.error('Failed to request receipt:', error);
      alert('Failed to request receipt. Please try again.');
    } finally {
      setFetchingReceipt(null);
    }
  }

  function viewReceipt(order: GoDaddyOrder) {
    if (order.receipt_file_url) {
      window.open(order.receipt_file_url, '_blank');
    }
  }

  function getRawOrderData(order: GoDaddyOrder): any {
    return (order as any).raw_api_response || {};
  }

  const filteredOrders = orders.filter(order => {
    const matchesSearch = !searchTerm ||
      order.order_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.domain_or_product.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.sync_status === statusFilter;

    let matchesDate = true;
    if (dateRangeFilter !== 'all') {
      const orderDate = new Date(order.order_date);
      const now = new Date();
      const daysAgo = parseInt(dateRangeFilter);
      const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      matchesDate = orderDate >= cutoffDate;
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'matched':
        return { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Matched' };
      case 'unmatched':
        return { color: 'bg-amber-100 text-amber-700', icon: AlertTriangle, label: 'Unmatched' };
      case 'pending':
        return { color: 'bg-sky-100 text-sky-700', icon: Clock, label: 'Pending' };
      case 'failed':
        return { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Failed' };
      default:
        return { color: 'bg-slate-100 text-slate-700', icon: Clock, label: status };
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-teal-800">GoDaddy Integration</p>
              <p className="text-xs text-teal-600">
                {apiStatus?.configured ? 'Connected' : 'Awaiting Setup'}
              </p>
            </div>
          </div>
          {apiStatus?.configured ? (
            <p className="text-xs text-teal-700">
              Integration active - orders will sync automatically
            </p>
          ) : (
            <p className="text-xs text-teal-600">
              Contact your system administrator to enable GoDaddy sync
            </p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 text-slate-500 ${syncing ? 'animate-spin' : ''}`} />
              <p className="text-sm font-medium text-slate-800">Sync Status</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              syncStatus?.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
              syncStatus?.status === 'running' ? 'bg-sky-100 text-sky-700' :
              syncStatus?.status === 'failed' ? 'bg-red-100 text-red-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {syncStatus?.status || 'idle'}
            </span>
          </div>
          <div className="space-y-1 text-xs text-slate-600">
            <p>Last sync: {formatTime(syncStatus?.last_sync_at || null)}</p>
            <p>Orders synced: {syncStatus?.orders_synced || 0}</p>
            <p>Orders matched: {syncStatus?.orders_matched || 0}</p>
          </div>
          {syncStatus?.error_message && (
            <p className="mt-2 text-xs text-red-600 truncate">{syncStatus.error_message}</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-medium text-slate-800">Needs Attention</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Unmatched orders</span>
              <span className="text-sm font-semibold text-amber-600">
                {orders.filter(o => o.sync_status === 'unmatched').length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Total orders</span>
              <span className="text-sm font-semibold text-slate-800">{orders.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none"
            >
              <option value="all">All Status</option>
              <option value="matched">Matched</option>
              <option value="unmatched">Unmatched</option>
              <option value="pending">Pending</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value)}
              className="pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none"
            >
              <option value="30">Last 30 Days</option>
              <option value="60">Last 60 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="180">Last 6 Months</option>
              <option value="365">Last Year</option>
              <option value="all">All Time</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || !apiStatus?.configured}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Order
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Product
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Amount
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Date
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Linked Request
                </th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <Loader2 className="w-6 h-6 text-teal-600 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Loading orders...</p>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <Globe className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">No GoDaddy orders found</p>
                    {!apiStatus?.configured && (
                      <p className="text-xs text-slate-400 mt-1">
                        GoDaddy integration is pending setup
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const statusBadge = getStatusBadge(order.sync_status);
                  const StatusIcon = statusBadge.icon;
                  return (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-mono text-slate-800">#{order.order_id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-800 truncate max-w-48">
                          {order.domain_or_product}
                        </p>
                        {order.product_type && (
                          <p className="text-xs text-slate-500">{order.product_type}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">
                          ${order.order_total.toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-500">{order.currency}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-600">{formatDate(order.order_date)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusBadge.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusBadge.label}
                        </span>
                        {order.match_confidence && order.match_confidence < 100 && (
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {order.match_confidence}% confidence
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {order.matched_request ? (
                          <Link
                            to={`/request/${order.matched_request.id}`}
                            className="text-sm text-teal-600 hover:text-teal-700 hover:underline"
                          >
                            {order.matched_request.vendor_name}
                            <span className="text-slate-400 text-xs ml-1">
                              ({order.matched_request.requester?.full_name})
                            </span>
                          </Link>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setViewingOrder(order)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Details
                          </button>
                          {order.sync_status === 'unmatched' && (
                            <button
                              onClick={() => openLinkModal(order)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50 rounded transition-colors"
                            >
                              <Link2 className="w-3 h-3" />
                              Link
                            </button>
                          )}
                          {order.sync_status === 'matched' && order.matched_request_id && (
                            <>
                              {order.receipt_uploaded ? (
                                <button
                                  onClick={() => viewReceipt(order)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                >
                                  <FileCheck className="w-3 h-3" />
                                  View Receipt
                                </button>
                              ) : order.receipt_requested ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-600 bg-amber-50 rounded">
                                  <Clock className="w-3 h-3" />
                                  Requested
                                </span>
                              ) : (
                                <button
                                  onClick={() => requestReceipt(order)}
                                  disabled={fetchingReceipt === order.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50 rounded transition-colors disabled:opacity-50"
                                >
                                  {fetchingReceipt === order.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Send className="w-3 h-3" />
                                  )}
                                  {fetchingReceipt === order.id ? 'Sending...' : 'Request Receipt'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {linkingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setLinkingOrder(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">Link GoDaddy Order</h3>
              <p className="text-sm text-slate-500">
                Order #{linkingOrder.order_id} - ${linkingOrder.order_total.toLocaleString()}
              </p>
            </div>
            <div className="p-6">
              <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                <p className="text-sm text-teal-800 font-medium">{linkingOrder.domain_or_product}</p>
                <p className="text-xs text-teal-600">Order date: {formatDate(linkingOrder.order_date)}</p>
              </div>

              <label className="block text-sm font-medium text-slate-700 mb-2">
                Select Purchase Request to Link
              </label>
              <select
                value={selectedRequestId}
                onChange={(e) => setSelectedRequestId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Select a request...</option>
                {availableRequests.map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.vendor_name} - ${req.total_amount.toLocaleString()} ({req.requester?.full_name})
                  </option>
                ))}
              </select>

              {availableRequests.length === 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  No unlinked approved requests found
                </p>
              )}

              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => setLinkingOrder(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLinkOrder}
                  disabled={!selectedRequestId}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  Link Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setViewingOrder(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 px-6 py-4 border-b border-slate-100 bg-white z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Order Details</h3>
                  <p className="text-sm text-slate-500">GoDaddy Order #{viewingOrder.order_id}</p>
                </div>
                <button
                  onClick={() => setViewingOrder(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">Order ID</p>
                  <p className="text-sm font-mono font-semibold text-slate-800">#{viewingOrder.order_id}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">Order Date</p>
                  <p className="text-sm font-semibold text-slate-800">{formatDate(viewingOrder.order_date)}</p>
                </div>
                <div className="p-4 bg-teal-50 rounded-xl">
                  <p className="text-xs text-teal-600 mb-1">Total Amount</p>
                  <p className="text-xl font-bold text-teal-700">
                    ${viewingOrder.order_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-teal-600">{viewingOrder.currency}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">Status</p>
                  {(() => {
                    const badge = getStatusBadge(viewingOrder.sync_status);
                    const Icon = badge.icon;
                    return (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                        <Icon className="w-3 h-3" />
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-3">Products</h4>
                <div className="bg-slate-50 rounded-xl overflow-hidden">
                  {(() => {
                    const rawData = getRawOrderData(viewingOrder);
                    const items = rawData.items || [];
                    const convertAmount = (amt: number | undefined | null) => {
                      if (amt === undefined || amt === null || isNaN(amt)) return 0;
                      return amt > 10000 ? amt / 1000000 : amt;
                    };
                    if (items.length === 0) {
                      return (
                        <div className="p-4 text-center text-sm text-slate-500">
                          {viewingOrder.domain_or_product || 'No product details available'}
                        </div>
                      );
                    }
                    return (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-2">Product</th>
                            <th className="text-center text-xs font-medium text-slate-500 uppercase px-4 py-2">Qty</th>
                            <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-2">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {items.map((item: any, idx: number) => {
                            const itemTotal = item.pricing?.total ?? item.pricing?.subtotal ?? item.pricing?.list ?? 0;
                            return (
                              <tr key={idx}>
                                <td className="px-4 py-3">
                                  <p className="text-sm text-slate-800">{item.label}</p>
                                  {item.productTypeId && (
                                    <p className="text-xs text-slate-500">Type: {item.productTypeId}</p>
                                  )}
                                  {item.period && (
                                    <p className="text-xs text-slate-500">Period: {item.period} {item.periodUnit || 'months'}</p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center text-sm text-slate-600">{item.quantity || 1}</td>
                                <td className="px-4 py-3 text-right text-sm font-medium text-slate-800">
                                  ${convertAmount(itemTotal).toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>

              {(() => {
                const rawData = getRawOrderData(viewingOrder);
                const pricing = rawData.pricing;
                const convertAmount = (amt: number | undefined | null) => {
                  if (amt === undefined || amt === null || isNaN(amt)) return 0;
                  return amt > 10000 ? amt / 1000000 : amt;
                };
                const subtotal = pricing?.subtotal ?? pricing?.list;
                const taxes = pricing?.taxes ?? 0;
                const discount = pricing?.discount ?? pricing?.savings ?? 0;

                return (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-slate-800 mb-3">Pricing Summary</h4>
                    <div className="space-y-2">
                      {subtotal !== undefined && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Subtotal</span>
                          <span className="text-slate-800">${convertAmount(subtotal).toFixed(2)}</span>
                        </div>
                      )}
                      {taxes > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Taxes</span>
                          <span className="text-slate-800">${convertAmount(taxes).toFixed(2)}</span>
                        </div>
                      )}
                      {discount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Discount</span>
                          <span className="text-emerald-600">-${convertAmount(discount).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-semibold pt-2 border-t border-slate-200">
                        <span className="text-slate-800">Total</span>
                        <span className="text-teal-700">${viewingOrder.order_total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {viewingOrder.match_reasons && viewingOrder.match_reasons.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 mb-3">Match Analysis</h4>
                  <div className="bg-emerald-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-medium text-emerald-800">
                        {viewingOrder.match_confidence}% Confidence Match
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {viewingOrder.match_reasons.map((reason, idx) => (
                        <li key={idx} className="text-xs text-emerald-700 flex items-center gap-2">
                          <span className="w-1 h-1 bg-emerald-500 rounded-full" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {viewingOrder.receipt_uploaded && viewingOrder.receipt_file_url && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 mb-3">Uploaded Receipt</h4>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileCheck className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-medium text-emerald-800">
                        Receipt uploaded by employee
                      </span>
                    </div>
                    {viewingOrder.receipt_file_name && (
                      <p className="text-xs text-emerald-700 mb-3">{viewingOrder.receipt_file_name}</p>
                    )}
                    <div className="rounded-lg overflow-hidden border border-emerald-200 bg-white">
                      {viewingOrder.receipt_file_url.startsWith('data:image') ? (
                        <img
                          src={viewingOrder.receipt_file_url}
                          alt="Receipt"
                          className="w-full max-h-96 object-contain"
                        />
                      ) : viewingOrder.receipt_file_url.startsWith('data:application/pdf') ? (
                        <div className="p-6 text-center">
                          <FileText className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-600 mb-3">PDF Receipt</p>
                          <a
                            href={viewingOrder.receipt_file_url}
                            download={viewingOrder.receipt_file_name || 'receipt.pdf'}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                          >
                            <Download className="w-4 h-4" />
                            Download PDF
                          </a>
                        </div>
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-sm text-slate-500">Receipt file available</p>
                        </div>
                      )}
                    </div>
                    {viewingOrder.receipt_uploaded_at && (
                      <p className="text-xs text-emerald-600 mt-2">
                        Uploaded: {formatTime(viewingOrder.receipt_uploaded_at)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {viewingOrder.receipt_requested && !viewingOrder.receipt_uploaded && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 mb-3">Receipt Status</h4>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-800">
                        Receipt requested - awaiting employee upload
                      </span>
                    </div>
                    {viewingOrder.receipt_requested_at && (
                      <p className="text-xs text-amber-600 mt-2">
                        Requested: {formatTime(viewingOrder.receipt_requested_at)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {viewingOrder.synced_at && (
                <div className="text-xs text-slate-400 text-center pt-4 border-t border-slate-100">
                  Last synced: {formatTime(viewingOrder.synced_at)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
