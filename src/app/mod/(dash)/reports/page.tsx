'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { REPORT_LABEL, ago, friendly } from '@/lib/shared';
import { Loading, useToast } from '@/components/ui';
import { refreshCounts, type Counts } from '../ModTop';

type Row = { member_id: string; name: string; status: string; hidden: boolean; open_reports: number; top_reason: string; screening_flags: number; latest_at: string };
type Flagged = { id: number; sender_id: string; sender_name: string; recipient_name: string; body: string; flag_reason: string; reported_by_recipient: boolean; at: string };

const ACTIONS: [string, string][] = [
  ['warn', 'Warn'], ['dismiss', 'Dismiss reports'], ['send_back', 'Send back to review'], ['suspend', 'Suspend 14 days'], ['ban', 'Ban'],
];

export default function Reports() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [flagged, setFlagged] = useState<Flagged[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [{ data: r }, { data: f }, { data: c }] = await Promise.all([sb.rpc('mod_reports'), sb.rpc('mod_flagged_messages'), sb.rpc('mod_counts')]);
    setRows(r as Row[]); setFlagged((f as Flagged[]) ?? []); setCounts(c);
  }, []);
  useEffect(() => { load(); }, [load]);

  function suggested(r: Row) {
    return r.top_reason === 'fake_profile' ? 'send_back' : r.top_reason === 'money' && r.open_reports >= 3 ? 'suspend' : 'warn';
  }

  async function apply(r: Row) {
    const action = choice[r.member_id] ?? suggested(r);
    if ((action === 'ban' || action === 'suspend') && !confirm(`${action === 'ban' ? 'Ban' : 'Suspend'} ${r.name}?`)) return;
    setBusy(r.member_id);
    const reason = action === 'ban' ? 'Repeatedly asked members for money.' : action === 'suspend' ? 'Messages that went against our community guidelines.' : null;
    const { error } = await supabaseBrowser().rpc('mod_member_action', { p_id: r.member_id, p_action: action, p_reason: reason, p_days: 14 });
    setBusy(null);
    if (error) { toast.show(friendly(error)); return; }
    toast.show(`${ACTIONS.find(([a]) => a === action)?.[1]} · ${r.name}`);
    refreshCounts();
    load();
  }

  return (
    <main className="mod-wrap">
      <h1>Reports and safety</h1>
      <div className="stat-row">
        <div className="stat"><div className="k">Open reports</div><div className="v">{counts?.reports ?? '–'}</div></div>
        <div className="stat"><div className="k">Auto-hidden (3+ reports)</div><div className="v" style={{ color: 'var(--danger)' }}>{counts?.hidden ?? '–'}</div></div>
        <div className="stat"><div className="k">Messages flagged by screening</div><div className="v">{counts?.flagged_messages ?? '–'}</div></div>
      </div>
      {!rows ? <Loading /> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Member</th><th>Reason</th><th>Reports</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="muted">No open reports.</td></tr>}
              {rows.map((r) => (
                <tr key={r.member_id}>
                  <td><strong>{r.name}</strong><div className="tiny muted">latest {ago(r.latest_at)} ago</div></td>
                  <td>{REPORT_LABEL[r.top_reason]}{r.screening_flags > 0 && ' · screening flag'}</td>
                  <td>{r.open_reports}</td>
                  <td>{r.hidden ? <span className="pill pill-danger">Auto-hidden</span> : r.status !== 'approved' ? <span className="pill pill-grey">{r.status}</span> : <span className="pill pill-amber">Open</span>}</td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <select className="select select-sm" value={choice[r.member_id] ?? suggested(r)} onChange={(e) => setChoice({ ...choice, [r.member_id]: e.target.value })} aria-label={`Action for ${r.name}`}>
                        {ACTIONS.map(([a, l]) => <option key={a} value={a}>{l}</option>)}
                      </select>
                      <button className="btn btn-primary btn-sm" style={{ minHeight: 38 }} disabled={busy === r.member_id} onClick={() => apply(r)}>Apply</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card stack">
        <h3>Messages flagged by screening</h3>
        <p className="small muted">Moderators only see messages that automated screening flagged or that a member reported. Ordinary conversations stay private.</p>
        {flagged.length === 0 && <p className="small muted">None.</p>}
        {flagged.map((f) => (
          <div key={f.id} className="stack" style={{ gap: 6, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <strong className="small" style={{ color: 'var(--navy)' }}>{f.sender_name} to {f.recipient_name}</strong>
            <div style={{ background: '#faf7f2', borderRadius: 10, padding: '10px 14px' }}>&ldquo;{f.body}&rdquo;</div>
            <span className="tiny muted">Screening result: {f.flag_reason === 'money' ? 'money request' : f.flag_reason}{f.reported_by_recipient ? ' · Reported by the recipient' : ''} · {ago(f.at)} ago</span>
          </div>
        ))}
      </div>
      {toast.node}
    </main>
  );
}
