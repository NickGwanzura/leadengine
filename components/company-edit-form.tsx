'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from './ui/button';

type Company = { id:string; name:string; website:string|null; industry:string; city:string; country:string; email?:string|null; phone?:string|null; notes:string; dealValue:string|number };
type Fields = { name:string; website:string; industry:string; city:string; country:string; email:string; phone:string; notes:string; dealValue:string };

export function CompanyEditForm({ company, onSaved }: { company:Company; onSaved:()=>Promise<void> }) {
  const [fields,setFields]=useState<Fields>({ name:company.name, website:company.website||'', industry:company.industry, city:company.city, country:company.country, email:company.email||'', phone:company.phone||'', notes:company.notes, dealValue:String(company.dealValue) });
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  function change(key:keyof Fields,value:string){setFields(previous=>({...previous,[key]:value}));setSaved(false);}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setSaved(false);
    try{
      const response=await fetch(`/api/companies/${company.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...fields,dealValue:Number(fields.dealValue)})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Could not update company');
      await onSaved();setSaved(true);
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  }
  return <details className="company-edit-details"><summary>Edit company details</summary><form onSubmit={submit}>
    <label>Company name<input required minLength={2} maxLength={200} value={fields.name} onChange={event=>change('name',event.target.value)}/></label>
    <label>Official website<input type="url" value={fields.website} onChange={event=>change('website',event.target.value)} placeholder="https://company.example"/><small>Only add a URL that belongs to this business. Changing it requires a new crawl approval.</small></label>
    <div className="record-grid"><label>Industry<input maxLength={100} value={fields.industry} onChange={event=>change('industry',event.target.value)}/></label><label>City<input maxLength={100} value={fields.city} onChange={event=>change('city',event.target.value)}/></label><label>Country<input maxLength={100} value={fields.country} onChange={event=>change('country',event.target.value)}/></label><label>Estimated deal value (USD)<input type="number" min={0} max={1000000000} value={fields.dealValue} onChange={event=>change('dealValue',event.target.value)}/></label><label>Public business email<input type="email" value={fields.email} onChange={event=>change('email',event.target.value)}/></label><label>Business phone<input maxLength={50} value={fields.phone} onChange={event=>change('phone',event.target.value)}/></label></div>
    <label>Relationship notes<textarea maxLength={10000} value={fields.notes} onChange={event=>change('notes',event.target.value)}/></label>
    {error&&<p className="field-error" role="alert">{error}</p>}{saved&&<p className="notice" role="status">Company details saved.</p>}
    <Button disabled={busy}>{busy?<Loader2 className="spin" size={14}/>:<Save size={14}/>} Save details</Button>
  </form></details>;
}
