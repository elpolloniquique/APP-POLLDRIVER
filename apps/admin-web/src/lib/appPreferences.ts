export type MapBasemapPref = 'streets' | 'satellite';

const KEYS = {
  basemap: 'rx_pref_basemap',
  voiceDefault: 'rx_pref_voice_default',
  preferredBranch: 'rx_pref_branch_id',
  autoFollow: 'rx_pref_auto_follow',
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function loadBasemapPref(): MapBasemapPref {
  return read(KEYS.basemap) === 'satellite' ? 'satellite' : 'streets';
}

export function saveBasemapPref(v: MapBasemapPref) {
  write(KEYS.basemap, v);
}

export function loadVoiceDefault(): boolean {
  const v = read(KEYS.voiceDefault);
  if (v === null) return false;
  return v === '1';
}

export function saveVoiceDefault(on: boolean) {
  write(KEYS.voiceDefault, on ? '1' : '0');
}

export function loadPreferredBranchId(): string | null {
  return read(KEYS.preferredBranch);
}

export function savePreferredBranchId(id: string | null) {
  if (!id) {
    try {
      localStorage.removeItem(KEYS.preferredBranch);
    } catch {
      /* ignore */
    }
    return;
  }
  write(KEYS.preferredBranch, id);
}

export function loadAutoFollow(): boolean {
  return read(KEYS.autoFollow) !== '0';
}

export function saveAutoFollow(on: boolean) {
  write(KEYS.autoFollow, on ? '1' : '0');
}
