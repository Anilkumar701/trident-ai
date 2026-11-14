import { useState, useEffect } from 'react'
import { TridentProvider } from './context/TridentProvider'
import { DashboardProvider, useDashboard } from './context/DashboardContext'
import { AuthProvider } from './context/AuthProvider'
import { Sidebar } from './components/Sidebar'
import { DashboardViews } from './components/DashboardViews'
import { UserAuthButton } from './components/UserAuthButton'
import { Menu, Clock } from 'lucide-react'

function AppShellContent() {
  const { activeTab, visionStream } = useDashboard()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState('')
  const [quotaExceeded, setQuotaExceeded] = useState(false)

  useEffect(() => {
    const handleQuotaExceeded = () => setQuotaExceeded(true)
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded)
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded)
  }, [])

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Kolkata',
        }) + ' IST',
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  const sectorTitles: Record<string, { title: string; subtitle: string }> = {
    traffic: {
      title: 'Traffic Control Terminal',
      subtitle: 'Real-time adaptive corridor synchronization & emergency signal preemption',
    },
    gridmap: {
      title: 'Urban Traffic Grid Overhead Map',
      subtitle: 'Google Maps Platform telemetry, AV fleet tracking & real-time incident preemption',
    },
    simulation: {
      title: 'Real-Time Traffic Grid Simulation',
      subtitle: 'D3.js vehicle movement, interlocking signal phases & dynamic fleet kinetics',
    },
    citizen: {
      title: 'Citizen Reporting Engine',
      subtitle: 'Multi-department automated dispatch & vernacular voice assistant',
    },
    fleet: {
      title: 'Pedestrian & Fleet Hub',
      subtitle: 'Autonomous vehicle kinematic telemetry & 5-state finite state machine',
    },
    waste: {
      title: 'Smart Waste Ecosystem (S3)',
      subtitle: 'Logistical parameter stream & congestion-aware dynamic rerouting',
    },
    flood: {
      title: 'Flood & Video Analytics Monitor',
      subtitle: 'YOLOv8 RTSP neural frame telemetry & conflict rate reduction',
    },
  }

  const currentSector = sectorTitles[activeTab] || sectorTitles.traffic

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 lg:pl-72 flex flex-col">
        {quotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        {/* Top Operational Command Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/90 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            {/* Hamburger button for mobile */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:text-white lg:hidden"
              aria-label="Open navigation sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold tracking-widest text-cyan-400 uppercase">
                  METROPOLIS URBAN COMMAND
                </span>
                <span className="text-slate-600">·</span>
                <span className="font-mono text-[10px] text-slate-400">
                  SIH 2026 EDITION
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                {currentSector.title}
              </h1>
            </div>
          </div>

          {/* Right Header Badges */}
          <div className="flex items-center gap-3 font-mono text-xs">
            {/* Live Camera inference status */}
            <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-slate-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span>{visionStream.fps} FPS</span>
            </div>

            {/* Indian Standard Time Clock */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-slate-300">
              <Clock className="h-3.5 w-3.5 text-cyan-400" />
              <span>{currentTime || '18:00:00 IST'}</span>
            </div>

            {/* Authentication and Cloud SQL Status */}
            <UserAuthButton />
          </div>
        </header>

        {/* Dashboard Main View Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <DashboardViews />
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <TridentProvider>
        <DashboardProvider>
          <AppShellContent />
        </DashboardProvider>
      </TridentProvider>
    </AuthProvider>
  )
}
