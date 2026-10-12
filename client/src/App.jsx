import { useCallback, useEffect, useRef, useState } from 'react';
import { listTickets, getStats, createTicket, updateTicket } from './api.js';

const STATUSES = ['open', 'in_progress', 'closed'];
const PRIORITIES = ['low', 'medium', 'high'];
const label = (s) => s.replace('_', ' ');

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function App() {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], total: 0, total_pages: 1 });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const notify = (text, kind = 'ok') => setToast({ text, kind });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([listTickets({ status: filter, page }), getStats()]);
      setResult(list);
      setStats(s);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const pickFilter = (f) => {
    setFilter(f);
    setPage(1);
  };

  // Show the change straight away, then reload so the list and counts match the server.
  const change = async (ticket, changes) => {
    setResult((r) => ({ ...r, data: r.data.map((t) => (t.id === ticket.id ? { ...t, ...changes } : t)) }));
    try {
      await updateTicket(ticket.id, changes);
      const [field, value] = Object.entries(changes)[0];
      notify(`#${ticket.id} ${field} set to ${label(value)}`);
    } catch (e) {
      notify(e.message, 'error');
    }
    await load();
  };

  const cards = [{ key: '', name: 'all', count: stats?.total }, ...STATUSES.map((s) => ({ key: s, name: label(s), count: stats?.[s] }))];

  return (
    <main className="wrap">
      <header className="top">
        <h1>Ticket Tracker</h1>
        <p>Log it, move it, close it.</p>
      </header>

      <section className="stats" aria-label="Filter by status">
        {cards.map((c) => (
          <button
            key={c.key || 'all'}
            className={`stat stat-${c.key || 'all'}`}
            aria-pressed={filter === c.key}
            onClick={() => pickFilter(c.key)}
          >
            <strong>{c.count ?? '–'}</strong>
            <span>{c.name}</span>
          </button>
        ))}
      </section>

      {stats?.total > 0 && (
        <div className="bar" aria-hidden="true">
          {STATUSES.map((s) => (
            <span key={s} className={`fill-${s}`} style={{ width: `${(stats[s] / stats.total) * 100}%` }} />
          ))}
        </div>
      )}

      <NewTicketForm
        onCreated={(t) => {
          notify(`Ticket #${t.id} created`);
          pickFilter('');
          load();
        }}
        onError={(msg) => notify(msg, 'error')}
      />

      {loading ? (
        <p className="empty">Loading…</p>
      ) : result.data.length === 0 ? (
        <p className="empty">{filter ? `No ${label(filter)} tickets.` : 'No tickets yet. Add the first one above.'}</p>
      ) : (
        <ul className="tickets">
          {result.data.map((t) => (
            <Ticket key={t.id} ticket={t} onChange={change} />
          ))}
        </ul>
      )}

      {result.total_pages > 1 && (
        <div className="pager">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span>Page {page} of {result.total_pages}</span>
          <button disabled={page >= result.total_pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}

      {toast && (
        <div role="status" className={`toast toast-${toast.kind}`}>
          {toast.text}
        </div>
      )}
    </main>
  );
}

function Ticket({ ticket: t, onChange }) {
  const nextPriority = PRIORITIES[(PRIORITIES.indexOf(t.priority) + 1) % PRIORITIES.length];

  return (
    <li className={`ticket priority-${t.priority} is-${t.status}`}>
      <div className="ticket-main">
        <span className="title">{t.title}</span>
        {t.description && <span className="desc">{t.description}</span>}
        <span className="meta">
          #{t.id} · {timeAgo(t.created_at)}
        </span>
      </div>

      <button
        className="chip"
        title={`Priority: ${t.priority}. Click to set ${nextPriority}.`}
        onClick={() => onChange(t, { priority: nextPriority })}
      >
        {t.priority}
      </button>

      <div className="segmented" role="group" aria-label={`Status of ticket ${t.id}`}>
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`seg-${s}`}
            aria-pressed={t.status === s}
            disabled={t.status === s}
            onClick={() => onChange(t, { status: s })}
          >
            {label(s)}
          </button>
        ))}
      </div>
    </li>
  );
}

function NewTicketForm({ onCreated, onError }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [busy, setBusy] = useState(false);
  // Reused if the same submission is retried; replaced after a success.
  const key = useRef(crypto.randomUUID());

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ticket = await createTicket({ title, description: description || undefined, priority }, key.current);
      key.current = crypto.randomUUID();
      setTitle('');
      setDescription('');
      setPriority('medium');
      onCreated(ticket);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <input
        required
        maxLength={200}
        placeholder="What's broken?"
        aria-label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        maxLength={5000}
        placeholder="Details (optional)"
        aria-label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="form-row">
        <div className="segmented" role="group" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={`seg-${p}`}
              aria-pressed={priority === p}
              onClick={() => setPriority(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Adding…' : 'Add ticket'}
        </button>
      </div>
    </form>
  );
}
