'use client';

import { Printer } from 'lucide-react';

export function PrintProposalButton() {
  return <button className="button button-primary proposal-print-button" onClick={() => window.print()}><Printer size={16}/> Print or save PDF</button>;
}
