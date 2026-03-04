import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Scanner from '../components/Scanner';
import { ScanLine, Trash2, CheckCircle2, Search, User, Hash } from 'lucide-react';

interface ScannedBook {
  isbn: string;
  title: string;
  author: string;
}

export default function Return() {
  const [scanning, setScanning] = useState(false);
  const [scannedBooks, setScannedBooks] = useState<ScannedBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [manualIsbn, setManualIsbn] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeLoans, setActiveLoans] = useState<any[]>([]);
  const [searchingLoans, setSearchingLoans] = useState(false);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      const timer = setTimeout(() => {
        searchActiveLoans();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setActiveLoans([]);
    }
  }, [searchQuery]);

  const searchActiveLoans = async () => {
    setSearchingLoans(true);
    try {
      const res = await fetch(`/api/loans/active?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setActiveLoans(data);
      }
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setSearchingLoans(false);
    }
  };

  const handleScan = async (isbn: string) => {
    if (scannedBooks.some(b => b.isbn === isbn)) return;
    
    setScanning(false);
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/books/${isbn}`);
      if (res.ok) {
        const book = await res.json();
        setScannedBooks(prev => [...prev, book]);
      } else {
        setError(`Book with ISBN ${isbn} not found in library.`);
      }
    } catch (err) {
      setError('Failed to fetch book details.');
    } finally {
      setLoading(false);
    }
  };

  const removeBook = (isbn: string) => {
    setScannedBooks(prev => prev.filter(b => b.isbn !== isbn));
  };

  const handleReturn = async () => {
    if (!scannedBooks.length) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbns: scannedBooks.map(b => b.isbn)
        })
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setScannedBooks([]);
      } else {
        setError(data.error || 'Failed to return books.');
      }
    } catch (err) {
      setError('An error occurred while returning.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center py-12 bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Books Returned!</h2>
        <p className="text-slate-500 mb-8">Thank you for returning the books.</p>
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => setSuccess(false)}
            className="w-full bg-[#1a202c] text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-sm"
          >
            Return More Books
          </button>
          <Link 
            to="/"
            className="w-full bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm inline-block"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#1a202c]">Return Books</h2>
        <p className="text-slate-500 text-sm">Scan barcodes or search for active loans</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search borrower or book..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-white transition-all shadow-sm"
          />
          {searchingLoans && (
            <div className="absolute right-3 top-3.5">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-400"></div>
            </div>
          )}
          
          {activeLoans.length > 0 && (
            <div className="absolute z-20 w-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden max-h-60 overflow-y-auto">
              {activeLoans.map((loan) => (
                <button
                  key={loan.id}
                  onClick={() => {
                    handleScan(loan.isbn);
                    setSearchQuery('');
                    setActiveLoans([]);
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-50 last:border-0 flex items-center gap-3 transition-colors"
                >
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{loan.title}</p>
                    <p className="text-xs text-slate-500 truncate">Borrowed by {loan.user_name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">Due: {new Date(loan.due_date).toLocaleDateString('en-AU')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Hash className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Manual ISBN..."
              value={manualIsbn}
              onChange={(e) => setManualIsbn(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && manualIsbn && handleScan(manualIsbn)}
              className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-white transition-all shadow-sm"
            />
          </div>
          <button
            onClick={() => {
              if (manualIsbn) {
                handleScan(manualIsbn);
                setManualIsbn('');
              }
            }}
            className="bg-[#1a202c] text-white px-6 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-sm"
          >
            Add
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 text-rose-600 p-4 rounded-xl text-sm font-medium border border-rose-100">
          {error}
        </div>
      )}

      {scanning ? (
        <div className="bg-slate-900 p-4 rounded-3xl shadow-xl relative">
          <button 
            onClick={() => setScanning(false)}
            className="absolute top-6 right-6 z-10 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur-md transition-colors"
          >
            Cancel
          </button>
          <Scanner onScan={handleScan} />
          <p className="text-center text-white/70 text-sm mt-4">Point camera at ISBN barcode</p>
        </div>
      ) : (
        <button 
          onClick={() => setScanning(true)}
          className="w-full bg-white border-2 border-dashed border-slate-300 text-slate-600 py-12 rounded-3xl hover:border-[#1a202c] hover:text-[#1a202c] transition-colors flex flex-col items-center justify-center gap-3 group"
        >
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center group-hover:bg-slate-100 transition-colors">
            <ScanLine className="w-8 h-8" />
          </div>
          <span className="font-medium text-lg">Tap to Scan Barcode</span>
        </button>
      )}

      {scannedBooks.length > 0 && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-900">Books to Return ({scannedBooks.length})</h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {scannedBooks.map((book, idx) => (
              <li key={idx} className="p-4 flex justify-between items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{book.title}</p>
                  <p className="text-sm text-slate-500 truncate">{book.author}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-1">{book.isbn}</p>
                </div>
                <button 
                  onClick={() => removeBook(book.isbn)}
                  className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </li>
            ))}
          </ul>
          
          <div className="p-6 bg-slate-50 border-t border-slate-100">
            <button 
              onClick={handleReturn}
              disabled={loading}
              className="w-full bg-[#1a202c] text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                `Confirm Return (${scannedBooks.length} books)`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
