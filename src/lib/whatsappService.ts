/**
 * WhatsApp Dispatcher Service
 * Attempts to launch the locally installed WhatsApp desktop application (via whatsapp:// protocol).
 * If not installed or if it fails, gracefully falls back to WhatsApp Web (web.whatsapp.com).
 */
export async function sendWhatsAppMessage({
  phone,
  text,
}: {
  phone: string;
  text: string;
}): Promise<{ success: boolean; method: 'app' | 'web' | 'failed'; error?: string }> {
  let cleanPhone = phone ? String(phone).replace(/\D/g, '') : '';
  if (cleanPhone.length === 10) {
    cleanPhone = `91${cleanPhone}`;
  }

  // 1. Electron Desktop Environment: invoke shell handler
  if (typeof window !== 'undefined' && window.electronAPI?.openWhatsApp) {
    try {
      const res = await window.electronAPI.openWhatsApp({ phone: cleanPhone, text });
      return {
        success: Boolean(res.success),
        method: (res.method as 'app' | 'web') || 'app',
        error: res.error,
      };
    } catch (err: any) {
      console.warn('Electron openWhatsApp failed, falling back to browser dispatcher:', err);
    }
  }

  // 2. Web Browser Environment
  const encodedText = encodeURIComponent(text);
  const appUrl = cleanPhone
    ? `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`
    : `whatsapp://send?text=${encodedText}`;
  const webUrl = cleanPhone
    ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
    : `https://web.whatsapp.com/send?text=${encodedText}`;

  try {
    let appTriggered = false;
    const blurHandler = () => {
      appTriggered = true;
    };
    window.addEventListener('blur', blurHandler, { once: true });

    // Attempt to invoke local desktop application
    window.location.href = appUrl;

    // Fallback timer: if the window remains focused after 1200ms, the local app was not handled
    setTimeout(() => {
      window.removeEventListener('blur', blurHandler);
      if (!appTriggered && document.hasFocus()) {
        window.open(webUrl, '_blank', 'noopener,noreferrer');
      }
    }, 1200);

    return { success: true, method: 'app' };
  } catch (_) {
    window.open(webUrl, '_blank', 'noopener,noreferrer');
    return { success: true, method: 'web' };
  }
}

