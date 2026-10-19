import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight, Command, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;
  return <main className="login"><section className="login-story"><Link className="brand" href="/"><span className="brand-mark"><Command size={21}/></span> spiritus<span className="brand-muted">/ LeadOS</span></Link><div><span className="eyebrow">INTELLIGENCE INTO OPPORTUNITY</span><h1>Better research.<br/>Real opportunities.<br/><em>Stronger relationships.</em></h1><p>Your workspace for understanding businesses and building what they need.</p></div><footer>BUILT BY SPIRITUS SYSTEMS <span>HARARE · ZIMBABWE</span></footer></section><section className="login-panel"><Card className="login-form"><CardHeader><span className="tiny-label"><ShieldCheck size={16}/> PRIVATE TEAM WORKSPACE</span><CardTitle>Welcome back.</CardTitle><CardDescription>Sign in to your Spiritus workspace.</CardDescription></CardHeader><CardContent><div className="grid gap-5">{error&&<Alert variant="destructive"><AlertDescription>Unable to sign in. Check your credentials and service configuration.</AlertDescription></Alert>}<form className="grid gap-4" action={async(form:FormData)=>{'use server';try{await signIn('credentials',{email:form.get('email'),password:form.get('password'),redirectTo:'/'});}catch(e){if(e instanceof AuthError)redirect('/login?error=credentials');throw e;}}}><label className="grid gap-2 text-sm">Work email<Input name="email" type="email" autoComplete="username" required placeholder="you@company.com"/></label><label className="grid gap-2 text-sm">Password<Input name="password" type="password" minLength={12} autoComplete="current-password" required placeholder="Enter your password"/></label><Button type="submit">Sign in to LeadOS <ArrowUpRight size={17}/></Button></form><p className="login-note">Access is managed by your organization administrator.</p></div></CardContent></Card></section></main>;
}
