import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Workspace from '@/components/workspace';
export default async function Home(){const session=await auth();if(!session?.user)redirect('/login');return <Workspace user={session.user.name||'Spiritus team'}/>;}
