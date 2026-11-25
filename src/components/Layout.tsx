import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Mic,
  Network,
  NotebookPen,
  Search,
  Settings,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest, formatDateTime } from '../services/api';

interface NavGroup {
  heading: string;
  items: Array<{ label: string; to: string; icon: React.ComponentType<{ className?: string }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard },
      { label: 'Documents', to: '/documents', icon: FolderOpen },
    ],
  },
  {
    heading: 'Capture & Notes',
    items: [
      { label: 'AI Summarization', to: '/summarization', icon: FileText },
      { label: 'Live Transcription', to: '/transcription', icon: Mic },
      { label: 'Zoom Recordings', to: '/zoom', icon: Video },
      { label: 'Google Meet Recordings', to: '/google-meet', icon: Video },
      { label: 'Live AI Notes', to: '/notes', icon: NotebookPen },
    ],
  },
  {
    heading: 'Understand & Practice',
    items: [
      { label: 'Knowledge Graph', to: '/knowledge-graph', icon: Network },
      { label: 'AI Assistant', to: '/assistant', icon: MessageSquareText },
      { label: 'Visual Learning', to: '/visual-learning', icon: BookOpen },
      { label: 'Quizzes', to: '/quizzes', icon: ClipboardCheck },
      { label: 'Flashcards', to: '/flashcards', icon: Layers },
    ],
  },
  {
    heading: 'Insights & Account',
    items: [
      { label: 'Analytics', to: '/analytics', icon: BarChart3 },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
];

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/documents': 'Documents',
  '/summarization': 'AI Summarization & RAG',
  '/transcription': 'Live Transcription',
  '/zoom': 'Zoom Recordings',
  '/google-meet': 'Google Meet Recordings',
  '/notes': 'Live AI Notes',
  '/knowledge-graph': 'Knowledge Graph',
  '/assistant': 'AI Assistant',
  '/visual-learning': 'Visual Learning',
  '/quizzes': 'Quizzes',
  '/flashcards': 'Flashcards',
  '/analytics': 'Analytics',
  '/settings': 'Settings & Profile',
};

export function Layout() {
  const { user, logout } = useAuth();
  const { notify } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ type: string; title: string; subtitle: string; route: string }>
  >([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; title: string; detail: string; route: string; createdAt: string }>
  >([]);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const pageTitle = ROUTE_TITLES[location.pathname] || 'Workspace';

  useEffect(() => {
    setMobileMenuOpen(false);
    setNotifOpen(false);
    setProfileMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiRequest<{
          results: Array<{ type: string; title: string; subtitle: string; route: string }>;
        }>(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        setSearchResults(res.results);
        setSearchOpen(true);
      } catch {
        setSearchResults([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const openNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) {
      try {
        const res = await apiRequest<{
          notifications: Array<{
            id: string;
            title: string;
            detail: string;
            route: string;
            createdAt: string;
          }>;
        }>('/api/notifications');
        setNotifications(res.notifications);
      } catch {
        setNotifications([]);
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    notify('You have been signed out.', 'info');
    navigate('/login');
  };

  const initials = (user?.fullName || 'ST')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200 shrink-0">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <BrainCircuit className="h-4.5 w-4.5" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight text-slate-900 truncate font-[var(--font-display)]">
            Memory Graph
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading}>
            <p className="px-3 mb-1.5 text-[11px] font-medium text-slate-400">
              {group.heading}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-200 shrink-0">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 fixed inset-y-0 left-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-50 shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400">Workspace</span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <h1 className="font-semibold text-slate-900 truncate text-[15px]">{pageTitle}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Search */}
            <div ref={searchRef} className="relative hidden md:block w-64 xl:w-80">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                placeholder="Search documents, notes, concepts..."
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors"
              />
              {searchOpen && (
                <div className="absolute right-0 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40">
                  {searchResults.length === 0 ? (
                    <p className="px-3.5 py-2.5 text-xs text-slate-500">
                      No matching study items found.
                    </p>
                  ) : (
                    searchResults.map((item, idx) => (
                      <button
                        key={`${item.type}-${idx}`}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          setSearchQuery('');
                          navigate(item.route);
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex flex-col gap-0.5 transition-colors"
                      >
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {item.title}
                        </span>
                        <span className="text-xs text-slate-500">
                          {item.type} · {item.subtitle}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Notifications */}
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={openNotifications}
                aria-label="Study activity notifications"
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Bell className="h-4.5 w-4.5" />
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">Recent Updates</span>
                    <span className="text-xs text-slate-400 tabular-nums">
                      {notifications.length} items
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-xs text-slate-500 text-center">
                        No learning activity yet. Upload a document or start a study session.
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            navigate(n.route);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <p className="text-sm font-medium text-slate-800 leading-snug">
                            {n.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {n.detail} · {formatDateTime(n.createdAt)}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile */}
            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="hidden sm:block text-left min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate max-w-[130px]">
                    {user?.fullName}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate max-w-[130px]">
                    {user?.email}
                  </p>
                </div>
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40">
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {user?.fullName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{user?.department}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full text-left px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Settings className="h-4 w-4 text-slate-400" />
                    Settings & Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
