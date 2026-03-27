import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { BarChart2, GitBranch, Settings, LogOut, Coins } from 'lucide-react'

export default function Layout() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  const logout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Sidebar */}
      <nav className="w-16 lg:w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 flex items-center gap-3 border-b border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Coins size={16} className="text-white" />
          </div>
          <span className="hidden lg:block font-semibold text-white tracking-tight">Solomon</span>
        </div>

        {/* Nav links */}
        <div className="flex-1 px-2 py-4 space-y-1">
          <NavItem to="/" icon={<BarChart2 size={18} />} label="Dashboard" />
          <NavItem to="/scenarios" icon={<GitBranch size={18} />} label="Scenarios" />
          <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" />
        </div>

        {/* User + logout */}
        <div className="px-3 py-4 border-t border-gray-800">
          <div className="hidden lg:block text-xs text-gray-500 truncate mb-2">{user?.email}</div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm transition-colors w-full"
          >
            <LogOut size={16} />
            <span className="hidden lg:block">Sign out</span>
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-600/20 text-blue-400'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
        }`
      }
    >
      {icon}
      <span className="hidden lg:block">{label}</span>
    </NavLink>
  )
}
