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
  const [needsApiKey, setNeedsApiKey] = React.useState(false);

  React.useEffect(() => {
    async function checkApiKey() {
      if (typeof window !== 'undefined' && (window as any).aistudio) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        console.log("Has API key:", hasKey);
        if (!hasKey) {
          setNeedsApiKey(true);
        }
      } else {
        console.log("aistudio not found");
      }
    }
    checkApiKey();

    // Trigger a sync from Google Drive on page load
    // This ensures the app loads the latest backup without requiring admin login
    fetch('/api/sync-from-drive', { method: 'POST' })
      .then(res => res.json())
      .then(data => console.log('Sync on load:', data))
      .catch(err => console.error('Failed to sync on load:', err));
  }, []);

  const handleSelectKey = async () => {
    if (typeof window !== 'undefined' && (window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (hasKey) {
        setNeedsApiKey(false);
      }
    }
  };

  if (needsApiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">API Key Required</h2>
          <p className="text-slate-600 mb-6">
            This application requires a Gemini API key to function. Please select your API key to continue.
            <br/><br/>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
              Learn more about billing
            </a>
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors"
          >
            Select API Key
          </button>
        </div>
      </div>
    );
  }

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
