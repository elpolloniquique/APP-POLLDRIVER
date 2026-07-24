/** Avisos por voz en el mapa (Web Speech API, sin costo). */

const spokenKeys = new Set<string>();

export function speakArrivalAlert(driverName: string, etaMinutes: number): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const name = (driverName || 'Repartidor').trim() || 'Repartidor';
  const mins = Math.max(1, Math.round(etaMinutes));
  const nearKey = `${name.toLowerCase()}|near`;

  // Si se aleja, permitir un nuevo aviso al volver a acercarse
  if (mins > 5) {
    spokenKeys.delete(nearKey);
    return;
  }
  if (spokenKeys.has(nearKey)) return;
  spokenKeys.add(nearKey);

  const text =
    mins <= 1
      ? `Atención. El repartidor ${name} está llegando al local.`
      : `Atención. El repartidor ${name} llega en aproximadamente ${mins} minutos al local.`;

  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-CL';
    u.rate = 1;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function resetVoiceAlerts(): void {
  spokenKeys.clear();
}
