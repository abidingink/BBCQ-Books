/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Book, ScanLine, ArrowLeftRight, ShieldCheck } from 'lucide-react';
import Home from './pages/Home';
import Borrow from './pages/Borrow';
import Return from './pages/Return';
import Admin from './pages/Admin';
import ExtendLoan from './pages/ExtendLoan';
import { LOGO_URL, CHURCH_NAME } from './constants';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <header className="bg-white text-slate-900 p-4 shadow-md sticky top-0 z-10 border-b border-slate-100">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden">
              <img src={LOGO_URL} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-tight">{CHURCH_NAME}</h1>
            </div>
          </Link>
          <nav className="hidden md:flex gap-6 font-medium text-sm">
            <Link to="/" className="hover:text-slate-600 transition-colors">Catalogue</Link>
            <Link to="/borrow" className="hover:text-slate-600 transition-colors">Borrow</Link>
            <Link to="/return" className="hover:text-slate-600 transition-colors">Return</Link>
            <Link to="/admin" className="hover:text-slate-600 transition-colors">Admin</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 pb-24 md:pb-8">
        {children}
      </main>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-3 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
        <Link to="/" className="flex flex-col items-center gap-1 text-slate-500 hover:text-[#1a202c]">
          <Book className="w-5 h-5" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Catalogue</span>
        </Link>
        <Link to="/borrow" className="flex flex-col items-center gap-1 text-slate-500 hover:text-[#1a202c]">
          <ScanLine className="w-5 h-5" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Borrow</span>
        </Link>
        <Link to="/return" className="flex flex-col items-center gap-1 text-slate-500 hover:text-[#1a202c]">
          <ArrowLeftRight className="w-5 h-5" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Return</span>
        </Link>
        <Link to="/admin" className="flex flex-col items-center gap-1 text-slate-500 hover:text-[#1a202c]">
          <ShieldCheck className="w-5 h-5" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Admin</span>
        </Link>
      </nav>
    </div>
  );
}

export default function App() {
  React.useEffect(() => {
    async function checkApiKey() {
      if (typeof window !== 'undefined' && (window as any).aistudio) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        console.log("Has API key:", hasKey);
      } else {
        console.log("aistudio not found");
      }
    }
    checkApiKey();
  }, []);
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/borrow" element={<Borrow />} />
          <Route path="/return" element={<Return />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/extend/:token" element={<ExtendLoan />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
