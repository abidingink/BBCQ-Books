import React, { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BookSearchProps {
  onSelect: (book: any) => void;
  placeholder?: string;
  filter?: 'available' | 'borrowed' | 'all';
}

export default function BookSearch({ onSelect, placeholder = "Search by title, ISBN, or book code...", filter = 'all' }: BookSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (query.length >= 2) {
      setIsSearching(true);
      const timer = setTimeout(() => {
        fetch(`/api/books/search?q=${encodeURIComponent(query)}`)
          .then(res => res.json())
          .then(data => {
            let filtered = data;
            if (filter === 'available') {
              filtered = data.filter((b: any) => b.status === 'available' && b.available_copies > 0);
            } else if (filter === 'borrowed') {
              // For borrowed, we might need a different endpoint or just filter here if we have loan info
              // For now, we just return all and let the parent handle it, or filter by available_copies < total_copies
              filtered = data.filter((b: any) => b.available_copies < b.total_copies);
            }
            setResults(filtered);
            setIsSearching(false);
          })
          .catch(() => setIsSearching(false));
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setResults([]);
      setIsSearching(false);
    }
  }, [query, filter]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder={placeholder}
          className="w-full pl-12 pr-12 py-4 bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-slate-900 font-medium placeholder:font-normal"
        />
        {isSearching && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          </div>
        )}
      </div>

      <AnimatePresence>
        {isFocused && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-80 overflow-y-auto"
          >
            <ul className="divide-y divide-slate-100">
              {results.map((book, idx) => (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(book);
                      setQuery('');
                      setResults([]);
                    }}
                    className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex gap-4 items-center"
                  >
                    {book.cover_url ? (
                      <img src={book.cover_url} alt={book.title} className="w-10 h-14 object-cover rounded shadow-sm" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-10 h-14 bg-slate-100 rounded flex items-center justify-center text-slate-400 text-xs text-center p-1">No Cover</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 truncate">{book.title}</p>
                      <p className="text-sm text-slate-500 truncate">{book.author}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">{book.isbn}</span>
                        {book.book_code && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-mono">{book.book_code}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
