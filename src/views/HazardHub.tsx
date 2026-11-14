import { useMemo } from 'react'
import { ShieldAlert, CheckCircle2 } from 'lucide-react'
import { Panel } from '../components/ui/Panel'
import { useTrident } from '../context/useTrident'
import { CitizenReportingEngine } from '../components/CitizenReportingEngine'

export function HazardHub() {
  const { reports } = useTrident()

  const statusTone: Record<string, string> = {
    'Pending Review': 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    Verified: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    Dispatched: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  }

  const recent = useMemo(() => reports, [reports])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Primary Citizen Reporting Engine */}
      <CitizenReportingEngine />

      {/* Live Dispatched Reports & Incident Audit Log */}
      <Panel
        title="Live Dispatch Stream & Citizen Submissions Ledger"
        subtitle="Cryptographically logged · Automated department routing · De-duplication filter active"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/50 font-mono text-[10px] tracking-wider text-zinc-400">
              <tr>
                <th className="py-2.5 px-3">TICKET REF</th>
                <th className="py-2.5 px-3">HAZARD CATEGORY</th>
                <th className="py-2.5 px-3">SEVERITY</th>
                <th className="py-2.5 px-3">GPS FIX</th>
                <th className="py-2.5 px-3">DISPATCH STATUS</th>
                <th className="py-2.5 px-3">INTEGRITY</th>
                <th className="py-2.5 px-3">TIMESTAMP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
              {recent.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-zinc-900/40">
                  <td className="py-3 px-3 font-semibold text-cyan-300">{r.id}</td>
                  <td className="py-3 px-3 text-zinc-200">{r.category}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        r.severity === 'Critical'
                          ? 'border border-rose-500/40 bg-rose-950/60 text-rose-300'
                          : r.severity === 'Medium'
                            ? 'border border-amber-500/40 bg-amber-950/60 text-amber-300'
                            : 'border border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
                      }`}
                    >
                      {r.severity}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-[11px] text-zinc-400">
                    {r.lat.toFixed(4)}°N, {r.lng.toFixed(4)}°E
                  </td>
                  <td className="py-3 px-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusTone[r.status] || 'border-zinc-700 text-zinc-400'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {r.duplicateRisk ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                        <ShieldAlert className="h-3 w-3" /> Potential Cluster
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Unique
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-zinc-500">
                    {new Date(r.timestamp).toLocaleTimeString('en-IN', { hour12: false })} IST
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
