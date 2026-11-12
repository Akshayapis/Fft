import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LifeBuoy, Plus, MessageSquare, Send, Paperclip, Mail, MessageCircle, Clock, CheckCircle2, ChevronLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAppData } from '../lib/appdata';
import { useLoad } from '../lib/hooks';
import { uploadFile } from '../lib/realtime';
import { dateTime } from '../lib/format';
import { PageHeader, Modal, Field, StatusBadge, EmptyState, SkeletonCards, ErrorState, Spinner, useToast } from '../components/UICommon';

const CATEGORIES = ['Payment issue', 'Tournament registration', 'Room credentials', 'Result dispute', 'Account', 'Technical', 'Other'];
export function SupportPage() {
  const toast = useToast();
  const { user } = useAuth();
  const { data: pub } = useAppData();
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/support/tickets'), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ subject: '', category: CATEGORIES[0], message: '', attachment: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const s = pub?.settings || {};
  const tickets = data?.tickets || [];
  const create = async () => {
    setBusy(true);
    try { await api.post('/support/tickets', form); toast('Ticket created', 'success'); setOpen(false); setForm({ subject: '', category: CATEGORIES[0], message: '', attachment: '' }); await reload(); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { const url = await uploadFile(f, user?.id || 'me', 'support'); set('attachment', url); toast('Screenshot attached', 'success'); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return <>
    <PageHeader eyebrow="HELP CENTER" title="Support" subtitle="Create a ticket, follow the conversation and browse the FAQ." actions={<button className="btn primary" onClick={() => setOpen(true)}><Plus size={16} /> New ticket</button>} />
    <div className="grid grid-main">
      <div className="card"><div className="card-head"><h3>My tickets</h3><MessageSquare size={16} color="#a78bfa" /></div>
        {error && <ErrorState message={error} retry={reload} />}
        {loading && <SkeletonCards count={2} />}
        {!loading && !error && (tickets.length ? <div className="table-wrap" style={{ border: 0 }}><table>
          <thead><tr><th>Subject</th><th>Category</th><th>Messages</th><th>Status</th><th>Updated</th><th /></tr></thead>
          <tbody>{tickets.map((t: any) => <tr key={t.id}><td><strong>{t.subject}</strong><div className="dim tiny mono">{t.id}</div></td>
            <td className="small">{t.category}</td><td>{t.messageCount}</td><td><StatusBadge status={t.status} /></td>
            <td className="small muted">{dateTime(t.updatedAt)}</td><td><Link className="btn tiny ghost" to={`/support/${t.id}`}>Open</Link></td></tr>)}</tbody>
        </table></div> : <EmptyState icon={<LifeBuoy size={26} />} title="No tickets yet" text="Need help? Create a ticket and an admin will reply in this thread." action={<button className="btn primary" onClick={() => setOpen(true)}>Create ticket</button>} />)}
      </div>
      <div>
        <div className="card mb"><div className="card-head"><h3>Contact</h3><Mail size={16} color="#67e8f9" /></div>
          {s.contact?.email && <div className="row gap mb"><Mail size={14} className="muted" /><a className="link-btn small" href={`mailto:${s.contact.email}`}>{s.contact.email}</a></div>}
          {s.contact?.telegram && <div className="row gap mb"><MessageCircle size={14} className="muted" /><span className="small">{s.contact.telegram}</span></div>}
          {s.contact?.discord && <div className="row gap mb"><MessageCircle size={14} className="muted" /><span className="small">{s.contact.discord}</span></div>}
          {s.contact?.whatsapp && <div className="row gap mb"><MessageCircle size={14} className="muted" /><span className="small">{s.contact.whatsapp}</span></div>}
          <div className="row gap"><Clock size={14} className="muted" /><span className="small muted">Hours: {s.contact?.hours || '10:00 – 22:00 IST'}</span></div>
          {!s.contact?.email && !s.contact?.telegram && !s.contact?.discord && <p className="muted small">Contact details are configured by the admin. Tickets are always available.</p>}
        </div>
        <div className="card"><div className="card-head"><h3>FAQ</h3><CheckCircle2 size={16} className="good" /></div>
          {(s.faq || []).map((f: any, i: number) => <details className="faq-item" key={i}><summary className="small">{f.q}</summary><p>{f.a}</p></details>)}
        </div>
      </div>
    </div>
    {open && <Modal title="Create support ticket" subtitle="Describe your issue and we will reply in this thread." onClose={() => setOpen(false)}>
      <Field label="Subject" required><input required value={form.subject} maxLength={120} onChange={(e) => set('subject', e.target.value)} placeholder="Brief summary of the issue" /></Field>
      <Field label="Category" required><select value={form.category} onChange={(e) => set('category', e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Message" required><textarea required value={form.message} maxLength={4000} onChange={(e) => set('message', e.target.value)} placeholder="Include match name, transaction ID or any relevant detail…" /></Field>
      <Field label="Screenshot (optional)"><input ref={fileRef} type="file" accept="image/*" onChange={(e) => void onFile(e.target.files?.[0])} /></Field>
      {form.attachment && <img src={form.attachment} alt="Attachment preview" className="upload-preview mb" />}
      <button className="btn primary block" disabled={busy || !form.subject || !form.message} onClick={() => void create()}>{busy ? <Spinner /> : 'Submit ticket'}</button>
    </Modal>}
  </>;
}

export function TicketDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(() => api.get<any>(`/support/tickets/${id}`), [id]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.post(`/support/tickets/${id}/reply`, { message }); setMessage(''); await reload(); toast('Reply sent', 'success'); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return <>
    <PageHeader eyebrow="SUPPORT THREAD" title={data?.ticket?.subject || 'Ticket'} subtitle={`Category: ${data?.ticket?.category || '—'}`}
      actions={<Link className="btn ghost" to="/support"><ChevronLeft size={15} /> All tickets</Link>} />
    {error && <ErrorState message={error} retry={reload} />}
    {loading && <SkeletonCards count={2} />}
    {!loading && !error && data && <div className="card">
      <div className="row between mb"><StatusBadge status={data.ticket.status} /><span className="dim tiny">Created {dateTime(data.ticket.createdAt)}</span></div>
      <div className="ticket-thread mb">{data.messages.map((m: any) => <div key={m.id} className={`message ${m.senderRole === 'admin' ? 'admin' : ''}`}>
        <strong className="tiny">{m.senderRole === 'admin' ? 'Admin team' : m.senderId === user?.id ? 'You' : 'Player'}</strong>
        <p className="small mt">{m.message}</p>
        {m.attachment && <a className="link-btn tiny" href={m.attachment} target="_blank" rel="noreferrer"><Paperclip size={11} /> View attachment</a>}
        <small>{dateTime(m.createdAt)}</small>
      </div>)}</div>
      {data.ticket.status !== 'closed' ? <div className="row gap"><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a reply…" onKeyDown={(e) => { if (e.key === 'Enter' && message.trim()) void send(); }} />
        <button className="btn primary" disabled={busy || !message.trim()} onClick={() => void send()}>{busy ? <Spinner /> : <><Send size={15} /> Send</>}</button></div>
        : <div className="info-banner"><CheckCircle2 size={16} /> This ticket is closed. Create a new ticket for a new issue.</div>}
    </div>}
  </>;
}
