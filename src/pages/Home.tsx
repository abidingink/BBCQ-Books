import { useState, useEffect } from 'react';
import { Search, Book as BookIcon, ScanLine, ArrowLeftRight, X, ExternalLink, ShoppingCart, LayoutGrid, List, Edit2, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

interface Book {
  id: number;
  isbn: string;
  title: string;
  author: string;
  description: string | null;
  cover_url: string | null;
  total_copies: number;
  available_copies: number;
  status: string;
  category: string | null;
  shelf_number: string | null;
  featured: boolean;
  book_code: string | null;
  next_due_date: string | null;
}

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<string>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'borrowed'>('all');

  const [isAdmin, setIsAdmin] = useState(false);

  const fetchBooks = () => {
    setLoading(true);
    fetch('/api/books')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setBooks(data);
        } else {
          console.error("Expected array of books, got:", data);
          setBooks([]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setBooks([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    setIsAdmin(localStorage.getItem('admin_logged_in') === 'true');
    fetchBooks();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this book? This action cannot be undone.')) return;
    
    try {
      const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedBook(null);
        fetchBooks();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete book');
      }
    } catch (err) {
      alert('An error occurred while deleting');
    }
  };

  const getBookFinderUrl = (book: Book) => {
    const isbn = book.isbn.replace(/[-\s]/g, '');
    const author = encodeURIComponent(book.author || '');
    const title = encodeURIComponent(book.title);
    return `https://www.bookfinder.com/isbn/${isbn}/?author=${author}&title=${title}&currency=USD&destination=US&mode=BASIC&lang=en&st=sr&ac=qr`;
  };

  const filteredBooks = books
    .filter(book => 
      book.status !== 'archived' && (
        book.title.toLowerCase().includes(search.toLowerCase()) ||
        (book.author && book.author.toLowerCase().includes(search.toLowerCase())) ||
        book.isbn.includes(search)
      )
    )
    .filter(book => {
      if (filterCategory === 'All') return true;
      if (!book.category) return false;
      const cats = book.category.split(',').map(c => c.trim());
      return cats.includes(filterCategory);
    })
    .filter(book => {
      if (filterStatus === 'all') return true;
      if (filterStatus === 'available') return book.status === 'available' && book.available_copies > 0;
      if (filterStatus === 'borrowed') return book.available_copies < book.total_copies;
      return true;
    })
    .sort((a, b) => {
      const aValue = (a as any)[sortBy] || '';
      const bValue = (b as any)[sortBy] || '';
      
      if (sortBy === 'newest') {
        return sortOrder === 'asc' ? a.id - b.id : b.id - a.id;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' 
          ? aValue.localeCompare(bValue) 
          : bValue.localeCompare(aValue);
      }
      
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const uniqueCategories = [...new Set(books.flatMap(b => b.category ? b.category.split(',').map(c => c.trim()) : []).filter(Boolean))].sort();
  const categories = ['All', ...uniqueCategories];

  const toggleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  };

  const SortIndicator = ({ column }: { column: string }) => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />;
  };

  const featuredBooks = books.filter(b => b.featured && b.status !== 'archived');

  return (
    <div className="space-y-8">
      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-0">
        <Link 
          to="/borrow" 
          className="group relative overflow-hidden bg-[#1a202c] text-white p-6 rounded-3xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
        >
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ScanLine className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Borrow Books</h3>
              <p className="text-white/60 text-sm">Scan ISBN to borrow</p>
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors"></div>
        </Link>

        <Link 
          to="/return" 
          className="group relative overflow-hidden bg-white text-[#1a202c] p-6 rounded-3xl shadow-lg border border-slate-100 hover:shadow-xl transition-all hover:-translate-y-1"
        >
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Return Books</h3>
              <p className="text-slate-500 text-sm">Return borrowed items</p>
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-slate-100/50 rounded-full blur-2xl group-hover:bg-slate-200/50 transition-colors"></div>
        </Link>
      </div>

      {featuredBooks.length > 0 && !search && filterCategory === 'All' && filterStatus === 'all' && (
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-[#1a202c]">Featured Books</h2>
              <p className="text-slate-500 text-sm">Handpicked recommendations for you</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {featuredBooks.map(book => (
              <div 
                key={`featured-${book.id}`}
                onClick={() => setSelectedBook(book)}
                className="group bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer flex flex-col"
              >
                <div className="aspect-[2/3] bg-slate-100 relative overflow-hidden">
                  {book.cover_url ? (
                    <img 
                      src={book.cover_url} 
                      alt={book.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <BookIcon className="w-12 h-12" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex flex-col gap-1">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md ${
                      book.available_copies > 0 
                        ? 'bg-emerald-500/90 text-white' 
                        : 'bg-amber-500/90 text-white'
                    }`}>
                      {book.available_copies > 0 ? 'Available' : 'Borrowed'}
                    </span>
                    {book.shelf_number && (
                      <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md bg-slate-900/90 text-white">
                        Shelf {book.shelf_number}
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-bold text-slate-900 line-clamp-2 mb-1 group-hover:text-blue-600 transition-colors">{book.title}</h3>
                  <p className="text-sm text-slate-500 line-clamp-1 mb-3">{book.author}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 pt-4 border-t border-slate-100">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#1a202c]">Library Catalogue</h2>
            <p className="text-slate-500 text-sm">Browse our collection of books</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Search title, author, or ISBN..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-white text-sm"
              />
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-[#1a202c]' : 'text-slate-400 hover:text-slate-600'}`}
                title="Grid View"
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-[#1a202c]' : 'text-slate-400 hover:text-slate-600'}`}
                title="List View"
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Category</label>
            <select 
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a202c] appearance-none"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Status</label>
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a202c] appearance-none"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available Now</option>
              <option value="borrowed">Currently Borrowed</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Sort By</label>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a202c] appearance-none"
            >
              <option value="title">Title (A-Z)</option>
              <option value="author">Author (A-Z)</option>
              <option value="newest">Recently Added</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a202c]"></div>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <BookIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-900">No books found</h3>
          <p className="text-slate-500">Try adjusting your search terms</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {filteredBooks.map(book => (
            <div 
              key={book.id} 
              onClick={() => setSelectedBook(book)}
              className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="aspect-[2/3] bg-slate-100 relative flex items-center justify-center p-4">
                {book.cover_url ? (
                  <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover rounded-md shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <BookIcon className="w-16 h-16 text-slate-300" />
                )}
                {((book.status === 'available' && book.available_copies <= 0) || book.status === 'unavailable') && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex items-center justify-center p-4 text-center">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-widest bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100">
                      {book.status === 'available' && book.available_copies <= 0 ? 'Borrowed' : 'Unavailable'}
                    </span>
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-slate-900 line-clamp-2 leading-tight mb-1">{book.title}</h3>
                <p className="text-sm text-slate-500 line-clamp-1 mb-2">{book.author || 'Unknown Author'}</p>
                <div className="mt-auto pt-2 border-t border-slate-50 flex justify-between items-center">
                  <p className="text-[10px] text-slate-400 font-mono">ISBN: {book.isbn}</p>
                  {book.shelf_number && (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                      Shelf {book.shelf_number}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[9px] uppercase tracking-widest text-slate-400 font-bold">
                  <th className="px-3 py-2 cursor-pointer hover:text-slate-600" onClick={() => toggleSort('title')}>
                    Book <SortIndicator column="title" />
                  </th>
                  <th className="px-3 py-2 cursor-pointer hover:text-slate-600" onClick={() => toggleSort('author')}>
                    Author <SortIndicator column="author" />
                  </th>
                  <th className="px-3 py-2 cursor-pointer hover:text-slate-600" onClick={() => toggleSort('category')}>
                    Category <SortIndicator column="category" />
                  </th>
                  <th className="px-3 py-2 cursor-pointer hover:text-slate-600" onClick={() => toggleSort('shelf_number')}>
                    Location <SortIndicator column="shelf_number" />
                  </th>
                  <th className="px-3 py-2 cursor-pointer hover:text-slate-600" onClick={() => toggleSort('status')}>
                    Status <SortIndicator column="status" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredBooks.map(book => (
                  <tr 
                    key={book.id} 
                    onClick={() => setSelectedBook(book)}
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-10 bg-slate-100 rounded overflow-hidden flex-shrink-0 relative flex items-center justify-center">
                          {book.cover_url ? (
                            <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <BookIcon className="w-3 h-3 text-slate-300" />
                          )}
                          {((book.status === 'available' && book.available_copies <= 0) || book.status === 'unavailable') && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate leading-tight max-w-[150px]">{book.title.length > 30 ? `${book.title.substring(0, 30)}...` : book.title}</p>
                          <p className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">ISBN: {book.isbn}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs text-slate-600 truncate max-w-[120px]">{book.author || 'Unknown'}</p>
                    </td>
                    <td className="px-3 py-2">
                      {book.category ? (
                        <div className="flex flex-wrap gap-0.5">
                          {book.category.split(',').slice(0, 2).map((cat, i) => cat.trim() && (
                            <span key={i} className="text-[9px] text-slate-500 font-bold uppercase tracking-wider bg-slate-100 px-1 py-0.5 rounded-sm truncate max-w-[80px]">
                              {cat.trim()}
                            </span>
                          ))}
                          {book.category.split(',').length > 2 && (
                            <span className="text-[9px] text-slate-400">...</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {book.shelf_number ? (
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">{book.shelf_number}</p>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        {book.status !== 'available' ? (
                          <span className={`inline-flex px-1.5 py-0 rounded-full text-[9px] font-bold uppercase tracking-wider w-fit ${
                            book.status === 'unavailable' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {book.status}
                          </span>
                        ) : book.available_copies <= 0 ? (
                          <span className="inline-flex px-1.5 py-0 rounded-full text-[9px] font-bold uppercase tracking-wider w-fit bg-rose-50 text-rose-700">
                            Borrowed
                          </span>
                        ) : (
                          <span className="inline-flex px-1.5 py-0 rounded-full text-[9px] font-bold uppercase tracking-wider w-fit bg-emerald-50 text-emerald-700">
                            Available
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Book Details Modal */}
      <AnimatePresence>
        {selectedBook && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBook(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <button 
                onClick={() => setSelectedBook(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-white/80 hover:bg-white rounded-full shadow-sm border border-slate-100 transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>

              <div className="overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 p-6 md:p-8">
                  <div className="md:col-span-2">
                    <div className="aspect-[3/4] bg-slate-50 rounded-2xl overflow-hidden shadow-md border border-slate-100 flex items-center justify-center">
                      {selectedBook.cover_url ? (
                        <img 
                          src={selectedBook.cover_url} 
                          alt={selectedBook.title} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <BookIcon className="w-20 h-20 text-slate-200" />
                      )}
                    </div>
                  </div>
                  
                  <div className="md:col-span-3 flex flex-col">
                    <div className="mb-4">
                      <h2 className="text-2xl font-bold text-slate-900 leading-tight mb-1">{selectedBook.title}</h2>
                      <p className="text-lg text-slate-500 font-medium">{selectedBook.author || 'Unknown Author'}</p>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-6">
                      <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-mono">
                        ISBN: {selectedBook.isbn}
                      </span>
                      {selectedBook.status !== 'available' ? (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          selectedBook.status === 'unavailable' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {selectedBook.status.charAt(0).toUpperCase() + selectedBook.status.slice(1)}
                        </span>
                      ) : selectedBook.available_copies <= 0 ? (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700">
                          Borrowed
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
                          Available {selectedBook.available_copies < selectedBook.total_copies && `(${selectedBook.available_copies}/${selectedBook.total_copies})`}
                        </span>
                      )}
                    </div>

                    {(selectedBook.category || selectedBook.shelf_number) && (
                      <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        {selectedBook.category && (
                          <div>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Categories</h4>
                            <div className="flex flex-wrap gap-1">
                              {selectedBook.category.split(',').map((cat, i) => cat.trim() && (
                                <span key={i} className="text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded-md border border-slate-200">
                                  {cat.trim()}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {selectedBook.shelf_number && (
                          <div>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Location</h4>
                            <p className="text-sm font-bold text-slate-700">Shelf {selectedBook.shelf_number}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedBook.description && (
                      <div className="mb-8">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">About this book</h4>
                        <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                          {selectedBook.description}
                        </p>
                      </div>
                    )}

                    <div className="mt-auto space-y-3">
                      {isAdmin && (
                        <div className="space-y-3">
                          <Link 
                            to={`/admin?edit=${selectedBook.isbn}`}
                            className="w-full flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 py-3 rounded-xl font-bold transition-colors text-sm border border-amber-100"
                          >
                            <Edit2 className="w-4 h-4" />
                            Edit Book Details (Admin)
                          </Link>
                          <button
                            onClick={() => handleDelete(selectedBook.id)}
                            className="w-full flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 py-3 rounded-xl font-bold transition-colors text-sm border border-rose-100"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete Book (Admin)
                          </button>
                        </div>
                      )}

                      <a 
                        href={getBookFinderUrl(selectedBook)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold transition-colors text-sm"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Find a copy on BookFinder
                        <ExternalLink className="w-3 h-3 opacity-50" />
                      </a>
                      
                      {selectedBook.status === 'available' && selectedBook.available_copies > 0 && (
                        <Link 
                          to={`/borrow?isbn=${selectedBook.isbn}`}
                          className="w-full flex items-center justify-center gap-2 bg-[#1a202c] hover:bg-slate-800 text-white py-3 rounded-xl font-bold transition-colors text-sm"
                        >
                          <ScanLine className="w-4 h-4" />
                          Borrow this book
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
