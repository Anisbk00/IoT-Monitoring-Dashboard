'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, AlertCircle, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QrScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onError, onClose }: QrScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<{ stop: () => Promise<void>; clear: () => void; start: (...args: unknown[]) => Promise<void> } | null>(null);
  const isRunningRef = useRef(false);
  const isStoppingRef = useRef(false);
  const mountedRef = useRef(true);
  const [isStarting, setIsStarting] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Properly stop the scanner (await stop() BEFORE calling clear())
  const stopScanner = useCallback(async () => {
    if (isStoppingRef.current || !html5QrRef.current) return;
    isStoppingRef.current = true;

    try {
      if (isRunningRef.current && html5QrRef.current) {
        await html5QrRef.current.stop();
        isRunningRef.current = false;
      }
    } catch (err) {
      // Scanner may already be stopped - that's fine
      isRunningRef.current = false;
    }

    try {
      if (html5QrRef.current) {
        html5QrRef.current.clear();
      }
    } catch (err) {
      // clear() may fail if already cleared - ignore
    }

    html5QrRef.current = null;
    isStoppingRef.current = false;

    // Clean up DOM elements that html5-qrcode creates
    const scannerEl = document.getElementById('qr-scanner-element');
    if (scannerEl) scannerEl.remove();
    const shadedRegion = document.getElementById('qr-shaded-region');
    if (shadedRegion) shadedRegion.remove();
  }, []);

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || html5QrRef.current || isStoppingRef.current) return;

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scannerId = 'qr-scanner-element';

      // Check component is still mounted after async import
      if (!mountedRef.current || !scannerRef.current) return;

      // Clean up any leftover scanner element from previous instances
      const existingEl = document.getElementById(scannerId);
      if (existingEl) existingEl.remove();

      // Create fresh scanner element
      const el = document.createElement('div');
      el.id = scannerId;
      scannerRef.current.appendChild(el);

      const scanner = new Html5Qrcode(scannerId);
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: Math.min(250, window.innerWidth - 80), height: Math.min(250, window.innerWidth - 80) },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          // Successfully scanned
          if (!mountedRef.current) return;

          // Notify parent first
          onScan(decodedText);

          // Then properly stop the scanner
          if (isRunningRef.current && html5QrRef.current) {
            isRunningRef.current = false;
            scanner.stop()
              .then(() => {
                try { scanner.clear(); } catch {}
                if (html5QrRef.current === scanner) {
                  html5QrRef.current = null;
                }
              })
              .catch(() => {
                try { scanner.clear(); } catch {}
                if (html5QrRef.current === scanner) {
                  html5QrRef.current = null;
                }
              });
          }
        },
        () => {
          // QR code not found in frame (ignore - fires continuously)
        }
      );

      // Check still mounted after async start
      if (!mountedRef.current) {
        // Component unmounted while starting - clean up immediately
        if (isRunningRef.current) {
          scanner.stop().then(() => scanner.clear()).catch(() => {
            try { scanner.clear(); } catch {}
          });
        }
        return;
      }

      isRunningRef.current = true;
      setIsStarting(false);
    } catch (err: any) {
      if (!mountedRef.current) return;
      setIsStarting(false);
      html5QrRef.current = null;
      isRunningRef.current = false;
      const msg = err?.message || 'Camera access denied or not available';
      setErrorMsg(msg);
      onError?.(msg);
    }
  }, [onScan, onError]);

  useEffect(() => {
    mountedRef.current = true;
    startScanner();

    return () => {
      mountedRef.current = false;
      // Cleanup on unmount - must be async-safe
      if (html5QrRef.current && isRunningRef.current) {
        const scanner = html5QrRef.current;
        isRunningRef.current = false;
        html5QrRef.current = null;
        // Properly chain stop -> clear
        scanner.stop()
          .then(() => {
            try { scanner.clear(); } catch {}
          })
          .catch(() => {
            try { scanner.clear(); } catch {}
          });
      } else if (html5QrRef.current) {
        try { html5QrRef.current.clear(); } catch {}
        html5QrRef.current = null;
      }
      // Remove scanner DOM element
      const el = document.getElementById('qr-scanner-element');
      if (el) el.remove();
    };
  }, [startScanner]);

  const handleRetry = async () => {
    setErrorMsg('');
    setIsStarting(true);

    // Fully stop current scanner first
    await stopScanner();

    // Small delay to ensure DOM is clean
    await new Promise(resolve => setTimeout(resolve, 300));

    if (mountedRef.current) {
      startScanner();
    }
  };

  const handleClose = async () => {
    await stopScanner();
    onClose();
  };

  return (
    <div className="space-y-3">
      <div
        ref={scannerRef}
        className="relative w-full max-w-[300px] mx-auto rounded-xl overflow-hidden bg-black/5 border border-border"
        style={{ minHeight: isStarting ? '300px' : 'auto' }}
      >
        {isStarting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 z-10">
            <ScanLine className="h-8 w-8 text-emerald-500 animate-pulse mb-2" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-destructive font-medium">Camera Error</p>
              <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={handleRetry}>
              Retry
            </Button>
            <Button variant="outline" size="sm" onClick={handleClose}>
              <X className="h-3 w-3 mr-1" />
              Close Scanner
            </Button>
          </div>
        </div>
      )}

      {!errorMsg && !isStarting && (
        <div className="flex items-center justify-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs text-center text-muted-foreground">
            Point your camera at the QR code on your device
          </p>
        </div>
      )}
    </div>
  );
}
