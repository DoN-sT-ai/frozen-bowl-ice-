import { Product } from '../types';

/**
 * Intelligent barcode and SKU matcher for retail POS.
 * Handles:
 * - Exact barcode match
 * - Exact SKU match (case-insensitive)
 * - UPC-A vs EAN-13 leading-zero variances (e.g. '012345678905' <-> '12345678905')
 * - Trailing/leading whitespace and carriage returns
 */
export function findProductByCode(products: Product[], rawCode: string): Product | undefined {
  if (!rawCode) return undefined;
  const clean = rawCode.trim();
  if (!clean) return undefined;

  const cleanLower = clean.toLowerCase();

  // 1. Direct match on barcode or SKU
  let matched = products.find(
    (p) =>
      p.barcode.trim().toLowerCase() === cleanLower ||
      p.sku.trim().toLowerCase() === cleanLower
  );
  if (matched) return matched;

  // 2. Normalization for UPC-A (12 digits) vs EAN-13 (13 digits starting with 0)
  const noLeadingZeros = cleanLower.replace(/^0+/, '');
  if (noLeadingZeros) {
    matched = products.find((p) => {
      const pClean = p.barcode.trim().toLowerCase().replace(/^0+/, '');
      return pClean.length >= 6 && pClean === noLeadingZeros;
    });
    if (matched) return matched;
  }

  // 3. Match SKU without leading zeros or punctuation
  const cleanAlphanumeric = cleanLower.replace(/[^a-z0-9]/g, '');
  if (cleanAlphanumeric.length >= 3) {
    matched = products.find((p) => {
      const pSkuClean = p.sku.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const pBarcodeClean = p.barcode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return pSkuClean === cleanAlphanumeric || pBarcodeClean === cleanAlphanumeric;
    });
    if (matched) return matched;
  }

  return undefined;
}

/**
 * Realistic retail audio beeper using Web Audio API.
 * High-pitch crisp beep on success, double warning beep on error.
 */
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        sharedAudioCtx = new AudioCtx();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function playScannerBeep(type: 'success' | 'error' = 'success'): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (type === 'success') {
      // High-pitch crisp retail checkout beep (1760 Hz / A6)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);

      // Phone haptic vibration
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(60); } catch {}
      }
    } else {
      // Low dual error buzz (320 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(320, ctx.currentTime);
      gain1.gain.setValueAtTime(0.12, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.16);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([80, 50, 80]); } catch {}
      }
    }
  } catch {
    // Audio might be blocked before first user gesture
  }
}
