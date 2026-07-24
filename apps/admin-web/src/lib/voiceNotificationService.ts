/** Cola de avisos por voz (Web Speech API). */

type VoiceKind =
  | 'accepted'
  | 'heading_branch'
  | 'eta_5'
  | 'near_branch'
  | 'arrived_branch'
  | 'picked_up'
  | 'heading_customer'
  | 'near_customer'
  | 'arrived_customer'
  | 'delivered'
  | 'stale';

const spoken = new Set<string>();
let enabled = true;
let unlocked = false;
const queue: string[] = [];
let speaking = false;

const PREF_KEY = 'pd_voice_alerts_on';

export function loadVoicePreference(): boolean {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v == null) return true;
    enabled = v === '1';
    return enabled;
  } catch {
    return true;
  }
}

export function setVoiceEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (!on) {
    window.speechSynthesis?.cancel();
    queue.length = 0;
    speaking = false;
  }
}

export function isVoiceEnabled(): boolean {
  return enabled;
}

/** Requiere gesto del usuario (política del navegador). */
export function unlockVoice(): void {
  unlocked = true;
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

function drain(): void {
  if (!enabled || !unlocked || speaking) return;
  const next = queue.shift();
  if (!next) return;
  speaking = true;
  const u = new SpeechSynthesisUtterance(next);
  u.lang = 'es-CL';
  u.rate = 1;
  u.onend = () => {
    speaking = false;
    drain();
  };
  u.onerror = () => {
    speaking = false;
    drain();
  };
  window.speechSynthesis.speak(u);
}

export function enqueueVoice(text: string, dedupeKey?: string): void {
  if (!enabled) return;
  if (dedupeKey) {
    if (spoken.has(dedupeKey)) return;
    spoken.add(dedupeKey);
  }
  queue.push(text);
  drain();
}

export function speakTrackingEvent(
  kind: VoiceKind,
  ctx: { driverName: string; ticket?: string; etaMin?: number },
): void {
  const name = ctx.driverName || 'Repartidor';
  const ticket = ctx.ticket ? `pedido ${ctx.ticket}` : 'un pedido';
  const key = `${kind}|${name}|${ctx.ticket || ''}`;

  const messages: Record<VoiceKind, string> = {
    accepted: `${ticket} aceptado por ${name}.`,
    heading_branch: `${name} está en camino a la sucursal.`,
    eta_5: `${name} llegará aproximadamente en ${ctx.etaMin ?? 5} minutos.`,
    near_branch: `${name} está cerca de la sucursal.`,
    arrived_branch: `${name} llegó a la sucursal.`,
    picked_up: `${name} recibió el pedido.`,
    heading_customer: `${name} salió hacia el cliente.`,
    near_customer: `${name} está a trescientos metros del cliente.`,
    arrived_customer: `${name} llegó a la dirección del cliente.`,
    delivered: `${name} entregó el pedido.`,
    stale: `La ubicación de ${name} no se actualiza.`,
  };

  enqueueVoice(messages[kind], key);
}

export function clearVoiceDedupe(): void {
  spoken.clear();
}
