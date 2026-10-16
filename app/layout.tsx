import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Spiritus LeadOS — Business intelligence',description:'Evidence-led prospect research and sales operations by Spiritus Systems'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
