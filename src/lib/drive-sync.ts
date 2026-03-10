import { db } from './db';

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const FILE_NAME = 'library_db.json';

let tokenClient: any;
let accessToken: string | null = null;

export async function initDriveSync() {
  const clientId = db.getSetting('google_client_id');
  if (!clientId) {
    console.warn('Google Client ID not set. Drive sync disabled.');
    return;
  }

  // Load gapi client
  await new Promise<void>((resolve) => {
    (window as any).gapi.load('client', () => {
      (window as any).gapi.client.init({}).then(resolve);
    });
  });

  // Initialize token client
  tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (tokenResponse: any) => {
      if (tokenResponse && tokenResponse.access_token) {
        accessToken = tokenResponse.access_token;
        db.updateSetting('google_oauth_tokens', JSON.stringify(tokenResponse));
        syncWithDrive();
      }
    },
  });

  // Check if we have a saved token
  const savedTokenStr = db.getSetting('google_oauth_tokens');
  if (savedTokenStr) {
    try {
      const savedToken = JSON.parse(savedTokenStr);
      if (savedToken.access_token) {
        accessToken = savedToken.access_token;
        
        // On initial load, try to download from Drive first if we haven't already in this session
        if (!sessionStorage.getItem('has_synced_from_drive')) {
          sessionStorage.setItem('has_synced_from_drive', 'true');
          downloadFromDrive().catch(() => {
            accessToken = null;
          });
        }
      }
    } catch (e) {
      console.error('Failed to parse saved token', e);
    }
  }

  // Listen for local DB updates to trigger sync
  window.addEventListener('library_db_updated', () => {
    const savedTokenStr = db.getSetting('google_oauth_tokens');
    if (!savedTokenStr) {
      accessToken = null;
    }
    if (accessToken) {
      debounceSync();
    }
  });

  window.addEventListener('force_drive_sync', () => {
    if (accessToken) {
      syncWithDrive();
    } else {
      connectGoogleDrive();
    }
  });

  window.addEventListener('force_drive_download', () => {
    if (accessToken) {
      downloadFromDrive();
    }
  });
}

export function connectGoogleDrive() {
  const clientId = db.getSetting('google_client_id');
  if (!clientId) {
    alert('Please set your Google Client ID in Settings first.');
    return;
  }
  if (tokenClient) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    initDriveSync().then(() => {
      if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }
}

export function disconnectGoogleDrive() {
  accessToken = null;
  db.updateSetting('google_oauth_tokens', '');
  alert('Disconnected from Google Drive.');
}

let syncTimeout: any;
function debounceSync() {
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncWithDrive();
  }, 5000); // 5 second debounce
}

async function syncWithDrive() {
  if (!accessToken) return;

  try {
    // 1. Find the file
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${FILE_NAME}' and trashed=false&spaces=drive`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!searchRes.ok) {
      if (searchRes.status === 401) {
        accessToken = null;
        console.warn('Drive token expired');
        return;
      }
      throw new Error('Failed to search Drive');
    }

    const searchData = await searchRes.json();
    const file = searchData.files?.[0];

    const localData = db.getDatabase();
    const localJson = JSON.stringify(localData);

    if (file) {
      // File exists, check if we need to download or upload
      // For simplicity in a client-side app, we will assume local is always newer if we just made a change.
      // But on initial load, we should download.
      // Let's just upload for now to ensure data is saved.
      // Ideally, we'd compare timestamps.
      
      const metadata = {
        name: FILE_NAME,
        mimeType: 'application/json'
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([localJson], { type: 'application/json' }));

      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=multipart`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
      });
      console.log('Synced to Google Drive (Updated)');
    } else {
      // Create new file
      const metadata = {
        name: FILE_NAME,
        mimeType: 'application/json'
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([localJson], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
      });
      console.log('Synced to Google Drive (Created)');
    }
    
    db.updateSetting('last_drive_backup', new Date().toISOString());
  } catch (err) {
    console.error('Drive sync error:', err);
  }
}

export async function downloadFromDrive() {
  if (!accessToken) return;

  try {
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${FILE_NAME}' and trashed=false&spaces=drive`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const searchData = await searchRes.json();
    const file = searchData.files?.[0];

    if (file) {
      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const remoteData = await fileRes.json();
      if (remoteData && remoteData.books) {
        db.replaceDatabase(remoteData);
        console.log('Downloaded database from Google Drive');
        window.location.reload(); // Reload to reflect changes
      }
    }
  } catch (err) {
    console.error('Drive download error:', err);
  }
}
