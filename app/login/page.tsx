import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Command, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Illustrative only: shows what the lead engine produces. Not real records.
const sampleLeads = [
  { initials: 'HF', name: 'Harbour Freight Co.', match: 'Logistics', reason: 'Quotes requested by phone only; no shipment tracking online.' },
  { initials: 'NR', name: 'Northgate Realty', match: 'Real estate', reason: 'Lists 100+ rentals with enquiries handled over WhatsApp.' },
  { initials: 'KC', name: 'Kudu Family Clinics', match: 'Health', reason: 'Three branches, no online booking page.' },
];

export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;
  return <main className="login">
    <section className="login-story">
      <Link className="brand" href="/"><span className="brand-mark"><Command size={17}/></span>spiritus<span className="brand-muted">/ LeadOS</span></Link>
      <div className="login-pitch">
        <span className="eyebrow">Evidence-led prospecting</span>
        <h1>Your next customers,<br/><em>found around the clock.</em></h1>
        <p>LeadOS learns what you sell, searches the public web for businesses that need it, and backs every lead with a source you can check.</p>
      </div>
      <div className="login-feed" aria-hidden="true">
        <div className="login-feed-head"><span><i/>Lead engine</span>Searching 24/7</div>
        {sampleLeads.map(lead=><div className="login-lead" key={lead.name}><b>{lead.initials}</b><div><strong>{lead.name}<small>{lead.match}</small></strong><p>{lead.reason}</p></div></div>)}
      </div>
      <footer>BUILT BY SPIRITUS SYSTEMS <span>HARARE · ZIMBABWE</span></footer>
    </section>
    <section className="login-panel">
      <div className="login-form">
        <span className="login-badge"><ShieldCheck size={13}/> Private team workspace</span>
        <h2>Welcome back</h2>
        <p>Sign in to continue to your workspace.</p>
        {error&&<Alert variant="destructive" className="mt-6"><AlertDescription>Unable to sign in. Check your email and password, then try again.</AlertDescription></Alert>}
        <form action={async(form:FormData)=>{'use server';try{await signIn('credentials',{email:form.get('email'),password:form.get('password'),redirectTo:'/'});}catch(e){if(e instanceof AuthError)redirect('/login?error=credentials');throw e;}}}>
          <label>Work email<Input name="email" type="email" autoComplete="username" required placeholder="you@company.com"/></label>
          <label>Password<Input name="password" type="password" minLength={12} autoComplete="current-password" required placeholder="At least 12 characters"/></label>
          <Button type="submit">Sign in <ArrowRight size={16}/></Button>
        </form>
        <p className="login-note"><Lock size={13}/> Access is managed by your organization administrator.</p>
      </div>
    </section>
  </main>;
}
