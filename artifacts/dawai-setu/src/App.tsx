import React, { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity, AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Boxes, Building2,
  Check, ChevronDown, ChevronLeft, CircleHelp, Clock3, Crosshair, ExternalLink, FileCheck2,
  Droplets, Filter, HeartPulse, Home, Languages, LogOut, MapPin, MapPinned, Menu, Minus,
  PackageCheck, Phone, Plus, RefreshCw, Search, Send, ShieldCheck, SlidersHorizontal,
  Sparkles, Truck, X, Zap, TrendingUp, TrendingDown, Target, Shield, Layers, GitBranch, Eye,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getGetDashboardQueryKey, getGetDeliveryStatusQueryKey, getListAlertsQueryKey,
  getListBloodBankAvailabilityQueryKey,
  getListFacilitiesQueryKey, getListInventoryQueryKey, getListMedicinesQueryKey,
  getListNearbySuppliersQueryKey, getListNotificationsQueryKey, getListTransferRequestsQueryKey,
  useCreateTransferRequest, useGetDashboard, useGetDeliveryStatus, useListAlerts,
  useListBloodBankAvailability, useListFacilities, useListInventory, useListMedicines, useListNearbySuppliers,
  useListNotifications, useListTransferRequests, useMarkNotificationRead, useUpdateTransferRequest,
  useForecast, useRegionalRisk, useAlertHistory, useUpdateAlertHistory, useReplenishments,
  getForecastQueryKey, getRegionalRiskQueryKey, getAlertHistoryQueryKey, getReplenishmentsQueryKey,
  type ForecastResult, type RegionalRiskResult, type AlertHistoryRecord, type ReplenishmentRecord,
  type Alert, type BloodBankRecord, type Facility, type InventoryRow, type Medicine, type SupplierMatch,
  type TransferRequest,
} from '@workspace/api-client-react';

const queryClient = new QueryClient();
const FACILITY_ID = 1;
const POLL = 15000;

type Tone = 'critical' | 'high' | 'watch' | 'stable';
type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
function formatRelative(value?: string) {
  if (!value) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}
function formatDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}
function deliveryLabel(value?: string) {
  if (value === 'awaiting_dispatch') return 'Swiggy Genie dispatch queued';
  if (value === 'dispatched') return 'Swiggy Genie dispatched';
  return 'Swiggy Genie activates after acceptance';
}
function severityTone(value?: string): Tone {
  return value === 'critical' ? 'critical' : value === 'high' ? 'high' : value === 'watch' ? 'watch' : 'stable';
}
function severityLabel(value?: string) {
  return value === 'critical' ? 'Critical' : value === 'high' ? 'High' : value === 'watch' ? 'Watch' : 'Stable';
}
function formatUnits(value: number) {
  return value.toLocaleString('en-IN');
}
function RiskBadge({ value }: { value?: string }) {
  const tone = severityTone(value);
  return <span className={`risk-badge ${tone}`}><i />{severityLabel(value)}</span>;
}
function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="loading-stack">{Array.from({ length: count }).map((_, index) => <div className="skeleton-row" key={index}><span /><span /><span /></div>)}</div>;
}
function QueryState({ loading, error, empty, children, retry }: { loading?: boolean; error?: boolean; empty?: boolean; children: ReactNode; retry?: () => void }) {
  if (loading) return <LoadingRows />;
  if (error) return <div className="state-card error-state"><AlertTriangle /><strong>Live signal unavailable</strong><span>We could not reach the regional supply service.</span>{retry && <button className="button-secondary" onClick={retry} type="button" data-testid="button-retry-query"><RefreshCw /> Retry</button>}</div>;
  if (empty) return <div className="state-card"><Boxes /><strong>No records to show</strong><span>New signals will appear here as facilities report.</span></div>;
  return <>{children}</>;
}

function SettingsPopover({ compactView, onCompactChange, onRefresh, onClose }: { compactView: boolean; onCompactChange: (value: boolean) => void; onRefresh: () => void; onClose: () => void }) {
  return <div className="sidebar-popover settings-popover" role="dialog" aria-label="Settings"><div className="popover-title"><span>Settings</span><button className="popover-close" type="button" onClick={onClose} aria-label="Close settings"><X /></button></div><div className="settings-row"><span><b>Compact density</b><small>Fit more signals on screen</small></span><button className={`toggle ${compactView ? 'on' : ''}`} type="button" role="switch" aria-checked={compactView} onClick={() => onCompactChange(!compactView)}><span /></button></div><button className="settings-action" type="button" onClick={onRefresh}><RefreshCw /><span><b>Refresh live data</b><small>Request the latest facility and stock signals</small></span></button><div className="settings-foot">Preferences apply to this browser session.</div></div>;
}

function AccountMenu({ language, onLanguageChange, onLogout, onClose, placement }: { language: string; onLanguageChange: (value: string) => void; onLogout: () => void; onClose: () => void; placement: 'top' | 'sidebar' }) {
  return <div className={`account-menu ${placement === 'top' ? 'account-menu-top' : 'account-menu-sidebar'}`} role="menu" aria-label="Manager account menu"><div className="account-menu-head"><div className="avatar">DM</div><div><b>Demo manager</b><small>Facility ID 1 · Udupi</small></div><button className="popover-close" type="button" onClick={onClose} aria-label="Close account menu"><X /></button></div><div className="account-menu-status"><span className="live-pip" /><span>Signed in · Udupi facility</span></div><label className="language-row"><span><Languages /><b>Language</b></span><select value={language} onChange={(event) => onLanguageChange(event.target.value)} aria-label="Language"><option>English</option><option>ಕನ್ನಡ</option><option>हिन्दी</option></select></label><button className="account-menu-item" type="button" onClick={onLogout}><LogOut /><span><b>Log out</b><small>End this manager session</small></span></button></div>;
}

function HelpPopover({ onClose }: { onClose: () => void }) {
  return <div className="sidebar-popover help-popover" role="dialog" aria-label="Help and guidance"><div className="popover-title"><span>Help & guidance</span><button className="popover-close" type="button" onClick={onClose} aria-label="Close help"><X /></button></div><p>Use Shortage watch to review risk, then Redistribute stock to compare nearby surplus and request a transfer.</p><div className="help-tip"><Zap /><span>Accepted transfers move into the Swiggy Genie delivery preview.</span></div></div>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountOrigin, setAccountOrigin] = useState<'top' | 'sidebar'>('top');
  const [compactView, setCompactView] = useState(false);
  const [language, setLanguage] = useState('English');
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const { data: notifications } = useListNotifications({ facilityId: FACILITY_ID, unreadOnly: true }, { query: { refetchInterval: POLL, queryKey: getListNotificationsQueryKey({ facilityId: FACILITY_ID, unreadOnly: true }) } });
  const markRead = useMarkNotificationRead();
  const toggleAccount = (origin: 'top' | 'sidebar') => {
    setAccountOrigin(origin);
    setAccountOpen((open) => !open);
    setSettingsOpen(false);
    setHelpOpen(false);
  };
  const handleRefresh = () => {
    queryClient.invalidateQueries();
    setSettingsOpen(false);
  };
  const handleLogout = () => {
    setAccountOpen(false);
    setSessionMessage('Manager session ended. Sign-in can be connected when authentication is enabled.');
  };
  const nav = [
    { href: '/', label: 'Command center', icon: Home },
    { href: '/shortages', label: 'Shortage watch', icon: AlertTriangle },
    { href: '/risk-analysis', label: 'AI risk analysis', icon: Sparkles },
    { href: '/redistribute', label: 'Redistribute stock', icon: Truck },
    { href: '/facilities', label: 'Facility network', icon: Building2 },
    { href: '/blood-bank', label: 'Blood bank', icon: Droplets },
    { href: '/transfers', label: 'Transfer inbox', icon: ArrowDownLeft },
  ];
  return <div className={`app-shell ${compactView ? 'compact-mode' : ''}`}>
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
       <div className="brand"><div className="brand-mark"><HeartPulse size={17} /></div><div><div className="brand-name">DAWAI SETU</div><div className="brand-sub">HEALTH NETWORK · COASTAL KARNATAKA</div></div><button className="icon-button mobile-menu" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle navigation" type="button" data-testid="button-toggle-navigation"><Menu size={18} /></button></div>
       <div className="facility-context"><span className="live-pip" /><div><b>Current facility · ID 1</b><small>Udupi manager context</small></div></div>
      <div className="nav-label">Operations</div>
      <nav className="nav-list" aria-label="Primary navigation">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon /><span>{label}</span>{label === 'Transfer inbox' && notifications?.length ? <em>{notifications.length}</em> : null}</Link>)}</nav>
      <div className="nav-spacer" />
      <div className="nav-label">System</div>
       <div className="sidebar-control"><button className="nav-link" type="button" onClick={() => { setHelpOpen((open) => !open); setSettingsOpen(false); setAccountOpen(false); }} aria-expanded={helpOpen} data-testid="button-help"><CircleHelp /><span>Help & guidance</span></button>{helpOpen && <HelpPopover onClose={() => setHelpOpen(false)} />}</div>
       <div className="sidebar-control"><button className="nav-link" type="button" onClick={() => { setSettingsOpen((open) => !open); setHelpOpen(false); setAccountOpen(false); }} aria-expanded={settingsOpen} data-testid="button-settings"><SlidersHorizontal /><span>Settings</span></button>{settingsOpen && <SettingsPopover compactView={compactView} onCompactChange={setCompactView} onRefresh={handleRefresh} onClose={() => setSettingsOpen(false)} />}</div>
       <div className="sidebar-foot"><button className="account-trigger" type="button" onClick={() => toggleAccount('sidebar')} aria-expanded={accountOpen && accountOrigin === 'sidebar'} data-testid="button-demo-manager"><div className="avatar">DM</div><div><b>Demo manager</b><small>Facility ID 1 · Udupi</small></div><ShieldCheck size={14} /></button>{accountOpen && accountOrigin === 'sidebar' && <AccountMenu language={language} onLanguageChange={setLanguage} onLogout={handleLogout} onClose={() => setAccountOpen(false)} placement="sidebar" />}</div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="topbar-context"><span className="context-dot" /><div><b>Udupi · Manipal · Mangalore</b><small>Regional supply network · live monitoring</small></div></div>
         <div className="top-actions"><div className="notification-wrap"><button className="icon-button" type="button" aria-label="Open notifications" data-testid="button-notifications"><Bell size={16} />{notifications?.length ? <i className="notification-count">{notifications.length}</i> : null}</button>{notifications?.length ? <div className="notification-popover"><div className="popover-title">Unread activity <Link href="/transfers">View inbox</Link></div>{notifications.slice(0, 3).map((n) => <button key={n.id} className="notification-item" onClick={() => markRead.mutate({ id: n.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey({ facilityId: FACILITY_ID, unreadOnly: true }) }) })} type="button"><span className="notification-dot" /><span><b>{n.title}</b><small>{n.body}</small></span></button>)}</div> : null}</div><div className="account-wrap"><button className="avatar-button" type="button" onClick={() => toggleAccount('top')} aria-label="Open demo manager menu" aria-expanded={accountOpen && accountOrigin === 'top'} data-testid="button-top-account"><div className="avatar">DM</div></button>{accountOpen && accountOrigin === 'top' && <AccountMenu language={language} onLanguageChange={setLanguage} onLogout={handleLogout} onClose={() => setAccountOpen(false)} placement="top" />}</div></div>
      </header>
       {sessionMessage && <div className="session-message" role="status"><ShieldCheck /><span>{sessionMessage}</span><button type="button" onClick={() => setSessionMessage(null)} aria-label="Dismiss session message"><X /></button></div>}
       {children}
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="heading-right">{action}<span className="updated-note"><Clock3 size={13} /> Auto-refresh 15s</span></div></div>;
}
function MapSignal({ facilities, alerts }: { facilities: Facility[]; alerts: Alert[] }) {
  const points = facilities.slice(0, 12);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const latitudes = points.map((f) => f.latitude);
  const longitudes = points.map((f) => f.longitude);
  const maxLat = Math.max(...latitudes, 13.4) + 0.025;
  const minLat = Math.min(...latitudes, 12.75) - 0.025;
  const maxLon = Math.max(...longitudes, 75.2) + 0.025;
  const minLon = Math.min(...longitudes, 74.7) - 0.025;
  const coords = (f: Facility) => ({
    left: ((f.longitude - minLon) / (maxLon - minLon || 1)) * 82 + 9,
    top: 100 - ((f.latitude - minLat) / (maxLat - minLat || 1)) * 76 - 10,
  });
  const riskIds = new Set(alerts.filter((a) => a.severity === 'critical' || a.severity === 'high').map((a) => a.facilityId));
  const surplusIds = new Set(alerts.map((a) => a.recommendedSupplierId).filter((id): id is number => Boolean(id)));
  const selected = points.find((facility) => facility.id === selectedId);
  const statusFor = (facility: Facility) => {
    if (riskIds.has(facility.id)) return { className: 'risk', label: 'Risk area' };
    if (surplusIds.has(facility.id)) return { className: 'surplus', label: 'Surplus available' };
    if (!facility.isActive) return { className: 'attention', label: 'Needs attention' };
    return { className: 'reporting', label: 'Reporting facility' };
  };
  const routeLines = alerts
    .filter((alert) => (alert.severity === 'critical' || alert.severity === 'high') && alert.recommendedSupplierId)
    .map((alert) => {
      const from = points.find((facility) => facility.id === alert.facilityId);
      const to = points.find((facility) => facility.id === alert.recommendedSupplierId);
      if (!from || !to) return null;
      const fromPoint = coords(from);
      const toPoint = coords(to);
      const dx = toPoint.left - fromPoint.left;
      const dy = toPoint.top - fromPoint.top;
      return {
        id: alert.id,
        left: fromPoint.left,
        top: fromPoint.top,
        width: Math.sqrt(dx * dx + dy * dy),
        angle: Math.atan2(dy, dx) * (180 / Math.PI),
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
  const markerPoints = points.map((facility, index) => {
    const exact = coords(facility);
    const conflicts = points
      .slice(0, index)
      .filter((other) => {
        const otherPoint = coords(other);
        return Math.hypot(exact.left - otherPoint.left, exact.top - otherPoint.top) < 5;
      });
    if (!conflicts.length) return { facility, exact, display: exact };
    const angle = ((conflicts.length - 1) * 120 + facility.id * 17) * (Math.PI / 180);
    const radius = 4.5 + Math.min(conflicts.length, 3) * 1.5;
    return {
      facility,
      exact,
      display: {
        left: Math.min(92, Math.max(8, exact.left + Math.cos(angle) * radius)),
        top: Math.min(86, Math.max(12, exact.top + Math.sin(angle) * radius)),
      },
    };
  });

  return <section className="panel map-panel"><div className="panel-head"><div><div className="panel-title">Regional operating map</div><div className="panel-kicker">Select a marker to inspect the exact facility location</div></div><span className="map-live"><i />LIVE</span></div><div className="map-body" aria-label="Operational schematic of regional facilities" style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, transformOrigin: 'center', transition: 'transform 0.2s ease-out' }}><div className="map-toolbar" style={{ transform: `scale(${1/zoom})`, transformOrigin: 'top left' }}><span className="map-chip"><Crosshair /> Coastal Karnataka view <ChevronDown /></span><div className="map-controls"><button aria-label="Zoom out" type="button" onClick={() => setZoom(z => Math.max(1, z - 0.5))}><Minus /></button><button aria-label="Zoom in" type="button" onClick={() => setZoom(z => Math.min(3, z + 0.5))}><Plus /></button><button aria-label="Center map" type="button" onClick={() => { setZoom(1); setPan({x:0, y:0}); }}><Crosshair /></button></div></div><div className="map-coastline" />{routeLines.map((line) => <div key={`line-${line.id}`} className="map-line" style={{ left: `${line.left}%`, top: `${line.top}%`, width: `${line.width}%`, transform: `rotate(${line.angle}deg)` }} />)}{markerPoints.map(({ facility, exact, display }) => { const status = statusFor(facility); const moved = exact.left !== display.left || exact.top !== display.top; const dx = display.left - exact.left; const dy = display.top - exact.top; return <div key={`marker-group-${facility.id}`}>{moved && <div className="marker-leader" style={{ left: `${exact.left}%`, top: `${exact.top}%`, width: `${Math.hypot(dx, dy)}%`, transform: `rotate(${Math.atan2(dy, dx) * (180 / Math.PI)}deg)` }} />}<button className={`marker ${status.className} ${selectedId === facility.id ? 'selected' : ''}`} style={{ left: `${display.left}%`, top: `${display.top}%` }} title={`${facility.name}, ${facility.city}`} aria-label={`Show ${facility.name}, ${facility.city}`} onClick={() => setSelectedId(facility.id)} type="button"><span /></button></div>; })}<div className={`map-focus ${selected ? '' : 'map-focus-empty'}`} aria-live="polite" style={{ transform: `scale(${1/zoom})`, transformOrigin: 'top right' }}>{selected ? <><div className={`map-focus-status ${statusFor(selected).className}`}><i />{statusFor(selected).label}</div><strong>{selected.name}</strong><span><MapPin />{selected.address}</span>{(() => { const alert = alerts.find(a => a.facilityId === selected.id); return alert ? <div className="map-focus-risk" style={{ margin: '4px 0' }}><RiskBadge value={alert.severity} /> <small>{alert.daysOfCover.toFixed(1)} days cover</small></div> : null; })()}<small>{selected.city}, {selected.district} · {selected.type} · {selected.code}</small><small className="map-coordinates">{selected.latitude.toFixed(4)}° N, {selected.longitude.toFixed(4)}° E</small></> : <><MapPin /><span>Select a marker to see the facility</span></>}</div><div className="map-labels" style={{ transform: `scale(${1/zoom})`, transformOrigin: 'bottom left' }}><span><i className="critical-dot" /> Risk area</span><span><i className="surplus-dot" /> Surplus available</span><span><i className="reporting-dot" /> Reporting facility</span><span><i className="watch-dot" /> Needs attention</span></div><div className="map-place place-udupi">UDUPI</div><div className="map-place place-manipal">MANIPAL</div><div className="map-place place-mangalore">MANGALORE</div></div></section>;
}

function buildRiskAnalysis(inventory: InventoryRow[], alerts: Alert[], forecastData?: { forecasts: Map<string, ForecastResult>; regionalRisks: Map<number, RegionalRiskResult> }) {
  const critical = inventory.filter((row) => row.risk === 'critical');
  const high = inventory.filter((row) => row.risk === 'high');
  const expiring = inventory.filter((row) => row.daysToExpiry <= 30);
  const averageCover = inventory.length
    ? inventory.reduce((total, row) => total + Math.min(row.daysOfCover, 60), 0) / inventory.length
    : 0;
  let score = Math.min(99, Math.max(4, Math.round(
    critical.length * 15 +
    high.length * 7 +
    expiring.length * 4 +
    Math.max(0, 18 - averageCover),
  )));
  const forecastInsights: string[] = [];
  let regionalClassification = 'stable';
  if (forecastData) {
    let hiddenRisks = 0;
    for (const row of inventory) {
      if (row.risk === 'stable') {
        const f = forecastData.forecasts.get(`${row.facilityId}-${row.medicineId}`);
        if (f && f.daysToStockout !== null && f.daysToStockout <= 7) {
          hiddenRisks++;
          forecastInsights.push(`${row.medicineName} shows stable stock but demand forecast predicts a stockout in ${f.daysToStockout} days.`);
        }
      }
      const r = forecastData.regionalRisks.get(row.medicineId);
      if (r && r.classification !== 'stable') {
        if (r.classification === 'regional_shortage') regionalClassification = 'regional_shortage';
        else if (regionalClassification === 'stable') regionalClassification = r.classification;
      }
    }
    if (hiddenRisks > 0) score = Math.min(99, score + hiddenRisks * 8);
  }
  const level = score >= 70 ? 'Critical exposure' : score >= 42 ? 'Elevated exposure' : 'Controlled exposure';
  const topRisk = [...inventory].sort((a, b) => a.daysOfCover - b.daysOfCover)[0];
  const actions = [
    critical.length ? `Review ${critical.length} critical stock line${critical.length === 1 ? '' : 's'} before the next count.` : 'No critical stock lines need immediate escalation.',
    expiring.length ? `${expiring.length} line${expiring.length === 1 ? '' : 's'} expire within 30 days; prioritize redistribution.` : 'Expiry horizon is clear for the next 30 days.',
    alerts.length ? `${alerts.length} network alert${alerts.length === 1 ? '' : 's'} have a nearby handoff recommendation.` : 'No network handoff recommendations are active.',
  ];
  return { score, level, topRisk, criticalCount: critical.length, highCount: high.length, expiringCount: expiring.length, averageCover, actions, forecastInsights, regionalClassification };
}

function ForecastMiniRow({ facilityId, medicineId, medicineName }: { facilityId: number, medicineId: number, medicineName: string }) {
  const forecast = useForecast({ facilityId, medicineId }, { query: { queryKey: getForecastQueryKey({ facilityId, medicineId }) } });
  if (!forecast.data) return null;
  return <div className="forecast-mini-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', borderTop: '1px solid var(--border)' }}><span>{medicineName}</span><strong>{forecast.data.daysToStockout ? `${forecast.data.daysToStockout} days` : 'Stable'}</strong><span style={{ color: 'var(--text-muted)' }}>{forecast.data.confidence.level}</span></div>;
}

function RiskAnalysisCard({ inventory, alerts }: { inventory: InventoryRow[]; alerts: Alert[] }) {
  const analysis = buildRiskAnalysis(inventory, alerts);
  const top3 = inventory.filter((row) => row.risk === 'critical' || row.risk === 'high').sort((a, b) => a.daysOfCover - b.daysOfCover).slice(0, 3);
  return <section className="panel ai-card"><div className="panel-head"><div><div className="panel-title"><Sparkles /> AI risk analysis</div><div className="panel-kicker">Explainable analysis from stock cover, expiry, demand, and live handoff signals</div></div><Link href="/risk-analysis" className="button-quiet">Open analysis <ArrowRight /></Link></div><div className="ai-card-body"><div className="ai-score"><div className="ai-score-ring" style={{ '--score': `${analysis.score * 3.6}deg` } as CSSProperties}><strong>{analysis.score}</strong><small>risk index</small></div><div><span className="ai-level">{analysis.level}</span><p>{analysis.topRisk ? `${analysis.topRisk.medicineName} is the most exposed line at ${analysis.topRisk.daysOfCover.toFixed(1)} days of cover.` : 'Waiting for inventory signals to calculate an exposure index.'}</p></div></div><div className="ai-signal-grid"><div><strong>{analysis.criticalCount}</strong><span>critical lines</span></div><div><strong>{analysis.highCount}</strong><span>high-risk lines</span></div><div><strong>{analysis.expiringCount}</strong><span>near expiry</span></div><div><strong>{analysis.averageCover.toFixed(1)}</strong><span>avg days cover</span></div></div>{top3.length > 0 && <div className="forecast-mini-section" style={{ marginTop: '16px' }}><div className="section-label" style={{ marginBottom: '8px' }}>Forecast Projections</div>{top3.map(row => <ForecastMiniRow key={row.id} facilityId={row.facilityId} medicineId={row.medicineId} medicineName={row.medicineName} />)}</div>}</div></section>;
}

function ForecastSummaryRow({ facilityId, medicineId, medicineName }: { facilityId: number, medicineId: number, medicineName: string }) {
  const forecast = useForecast({ facilityId, medicineId }, { query: { queryKey: getForecastQueryKey({ facilityId, medicineId }) } });
  if (!forecast.data) return <div className="forecast-row skeleton-row"><span /><span /></div>;
  return <div className="forecast-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}><b>{medicineName}</b><span>{forecast.data.projectedStockoutDate ? formatDate(forecast.data.projectedStockoutDate) : 'Stable'}</span><RiskBadge value={forecast.data.shortageRisk} /><span style={{ fontSize: '12px' }}>{forecast.data.confidence.percentage}%</span></div>;
}

function RegionalRiskSummaryRow({ medicineId, medicineName }: { medicineId: number, medicineName: string }) {
  const risk = useRegionalRisk({ medicineId }, { query: { queryKey: getRegionalRiskQueryKey({ medicineId }) } });
  if (!risk.data || risk.data.classification === 'stable') return null;
  return <div className="regional-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}><b>{medicineName}</b><span style={{ color: 'var(--indigo-600)' }}><GitBranch size={13} style={{ display: 'inline', marginRight: '4px' }}/> {risk.data.facilitiesAffected} facilities affected</span><span className={`risk-badge ${risk.data.classification === 'regional_shortage' ? 'critical' : 'amber'}`}>{risk.data.classification.replace('_', ' ')}</span></div>;
}

function ForecastSummaryPanel({ riskInventory }: { riskInventory: InventoryRow[] }) {
  return <div className="forecast-overview-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}><section className="panel forecast-summary"><div className="panel-head"><div><div className="panel-title">Forecast Projections</div></div><TrendingDown size={17} /></div><div style={{ padding: '0 16px 16px 16px' }}>{riskInventory.map(row => <ForecastSummaryRow key={row.id} facilityId={row.facilityId} medicineId={row.medicineId} medicineName={row.medicineName} />)}</div></section><section className="panel regional-summary"><div className="panel-head"><div><div className="panel-title">Regional Risk (Butterfly Effect)</div></div><Layers size={17} /></div><div style={{ padding: '0 16px 16px 16px' }}>{riskInventory.map(row => <RegionalRiskSummaryRow key={row.id} medicineId={row.medicineId} medicineName={row.medicineName} />)}</div></section></div>;
}

function OverviewPage() {
  const [deliveryDemoOpen, setDeliveryDemoOpen] = useState(false);
  const dashboard = useGetDashboard({ facilityId: FACILITY_ID }, { query: { refetchInterval: POLL, queryKey: getGetDashboardQueryKey({ facilityId: FACILITY_ID }) } });
  const facilities = useListFacilities(undefined, { query: { refetchInterval: POLL, queryKey: getListFacilitiesQueryKey() } });
  const alerts = useListAlerts({ facilityId: FACILITY_ID }, { query: { refetchInterval: POLL, queryKey: getListAlertsQueryKey({ facilityId: FACILITY_ID }) } });
  const inventory = useListInventory({ facilityId: FACILITY_ID }, { query: { refetchInterval: POLL, queryKey: getListInventoryQueryKey({ facilityId: FACILITY_ID }) } });
  const transfers = useListTransferRequests({ facilityId: FACILITY_ID, role: 'all' }, { query: { refetchInterval: POLL, queryKey: getListTransferRequestsQueryKey({ facilityId: FACILITY_ID, role: 'all' }) } });
   const delivery = useGetDeliveryStatus({ query: { queryKey: getGetDeliveryStatusQueryKey(), refetchInterval: POLL } });
  const d = dashboard.data;
  const summary = d?.summary;
   const acceptedTransfer = (transfers.data ?? []).find((transfer) => transfer.status === 'accepted' && transfer.deliveryStatus === 'awaiting_dispatch');
   const deliveryTitle = delivery.data?.status === 'ready'
     ? 'Swiggy Genie ready'
     : acceptedTransfer
       ? 'Swiggy Genie dispatch queued'
       : 'Swiggy Genie activates after acceptance';
   const deliveryMessage = acceptedTransfer
     ? `Supplier accepted ${acceptedTransfer.quantity.toLocaleString()} units of ${acceptedTransfer.medicineName}. Swiggy Genie handoff is queued for this transfer.`
     : delivery.data?.message ?? 'When a supplier accepts, this transfer moves into the Swiggy Genie handoff queue.';
  const riskInventory = (inventory.data ?? []).filter((row) => row.risk === 'critical' || row.risk === 'high').sort((a, b) => a.daysOfCover - b.daysOfCover).slice(0, 5);
   return <main className="main-content"><PageHeading eyebrow="Regional command center" title="Move before care is interrupted." description="Live stock risk and transfer opportunities across your connected network." action={<Link href="/redistribute" className="button-primary" data-testid="link-quick-redistribute"><Truck /> Find surplus stock</Link>} />
    <QueryState loading={dashboard.isLoading} error={dashboard.isError} retry={() => dashboard.refetch()}><div className="metric-grid"><div className="panel metric"><div className="metric-label"><AlertTriangle /> Critical alerts</div><strong>{String(summary?.criticalAlerts ?? 0).padStart(2, '0')}</strong><small>Needs action now</small></div><div className="panel metric"><div className="metric-label"><Activity /> Watch alerts</div><strong>{String(summary?.watchAlerts ?? 0).padStart(2, '0')}</strong><small>Monitor within 24 hours</small></div><div className="panel metric"><div className="metric-label"><PackageCheck /> Inventory lines</div><strong>{summary?.inventoryLines ?? 0}</strong><small>Reporting from facility ID 1</small></div><div className="panel metric"><div className="metric-label"><Truck /> Pending transfers</div><strong>{summary?.pendingTransfers ?? 0}</strong><small>{transfers.data?.filter((t) => t.requesterFacilityId === FACILITY_ID).length ?? 0} outgoing requests</small></div></div>
       <div className="overview-grid"><MapSignal facilities={facilities.data ?? []} alerts={alerts.data ?? []} /><section className="panel risk-panel"><div className="panel-head"><div><div className="panel-title">Critical medicine pressure</div><div className="panel-kicker">Lowest days of cover at current facility</div></div><Link href="/shortages" className="button-quiet">All alerts <ArrowRight /></Link></div><QueryState loading={inventory.isLoading} error={inventory.isError} empty={!riskInventory.length}>{riskInventory.map((row) => <div className="risk-item" key={row.id}><div className={`risk-icon ${severityTone(row.risk)}`}><AlertTriangle /></div><div><b>{row.medicineName}</b><small>{row.strength} · {row.availableQuantity.toLocaleString()} available</small></div><div className="risk-score"><strong>{row.daysOfCover.toFixed(1)}</strong><small>days cover</small></div></div>)}</QueryState></section></div>
       <RiskAnalysisCard inventory={inventory.data ?? []} alerts={alerts.data ?? []} />
       <ForecastSummaryPanel riskInventory={riskInventory} />
       <div className="bottom-grid"><section className="panel action-panel"><div className="panel-head"><div><div className="panel-title">Recommended next actions</div><div className="panel-kicker">Prioritized from live alerts and supplier matching</div></div><span className="section-label">{summary?.criticalAlerts ?? 0} critical</span></div>{(d?.alerts ?? []).slice(0, 3).map((alert) => <div className="action-row" key={alert.id}><div className={`action-bar ${alert.severity === 'critical' ? 'red' : 'amber'}`} /><div><b>{alert.title}</b><p>{alert.detail} · {alert.daysOfCover.toFixed(1)} days of cover</p></div><Link href="/redistribute" className="button-secondary">Find stock <ArrowRight /></Link></div>)}{!d?.alerts?.length && <div className="empty-inline">No immediate action signals from the API.</div>}</section><section className="panel delivery-panel"><div className="panel-head"><div><div className="panel-title">Delivery readiness</div><div className="panel-kicker">Swiggy Genie handoff after supplier acceptance</div></div><Truck size={17} /></div><div className={`delivery-status ${delivery.data?.status === 'ready' ? 'ready' : acceptedTransfer ? 'planned' : 'not-ready'}`}><span className="delivery-icon"><Truck /></span><div><b>{deliveryTitle}</b><small>{deliveryMessage}</small></div></div><div className="transfer-mini">{(transfers.data ?? []).slice(0, 3).map((t) => <div key={t.id}><span className="transfer-direction">{t.requesterFacilityId === FACILITY_ID ? <ArrowUpRight /> : <ArrowDownLeft />}</span><div><b>{t.medicineName}</b><small>{t.quantity.toLocaleString()} units · {deliveryLabel(t.deliveryStatus)}</small></div><span className={`status-text ${t.status}`}>{t.status}</span></div>)}</div><button className="button-secondary full-width" type="button" onClick={() => setDeliveryDemoOpen(true)} data-testid="button-preview-delivery"><Truck /> {acceptedTransfer ? 'Track Swiggy Genie demo' : 'Preview Swiggy Genie journey'}</button><Link href="/transfers" className="button-quiet full-width">Open transfer activity <ArrowRight /></Link></section></div>
     </QueryState>
     {deliveryDemoOpen && <DeliveryDemoModal transfer={acceptedTransfer ?? transfers.data?.[0]} onClose={() => setDeliveryDemoOpen(false)} />}
  </main>;
}

function ShortageRow({ alert }: { alert: Alert }) {
  const forecast = useForecast({ facilityId: alert.facilityId, medicineId: alert.medicineId }, { query: { queryKey: getForecastQueryKey({ facilityId: alert.facilityId, medicineId: alert.medicineId }) } });
  return <tr key={alert.id}><td className="medicine-cell"><b>{alert.medicineName}</b><small>{alert.facilityName} · {alert.title}</small></td><td><RiskBadge value={alert.severity} /></td><td><strong className={alert.daysOfCover < 4 ? 'text-critical' : ''}>{alert.daysOfCover.toFixed(1)}</strong><small> days</small></td><td><span className="countdown"><Clock3 /> {alert.daysOfCover <= 1 ? 'Today' : `${Math.ceil(alert.daysOfCover)} days`}</span></td><td>{forecast.data?.projectedStockoutDate ? formatDate(forecast.data.projectedStockoutDate) : '—'}</td><td><span className={`confidence ${alert.confidence}`}>{alert.confidence} confidence</span></td><td>{forecast.data?.replenishmentImpact ? <span style={{ color: 'var(--indigo-600)' }}><Truck size={13} style={{ display: 'inline' }} /> Arriving {formatDate(forecast.data.replenishmentImpact.arrivalDate)}</span> : '—'}</td><td><span className="recommendation">{alert.recommendedSupplierName ?? 'No supplier match'}{alert.recommendedQuantity ? <small>{alert.recommendedQuantity.toLocaleString()} units suggested</small> : null}</span></td><td><Link href="/redistribute" className="button-quiet">Find stock <ArrowRight /></Link></td></tr>;
}

function ShortagesPage() {
  const [severity, setSeverity] = useState('all');
  const [search, setSearch] = useState('');
  const alerts = useListAlerts({ facilityId: FACILITY_ID, severity: severity as 'all' | 'critical' | 'high' | 'watch' }, { query: { refetchInterval: POLL, queryKey: getListAlertsQueryKey({ facilityId: FACILITY_ID, severity: severity as 'all' | 'critical' | 'high' | 'watch' }) } });
  const filtered = (alerts.data ?? []).filter((a) => `${a.medicineName} ${a.facilityName} ${a.title}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="main-content"><PageHeading eyebrow="Signal intelligence" title="Shortage watchlist" description="Ranked by urgency, cover, confidence, and the nearest viable handoff." action={<button className="button-secondary" type="button" data-testid="button-export-shortages"><FileCheck2 /> Export brief</button>} /><div className="watch-toolbar"><div className="filter-group">{['all', 'critical', 'high', 'watch'].map((value) => <button key={value} type="button" className={`filter-button ${severity === value ? 'active' : ''}`} onClick={() => setSeverity(value)} data-testid={`button-filter-${value}`}>{value === 'all' ? 'All signals' : severityLabel(value)}</button>)}</div><div className="watch-search"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicines or facilities" aria-label="Search shortage watchlist" data-testid="input-shortage-search" /><Filter size={13} /></div></div><section className="panel"><div className="panel-head"><div><div className="panel-title">{filtered.length} live risk signals</div><div className="panel-kicker">Data confidence is calculated from stock, demand, and proximity</div></div><span className="live-tag"><i />LIVE DATA</span></div><QueryState loading={alerts.isLoading} error={alerts.isError} empty={!filtered.length} retry={() => alerts.refetch()}><div className="table-wrap"><table className="data-table"><thead><tr><th>Risk signal</th><th>Severity</th><th>Cover</th><th>Stockout timing</th><th>Forecast</th><th>Confidence</th><th>Replenishment</th><th>Suggested handoff</th><th /></tr></thead><tbody>{filtered.map((alert) => <ShortageRow key={alert.id} alert={alert} />)}</tbody></table></div></QueryState></section><div className="info-strip"><Zap /><span><b>How to read it:</b> Critical means stockout risk is imminent. High and watch signals need validation against a live supplier before the next count.</span></div></main>;
}

function RequestModal({ medicine, supplier, onClose, onConfirm, pending }: { medicine: Medicine; supplier: SupplierMatch; onClose: () => void; onConfirm: (quantity: number, note: string) => void; pending: boolean }) {
  const [quantity, setQuantity] = useState(Math.max(1, Math.min(supplier.surplusQuantity, 200)));
  const [note, setNote] = useState('');
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="request-title"><div className="modal-head"><div><div className="eyebrow">Traceable transfer</div><h2 id="request-title">Request medicine</h2><p>Send a request to {supplier.facility.name} in {supplier.facility.city}</p></div><button className="icon-button" onClick={onClose} aria-label="Close request dialog" type="button" data-testid="button-close-request"><X /></button></div><div className="modal-body"><div className="request-box"><b>{medicine.genericName} {medicine.strength}</b><span>{supplier.surplusQuantity.toLocaleString()} surplus units · {supplier.distanceKm.toFixed(1)} km · expires {formatDate(supplier.nearestExpiryDate)}</span></div><label className="field-label" htmlFor="request-quantity">Quantity to request</label><div className="quantity-controls"><button type="button" onClick={() => setQuantity((v) => Math.max(1, v - 25))} aria-label="Decrease quantity" data-testid="button-decrease-quantity"><Minus /></button><input id="request-quantity" type="number" min="1" max={supplier.surplusQuantity} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(supplier.surplusQuantity, Number(e.target.value) || 1)))} data-testid="input-request-quantity" /><button type="button" onClick={() => setQuantity((v) => Math.min(supplier.surplusQuantity, v + 25))} aria-label="Increase quantity" data-testid="button-increase-quantity"><Plus /></button></div><label className="field-label" htmlFor="request-note">Note for supplier <span>optional</span></label><textarea id="request-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a handoff note for the sending facility" data-testid="input-request-note" /></div><div className="modal-foot"><button className="button-secondary" onClick={onClose} type="button" data-testid="button-cancel-request">Cancel</button><button className="button-primary" onClick={() => onConfirm(quantity, note)} disabled={pending} type="button" data-testid="button-confirm-request"><Send /> {pending ? 'Sending…' : 'Confirm request'}</button></div></section></div>;
}

const deliveryDemoStages = [
  { title: 'Order accepted', short: 'Accepted', detail: 'The supplier accepted the transfer request and a delivery order was created.', eta: 'Order created' },
  { title: 'Pickup assigned', short: 'Assigned', detail: 'A Swiggy Genie delivery partner is being assigned near the source facility.', eta: 'Pickup in 10 min' },
  { title: 'Picked up from supplier', short: 'Picked up', detail: 'The partner collected the sealed medicine package from the supplier.', eta: 'On the way' },
  { title: 'In transit to facility', short: 'In transit', detail: 'The medicine is moving to the receiving hospital with live delivery updates.', eta: 'Arriving in 18 min' },
  { title: 'Delivered to facility', short: 'Delivered', detail: 'The receiving facility confirmed the medicine handoff and delivery is complete.', eta: 'Delivered now' },
];

function DeliveryDemoModal({ transfer, onClose }: { transfer?: TransferRequest; onClose: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => Math.min(deliveryDemoStages.length - 1, current + 1)), 3000);
    return () => window.clearInterval(timer);
  }, []);
  const stage = deliveryDemoStages[step];
  const source = transfer?.supplierFacilityName ?? 'Coastal Med Distributors';
  const destination = transfer?.requesterFacilityName ?? 'Kasturba Medical Centre';
  const medicine = transfer?.medicineName ?? 'Emergency medicine pack';
  const quantity = transfer?.quantity ?? 40;
  const progress = `${(step / (deliveryDemoStages.length - 1)) * 100}%`;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="delivery-demo-modal" role="dialog" aria-modal="true" aria-labelledby="delivery-demo-title"><div className="delivery-demo-head"><div><div className="eyebrow">Swiggy Genie delivery preview</div><h2 id="delivery-demo-title">{stage.title}</h2><p>{stage.detail}</p></div><div className="delivery-demo-badge"><Activity /> SIMULATED</div><button className="icon-button" onClick={onClose} aria-label="Close delivery preview" type="button" data-testid="button-close-delivery-demo"><X /></button></div><div className="delivery-demo-route"><div className="route-topline"><span><i className="route-live-dot" />Live journey preview</span><b>{stage.eta}</b></div><div className="route-map"><div className="route-grid" /><div className="route-place source"><span className="route-pin supplier"><PackageCheck /></span><small>PICKUP</small><b>{source}</b></div><div className="route-connector"><span style={{ width: progress }} /></div><div className="route-vehicle" style={{ left: `calc(${progress} - 13px)` }}><Truck /></div><div className="route-place destination"><span className="route-pin destination-pin"><MapPin /></span><small>DROP-OFF</small><b>{destination}</b></div></div></div><div className="delivery-demo-content"><div className="delivery-timeline">{deliveryDemoStages.map((item, index) => <div className={`delivery-step ${index < step ? 'complete' : ''} ${index === step ? 'current' : ''}`} key={item.short}><div className="delivery-step-marker">{index < step ? <Check /> : index + 1}</div><div><b>{item.short}</b><small>{item.title}</small></div></div>)}</div><div className="delivery-order-card"><div className="section-label">Order details</div><div className="delivery-order-medicine"><div className="delivery-order-icon"><Boxes /></div><div><b>{medicine}</b><span>{quantity.toLocaleString()} units · transfer #{transfer?.id ?? 'DEMO-01'}</span></div></div><div className="delivery-order-grid"><div><small>Pickup</small><b>{source}</b></div><div><small>Drop-off</small><b>{destination}</b></div><div><small>Delivery partner</small><b>Swiggy Genie</b></div><div><small>Handoff state</small><b>{stage.short}</b></div></div></div></div><div className="delivery-demo-foot"><span><Zap />This is a simulated preview. Real partner tracking appears after provider access is connected.</span><div><button className="button-secondary" type="button" onClick={() => setStep(0)} data-testid="button-replay-delivery-demo">Replay journey</button><button className="button-primary" type="button" onClick={onClose} data-testid="button-done-delivery-demo">Done</button></div></div></section></div>;
}

function RedistributePage() {
  const [medicineQuery, setMedicineQuery] = useState('');
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierMatch | null>(null);
  const [sent, setSent] = useState<TransferRequest | null>(null);
  const medicines = useListMedicines({ query: medicineQuery || undefined, limit: 30 }, { query: { refetchInterval: POLL, queryKey: getListMedicinesQueryKey({ query: medicineQuery || undefined, limit: 30 }) } });
  const supplierParams = { facilityId: FACILITY_ID, medicineId: selectedMedicine?.id ?? 0, quantity: 1 };
  const suppliers = useListNearbySuppliers(supplierParams, { query: { enabled: !!selectedMedicine, refetchInterval: POLL, queryKey: getListNearbySuppliersQueryKey(supplierParams) } });
  const create = useCreateTransferRequest();
  const queryClient = useQueryClient();
  const visibleSuppliers = (suppliers.data ?? []).filter((s) => `${s.facility.name} ${s.facility.city} ${s.facility.type}`.toLowerCase().includes(supplierQuery.toLowerCase()));
   return <main className="main-content"><PageHeading eyebrow="Coordinated response" title="Redistribute with confidence." description="Search the medicine catalog, compare nearby usable surplus, and create a traceable transfer request." /><div className="redistribute-layout"><div><section className="panel search-hero"><div className="eyebrow">01 · Select a medicine</div><h2>Which gap are you solving?</h2><p>Search the live catalog by generic name, brand, strength, or form.</p><div className="medicine-search"><Search size={16} /><input value={selectedMedicine ? `${selectedMedicine.genericName} · ${selectedMedicine.strength}` : medicineQuery} onChange={(e) => { setMedicineQuery(e.target.value); setSelectedMedicine(null); }} onFocus={() => selectedMedicine && setMedicineQuery('')} placeholder="Search medicine or generic name" aria-label="Search medicine to redistribute" data-testid="input-medicine-search" /></div>{!selectedMedicine && medicineQuery && <div className="suggestions">{medicines.isLoading ? <LoadingRows count={3} /> : (medicines.data ?? []).map((m) => <button type="button" className="suggestion" key={m.id} onMouseDown={() => { setSelectedMedicine(m); setMedicineQuery(''); }} data-testid={`button-select-medicine-${m.id}`}><span><b>{m.genericName}</b><small>{m.brandName} · {m.strength} · {m.form}</small></span><ExternalLink size={13} /></button>)}</div>}</section><section className="panel supplier-panel"><div className="panel-head"><div><div className="eyebrow">02 · Compare supply</div><div className="panel-title">{selectedMedicine ? `Nearby ${selectedMedicine.genericName} supply` : 'Select a medicine first'}</div><div className="panel-kicker">Ranked by surplus, distance, expiry, and match score</div></div>{selectedMedicine && <div className="watch-search compact"><Search size={13} /><input value={supplierQuery} onChange={(e) => setSupplierQuery(e.target.value)} placeholder="Search network" aria-label="Search nearby suppliers" data-testid="input-supplier-search" /></div>}</div><QueryState loading={!!selectedMedicine && suppliers.isLoading} error={!!selectedMedicine && suppliers.isError} empty={!!selectedMedicine && !visibleSuppliers.length} retry={() => suppliers.refetch()}>{selectedMedicine ? <div className="supplier-grid">{visibleSuppliers.map((supplier) => <article className="supplier-card" key={supplier.facility.id}><div className="supplier-top"><div><b>{supplier.facility.name}</b><small>{supplier.facility.city} · {supplier.facility.type}</small></div><span className={`recommendation-badge ${supplier.recommendation}`}>{supplier.recommendation}</span></div><div className="supplier-numbers"><div><strong>{supplier.surplusQuantity.toLocaleString()}</strong><small>surplus units</small></div><div><strong>{supplier.distanceKm.toFixed(1)}<small> km</small></strong><small>{supplier.estimatedMinutes} min estimated</small></div></div><div className="supplier-meta"><span><Clock3 /> Expires {formatDate(supplier.nearestExpiryDate)}</span><span>Match {Math.round(supplier.matchScore)}%</span></div><button className="button-primary full-width" type="button" onClick={() => setSelectedSupplier(supplier)} data-testid={`button-request-supplier-${supplier.facility.id}`}><Send /> Request {selectedMedicine.unit}</button></article>)}</div> : <div className="select-hint"><Search /><b>Start with a medicine search</b><span>Supplier matching uses the current facility ID 1 as the receiving context.</span></div>}</QueryState></section>{sent && <div className="request-status" role="status" data-testid="status-request-success"><Check /><div><b>Transfer request #{sent.id} created</b><span>{sent.quantity.toLocaleString()} units of {sent.medicineName} requested from {sent.supplierFacilityName}.</span></div><button className="button-quiet" onClick={() => setSent(null)} aria-label="Dismiss success" type="button" data-testid="button-dismiss-success"><X /></button></div>}</div><aside className="panel side-summary"><div className="section-label">Receiving context</div><div className="context-card"><div className="context-icon"><Building2 /></div><div><b>Current facility ID 1</b><span>Current manager context</span></div></div>{selectedMedicine ? <><div className="selected-med"><Boxes /><div><b>{selectedMedicine.genericName}</b><span>{selectedMedicine.strength} · {selectedMedicine.form}</span></div></div><div className="summary-list"><div><span>Reorder threshold</span><b>{selectedMedicine.reorderLevel.toLocaleString()} {selectedMedicine.unit}</b></div><div><span>Category</span><b>{selectedMedicine.category}</b></div><div><span>Network matches</span><b>{suppliers.data?.length ?? '—'}</b></div></div></> : <div className="empty-side">Your selected medicine risk and supply recommendations will appear here.</div>}<div className="side-note"><Zap /><span>Every request is logged. The supplier can accept or reject it from their transfer inbox.</span></div><Link href="/shortages" className="button-secondary full-width"><ChevronLeft /> Back to shortage watch</Link></aside></div>{selectedSupplier && selectedMedicine && <RequestModal medicine={selectedMedicine} supplier={selectedSupplier} pending={create.isPending} onClose={() => setSelectedSupplier(null)} onConfirm={(quantity, note) => create.mutate({ data: { requesterFacilityId: FACILITY_ID, supplierFacilityId: selectedSupplier.facility.id, medicineId: selectedMedicine.id, quantity, note: note || undefined } }, { onSuccess: (request) => { setSent(request); setSelectedSupplier(null); queryClient.invalidateQueries({ queryKey: getListTransferRequestsQueryKey({ facilityId: FACILITY_ID, role: 'all' }) }); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey({ facilityId: FACILITY_ID }) }); } })} />}</main>;
}

function FacilitiesPage() {
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('all');
  const [type, setType] = useState('all');
  const facilities = useListFacilities({ query: query || undefined, city: city === 'all' ? undefined : city, type: type === 'all' ? undefined : type as 'hospital' | 'clinic' | 'pharmacy' | 'distributor' }, { query: { refetchInterval: POLL, queryKey: getListFacilitiesQueryKey({ query: query || undefined, city: city === 'all' ? undefined : city, type: type === 'all' ? undefined : type as 'hospital' | 'clinic' | 'pharmacy' | 'distributor' }) } });
  const rows = facilities.data ?? [];
  const counts = { active: rows.filter((f) => f.isActive).length, inactive: rows.filter((f) => !f.isActive).length };
  return <main className="main-content"><PageHeading eyebrow="Network readiness" title="Facility network" description="Know who is connected, where they are, and which partners can keep supply moving." /><div className="facility-status-grid"><div className="panel status-mini"><span><i className="status-indicator green" /> Reporting</span><strong>{counts.active}</strong><small>active facilities</small></div><div className="panel status-mini"><span><i className="status-indicator amber" /> Offline</span><strong>{counts.inactive}</strong><small>needs a check-in</small></div><div className="panel status-mini"><span><MapPin /> Coverage</span><strong>3</strong><small>connected cities</small></div><div className="panel status-mini"><span><Activity /> Context</span><strong>ID 1</strong><small>current facility</small></div></div><section className="panel"><div className="panel-head"><div><div className="panel-title">Connected facilities</div><div className="panel-kicker">Hospitals, clinics, pharmacies, and distributors across the coastal network</div></div><div className="filters"><div className="watch-search compact"><Search size={13} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search network" aria-label="Search facility network" data-testid="input-network-search" /></div><select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Filter by city" data-testid="select-facility-city"><option value="all">All cities</option><option value="Udupi">Udupi</option><option value="Manipal">Manipal</option><option value="Mangalore">Mangalore</option></select><select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by facility type" data-testid="select-facility-type"><option value="all">All types</option><option value="hospital">Hospitals</option><option value="clinic">Clinics</option><option value="pharmacy">Pharmacies</option><option value="distributor">Distributors</option></select></div></div><QueryState loading={facilities.isLoading} error={facilities.isError} empty={!rows.length} retry={() => facilities.refetch()}><div className="table-wrap"><table className="data-table"><thead><tr><th>Facility</th><th>Type</th><th>City</th><th>Contact</th><th>Last sync</th><th>Status</th></tr></thead><tbody>{rows.map((facility) => <tr key={facility.id} data-testid={`row-facility-${facility.id}`}><td className="medicine-cell"><b>{facility.name}</b><small>{facility.code} · {facility.address}</small></td><td><span className="type-pill">{facility.type}</span></td><td>{facility.city}<small className="table-sub">{facility.district}</small></td><td><b>{facility.contactName}</b><small className="table-sub">{facility.contactPhone}</small></td><td>{formatRelative(facility.lastSyncAt)}</td><td><span className={`status-badge ${facility.isActive ? 'active' : 'inactive'}`}><i />{facility.isActive ? 'Reporting' : 'Offline'}</span></td></tr>)}</tbody></table></div></QueryState></section></main>;
}

function ForecastIntelRow({ facilityId, medicineId, medicineName, currentStock }: { facilityId: number, medicineId: number, medicineName: string, currentStock: number }) {
  const forecast = useForecast({ facilityId, medicineId }, { query: { queryKey: getForecastQueryKey({ facilityId, medicineId }) } });
  if (!forecast.data) return null;
  const { projectedStockoutDate, replenishmentImpact, confidence } = forecast.data;
  return <div className="forecast-intel-row" style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><strong>{medicineName}</strong><span>{projectedStockoutDate ? `Stockout ${formatDate(projectedStockoutDate)}` : 'Stable'}</span></div><div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>Current stock: {formatUnits(currentStock)} units</div>{replenishmentImpact && <div style={{ fontSize: '13px', color: 'var(--indigo-600)', marginBottom: '8px' }}><Truck size={13} style={{ display: 'inline' }} /> Incoming: {formatUnits(replenishmentImpact.quantity)} arriving {formatDate(replenishmentImpact.arrivalDate)} ({replenishmentImpact.arrivesBeforeStockout ? 'Saves stockout' : 'Too late'})</div>}<div style={{ fontSize: '12px', background: 'var(--surface-sunken)', padding: '8px', borderRadius: '4px' }}><b>{confidence.percentage}% Confidence</b><ul style={{ paddingLeft: '20px', margin: '4px 0 0 0' }}>{confidence.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></div></div>;
}

function RegionalIntelRow({ medicineId, medicineName }: { medicineId: number, medicineName: string }) {
  const risk = useRegionalRisk({ medicineId }, { query: { queryKey: getRegionalRiskQueryKey({ medicineId }) } });
  if (!risk.data || risk.data.classification === 'stable' || !risk.data.propagationChain.length) return null;
  return <div className="regional-intel-row" style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}><strong>{medicineName}</strong><span className={`risk-badge ${risk.data.classification === 'regional_shortage' ? 'critical' : 'amber'}`}>{risk.data.classification.replace('_', ' ')}</span></div><div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>{risk.data.propagationChain.map((p, i) => (<React.Fragment key={p.facilityId}><div style={{ padding: '6px 12px', background: 'var(--surface-sunken)', borderRadius: '100px', fontSize: '12px', border: '1px solid var(--indigo-100)' }}><b>{p.facilityName}</b> <span style={{ color: 'var(--text-muted)' }}>({p.risk}, {p.daysToStockout ? `${p.daysToStockout}d` : '-'})</span></div>{i < risk.data.propagationChain.length - 1 && <ArrowRight size={14} style={{ color: 'var(--indigo-300)' }} />}</React.Fragment>))}</div></div>;
}

function AlertHistoryTimeline({ facilityId }: { facilityId: number }) {
  const history = useAlertHistory({ facilityId, limit: 10 }, { query: { queryKey: getAlertHistoryQueryKey({ facilityId, limit: 10 }) } });
  const updateAlert = useUpdateAlertHistory();
  const queryClient = useQueryClient();
  const handleUpdate = (id: number, status: 'acknowledged' | 'resolved') => {
    updateAlert.mutate({ id, data: { status } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getAlertHistoryQueryKey({ facilityId, limit: 10 }) }) });
  };
  if (!history.data) return <LoadingRows count={3} />;
  return <div className="alert-history-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>{history.data.map(record => (<div key={record.id} style={{ display: 'flex', gap: '16px', borderLeft: '2px solid var(--border)', paddingLeft: '16px', position: 'relative' }}><div style={{ position: 'absolute', left: '-5px', top: '0', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }} /><div style={{ flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><RiskBadge value={record.severity} /><span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatRelative(record.createdAt)}</span></div><b style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>{record.title}</b><p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>{record.detail}</p><div style={{ display: 'flex', gap: '8px' }}>{record.status === 'active' && <button className="button-secondary" type="button" onClick={() => handleUpdate(record.id, 'acknowledged')} style={{ padding: '2px 8px', fontSize: '12px' }}>Acknowledge</button>}{record.status === 'acknowledged' && <button className="button-secondary" type="button" onClick={() => handleUpdate(record.id, 'resolved')} style={{ padding: '2px 8px', fontSize: '12px' }}>Resolve</button>}{record.status === 'resolved' && <span style={{ fontSize: '12px', color: 'var(--green-600)' }}><Check size={12} style={{ display: 'inline' }} /> Resolved {record.resolvedAt ? formatDate(record.resolvedAt) : ''}</span>}</div></div></div>))}</div>;
}

function RiskAnalysisPage() {
  const inventory = useListInventory({ facilityId: FACILITY_ID }, { query: { refetchInterval: POLL, queryKey: getListInventoryQueryKey({ facilityId: FACILITY_ID }) } });
  const alerts = useListAlerts({ facilityId: FACILITY_ID }, { query: { refetchInterval: POLL, queryKey: getListAlertsQueryKey({ facilityId: FACILITY_ID }) } });
  const analysis = buildRiskAnalysis(inventory.data ?? [], alerts.data ?? []);
  const riskRows = [...(inventory.data ?? [])].sort((a, b) => a.daysOfCover - b.daysOfCover).slice(0, 8);
  return <main className="main-content"><PageHeading eyebrow="Decision support" title="AI risk analysis" description="A transparent exposure score that turns current stock, demand, expiry, and network signals into next actions." action={<button className="button-secondary" type="button" onClick={() => { void inventory.refetch(); void alerts.refetch(); }}><RefreshCw /> Refresh analysis</button>} /><QueryState loading={inventory.isLoading || alerts.isLoading} error={inventory.isError || alerts.isError} retry={() => { void inventory.refetch(); void alerts.refetch(); }}><div className="analysis-hero panel"><div className="analysis-score"><div className="ai-score-ring large" style={{ '--score': `${analysis.score * 3.6}deg` } as CSSProperties}><strong>{analysis.score}</strong><small>risk index</small></div><div><div className="eyebrow">Current facility exposure</div><h2>{analysis.level}</h2><p>Analysis is recalculated from live inventory and shortage signals. It is designed to support manager review, not replace clinical judgement.</p></div></div><div className="ai-signal-grid large"><div><strong>{analysis.criticalCount}</strong><span>critical lines</span></div><div><strong>{analysis.highCount}</strong><span>high-risk lines</span></div><div><strong>{analysis.expiringCount}</strong><span>within 30-day expiry</span></div><div><strong>{analysis.averageCover.toFixed(1)}</strong><span>average days cover</span></div></div></div><div className="analysis-grid"><section className="panel"><div className="panel-head"><div><div className="panel-title">Recommended next actions</div><div className="panel-kicker">Generated from the current evidence set</div></div><Sparkles size={17} /></div><div className="analysis-actions">{analysis.actions.map((action, index) => <div className="analysis-action" key={action}><span>{String(index + 1).padStart(2, '0')}</span><p>{action}</p></div>)}</div></section><section className="panel"><div className="panel-head"><div><div className="panel-title">Why the score moved</div><div className="panel-kicker">Highest exposure signals right now</div></div><Activity size={17} /></div><div className="analysis-evidence"><div><span>Most exposed line</span><strong>{analysis.topRisk ? analysis.topRisk.medicineName : 'No data'}</strong><small>{analysis.topRisk ? `${analysis.topRisk.daysOfCover.toFixed(1)} days cover · ${formatUnits(analysis.topRisk.availableQuantity)} available` : 'Inventory data is loading.'}</small></div><div><span>Network alerts</span><strong>{alerts.data?.length ?? 0}</strong><small>Shortage signals across connected facilities</small></div></div></section></div><section className="panel analysis-table-panel"><div className="panel-head"><div><div className="panel-title">Priority inventory lines</div><div className="panel-kicker">Sorted by days of cover so the most exposed lines appear first</div></div><Link href="/shortages" className="button-quiet">Open shortage watch <ArrowRight /></Link></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Medicine</th><th>Risk</th><th>Available</th><th>Days cover</th><th>Expiry horizon</th><th>Daily use</th></tr></thead><tbody>{riskRows.map((row) => <tr key={row.id}><td className="medicine-cell"><b>{row.medicineName}</b><small>{row.strength} · {row.form}</small></td><td><RiskBadge value={row.risk} /></td><td>{formatUnits(row.availableQuantity)} {row.unit}</td><td><strong className={row.daysOfCover < 4 ? 'text-critical' : ''}>{row.daysOfCover.toFixed(1)}</strong></td><td>{row.daysToExpiry} days</td><td>{row.dailyConsumption.toFixed(1)} / day</td></tr>)}</tbody></table></div></section><div className="forecast-intelligence-sections" style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '24px' }}><section className="panel forecast-intel"><div className="panel-head"><div><div className="panel-title">Forecast Intelligence</div></div><Target size={17} /></div>{riskRows.map(row => <ForecastIntelRow key={row.id} facilityId={row.facilityId} medicineId={row.medicineId} medicineName={row.medicineName} currentStock={row.quantityOnHand} />)}</section><section className="panel regional-intel"><div className="panel-head"><div><div className="panel-title">Regional Shortage Propagation</div><div className="panel-kicker">How a local shortage can cascade across the network</div></div><Layers size={17} /></div>{riskRows.map(row => <RegionalIntelRow key={row.id} medicineId={row.medicineId} medicineName={row.medicineName} />)}</section><section className="panel alert-audit"><div className="panel-head"><div><div className="panel-title">Alert Audit Trail</div></div><Shield size={17} /></div><AlertHistoryTimeline facilityId={FACILITY_ID} /></section></div></QueryState></main>;
}

function BloodBankPage() {
  const [group, setGroup] = useState<'all' | BloodGroup>('all');
  const [city, setCity] = useState('all');
  const [query, setQuery] = useState('');
  const bloodParams = {
    group: group === 'all' ? undefined : group,
    city: city === 'all' ? undefined : city,
    query: query || undefined,
  };
  const bloodBank = useListBloodBankAvailability(bloodParams, {
    query: {
      refetchInterval: POLL,
      queryKey: getListBloodBankAvailabilityQueryKey(bloodParams),
    },
  });
  const records = bloodBank.data ?? [];
  const filtered = records.filter((record) => {
    const matchesGroup = group === 'all' || record.bloodGroup === group;
    const matchesCity = city === 'all' || record.city === city;
    const matchesQuery = `${record.facilityName} ${record.city} ${record.address} ${record.bloodGroup}`.toLowerCase().includes(query.toLowerCase());
    return matchesGroup && matchesCity && matchesQuery;
  });
  const totalUnits = filtered.reduce((total, record) => total + record.units, 0);
  const surplusUnits = filtered.filter((record) => record.status === 'surplus').reduce((total, record) => total + record.units, 0);
  const providers = new Set(filtered.map((record) => record.facilityName)).size;
  return <main className="main-content"><PageHeading eyebrow="Emergency network" title="Blood group bank" description="Find reported blood availability across nearby hospitals and diagnostic labs, then move quickly to the right centre." action={<button className="button-secondary" type="button" onClick={() => { void bloodBank.refetch(); }}><RefreshCw /> Refresh availability</button>} /><div className="blood-intro panel"><div><div className="eyebrow">Availability finder</div><h2>Search the regional blood network</h2><p>Choose a blood group or search by hospital and lab. Records show the latest reported units and contact point.</p></div><div className="blood-intro-mark"><Droplets /></div></div><div className="metric-grid blood-metrics"><div className="panel metric"><div className="metric-label"><Droplets /> Visible units</div><strong>{formatUnits(totalUnits)}</strong><small>Across current filters</small></div><div className="panel metric"><div className="metric-label"><PackageCheck /> Surplus units</div><strong>{formatUnits(surplusUnits)}</strong><small>Ready for coordination</small></div><div className="panel metric"><div className="metric-label"><Building2 /> Reporting centres</div><strong>{providers}</strong><small>Hospitals and labs</small></div><div className="panel metric"><div className="metric-label"><MapPinned /> Nearby range</div><strong>{filtered.length ? `${Math.min(...filtered.map((row) => row.distanceKm)).toFixed(1)}` : '—'}</strong><small>Nearest centre · km</small></div></div><div className="blood-toolbar"><div className="watch-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search hospitals or labs" aria-label="Search hospitals or labs" data-testid="input-blood-bank-search" /></div><div className="blood-groups">{(['all', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const).map((value) => <button key={value} className={`filter-button ${group === value ? 'active' : ''}`} type="button" onClick={() => setGroup(value)}>{value === 'all' ? 'All groups' : value}</button>)}</div><select value={city} onChange={(event) => setCity(event.target.value)} aria-label="Filter blood bank by city"><option value="all">All cities</option><option value="Udupi">Udupi</option><option value="Manipal">Manipal</option><option value="Mangalore">Mangalore</option></select></div><section className="panel blood-table-panel"><div className="panel-head"><div><div className="panel-title">{filtered.length} blood availability records</div><div className="panel-kicker">Hospitals and labs in the connected regional network</div></div><span className="live-tag"><i />NETWORK DATA</span></div>{bloodBank.isError ? <div className="state-card error-state"><AlertTriangle /><strong>Blood bank data unavailable</strong><span>We could not reach the availability service.</span><button className="button-secondary" type="button" onClick={() => { void bloodBank.refetch(); }}><RefreshCw /> Retry</button></div> : bloodBank.isLoading ? <LoadingRows count={6} /> : !filtered.length ? <div className="state-card"><Droplets /><strong>No matching blood stock</strong><span>Try another blood group, city, or facility name.</span></div> : <div className="table-wrap"><table className="data-table blood-table"><thead><tr><th>Blood group</th><th>Centre</th><th>Distance</th><th>Units</th><th>Availability</th><th>Contact</th><th>Updated</th></tr></thead><tbody>{filtered.map((record) => <tr key={record.id}><td><span className="blood-group-pill">{record.bloodGroup}</span></td><td className="medicine-cell"><b>{record.facilityName}</b><small>{record.facilityType} · {record.city} · {record.address}</small></td><td>{record.distanceKm.toFixed(1)} km</td><td><strong className={record.status === 'low' ? 'text-critical' : ''}>{formatUnits(record.units)}</strong><small> units</small></td><td><span className={`blood-status ${record.status}`}><i />{record.status === 'surplus' ? 'Surplus' : record.status === 'available' ? 'Available' : 'Low stock'}</span></td><td><span className="blood-contact"><b>{record.contactName}</b><small><Phone /> {record.contactPhone}</small></span></td><td>{formatRelative(record.lastUpdated)}</td></tr>)}</tbody></table></div>}</section><div className="info-strip"><Droplets /><span><b>Availability note:</b> Contact the listed centre before dispatch. The dashboard reflects the latest partner-reported blood stock and not a reservation.</span>{bloodBank.dataUpdatedAt ? <small className="blood-loaded">Refreshed {formatRelative(new Date(bloodBank.dataUpdatedAt).toISOString())}</small> : null}</div></main>;
}

function TransfersPage() {
  const [view, setView] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const transfers = useListTransferRequests({ facilityId: FACILITY_ID, role: view }, { query: { refetchInterval: POLL, queryKey: getListTransferRequestsQueryKey({ facilityId: FACILITY_ID, role: view }) } });
  const notifications = useListNotifications({ facilityId: FACILITY_ID }, { query: { refetchInterval: POLL, queryKey: getListNotificationsQueryKey({ facilityId: FACILITY_ID }) } });
  const update = useUpdateTransferRequest();
  const markRead = useMarkNotificationRead();
  const queryClient = useQueryClient();
  const accept = (id: number, status: 'accepted' | 'rejected') => update.mutate({ id, data: { status } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTransferRequestsQueryKey({ facilityId: FACILITY_ID, role: 'all' }) }); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey({ facilityId: FACILITY_ID }) }); } });
  return <main className="main-content"><PageHeading eyebrow="Traceable movement" title="Transfer inbox" description="Accept incoming requests, monitor outgoing handoffs, and keep the coordination record honest." action={<Link href="/redistribute" className="button-primary"><Send /> New request</Link>} /><div className="transfer-layout"><section className="panel"><div className="panel-head"><div><div className="panel-title">Transfer activity</div><div className="panel-kicker">Updates automatically every 15 seconds</div></div><div className="filter-group">{(['all', 'incoming', 'outgoing'] as const).map((v) => <button className={`filter-button ${view === v ? 'active' : ''}`} key={v} type="button" onClick={() => setView(v)} data-testid={`button-transfer-filter-${v}`}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div></div><QueryState loading={transfers.isLoading} error={transfers.isError} empty={!transfers.data?.length} retry={() => transfers.refetch()}><div className="transfer-list">{(transfers.data ?? []).map((transfer) => { const incoming = transfer.supplierFacilityId === FACILITY_ID; return <article className="transfer-card" key={transfer.id}><div className={`transfer-direction large ${incoming ? 'incoming' : 'outgoing'}`}>{incoming ? <ArrowDownLeft /> : <ArrowUpRight />}</div><div className="transfer-main"><div className="transfer-card-head"><b>{transfer.medicineName}</b><span className={`status-text ${transfer.status}`}>{transfer.status}</span></div><p>{transfer.quantity.toLocaleString()} units · {incoming ? `from ${transfer.requesterFacilityName}` : `to ${transfer.supplierFacilityName}`}</p><small>Request #{transfer.id} · {formatRelative(transfer.createdAt)} · Delivery: {deliveryLabel(transfer.deliveryStatus)}</small>{transfer.note && <div className="transfer-note">{transfer.note}</div>}</div>{incoming && transfer.status === 'pending' && <div className="transfer-actions"><button className="button-primary" type="button" onClick={() => accept(transfer.id, 'accepted')} disabled={update.isPending} data-testid={`button-accept-transfer-${transfer.id}`}><Check /> Accept</button><button className="button-danger" type="button" onClick={() => accept(transfer.id, 'rejected')} disabled={update.isPending} data-testid={`button-reject-transfer-${transfer.id}`}><X /> Reject</button></div>}</article>; })}</div></QueryState></section><aside className="panel notification-panel"><div className="panel-head"><div><div className="panel-title">Activity feed</div><div className="panel-kicker">Incoming alerts and transfer updates</div></div><Bell size={16} /></div><div className="activity-list">{(notifications.data ?? []).slice(0, 8).map((n) => <button className={`activity-item ${n.isRead ? '' : 'unread'}`} key={n.id} onClick={() => !n.isRead && markRead.mutate({ id: n.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey({ facilityId: FACILITY_ID }) }) })} type="button" data-testid={`button-notification-${n.id}`}><span className="activity-dot" /><span><b>{n.title}</b><small>{n.body}</small><em>{formatRelative(n.createdAt)}{!n.isRead ? ' · Mark read' : ''}</em></span></button>)}</div>{!notifications.data?.length && <div className="empty-inline">No notifications yet.</div>}</aside></div></main>;
}

function NotFound() {
  return <main className="main-content"><div className="state-card"><ShieldCheck /><strong>That signal is outside the network</strong><span>The page you requested could not be found.</span><Link href="/" className="button-primary">Return to command center</Link></div></main>;
}
function Router() {
  return <Shell><ErrorBoundary><Switch><Route path="/" component={OverviewPage} /><Route path="/shortages" component={ShortagesPage} /><Route path="/risk-analysis" component={RiskAnalysisPage} /><Route path="/redistribute" component={RedistributePage} /><Route path="/facilities" component={FacilitiesPage} /><Route path="/blood-bank" component={BloodBankPage} /><Route path="/transfers" component={TransfersPage} /><Route component={NotFound} /></Switch></ErrorBoundary></Shell>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;