import { describe, expect, it } from 'vitest';
import {
  isDispatchableOrderType,
  isReadyForDispatchEstado,
} from './index';

describe('PollDriver shared domain', () => {
  it('solo delivery es despachable', () => {
    expect(isDispatchableOrderType('delivery')).toBe(true);
    expect(isDispatchableOrderType('retiro')).toBe(false);
    expect(isDispatchableOrderType('reserva')).toBe(false);
    expect(isDispatchableOrderType(null)).toBe(false);
  });

  it('preparando es el momento de oferta', () => {
    expect(isReadyForDispatchEstado('preparando')).toBe(true);
    expect(isReadyForDispatchEstado('confirmado')).toBe(false);
    expect(isReadyForDispatchEstado('en_delivery')).toBe(false);
  });
});
