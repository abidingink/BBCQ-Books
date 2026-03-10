export interface Book {
  id: number;
  isbn: string;
  title: string;
  author: string;
  description: string | null;
  cover_url: string | null;
  total_copies: number;
  status: string;
  category: string | null;
  shelf_number: string | null;
  featured: boolean;
  book_code: string | null;
}

export interface Loan {
  id: number;
  book_id: number;
  user_name: string;
  user_phone: string;
  user_email: string | null;
  borrow_date: string;
  due_date: string;
  original_due_date: string | null;
  return_date: string | null;
  extension_token: string | null;
  last_overdue_notice: string | null;
}

export interface Member {
  id: number;
  first_name: string;
  surname: string;
  full_name: string;
  phone: string;
  email: string | null;
  last_synced: string | null;
}

export interface Setting {
  key: string;
  value: string;
}

export interface Database {
  books: Book[];
  loans: Loan[];
  members: Member[];
  settings: Setting[];
}

const defaultSettings: Setting[] = [
  { key: 'sms_confirmation_template', value: "Hi {name}, you've borrowed '{title}'. Due on {due_date}." },
  { key: 'sms_return_template', value: "Hi {name}, thanks for returning '{title}'." },
  { key: 'sms_overdue_template', value: "Hi {name}, '{title}' is overdue. Please return it ASAP." },
  { key: 'ADMIN_PASSWORD', value: "bbcqbooks" },
  { key: 'max_borrow_weeks', value: "4" },
  { key: 'google_client_id', value: "" }
];

class LocalDB {
  private data: Database = {
    books: [],
    loans: [],
    members: [],
    settings: defaultSettings
  };

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const stored = localStorage.getItem('library_db');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.data = { ...this.data, ...parsed };
        
        // Ensure default settings exist
        defaultSettings.forEach(ds => {
          if (!this.data.settings.find(s => s.key === ds.key)) {
            this.data.settings.push(ds);
          }
        });
      } catch (e) {
        console.error("Failed to parse local DB", e);
      }
    }
  }

  private saveToStorage() {
    localStorage.setItem('library_db', JSON.stringify(this.data));
    // Trigger a sync to Drive if connected
    window.dispatchEvent(new CustomEvent('library_db_updated'));
  }

  // --- Books ---
  getBooks() { return this.data.books; }
  getBookByIsbn(isbn: string) { return this.data.books.find(b => b.isbn === isbn); }
  getBookById(id: number) { return this.data.books.find(b => b.id === id); }
  addBook(book: Omit<Book, 'id'>) {
    const id = Math.max(0, ...this.data.books.map(b => b.id)) + 1;
    const newBook = { ...book, id };
    this.data.books.push(newBook);
    this.saveToStorage();
    return newBook;
  }
  updateBook(id: number, updates: Partial<Book>) {
    const index = this.data.books.findIndex(b => b.id === id);
    if (index !== -1) {
      this.data.books[index] = { ...this.data.books[index], ...updates };
      this.saveToStorage();
      return this.data.books[index];
    }
    return null;
  }
  deleteBook(id: number) {
    this.data.books = this.data.books.filter(b => b.id !== id);
    this.saveToStorage();
  }

  // --- Loans ---
  getLoans() { return this.data.loans; }
  getLoanById(id: number) { return this.data.loans.find(l => l.id === id); }
  getLoanByToken(token: string) { return this.data.loans.find(l => l.extension_token === token); }
  addLoan(loan: Omit<Loan, 'id'>) {
    const id = Math.max(0, ...this.data.loans.map(l => l.id)) + 1;
    const newLoan = { ...loan, id };
    this.data.loans.push(newLoan);
    this.saveToStorage();
    return newLoan;
  }
  updateLoan(id: number, updates: Partial<Loan>) {
    const index = this.data.loans.findIndex(l => l.id === id);
    if (index !== -1) {
      this.data.loans[index] = { ...this.data.loans[index], ...updates };
      this.saveToStorage();
      return this.data.loans[index];
    }
    return null;
  }

  // --- Members ---
  getMembers() { return this.data.members; }
  addMember(member: Omit<Member, 'id'>) {
    const id = Math.max(0, ...this.data.members.map(m => m.id)) + 1;
    const newMember = { ...member, id };
    this.data.members.push(newMember);
    this.saveToStorage();
    return newMember;
  }

  // --- Settings ---
  getSettings() { return this.data.settings; }
  getSetting(key: string) { return this.data.settings.find(s => s.key === key)?.value; }
  updateSetting(key: string, value: string) {
    const index = this.data.settings.findIndex(s => s.key === key);
    if (index !== -1) {
      this.data.settings[index].value = value;
    } else {
      this.data.settings.push({ key, value });
    }
    this.saveToStorage();
  }

  // --- Full DB Replace (for Drive Sync) ---
  replaceDatabase(newData: Database) {
    this.data = newData;
    this.saveToStorage();
  }
  
  getDatabase() {
    return this.data;
  }
}

export const db = new LocalDB();
