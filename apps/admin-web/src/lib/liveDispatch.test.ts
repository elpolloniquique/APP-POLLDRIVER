import { describe, expect, it } from 'vitest';
import {
  capacityLabel,
  enrichActiveOrders,
  groupAssignmentsByDriver,
  isAtCapacity,
  type LiveAssignment,
} from './liveDispatch';

function row(partial: Partial<LiveAssignment> & Pick<LiveAssignment, 'assignmentId' | 'driverProfileId'>): LiveAssignment {
  return {
    driverName: 'Ana',
    operationalStatus: 'carrying_orders',
    maxOrders: 2,
    activeOrders: 1,
    assignedAt: '2026-07-23T10:00:00Z',
    pickedUpAt: null,
    jobId: 'j1',
    ticketCode: 'T1',
    customerName: 'Cliente',
    customerAddress: 'Calle 1',
    customerPhone: '',
    jobStatus: 'assigned',
    branchId: 'b1',
    customerLat: null,
    customerLng: null,
    deliverySequence: 1,
    orderTotal: 0,
    ...partial,
  };
}

describe('capacity helpers', () => {
  it('formats N de M', () => {
    expect(capacityLabel(1, 2)).toBe('1 de 2');
    expect(capacityLabel(2, 2)).toBe('2 de 2');
  });

  it('defaults max to 2 when invalid', () => {
    expect(capacityLabel(1, 0)).toBe('1 de 2');
    expect(isAtCapacity(2, 0)).toBe(true);
  });

  it('detects full capacity', () => {
    expect(isAtCapacity(1, 2)).toBe(false);
    expect(isAtCapacity(2, 2)).toBe(true);
  });
});

describe('groupAssignmentsByDriver', () => {
  it('groups and sorts by delivery_sequence then assigned_at', () => {
    const rows = [
      row({
        assignmentId: 'a2',
        driverProfileId: 'd1',
        ticketCode: 'B',
        deliverySequence: 2,
        assignedAt: '2026-07-23T10:01:00Z',
      }),
      row({
        assignmentId: 'a1',
        driverProfileId: 'd1',
        ticketCode: 'A',
        deliverySequence: 1,
        assignedAt: '2026-07-23T10:02:00Z',
      }),
      row({
        assignmentId: 'a3',
        driverProfileId: 'd2',
        ticketCode: 'C',
        deliverySequence: 1,
      }),
    ];
    const map = groupAssignmentsByDriver(rows);
    expect(map.get('d1')?.map((r) => r.ticketCode)).toEqual(['A', 'B']);
    expect(map.get('d2')?.length).toBe(1);
  });
});

describe('enrichActiveOrders', () => {
  it('counts active jobs per driver', () => {
    const out = enrichActiveOrders([
      row({ assignmentId: 'a1', driverProfileId: 'd1', activeOrders: 1 }),
      row({ assignmentId: 'a2', driverProfileId: 'd1', activeOrders: 1 }),
      row({ assignmentId: 'a3', driverProfileId: 'd2', activeOrders: 1 }),
    ]);
    expect(out.filter((r) => r.driverProfileId === 'd1').every((r) => r.activeOrders === 2)).toBe(
      true,
    );
    expect(out.find((r) => r.driverProfileId === 'd2')?.activeOrders).toBe(1);
  });
});
