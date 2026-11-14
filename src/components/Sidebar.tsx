import {
  Activity,
  AlertTriangle,
  Boxes,
  Building2,
  Bus,
  Cpu,
  Radio,
  Shield,
  TrafficCone,
  Usb,
  Waves,
  Navigation2,
  X,
} from 'lucide-react'
import { useDashboard, type SectorTab } from '../context/DashboardContext'

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

interface NavItem {
  id: SectorTab
  label: string
  sectorCode: string
  subtitle: string
  badgeText: string
  badgeTone: 'emerald' | 'cyan' | 'amber' | 'rose'
  icon: typeof TrafficCone
}

const NAVIGATION_ITEMS: NavItem[] = [
  {
    id: 'traffic',
    label: 'Traffic Control Terminal',
    sectorCode: 'SEC-01',
    subtitle: 'Adaptive signals & grid override',
    badgeText: '4 NODES',
    badgeTone: 'emerald',
    icon: TrafficCone,
  },
  {
    id: 'gridmap',
    label: 'Overhead Grid Map (GIS)',
    sectorCode: 'MAP-01',
    subtitle: 'Google Maps AV & incident grid',
    badgeText: 'GMP LIVE',
    badgeTone: 'emerald',
    icon: Navigation2,
  },
  {
    id: 'simulation',
    label: 'Traffic Grid Simulation',
    sectorCode: 'SIM-01',
    subtitle: 'Real-time D3.js vehicle kinetics',
    badgeText: 'D3 REALTIME',
    badgeTone: 'cyan',
    icon: Activity,
  },
  {
    id: 'citizen',
    label: 'Citizen Reporting Engine',
    sectorCode: 'SEC-02',
    subtitle: 'Automated municipal dispatch',
    badgeText: 'DISPATCH',
    badgeTone: 'cyan',
    icon: Building2,
  },
  {
    id: 'fleet',
    label: 'Pedestrian & Fleet Hub',
    sectorCode: 'SEC-03',
    subtitle: 'AV telemetry & 5-state FSM',
    badgeText: 'AV LINK',
    badgeTone: 'cyan',
    icon: Bus,
  },
  {
    id: 'waste',
    label: 'Smart Waste Ecosystem',
    sectorCode: 'SEC-04',
    subtitle: 'Logistics S3 & dynamic rerouting',
    badgeText: 'S3 ACTIVE',
    badgeTone: 'amber',
    icon: Boxes,
  },
  {
    id: 'flood',
    label: 'Flood & Video Analytics',
    sectorCode: 'SEC-05',
    subtitle: 'YOLOv8 RTSP & conflict rates',
    badgeText: 'RTSP LIVE',
    badgeTone: 'rose',
    icon: Waves,
  },
  {
    id: 'hardware',
    label: 'Arduino & Mic Bridge',
    sectorCode: 'HW-01',
    subtitle: 'USB UNO, Gas, Touch & Sound',
    badgeText: 'USB + MIC',
    badgeTone: 'emerald',
    icon: Usb,
  },
]

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const { activeTab, setActiveTab, visionStream, hardwareLink, hardwareBridge } = useDashboard()

  const handleTabClick = (tabId: SectorTab) => {
    setActiveTab(tabId)
    if (onMobileClose) {
      onMobileClose()
    }
  }

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800/80 bg-slate-950 transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header Branding */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/40 shadow-[0_0_15px_rgba(6,182,212,0.25)]">
              <Shield className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-wider text-slate-100 uppercase">
                  Metropolis-AI
                </span>
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.2 font-mono text-[9px] font-semibold tracking-wider text-cyan-300 border border-cyan-500/30">
                  CORE
                </span>
              </div>
              <p className="font-mono text-[10px] tracking-widest text-slate-400">
                SIH URBAN COMMAND V2.8
              </p>
            </div>
          </div>

          {/* Close button for mobile */}
          {onMobileClose ? (
            <button
              type="button"
              onClick={onMobileClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-900 hover:text-slate-100 lg:hidden"
              aria-label="Close navigation sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        {/* Global Operational Status Banner */}
        <div className="border-b border-slate-800/60 bg-slate-900/40 px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="font-mono text-[10px] font-medium tracking-wide text-emerald-400">
                NATIONAL CLUSTER ONLINE
              </span>
            </div>
            <span className="font-mono text-[10px] text-slate-400">
              {visionStream.fps} FPS
            </span>
          </div>

          {visionStream.ambulancePresent ? (
            <div className="mt-2 flex items-center gap-1.5 rounded border border-rose-500/40 bg-rose-500/15 px-2 py-1 font-mono text-[10px] font-bold text-rose-300 animate-pulse">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              PRIORITY SIREN EVENT ACTIVE
            </div>
          ) : null}
        </div>

        {/* Navigation Sectors */}
        <div className="px-3 pt-3">
          <p className="px-2 pb-1.5 font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
            OPERATIONAL SECTORS
          </p>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-1">
          {NAVIGATION_ITEMS.map((item) => {
            const isActive = activeTab === item.id
            const IconComponent = item.icon

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabClick(item.id)}
                className={`group relative flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                  isActive
                    ? 'border-cyan-500/50 bg-gradient-to-r from-cyan-950/40 to-slate-900/60 shadow-[0_0_20px_rgba(6,182,212,0.15)] text-slate-100'
                    : 'border-slate-800/60 bg-slate-950 text-slate-400 hover:border-slate-700 hover:bg-slate-900/50 hover:text-slate-200'
                }`}
              >
                {/* Active Indicator Bar */}
                {isActive ? (
                  <span className="absolute top-2 bottom-2 left-0 w-1 rounded-r bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                ) : null}

                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    isActive
                      ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                      : 'border-slate-800 bg-slate-900/80 text-slate-400 group-hover:border-slate-700 group-hover:text-slate-300'
                  }`}
                >
                  <IconComponent className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[9px] font-semibold tracking-wider text-slate-400">
                      {item.sectorCode}
                    </span>
                    <span
                      className={`font-mono text-[9px] px-1.5 py-0.2 rounded border ${
                        item.badgeTone === 'emerald'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : item.badgeTone === 'cyan'
                            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                            : item.badgeTone === 'amber'
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                      }`}
                    >
                      {item.badgeText}
                    </span>
                  </div>

                  <p
                    className={`text-xs font-semibold tracking-wide truncate ${
                      isActive ? 'text-white' : 'text-slate-200'
                    }`}
                  >
                    {item.label}
                  </p>

                  <p className="font-mono text-[10px] text-slate-400 truncate mt-0.5">
                    {item.subtitle}
                  </p>
                </div>
              </button>
            )
          })}
        </nav>

        {/* Autonomous Telemetry Hardware Status Card */}
        <div className="border-t border-slate-800/80 p-3.5 bg-slate-950/80">
          <button
            type="button"
            onClick={() => handleTabClick('hardware')}
            className={`w-full text-left rounded-xl border p-3 space-y-2 transition ${
              activeTab === 'hardware'
                ? 'border-emerald-500/50 bg-emerald-950/20'
                : 'border-slate-800/80 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                <span className="font-mono text-[10px] font-semibold text-slate-300">
                  HARDWARE &amp; SENSOR BRIDGE
                </span>
              </div>
              <span
                className={`font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                  hardwareBridge.arduinoConnected || hardwareBridge.micActive || hardwareLink.isLinked
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {hardwareBridge.arduinoConnected
                  ? 'UNO USB'
                  : hardwareBridge.micActive
                    ? 'MIC LIVE'
                    : hardwareLink.isLinked
                      ? 'LINKED'
                      : 'STANDBY'}
              </span>
            </div>

            <p className="font-mono text-[9px] text-slate-400 leading-relaxed truncate">
              {hardwareBridge.arduinoConnected
                ? `Gas ${hardwareBridge.gasPercent}% · Touch ${hardwareBridge.touchActive ? 'PRESSED' : 'IDLE'} · LED ${hardwareBridge.ledColor}`
                : hardwareLink.statusMessage}
            </p>

            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <Radio className="h-3 w-3 text-emerald-400" /> 9600 BAUD / MIC
              </span>
              <span className="text-cyan-400">OPEN BRIDGE &rarr;</span>
            </div>
          </button>
        </div>

        {/* Footer Info */}
        <div className="border-t border-slate-900 px-5 py-3 text-center">
          <p className="font-mono text-[10px] text-slate-400">
            METROPOLIS CORE · SMART INDIA HACKATHON
          </p>
        </div>
      </aside>
    </>
  )
}
