import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ToastProvider } from '@/components/ui/use-toast'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Projects from '@/pages/Projects'
import ProjectDetail from '@/pages/ProjectDetail'
import Scans from '@/pages/Scans'
import Scanners from '@/pages/Scanners'
import Findings from '@/pages/Findings'
import Bypass from '@/pages/Bypass'
import Pipeline from '@/pages/Pipeline'
import TrafficDye from '@/pages/TrafficDye'
import Onboarding from '@/pages/Onboarding'
import Users from '@/pages/Users'
import AuditLogs from '@/pages/AuditLogs'
import Settings from '@/pages/Settings'
import Reports from '@/pages/Reports'
import AppReleases from '@/pages/AppReleases'
import Pentests from '@/pages/Pentests'
import GitlabIntegration from '@/pages/GitlabIntegration'
import GithubIntegration from '@/pages/GithubIntegration'
import ApiKeys from '@/pages/ApiKeys'
import Integration from '@/pages/Integration'
import { isAuthenticated, initAuth, setUser, clearAuth } from '@/lib/auth'
import api from '@/lib/api'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<boolean | null>(null)

  useEffect(() => {
    async function verify() {
      const user = await initAuth()
      if (user) {
        setAuth(true)
      } else {
        clearAuth()
        setAuth(false)
      }
    }

    verify()
  }, [])

  if (auth === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    )
  }

  return auth ? <>{children}</> : <Navigate to="/login" replace />
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-56">
        <Topbar />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout>
              <Dashboard />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <PrivateRoute>
            <AppLayout>
              <Projects />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <PrivateRoute>
            <AppLayout>
              <ProjectDetail />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/scans"
        element={
          <PrivateRoute>
            <AppLayout>
              <Scans />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/scanners"
        element={
          <PrivateRoute>
            <AppLayout>
              <Scanners />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/findings"
        element={
          <PrivateRoute>
            <AppLayout>
              <Findings />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/bypass"
        element={
          <PrivateRoute>
            <AppLayout>
              <Bypass />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/pipeline"
        element={
          <PrivateRoute>
            <AppLayout>
              <Pipeline />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/traffic"
        element={
          <PrivateRoute>
            <AppLayout>
              <TrafficDye />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          <PrivateRoute>
            <AppLayout>
              <Onboarding />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/users"
        element={
          <PrivateRoute>
            <AppLayout>
              <Users />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/audit-logs"
        element={
          <PrivateRoute>
            <AppLayout>
              <AuditLogs />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <AppLayout>
              <Settings />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <PrivateRoute>
            <AppLayout>
              <Reports />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/app-releases"
        element={
          <PrivateRoute>
            <AppLayout>
              <AppReleases />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/pentests"
        element={
          <PrivateRoute>
            <AppLayout>
              <Pentests />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/gitlab-integration"
        element={
          <PrivateRoute>
            <AppLayout>
              <GitlabIntegration />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/github-integration"
        element={
          <PrivateRoute>
            <AppLayout>
              <GithubIntegration />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/api-keys"
        element={
          <PrivateRoute>
            <AppLayout>
              <ApiKeys />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/integration"
        element={
          <PrivateRoute>
            <AppLayout>
              <Integration />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ToastProvider>
  )
}
