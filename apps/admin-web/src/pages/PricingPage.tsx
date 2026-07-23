import { useCallback, useEffect, useState } from 'react';
import { listBranches, type BranchOption } from '../lib/drivers';
import {
  formatClp,
  listPricingRules,
  quoteDelivery,
  upsertPricingRule,
  type DeliveryQuote,
  type PricingMode,
  type PricingRule,
  type PricingTier,
} from '../lib/pricing';

const emptyForm = (branchId = '') => ({
  branchId,
  mode: 'fixed' as PricingMode,
  baseFee: 2500,
  perKmFee: 500,
  minFee: 0,
  maxFee: '' as number | '',
  freeAbove: '' as number | '',
  maxDistanceKm: 12,
  tiersText: '[{"up_to_km":3,"fee":2000},{"up_to_km":6,"fee":3500},{"up_to_km":12,"fee":5000}]',
  useBranchFallback: true,
  isActive: true,
  notes: '',
});

export function PricingPage() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [schemaReady, setSchemaReady] = useState(true);

  const [quoteLat, setQuoteLat] = useState('');
  const [quoteLng, setQuoteLng] = useState('');
  const [quoteTotal, setQuoteTotal] = useState('15000');
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [br, rl] = await Promise.all([listBranches(), listPricingRules()]);
      setBranches(br);
      setRules(rl);
      setSchemaReady(true);
      if (!form.branchId && br[0]) {
        setForm((f) => ({ ...f, branchId: br[0].id }));
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Error';
      setError(m);
      if (/does not exist|schema cache/i.test(m)) setSchemaReady(false);
    } finally {
      setLoading(false);
    }
  }, [form.branchId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRuleIntoForm = (r: PricingRule) => {
    setForm({
      branchId: r.branchId,
      mode: r.mode,
      baseFee: r.baseFee,
      perKmFee: r.perKmFee,
      minFee: r.minFee,
      maxFee: r.maxFee ?? '',
      freeAbove: r.freeAboveOrderTotal ?? '',
      maxDistanceKm: r.maxDistanceKm,
      tiersText: JSON.stringify(r.tiers.length ? r.tiers : [], null, 0),
      useBranchFallback: r.useBranchTextFallback,
      isActive: r.isActive,
      notes: r.notes,
    });
  };

  const onSave = async () => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      if (!form.branchId) throw new Error('Elige sucursal');
      let tiers: PricingTier[] = [];
      if (form.mode === 'tiers') {
        tiers = JSON.parse(form.tiersText || '[]') as PricingTier[];
        if (!Array.isArray(tiers)) throw new Error('Tiers debe ser un array JSON');
      }
      await upsertPricingRule({
        branchId: form.branchId,
        mode: form.mode,
        baseFee: Number(form.baseFee) || 0,
        perKmFee: Number(form.perKmFee) || 0,
        minFee: Number(form.minFee) || 0,
        maxFee: form.maxFee === '' ? null : Number(form.maxFee),
        freeAbove: form.freeAbove === '' ? null : Number(form.freeAbove),
        maxDistanceKm: Number(form.maxDistanceKm) || 12,
        tiers,
        useBranchFallback: form.useBranchFallback,
        isActive: form.isActive,
        notes: form.notes,
      });
      setMsg('Regla guardada. branches.delivery_cost no se modificó.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const onQuote = async () => {
    setError('');
    setQuote(null);
    try {
      if (!form.branchId) throw new Error('Elige sucursal');
      const lat = quoteLat.trim() ? Number(quoteLat) : null;
      const lng = quoteLng.trim() ? Number(quoteLng) : null;
      const q = await quoteDelivery({
        branchId: form.branchId,
        destLat: lat,
        destLng: lng,
        orderTotal: Number(quoteTotal) || 0,
      });
      setQuote(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cotizar');
    }
  };

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name || id.slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tarifas delivery</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cotización PollDriver · <strong>no altera</strong> <code>branches.delivery_cost</code> (TEXT)
        </p>
      </div>

      {!schemaReady && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Ejecuta <code>015_pd_pricing.sql</code> en Supabase (ver <code>docs/FASE8_PRICING.md</code>).
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{msg}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="text-sm font-bold uppercase text-gray-500">Regla por sucursal</h2>

          <label className="block text-xs font-bold uppercase text-gray-400">
            Sucursal
            <select
              className="pd-input mt-1"
              value={form.branchId}
              onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
            >
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-bold uppercase text-gray-400">
            Modo
            <select
              className="pd-input mt-1"
              value={form.mode}
              onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as PricingMode }))}
            >
              <option value="fixed">Fijo</option>
              <option value="per_km">Base + por km</option>
              <option value="tiers">Tramos (tiers)</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold uppercase text-gray-400">
              Base CLP
              <input
                className="pd-input mt-1"
                type="number"
                value={form.baseFee}
                onChange={(e) => setForm((f) => ({ ...f, baseFee: Number(e.target.value) }))}
              />
            </label>
            <label className="text-xs font-bold uppercase text-gray-400">
              Por km
              <input
                className="pd-input mt-1"
                type="number"
                value={form.perKmFee}
                disabled={form.mode !== 'per_km'}
                onChange={(e) => setForm((f) => ({ ...f, perKmFee: Number(e.target.value) }))}
              />
            </label>
            <label className="text-xs font-bold uppercase text-gray-400">
              Mínimo
              <input
                className="pd-input mt-1"
                type="number"
                value={form.minFee}
                onChange={(e) => setForm((f) => ({ ...f, minFee: Number(e.target.value) }))}
              />
            </label>
            <label className="text-xs font-bold uppercase text-gray-400">
              Máximo
              <input
                className="pd-input mt-1"
                type="number"
                value={form.maxFee}
                placeholder="opcional"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxFee: e.target.value === '' ? '' : Number(e.target.value),
                  }))
                }
              />
            </label>
            <label className="text-xs font-bold uppercase text-gray-400">
              Gratis desde pedido
              <input
                className="pd-input mt-1"
                type="number"
                value={form.freeAbove}
                placeholder="opcional"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    freeAbove: e.target.value === '' ? '' : Number(e.target.value),
                  }))
                }
              />
            </label>
            <label className="text-xs font-bold uppercase text-gray-400">
              Máx. km
              <input
                className="pd-input mt-1"
                type="number"
                value={form.maxDistanceKm}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxDistanceKm: Number(e.target.value) }))
                }
              />
            </label>
          </div>

          {form.mode === 'tiers' && (
            <label className="block text-xs font-bold uppercase text-gray-400">
              Tiers JSON
              <textarea
                className="pd-input mt-1 min-h-24 font-mono text-xs"
                value={form.tiersText}
                onChange={(e) => setForm((f) => ({ ...f, tiersText: e.target.value }))}
              />
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.useBranchFallback}
              onChange={(e) => setForm((f) => ({ ...f, useBranchFallback: e.target.checked }))}
            />
            Si no hay GPS, usar monto numérico de <code>delivery_cost</code> (solo lectura)
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Activa
          </label>

          <button type="button" className="pd-btn w-full" disabled={busy} onClick={() => void onSave()}>
            {busy ? 'Guardando…' : 'Guardar regla'}
          </button>
        </section>

        <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="text-sm font-bold uppercase text-gray-500">Probar cotización</h2>
          <p className="text-xs text-gray-500">
            Usa lat/lng del cliente (opcional). Sin coords → base o fallback de sucursal.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold uppercase text-gray-400">
              Lat destino
              <input
                className="pd-input mt-1"
                value={quoteLat}
                onChange={(e) => setQuoteLat(e.target.value)}
                placeholder="-20.23"
              />
            </label>
            <label className="text-xs font-bold uppercase text-gray-400">
              Lng destino
              <input
                className="pd-input mt-1"
                value={quoteLng}
                onChange={(e) => setQuoteLng(e.target.value)}
                placeholder="-70.15"
              />
            </label>
            <label className="col-span-2 text-xs font-bold uppercase text-gray-400">
              Total pedido CLP
              <input
                className="pd-input mt-1"
                value={quoteTotal}
                onChange={(e) => setQuoteTotal(e.target.value)}
              />
            </label>
          </div>
          <button type="button" className="pd-btn w-full" onClick={() => void onQuote()}>
            Cotizar
          </button>
          {quote && (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                quote.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
              }`}
            >
              <p className="text-2xl font-bold">{formatClp(quote.fee)}</p>
              <p className="mt-1 text-xs">
                {quote.distanceKm != null ? `${quote.distanceKm} km · ` : ''}
                {quote.mode} · {quote.source}
              </p>
              <p className="mt-1 text-xs">{quote.message}</p>
            </div>
          )}

          <h2 className="pt-4 text-sm font-bold uppercase text-gray-500">Reglas guardadas</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : !rules.length ? (
            <p className="text-sm text-gray-500">Ninguna aún.</p>
          ) : (
            <ul className="divide-y">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-bold">{branchName(r.branchId)}</p>
                    <p className="text-xs text-gray-500">
                      {r.mode} · base {formatClp(r.baseFee)}
                      {!r.isActive ? ' · inactiva' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-bold"
                    onClick={() => loadRuleIntoForm(r)}
                  >
                    Editar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
