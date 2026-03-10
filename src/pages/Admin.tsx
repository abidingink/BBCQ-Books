import React, { useState, useEffect, useRef } from 'react';
import Scanner from '../components/Scanner';
import CoverScanner from '../components/CoverScanner';
import { motion, AnimatePresence } from 'motion/react';
import { augmentBookDataWithAI, augmentSingleFieldWithAI } from '../services/aiService';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell,
  ComposedChart
} from 'recharts';
import { 
  ScanLine, 
  Plus, 
  AlertCircle, 
  LogOut, 
  Edit2, 
  Trash2, 
  Check, 
  X, 
  Book as BookIcon,
  Download,
  Upload,
  ShieldCheck,
  Database,
  Loader2,
  ChevronUp,
  ChevronDown,
  Camera,
  RefreshCw,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { LOGO_URL } from '../constants';
// @ts-ignore
import Barcode from 'react-barcode';

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
}

interface Loan {
  id: number;
  book_id: number;
  user_name: string;
  user_phone: string;
  borrow_date: string;
  due_date: string;
  original_due_date: string;
  return_date: string | null;
  title: string;
  isbn: string;
  is_overdue: number;
}

export default function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('admin_logged_in') === 'true';
  });
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const [activeTab, setActiveTab] = useState<'loans' | 'add' | 'catalogue' | 'backup' | 'settings' | 'directory' | 'messages' | 'analytics'>('loans');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [settings, setSettings] = useState<{ key: string, value: string }[]>([]);
  const [showReturnedLoans, setShowReturnedLoans] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdatingField, setIsUpdatingField] = useState<{[key: string]: boolean}>({});
  
  const handleUpdateField = async (field: string) => {
    setIsUpdatingField(prev => ({ ...prev, [field]: true }));
    try {
      const bookData = { title, author, description, category, cover_url: coverUrl };
      const newValue = await augmentSingleFieldWithAI(field, bookData);
      if (newValue) {
        if (field === 'title') setTitle(newValue);
        else if (field === 'author') setAuthor(newValue);
        else if (field === 'description') setDescription(newValue);
        else if (field === 'category') setCategory(newValue);
        else if (field === 'cover_url') setCoverUrl(newValue);
      }
    } catch (e) {
      console.error('Field update failed', e);
    } finally {
      setIsUpdatingField(prev => ({ ...prev, [field]: false }));
    }
  };
  
  // Add/Edit Book State
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [scanning, setScanning] = useState(false);
  const [isbn, setIsbn] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [copies, setCopies] = useState(1);
  const [status, setStatus] = useState('available');
  const [category, setCategory] = useState('');
  const [shelfNumber, setShelfNumber] = useState('');
  const [bookCode, setBookCode] = useState('');
  const [featured, setFeatured] = useState(false);
  const [addMessage, setAddMessage] = useState({ type: '', text: '' });
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastAddedBook, setLastAddedBook] = useState<{title: string, cover: string} | null>(null);
  const [generatedBarcode, setGeneratedBarcode] = useState<string | null>(null);
  const lastFetchedIsbn = useRef<string>('');
  const lastSuccessfulIsbn = useRef<string | null>(null);
  const isProcessingScan = useRef<boolean>(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const [sortConfig, setSortConfig] = useState<{
    tab: string;
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const handleSort = (tab: string, key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.tab === tab && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ tab, key, direction });
  };

  const getSortedData = (data: any[], tab: string) => {
    if (!sortConfig || sortConfig.tab !== tab) {
      if (tab === 'loans') {
        return [...data].sort((a, b) => {
          const aValue = a.due_date || '';
          const bValue = b.due_date || '';
          return aValue < bValue ? -1 : (aValue > bValue ? 1 : 0);
        });
      }
      if (tab === 'messages') {
        return [...data].sort((a, b) => {
          if (a.status === 'Queued' && b.status !== 'Queued') return -1;
          if (a.status !== 'Queued' && b.status === 'Queued') return 1;
          const aTime = a.scheduledTime || '';
          const bTime = b.scheduledTime || '';
          return aTime < bTime ? -1 : (aTime > bTime ? 1 : 0);
        });
      }
      return data;
    }
    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.key] === null ? '' : a[sortConfig.key];
      const bValue = b[sortConfig.key] === null ? '' : b[sortConfig.key];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc' 
          ? aValue.localeCompare(bValue) 
          : bValue.localeCompare(aValue);
      }
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const SortIndicator = ({ tab, column }: { tab: string, column: string }) => {
    if (!sortConfig || sortConfig.tab !== tab) {
      if (tab === 'loans' && column === 'due_date') return <ChevronUp className="w-3 h-3 inline ml-1 text-slate-400" />;
      if (tab === 'messages' && column === 'scheduledTime') return <ChevronUp className="w-3 h-3 inline ml-1 text-slate-400" />;
      return null;
    }
    if (sortConfig.key !== column) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />;
  };

  useEffect(() => {
    const editIsbn = searchParams.get('edit');
    if (editIsbn && isLoggedIn && books.length > 0) {
      const bookToEdit = books.find(b => b.isbn === editIsbn);
      if (bookToEdit) {
        setEditingBook(bookToEdit);
        const cleanIsbn = bookToEdit.isbn.trim().replace(/[-\s]/g, '');
        setIsbn(bookToEdit.isbn);
        lastFetchedIsbn.current = cleanIsbn;
        lastSuccessfulIsbn.current = cleanIsbn;
        
        setTitle(bookToEdit.title);
        setAuthor(bookToEdit.author || '');
        setDescription(bookToEdit.description || '');
        setCoverUrl(bookToEdit.cover_url || '');
        setCopies(bookToEdit.total_copies);
        setStatus(bookToEdit.status);
        setCategory(bookToEdit.category || '');
        setShelfNumber(bookToEdit.shelf_number || '');
        setBookCode(bookToEdit.book_code || '');
        if (bookToEdit.isbn.startsWith('LIB-')) {
          setGeneratedBarcode(bookToEdit.isbn);
        } else {
          setGeneratedBarcode(null);
        }
        setActiveTab('add');
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, isLoggedIn, books]);

  const [backupError, setBackupError] = useState(false);
  const [showBackupWarning, setShowBackupWarning] = useState(false);

  const [analyticsDays, setAnalyticsDays] = useState(30);

  useEffect(() => {
    if (isLoggedIn) {
      fetchLoans();
      fetchBooks();
      fetchSettings();
      fetchMembers();
      fetchMessages();
      fetchAnalytics(analyticsDays);
    }
  }, [isLoggedIn]);

  const fetchAnalytics = async (days: number = analyticsDays) => {
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`);
      const data = await res.json();
      if (data && data.stats) {
        setAnalytics(data);
      } else {
        console.error("Expected analytics data, got:", data);
        setAnalytics(null);
      }
    } catch (err) {
      console.error('Failed to fetch analytics', err);
      setAnalytics(null);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchAnalytics(analyticsDays);
    }
  }, [analyticsDays]);

  const fetchMessages = async () => {
    try {
      const res = await fetch('/api/messages');
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
      } else {
        console.error("Expected array of messages, got:", data);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to fetch messages', err);
      setMessages([]);
    }
  };

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/members/all');
      const data = await res.json();
      if (Array.isArray(data)) {
        setMembers(data);
      } else {
        console.error("Expected array of members, got:", data);
        setMembers([]);
      }
    } catch (err) {
      console.error('Failed to fetch members', err);
      setMembers([]);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      
      if (data && Array.isArray(data.settings)) {
        setSettings(data.settings);
        setGoogleConnected(data.googleConnected);
        setRefreshToken(data.refreshToken);

        // Check last backup date
        const lastBackup = data.settings.find((s: any) => s.key === 'last_drive_backup')?.value;
        if (!lastBackup) {
          setShowBackupWarning(true);
        } else {
          const daysSinceBackup = (new Date().getTime() - new Date(lastBackup).getTime()) / (1000 * 3600 * 24);
          setShowBackupWarning(daysSinceBackup > 30);
        }
      } else {
        console.error("Expected settings array, got:", data);
        setSettings([]);
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
      setSettings([]);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchSettings();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectGoogle = async () => {
    try {
      window.dispatchEvent(new CustomEvent('force_drive_sync'));
      setTimeout(() => fetchSettings(), 3000);
    } catch (err) {
      alert('Failed to start Google connection');
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm('Are you sure you want to disconnect your Google Account? This will stop automated backups and directory syncing.')) return;
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: [{ key: 'google_oauth_tokens', value: '' }] })
      });
      if (res.ok) {
        alert('Google Account disconnected successfully.');
        await fetchSettings();
      } else {
        alert('Failed to disconnect Google Account.');
      }
    } catch (err) {
      alert('Failed to disconnect Google Account.');
    }
  };

  const handleDriveBackup = async () => {
    if (!confirm('This will overwrite the existing "library_backup.json" in your Google Drive. Continue?')) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/admin/backup/drive', { method: 'POST' });
      if (res.ok) {
        alert('Backup to Google Drive completed successfully!');
        await fetchSettings(); // Refresh immediately
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to initiate backup. Ensure Google Account is connected.');
      }
    } catch (err) {
      alert('Error initiating backup');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });
      if (res.ok) {
        alert('Settings updated successfully!');
      } else {
        alert('Failed to update settings');
      }
    } catch (err) {
      alert('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchBooks = async () => {
    try {
      const res = await fetch('/api/books');
      const data = await res.json();
      if (Array.isArray(data)) {
        setBooks(data);
      } else {
        console.error("Expected array of books, got:", data);
        setBooks([]);
      }
    } catch (err) {
      console.error('Failed to fetch books', err);
      setBooks([]);
    }
  };

  // Automatic lookup when ISBN is entered manually (10 or 13 digits)
  useEffect(() => {
    const cleanIsbn = isbn.trim().replace(/[-\s]/g, '');
    // Only auto-lookup if it looks like a valid ISBN and we aren't already loading/searching/scanning
    // AND we are not editing an existing book (to prevent overwriting manual changes)
    if (!editingBook && (cleanIsbn.length === 10 || cleanIsbn.length === 13) && !loading && !isSearching && !scanning && isbn !== '' && cleanIsbn !== lastFetchedIsbn.current) {
      const timer = setTimeout(() => {
        // Final check before calling to ensure state hasn't changed
        if (!isSearching && !loading && !scanning) {
          fetchBookDetails(cleanIsbn);
        }
      }, 800); // Slightly longer debounce for stability
      return () => clearTimeout(timer);
    }
  }, [isbn, scanning, loading, isSearching, editingBook]);

  const fetchLoans = async () => {
    try {
      const res = await fetch('/api/loans');
      const data = await res.json();
      if (Array.isArray(data)) {
        setLoans(data);
      } else {
        console.error("Expected array of loans, got:", data);
        setLoans([]);
      }
    } catch (err) {
      console.error('Failed to fetch loans', err);
      setLoans([]);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        setIsLoggedIn(true);
        localStorage.setItem('admin_logged_in', 'true');
        setLoginError('');
      } else {
        setLoginError('Invalid password');
      }
    } catch (err) {
      setLoginError('Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (scannedIsbn: string, fallbackData?: any) => {
    if (isProcessingScan.current) return;

    const clean = scannedIsbn.trim().replace(/[-\s]/g, '');
    
    // Validate ISBN format (10 or 13 digits) or internal LIB code
    const isValidFormat = ((clean.length === 10 || clean.length === 13) && /^\d+$/.test(clean)) || clean.startsWith('LIB-');
    
    if (!isValidFormat) return;

    // Immediately stop scanning to prevent loops
    setScanning(false);
    isProcessingScan.current = true;
    
    // Play beep sound
    new Audio('/beep.mp3').play().catch(() => {});
    
    // Only clear fields if it's a truly different book than what we have
    if (clean !== lastSuccessfulIsbn.current) {
      setTitle('');
      setAuthor('');
      setDescription('');
      setCoverUrl('');
      setGeneratedBarcode(null);
    }
    
    setIsbn(clean);
    // Use force=true to ensure it fetches even if it was the last one
    await fetchBookDetails(clean, true, fallbackData);

    setTimeout(() => {
      isProcessingScan.current = false;
    }, 2000);
  };

  const fetchBookDetails = async (targetIsbn: string, force = false, fallbackData?: any) => {
    const clean = targetIsbn.trim().replace(/[-\s]/g, '');
    if (!clean) return;
    
    // If not forced, don't re-fetch the same ISBN we just tried or are currently trying
    if (!force && clean === lastFetchedIsbn.current) return;
    
    setIsSearching(true);
    lastFetchedIsbn.current = clean;
    
    setAddMessage({ type: 'info', text: 'Searching for book details...' });

    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`);
      
      if (res.ok) {
        const data = await res.json();
        const item = data.items?.[0]?.volumeInfo;
        
        if (item) {
          const bookData = {
            title: item.title || '',
            author: item.authors?.join(', ') || '',
            description: item.description || '',
            cover_url: item.imageLinks?.thumbnail?.replace('http:', 'https:') || '',
            category: item.categories?.join(', ') || ''
          };

          // Update UI with API data immediately
          const mergedData = {
            ...bookData,
            title: bookData.title || fallbackData?.title || '',
            author: bookData.author || fallbackData?.author || '',
            description: bookData.description || fallbackData?.description || '',
            cover_url: bookData.cover_url || fallbackData?.cover_url || '',
            category: bookData.category || fallbackData?.category || '',
          };
          
          setTitle(mergedData.title);
          setAuthor(mergedData.author);
          setDescription(mergedData.description);
          setCoverUrl(mergedData.cover_url);
          setCategory(mergedData.category);
          
          setAddMessage({ type: 'info', text: 'Fetching additional details with AI...' });
          
          // Augment with AI only if data is missing
          const augmentedData = await augmentBookDataWithAI(clean, mergedData);
          
          // Update UI with AI data, using a functional update to maintain previous state if AI returns nothing
          setTitle(prev => augmentedData.title || prev);
          setAuthor(prev => augmentedData.author || prev);
          setDescription(prev => augmentedData.description || prev);
          setCoverUrl(prev => augmentedData.cover_url || prev);
          setCategory(prev => augmentedData.category || prev);
          
          lastSuccessfulIsbn.current = clean;
          setAddMessage({ type: 'success', text: 'Book details found!' });
        } else {
          throw new Error('Not found');
        }
      } else {
        throw new Error('API Error');
      }
    } catch (err) {
      if (fallbackData && (fallbackData.title || fallbackData.author)) {
          setTitle(fallbackData.title || '');
          setAuthor(fallbackData.author || '');
          setDescription(fallbackData.description || '');
          setCategory(fallbackData.category || '');
          setCoverUrl(fallbackData.cover_url || '');
          setAddMessage({ type: 'success', text: 'Used extracted details from cover.' });
        } else {
          // If 404 or other error
          setAddMessage({ type: 'error', text: 'Could not find book details. Please enter manually.' });
          // Don't clear fields, user might want to keep what they typed if they were editing
          if (!editingBook) {
             setTitle('');
             setAuthor('');
             setDescription('');
             setCoverUrl('');
          }
        }
    } finally {
      setIsSearching(false);
    }
  };

  const handleGenerateBarcode = () => {
    const newBarcode = `LIB-${Date.now()}`;
    setIsbn(newBarcode);
    setGeneratedBarcode(newBarcode);
    setTitle('');
    setAuthor('');
    setDescription('');
    setCoverUrl('');
    setAddMessage({ type: 'success', text: 'Generated unique library barcode.' });
  };

  const handlePrintBarcode = () => {
    if (!generatedBarcode) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print Barcode</title>
            <style>
              body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .barcode-container { text-align: center; }
            </style>
          </head>
          <body>
            <div class="barcode-container">
              <svg id="barcode"></svg>
            </div>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
            <script>
              JsBarcode("#barcode", "${generatedBarcode}", {
                format: "CODE128",
                width: 2,
                height: 100,
                displayValue: true
              });
              window.onload = function() { window.print(); window.close(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAddMessage({ type: '', text: '' });

    const url = editingBook ? `/api/books/${editingBook.id}` : '/api/books';
    const method = editingBook ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbn,
          title,
          author,
          description,
          cover_url: coverUrl,
          total_copies: copies,
          status,
          category,
          shelf_number: shelfNumber,
          featured,
          book_code: bookCode
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (!editingBook) {
          setLastAddedBook({ title, cover: coverUrl });
          setShowSuccessModal(true);
          setIsbn('');
          setTitle('');
          setAuthor('');
          setDescription('');
          setCoverUrl('');
          setCopies(1);
          setStatus('available');
          setCategory('');
          setShelfNumber('');
          setBookCode('');
          setFeatured(false);
          lastFetchedIsbn.current = '';
          lastSuccessfulIsbn.current = '';
          if (data.warning) {
            setAddMessage({ type: 'info', text: data.message });
          }
        } else {
          setAddMessage({ type: 'success', text: 'Book updated successfully!' });
          setTimeout(() => {
            setEditingBook(null);
            setActiveTab('catalogue');
            fetchBooks();
          }, 1500);
        }
        fetchBooks();
      } else {
        const data = await res.json();
        setAddMessage({ type: 'error', text: data.error || 'Failed to process book.' });
      }
    } catch (err) {
      setAddMessage({ type: 'error', text: 'An error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (book: Book) => {
    setEditingBook(book);
    const cleanIsbn = book.isbn.trim().replace(/[-\s]/g, '');
    setIsbn(book.isbn);
    lastFetchedIsbn.current = cleanIsbn;
    lastSuccessfulIsbn.current = cleanIsbn;
    
    setTitle(book.title);
    setAuthor(book.author || '');
    setDescription(book.description || '');
    setCoverUrl(book.cover_url || '');
    setCopies(book.total_copies);
    setStatus(book.status);
    setCategory(book.category || '');
    setShelfNumber(book.shelf_number || '');
    setBookCode(book.book_code || '');
    setFeatured(book.featured || false);
    setActiveTab('add');
    setAddMessage({ type: '', text: '' });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this book?')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchBooks();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete book');
      }
    } catch (err) {
      alert('An error occurred while deleting');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('admin_logged_in');
  };

  const [editingMessage, setEditingMessage] = useState<any>(null);

  const handleUpdateMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMessage) return;
    
    try {
      const res = await fetch(`/api/messages/${editingMessage.rowIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledTime: editingMessage.scheduledTime,
          message: editingMessage.message,
          status: editingMessage.status
        })
      });
      if (res.ok) {
        setEditingMessage(null);
        fetchMessages();
      } else {
        alert('Failed to update message');
      }
    } catch (err) {
      alert('An error occurred');
    }
  };

  const handleCancelMessage = async (rowIndex: number) => {
    if (!confirm('Are you sure you want to cancel this message?')) return;
    try {
      const res = await fetch(`/api/messages/${rowIndex}`, { method: 'DELETE' });
      if (res.ok) {
        fetchMessages();
      } else {
        alert('Failed to cancel message');
      }
    } catch (err) {
      alert('An error occurred');
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const res = await fetch('/api/admin/backup');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `library_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download backup');
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('WARNING: Restoring a backup will overwrite ALL current data. This cannot be undone. Are you sure?')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = JSON.parse(event.target?.result as string);
        const res = await fetch('/api/admin/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(content)
        });

        if (res.ok) {
          alert('Database restored successfully!');
          fetchBooks();
          fetchLoans();
        } else {
          const error = await res.json();
          alert(error.error || 'Failed to restore backup');
        }
      } catch (err) {
        alert('Invalid backup file format');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setCoverUrl(dataUrl);
        } else {
          setCoverUrl(reader.result as string);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (!isLoggedIn) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 overflow-hidden shadow-sm border border-slate-100">
            <img src={LOGO_URL} alt="Logo" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-2xl font-bold text-center text-[#1a202c] mb-2">Admin Login</h2>
          <p className="text-center text-slate-500 mb-8">Enter the librarian password to access</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors text-center text-lg"
              />
            </div>
            {loginError && <p className="text-rose-500 text-sm text-center font-medium">{loginError}</p>}
            <button 
              type="submit" 
              disabled={loading || !password}
              className="w-full bg-[#1a202c] text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1a202c]">Admin Dashboard</h2>
          <p className="text-slate-500 text-sm">Manage library catalogue and loans</p>
        </div>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-medium px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>

      {showBackupWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-amber-800 font-bold text-sm">Backup Required</h3>
            <p className="text-amber-700 text-sm mt-1">
              It has been over 30 days since your last backup. <strong>Please download a backup to prevent data loss.</strong>
              <br />
              Go to the <button onClick={() => setActiveTab('backup')} className="underline font-bold hover:text-amber-900">Backup</button> tab to save your data.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button 
          onClick={() => {
            setActiveTab('add');
            setEditingBook(null);
            setIsbn('');
            setTitle('');
            setAuthor('');
            setDescription('');
            setCoverUrl('');
            setCopies(1);
            setStatus('available');
            setCategory('');
            setShelfNumber('');
            setAddMessage({ type: '', text: '' });
          }}
          className={`p-6 rounded-2xl border-2 transition-all text-left flex items-center gap-4 group ${activeTab === 'add' ? 'border-[#1a202c] bg-slate-50' : 'border-slate-100 bg-white hover:border-slate-200 shadow-sm'}`}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${activeTab === 'add' ? 'bg-[#1a202c] text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
            <Plus className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Add New Book</h3>
            <p className="text-xs text-slate-500">Scan ISBN or enter manually</p>
          </div>
        </button>
      </div>

      <div className="flex overflow-x-auto bg-slate-200/50 p-1 rounded-xl w-full hide-scrollbar">
        <button 
          onClick={() => setActiveTab('loans')}
          className={`flex-1 min-w-max py-2 px-4 rounded-lg font-medium text-sm transition-all ${activeTab === 'loans' ? 'bg-white text-[#1a202c] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Loans
        </button>
        <button 
          onClick={() => setActiveTab('catalogue')}
          className={`flex-1 min-w-max py-2 px-4 rounded-lg font-medium text-sm transition-all ${activeTab === 'catalogue' ? 'bg-white text-[#1a202c] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Catalogue
        </button>
        <button 
          onClick={() => setActiveTab('directory')}
          className={`flex-1 min-w-max py-2 px-4 rounded-lg font-medium text-sm transition-all ${activeTab === 'directory' ? 'bg-white text-[#1a202c] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Directory
        </button>
        <button 
          onClick={() => setActiveTab('backup')}
          className={`flex-1 min-w-max py-2 px-4 rounded-lg font-medium text-sm transition-all ${activeTab === 'backup' ? 'bg-white text-[#1a202c] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Backup
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex-1 min-w-max py-2 px-4 rounded-lg font-medium text-sm transition-all ${activeTab === 'settings' ? 'bg-white text-[#1a202c] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Settings
        </button>
        <button 
          onClick={() => setActiveTab('messages')}
          className={`flex-1 min-w-max py-2 px-4 rounded-lg font-medium text-sm transition-all ${activeTab === 'messages' ? 'bg-white text-[#1a202c] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Messages
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 min-w-max py-2 px-4 rounded-lg font-medium text-sm transition-all ${activeTab === 'analytics' ? 'bg-white text-[#1a202c] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Analytics
        </button>
      </div>

      {activeTab === 'loans' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-slate-900">Library Loans</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm font-medium text-slate-600">Show Returned</span>
              <div className="relative">
                <input 
                  type="checkbox" 
                  className="sr-only" 
                  checked={showReturnedLoans}
                  onChange={(e) => setShowReturnedLoans(e.target.checked)}
                />
                <div className={`block w-10 h-6 rounded-full transition-colors ${showReturnedLoans ? 'bg-[#1a202c]' : 'bg-slate-300'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showReturnedLoans ? 'transform translate-x-4' : ''}`}></div>
              </div>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('loans', 'title')}>
                    Book <SortIndicator tab="loans" column="title" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('loans', 'user_name')}>
                    Borrower <SortIndicator tab="loans" column="user_name" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('loans', 'borrow_date')}>
                    Borrowed <SortIndicator tab="loans" column="borrow_date" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('loans', 'due_date')}>
                    Due Date <SortIndicator tab="loans" column="due_date" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('loans', 'return_date')}>
                    Status <SortIndicator tab="loans" column="return_date" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loans.filter(l => showReturnedLoans || !l.return_date).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">No loans found.</td>
                  </tr>
                ) : (
                  getSortedData(loans.filter(l => showReturnedLoans || !l.return_date), 'loans').map(loan => {
                    const book = books.find(b => b.isbn === loan.isbn);
                    return (
                      <tr key={loan.id} className={`hover:bg-slate-50/50 transition-colors ${book ? 'cursor-pointer' : ''}`} onClick={() => book && handleEdit(book)}>
                        <td className="p-4">
                          <p className="font-bold text-slate-900 line-clamp-1">{loan.title}</p>
                          <p className="text-xs text-slate-400 font-mono">{loan.isbn}</p>
                        </td>
                        <td className="p-4">
                          <p className="font-medium text-slate-900">{loan.user_name}</p>
                          <p className="text-xs text-slate-500">{loan.user_phone}</p>
                        </td>
                        <td className="p-4 text-sm text-slate-600">
                          {new Date(loan.borrow_date).toLocaleDateString('en-AU')}
                        </td>
                        <td className="p-4 text-sm text-slate-600">
                          {loan.original_due_date && new Date(loan.original_due_date).toLocaleDateString('en-AU') !== new Date(loan.due_date).toLocaleDateString('en-AU') ? (
                            <div className="flex flex-col">
                              <span className="line-through text-slate-400 text-xs">{new Date(loan.original_due_date).toLocaleDateString('en-AU')}</span>
                              <span className="font-medium text-emerald-600">{new Date(loan.due_date).toLocaleDateString('en-AU')}</span>
                            </div>
                          ) : (
                            <span>{new Date(loan.due_date).toLocaleDateString('en-AU')}</span>
                          )}
                        </td>
                        <td className="p-4">
                          {loan.return_date ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                              Returned
                            </span>
                          ) : loan.is_overdue ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                              <AlertCircle className="w-3 h-3" />
                              Overdue
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'catalogue' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('catalogue', 'title')}>
                    Book <SortIndicator tab="catalogue" column="title" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('catalogue', 'author')}>
                    Author <SortIndicator tab="catalogue" column="author" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('catalogue', 'shelf_number')}>
                    Location <SortIndicator tab="catalogue" column="shelf_number" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('catalogue', 'total_copies')}>
                    Copies <SortIndicator tab="catalogue" column="total_copies" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('catalogue', 'status')}>
                    Status <SortIndicator tab="catalogue" column="status" />
                  </th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {books.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">No books in catalogue.</td>
                  </tr>
                ) : (
                  getSortedData(books, 'catalogue').map(book => (
                    <tr key={book.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => handleEdit(book)}>
                      <td className="p-4 flex items-center gap-3">
                        <div className="w-10 h-14 bg-slate-100 rounded overflow-hidden flex-shrink-0">
                          {book.cover_url ? (
                            <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <BookIcon className="w-4 h-4 text-slate-300" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 line-clamp-1">{book.title}</p>
                          <p className="text-xs text-slate-400 font-mono">{book.isbn}</p>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600">
                        {book.author || 'Unknown'}
                      </td>
                      <td className="p-4 text-sm text-slate-600">
                        {book.shelf_number ? `Shelf ${book.shelf_number}` : '-'}
                        {book.category && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {book.category.split(',').map((cat, i) => cat.trim() && (
                              <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] uppercase tracking-tight">
                                {cat.trim()}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-sm text-slate-600">
                        {book.total_copies}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          book.status === 'available' && book.available_copies <= 0 ? 'bg-rose-100 text-rose-800' :
                          book.status === 'available' ? 'bg-emerald-100 text-emerald-800' :
                          book.status === 'unavailable' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-800'
                        }`}>
                          {book.status === 'available' && book.available_copies <= 0 ? 'Borrowed' : book.status.charAt(0).toUpperCase() + book.status.slice(1)}
                        </span>
                        {book.status === 'available' && book.available_copies > 0 && book.available_copies < book.total_copies && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            {book.available_copies} of {book.total_copies} available
                          </p>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handleDelete(book.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Book"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'messages' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Scheduled Messages</h3>
              <p className="text-slate-500 text-sm">View and manage automated SMS reminders</p>
            </div>
            <button 
              onClick={fetchMessages}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('messages', 'scheduledTime')}>
                    Scheduled Time <SortIndicator tab="messages" column="scheduledTime" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('messages', 'firstName')}>
                    Recipient <SortIndicator tab="messages" column="firstName" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('messages', 'message')}>
                    Message <SortIndicator tab="messages" column="message" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('messages', 'status')}>
                    Status <SortIndicator tab="messages" column="status" />
                  </th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {messages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">No messages found.</td>
                  </tr>
                ) : (
                  getSortedData(messages, 'messages').map(msg => (
                    <tr key={msg.rowIndex} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-sm font-medium text-slate-900 whitespace-nowrap">
                        {msg.scheduledTime}
                      </td>
                      <td className="p-4">
                        <p className="font-medium text-slate-900">{msg.firstName} {msg.surname}</p>
                        <p className="text-xs text-slate-500">{msg.number}</p>
                      </td>
                      <td className="p-4 text-sm text-slate-600 max-w-xs truncate" title={msg.message}>
                        {msg.message}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          msg.status === 'Queued' ? 'bg-amber-50 text-amber-700' : 
                          msg.status === 'Sent' ? 'bg-emerald-50 text-emerald-700' : 
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {msg.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => setEditingMessage(msg)}
                            className="p-2 text-slate-400 hover:text-[#1a202c] hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit Message"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {msg.status === 'Queued' && (
                            <button 
                              onClick={() => handleCancelMessage(msg.rowIndex)}
                              className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Cancel Message"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'directory' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-800 font-medium">Read-only View</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                This directory is synced from your Google Sheet. To add, edit, or remove members, please make changes directly in the <strong>Google Sheets document</strong> and then click "Sync Directory" in the Settings tab.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('directory', 'full_name')}>
                    Name <SortIndicator tab="directory" column="full_name" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('directory', 'phone')}>
                    Phone <SortIndicator tab="directory" column="phone" />
                  </th>
                  <th className="p-4 font-medium cursor-pointer hover:text-slate-900" onClick={() => handleSort('directory', 'email')}>
                    Email <SortIndicator tab="directory" column="email" />
                  </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-500">No members found. Try syncing from Settings.</td>
                    </tr>
                  ) : (
                    getSortedData(members, 'directory').map((member, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-slate-900">{member.full_name}</p>
                        </td>
                        <td className="p-4 text-sm text-slate-600">
                          {member.phone || '-'}
                        </td>
                        <td className="p-4 text-sm text-slate-600">
                          {member.email || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-8 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Data Protection</h3>
                  <p className="text-slate-500 text-sm">Manage your library's database backups</p>
                </div>
              </div>
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong>Important:</strong> Although this app uses a real backend database, it is stored locally. 
                  Regularly downloading a backup ensures you can restore your library even if the server environment is reset.
                </p>
              </div>
            </div>

            <div className="p-8 space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl border border-slate-100 bg-white hover:border-slate-200 transition-colors group">
                  <Download className="w-8 h-8 text-slate-400 mb-4 group-hover:text-[#1a202c] transition-colors" />
                  <h4 className="font-bold text-slate-900 mb-2">Export Data</h4>
                  <p className="text-sm text-slate-500 mb-6">Download a full copy of your books and loans as a JSON file.</p>
                  <button 
                    onClick={handleDownloadBackup}
                    className="w-full py-3 bg-[#1a202c] text-white rounded-xl font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Backup
                  </button>
                </div>

                <div className="p-6 rounded-2xl border border-slate-100 bg-white hover:border-slate-200 transition-colors group">
                  <Upload className="w-8 h-8 text-slate-400 mb-4 group-hover:text-amber-600 transition-colors" />
                  <h4 className="font-bold text-slate-900 mb-2">Import Data</h4>
                  <p className="text-sm text-slate-500 mb-6">Restore your library from a previously saved backup file.</p>
                  <label className="w-full py-3 bg-white border-2 border-dashed border-slate-200 text-slate-600 rounded-xl font-bold hover:border-slate-300 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Upload & Restore
                    <input 
                      type="file" 
                      accept=".json" 
                      onChange={handleRestoreBackup}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="p-6 rounded-2xl border border-slate-100 bg-white hover:border-slate-200 transition-colors group sm:col-span-2">
                  <div className="w-8 h-8 mb-4 flex items-center justify-center">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="Google Drive" className="w-full h-full" />
                  </div>
                  <h4 className="font-bold text-slate-900 mb-2">Automated Cloud Backup</h4>
                  <p className="text-sm text-slate-500 mb-6">
                    Automatically saves your library to Google Drive whenever changes are made.
                  </p>
                  
                  {googleConnected ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium bg-emerald-50 px-3 py-2 rounded-lg w-fit">
                          <Check className="w-4 h-4" />
                          Connected to Google Drive
                        </div>
                        <button 
                          onClick={handleDisconnectGoogle}
                          className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-2"
                        >
                          Disconnect
                        </button>
                      </div>
                      {settings.find(s => s.key === 'last_drive_backup')?.value && (
                        <p className="text-xs text-slate-400">
                          Last saved: {new Date(settings.find(s => s.key === 'last_drive_backup')?.value || '').toLocaleString()}
                        </p>
                      )}
                      {refreshToken && (
                        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <p className="text-xs text-amber-800 font-medium mb-2">
                            To ensure backups persist across server restarts, add this as an environment variable named <code className="bg-amber-100 px-1 py-0.5 rounded">GOOGLE_REFRESH_TOKEN</code>:
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="text-[10px] bg-white px-2 py-1 rounded border border-amber-200 flex-1 overflow-x-auto whitespace-nowrap text-slate-600">
                              {refreshToken}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(refreshToken);
                                alert('Copied to clipboard!');
                              }}
                              className="p-1.5 bg-white border border-amber-200 rounded text-amber-700 hover:bg-amber-100 transition-colors"
                              title="Copy to clipboard"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                          </div>
                        </div>
                      )}
                      <button 
                        onClick={handleDriveBackup}
                        disabled={loading}
                        className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? 'Backing up...' : 'Backup Now'}
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={handleConnectGoogle}
                      className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                      Connect Google Account
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <div className="flex items-center gap-3 text-slate-400 mb-4">
                  <Database className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Database Stats</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Total Books</p>
                    <p className="text-2xl font-bold text-slate-900">{books.length}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Active Loans</p>
                    <p className="text-2xl font-bold text-slate-900">{loans.filter(l => !l.return_date).length}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'settings' && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
            <h3 className="text-xl font-bold text-[#1a202c] mb-6 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6" />
              SMS Reminder Settings
            </h3>

            <div className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-slate-900 mb-1">Google Drive Sync</h4>
                  <p className="text-sm text-slate-500">
                    {googleConnected 
                      ? "Connected to your Google Account." 
                      : "Connect your account to sync your library database to Google Drive."}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Note: You must set your <strong>google_client_id</strong> below first.</p>
                </div>
                {googleConnected ? (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full text-xs font-bold">
                      <Check className="w-4 h-4" />
                      Connected
                    </div>
                    <button 
                      onClick={handleDisconnectGoogle}
                      className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-2"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleConnectGoogle}
                    className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    Connect Account
                  </button>
                )}
              </div>
            </div>
            
            <form onSubmit={handleUpdateSettings} className="space-y-6">
              {settings.map((setting, idx) => (
                <div key={setting.key}>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
                    {setting.key.replace(/_/g, ' ')}
                  </label>
                  {setting.key.includes('template') ? (
                    <textarea 
                      value={setting.value}
                      onChange={e => {
                        const newSettings = [...settings];
                        newSettings[idx].value = e.target.value;
                        setSettings(newSettings);
                      }}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors min-h-[100px] text-sm"
                    />
                  ) : (
                    <input 
                      type="text"
                      value={setting.value}
                      onChange={e => {
                        const newSettings = [...settings];
                        newSettings[idx].value = e.target.value;
                        setSettings(newSettings);
                      }}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors text-sm"
                    />
                  )}
                  {setting.key.includes('template') && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] text-slate-400">
                        Available placeholders: <code className="bg-slate-100 px-1 rounded">{"{name}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{title}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{due_date}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{url}"}</code>
                      </p>
                      <p className="text-[10px] text-slate-500 italic">
                        Note: Most smartphones automatically hyperlink URLs in SMS messages.
                      </p>
                    </div>
                  )}
                  {setting.key === 'sms_reminder_offset_days' && (
                    <p className="mt-2 text-[10px] text-slate-400">
                      The number of days <strong>before</strong> the due date to send the automated SMS reminder. For example, "2" means the reminder will be sent 2 days before the book is due.
                    </p>
                  )}
                  {setting.key === 'max_borrow_weeks' && (
                    <p className="mt-2 text-[10px] text-slate-400">
                      The maximum number of weeks a book can be borrowed. Set to 0 or leave empty for unlimited.
                    </p>
                  )}
                </div>
              ))}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-[#1a202c] text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Save Settings
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
      {activeTab === 'analytics' && analytics && (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Library Analytics</h3>
              <p className="text-slate-500 text-sm">Insights into borrowing patterns and collection performance</p>
            </div>
            <button 
              onClick={fetchAnalytics}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Currently Borrowed</p>
              <p className="text-3xl font-bold text-slate-900">{analytics.stats?.currentlyBorrowed || 0}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Overdue Books</p>
              <p className="text-3xl font-bold text-rose-600">{analytics.stats?.overdue || 0}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Top Category</p>
              <p className="text-lg font-bold text-slate-900 truncate" title={analytics.stats?.topCategory?.name}>
                {analytics.stats?.topCategory?.name || 'N/A'}
              </p>
              <p className="text-xs text-slate-500">{analytics.stats?.topCategory?.count || 0} borrows</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Top Borrower</p>
              <p className="text-lg font-bold text-slate-900 truncate" title={analytics.stats?.topBorrower?.name}>
                {analytics.stats?.topBorrower?.name || 'N/A'}
              </p>
              <p className="text-xs text-slate-500">{analytics.stats?.topBorrower?.count || 0} borrows</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Borrowing Trends */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  Borrowing Trends
                </h3>
                <select 
                  value={analyticsDays}
                  onChange={(e) => setAnalyticsDays(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2"
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={30}>Last 30 Days</option>
                  <option value={90}>Last 90 Days</option>
                  <option value={365}>Last Year</option>
                </select>
              </div>
              <div className="h-[300px] w-full min-h-[300px] min-w-[0]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={analytics.borrowsOverTime || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickFormatter={(str) => {
                        const date = new Date(str);
                        return `Week of ${date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
                      }}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                      cursor={{ fill: '#f8fafc' }}
                      labelFormatter={(label) => {
                        const date = new Date(label as string);
                        return `Week starting ${date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
                      }}
                    />
                    <Bar 
                      dataKey="count" 
                      name="Borrows"
                      fill="#1a202c" 
                      radius={[4, 4, 0, 0]}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      name="Trend"
                      stroke="#4f46e5" 
                      strokeWidth={2} 
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category Distribution */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-emerald-500" />
                Category Distribution
              </h3>
              <div className="h-[300px] w-full min-h-[300px] min-w-[0] flex flex-col sm:flex-row items-center justify-center">
                <div className="w-full sm:w-1/2 h-[200px] sm:h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.categoryStats || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="category"
                      >
                        {(analytics.categoryStats || []).map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={[
                            '#1a202c', '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'
                          ][index % 7]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full sm:w-1/2 mt-4 sm:mt-0 max-h-[200px] sm:max-h-[300px] overflow-y-auto hide-scrollbar pl-0 sm:pl-4">
                  <ul className="space-y-2">
                    {(analytics.categoryStats || []).map((entry: any, index: number) => (
                      <li key={index} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: ['#1a202c', '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][index % 7] }}
                          ></span>
                          <span className="text-slate-700 truncate" title={entry.category}>{entry.category}</span>
                        </div>
                        <span className="font-bold text-slate-900 ml-2">{entry.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Top Book Card */}
          {analytics.stats.topBook && (
            <div className="bg-[#1a202c] text-white p-8 rounded-3xl shadow-lg relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                <div className="flex-1">
                  <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Most Popular Book</p>
                  <h3 className="text-3xl font-bold mb-2">{analytics.stats.topBook.title}</h3>
                  <p className="text-white/70">This book has been borrowed <span className="text-white font-bold">{analytics.stats.topBook.count} times</span> in total.</p>
                </div>
                <div className="w-32 h-32 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/10">
                  <BookIcon className="w-12 h-12 text-white/80" />
                </div>
              </div>
              <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'add' && (
        <div className="max-w-2xl bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8">
          <h3 className="text-xl font-bold text-[#1a202c] mb-6">
            {editingBook ? 'Edit Book Details' : 'Add Book to Catalogue'}
          </h3>
          
          {!editingBook && (
            scanning ? (
              <div className="relative mb-8">
                <button 
                  onClick={() => setScanning(false)}
                  className="absolute top-4 right-4 z-20 bg-black/50 hover:bg-black/70 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur-md transition-colors"
                >
                  Cancel
                </button>
                <Scanner onScan={handleScan} />
                <p className="text-center text-slate-500 text-sm mt-4">Point camera at ISBN barcode</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 mb-8">
                <button 
                  onClick={() => setScanning(true)}
                  className="w-full bg-slate-50 border-2 border-dashed border-slate-300 text-slate-600 py-6 rounded-2xl hover:border-[#1a202c] hover:text-[#1a202c] transition-colors flex flex-col items-center justify-center gap-2"
                >
                  <ScanLine className="w-6 h-6" />
                  <span className="font-medium text-sm">Scan Barcode</span>
                </button>
                <CoverScanner 
                  mode="identify"
                  variant="large"
                  onResult={(result) => {
                    let validIsbn = '';
                    if (result.isbn) {
                      const isbnStr = String(result.isbn);
                      const digits = isbnStr.replace(/\D/g, '');
                      if (digits.length === 10 || digits.length === 13) {
                        validIsbn = digits;
                      } else {
                        const clean = isbnStr.trim().replace(/[-\s]/g, '');
                        if (clean.startsWith('LIB-')) {
                          validIsbn = clean;
                        }
                      }
                    }
                    
                    if (validIsbn) {
                      handleScan(validIsbn, result);
                    } else if (result.title || result.author) {
                      setTitle(result.title || '');
                      setAuthor(result.author || '');
                      if (result.description) setDescription(result.description);
                      if (result.category) setCategory(result.category);
                      if (result.cover_url) setCoverUrl(result.cover_url);
                      setAddMessage({ type: 'success', text: 'Extracted details from cover.' });
                    } else {
                      setAddMessage({ type: 'error', text: 'Could not extract details from cover.' });
                    }
                  }}
                  onError={(err) => setAddMessage({ type: 'error', text: err })}
                  className="h-full"
                />
              </div>
            )
          )}

          <AnimatePresence mode="wait">
            {addMessage.text && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`p-4 rounded-xl text-sm font-medium mb-6 flex items-center justify-between ${
                  addMessage.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                    : addMessage.type === 'info'
                    ? 'bg-blue-50 text-blue-700 border border-blue-100'
                    : 'bg-rose-50 text-rose-700 border border-rose-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  {addMessage.type === 'info' && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{addMessage.text}</span>
                </div>
                {addMessage.type === 'error' && isbn && (
                  <button
                    type="button"
                    onClick={() => fetchBookDetails(isbn, true)}
                    className="ml-4 px-3 py-1 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors text-xs font-bold uppercase tracking-wider"
                  >
                    Retry
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleAddBook} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ISBN 
                  {isSearching && <Loader2 className="w-4 h-4 inline ml-2 animate-spin text-slate-400" />}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      value={isbn}
                      onChange={e => setIsbn(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors font-mono pr-10"
                      placeholder="e.g. 9780123456789 (Optional)"
                    />
                    {isbn && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsbn('');
                          lastFetchedIsbn.current = '';
                          setAddMessage({ type: '', text: '' });
                          setGeneratedBarcode(null);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchBookDetails(isbn.trim().replace(/[-\s]/g, ''), true)}
                    disabled={loading || isSearching || !isbn}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap min-w-[80px] flex items-center justify-center"
                  >
                    {isSearching ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-700"></div>
                    ) : (
                      'Lookup'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateBarcode}
                    className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl transition-colors whitespace-nowrap flex items-center justify-center"
                    title="Generate Barcode for books without ISBN"
                  >
                    Generate
                  </button>
                </div>
                {generatedBarcode && (
                  <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center gap-4">
                    <Barcode value={generatedBarcode} width={1.5} height={50} fontSize={14} />
                    <button
                      type="button"
                      onClick={handlePrintBarcode}
                      className="px-4 py-2 bg-[#1a202c] hover:bg-black text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Print Barcode
                    </button>
                  </div>
                )}
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                  Title
                  <button type="button" onClick={() => handleUpdateField('title')} className="text-slate-400 hover:text-slate-600">
                    {isUpdatingField['title'] ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </button>
                </label>
                <div className="relative">
                  <input 
                    type="text" 
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-all ${isSearching ? 'opacity-50' : ''}`}
                    placeholder="Book Title"
                  />
                  {isSearching && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                  Author
                  <button type="button" onClick={() => handleUpdateField('author')} className="text-slate-400 hover:text-slate-600">
                    {isUpdatingField['author'] ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </button>
                </label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={author}
                    onChange={e => setAuthor(e.target.value)}
                    className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-all ${isSearching ? 'opacity-50' : ''}`}
                    placeholder="Author Name"
                  />
                  {isSearching && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Copies</label>
                <input 
                  type="number" 
                  min="1"
                  required
                  value={copies}
                  onChange={e => setCopies(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select 
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors"
                >
                  <option value="available">Available</option>
                  <option value="unavailable">Unavailable</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                  Categories (Optional)
                  <button type="button" onClick={() => handleUpdateField('category')} className="text-slate-400 hover:text-slate-600">
                    {isUpdatingField['category'] ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </button>
                </label>
                <div className="w-full min-h-[46px] px-4 py-2 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-[#1a202c] bg-slate-50 focus-within:bg-white transition-colors flex flex-wrap gap-2 items-center">
                  {category.split(',').map((cat, idx) => cat.trim() && (
                    <span key={idx} className="bg-slate-200 text-slate-700 px-2 py-1 rounded-md text-xs flex items-center gap-1">
                      {cat.trim()}
                      <button 
                        type="button" 
                        onClick={() => {
                          const newCats = category.split(',').map(c => c.trim()).filter((_, i) => i !== idx);
                          setCategory(newCats.join(', '));
                        }}
                        className="hover:text-red-500"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  <input 
                    type="text" 
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        const val = e.currentTarget.value.trim();
                        if (val) {
                          const currentCats = category ? category.split(',').map(c => c.trim()).filter(Boolean) : [];
                          if (!currentCats.includes(val)) {
                            setCategory([...currentCats, val].join(', '));
                          }
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                    onBlur={e => {
                      const val = e.currentTarget.value.trim();
                      if (val) {
                        const currentCats = category ? category.split(',').map(c => c.trim()).filter(Boolean) : [];
                        if (!currentCats.includes(val)) {
                          setCategory([...currentCats, val].join(', '));
                        }
                        e.currentTarget.value = '';
                      }
                    }}
                    className="flex-1 min-w-[120px] bg-transparent focus:outline-none text-sm"
                    placeholder={category ? "" : "e.g. Theology, History (Press Enter)"}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Shelf Number (Optional)</label>
                <input 
                  type="text" 
                  value={shelfNumber}
                  onChange={e => setShelfNumber(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors"
                  placeholder="e.g. A-12, B-05"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Book Code (Optional)</label>
                <input 
                  type="text" 
                  value={bookCode}
                  onChange={e => setBookCode(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors"
                  placeholder="e.g. LIB-001"
                />
              </div>
              
              <div className="flex items-center mt-8">
                <input
                  type="checkbox"
                  id="featured"
                  checked={featured}
                  onChange={e => setFeatured(e.target.checked)}
                  className="h-4 w-4 text-[#1a202c] focus:ring-[#1a202c] border-slate-300 rounded"
                />
                <label htmlFor="featured" className="ml-2 block text-sm text-slate-900 font-medium">
                  Featured Book
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                  Book Description (Optional)
                  <button type="button" onClick={() => handleUpdateField('description')} className="text-slate-400 hover:text-slate-600">
                    {isUpdatingField['description'] ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </button>
                </label>
                <div className="relative">
                  <textarea 
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-all min-h-[100px] ${isSearching ? 'opacity-50' : ''}`}
                    placeholder="A brief summary of the book..."
                  />
                  {isSearching && (
                    <div className="absolute right-4 top-4">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                  Cover Image URL (Optional)
                  <button type="button" onClick={() => handleUpdateField('cover_url')} className="text-slate-400 hover:text-slate-600">
                    {isUpdatingField['cover_url'] ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </button>
                </label>
                <div className="flex gap-3 items-start">
                  <div className="relative flex-1">
                    <input 
                      type="url" 
                      value={coverUrl}
                      onChange={e => setCoverUrl(e.target.value)}
                      className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-all ${isSearching ? 'opacity-50' : ''}`}
                      placeholder="https://..."
                    />
                    {isSearching && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <label className="cursor-pointer px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                      <Camera className="w-4 h-4" />
                      <span>Upload</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                {coverUrl && (
                  <div className="mt-3 relative w-32 h-48 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                    <img src={coverUrl} alt="Cover preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setCoverUrl('')}
                      className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              {editingBook && (
                <button 
                  type="button"
                  onClick={() => {
                    setEditingBook(null);
                    setActiveTab('catalogue');
                  }}
                  className="flex-1 bg-slate-100 text-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-200 transition-colors flex justify-center items-center gap-2"
                >
                  <X className="w-5 h-5" />
                  Cancel
                </button>
              )}
              <button 
                type="submit" 
                disabled={loading || !isbn || !title}
                className="flex-[2] bg-[#1a202c] text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    {editingBook ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    {editingBook ? 'Save Changes' : 'Add Book to Catalogue'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowSuccessModal(false);
            setLastAddedBook(null);
          }}
        >
          <div 
            className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Book Added!</h3>
            <p className="text-slate-600 mb-6">
              <span className="font-semibold text-slate-900">"{lastAddedBook?.title}"</span> has been successfully added to the catalogue.
            </p>
            {lastAddedBook?.cover && (
              <div className="w-32 h-48 mx-auto mb-8 rounded-lg overflow-hidden shadow-md border border-slate-100">
                <img src={lastAddedBook.cover} alt="Cover" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  setLastAddedBook(null);
                  setIsbn('');
                  setTitle('');
                  setAuthor('');
                  setDescription('');
                  setCoverUrl('');
                  setCopies(1);
                  setStatus('available');
                  setCategory('');
                  setShelfNumber('');
                  setBookCode('');
                  setFeatured(false);
                  lastFetchedIsbn.current = '';
                  lastSuccessfulIsbn.current = '';
                }}
                className="w-full py-3 bg-[#1a202c] hover:bg-slate-800 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Another Book
              </button>
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  setLastAddedBook(null);
                  setActiveTab('backup');
                }}
                className="w-full py-3 bg-amber-50 border border-amber-200 text-amber-800 font-bold rounded-xl hover:bg-amber-100 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Backup Data
              </button>
              <Link
                to="/"
                className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
              >
                Return Home
              </Link>
            </div>
          </div>
        </div>
      )}
      {/* Edit Message Modal */}
      <AnimatePresence>
        {editingMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingMessage(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden p-6 md:p-8"
            >
              <h3 className="text-xl font-bold text-slate-900 mb-6">Edit Message</h3>
              <form onSubmit={handleUpdateMessage} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Scheduled Time (YYYY-MM-DD HH:MM)</label>
                  <input 
                    type="text"
                    value={editingMessage.scheduledTime}
                    onChange={e => setEditingMessage({...editingMessage, scheduledTime: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Message Content</label>
                  <textarea 
                    value={editingMessage.message}
                    onChange={e => setEditingMessage({...editingMessage, message: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors min-h-[120px]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Status</label>
                  <select 
                    value={editingMessage.status}
                    onChange={e => setEditingMessage({...editingMessage, status: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a202c] bg-slate-50 focus:bg-white transition-colors"
                  >
                    <option value="Queued">Queued</option>
                    <option value="Sent">Sent</option>
                    <option value="Cancelled">Cancelled</option>
                    <option value="Failed">Failed</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setEditingMessage(null)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-[#1a202c] hover:bg-slate-800 transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
