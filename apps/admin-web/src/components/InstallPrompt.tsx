import { Download, Share, X } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';

export function InstallPrompt() {
  const { installed, visible, mode, canNativeInstall, installing, dismiss, promptInstall } =
    usePwaInstall();

  if (installed || !visible || !mode) return null;

  const onInstall = async () => {
    if (canNativeInstall) {
      await promptInstall();
    }
  };

  return (
    <div className="rx-pwa" role="dialog" aria-labelledby="rx-pwa-title" aria-modal="false">
      <button type="button" className="rx-pwa__close" onClick={dismiss} aria-label="Cerrar">
        <X size={18} />
      </button>

      <img src="/brand/rapidex-logo.png" alt="" className="rx-pwa__logo" width={56} height={56} />

      <div className="rx-pwa__body">
        <h2 id="rx-pwa-title" className="rx-pwa__title">
          ¿Deseas instalar esta aplicación?
        </h2>
        <p className="rx-pwa__text">
          Instala RapideX en tu móvil, tablet o PC para abrirla como app, con acceso rápido desde tu
          pantalla de inicio.
        </p>

        {mode === 'ios' && (
          <ol className="rx-pwa__steps">
            <li>
              Toca <Share size={14} className="rx-pwa__inline-icon" aria-hidden />{' '}
              <strong>Compartir</strong> en Safari
            </li>
            <li>
              Elige <strong>Añadir a pantalla de inicio</strong>
            </li>
            <li>
              Confirma con <strong>Añadir</strong>
            </li>
          </ol>
        )}

        {mode === 'manual' && !canNativeInstall && (
          <p className="rx-pwa__hint">
            En el menú del navegador busca <strong>Instalar aplicación</strong> o{' '}
            <strong>Añadir a la pantalla de inicio</strong>.
          </p>
        )}

        <div className="rx-pwa__actions">
          {(mode === 'native' || canNativeInstall) && (
            <button
              type="button"
              className="rx-pwa__btn rx-pwa__btn--primary"
              onClick={onInstall}
              disabled={installing || !canNativeInstall}
            >
              <Download size={16} aria-hidden />
              {installing ? 'Instalando…' : 'Instalar RapideX'}
            </button>
          )}
          <button type="button" className="rx-pwa__btn rx-pwa__btn--ghost" onClick={dismiss}>
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
