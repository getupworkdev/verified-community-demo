'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtDate, friendly } from '@/lib/shared';
import { Loading, Sheet, Spinner, useToast } from '@/components/ui';
import { refreshCounts } from '../ModTop';

type Member = { id: string; name: string; status: string; hidden: boolean; membership: string; membership_until: string | null; country: string; appeal_requested_at: string | null; suspended_until: string | null };
type Audit = { id: number; actor_id: string | null; actor_name: string; action: string; target_id: string | null; target_name: string | null; detail: string | null; created_at: string };
type Stats = { approved: number; pending: number; paying: number; founding_left: number; founding_total: number };

function statusPill(m: Member) {
  if (m.hidden) return <span className="pill pill-danger">Hidden</span>;
  const map: Record<string, string> = { approved: 'pill-sage', pending: 'pill-amber', rejected: 'pill-grey', suspended: 'pill-danger', banned: 'pill-danger', draft: 'pill-grey' };
  return <span className={`pill ${map[m.status]}`}>{m.status[0].toUpperCase() + m.status.slice(1)}</span>;
}

function access(m: Member) {
  const until = m.membership_until ? fmtDate(m.membership_until, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  switch (m.membership) {
    case 'founding': return `Founding · free until ${until}`;
    case 'paid': return 'Paid membership';
    case 'complimentary': return `Complimentary · ends ${until}`;
    default: return 'Free';
  }
}

function line(a: Audit) {
  const self = a.actor_id && a.actor_id === a.target_id;
  return <><strong>{a.actor_name}</strong> {a.action}{!self && a.target_name ? ` ${a.target_name}` : ''}{a.detail ? ` (${a.detail})` : ''}</>;
}

export default function Members() {
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [compId, setCompId] = useState('');
  const [compUntil, setCompUntil] = useState('2027-03-31');
  const [manage, setManage] = useState<Member | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reset, setReset] = useState(false);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [{ data: s }, { data: m }, { data: a }, { data: adm }] = await Promise.all([
      sb.rpc('admin_stats'), sb.rpc('admin_members'),
      sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(40), sb.rpc('is_admin'),
    ]);
    setStats(s); setMembers(m as Member[]); setAudit((a as Audit[]) ?? []); setIsAdmin(!!adm);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function grant() {
    if (!compId) return;
    setBusy('grant');
    const { error } = await supabaseBrowser().rpc('admin_set_access', { p_id: compId, p_access: 'complimentary', p_until: compUntil });
    setBusy(null);
    if (error) { toast.show(friendly(error)); return; }
    toast.show('Complimentary access saved');
    load();
  }

  async function act(m: Member, action: string) {
    setBusy(action);
    const { error } = await supabaseBrowser().rpc('mod_member_action', { p_id: m.id, p_action: action, p_reason: null, p_days: 14 });
    setBusy(null);
    if (error) { toast.show(friendly(error)); return; }
    setManage(null);
    toast.show('Saved');
    refreshCounts();
    load();
  }

  async function removeAccess(m: Member) {
    setBusy('none');
    const { error } = await supabaseBrowser().rpc('admin_set_access', { p_id: m.id, p_access: 'none', p_until: null });
    setBusy(null);
    if (error) { toast.show(friendly(error)); return; }
    setManage(null);
    load();
  }

  async function doReset() {
    setBusy('reset');
    const res = await fetch('/api/reset', { method: 'POST' });
    setBusy(null);
    setReset(false);
    if (!res.ok) { toast.show('Reset failed. Please try again.'); return; }
    toast.show('Demo restored to its starting state');
    refreshCounts();
    load();
  }

  function exportCsv() {
    const rows = [['when', 'who', 'action', 'member', 'detail'], ...audit.map((a) => [a.created_at, a.actor_name, a.action, a.target_name ?? '', a.detail ?? ''])];
    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    el.download = 'audit-log.csv';
    el.click();
  }

  return (
    <main className="mod-wrap">
      <h1>Members</h1>
      <div className="stat-row">
        <div className="stat"><div className="k">Approved</div><div className="v">{stats?.approved ?? '–'}</div></div>
        <div className="stat"><div className="k">Pending review</div><div className="v">{stats?.pending ?? '–'}</div></div>
        <div className="stat"><div className="k">Paying members</div><div className="v">{stats?.paying ?? '–'}</div></div>
        <div className="stat"><div className="k">Founding places left</div><div className="v">{stats ? `${stats.founding_left} / ${stats.founding_total}` : '–'}</div></div>
      </div>
      <div className="mod-grid-2">
        <div className="stack-lg">
          {!members ? <Loading /> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Member</th><th>Status</th><th>Access</th><th /></tr></thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td><strong>{m.name.replace(/ (\S)\S*$/, ' $1.')}</strong><div className="tiny muted">{m.country}</div></td>
                      <td>{statusPill(m)}{m.appeal_requested_at && <div className="tiny" style={{ color: 'var(--amber)' }}>Asked for a review</div>}</td>
                      <td className="small">{access(m)}</td>
                      <td><button className="link-btn small" onClick={() => setManage(m)}>Manage</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card">
            <div className="row wrap" style={{ alignItems: 'flex-end' }}>
              <label className="field grow" style={{ minWidth: 200 }}>
                <span>Give complimentary access to</span>
                <select className="select" value={compId} onChange={(e) => setCompId(e.target.value)} disabled={!isAdmin}>
                  <option value="">Choose a member…</option>
                  {(members ?? []).filter((m) => m.status === 'approved').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="field" style={{ minWidth: 170 }}>
                <span>Until</span>
                <input className="input" type="date" value={compUntil} onChange={(e) => setCompUntil(e.target.value)} disabled={!isAdmin} />
              </label>
              <button className="btn btn-primary btn-sm" style={{ minHeight: 50 }} onClick={grant} disabled={!isAdmin || !compId || busy === 'grant'}>Save</button>
            </div>
            {!isAdmin && <p className="tiny muted" style={{ marginTop: 8 }}>Only admins can change access.</p>}
          </div>
          <div className="card stack" style={{ background: '#fff8ec', borderColor: 'var(--amber-line)' }}>
            <strong style={{ color: 'var(--amber)' }}>Demo controls</strong>
            <p className="small">Restores every member, message, report and the audit log to the starting state. Accounts created during testing are removed.</p>
            <button className="btn btn-amber-outline btn-sm" onClick={() => setReset(true)}>Reset demo</button>
          </div>
        </div>
        <div className="card">
          <div className="row between"><h3>Audit log</h3><button className="link-btn small" onClick={exportCsv}>Export</button></div>
          {audit.map((a) => (
            <div key={a.id} className="audit-item">{line(a)}<div className="tiny muted">{fmtDate(a.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
          ))}
        </div>
      </div>

      {manage && (
        <Sheet onClose={() => setManage(null)} label={`Manage ${manage.name}`}>
          <h2>{manage.name}</h2>
          <div className="row">{statusPill(manage)} <span className="small muted">{access(manage)}</span></div>
          {manage.suspended_until && <p className="small muted">Suspended until {fmtDate(manage.suspended_until)}</p>}
          <div className="stack">
            {manage.status !== 'approved' || manage.hidden
              ? ['suspended', 'banned'].includes(manage.status) || manage.hidden
                ? <button className="btn btn-sage" disabled={!!busy} onClick={() => act(manage, 'reinstate')}>{busy === 'reinstate' ? <Spinner /> : 'Reinstate'}</button>
                : <p className="small muted">This profile is {manage.status}. Decisions happen in the review queue.</p>
              : <>
                  <button className="btn btn-ghost" disabled={!!busy} onClick={() => act(manage, 'warn')}>Warn</button>
                  <button className="btn btn-ghost" disabled={!!busy} onClick={() => act(manage, 'send_back')}>Send back to review</button>
                  <button className="btn btn-amber-outline" disabled={!!busy} onClick={() => act(manage, 'suspend')}>Suspend for 14 days</button>
                  <button className="btn btn-danger-outline" disabled={!!busy} onClick={() => act(manage, 'ban')}>Ban</button>
                </>}
            {isAdmin && manage.membership !== 'none' && (
              <button className="btn btn-ghost" disabled={!!busy} onClick={() => removeAccess(manage)}>Remove {manage.membership} access</button>
            )}
          </div>
        </Sheet>
      )}
      {reset && (
        <Sheet onClose={() => setReset(false)} label="Reset demo">
          <h2>Reset the demo?</h2>
          <p className="muted">Everything returns to the starting state. Anyone signed in stays signed in.</p>
          <button className="btn btn-primary" onClick={doReset} disabled={busy === 'reset'}>{busy === 'reset' ? <Spinner /> : 'Reset demo'}</button>
          <button className="btn btn-ghost" onClick={() => setReset(false)}>Cancel</button>
        </Sheet>
      )}
      {toast.node}
    </main>
  );
}
