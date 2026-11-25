import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrainCircuit, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface AuthPageProps {
  mode: 'login' | 'signup';
}

export function AuthPage({ mode }: AuthPageProps) {
  const { login, signup } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [imgError, setImgError] = useState(false);

  const isSignup = mode === 'signup';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isSignup) {
      if (fullName.trim().length < 2) {
        setError('Please enter your full name (at least 2 characters).');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        await signup(fullName.trim(), email.trim(), password, department.trim());
        notify('Account created. Welcome to AI Learning Memory Graph!');
      } else {
        await login(email.trim(), password);
        notify('Signed in successfully.');
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-stretch">
      {/* Left Form Panel */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 bg-white border-r border-slate-200">
        <div className="w-full max-w-md mx-auto">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 font-[var(--font-display)]">
              AI Learning Memory Graph
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {isSignup ? 'Create your study workspace' : 'Sign in to your workspace'}
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {isSignup
              ? 'Connect your lecture PDFs, transcripts, AI notes, concept graphs, quizzes, and study analytics in one account.'
              : 'Access your indexed documents, knowledge graphs, flashcards, and learning analytics.'}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/70 px-3.5 py-3 text-sm text-red-800"
            >
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isSignup && (
              <>
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Full name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Ananya Sharma"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="department" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Department or major
                  </label>
                  <input
                    id="department"
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Computer Science & Engineering"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@university.edu"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignup ? 'Minimum 8 characters' : 'Enter your password'}
                  className="w-full rounded-lg border border-slate-300 bg-white pl-3.5 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isSignup && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              <span>
                {submitting
                  ? isSignup
                    ? 'Creating account...'
                    : 'Signing in...'
                  : isSignup
                    ? 'Create account'
                    : 'Sign in'}
              </span>
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-600 text-center">
            {isSignup ? (
              <>
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New to AI Learning Memory Graph?{' '}
                <Link to="/signup" className="font-semibold text-blue-600 hover:text-blue-700">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Right Editorial Showcase Panel */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[52%] flex-col justify-between p-12 bg-[#F8FAFC]">
        <div className="max-w-lg">
          <p className="text-xs font-medium text-blue-700">Integrated Academic Learning System</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 leading-tight">
            Turn lectures, PDFs, and notes into a connected memory graph.
          </h2>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            Every study material you upload is indexed for grounded RAG retrieval, mapped into an interactive concept graph, and converted into quizzes, flashcards, and progress analytics.
          </p>
        </div>

        <div className="my-8 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xs">
          {!imgError ? (
            <img
              src="/src/assets/images/auth_knowledge_network_1795482805125.jpg"
              alt="Interconnected translucent knowledge graph pathways in royal blue, soft purple, and teal"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-80 object-cover"
            />
          ) : (
            <div className="w-full h-80 bg-gradient-to-br from-blue-50 via-white to-teal-50 flex flex-col items-center justify-center p-8 text-center">
              <BrainCircuit className="h-12 w-12 text-blue-600 mb-3" />
              <p className="text-sm font-semibold text-slate-800">AI Learning Memory Graph</p>
              <p className="text-xs text-slate-500 mt-1">Connected concepts, RAG retrieval, and active recall</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-200">
          <div>
            <p className="text-sm font-semibold text-slate-900">Document RAG</p>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Page-cited answers grounded in your uploaded PDFs.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Knowledge Graph</p>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Interactive concept nodes and directed relationships.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Active Recall</p>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Auto-generated quizzes, flashcards, and analytics.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
