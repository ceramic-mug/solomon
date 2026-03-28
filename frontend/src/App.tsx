import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import PlanEditor from './pages/PlanEditor'
import Scenarios from './pages/Scenarios'
import AIChat from './pages/AIChat'
import Layout from './components/Layout'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index                          element={<Dashboard />} />
        <Route path="/plans/:id"              element={<PlanEditor />} />
        <Route path="/plans/:id/scenarios"    element={<Scenarios />} />
        <Route path="/plans/:id/chat"         element={<AIChat />} />
      </Route>
    </Routes>
  )
}
