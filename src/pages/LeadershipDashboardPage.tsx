import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  FileText,
  Wallet,
  BarChart3,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import OverviewTab from '../components/leadership/OverviewTab';
import AllRequestsTab from '../components/leadership/AllRequestsTab';
import BudgetsTab from '../components/leadership/BudgetsTab';
import AnalyticsTab from '../components/leadership/AnalyticsTab';
import ReceiptsTab from '../components/leadership/ReceiptsTab';
import { exportMasterSpreadsheet } from '../utils/masterExport';

type TabId = 'overview' | 'requests' | 'receipts' | 'budgets' | 'analytics';

const tabs = [
  { id: 'overview' as TabId, label: 'Overview', icon: LayoutGrid },
  { id: 'requests' as TabId, label: 'All Requests', icon: FileText },
  { id: 'receipts' as TabId, label: 'Receipts', icon: Receipt },
  { id: 'budgets' as TabId, label: 'Budgets', icon: Wallet },
  { id: 'analytics' as TabId, label: 'Analytics', icon: BarChart3 },
];

export default function LeadershipDashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isApprover, setIsApprover] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  async function handleMasterExport() {
    setExporting(true);
    try {
      await exportMasterSpreadsheet();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    checkAccess();
  }, [profile]);

  async function checkAccess() {
    if (!profile?.email) {
      setLoading(false);
      return;
    }

    if (profile.role === 'admin' || profile.role === 'approver') {
      setIsApprover(true);
      setLoading(false);
      return;
    }

    const { data: approverData } = await supabase
      .from('approvers')
      .select('id')
      .eq('email', profile.email)
      .eq('is_active', true)
      .maybeSingle();

    setIsApprover(!!approverData);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isApprover) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Access Restricted</h2>
          <p className="text-slate-500 mb-6">
            The Leadership Dashboard is only accessible to designated approvers and administrators.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Leadership Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Complete visibility into spending, approvals, and budgets
          </p>
        </div>
        <button
          onClick={handleMasterExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {exporting ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Master Export
            </>
          )}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors relative ${
                activeTab === tab.id
                  ? 'text-emerald-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
              )}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'overview' && <OverviewTab onNavigateToReceipts={() => setActiveTab('receipts')} />}
          {activeTab === 'requests' && <AllRequestsTab />}
          {activeTab === 'receipts' && <ReceiptsTab />}
          {activeTab === 'budgets' && <BudgetsTab />}
          {activeTab === 'analytics' && <AnalyticsTab />}
        </div>
      </div>
    </div>
  );
}
