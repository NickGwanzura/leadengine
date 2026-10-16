import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = localFont({
  src: '../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
});
export const metadata:Metadata={title:'Spiritus LeadOS — Business intelligence',description:'Evidence-led prospect research and sales operations by Spiritus Systems'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={geistSans.variable}><body>{children}</body></html>;}
