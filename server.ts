import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { nanoid } from 'nanoid';
import { Readable, PassThrough } from 'stream';
import { GoogleGenAI, Type } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Google Sheets & Drive Configuration
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID || '1_XWf2SDWptGWhcSO4rKiTiqx1W9QQ5neJMpZRmW7T4Y';
const DRIVE_FOLDER_ID = '1tD6K4k2FuW3R-jzymmBRevzir1NBtXWI';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function getOAuth2Client() {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/auth/google/callback`;
    
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

// Debounce backup to avoid rate limits
let backupTimeout: NodeJS.Timeout | null = null;

async function getDriveFolder(drive: any) {
  try {
    await drive.files.get({ 
      fileId: DRIVE_FOLDER_ID, 
      fields: 'id',
      supportsAllDrives: true
    });
    return true;
  } catch (e: any) {
    console.error('Google Drive folder not found or inaccessible:', DRIVE_FOLDER_ID, e.message);
    return false;
  }
}

async function backupToDrive(immediate = false) {
  if (backupTimeout) clearTimeout(backupTimeout);
  
  const runBackup = async () => {
    console.log('Starting automated backup to Google Drive...');
    const tokenSetting = db.prepare("SELECT value FROM settings WHERE key = 'google_oauth_tokens'").get() as any;
    
    if (!tokenSetting || !tokenSetting.value) {
      console.warn('Google Account not connected. Skipping Drive backup.');
      return;
    }

    try {
      const tokens = JSON.parse(tokenSetting.value);
      const auth = getOAuth2Client();
      auth.setCredentials(tokens);

      // Refresh token if needed
      auth.on('tokens', (newTokens) => {
        const updatedTokens = { ...tokens, ...newTokens };
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('google_oauth_tokens', ?)").run(JSON.stringify(updatedTokens));
      });

      const drive = google.drive({ version: 'v3', auth });

      console.log('Verifying folder access:', DRIVE_FOLDER_ID);
      if (!(await getDriveFolder(drive))) {
        console.error('Folder access verification failed.');
        throw new Error('Folder access verification failed. You may need to reconnect your Google Account to grant full Drive access.');
      }
      console.log('Folder access verified.');

      // Prepare data
      const books = db.prepare('SELECT * FROM books').all();
      const loans = db.prepare('SELECT * FROM loans').all();
      const members = db.prepare('SELECT * FROM members').all();
      const settings = db.prepare('SELECT * FROM settings').all();
      
      const backupData = JSON.stringify({
        timestamp: new Date().toISOString(),
        data: { books, loans, members, settings }
      }, null, 2);

      // Check for existing backup file in the specific folder
      console.log('Searching for existing backup file...');
      const listRes = await drive.files.list({
        q: `name = 'library_backup.json' and '${DRIVE_FOLDER_ID}' in parents and trashed = false`,
        fields: 'files(id, name)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const existingFile = listRes.data.files?.[0];

      if (existingFile) {
        console.log('Updating existing file:', existingFile.id);
        // Update existing file
        await drive.files.update({
          fileId: existingFile.id!,
          media: {
            mimeType: 'application/json',
            body: backupData,
          },
          supportsAllDrives: true,
        });
        console.log(`Backup updated: ${existingFile.id}`);
      } else {
        console.log('Creating new backup file...');
        // Create new file
        await drive.files.create({
          requestBody: {
            name: 'library_backup.json',
            mimeType: 'application/json',
            parents: [DRIVE_FOLDER_ID],
          },
          media: {
            mimeType: 'application/json',
            body: backupData,
          },
          supportsAllDrives: true,
        });
        console.log('New backup file created on Drive.');
      }
      
      // Update last backup timestamp
      console.log('Updating last_drive_backup setting...');
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_drive_backup', ?)").run(new Date().toISOString());
      console.log('Backup process completed successfully.');

    } catch (error) {
      console.error('Error backing up to Google Drive:', error);
      throw error; // Re-throw to be caught by the route handler if immediate
    }
  };

  if (immediate) {
    await runBackup();
  } else {
    backupTimeout = setTimeout(runBackup, 5000); // 5 second debounce
  }
}

async function syncFromDrive() {
  console.log('Attempting to sync from Google Drive...');
  const tokenSetting = db.prepare("SELECT value FROM settings WHERE key = 'google_oauth_tokens'").get() as any;
  if (!tokenSetting || !tokenSetting.value) {
    console.log('Google Account not connected. Skipping sync.');
    return;
  }

  try {
    const tokens = JSON.parse(tokenSetting.value);
    const auth = getOAuth2Client();
    auth.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth });

    if (!(await getDriveFolder(drive))) {
      console.error('Folder access verification failed during sync.');
      return;
    }

    // Find the backup file
    const listRes = await drive.files.list({
      q: `name = 'library_backup.json' and '${DRIVE_FOLDER_ID}' in parents and trashed = false`,
      fields: 'files(id, name, modifiedTime)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const backupFile = listRes.data.files?.[0];
    if (!backupFile) {
      console.log('No backup file found on Drive.');
      return;
    }

    // Download the content
    const res = await drive.files.get({
      fileId: backupFile.id!,
      alt: 'media',
      supportsAllDrives: true,
    });

    const backup = res.data as any;
    if (!backup || !backup.data) {
      console.log('Invalid backup data on Drive.');
      return;
    }

    // Check if Drive backup is newer than local
    const lastLocalBackup = db.prepare("SELECT value FROM settings WHERE key = 'last_drive_backup'").get() as any;
    if (lastLocalBackup && backup.timestamp <= lastLocalBackup.value) {
      console.log('Local data is up to date with Drive.');
      return;
    }

    console.log('Drive backup is newer. Restoring...');
    
    // Restore data
    const { books, loans, members, settings } = backup.data;

    db.transaction(() => {
      // Clear existing data
      db.prepare('DELETE FROM books').run();
      db.prepare('DELETE FROM loans').run();
      db.prepare('DELETE FROM members').run();
      db.prepare('DELETE FROM settings WHERE key NOT IN ("google_oauth_tokens", "last_drive_backup")').run();

      // Insert books
      const bookStmt = db.prepare(`
        INSERT INTO books (id, isbn, title, author, description, cover_url, total_copies, status, category, shelf_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      books.forEach((b: any) => bookStmt.run(b.id, b.isbn, b.title, b.author, b.description, b.cover_url, b.total_copies, b.status, b.category, b.shelf_number));

      // Insert loans
      const loanStmt = db.prepare(`
        INSERT INTO loans (id, book_id, user_name, user_phone, user_email, borrow_date, due_date, return_date, extensionToken)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      loans.forEach((l: any) => loanStmt.run(l.id, l.book_id, l.user_name, l.user_phone, l.user_email, l.borrow_date, l.due_date, l.return_date, l.extensionToken));

      // Insert members
      const memberStmt = db.prepare(`
        INSERT INTO members (id, name, phone, email, last_sync)
        VALUES (?, ?, ?, ?, ?)
      `);
      members.forEach((m: any) => memberStmt.run(m.id, m.name, m.phone, m.email, m.last_sync));

      // Insert settings
      const settingStmt = db.prepare(`
        INSERT OR REPLACE INTO settings (key, value)
        VALUES (?, ?)
      `);
      settings.forEach((s: any) => {
        if (s.key !== 'google_oauth_tokens' && s.key !== 'last_drive_backup') {
          settingStmt.run(s.key, s.value);
        }
      });
      
      // Update local timestamp to match Drive
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_drive_backup', ?)").run(backup.timestamp);
    })();

    console.log('Sync from Drive complete.');
  } catch (error) {
    console.error('Error syncing from Google Drive:', error);
  }
}

async function uploadImageToDrive(base64Data: string, fileName: string): Promise<string | null> {
  const tokenSetting = db.prepare("SELECT value FROM settings WHERE key = 'google_oauth_tokens'").get() as any;
  if (!tokenSetting || !tokenSetting.value) return null;

  try {
    const tokens = JSON.parse(tokenSetting.value);
    const auth = getOAuth2Client();
    auth.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth });

    if (!(await getDriveFolder(drive))) {
      console.error('Folder access verification failed during image upload.');
      return null;
    }

    // Extract mime type and base64 content
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    let res;
    try {
      const bufferStream = new PassThrough();
      bufferStream.end(buffer);

      res = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [DRIVE_FOLDER_ID],
          mimeType: mimeType,
        },
        media: {
          mimeType: mimeType,
          body: bufferStream,
        },
        fields: 'id',
        supportsAllDrives: true,
      });
    } catch (e: any) {
      console.error('Error in drive.files.create:', e.message);
      if (e.response && e.response.data) {
        console.error('Drive API Error details (files.create):', JSON.stringify(e.response.data, null, 2));
      }
      throw e;
    }

    return `/api/images/${res.data.id}`;
  } catch (error: any) {
    console.error('Error uploading image to Drive:', error);
    if (error.response && error.response.data) {
      console.error('Drive API Error details:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

async function appendToLog(rows: any[]) {
  if (!rows || rows.length === 0) return;

  const tokenSetting = db.prepare("SELECT value FROM settings WHERE key = 'google_oauth_tokens'").get() as any;
  
  if (!tokenSetting || !tokenSetting.value) {
    console.warn('Google Account not connected. Skipping SMS log.');
    return;
  }

  try {
    const tokens = JSON.parse(tokenSetting.value);
    const auth = getOAuth2Client();
    auth.setCredentials(tokens);

    // Refresh token if needed
    auth.on('tokens', (newTokens) => {
      const updatedTokens = { ...tokens, ...newTokens };
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('google_oauth_tokens', ?)").run(JSON.stringify(updatedTokens));
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // Check for duplicates using Batch ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Log!J:J', // Batch ID column
    });
    const existingBatchIds = (response.data.values || []).flat();

    const newRows = rows.filter(row => !row.batchId || !existingBatchIds.includes(row.batchId));

    if (newRows.length === 0) {
      console.log('All rows are duplicates. Skipping append.');
      return;
    }

    const values = newRows.map(row => [
      '', // Column A (empty)
      row.logTime,
      row.firstName,
      row.surname,
      row.number,
      row.email || '',
      row.scheduledTime,
      row.message,
      row.status,
      row.batchId
    ]);

    // Find the last row with data to mimic getLastRow()
    const lastRowResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Log!B:B', // Check column B (logTime) for data
    });
    const lastRowWithData = (lastRowResponse.data.values || []).length;
    const startRow = lastRowWithData + 1;

    // Use update instead of append to write into the empty formatted rows of the table
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Log!A${startRow}:J`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: values,
      },
    });
  } catch (error) {
    console.error('Error writing to Google Sheets:', error);
  }
}

async function getLibraryMessages() {
  const tokenSetting = db.prepare("SELECT value FROM settings WHERE key = 'google_oauth_tokens'").get() as any;
  if (!tokenSetting || !tokenSetting.value) return [];

  try {
    const tokens = JSON.parse(tokenSetting.value);
    const auth = getOAuth2Client();
    auth.setCredentials(tokens);
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Log!A2:J',
    });
    
    const rows = response.data.values || [];
    return rows.map((row, index) => ({
      rowIndex: index + 2,
      logTime: row[1] || '',
      firstName: row[2] || '',
      surname: row[3] || '',
      number: row[4] || '',
      email: row[5] || '',
      scheduledTime: row[6] || '',
      message: row[7] || '',
      status: row[8] || '',
      batchId: row[9] || ''
    })).filter(r => r.batchId && r.batchId.startsWith('Library:'));
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
}

async function updateLibraryMessage(rowIndex: number, scheduledTime: string, message: string, status: string) {
  const tokenSetting = db.prepare("SELECT value FROM settings WHERE key = 'google_oauth_tokens'").get() as any;
  if (!tokenSetting || !tokenSetting.value) return;

  try {
    const tokens = JSON.parse(tokenSetting.value);
    const auth = getOAuth2Client();
    auth.setCredentials(tokens);
    const sheets = google.sheets({ version: 'v4', auth });
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Log!G${rowIndex}:I${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[scheduledTime, message, status]],
      },
    });
  } catch (error) {
    console.error('Error updating message:', error);
  }
}

async function cancelMessagesByPrefix(prefixes: string[]) {
  const messages = await getLibraryMessages();
  const toCancel = messages.filter(m => m.status === 'Queued' && prefixes.some(p => m.batchId.startsWith(p)));
  
  for (const msg of toCancel) {
    await updateLibraryMessage(msg.rowIndex, msg.scheduledTime, msg.message, 'Cancelled');
  }
}

async function checkOverdueBooks() {
  try {
    const overdueLoans = db.prepare(`
      SELECT l.*, b.title
      FROM loans l
      JOIN books b ON l.book_id = b.id
      WHERE l.return_date IS NULL
        AND l.due_date < CURRENT_TIMESTAMP
        AND (l.last_overdue_notice IS NULL OR l.last_overdue_notice <= datetime('now', '-7 days'))
    `).all() as any[];

    if (overdueLoans.length === 0) return;

    const settings = db.prepare('SELECT key, value FROM settings').all() as any[];
    const getSetting = (key: string) => settings.find(s => s.key === key)?.value;
    const overdueTemplate = getSetting('sms_overdue_template') || "Hi {name}, '{title}' is overdue. Please return it ASAP.";

    const logsToAppend: any[] = [];
    const now = new Date();
    const formatSheetDate = (date: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };

    const updateNoticeStmt = db.prepare('UPDATE loans SET last_overdue_notice = CURRENT_TIMESTAMP WHERE id = ?');

    db.transaction(() => {
      for (const loan of overdueLoans) {
        const [firstName, ...surnameParts] = loan.user_name.split(' ');
        const surname = surnameParts.join(' ');
        
        const msg = overdueTemplate
          .replace('{name}', firstName)
          .replace('{title}', loan.title);

        logsToAppend.push({
          logTime: formatSheetDate(now),
          firstName,
          surname,
          number: loan.user_phone,
          email: loan.user_email,
          scheduledTime: formatSheetDate(now),
          message: msg,
          status: 'Queued',
          batchId: `Library:loan:${loan.id}:overdue:${Date.now()}`
        });

        updateNoticeStmt.run(loan.id);
      }
    })();

    await appendToLog(logsToAppend);
    console.log(`Scheduled ${logsToAppend.length} overdue notices.`);
  } catch (error) {
    console.error('Error checking overdue books:', error);
  }
}

// Run overdue check every hour
setInterval(checkOverdueBooks, 1000 * 60 * 60);
// Run once on startup after a short delay
setTimeout(checkOverdueBooks, 10000);

async function syncDirectory() {
  const tokenSetting = db.prepare("SELECT value FROM settings WHERE key = 'google_oauth_tokens'").get() as any;
  if (!tokenSetting || !tokenSetting.value) return;

  try {
    const tokens = JSON.parse(tokenSetting.value);
    const auth = getOAuth2Client();
    auth.setCredentials(tokens);

    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Directory!A2:E', // A: empty, B: First Name, C: Surname, D: Number, E: Email
    });

    const rows = response.data.values;
    if (rows && rows.length) {
      db.transaction(() => {
        db.prepare('DELETE FROM members').run();
        const insert = db.prepare('INSERT INTO members (first_name, surname, full_name, phone, email) VALUES (?, ?, ?, ?, ?)');
        for (const row of rows) {
          const firstName = row[1] || ''; // Column B
          const surname = row[2] || '';   // Column C
          const fullName = `${firstName} ${surname}`.trim();
          const phone = row[3] || '';     // Column D
          const email = row[4] || '';     // Column E
          if (fullName) {
            insert.run(firstName, surname, fullName, phone, email);
          }
        }
      })();
      console.log(`Synced ${rows.length} members from Directory.`);
    }
  } catch (error) {
    console.error('Error syncing directory:', error);
  }
}

// Initialize SQLite database
const db = new Database('library.db', { verbose: console.log });

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    isbn TEXT UNIQUE,
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    cover_url TEXT,
    total_copies INTEGER DEFAULT 1,
    status TEXT DEFAULT 'available',
    category TEXT,
    shelf_number TEXT
  );

  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER,
    user_name TEXT NOT NULL,
    user_phone TEXT NOT NULL,
    user_email TEXT,
    borrow_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_date DATETIME NOT NULL,
    return_date DATETIME,
    extension_token TEXT UNIQUE,
    FOREIGN KEY(book_id) REFERENCES books(id)
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT,
    surname TEXT,
    full_name TEXT,
    phone TEXT,
    email TEXT,
    last_synced DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migration: Add user_email and extension_token if they don't exist
const tableInfo = db.prepare("PRAGMA table_info(loans)").all() as any[];
const hasUserEmail = tableInfo.some(col => col.name === 'user_email');
const hasExtensionToken = tableInfo.some(col => col.name === 'extension_token');

if (!hasUserEmail) {
  try {
    db.prepare("ALTER TABLE loans ADD COLUMN user_email TEXT").run();
  } catch (e) {}
}
if (!hasExtensionToken) {
  try {
    db.prepare("ALTER TABLE loans ADD COLUMN extension_token TEXT").run();
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_extension_token ON loans(extension_token)").run();
  } catch (e) {}
}

// Migration: Add columns to books if they don't exist
try {
  db.prepare("ALTER TABLE books ADD COLUMN description TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE books ADD COLUMN status TEXT DEFAULT 'available'").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE books ADD COLUMN category TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE loans ADD COLUMN user_email TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE loans ADD COLUMN extension_token TEXT UNIQUE").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE loans ADD COLUMN last_overdue_notice DATETIME").run();
} catch (e) {}

// Initialize default settings
const defaultSettings = [
  { key: 'sms_confirmation_template', value: "Hi {name}, you've borrowed '{title}'. Due on {due_date}." },
  { key: 'sms_reminder_template', value: "Hi {name}, '{title}' is due on {due_date}. Extend here: {url}" },
  { key: 'sms_reminder_offset_days', value: '3' },
  { key: 'sms_overdue_template', value: "Hi {name}, '{title}' is overdue. Please return it ASAP." },
  { key: 'max_borrow_weeks', value: '4' },
  { key: 'google_oauth_tokens', value: '' }
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
defaultSettings.forEach(s => insertSetting.run(s.key, s.value));

// API Routes

// Get all books with their availability status
app.get('/api/books', (req, res) => {
  const books = db.prepare(`
    SELECT 
      b.*,
      b.total_copies - (
        SELECT COUNT(*) FROM loans l 
        WHERE l.book_id = b.id AND l.return_date IS NULL
      ) as available_copies,
      (
        SELECT MIN(l.due_date) FROM loans l 
        WHERE l.book_id = b.id AND l.return_date IS NULL
      ) as next_due_date
    FROM books b
  `).all();
  res.json(books);
});

// Get a specific book by ISBN
app.get('/api/books/:isbn', (req, res) => {
  const book = db.prepare(`
    SELECT 
      b.*,
      b.total_copies - (
        SELECT COUNT(*) FROM loans l 
        WHERE l.book_id = b.id AND l.return_date IS NULL
      ) as available_copies
    FROM books b
    WHERE b.isbn = ?
  `).get(req.params.isbn);
  
  if (book) {
    res.json(book);
  } else {
    res.status(404).json({ error: 'Book not found' });
  }
});

// Add a new book (Admin)
app.post('/api/books', async (req, res) => {
  let { isbn, title, author, description, cover_url, total_copies = 1, status = 'available', category, shelf_number } = req.body;
  
  try {
    // If cover_url is base64, upload to Drive
    if (cover_url && cover_url.startsWith('data:image')) {
      const driveUrl = await uploadImageToDrive(cover_url, `cover_${isbn || nanoid()}.png`);
      if (driveUrl) cover_url = driveUrl;
    }

    const stmt = db.prepare(`
      INSERT INTO books (isbn, title, author, description, cover_url, total_copies, status, category, shelf_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(isbn) DO UPDATE SET 
        total_copies = total_copies + ?,
        status = excluded.status,
        category = COALESCE(excluded.category, category),
        shelf_number = COALESCE(excluded.shelf_number, shelf_number),
        cover_url = COALESCE(excluded.cover_url, cover_url)
    `);
    const info = stmt.run(isbn, title, author, description, cover_url, total_copies, status, category, shelf_number, total_copies);
    backupToDrive().catch(console.error);
    res.json({ id: info.lastInsertRowid, message: 'Book added successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a book (Admin)
app.put('/api/books/:id', async (req, res) => {
  const { id } = req.params;
  let { isbn, title, author, description, cover_url, total_copies, status, category, shelf_number } = req.body;
  
  try {
    // If cover_url is base64, upload to Drive
    if (cover_url && cover_url.startsWith('data:image')) {
      const driveUrl = await uploadImageToDrive(cover_url, `cover_${isbn || id}.png`);
      if (driveUrl) cover_url = driveUrl;
    }

    const stmt = db.prepare(`
      UPDATE books 
      SET isbn = ?, title = ?, author = ?, description = ?, cover_url = ?, total_copies = ?, status = ?, category = ?, shelf_number = ?
      WHERE id = ?
    `);
    const info = stmt.run(isbn, title, author, description, cover_url, total_copies, status, category, shelf_number, id);
    if (info.changes > 0) {
      backupToDrive().catch(console.error);
      res.json({ message: 'Book updated successfully' });
    } else {
      res.status(404).json({ error: 'Book not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a book (Admin)
app.delete('/api/books/:id', (req, res) => {
  const { id } = req.params;
  try {
    // Check if there are active loans
    const activeLoans = db.prepare('SELECT COUNT(*) as count FROM loans WHERE book_id = ? AND return_date IS NULL').get(id) as any;
    if (activeLoans.count > 0) {
      return res.status(400).json({ error: 'Cannot delete book with active loans' });
    }
    
    const stmt = db.prepare('DELETE FROM books WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes > 0) {
      backupToDrive().catch(console.error);
      res.json({ message: 'Book deleted successfully' });
    } else {
      res.status(404).json({ error: 'Book not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Borrow a book
app.post('/api/borrow', async (req, res) => {
  const { isbns: rawIsbns, user_name, user_phone, user_email, weeks } = req.body;
  
  if (!rawIsbns || !rawIsbns.length || !user_name || !user_phone || !weeks) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Deduplicate ISBNs
  const isbns = [...new Set(rawIsbns as string[])];

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (weeks * 7));
  const dueDateStr = dueDate.toISOString();

  const borrowTransaction = db.transaction((isbnsToBorrow) => {
    const results = [];
    for (const isbn of isbnsToBorrow) {
      const book = db.prepare('SELECT id, title, total_copies FROM books WHERE isbn = ?').get(isbn) as any;
      
      if (!book) {
        throw new Error(`Book with ISBN ${isbn} not found`);
      }

      const activeLoans = db.prepare('SELECT COUNT(*) as count FROM loans WHERE book_id = ? AND return_date IS NULL').get(book.id) as any;
      
      if (activeLoans.count >= book.total_copies) {
        throw new Error(`No copies available for ISBN ${isbn}`);
      }

      const extensionToken = nanoid();
      const stmt = db.prepare(`
        INSERT INTO loans (book_id, user_name, user_phone, user_email, due_date, extension_token)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(book.id, user_name, user_phone, user_email, dueDateStr, extensionToken);
      results.push({ loan_id: info.lastInsertRowid, book_id: book.id, title: book.title, extensionToken });
    }
    return results;
  });

  try {
    const results = borrowTransaction(isbns);
    
    // Schedule SMS Reminders
    const settings = db.prepare('SELECT key, value FROM settings').all() as any[];
    const getSetting = (key: string) => settings.find(s => s.key === key)?.value;
    
    const confTemplate = getSetting('sms_confirmation_template');
    const remTemplate = getSetting('sms_reminder_template');
    const remOffset = parseInt(getSetting('sms_reminder_offset_days') || '3');

    const [firstName, ...surnameParts] = user_name.split(' ');
    const surname = surnameParts.join(' ');

    const logsToAppend = [];

    const formatSheetDate = (date: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };

    const now = new Date();

    for (const result of results) {
      const dateObj = new Date(dueDateStr);
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const formattedDueDate = `${day}/${month}/${year}`;
      
      // 1. Confirmation SMS (Immediate)
      const confMsg = confTemplate
        .replace('{name}', firstName)
        .replace('{title}', result.title)
        .replace('{due_date}', formattedDueDate);

      logsToAppend.push({
        logTime: formatSheetDate(now),
        firstName,
        surname,
        number: user_phone,
        email: user_email,
        scheduledTime: formatSheetDate(now),
        message: confMsg,
        status: 'Queued',
        batchId: `Library:loan:${result.loan_id}:conf`
      });

      // 2. Reminder SMS (Offset days before due date)
      const reminderDate = new Date(dueDate);
      reminderDate.setDate(reminderDate.getDate() - remOffset);
      reminderDate.setHours(9, 0, 0, 0); // 9 AM

      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const extensionUrl = `${appUrl}/extend/${result.extensionToken}`;

      const remMsg = remTemplate
        .replace('{name}', firstName)
        .replace('{title}', result.title)
        .replace('{due_date}', formattedDueDate)
        .replace('{url}', extensionUrl);

      logsToAppend.push({
        logTime: formatSheetDate(now),
        firstName,
        surname,
        number: user_phone,
        email: user_email,
        scheduledTime: formatSheetDate(reminderDate),
        message: remMsg,
        status: 'Queued',
        batchId: `Library:loan:${result.loan_id}:rem`
      });
    }

    await appendToLog(logsToAppend);

    res.json({ message: 'Books borrowed successfully and reminders scheduled', results });
    
    // Sync directory in background
    syncDirectory().catch(console.error);
    backupToDrive().catch(console.error);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Return a book
app.post('/api/return', (req, res) => {
  const { isbns } = req.body;
  
  if (!isbns || !isbns.length) {
    return res.status(400).json({ error: 'Missing ISBNs' });
  }

  let returnedLoanIds: number[] = [];

  const returnTransaction = db.transaction((isbnsToReturn) => {
    let returnedCount = 0;
    for (const isbn of isbnsToReturn) {
      const book = db.prepare('SELECT id FROM books WHERE isbn = ?').get(isbn) as any;
      if (book) {
        const activeLoans = db.prepare('SELECT id FROM loans WHERE book_id = ? AND return_date IS NULL').all(book.id) as any[];
        for (const loan of activeLoans) {
          returnedLoanIds.push(loan.id);
        }

        const stmt = db.prepare(`
          UPDATE loans 
          SET return_date = CURRENT_TIMESTAMP 
          WHERE book_id = ? AND return_date IS NULL
        `);
        const info = stmt.run(book.id);
        returnedCount += info.changes;
      }
    }
    return returnedCount;
  });

  try {
    const count = returnTransaction(isbns);
    
    if (returnedLoanIds.length > 0) {
      const prefixes = returnedLoanIds.map(id => `Library:loan:${id}:`);
      cancelMessagesByPrefix(prefixes).catch(console.error);
    }

    backupToDrive().catch(console.error);
    res.json({ message: `Successfully returned ${count} books` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Extend a loan via token
app.get('/api/extend/:token', (req, res) => {
  const { token } = req.params;
  const loan = db.prepare('SELECT * FROM loans WHERE extension_token = ? AND return_date IS NULL').get(token) as any;
  
  if (!loan) {
    return res.status(404).json({ error: 'Active loan not found for this token' });
  }

  const maxWeeksSetting = db.prepare("SELECT value FROM settings WHERE key = 'max_borrow_weeks'").get() as any;
  const maxWeeks = maxWeeksSetting && maxWeeksSetting.value ? parseInt(maxWeeksSetting.value) : 0;

  // Extend by 1 week
  const newDueDate = new Date(loan.due_date);
  newDueDate.setDate(newDueDate.getDate() + 7);
  
  if (maxWeeks > 0) {
    const borrowDate = new Date(loan.borrow_date);
    const maxDate = new Date(borrowDate);
    maxDate.setDate(maxDate.getDate() + (maxWeeks * 7));
    maxDate.setHours(23, 59, 59, 999);
    
    if (newDueDate > maxDate) {
      return res.status(400).json({ error: `Maximum borrow limit of ${maxWeeks} weeks reached. Cannot extend further.` });
    }
  }

  const newDueDateStr = newDueDate.toISOString();

  try {
    db.prepare('UPDATE loans SET due_date = ? WHERE id = ?').run(newDueDateStr, loan.id);
    
    // Update reminder SMS
    cancelMessagesByPrefix([`Library:loan:${loan.id}:rem`, `Library:loan:${loan.id}:overdue`]).then(() => {
      const settings = db.prepare('SELECT key, value FROM settings').all() as any[];
      const getSetting = (key: string) => settings.find(s => s.key === key)?.value;
      const remTemplate = getSetting('sms_reminder_template') || '';
      const remOffset = parseInt(getSetting('sms_reminder_offset_days') || '3');
      
      const reminderDate = new Date(newDueDate);
      reminderDate.setDate(reminderDate.getDate() - remOffset);
      reminderDate.setHours(9, 0, 0, 0);

      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const extensionUrl = `${appUrl}/extend/${loan.extension_token}`;

      const [firstName, ...surnameParts] = loan.user_name.split(' ');
      const surname = surnameParts.join(' ');
      
      const book = db.prepare('SELECT title FROM books WHERE id = ?').get(loan.book_id) as any;

      const day = String(newDueDate.getDate()).padStart(2, '0');
      const month = String(newDueDate.getMonth() + 1).padStart(2, '0');
      const year = newDueDate.getFullYear();
      const formattedDueDate = `${day}/${month}/${year}`;

      const remMsg = remTemplate
        .replace('{name}', firstName)
        .replace('{title}', book.title)
        .replace('{due_date}', formattedDueDate)
        .replace('{url}', extensionUrl);

      const formatSheetDate = (date: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
      };

      appendToLog([{
        logTime: formatSheetDate(new Date()),
        firstName,
        surname,
        number: loan.user_phone,
        email: loan.user_email,
        scheduledTime: formatSheetDate(reminderDate),
        message: remMsg,
        status: 'Queued',
        batchId: `Library:loan:${loan.id}:rem:${Date.now()}`
      }]).catch(console.error);
    }).catch(console.error);

    res.json({ message: 'Loan extended successfully', new_due_date: newDueDateStr });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await getLibraryMessages();
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update message
app.put('/api/messages/:rowIndex', async (req, res) => {
  const { rowIndex } = req.params;
  const { scheduledTime, message, status } = req.body;
  try {
    await updateLibraryMessage(parseInt(rowIndex), scheduledTime, message, status);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete message (Cancel)
app.delete('/api/messages/:rowIndex', async (req, res) => {
  const { rowIndex } = req.params;
  try {
    const tokenSetting = db.prepare("SELECT value FROM settings WHERE key = 'google_oauth_tokens'").get() as any;
    if (!tokenSetting || !tokenSetting.value) return res.status(400).json({error: 'Not connected'});
    
    const tokens = JSON.parse(tokenSetting.value);
    const auth = getOAuth2Client();
    auth.setCredentials(tokens);
    const sheets = google.sheets({ version: 'v4', auth });
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Log!I${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Cancelled']] },
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get active loans for return page
app.get('/api/loans/active', (req, res) => {
  const { q } = req.query;
  let query = `
    SELECT 
      l.*,
      b.title,
      b.isbn,
      b.author
    FROM loans l
    JOIN books b ON l.book_id = b.id
    WHERE l.return_date IS NULL
  `;
  const params: any[] = [];

  if (q) {
    query += ' AND (l.user_name LIKE ? OR b.title LIKE ? OR b.isbn LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  query += ' ORDER BY l.due_date ASC LIMIT 20';
  
  const loans = db.prepare(query).all(...params);
  res.json(loans);
});

// Admin Settings
app.get('/api/members/all', (req, res) => {
  const members = db.prepare('SELECT * FROM members ORDER BY surname ASC, first_name ASC').all();
  res.json(members);
});

app.get('/api/members', (req, res) => {
  const q = req.query.q as string;
  if (!q || q.length < 2) return res.json([]);
  
  const parts = q.trim().split(/\s+/);
  let queryStr = 'SELECT * FROM members WHERE ';
  const params: string[] = [];
  
  parts.forEach((part, i) => {
    if (i > 0) queryStr += ' AND ';
    queryStr += '(full_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    params.push(`%${part}%`, `%${part}%`, `%${part}%`);
  });
  
  queryStr += ' LIMIT 5';
  
  const members = db.prepare(queryStr).all(...params);
  res.json(members);
});

app.post('/api/members/sync', async (req, res) => {
  await syncDirectory();
  res.json({ message: 'Directory synced' });
});

app.get('/api/settings', (req, res) => {
  const settings = db.prepare('SELECT * FROM settings WHERE key != ?').all('google_oauth_tokens');
  const googleConnected = !!db.prepare("SELECT value FROM settings WHERE key = 'google_oauth_tokens' AND value != ''").get();
  res.json({ settings, googleConnected });
});

// Google OAuth Routes
app.get('/api/auth/google/url', (req, res) => {
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive'
    ],
    prompt: 'consent'
  });
  res.json({ url });
});

app.post('/api/admin/backup/drive', async (req, res) => {
  try {
    await backupToDrive(true);
    res.json({ message: 'Backup to Drive initiated' });
  } catch (error: any) {
    console.error('Backup route error:', error);
    res.status(500).json({ error: error.message || 'Unknown error during backup' });
  }
});

app.post('/api/admin/google/disconnect', (req, res) => {
  try {
    db.prepare("DELETE FROM settings WHERE key = 'google_oauth_tokens'").run();
    res.json({ success: true });
  } catch (error: any) {
    console.error('Disconnect route error:', error);
    res.status(500).json({ error: error.message || 'Unknown error during disconnect' });
  }
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  const oauth2Client = getOAuth2Client();
  
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('google_oauth_tokens', ?)").run(JSON.stringify(tokens));
    
    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
          <div style="text-align: center; background: white; padding: 2rem; border-radius: 1.5rem; shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <h1 style="color: #1a202c; margin-bottom: 0.5rem;">Connected!</h1>
            <p style="color: #64748b;">Google Account linked successfully. You can close this window.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 2000);
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Authentication failed');
  }
});

app.post('/api/settings', (req, res) => {
  const { settings } = req.body; // Array of { key, value }
  const stmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  const transaction = db.transaction((updates) => {
    for (const { key, value } of updates) {
      stmt.run(value, key);
    }
  });
  
  try {
    transaction(settings);
    res.json({ message: 'Settings updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all loans (Admin)
app.get('/api/loans', (req, res) => {
  const loans = db.prepare(`
    SELECT 
      l.*,
      b.title,
      b.isbn,
      CASE 
        WHEN l.return_date IS NULL AND l.due_date < CURRENT_TIMESTAMP THEN 1 
        ELSE 0 
      END as is_overdue
    FROM loans l
    JOIN books b ON l.book_id = b.id
    ORDER BY l.borrow_date DESC
  `).all();
  res.json(loans);
});

// Backup all data (Admin)
app.get('/api/admin/backup', (req, res) => {
  try {
    const books = db.prepare('SELECT * FROM books').all();
    const loans = db.prepare('SELECT * FROM loans').all();
    const members = db.prepare('SELECT * FROM members').all();
    const settings = db.prepare('SELECT * FROM settings').all();
    
    res.json({
      timestamp: new Date().toISOString(),
      data: { books, loans, members, settings }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Restore data (Admin)
app.post('/api/admin/restore', (req, res) => {
  const { data } = req.body;
  if (!data || !data.books || !data.loans) {
    return res.status(400).json({ error: 'Invalid backup data' });
  }

  const restoreTransaction = db.transaction((backupData) => {
    // Clear existing data
    db.prepare('DELETE FROM loans').run();
    db.prepare('DELETE FROM books').run();
    db.prepare('DELETE FROM members').run();
    db.prepare('DELETE FROM settings').run();

    // Restore books
    const insertBook = db.prepare(`
      INSERT INTO books (id, isbn, title, author, description, cover_url, total_copies, status, category, shelf_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const book of backupData.books) {
      insertBook.run(
        book.id, book.isbn, book.title, book.author, book.description, 
        book.cover_url, book.total_copies, book.status, book.category, book.shelf_number
      );
    }

    // Restore loans
    const insertLoan = db.prepare(`
      INSERT INTO loans (id, book_id, user_name, user_phone, user_email, borrow_date, due_date, return_date, extension_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const loan of backupData.loans) {
      insertLoan.run(
        loan.id, 
        loan.book_id, 
        loan.user_name, 
        loan.user_phone, 
        loan.user_email || null, 
        loan.borrow_date, 
        loan.due_date, 
        loan.return_date,
        loan.extension_token || null
      );
    }

    // Restore members
    if (backupData.members) {
      const insertMember = db.prepare(`
        INSERT INTO members (id, first_name, surname, full_name, phone, email, last_synced)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const member of backupData.members) {
        insertMember.run(
          member.id,
          member.first_name,
          member.surname,
          member.full_name,
          member.phone,
          member.email,
          member.last_synced
        );
      }
    }

    // Restore settings
    if (backupData.settings) {
      const insertSetting = db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
      `);
      for (const setting of backupData.settings) {
        insertSetting.run(setting.key, setting.value);
      }
    }
  });

  try {
    restoreTransaction(data);
    backupToDrive().catch(console.error);
    res.json({ message: 'Database restored successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin login (using environment variable)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'berean123'; // Fallback for dev if not set
  if (password === adminPassword) {
    res.json({ success: true, token: 'admin-token-123' });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

import * as cheerio from 'cheerio';

// Fetch book details from Bookfinder.com with Google Books / Open Library fallback
app.get('/api/fetch-book/:isbn', async (req, res) => {
  const { isbn } = req.params;
  const cleanIsbn = isbn.replace(/[-\s]/g, '');
  console.log(`Fetching details for ISBN: ${cleanIsbn}`);

  let bookData: any = {
    title: null,
    author: null,
    description: null,
    cover_url: null,
    category: null
  };

  try {
    // 1. Bookfinder.com (Primary - Best for descriptions and covers)
    try {
      const url = `https://www.bookfinder.com/isbn/${cleanIsbn}/?author=&binding=ANY&condition=ANY&currency=USD&destination=US&firstEdition=false&isbn=${cleanIsbn}&keywords=&language=EN&maxPrice=&minPrice=&noIsbn=false&noPrintOnDemand=false&publicationMaxYear=&publicationMinYear=&publisher=&bunchKey=&signed=false&title=&viewAll=false&mode=ADVANCED`;
      const bfResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      if (bfResponse.ok) {
        const html = await bfResponse.text();
        const $ = cheerio.load(html);
        
        const bfTitle = $('meta[itemprop="name"]').attr('content');
        if (bfTitle) {
          console.log(`Found on Bookfinder: ${bfTitle}`);
          bookData.title = bfTitle;
          bookData.author = $('meta[itemprop="author"]').attr('content') || null;
          
          const coverImg = $('img[src*="pictures.abebooks.com"]').attr('src');
          if (coverImg) {
            bookData.cover_url = coverImg;
          }
          
          const description = $('aside h2:contains("About the book")').next('div').text();
          if (description) {
            bookData.description = description.trim();
          }
          
          return res.json(bookData);
        }
      }
    } catch (e) {
      console.warn('Bookfinder fetch failed', e);
    }

    // 2. Google Books API (Fallback)
    try {
      const googleResponse = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`);
      if (googleResponse.ok) {
        const googleData = await googleResponse.json();
        if (googleData.items && googleData.items.length > 0) {
          const info = googleData.items[0].volumeInfo;
          console.log(`Found on Google Books: ${info.title}`);
          
          bookData.title = info.title;
          bookData.author = info.authors ? info.authors.join(', ') : null;
          bookData.description = info.description || null;
          
          // Get the best available image
          if (info.imageLinks) {
            bookData.cover_url = info.imageLinks.extraLarge || 
                                 info.imageLinks.large || 
                                 info.imageLinks.medium || 
                                 info.imageLinks.small || 
                                 info.imageLinks.thumbnail;
            
            // Google Books often returns http, upgrade to https
            if (bookData.cover_url && bookData.cover_url.startsWith('http://')) {
              bookData.cover_url = bookData.cover_url.replace('http://', 'https://');
            }
          }

          if (bookData.title) {
             return res.json(bookData);
          }
        }
      }
    } catch (e) {
      console.warn('Google Books fetch failed', e);
    }

    // 3. Open Library Search API (Fallback 2)
    try {
      const olSearchResponse = await fetch(`https://openlibrary.org/search.json?isbn=${cleanIsbn}`);
      if (olSearchResponse.ok) {
        const olSearchData = await olSearchResponse.json();
        if (olSearchData.docs && olSearchData.docs.length > 0) {
          const doc = olSearchData.docs[0];
          console.log(`Found on Open Library Search: ${doc.title}`);
          
          bookData.title = doc.title;
          bookData.author = doc.author_name ? doc.author_name.join(', ') : null;
          
          if (doc.cover_i) {
            bookData.cover_url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
          }
          
          return res.json(bookData);
        }
      }
    } catch (e) {
      console.warn('Open Library Search fetch failed', e);
    }

    // 4. Open Library Books API (Final Fallback)
    try {
      const olResponse = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`);
      if (olResponse.ok) {
        const olData = await olResponse.json();
        const data = olData[`ISBN:${cleanIsbn}`];
        
        if (data) {
          console.log(`Found on Open Library Books API: ${data.title}`);
          bookData.title = data.title;
          bookData.author = data.authors ? data.authors.map((a: any) => a.name).join(', ') : null;
          
          bookData.description = data.notes 
            ? (typeof data.notes === 'string' ? data.notes : data.notes.value)
            : (data.subjects ? `Subjects: ${data.subjects.map((s: any) => s.name).join(', ')}` : null);
          
          if (data.cover) {
            bookData.cover_url = data.cover.large || data.cover.medium;
          }

          return res.json(bookData);
        }
      }
    } catch (e) {
      console.warn('Open Library Books API fetch failed', e);
    }

    // 5. If all else fails, return empty data for AI to fill
    console.log(`All traditional lookups failed for ISBN: ${cleanIsbn}`);
    res.json(bookData);

  } catch (error: any) {
    console.error('Fetch book error:', error);
    res.status(500).json({ error: 'Failed to connect to book databases.' });
  }
});

// Proxy route for Drive images
app.get('/api/images/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const tokenSetting = db.prepare("SELECT value FROM settings WHERE key = 'google_oauth_tokens'").get() as any;
  if (!tokenSetting || !tokenSetting.value) return res.status(401).send('Not connected to Google');

  try {
    const tokens = JSON.parse(tokenSetting.value);
    const auth = getOAuth2Client();
    auth.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media',
      supportsAllDrives: true,
    }, { responseType: 'stream' });

    res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
    response.data.pipe(res);
  } catch (error) {
    res.status(404).send('Image not found');
  }
});

// Get analytics data (Admin)
app.get('/api/admin/analytics', (req, res) => {
  try {
    // 1. Borrows over time (last 30 days)
    const borrowsOverTime = db.prepare(`
      SELECT date(borrow_date) as date, COUNT(*) as count 
      FROM loans 
      WHERE borrow_date >= date('now', '-30 days')
      GROUP BY date(borrow_date)
      ORDER BY date ASC
    `).all();

    // 2. Current stats
    const currentBorrowed = db.prepare('SELECT COUNT(*) as count FROM loans WHERE return_date IS NULL').get() as any || { count: 0 };
    const overdueCount = db.prepare('SELECT COUNT(*) as count FROM loans WHERE return_date IS NULL AND due_date < CURRENT_TIMESTAMP').get() as any || { count: 0 };
    
    // 3. Top stats
    const topBook = db.prepare(`
      SELECT b.title, COUNT(*) as count 
      FROM loans l 
      JOIN books b ON l.book_id = b.id 
      GROUP BY l.book_id 
      ORDER BY count DESC 
      LIMIT 1
    `).get() as any;

    const topBorrower = db.prepare(`
      SELECT user_name, COUNT(*) as count 
      FROM loans 
      GROUP BY user_name 
      ORDER BY count DESC 
      LIMIT 1
    `).get() as any;

    const topCategory = db.prepare(`
      SELECT b.category, COUNT(*) as count 
      FROM loans l 
      JOIN books b ON l.book_id = b.id 
      WHERE b.category IS NOT NULL
      GROUP BY b.category 
      ORDER BY count DESC 
      LIMIT 1
    `).get() as any;

    // 4. Category distribution
    const categoryStats = db.prepare(`
      SELECT b.category, COUNT(*) as count 
      FROM loans l 
      JOIN books b ON l.book_id = b.id 
      WHERE b.category IS NOT NULL
      GROUP BY b.category
    `).all();

    res.json({
      borrowsOverTime,
      stats: {
        currentlyBorrowed: currentBorrowed.count,
        overdue: overdueCount.count,
        topBook: topBook ? { title: topBook.title, count: topBook.count } : null,
        topBorrower: topBorrower ? { name: topBorrower.user_name, count: topBorrower.count } : null,
        topCategory: topCategory ? { name: topCategory.category, count: topCategory.count } : null
      },
      categoryStats
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  // Initial sync from Drive
  setTimeout(() => {
    syncFromDrive().catch(console.error);
  }, 5000); // Wait 5s for DB/Auth to be ready

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
