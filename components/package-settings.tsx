'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from './ui/button';

type Package = { id: string; name: string; price: number; fromPrice: boolean; currency: string };

export function PackageSettings() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/packages');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load packages');
      setPackages(data.packages);
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timeout = setTimeout(() => void load(), 0); return () => clearTimeout(timeout); }, [load]);

  async function save(pkg: Package) {
    setSaving(pkg.id); setError(''); setNotice('');
    try {
      const response = await fetch('/api/packages', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: pkg.id, price: pkg.price, fromPrice: pkg.fromPrice }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save package');
      setNotice(`${pkg.name} pricing saved for future drafts.`);
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(''); }
  }

  return <section className="panel package-settings"><div className="panel-heading"><div><h2>Spiritus package pricing</h2><p>Edit the indicative prices used when creating new proposal lines. Existing proposal amounts stay as drafted.</p></div></div>
    {error && <div className="error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    {loading ? <div className="empty"><Loader2 className="spin" size={20}/><p>Loading packages…</p></div> : <div className="package-settings-list">{packages.map(pkg => <div className="package-settings-row" key={pkg.id}><strong>{pkg.name}</strong><label>USD<input type="number" min={0} max={100000000} step="0.01" value={pkg.price} onChange={event => setPackages(previous => previous.map(item => item.id === pkg.id ? { ...item, price: Number(event.target.value) } : item))}/></label><label className="package-from"><input type="checkbox" checked={pkg.fromPrice} onChange={event => setPackages(previous => previous.map(item => item.id === pkg.id ? { ...item, fromPrice: event.target.checked } : item))}/> Starting price</label><Button variant="outline" disabled={Boolean(saving)} onClick={() => void save(pkg)}>{saving === pkg.id ? <Loader2 className="spin" size={14}/> : <Save size={14}/>} Save</Button></div>)}</div>}
  </section>;
}
