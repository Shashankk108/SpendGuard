import { useEffect, useState, useMemo } from 'react';
import {
  Plus,
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  X,
  Edit2,
  Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Budget, PurchaseRequest } from '../../types/database';

interface BudgetWithSpend extends Budget {
  spent: number;
  pendingSpend: number;
  utilization: number;
}

export default function BudgetsTab() {
  const { profile } = useAuth();
  const [budgets, setBudgets] = useState<BudgetWithSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [formData, setFormData] = useState({
    department: '',
    fiscal_year: new Date().getFullYear(),
    fiscal_quarter: null as number | null,
    allocated_amount: '',
    start_date: '',
    end_date: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const departments = [
    'Engineering',
    'Marketing',
    'Sales',
    'Finance',
    'Human Resources',
    'Operations',
    'Legal',
    'Product',
    'Customer Support',
    'IT',
    'Other',
  ];

  useEffect(() => {
    fetchBudgets();
  }, []);

  async function fetchBudgets() {
    const { data: budgetsData } = await supabase
      .from('budgets')
      .select('*')
      .order('fiscal_year', { ascending: false });

    const { data: requestsData } = await supabase
      .from('purchase_requests')
      .select('requester_id, total_amount, status, created_at');

    const { data: profilesData } = await supabase.from('profiles').select('id, department');

    if (!budgetsData) {
      setLoading(false);
      return;
    }

    const profileDeptMap = new Map(profilesData?.map((p) => [p.id, p.department]) || []);

    const budgetsWithSpend: BudgetWithSpend[] = budgetsData.map((budget) => {
      const budgetStart = new Date(budget.start_date);
      const budgetEnd = new Date(budget.end_date);

      const relevantRequests =
        requestsData?.filter((r) => {
          const reqDate = new Date(r.created_at);
          const reqDept = profileDeptMap.get(r.requester_id);
          return (
            reqDept === budget.department &&
            reqDate >= budgetStart &&
            reqDate <= budgetEnd
          );
        }) || [];

      const spent = relevantRequests
        .filter((r) => r.status === 'approved')
        .reduce((sum, r) => sum + r.total_amount, 0);

      const pendingSpend = relevantRequests
        .filter((r) => r.status === 'pending')
        .reduce((sum, r) => sum + r.total_amount, 0);

      const utilization = budget.allocated_amount > 0 ? (spent / budget.allocated_amount) * 100 : 0;

      return {
        ...budget,
        spent,
        pendingSpend,
        utilization,
      };
    });

    setBudgets(budgetsWithSpend);
    setLoading(false);
  }

  function openCreateModal() {
    setEditingBudget(null);
    setFormData({
      department: '',
      fiscal_year: new Date().getFullYear(),
      fiscal_quarter: null,
      allocated_amount: '',
      start_date: '',
      end_date: '',
      notes: '',
    });
    setShowModal(true);
  }

  function openEditModal(budget: Budget) {
    setEditingBudget(budget);
    setFormData({
      department: budget.department,
      fiscal_year: budget.fiscal_year,
      fiscal_quarter: budget.fiscal_quarter,
      allocated_amount: budget.allocated_amount.toString(),
      start_date: budget.start_date,
      end_date: budget.end_date,
      notes: budget.notes || '',
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const budgetData = {
      department: formData.department,
      fiscal_year: formData.fiscal_year,
      fiscal_quarter: formData.fiscal_quarter,
      allocated_amount: parseFloat(formData.allocated_amount) || 0,
      start_date: formData.start_date,
      end_date: formData.end_date,
      notes: formData.notes || null,
    };

    if (editingBudget) {
      await supabase.from('budgets').update(budgetData).eq('id', editingBudget.id);
    } else {
      await supabase.from('budgets').insert({
        ...budgetData,
        created_by: profile?.id,
      });
    }

    setSaving(false);
    setShowModal(false);
    fetchBudgets();
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this budget?')) return;
    await supabase.from('budgets').delete().eq('id', id);
    fetchBudgets();
  }

  const totalAllocated = useMemo(
    () => budgets.reduce((sum, b) => sum + b.allocated_amount, 0),
    [budgets]
  );
  const totalSpent = useMemo(() => budgets.reduce((sum, b) => sum + b.spent, 0), [budgets]);
  const totalPending = useMemo(
    () => budgets.reduce((sum, b) => sum + b.pendingSpend, 0),
    [budgets]
  );

  function getUtilizationColor(util: number) {
    if (util >= 100) return 'text-red-600 bg-red-100';
    if (util >= 90) return 'text-amber-600 bg-amber-100';
    if (util >= 75) return 'text-yellow-600 bg-yellow-100';
    return 'text-emerald-600 bg-emerald-100';
  }

  function getProgressColor(util: number) {
    if (util >= 100) return 'bg-red-500';
    if (util >= 90) return 'bg-amber-500';
    if (util >= 75) return 'bg-yellow-500';
    return 'bg-emerald-500';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Budget Management</h3>
          <p className="text-sm text-slate-500">
            Track and manage departmental budgets
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Budget
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">${totalAllocated.toLocaleString()}</p>
          <p className="text-sm text-slate-500">Total Allocated</p>
        </div>

        <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-sky-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">${totalSpent.toLocaleString()}</p>
          <p className="text-sm text-slate-500">Total Spent</p>
        </div>

        <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            ${(totalAllocated - totalSpent).toLocaleString()}
          </p>
          <p className="text-sm text-slate-500">Remaining Budget</p>
        </div>
      </div>

      {budgets.length === 0 ? (
        <div className="bg-slate-50 rounded-xl p-8 text-center border border-slate-200">
          <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">No budgets have been created yet.</p>
          {isAdmin && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Create First Budget
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {budgets.map((budget) => (
            <div
              key={budget.id}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-slate-800">{budget.department}</h4>
                  <p className="text-sm text-slate-500">
                    FY {budget.fiscal_year}
                    {budget.fiscal_quarter ? ` Q${budget.fiscal_quarter}` : ''} |{' '}
                    {new Date(budget.start_date).toLocaleDateString()} -{' '}
                    {new Date(budget.end_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${getUtilizationColor(
                      budget.utilization
                    )}`}
                  >
                    {budget.utilization.toFixed(1)}% used
                  </span>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => openEditModal(budget)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(budget.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-slate-500">Allocated</p>
                  <p className="text-sm font-semibold text-slate-800">
                    ${budget.allocated_amount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Spent</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    ${budget.spent.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Pending</p>
                  <p className="text-sm font-semibold text-amber-600">
                    ${budget.pendingSpend.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Remaining</p>
                  <p
                    className={`text-sm font-semibold ${
                      budget.allocated_amount - budget.spent < 0 ? 'text-red-600' : 'text-slate-800'
                    }`}
                  >
                    ${(budget.allocated_amount - budget.spent).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getProgressColor(budget.utilization)} transition-all`}
                  style={{ width: `${Math.min(budget.utilization, 100)}%` }}
                />
              </div>

              {budget.utilization >= 90 && (
                <div className="mt-3 flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-xs font-medium">
                    {budget.utilization >= 100
                      ? 'Budget exceeded!'
                      : 'Approaching budget limit'}
                  </span>
                </div>
              )}

              {budget.notes && (
                <p className="mt-3 text-xs text-slate-500 italic">{budget.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                {editingBudget ? 'Edit Budget' : 'Create New Budget'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Department
                </label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select department</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Fiscal Year
                  </label>
                  <input
                    type="number"
                    value={formData.fiscal_year}
                    onChange={(e) =>
                      setFormData({ ...formData, fiscal_year: parseInt(e.target.value) })
                    }
                    required
                    min={2020}
                    max={2100}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Quarter (optional)
                  </label>
                  <select
                    value={formData.fiscal_quarter || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        fiscal_quarter: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Full Year</option>
                    <option value="1">Q1</option>
                    <option value="2">Q2</option>
                    <option value="3">Q3</option>
                    <option value="4">Q4</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Allocated Amount ($)
                </label>
                <input
                  type="number"
                  value={formData.allocated_amount}
                  onChange={(e) => setFormData({ ...formData, allocated_amount: e.target.value })}
                  required
                  min={0}
                  step={100}
                  placeholder="50000"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder="Any additional notes about this budget..."
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : editingBudget ? 'Update Budget' : 'Create Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
