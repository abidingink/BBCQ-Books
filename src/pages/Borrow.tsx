import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Scanner from '../components/Scanner';
import BookSearch from '../components/BookSearch';
import CoverScanner from '../components/CoverScanner';
import { ScanLine, Trash2, CheckCircle2, User, Phone, CalendarClock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ScannedBook {
  isbn: string;
  title: string;
  author: string;
}

export default function Borrow() {
  const [scanning, setScanning] = useState(false);
  const [scannedBooks, setScannedBooks] = useState<ScannedBook[]>([]);
  const [name, setName] = useState(() => localStorage.getItem('library_user_name') || '');
  const [phone, setPhone] = useState(() => localStorage.getItem('library_user_phone') || '');
  const [email, setEmail] = useState(() => localStorage.getItem('library_user_email') || '');
  const [weeks, setWeeks] = useState(2);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchParams] = useSearchParams();
  const addedIsbnsRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    const isbnParam = searchParams.get('isbn');
    if (isbnParam && !addedIsbnsRef.current.has(isbnParam)) {
      handleScan(isbnParam);
    }
  }, [searchParams]);

  const [isNameFocused, setIsNameFocused] = useState(false);

  useEffect(() => {
    if (name.length >= 2) {
      const timer = setTimeout(() => {
        fetch(`/api/members?q=${encodeURIComponent(name)}`)
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data)) {
              setSuggestions(data);
              if (isNameFocused) {
                setShowSuggestions(data.length > 0);
              }
            } else {
              setSuggestions([]);
              setShowSuggestions(false);
            }
          })
          .catch(err => {
            console.error(err);
            setSuggestions([]);
            setShowSuggestions(false);
          });
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [name, isNameFocused]);

  const selectMember = (member: any) => {
    setName(member.full_name);
    setPhone(member.phone);
    setEmail(member.email);
    setShowSuggestions(false);
  };

  const handleScan = async (isbn: string) => {
    if (addedIsbnsRef.current.has(isbn)) return;
    
    addedIsbnsRef.current.add(isbn);
    setScanning(false);
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/books/${isbn}`);
      if (res.ok) {
        const book = await res.json();
        if (book.status !== 'available') {
          setError(`Book "${book.title}" is currently marked as ${book.status}.`);
          addedIsbnsRef.current.delete(isbn);
        } else if (book.available_copies <= 0) {
          setError(`All copies of "${book.title}" are currently borrowed.`);
          addedIsbnsRef.current.delete(isbn);
        } else {
          setScannedBooks(prev => [...prev, book]);
        }
      } else {
        setError(`Book with ISBN ${isbn} not found in library.`);
        addedIsbnsRef.current.delete(isbn);
      }
    } catch (err) {
      setError('Failed to fetch book details.');
    } finally {
      setLoading(false);
    }
  };

  const removeBook = (isbn: string) => {
    addedIsbnsRef.current.delete(isbn);
    setScannedBooks(prev => prev.filter(b => b.isbn !== isbn));
  };

  const handleBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedBooks.length || !name || !phone) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/borrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbns: scannedBooks.map(b => b.isbn),
          user_name: name,
          user_phone: phone,
          user_email: email,
          weeks
        })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('library_user_name', name);
        localStorage.setItem('library_user_phone', phone);
        localStorage.setItem('library_user_email', email);
        
        setSuccess(true);
        setScannedBooks([]);
        addedIsbnsRef.current.clear();
        // We don't clear the user details anymore so they are ready for next time
      } else {
        setError(data.error || 'Failed to borrow books.');
      }
    } catch (err) {
      setError('An error occurred while borrowing.');
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
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Books Borrowed!</h2>
        <p className="text-slate-500 mb-8">Thank you for using the library. Please return them on time.</p>
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => setSuccess(false)}
            className="w-full bg-[#1a202c] text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-sm"
          >
            Borrow More Books
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
        <h2 className="text-2xl font-bold text-[#1a202c]">Borrow Books</h2>
        <p className="text-slate-500 text-sm">Scan barcodes to add books to your list</p>
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
        <div className="space-y-4">
          <BookSearch 
            onSelect={(book) => {
              if (!addedIsbnsRef.current.has(book.isbn)) {
                addedIsbnsRef.current.add(book.isbn);
                setScannedBooks(prev => [...prev, book]);
              }
            }}
            filter="available"
          />
          
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setScanning(true)}
              className="w-full bg-white border-2 border-dashed border-slate-300 text-slate-600 py-6 rounded-2xl hover:border-[#1a202c] hover:text-[#1a202c] transition-colors flex flex-col items-center justify-center gap-2 group"
            >
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center group-hover:bg-slate-100 transition-colors">
                <ScanLine className="w-6 h-6" />
              </div>
              <span className="font-medium text-sm">Scan Barcode</span>
            </button>
            
            <CoverScanner 
              mode="match"
              variant="large"
              onResult={(result) => {
                if (result.match && result.book) {
                  const book = result.book;
                  if (book.status !== 'available') {
                    setError(`Book "${book.title}" is currently marked as ${book.status}.`);
                  } else if (book.available_copies <= 0) {
                    setError(`All copies of "${book.title}" are currently borrowed.`);
                  } else if (!addedIsbnsRef.current.has(book.isbn)) {
                    addedIsbnsRef.current.add(book.isbn);
                    setScannedBooks(prev => [...prev, book]);
                    setError('');
                  }
                } else {
                  setError('Could not identify book from cover. Try scanning barcode or searching manually.');
                }
              }}
              onError={(err) => setError(err)}
              className="h-full"
            />
          </div>
        </div>
      )}

      {scannedBooks.length > 0 && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-900">Selected Books ({scannedBooks.length})</h3>
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
        </div>
      )}

      <form onSubmit={handleBorrow} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-5">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
          <h3 className="font-bold text-slate-900">Your Details</h3>
          <p className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-md">Saved on device</p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input 
                type="text" 
                required
                value={name}
                onChange={e => setName(e.target.value)}
                onFocus={() => {
                  setIsNameFocused(true);
                  if (name.length >= 2 && suggestions.length > 0) setShowSuggestions(true);
                }}
                onBlur={() => {
                  // Delay hiding suggestions so clicks on them register
                  setTimeout(() => setIsNameFocused(false), 200);
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors"
                placeholder="John Doe"
              />
              
              <AnimatePresence>
                {showSuggestions && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                  >
                    <ul className="divide-y divide-slate-100">
                      {suggestions.map((m, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() => selectMember(m)}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex flex-col"
                          >
                            <span className="font-bold text-slate-900">{m.full_name}</span>
                            <div className="flex gap-3 text-[10px] text-slate-500 font-mono">
                              {m.phone && <span>{m.phone}</span>}
                              {m.email && <span>{m.email}</span>}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address (Optional)</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors"
                placeholder="john@example.com"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input 
                type="tel" 
                required
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors"
                placeholder="0400 000 000"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Borrow Duration</label>
            <div className="relative">
              <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <select 
                value={weeks}
                onChange={e => setWeeks(Number(e.target.value))}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors appearance-none"
              >
                <option value={1}>1 Week</option>
                <option value={2}>2 Weeks</option>
                <option value={3}>3 Weeks</option>
              </select>
            </div>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading || scannedBooks.length === 0}
          className="w-full bg-[#1a202c] text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6 flex justify-center items-center gap-2"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
          ) : (
            `Confirm Borrow (${scannedBooks.length} books)`
          )}
        </button>
      </form>
    </div>
  );
}
