import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getBroadcastIncidents, getColorConfig } from '../api/endpoints';
import { INCIDENT_TYPE_LABELS, DEFAULT_COLOR_MAP } from '../types';
import type { BroadcastIncident, ColorMapping } from '../types';
import OfficerMap from './OfficerMap';

const RESPONSE_PHASE_LABELS: Record<string, string> = {
  en_route: 'Officer en route',
  situational_awareness: 'Situational awareness',
  on_scene: 'Officer on scene',
  dps_intervention: 'DPS intervention concluded',
  supervisor_on_scene: 'Supervisor on scene',
  medical_needed: 'Medical response needed',
  situation_stabilized: 'Situation stabilized',
  pending_followup: 'Pending follow-up',
  report_completed: 'Incident report completed',
};

const SCREEN_TITLES: Record<string, string> = {
  main: 'Main Control — BJC Barnes-Jewish Hospital',
  satellite1: 'Satellite Office 1',
  satellite2: 'Satellite Office 2',
  satellite3: 'Satellite Office 3',
  childrens: "Children's ED",
  adulted: 'Adult ED',
};

const REFRESH_INTERVAL = 30000; // 30 seconds

export default function BroadcastPage() {
  const [searchParams] = useSearchParams();
  const screenId = searchParams.get('screen') || 'main';

  const [incidents, setIncidents] = useState<BroadcastIncident[]>([]);
  const [colorConfig, setColorConfig] = useState<ColorMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentShift, setCurrentShift] = useState('');
  const [shiftIcon, setShiftIcon] = useState('');
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);

  // Sort incidents BEFORE any useEffect that references them
  const statusPriority: Record<string, number> = {
    open: 0,
    escalating: 1,
    monitoring: 2,
    resolved: 3,
    archived: 4,
  };
  const displayIncidents = incidents.filter((i) => i.status !== 'archived');
  const sortedIncidents = [...displayIncidents].sort((a, b) => {
    const priorityA = statusPriority[a.status || 'resolved'] ?? 3;
    const priorityB = statusPriority[b.status || 'resolved'] ?? 3;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const activeIncidents = displayIncidents.filter((i) => i.status !== 'resolved');
  const byType: Record<string, number> = {};
  activeIncidents.forEach((i) => {
    byType[i.incident_type] = (byType[i.incident_type] || 0) + 1;
  });

  const getShiftInfo = useCallback(() => {
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    if (hour < 6.5 || hour >= 22.5) return { name: 'Night Shift', icon: '🌙' };
    if (hour < 14.5) return { name: 'Day Shift', icon: '☀️' };
    return { name: 'Evening Shift', icon: '🌇' };
  }, []);

  // Auto-refresh
  const loadBroadcast = useCallback(async () => {
    try {
      setLoading(true);
      const [broadcast, config] = await Promise.all([
        getBroadcastIncidents(24),
        getColorConfig(),
      ]);
      setIncidents(broadcast);
      setColorConfig(config);
      setLastUpdated(new Date());
      setCountdown(REFRESH_INTERVAL / 1000);
    } catch (err) {
      console.error('Failed to load broadcast data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-enter fullscreen on mount (kiosk mode)
  useEffect(() => {
    const enterFullscreen = () => {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch((e) => {
          console.warn('Fullscreen denied:', e);
        });
      }
    };
    enterFullscreen();
    setTimeout(enterFullscreen, 500);
  }, []);

  // Prevent browser navigation keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11' || e.keyCode === 122) {
        e.preventDefault();
        return false;
      }
      if ((e.altKey && (e.key === 'Tab' || e.key === 'F4')) ||
          (e.ctrlKey && e.shiftKey && e.key === 'Q') ||
          e.key === 'Escape') {
        e.preventDefault();
        return false;
      }
      if ((e.ctrlKey && (e.key === 'r' || e.key === 't' || e.key === 'w')) ||
          (e.metaKey && (e.key === 'r' || e.key === 't' || e.key === 'w'))) {
        e.preventDefault();
        return false;
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    let cursorTimeout: ReturnType<typeof setTimeout>;
    const hideCursor = () => {
      document.body.style.cursor = 'none';
      clearTimeout(cursorTimeout);
      cursorTimeout = setTimeout(() => {
        document.body.style.cursor = 'default';
      }, 3000);
    };
    document.addEventListener('mousemove', hideCursor);
    setTimeout(hideCursor, 1000);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('mousemove', hideCursor);
      clearTimeout(cursorTimeout);
    };
  }, []);

  // Shift detection
  useEffect(() => {
    const info = getShiftInfo();
    setCurrentShift(info.name);
    setShiftIcon(info.icon);
  }, [getShiftInfo]);

  useEffect(() => {
    const interval = setInterval(() => {
      const info = getShiftInfo();
      setCurrentShift(info.name);
      setShiftIcon(info.icon);
    }, 60000);
    return () => clearInterval(interval);
  }, [getShiftInfo]);

  // Initial load
  useEffect(() => {
    loadBroadcast();
  }, [loadBroadcast]);

  // Live clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => prev <= 1 ? REFRESH_INTERVAL / 1000 : prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh incidents
  useEffect(() => {
    const interval = setInterval(() => loadBroadcast(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadBroadcast]);

  // Auto-scroll sidebar (pauses on hover)
  useEffect(() => {
    if (!sidebarRef.current || sortedIncidents.length === 0) return;
    const sidebar = sidebarRef.current;
    let animationFrame: number;

    const scroll = () => {
      if (isHovering || !sidebarRef.current) {
        animationFrame = requestAnimationFrame(scroll);
        return;
      }
      sidebar.scrollTop += 0.5;
      if (sidebar.scrollTop >= sidebar.scrollHeight - sidebar.clientHeight - 2) {
        sidebar.scrollTo(0, 0);
      }
      animationFrame = requestAnimationFrame(scroll);
    };

    animationFrame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animationFrame);
  }, [sortedIncidents.length, isHovering]);

  const colorMap: Record<string, string> = {};
  colorConfig.forEach((cm) => { colorMap[cm.incident_type] = cm.color; });

  const screenTitle = SCREEN_TITLES[screenId] || 'Broadcast Screen';
  const openCount = activeIncidents.filter((i) => i.status === 'open').length;

  return (
    <div className="broadcast-page">
      {/* Top Bar */}
      <header className="broadcast-header">
        <div className="header-left">
          <span className="header-icon">📡</span>
          <div>
            <div className="header-title">{screenTitle}</div>
            <div className="header-subtitle">LIVE BROADCAST — NO ACTION REQUIRED</div>
          </div>
        </div>

        <div className="header-right">
          <div className="header-badge">
            <span className="pulse"></span>
            {activeIncidents.length} ACTIVE
          </div>
          <div className="header-shift">
            {shiftIcon} {currentShift}
          </div>
          <div className="header-time">{currentTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
          <div className="refresh-timer">Refresh: {countdown}s</div>
          <div className="last-updated">
            Updated: {lastUpdated.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </header>

      {/* Summary Bar */}
      <div className="summary-bar">
        <div className="summary-item status-open">
          <span className="summary-count">{openCount}</span>
          <span className="summary-label">OPEN</span>
        </div>
        <div className="summary-item status-escalating">
          <span className="summary-count">{incidents.filter(i => i.status === 'escalating').length}</span>
          <span className="summary-label">ESCALATING</span>
        </div>
        <div className="summary-item status-monitoring">
          <span className="summary-count">{incidents.filter(i => i.status === 'monitoring').length}</span>
          <span className="summary-label">MONITORING</span>
        </div>
        <div className="divider"></div>
        {Object.entries(byType).map(([type, count]) => (
          <div key={type} className="summary-item" style={{ ['--type-color' as string]: colorMap[type] || (DEFAULT_COLOR_MAP[type as keyof typeof DEFAULT_COLOR_MAP] as string) || '#666' }}>
            <span className="summary-dot"></span>
            <span className="summary-count">{count}</span>
            <span className="summary-label">{INCIDENT_TYPE_LABELS[type as keyof typeof INCIDENT_TYPE_LABELS] || type}</span>
          </div>
        ))}
      </div>

      {/* Map + Incident Sidebar */}
      <div className="broadcast-content">
        {/* Map — takes most of the screen */}
        <div className="broadcast-map">
          <OfficerMap
            incidents={incidents as any}
            broadcastIncidents={incidents}
            colorConfig={colorConfig}
          />
        </div>

        {/* Incident sidebar — right side, scrollable with auto-scroll */}
        <div
          className="broadcast-sidebar"
          ref={sidebarRef}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {loading ? (
            <div className="loading-state">
              <span className="spinner"></span>
              <span>LOADING DATA...</span>
            </div>
          ) : sortedIncidents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✓</div>
              <span>NO ACTIVE INCIDENTS</span>
              <div className="empty-sub">All clear — system nominal</div>
            </div>
          ) : (
            sortedIncidents.map((incident) => (
              <div
                key={incident.id}
                className={`broadcast-incident-card status-${incident.status} ${incident.status === 'resolved' ? 'incident-resolved' : ''}`}
                style={{ ['--card-color' as string]: colorMap[incident.incident_type] || DEFAULT_COLOR_MAP[incident.incident_type] || '#666' }}
              >
                <div className="card-header">
                  <div className="incident-type">
                    <span className="type-dot"></span>
                    <span className="type-label">
                      {INCIDENT_TYPE_LABELS[incident.incident_type as keyof typeof INCIDENT_TYPE_LABELS] || incident.incident_type}
                    </span>
                  </div>
                  <span className={`status-badge status-${incident.status}`}>{incident.status}</span>
                </div>
                <div className="card-body">
                  <div className="location">📍 {incident.location_ref}</div>
                  {incident.response_phase && (
                    <div className="response-phase">
                      {RESPONSE_PHASE_LABELS[incident.response_phase] || incident.response_phase}
                    </div>
                  )}
                  <div className="timestamp">
                    {new Date(incident.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
