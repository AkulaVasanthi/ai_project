import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, KeyRound, LogOut, Save, Server, Trash2, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest, formatDateShort, type UserProfile } from '../services/api';

export function SettingsPage() {
  const { user, setUser, providerStatus, logout } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [studyGoal, setStudyGoal] = useState(user?.studyGoal || '');
  const [defaultSummaryMode, setDefaultSummaryMode] = useState<'short' | 'detailed'>(
    user?.preferences?.defaultSummaryMode || 'detailed'
  );
  const [quizQuestionCount, setQuizQuestionCount] = useState(
    user?.preferences?.quizQuestionCount || 5
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Clear data confirmation
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: fullName.trim(),
          department: department.trim(),
          studyGoal: studyGoal.trim(),
          preferences: {
            defaultSummaryMode,
            quizQuestionCount,
          },
        }),
      });
      setUser(res.user);
      notify('Profile and study preferences saved.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      notify('New password must be at least 8 characters long.', 'error');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      notify('New passwords do not match.', 'error');
      return;
    }

    setChangingPassword(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      notify('Password updated successfully.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Password update failed.', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleClearStudyData = async () => {
    setClearingData(true);
    try {
      await apiRequest('/api/auth/data', { method: 'DELETE' });
      setConfirmClear(false);
      notify('All study documents, notes, graph nodes, quizzes, and flashcards cleared.', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to clear study data.', 'error');
    } finally {
      setClearingData(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    notify('Signed out.', 'info');
    navigate('/login');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Settings & User Profile</h2>
        <p className="mt-1 text-sm text-slate-600">
          Manage your profile, study preferences, password security, backend AI service status, and account data.
        </p>
      </div>

      {/* Profile & Preferences */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <User className="h-4 w-4 text-blue-600" />
            Profile & Preferences
          </h3>
          <span className="text-xs text-slate-500">
            Member since {formatDateShort(user?.createdAt || '')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="prof-name" className="block text-sm font-medium text-slate-700 mb-1.5">
              Full name
            </label>
            <input
              id="prof-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="prof-email" className="block text-sm font-medium text-slate-700 mb-1.5">
              Email address
            </label>
            <input
              id="prof-email"
              type="email"
              disabled
              value={user?.email || ''}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-500"
            />
          </div>
          <div>
            <label htmlFor="prof-dept" className="block text-sm font-medium text-slate-700 mb-1.5">
              Department / Program
            </label>
            <input
              id="prof-dept"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="prof-goal" className="block text-sm font-medium text-slate-700 mb-1.5">
              Learning goal
            </label>
            <input
              id="prof-goal"
              type="text"
              value={studyGoal}
              onChange={(e) => setStudyGoal(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="pref-sum" className="block text-sm font-medium text-slate-700 mb-1.5">
              Preferred summary style
            </label>
            <select
              id="pref-sum"
              value={defaultSummaryMode}
              onChange={(e) => setDefaultSummaryMode(e.target.value as 'short' | 'detailed')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900"
            >
              <option value="short">Short overview</option>
              <option value="detailed">Detailed academic analysis</option>
            </select>
          </div>
          <div>
            <label htmlFor="pref-qz" className="block text-sm font-medium text-slate-700 mb-1.5">
              Default quiz length
            </label>
            <select
              id="pref-qz"
              value={quizQuestionCount}
              onChange={(e) => setQuizQuestionCount(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900"
            >
              {[3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Change Password */}
      <form
        onSubmit={handleChangePassword}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
      >
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
          <KeyRound className="h-4 w-4 text-purple-600" />
          Change Password
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="cur-pw" className="block text-xs font-semibold text-slate-600 mb-1.5">
              Current password
            </label>
            <input
              id="cur-pw"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="new-pw" className="block text-xs font-semibold text-slate-600 mb-1.5">
              New password (min 8 chars)
            </label>
            <input
              id="new-pw"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="conf-pw" className="block text-xs font-semibold text-slate-600 mb-1.5">
              Confirm new password
            </label>
            <input
              id="conf-pw"
              type="password"
              required
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={changingPassword}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {changingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </form>

      {/* Server-Side AI Provider Status (Read-Only) */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
          <Server className="h-4 w-4 text-teal-600" />
          Backend AI & Vector Store Configuration
        </h3>
        <p className="text-xs text-slate-500">
          All provider credentials and model configurations are managed strictly on the backend server via environment variables.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Active AI Provider</p>
            <p className="mt-1 font-semibold text-slate-900">
              {providerStatus?.activeProvider || 'Gemini API (Server-Side)'}
            </p>
            <p className="mt-1 text-xs text-teal-700 inline-flex items-center gap-1 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {providerStatus?.configured ? 'Configured on server' : 'Awaiting server secret'}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Vector Retrieval Store</p>
            <p className="mt-1 font-semibold text-slate-900">
              {providerStatus?.vectorBackend || 'Embedded SQLite Vector Index'}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-[var(--font-mono)]">
              Text: {providerStatus?.textModel} · Embed: {providerStatus?.embeddingModel}
            </p>
          </div>
        </div>
      </section>

      {/* Data Management & Sign Out */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Account & Data Management</h3>
          <p className="text-xs text-slate-500 mt-1">
            Reset your personal study records or sign out of your session.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Clear Study Data
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearStudyData}
                disabled={clearingData}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {clearingData ? 'Clearing...' : 'Confirm Delete All Data'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="text-xs font-medium text-slate-600 px-2"
              >
                Cancel
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </section>
    </div>
  );
}
