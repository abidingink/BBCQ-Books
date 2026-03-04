import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff } from 'lucide-react';

interface ScannerProps {
  onScan: (decodedText: string) => void;
}

export default function Scanner({ onScan }: ScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const scannerId = "reader";
    const html5QrCode = new Html5Qrcode(scannerId);
    html5QrCodeRef.current = html5QrCode;

    const startScanner = async () => {
      try {
        setIsInitializing(true);
        setError(null);
        
        // Try to get back camera first
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // Removed qrbox to prevent the library from adding its own dimming and white borders
          },
          (decodedText) => {
            onScanRef.current(decodedText);
          },
          () => {
            // Ignore frame errors
          }
        );
        
        // Check for flash capability
        try {
          const track = html5QrCode.getRunningTrackCapabilities();
          if (track && (track as any).torch) {
            setHasFlash(true);
          }
        } catch (e) {
          console.log("Flash not supported on this device");
        }

        setIsInitializing(false);
      } catch (err: any) {
        console.error("Failed to start scanner:", err);
        setError(err.message || "Could not access camera. Please ensure permissions are granted.");
        setIsInitializing(false);
      }
    };

    startScanner();

    return () => {
      const stopScanner = async () => {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          try {
            await html5QrCodeRef.current.stop();
            await html5QrCodeRef.current.clear();
          } catch (err) {
            // Silently fail on stop errors during unmount
            console.warn("Scanner cleanup warning:", err);
          }
        }
      };
      stopScanner();
    };
  }, []); // Empty dependency array to prevent restarts

  const toggleFlash = async () => {
    if (!html5QrCodeRef.current || !hasFlash) return;
    try {
      const newState = !isFlashOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: newState } as any]
      });
      setIsFlashOn(newState);
    } catch (err) {
      console.error("Failed to toggle flash:", err);
    }
  };

  return (
    <div className="relative w-full aspect-[4/3] bg-black rounded-2xl overflow-hidden flex flex-col items-center justify-center shadow-2xl ring-1 ring-white/10">
      <div id="reader" className="w-full h-full [&_video]:object-cover"></div>
      
      {isInitializing && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <p className="text-sm font-medium">Initializing camera...</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-6 text-center">
          <CameraOff className="w-12 h-12 text-slate-500 mb-4" />
          <p className="text-rose-400 font-medium mb-2">Camera Error</p>
          <p className="text-slate-400 text-sm">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!isInitializing && !error && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Viewfinder Cutout Overlay - Very light dimming */}
          <div className="absolute inset-0 bg-black/10">
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[180px] bg-transparent rounded-xl ring-[999px] ring-black/20"
              style={{ boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.9)' }}
            >
              {/* Corner Accents - Larger and brighter */}
              <div className="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
              <div className="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
              <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
              <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 border-emerald-400 rounded-br-lg shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
              
              {/* Scanning Line - Brighter */}
              <div className="absolute top-1/2 left-2 right-2 h-[2px] bg-emerald-300 shadow-[0_0_15px_rgba(110,231,183,1)] animate-[scan_2s_ease-in-out_infinite]"></div>
            </div>
          </div>

          <div className="absolute bottom-6 left-0 right-0 text-center">
            <p className="text-white font-bold text-sm bg-emerald-600/90 inline-block px-4 py-1.5 rounded-full shadow-lg backdrop-blur-md border border-emerald-400/30">
              Align barcode in frame
            </p>
          </div>
        </div>
      )}

      {hasFlash && !isInitializing && !error && (
        <button
          onClick={toggleFlash}
          className={`absolute top-4 right-4 p-3 rounded-full backdrop-blur-md transition-all z-20 ${
            isFlashOn ? 'bg-yellow-400 text-black shadow-[0_0_20px_rgba(250,204,21,0.5)]' : 'bg-black/50 text-white hover:bg-black/70'
          }`}
        >
          <Camera className={`w-6 h-6 ${isFlashOn ? 'fill-current' : ''}`} />
        </button>
      )}

      <style>{`
        #reader {
          width: 100% !important;
          height: 100% !important;
          border: none !important;
        }
        #reader video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 1rem !important;
        }
        /* Hide any default UI elements injected by the library */
        #qr-shaded-region {
          display: none !important;
        }
        #reader__dashboard_section_csr span {
          display: none !important;
        }
        @keyframes scan {
          0%, 100% { transform: translateY(-70px); opacity: 0.2; }
          50% { transform: translateY(70px); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
