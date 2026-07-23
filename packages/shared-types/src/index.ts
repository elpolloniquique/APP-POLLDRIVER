/** Tipos alineados al dominio El Pollón + PollDriver */

export type ElPollonOrderEstado =
  | 'pendiente'
  | 'confirmado'
  | 'preparando'
  | 'en_delivery'
  | 'entregado'
  | 'cancelado'
  | 'listo';

export type ElPollonOrderType = 'delivery' | 'retiro' | 'reserva';

export type ElPollonRole =
  | 'super_admin'
  | 'admin_sucursal'
  | 'cajera'
  | 'cocina'
  | 'delivery'
  | 'cliente'
  | 'administrador'
  | 'repartidor';

export type PdDriverAdminStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | 'blocked';

export type PdDriverOperationalStatus =
  | 'offline'
  | 'available'
  | 'offered'
  | 'heading_to_branch'
  | 'waiting_at_branch'
  | 'carrying_orders'
  | 'delivering'
  | 'paused'
  | 'location_unavailable'
  | 'emergency';

export type PdJobStatus =
  | 'pending_prep'
  | 'ready_for_dispatch'
  | 'searching_driver'
  | 'offered'
  | 'assigned'
  | 'heading_to_branch'
  | 'at_branch'
  | 'picked_up'
  | 'delivering'
  | 'delivered'
  | 'delivery_failed'
  | 'cancelled';

export interface PdDriverLocation {
  driverProfileId: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  capturedAt: string;
  sequenceNumber?: number;
}

export interface PdDeliveryJob {
  id: string;
  sourceOrderId: string;
  branchId: string | null;
  status: PdJobStatus;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  orderTotal: number;
  ticketCode: string;
  createdAt: string;
}

/** Solo delivery entra al motor PollDriver */
export function isDispatchableOrderType(tipo: string | null | undefined): boolean {
  return (tipo || '').toLowerCase() === 'delivery';
}

/** Momento recomendado para crear job listo para oferta */
export function isReadyForDispatchEstado(estado: string | null | undefined): boolean {
  return (estado || '').toLowerCase() === 'preparando';
}
