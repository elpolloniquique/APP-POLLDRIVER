import { useCallback, useEffect, useState } from 'react';
import {
  dismissInstallPrompt,
  isAppInstalled,
  isDismissedRecently,
  isIosDevice,
  type BeforeInstallPromptEvent,
} from '../lib/pwaInstall';

type PromptMode = 'native' | 'ios' | 'manual' | null;

async function detectRelatedInstall(): Promise<boolean> {
  if (isAppInstalled()) return true;
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<Array<{ platform: string }>>;
  };
  if (typeof nav.getInstalledRelatedApps !== 'function') return false;
  try {
    const apps = await nav.getInstalledRelatedApps();
    return apps.length > 0;
  } catch {
    return false;
  }
}

export function usePwaInstall() {
  const [installed, setInstalled] = useState(() => isAppInstalled());
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<PromptMode>(null);
  const [installing, setInstalling] = useState(false);

  const hide = useCallback(() => {
    setVisible(false);
    setMode(null);
  }, []);

  const showPrompt = useCallback(
    (next: PromptMode) => {
      if (isAppInstalled() || isDismissedRecently()) {
        hide();
        return;
      }
      setMode(next);
      setVisible(true);
    },
    [hide],
  );

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (await detectRelatedInstall()) {
        if (!cancelled) {
          setInstalled(true);
          hide();
        }
        return;
      }
      if (cancelled) return;
      setInstalled(false);

      if (isDismissedRecently()) {
        hide();
        return;
      }

      // iOS no tiene beforeinstallprompt: mostrar guía de inmediato
      if (isIosDevice()) {
        showPrompt('ios');
      }
    };

    void boot();

    const onBip = (e: Event) => {
      e.preventDefault();
      const bip = e as BeforeInstallPromptEvent;
      setDeferred(bip);
      if (!isDismissedRecently() && !isAppInstalled()) {
        setMode('native');
        setVisible(true);
      }
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      hide();
    };

    const onDisplayChange = () => {
      if (isAppInstalled()) {
        setInstalled(true);
        hide();
      }
    };

    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener?.('change', onDisplayChange);

    // Chrome/Edge/Android: si no llega el evento nativo, sugerencia manual
    const t = window.setTimeout(() => {
      if (cancelled || isAppInstalled() || isDismissedRecently()) return;
      setDeferred((current) => {
        if (current) {
          setMode('native');
          setVisible(true);
        } else if (isIosDevice()) {
          setMode('ios');
          setVisible(true);
        } else {
          setMode('manual');
          setVisible(true);
        }
        return current;
      });
    }, 2200);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      mq.removeEventListener?.('change', onDisplayChange);
    };
  }, [hide, showPrompt]);

  const dismiss = useCallback(() => {
    dismissInstallPrompt();
    hide();
  }, [hide]);

  const promptInstall = useCallback(async () => {
    if (!deferred) return { ok: false as const, reason: 'no-prompt' as const };
    setInstalling(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        hide();
        return { ok: true as const };
      }
      dismissInstallPrompt();
      hide();
      return { ok: false as const, reason: 'dismissed' as const };
    } catch {
      return { ok: false as const, reason: 'error' as const };
    } finally {
      setInstalling(false);
    }
  }, [deferred, hide]);

  return {
    installed,
    visible,
    mode,
    canNativeInstall: Boolean(deferred),
    installing,
    dismiss,
    promptInstall,
  };
}
