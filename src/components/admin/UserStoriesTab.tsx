import { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  User,
  Lightbulb,
  AlertCircle,
  Clock,
  X,
  Loader2,
  Layers,
  Pencil,
  Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface UserStory {
  id: string;
  story_id: string;
  persona: string;
  title: string;
  want_statement: string;
  benefit_statement: string;
  problem_context: string | null;
  solution_description: string | null;
  category: string;
  priority: string;
  status: string;
  contributor_name: string | null;
  contributor_email: string | null;
  created_at: string;
}

interface StoryForm {
  persona: string;
  title: string;
  want_statement: string;
  benefit_statement: string;
  problem_context: string;
  solution_description: string;
  category: string;
  priority: string;
  contributor_name: string;
  contributor_email: string;
}

const CATEGORIES = [
  { value: 'all', label: 'All', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  { value: 'submission', label: 'Submission', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'approval', label: 'Approval', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  { value: 'receipts', label: 'Receipts', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'tracking', label: 'Tracking', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { value: 'reporting', label: 'Reporting', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'compliance', label: 'Compliance', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'general', label: 'General', color: 'bg-slate-50 text-slate-600 border-slate-200' },
];

const PERSONAS = [
  'Employee',
  'Approver',
  'Finance Admin',
  'IT Leadership',
  'New Employee',
  'System',
  'All Users',
];

const PRIORITIES = [
  { value: 'high', label: 'High', dot: 'bg-red-500', bg: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'medium', label: 'Medium', dot: 'bg-amber-500', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'low', label: 'Low', dot: 'bg-slate-400', bg: 'bg-slate-100 text-slate-600 border-slate-200' },
];

const emptyForm: StoryForm = {
  persona: 'Employee',
  title: '',
  want_statement: '',
  benefit_statement: '',
  problem_context: '',
  solution_description: '',
  category: 'general',
  priority: 'medium',
  contributor_name: '',
  contributor_email: '',
};

export default function UserStoriesTab() {
  const [stories, setStories] = useState<UserStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [expandedStory, setExpandedStory] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingStory, setEditingStory] = useState<UserStory | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formData, setFormData] = useState<StoryForm>(emptyForm);

  useEffect(() => {
    loadStories();
  }, []);

  async function loadStories() {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_stories')
      .select('*')
      .order('story_id', { ascending: true });

    if (!error && data) {
      setStories(data);
    }
    setLoading(false);
  }

  function openAddModal() {
    setEditingStory(null);
    setFormData(emptyForm);
    setShowModal(true);
  }

  function openEditModal(story: UserStory) {
    setEditingStory(story);
    setFormData({
      persona: story.persona,
      title: story.title,
      want_statement: story.want_statement,
      benefit_statement: story.benefit_statement,
      problem_context: story.problem_context || '',
      solution_description: story.solution_description || '',
      category: story.category,
      priority: story.priority,
      contributor_name: story.contributor_name || '',
      contributor_email: story.contributor_email || '',
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingStory(null);
    setFormData(emptyForm);
  }

  async function handleSave() {
    if (!formData.title || !formData.want_statement || !formData.benefit_statement) return;

    setSaving(true);

    if (editingStory) {
      const { error } = await supabase
        .from('user_stories')
        .update({
          persona: formData.persona,
          title: formData.title,
          want_statement: formData.want_statement,
          benefit_statement: formData.benefit_statement,
          problem_context: formData.problem_context || null,
          solution_description: formData.solution_description || null,
          category: formData.category,
          priority: formData.priority,
          contributor_name: formData.contributor_name || null,
          contributor_email: formData.contributor_email || null,
        })
        .eq('id', editingStory.id);

      if (!error) {
        await loadStories();
        closeModal();
      }
    } else {
      if (!formData.contributor_name || !formData.contributor_email) {
        setSaving(false);
        return;
      }

      const { data: storyId } = await supabase.rpc('generate_story_id');

      const { error } = await supabase.from('user_stories').insert({
        story_id: storyId,
        persona: formData.persona,
        title: formData.title,
        want_statement: formData.want_statement,
        benefit_statement: formData.benefit_statement,
        problem_context: formData.problem_context || null,
        solution_description: formData.solution_description || null,
        category: formData.category,
        priority: formData.priority,
        contributor_name: formData.contributor_name,
        contributor_email: formData.contributor_email,
      });

      if (!error) {
        await loadStories();
        closeModal();
      }
    }
    setSaving(false);
  }

  async function handleDelete(storyId: string) {
    if (!confirm('Are you sure you want to delete this user story? This action cannot be undone.')) {
      return;
    }

    setDeleting(storyId);
    const { error } = await supabase.from('user_stories').delete().eq('id', storyId);

    if (!error) {
      await loadStories();
    }
    setDeleting(null);
  }

  const filteredStories = stories.filter((story) => {
    const matchesSearch =
      searchQuery === '' ||
      story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.want_statement.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.persona.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.story_id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || story.category === selectedCategory;
    const matchesPriority = !selectedPriority || story.priority === selectedPriority;

    return matchesSearch && matchesCategory && matchesPriority;
  });

  const categoryStats = CATEGORIES.slice(1).map((cat) => ({
    ...cat,
    count: stories.filter((s) => s.category === cat.value).length,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  const isFormValid = editingStory
    ? formData.title && formData.want_statement && formData.benefit_statement
    : formData.title && formData.want_statement && formData.benefit_statement && formData.contributor_name && formData.contributor_email;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">User Stories</h2>
              <p className="text-slate-300 text-sm mt-1 max-w-lg">
                Product requirements from real user perspectives. Each story captures a pain point with legacy systems and how SpendGuard addresses it.
              </p>
            </div>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Story
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-5">
          {categoryStats.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(selectedCategory === cat.value ? 'all' : cat.value)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                selectedCategory === cat.value
                  ? 'bg-white text-slate-800 font-medium'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {cat.label}
              <span className={`ml-1.5 ${selectedCategory === cat.value ? 'text-slate-500' : 'text-slate-300'}`}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, title, persona..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.slice(1).map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
            <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                onClick={() => setSelectedPriority(selectedPriority === p.value ? null : p.value)}
                className={`px-3 py-2 text-sm transition-colors flex items-center gap-1.5 ${
                  selectedPriority === p.value
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {filteredStories.length} of {stories.length} stories
        </p>
        {(selectedCategory !== 'all' || selectedPriority || searchQuery) && (
          <button
            onClick={() => {
              setSelectedCategory('all');
              setSelectedPriority(null);
              setSearchQuery('');
            }}
            className="text-sm text-teal-600 hover:text-teal-700"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="space-y-3">
        {filteredStories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            expanded={expandedStory === story.id}
            onToggle={() => setExpandedStory(expandedStory === story.id ? null : story.id)}
            onEdit={() => openEditModal(story)}
            onDelete={() => handleDelete(story.id)}
            deleting={deleting === story.id}
          />
        ))}

        {filteredStories.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-slate-800">No stories found</h3>
            <p className="text-sm text-slate-500 mt-1">Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">
                  {editingStory ? 'Edit User Story' : 'Add New User Story'}
                </h3>
                <p className="text-sm text-slate-500">
                  {editingStory ? `Editing ${editingStory.story_id}` : 'Contribute a new requirement or idea'}
                </p>
              </div>
              <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {!editingStory && (
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-teal-600" />
                    <span className="text-sm font-medium text-teal-800">Your Information</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-teal-700 mb-1">Name *</label>
                      <input
                        type="text"
                        value={formData.contributor_name}
                        onChange={(e) => setFormData({ ...formData, contributor_name: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-teal-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                        placeholder="John Smith"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-teal-700 mb-1">Email *</label>
                      <input
                        type="email"
                        value={formData.contributor_email}
                        onChange={(e) => setFormData({ ...formData, contributor_email: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-teal-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                        placeholder="john@company.com"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingStory && editingStory.contributor_name && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-600">
                      Originally contributed by <span className="font-medium">{editingStory.contributor_name}</span>
                    </span>
                  </div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Persona *</label>
                  <select
                    value={formData.persona}
                    onChange={(e) => setFormData({ ...formData, persona: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  >
                    {PERSONAS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  >
                    {CATEGORIES.slice(1).map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Story Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  placeholder="e.g., Mobile-First Quick Submission"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                <p className="text-xs font-medium text-slate-700">User Story Format</p>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    As a {formData.persona}, I want to... *
                  </label>
                  <textarea
                    value={formData.want_statement}
                    onChange={(e) => setFormData({ ...formData, want_statement: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none bg-white"
                    rows={2}
                    placeholder="submit a purchase request in under 2 minutes from my phone"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">So that... *</label>
                  <textarea
                    value={formData.benefit_statement}
                    onChange={(e) => setFormData({ ...formData, benefit_statement: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none bg-white"
                    rows={2}
                    placeholder="I can capture expenses immediately without returning to my desk"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Current Problem (optional)</label>
                <textarea
                  value={formData.problem_context}
                  onChange={(e) => setFormData({ ...formData, problem_context: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
                  rows={2}
                  placeholder="Describe the current pain point..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Proposed Solution (optional)</label>
                <textarea
                  value={formData.solution_description}
                  onChange={(e) => setFormData({ ...formData, solution_description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
                  rows={2}
                  placeholder="How SpendGuard could solve this..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Priority</label>
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, priority: p.value })}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-all flex items-center justify-center gap-2 ${
                        formData.priority === p.value
                          ? p.bg + ' border-current font-medium'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !isFormValid}
                className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white rounded-lg flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingStory ? 'Save Changes' : 'Add Story'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StoryCard({
  story,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  deleting,
}: {
  story: UserStory;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const priority = PRIORITIES.find((p) => p.value === story.priority);
  const category = CATEGORIES.find((c) => c.value === story.category);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="p-5">
        <div className="flex items-start gap-4">
          <button
            onClick={onToggle}
            className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center shadow-sm hover:from-teal-600 hover:to-teal-700 transition-colors"
          >
            <span className="text-base font-bold text-white">
              {story.story_id.replace('US-', '')}
            </span>
          </button>
          <button onClick={onToggle} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                {story.persona}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded border ${priority?.bg}`}>
                {story.priority.charAt(0).toUpperCase() + story.priority.slice(1)}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded border ${category?.color}`}>
                {category?.label}
              </span>
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1.5">{story.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              <span className="text-slate-400">As a</span> {story.persona},{' '}
              <span className="text-slate-400">I want to</span> {story.want_statement},{' '}
              <span className="text-slate-400">so that</span> {story.benefit_statement}
            </p>
          </button>
          <div className="flex-shrink-0 flex items-center gap-1">
            <button
              onClick={onEdit}
              className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
              title="Edit story"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              title="Delete story"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
            <button onClick={onToggle} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
              {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100">
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            {story.problem_context && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Current Problem</h4>
                </div>
                <p className="text-sm text-amber-900 leading-relaxed">{story.problem_context}</p>
              </div>
            )}
            {story.solution_description && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-teal-600" />
                  <h4 className="text-xs font-semibold text-teal-800 uppercase tracking-wide">SpendGuard Solution</h4>
                </div>
                <p className="text-sm text-teal-900 leading-relaxed">{story.solution_description}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
            {story.contributor_name ? (
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Contributed by {story.contributor_name}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-teal-600">
                <Layers className="w-3.5 h-3.5" />
                Core Requirement
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {new Date(story.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
