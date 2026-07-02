'use client'

import { useState, useEffect, useCallback } from 'react'

interface TeamInfo { name: string; shortName: string; tla: string; crest: string }
interface Score { home: number | null; away: number | null }
interface Goal { minute: number; team: string; scorer: string; type: string }

interface Match {
  id: number
  utcDate: string
  status: string
  stage: string
  group: string | null
  homeTeam: TeamInfo
  awayTeam: TeamInfo
  score: { fullTime: Score; halfTime: Score }
  goals: Goal[]
  venue: string
}

interface TournamentStage { id: string; label: string; total: number; completed: number; active: boolean }

interface DashboardData {
  updatedAt: string
  competition: string
  season: string
  stages: TournamentStage[]
  finished: Match[]
  upcoming: Match[]
  liveCount: number
  totalMatches: number
}

const GMT7 = 'Asia/Jakarta'
const PAGE_SIZE = 5

function toGMT7(utcDate: string) {
  return new Date(utcDate).toLocaleString('en-GB', {
    timeZone: GMT7, weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function dayLabel(utcDate: string) {
  const d = new Date(utcDate)
  const now = new Date()
  const toDay = (dt: Date) => new Date(dt.toLocaleDateString('en-CA', { timeZone: GMT7 }))
  const diff = Math.round((toDay(d).getTime() - toDay(now).getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-GB', { timeZone: GMT7, weekday: 'long', month: 'short', day: 'numeric' })
}

function groupByDay(matches: Match[]): Map<string, Match[]> {
  const map = new Map<string, Match[]>()
  for (const m of matches) {
    const key = new Date(m.utcDate).toLocaleDateString('en-CA', { timeZone: GMT7 })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(m)
  }
  return map
}

function stageColor(stage: string) {
  const s = (stage ?? '').toLowerCase()
  if (s.includes('group')) return '#58a6ff'
  if (s.includes('36')) return '#3fb950'
  if (s.includes('16')) return '#e3b341'
  if (s.includes('quarter')) return '#f0883e'
  if (s.includes('semi')) return '#bc8cff'
  if (s.includes('third') || s.includes('3rd') || s.includes('place')) return '#ff7b72'
  if (s.includes('final')) return '#ffd700'
  return '#8b949e'
}

function statusBadge(status: string) {
  switch (status) {
    case 'FINISHED':  return { label: 'FT',    color: '#3fb950' }
    case 'IN_PLAY':   return { label: 'LIVE',  color: '#f85149' }
    case 'PAUSED':    return { label: 'HT',    color: '#f0883e' }
    case 'TIMED':     return { label: 'SCHED', color: '#8b949e' }
    case 'SCHEDULED': return { label: 'SCHED', color: '#8b949e' }
    case 'POSTPONED': return { label: 'PPD',   color: '#f85149' }
    case 'CANCELLED': return { label: 'CANC',  color: '#f85149' }
    default:          return { label: status ?? '?', color: '#8b949e' }
  }
}

// Goal type labels
function goalTypeLabel(type: string) {
  switch (type) {
    case 'PENALTY':    return 'P'
    case 'OWN_GOAL':   return 'OG'
    case 'FREE_KICK':  return 'FK'
    default:           return ''
  }
}

function GoalsSection({ goals, homeTeam, awayTeam }: { goals: Goal[]; homeTeam: TeamInfo; awayTeam: TeamInfo }) {
  if (!goals.length) return null

  const homeTla = homeTeam?.tla ?? homeTeam?.shortName ?? ''
  const awayTla = awayTeam?.tla ?? awayTeam?.shortName ?? ''

  const homeGoals = goals.filter(g => g.team === homeTla || g.team === homeTeam?.shortName || g.team === homeTeam?.name)
  const awayGoals = goals.filter(g => g.team === awayTla || g.team === awayTeam?.shortName || g.team === awayTeam?.name)
  // Fallback: if team matching fails, split by order
  const allSorted = [...goals].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      paddingTop: 10,
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      gap: 6,
      alignItems: 'start',
    }}>
      {/* Home goals */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {allSorted
          .filter(g => {
            const t = (g.team ?? '').toLowerCase()
            return t === homeTla.toLowerCase() || t === (homeTeam?.shortName ?? '').toLowerCase() || t === (homeTeam?.name ?? '').toLowerCase()
          })
          .map((g, i) => {
            const tag = goalTypeLabel(g.type)
            return (
              <div key={i} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11 }}>⚽</span>
                <span style={{ color: 'var(--text)' }}>{g.scorer}</span>
                {tag && <span style={{ color: 'var(--orange)', fontSize: 10, fontWeight: 700 }}>{tag}</span>}
                <span style={{ color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{g.minute}&apos;</span>
              </div>
            )
          })}
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', margin: '0 4px' }} />

      {/* Away goals */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {allSorted
          .filter(g => {
            const t = (g.team ?? '').toLowerCase()
            return t === awayTla.toLowerCase() || t === (awayTeam?.shortName ?? '').toLowerCase() || t === (awayTeam?.name ?? '').toLowerCase()
          })
          .map((g, i) => {
            const tag = goalTypeLabel(g.type)
            return (
              <div key={i} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-start' }}>
                <span style={{ fontSize: 11 }}>⚽</span>
                <span style={{ color: 'var(--text)' }}>{g.scorer}</span>
                {tag && <span style={{ color: 'var(--orange)', fontSize: 10, fontWeight: 700 }}>{tag}</span>}
                <span style={{ color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{g.minute}&apos;</span>
              </div>
            )
          })}
      </div>
    </div>
  )
}

function MatchCard({ match, showGoals }: { match: Match; showGoals?: boolean }) {
  const ht = match.homeTeam ?? { name: '', shortName: '', tla: '', crest: '' }
  const at = match.awayTeam ?? { name: '', shortName: '', tla: '', crest: '' }
  const score = match.score ?? { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } }
  const ft = score.fullTime ?? { home: null, away: null }
  const goals: Goal[] = Array.isArray(match.goals) ? match.goals : []
  const status = match.status ?? ''
  const stage = match.stage ?? ''
  const venue = match.venue ?? ''
  const badge = statusBadge(status)
  const hasScore = ft.home !== null && ft.away !== null

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Stage + status row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: stageColor(stage), fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {match.group ?? stage.replace(/_/g, ' ')}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: badge.color, background: badge.color + '22', padding: '2px 7px', borderRadius: 99 }}>
          {badge.label}
        </span>
      </div>

      {/* Teams + score row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Home */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          {ht.crest && <img src={ht.crest} alt={ht.tla || 'home'} width={24} height={24} style={{ objectFit: 'contain' }} loading="lazy" />}
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{ht.shortName || ht.name || 'TBD'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ht.tla || '—'}</div>
          </div>
        </div>

        {/* Score / time */}
        <div style={{ textAlign: 'center', minWidth: 64 }}>
          {hasScore ? (
            <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: 2 }}>
              {ft.home} <span style={{ color: 'var(--text-faint)' }}>:</span> {ft.away}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {match.utcDate
                ? new Date(match.utcDate).toLocaleTimeString('en-GB', { timeZone: GMT7, hour: '2-digit', minute: '2-digit' })
                : '--:--'}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>GMT+7</div>
        </div>

        {/* Away */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{at.shortName || at.name || 'TBD'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{at.tla || '—'}</div>
          </div>
          {at.crest && <img src={at.crest} alt={at.tla || 'away'} width={24} height={24} style={{ objectFit: 'contain' }} loading="lazy" />}
        </div>
      </div>

      {/* Venue */}
      {venue ? (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>📍</span> {venue}
        </div>
      ) : null}

      {/* Goals — always visible in past results */}
      {showGoals && goals.length > 0 && (
        <GoalsSection goals={goals} homeTeam={ht} awayTeam={at} />
      )}
    </div>
  )
}

function Pagination({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 12 }}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        style={{
          padding: '5px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
          background: 'var(--surface2)', color: page === 1 ? 'var(--text-faint)' : 'var(--text)',
          fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer',
        }}
      >← Prev</button>

      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            width: 32, height: 32, borderRadius: 'var(--radius)', border: '1px solid',
            borderColor: p === page ? 'var(--blue)' : 'var(--border)',
            background: p === page ? '#1a2a3d' : 'var(--surface2)',
            color: p === page ? 'var(--blue)' : 'var(--text-muted)',
            fontSize: 13, fontWeight: p === page ? 700 : 400, cursor: 'pointer',
          }}
        >{p}</button>
      ))}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        style={{
          padding: '5px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
          background: 'var(--surface2)', color: page === totalPages ? 'var(--text-faint)' : 'var(--text)',
          fontSize: 13, cursor: page === totalPages ? 'not-allowed' : 'pointer',
        }}
      >Next →</button>

      <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 4 }}>
        Page {page} / {totalPages}
      </span>
    </div>
  )
}

function TournamentFlow({ stages }: { stages: TournamentStage[] }) {
  const safeStages = Array.isArray(stages) ? stages.filter(Boolean) : []
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
      {safeStages.map((s, i) => {
        const pct = (s.total ?? 0) > 0 ? Math.round(((s.completed ?? 0) / s.total) * 100) : 0
        const isLast = i === safeStages.length - 1
        const isFinalStage = (s.label ?? '').toLowerCase().includes('final') &&
          !(s.label ?? '').toLowerCase().includes('semi') &&
          !(s.label ?? '').toLowerCase().includes('quarter')
        return (
          <div key={s.id ?? i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '12px 14px',
              background: s.active ? 'var(--green-dim)' : 'transparent',
              border: s.active ? '1px solid var(--green)' : '1px solid var(--border)',
              borderRadius: 'var(--radius)', minWidth: 90,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: s.active ? 'var(--green)' : ((s.completed === s.total && (s.total ?? 0) > 0) ? '#30363d' : 'var(--surface2)'),
                border: `2px solid ${s.active ? 'var(--green)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
                color: s.active ? '#0d1117' : 'var(--text-muted)',
              }}>
                {isFinalStage ? '🏆' : i + 1}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: s.active ? 'var(--green)' : 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>
                {s.label ?? ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {s.completed ?? 0}/{s.total ?? 0}
              </div>
              {(s.total ?? 0) > 0 && (
                <div style={{ width: '100%', height: 3, background: 'var(--border)', borderRadius: 2 }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    background: s.active ? 'var(--green)' : (pct === 100 ? '#30363d' : 'var(--blue)'),
                    borderRadius: 2, transition: 'width 0.5s ease',
                  }} />
                </div>
              )}
            </div>
            {!isLast && <div style={{ width: 24, height: 2, background: 'var(--border)', flexShrink: 0 }} />}
          </div>
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeResultTab, setActiveResultTab] = useState('all')
  const [resultPage, setResultPage] = useState(1)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/data')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `API error ${res.status}`)
      }
      const json = await res.json() as DashboardData
      json.stages   = Array.isArray(json.stages)   ? json.stages   : []
      json.finished  = Array.isArray(json.finished)  ? json.finished  : []
      json.upcoming  = Array.isArray(json.upcoming)  ? json.upcoming  : []
      json.finished  = json.finished.map(m  => ({ ...m,  goals: Array.isArray(m.goals)  ? m.goals  : [] }))
      json.upcoming  = json.upcoming.map(m  => ({ ...m,  goals: Array.isArray(m.goals)  ? m.goals  : [] }))
      setData(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch('/api/refresh', { method: 'POST' })
      await fetchData(true)
    } catch { /* silent */ }
    setRefreshing(false)
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(() => fetchData(true), 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [fetchData])

  // Reset page when tab changes
  const handleTabChange = (tab: string) => {
    setActiveResultTab(tab)
    setResultPage(1)
  }

  const stageIds = data ? [...new Set(data.finished.map((m: Match) => m.stage))] : []
  const filteredFinished: Match[] = data
    ? (activeResultTab === 'all' ? data.finished : data.finished.filter((m: Match) => m.stage === activeResultTab))
    : []

  const totalPages = Math.ceil(filteredFinished.length / PAGE_SIZE)
  const pagedFinished = filteredFinished.slice((resultPage - 1) * PAGE_SIZE, resultPage * PAGE_SIZE)

  const upcomingByDay: Map<string, Match[]> = data?.upcoming?.length
    ? groupByDay(data.upcoming)
    : new Map<string, Match[]>()

  function fmtUpdated(iso: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: GMT7, month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }) + ' GMT+7'
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(13,17,23,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>⚽</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>FIFA World Cup 2026</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Live Scoring Dashboard</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {data && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
              <div>
                <strong style={{ color: 'var(--text)' }}>{data.totalMatches ?? 0}</strong> matches · Updated: {fmtUpdated(data.updatedAt)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 2 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse-dot 2s ease-in-out infinite' }} />
                football-data.org connected
              </div>
            </div>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: refreshing ? 'var(--surface2)' : 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              padding: '7px 14px', color: 'var(--text)', fontSize: 13, fontWeight: 500,
              opacity: refreshing ? 0.7 : 1, transition: 'all 0.2s',
            }}
          >
            <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && (
          <div style={{ background: '#2d1a1a', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: '12px 16px', color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error} — <button onClick={() => fetchData()} style={{ color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>retry</button>
          </div>
        )}

        {loading && !data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[300, 500, 400].map((w, i) => (
              <div key={i} className="skeleton" style={{ height: 80, maxWidth: w }} />
            ))}
          </div>
        ) : data ? (
          <>
            {/* Tournament Progress */}
            <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 18 }}>🏆</span>
                <h2 style={{ fontSize: 15, fontWeight: 700 }}>Tournament Progress</h2>
                {(data.liveCount ?? 0) > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', background: '#f8514922', padding: '2px 8px', borderRadius: 99, animation: 'pulse-dot 1.5s ease-in-out infinite' }}>
                    ● {data.liveCount} LIVE
                  </span>
                )}
              </div>
              <TournamentFlow stages={data.stages ?? []} />
            </section>

            {/* Upcoming Matches */}
            <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 18 }}>📅</span>
                <h2 style={{ fontSize: 15, fontWeight: 700 }}>Upcoming Matches</h2>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(Next 3 days · GMT+7)</span>
              </div>
              {upcomingByDay.size === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>No upcoming matches in next 3 days</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {[...upcomingByDay.entries()].map(([day, dayMatches]: [string, Match[]]) => (
                    <div key={day}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--blue)', fontWeight: 700 }}>
                          {dayMatches.length > 0 ? dayLabel(dayMatches[0].utcDate) : day}
                        </span>
                        <span>{dayMatches.length} match{dayMatches.length !== 1 ? 'es' : ''}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                        {dayMatches.map((m: Match) => <MatchCard key={m.id} match={m} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Past Results */}
            <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <h2 style={{ fontSize: 15, fontWeight: 700 }}>Past Results</h2>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  ({filteredFinished.length} matches · showing {pagedFinished.length} per page)
                </span>
              </div>

              {/* Stage filter tabs */}
              {stageIds.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {(['all', ...stageIds] as string[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => handleTabChange(s)}
                      style={{
                        padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        border: '1px solid',
                        borderColor: activeResultTab === s ? 'var(--green)' : 'var(--border)',
                        background: activeResultTab === s ? 'var(--green-dim)' : 'transparent',
                        color: activeResultTab === s ? 'var(--green)' : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {s === 'all' ? `All (${data.finished.length})` : `${s.replace(/_/g, ' ')} (${data.finished.filter(m => m.stage === s).length})`}
                    </button>
                  ))}
                </div>
              )}

              {pagedFinished.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>No completed matches yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pagedFinished.map((m: Match) => (
                    <div key={m.id}>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{toGMT7(m.utcDate)}</div>
                      <MatchCard match={m} showGoals />
                    </div>
                  ))}
                </div>
              )}

              <Pagination page={resultPage} totalPages={totalPages} onChange={(p) => { setResultPage(p); window.scrollTo({ top: document.querySelector('section:last-of-type')?.getBoundingClientRect().top ?? 0 + window.scrollY - 80, behavior: 'smooth' }) }} />
            </section>
          </>
        ) : null}
      </main>

      <style>{`
        :root {
          --bg: #0d1117;
          --surface: #161b22;
          --surface2: #21262d;
          --border: #30363d;
          --text: #e6edf3;
          --text-muted: #8b949e;
          --text-faint: #484f58;
          --green: #3fb950;
          --green-dim: #1a2d1a;
          --blue: #58a6ff;
          --red: #f85149;
          --orange: #f0883e;
          --radius: 8px;
          --radius-lg: 12px;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: var(--text);
          background: var(--bg);
          -webkit-font-smoothing: antialiased;
        }
        button { cursor: pointer; }
        button:disabled { cursor: not-allowed; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, var(--surface2) 25%, var(--border) 50%, var(--surface2) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
          border-radius: var(--radius);
          width: 100%;
        }
      `}</style>
    </div>
  )
}
