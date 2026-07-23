import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  acceptOffer,
  confirmDelivery,
  confirmPickup,
  currentCoords,
  listActiveAssignments,
  listPendingOffers,
  rejectOffer,
  setAvailable,
  signIn,
  signOut,
  upsertLocation,
} from './src/api';
import { getSupabase, isConfigured } from './src/supabase';

type OfferRow = Awaited<ReturnType<typeof listPendingOffers>>[number];
type AsgRow = Awaited<ReturnType<typeof listActiveAssignments>>[number];

export default function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [active, setActive] = useState<AsgRow[]>([]);
  const [online, setOnline] = useState(false);
  const [gpsOn, setGpsOn] = useState(false);
  const gpsTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [o, a] = await Promise.all([listPendingOffers(), listActiveAssignments()]);
      setOffers(o);
      setActive(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    }
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setSessionReady(true);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setLoggedIn(Boolean(data.session));
      setSessionReady(true);
      if (data.session) void refresh();
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setLoggedIn(Boolean(session));
      if (session) void refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (gpsTimer.current) clearInterval(gpsTimer.current);
    };
  }, []);

  const onLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
      setMsg('Sesión iniciada');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login falló');
    } finally {
      setBusy(false);
    }
  };

  const toggleOnline = async () => {
    try {
      await setAvailable(!online);
      setOnline(!online);
      setMsg(!online ? 'Disponible para ofertas' : 'Offline');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error estado');
    }
  };

  const toggleGps = async () => {
    if (gpsOn) {
      if (gpsTimer.current) clearInterval(gpsTimer.current);
      gpsTimer.current = null;
      setGpsOn(false);
      setMsg('GPS detenido');
      return;
    }
    try {
      const asgId = (active[0] as { id?: string } | undefined)?.id;
      await upsertLocation(asgId);
      setGpsOn(true);
      setMsg('GPS activo (~cada 15s)');
      gpsTimer.current = setInterval(() => {
        const id = (active[0] as { id?: string } | undefined)?.id;
        void upsertLocation(id).catch(() => undefined);
      }, 15000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'GPS error');
    }
  };

  const privacyUrl = process.env.EXPO_PUBLIC_PRIVACY_URL || '';

  if (!sessionReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#c00000" />
      </View>
    );
  }

  if (!loggedIn) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.pad}>
          <Text style={styles.brand}>POLLDRIVER</Text>
          <Text style={styles.title}>App repartidor</Text>
          {!isConfigured() && (
            <Text style={styles.warn}>Falta EXPO_PUBLIC_SUPABASE_URL / ANON_KEY</Text>
          )}
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Correo"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            secureTextEntry
            placeholder="Contraseña"
            value={password}
            onChangeText={setPassword}
          />
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Pressable style={styles.btn} onPress={() => void onLogin()} disabled={busy}>
            <Text style={styles.btnText}>{busy ? '…' : 'Entrar'}</Text>
          </Pressable>
          {privacyUrl ? (
            <Pressable onPress={() => void Linking.openURL(privacyUrl)}>
              <Text style={styles.link}>Política de privacidad</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.row}>
          <Text style={styles.brand}>POLLDRIVER</Text>
          <Pressable onPress={() => void signOut()}>
            <Text style={styles.link}>Salir</Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <Pressable style={[styles.chip, online && styles.chipOn]} onPress={() => void toggleOnline()}>
            <Text style={styles.chipText}>{online ? 'Disponible' : 'Offline'}</Text>
          </Pressable>
          <Pressable style={[styles.chip, gpsOn && styles.chipGps]} onPress={() => void toggleGps()}>
            <Text style={styles.chipText}>{gpsOn ? 'GPS ON' : 'GPS'}</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => void refresh()}>
            <Text style={styles.chipText}>Refresh</Text>
          </Pressable>
        </View>

        {msg ? <Text style={styles.ok}>{msg}</Text> : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}

        <Text style={styles.section}>Ofertas</Text>
        {!offers.length ? (
          <Text style={styles.muted}>Sin ofertas pendientes</Text>
        ) : (
          offers.map((o) => {
            const job = Array.isArray(o.pd_delivery_jobs)
              ? o.pd_delivery_jobs[0]
              : o.pd_delivery_jobs;
            return (
              <View key={String(o.id)} style={styles.card}>
                <Text style={styles.cardTitle}>
                  #{String((job as { ticket_code?: string } | null)?.ticket_code || String(o.id).slice(0, 6))}
                </Text>
                <Text style={styles.muted}>
                  {String((job as { customer_address?: string } | null)?.customer_address || '')}
                </Text>
                <View style={styles.row}>
                  <Pressable
                    style={styles.btn}
                    onPress={() =>
                      void acceptOffer(String(o.id))
                        .then(() => {
                          setMsg('Oferta aceptada');
                          return refresh();
                        })
                        .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
                    }
                  >
                    <Text style={styles.btnText}>Aceptar</Text>
                  </Pressable>
                  <Pressable
                    style={styles.btnGhost}
                    onPress={() =>
                      void rejectOffer(String(o.id))
                        .then(refresh)
                        .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
                    }
                  >
                    <Text style={styles.btnGhostText}>Rechazar</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.section}>Activos</Text>
        {!active.length ? (
          <Text style={styles.muted}>Ningún pedido asignado</Text>
        ) : (
          active.map((a) => {
            const job = Array.isArray(a.pd_delivery_jobs)
              ? a.pd_delivery_jobs[0]
              : a.pd_delivery_jobs;
            const picked = Boolean(a.picked_up_at);
            return (
              <View key={String(a.id)} style={styles.card}>
                <Text style={styles.cardTitle}>
                  #{String((job as { ticket_code?: string } | null)?.ticket_code || '')}
                </Text>
                <Text style={styles.muted}>
                  {String((job as { customer_address?: string } | null)?.customer_address || '')}
                </Text>
                <View style={styles.row}>
                  {!picked ? (
                    <Pressable
                      style={styles.btn}
                      onPress={() =>
                        void currentCoords().then((c) =>
                          confirmPickup(String(a.id), c?.lat, c?.lng)
                            .then(() => {
                              setMsg('Retiro → en_delivery');
                              return refresh();
                            })
                            .catch((e) => setError(e instanceof Error ? e.message : 'Error')),
                        )
                      }
                    >
                      <Text style={styles.btnText}>Retiré</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.btn, styles.btnGreen]}
                      onPress={() =>
                        void currentCoords().then((c) =>
                          confirmDelivery(String(a.id), c?.lat, c?.lng)
                            .then(() => {
                              setMsg('Entregado');
                              return refresh();
                            })
                            .catch((e) => setError(e instanceof Error ? e.message : 'Error')),
                        )
                      }
                    >
                      <Text style={styles.btnText}>Entregué</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#faf7f2' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: 20, gap: 12 },
  brand: { color: '#c00000', fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: '800', color: '#111827' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  btn: {
    backgroundColor: '#c00000',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnGreen: { backgroundColor: '#059669' },
  btnText: { color: '#fff', fontWeight: '800' },
  btnGhost: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  btnGhostText: { fontWeight: '700', color: '#374151' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipOn: { backgroundColor: '#059669', borderColor: '#059669' },
  chipGps: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  chipText: { fontWeight: '700', color: '#111827', fontSize: 12 },
  section: { marginTop: 8, fontWeight: '800', textTransform: 'uppercase', color: '#6b7280', fontSize: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  cardTitle: { fontSize: 18, fontWeight: '800' },
  muted: { color: '#6b7280', fontSize: 13 },
  err: { color: '#b91c1c', fontSize: 12 },
  ok: { color: '#047857', fontSize: 12 },
  warn: { color: '#92400e', backgroundColor: '#fffbeb', padding: 8, borderRadius: 8, fontSize: 12 },
  link: { color: '#c00000', fontWeight: '700', fontSize: 13 },
});
