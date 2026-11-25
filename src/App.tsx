import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AssistantPage } from './pages/AssistantPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { FlashcardsPage } from './pages/FlashcardsPage';
import { KnowledgeGraphPage } from './pages/KnowledgeGraphPage';
import { LiveNotesPage } from './pages/LiveNotesPage';
import { LiveTranscriptionPage } from './pages/LiveTranscriptionPage';
import { MeetingRecordingsPage } from './pages/MeetingRecordingsPage';
import { QuizzesPage } from './pages/QuizzesPage';
import { SettingsPage } from './pages/SettingsPage';
import { SummarizationPage } from './pages/SummarizationPage';
import { VisualLearningPage } from './pages/VisualLearningPage';

function SessionLoader() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        Loading workspace...
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <SessionLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <SessionLoader />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <AuthPage mode="login" />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <PublicOnlyRoute>
                  <AuthPage mode="signup" />
                </PublicOnlyRoute>
              }
            />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="summarization" element={<SummarizationPage />} />
              <Route path="transcription" element={<LiveTranscriptionPage />} />
              <Route path="zoom" element={<MeetingRecordingsPage provider="zoom" />} />
              <Route path="google-meet" element={<MeetingRecordingsPage provider="google_meet" />} />
              <Route path="notes" element={<LiveNotesPage />} />
              <Route path="knowledge-graph" element={<KnowledgeGraphPage />} />
              <Route path="assistant" element={<AssistantPage />} />
              <Route path="visual-learning" element={<VisualLearningPage />} />
              <Route path="quizzes" element={<QuizzesPage />} />
              <Route path="flashcards" element={<FlashcardsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
