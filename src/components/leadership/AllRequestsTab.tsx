import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PurchaseRequest, ApprovalSignature, Profile } from '../../types/database';
import { getApprovalTier } from '../../utils/validation';

type SortField = 'created_at' | 'total_amount' | 'vendor_name' | 'status';
type SortDirection = 'asc' | 'desc';

interface RequestWithDetails extends PurchaseRequest {
  signatures?: ApprovalSignature[];
  requester?: Profile;
}

export default function AllRequestsTab() {
  const [requests, setRequests] = useState<RequestWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedRequest, setSelectedRequest] = useState<RequestWithDetails | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    const { data: requestsData } = await supabase
      .from('purchase_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!requestsData) {
      setLoading(false);
      return;
    }

    const { data: signaturesData } = await supabase
      .from('approval_signatures')
      .select('*')
      .in(
        'request_id',
        requestsData.map((r) => r.id)
      );

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .in(
        'id',
        requestsData.map((r) => r.requester_id)
      );

    const profilesMap = new Map(profilesData?.map((p) => [p.id, p]) || []);
    const signaturesMap = new Map<string, ApprovalSignature[]>();
    signaturesData?.forEach((sig) => {
      const existing = signaturesMap.get(sig.request_id) || [];
      existing.push(sig);
      signaturesMap.set(sig.request_id, existing);
    });

    const enrichedRequests: RequestWithDetails[] = requestsData.map((r) => ({
      ...r,
      signatures: signaturesMap.get(r.id) || [],
      requester: profilesMap.get(r.requester_id),
    }));

    setRequests(enrichedRequests);
    setLoading(false);
  }

  const categories = useMemo(() => {
    const cats = new Set(requests.map((r) => r.category));
    return Array.from(cats).sort();
  }, [requests]);

  const filteredRequests = useMemo(() => {
    let filtered = [...requests];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.vendor_name.toLowerCase().includes(term) ||
          r.cardholder_name.toLowerCase().includes(term) ||
          r.business_purpose.toLowerCase().includes(term) ||
          r.requester?.full_name?.toLowerCase().includes(term)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter((r) => r.category === categoryFilter);
    }

    if (dateFrom) {
      filtered = filtered.filter((r) => new Date(r.created_at) >= new Date(dateFrom));
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((r) => new Date(r.created_at) <= toDate);
    }

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'total_amount':
          comparison = a.total_amount - b.total_amount;
          break;
        case 'vendor_name':
          comparison = a.vendor_name.localeCompare(b.vendor_name);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [requests, searchTerm, statusFilter, categoryFilter, dateFrom, dateTo, sortField, sortDirection]);

  const paginatedRequests = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRequests.slice(start, start + pageSize);
  }, [filteredRequests, page]);

  const totalPages = Math.ceil(filteredRequests.length / pageSize);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }

  function exportToCSV() {
    const headers = [
      'Date',
      'Vendor',
      'Requestor',
      'Category',
      'Amount',
      'Status',
      'Business Purpose',
    ];
    const rows = filteredRequests.map((r) => [
      new Date(r.created_at).toLocaleDateString(),
      r.vendor_name,
      r.cardholder_name,
      r.category,
      r.total_amount.toString(),
      r.status,
      r.business_purpose.replace(/"/g, '""'),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join(
      '\n'
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-requests-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearFilters() {
    setSearchTerm('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-600',
      pending: 'bg-amber-100 text-amber-700',
      approved: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return styles[status] || styles.draft;
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search vendor, cardholder, purpose..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors ${
              showFilters
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      <div className="text-sm text-slate-500">
        Showing {paginatedRequests.length} of {filteredRequests.length} requests
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th
                className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50"
                onClick={() => handleSort('created_at')}
              >
                <div className="flex items-center gap-1">
                  Date
                  <SortIcon field="created_at" />
                </div>
              </th>
              <th
                className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50"
                onClick={() => handleSort('vendor_name')}
              >
                <div className="flex items-center gap-1">
                  Vendor
                  <SortIcon field="vendor_name" />
                </div>
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Requester
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Category
              </th>
              <th
                className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50"
                onClick={() => handleSort('total_amount')}
              >
                <div className="flex items-center justify-end gap-1">
                  Amount
                  <SortIcon field="total_amount" />
                </div>
              </th>
              <th
                className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center justify-center gap-1">
                  Status
                  <SortIcon field="status" />
                </div>
              </th>
              <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedRequests.map((request) => (
              <tr key={request.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 text-sm text-slate-600">
                  {new Date(request.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 px-4">
                  <p className="text-sm font-medium text-slate-800">{request.vendor_name}</p>
                  <p className="text-xs text-slate-400 truncate max-w-xs">
                    {request.business_purpose}
                  </p>
                </td>
                <td className="py-3 px-4 text-sm text-slate-600">{request.cardholder_name}</td>
                <td className="py-3 px-4 text-sm text-slate-600">{request.category}</td>
                <td className="py-3 px-4 text-right">
                  <p className="text-sm font-semibold text-slate-800">
                    ${request.total_amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">{getApprovalTier(request.total_amount).split(':')[0]}</p>
                </td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(
                      request.status
                    )}`}
                  >
                    {request.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                    {request.status === 'rejected' && <XCircle className="w-3 h-3" />}
                    {request.status === 'pending' && <Clock className="w-3 h-3" />}
                    {request.status === 'draft' && <FileText className="w-3 h-3" />}
                    {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setSelectedRequest(request)}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Quick view"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <Link
                      to={`/request/${request.id}`}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      View
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {selectedRequest && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{selectedRequest.vendor_name}</h2>
                <p className="text-sm text-slate-500">{selectedRequest.business_purpose}</p>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Requester</p>
                  <p className="text-sm font-medium text-slate-800">
                    {selectedRequest.cardholder_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Department</p>
                  <p className="text-sm font-medium text-slate-800">
                    {selectedRequest.requester?.department || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Category</p>
                  <p className="text-sm font-medium text-slate-800">{selectedRequest.category}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Expense Date</p>
                  <p className="text-sm font-medium text-slate-800">
                    {new Date(selectedRequest.expense_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total Amount</p>
                  <p className="text-lg font-bold text-slate-800">
                    ${selectedRequest.total_amount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Approval Tier</p>
                  <p className="text-sm font-medium text-slate-800">
                    {getApprovalTier(selectedRequest.total_amount)}
                  </p>
                </div>
              </div>

              {selectedRequest.signatures && selectedRequest.signatures.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Approval History
                  </p>
                  <div className="space-y-2">
                    {selectedRequest.signatures.map((sig) => (
                      <div
                        key={sig.id}
                        className={`p-3 rounded-lg ${
                          sig.action === 'approved' ? 'bg-emerald-50' : 'bg-red-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {sig.action === 'approved' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                          <span
                            className={`text-sm font-medium ${
                              sig.action === 'approved' ? 'text-emerald-800' : 'text-red-800'
                            }`}
                          >
                            {sig.action === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                            {sig.approver_name}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {sig.approver_title} - {new Date(sig.signed_at).toLocaleString()}
                        </p>
                        {sig.comments && (
                          <p className="text-sm text-slate-600 mt-2">{sig.comments}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <Link
                  to={`/request/${selectedRequest.id}`}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  View Full Details
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
