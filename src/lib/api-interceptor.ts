import { db } from './db';

const originalFetch = window.fetch;

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

Object.defineProperty(window, 'fetch', {
  configurable: true,
  writable: true,
  value: async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    
    if (!urlStr.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    const url = new URL(urlStr, window.location.origin);
    const path = url.pathname;
    const method = init?.method || 'GET';

    const jsonResponse = (data: any, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    // --- Books ---
    if (path === '/api/books' && method === 'GET') {
      const books = db.getBooks().map(b => {
        const activeLoans = db.getLoans().filter(l => l.book_id === b.id && !l.return_date).length;
        return { ...b, available_copies: b.total_copies - activeLoans };
      });
      return jsonResponse(books);
    }
    if (path === '/api/books' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const newBook = db.addBook({
        isbn: body.isbn,
        title: body.title,
        author: body.author,
        description: body.description || null,
        cover_url: body.cover_url || null,
        total_copies: body.total_copies || 1,
        status: body.status || 'available',
        category: body.category || null,
        shelf_number: body.shelf_number || null,
        featured: body.featured || false,
        book_code: body.book_code || null
      });
      return jsonResponse(newBook);
    }
    if (path === '/api/books/search' && method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase() || '';
      const books = db.getBooks().filter(b => 
        b.title.toLowerCase().includes(q) || 
        b.author.toLowerCase().includes(q) || 
        b.isbn.includes(q)
      ).map(b => {
        const activeLoans = db.getLoans().filter(l => l.book_id === b.id && !l.return_date).length;
        return { ...b, available_copies: b.total_copies - activeLoans };
      });
      return jsonResponse(books);
    }

    if (path.match(/^\/api\/books\/[^\/]+$/)) {
      const isbnOrId = path.split('/').pop()!;
      if (method === 'GET') {
        const book = db.getBookByIsbn(isbnOrId);
        if (book) {
          const activeLoans = db.getLoans().filter(l => l.book_id === book.id && !l.return_date).length;
          return jsonResponse({ ...book, available_copies: book.total_copies - activeLoans });
        }
        return jsonResponse({ error: 'Not found' }, 404);
      }
      if (method === 'PUT') {
        const body = JSON.parse(init?.body as string);
        const book = db.getBookById(parseInt(isbnOrId));
        if (book) {
          const updated = db.updateBook(book.id, body);
          return jsonResponse(updated);
        }
        return jsonResponse({ error: 'Not found' }, 404);
      }
      if (method === 'DELETE') {
        db.deleteBook(parseInt(isbnOrId));
        return jsonResponse({ success: true });
      }
    }

    // --- Loans ---
    if (path === '/api/loans' && method === 'GET') {
      const loans = db.getLoans().map(l => {
        const book = db.getBookById(l.book_id);
        return {
          ...l,
          title: book?.title || 'Unknown Book',
          isbn: book?.isbn || '',
          is_overdue: !l.return_date && new Date(l.due_date) < new Date() ? 1 : 0
        };
      });
      return jsonResponse(loans);
    }
    if (path === '/api/loans' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const newLoans = [];
      for (const isbn of body.isbns) {
        const book = db.getBookByIsbn(isbn);
        if (book) {
          const loan = db.addLoan({
            book_id: book.id,
            user_name: body.user_name,
            user_phone: body.user_phone,
            user_email: body.user_email || null,
            borrow_date: new Date().toISOString(),
            due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            original_due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            return_date: null,
            extension_token: generateId(),
            last_overdue_notice: null
          });
          newLoans.push(loan);
        }
      }
      return jsonResponse(newLoans);
    }
    if (path === '/api/loans/active' && method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase() || '';
      const activeLoans = db.getLoans().filter(l => !l.return_date && (
        l.user_name.toLowerCase().includes(q) ||
        l.user_phone.includes(q) ||
        (l.user_email && l.user_email.toLowerCase().includes(q))
      )).map(l => {
        const book = db.getBookById(l.book_id);
        return {
          ...l,
          title: book?.title || 'Unknown Book',
          isbn: book?.isbn || '',
          is_overdue: new Date(l.due_date) < new Date() ? 1 : 0
        };
      });
      return jsonResponse(activeLoans);
    }
    if (path === '/api/borrow' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const newLoans = [];
      for (const isbn of body.isbns) {
        const book = db.getBookByIsbn(isbn);
        if (book) {
          const loan = db.addLoan({
            book_id: book.id,
            user_name: body.user_name,
            user_phone: body.user_phone,
            user_email: body.user_email || null,
            borrow_date: new Date().toISOString(),
            due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            original_due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            return_date: null,
            extension_token: generateId(),
            last_overdue_notice: null
          });
          newLoans.push(loan);
        }
      }
      return jsonResponse(newLoans);
    }
    if (path === '/api/return' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const returned = [];
      for (const isbn of body.isbns) {
        const book = db.getBookByIsbn(isbn);
        if (book) {
          const loan = db.getLoans().find(l => l.book_id === book.id && !l.return_date);
          if (loan) {
            const updated = db.updateLoan(loan.id, { return_date: new Date().toISOString() });
            returned.push(updated);
          }
        }
      }
      return jsonResponse(returned);
    }
    if (path === '/api/extend' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const extended = [];
      for (const token of body.tokens) {
        const loan = db.getLoanByToken(token);
        if (loan) {
          const newDueDate = new Date(loan.due_date);
          newDueDate.setDate(newDueDate.getDate() + 7);
          const updated = db.updateLoan(loan.id, { due_date: newDueDate.toISOString() });
          extended.push(updated);
        }
      }
      return jsonResponse(extended);
    }
    if (path.match(/^\/api\/loans\/suggestions\/[^\/]+$/) && method === 'GET') {
      const isbn = path.split('/').pop()!;
      const book = db.getBookByIsbn(isbn);
      if (book) {
        const activeLoans = db.getLoans().filter(l => l.book_id === book.id && !l.return_date);
        return jsonResponse(activeLoans);
      }
      return jsonResponse([]);
    }
    if (path.match(/^\/api\/loans\/\d+\/return$/) && method === 'POST') {
      const id = parseInt(path.split('/')[3]);
      const updated = db.updateLoan(id, { return_date: new Date().toISOString() });
      return jsonResponse(updated);
    }
    if (path.match(/^\/api\/loans\/\d+\/extend$/) && method === 'POST') {
      const id = parseInt(path.split('/')[3]);
      const loan = db.getLoanById(id);
      if (loan) {
        const newDueDate = new Date(loan.due_date);
        newDueDate.setDate(newDueDate.getDate() + 7);
        const updated = db.updateLoan(id, { due_date: newDueDate.toISOString() });
        return jsonResponse(updated);
      }
      return jsonResponse({ error: 'Not found' }, 404);
    }

    // --- Members ---
    if (path === '/api/members' && method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase() || '';
      const members = db.getMembers().filter(m => 
        m.full_name.toLowerCase().includes(q) || m.phone.includes(q)
      );
      return jsonResponse(members);
    }
    if (path === '/api/members/all' && method === 'GET') {
      return jsonResponse(db.getMembers());
    }

    // --- Settings ---
    if (path === '/api/settings' && method === 'GET') {
      return jsonResponse({
        settings: db.getSettings(),
        googleConnected: !!db.getSetting('google_oauth_tokens'),
        refreshToken: null
      });
    }
    if (path === '/api/settings' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      for (const s of body.settings) {
        db.updateSetting(s.key, s.value);
      }
      return jsonResponse({ success: true });
    }

    // --- Admin Analytics ---
    if (path === '/api/admin/analytics' && method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '30');
      const loans = db.getLoans();
      const books = db.getBooks();
      
      const currentlyBorrowed = loans.filter(l => !l.return_date).length;
      const overdue = loans.filter(l => !l.return_date && new Date(l.due_date) < new Date()).length;
      
      return jsonResponse({
        stats: {
          currentlyBorrowed,
          overdue,
          topCategory: { name: 'Fiction', count: 10 },
          topBorrower: { name: 'John Doe', count: 5 },
          topBook: { title: '1984', count: 3 }
        },
        borrowsOverTime: [],
        categoryStats: []
      });
    }

    // --- Admin Login ---
    if (path === '/api/admin/login' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const adminPassword = db.getSetting('admin_password') || 'admin123';
      if (body.password === adminPassword) {
        return jsonResponse({ success: true });
      }
      return jsonResponse({ error: 'Invalid password' }, 401);
    }

    // --- Extend Info ---
    if (path.match(/^\/api\/extend-info\/[^\/]+$/) && method === 'GET') {
      const token = path.split('/').pop()!;
      const targetLoan = db.getLoanByToken(token);
      if (!targetLoan) return jsonResponse({ error: 'Invalid token' }, 404);
      
      const book = db.getBookById(targetLoan.book_id);
      const otherLoans = db.getLoans().filter(l => 
        l.user_phone === targetLoan.user_phone && 
        !l.return_date && 
        l.id !== targetLoan.id
      ).map(l => ({
        ...l,
        title: db.getBookById(l.book_id)?.title || 'Unknown Book'
      }));

      return jsonResponse({
        targetLoan: { ...targetLoan, title: book?.title },
        otherLoans
      });
    }

    // --- Messages ---
    if (path === '/api/messages' && method === 'GET') {
      return jsonResponse([]);
    }
    if (path.match(/^\/api\/messages\/\d+$/)) {
      if (method === 'PUT' || method === 'DELETE') {
        return jsonResponse({ success: true });
      }
    }

    // --- Mock Drive Backup ---
    if (path === '/api/admin/backup/drive' && method === 'POST') {
      // We trigger the client-side drive sync instead
      window.dispatchEvent(new CustomEvent('force_drive_sync'));
      return jsonResponse({ success: true });
    }

    if (path === '/api/sync-from-drive' && method === 'POST') {
      // In a real client-side app, this would trigger downloadFromDrive()
      // We can dispatch an event for drive-sync.ts to handle
      window.dispatchEvent(new CustomEvent('force_drive_download'));
      return jsonResponse({ success: true });
    }

    // --- Local Backup & Restore ---
    if (path === '/api/admin/backup' && method === 'GET') {
      return jsonResponse(db.getDatabase());
    }
    if (path === '/api/admin/restore' && method === 'POST') {
      const body = JSON.parse(init?.body as string);
      const data = body.data || body; // Handle both { data: {...} } and direct {...}
      if (data.books && data.loans && data.members && data.settings) {
        db.replaceDatabase(data);
        return jsonResponse({ success: true });
      }
      return jsonResponse({ error: 'Invalid backup format' }, 400);
    }

    // Fallback
    console.warn(`Unmocked API route: ${method} ${path}`);
    return jsonResponse({ error: 'Not implemented in client-side mock' }, 404);

  } catch (err: any) {
    console.error(`Mock API Error (${method} ${path}):`, err);
    return jsonResponse({ error: err.message }, 500);
  }
}
});
