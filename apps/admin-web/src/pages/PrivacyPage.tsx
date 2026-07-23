export function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-[var(--pd-cream)] px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--pd-red)]">PollDriver</p>
          <h1 className="mt-2 text-3xl font-bold">Política de privacidad</h1>
          <p className="mt-2 text-sm text-gray-500">Última actualización: julio 2026 · El Pollón</p>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-gray-700">
          <p>
            PollDriver es el sistema de despacho y seguimiento de repartidores de Pollería El Pollón.
            Esta política describe qué datos se tratan al usar el panel web y la app móvil de
            repartidores.
          </p>

          <h2 className="text-lg font-bold text-[var(--pd-black)]">1. Responsable</h2>
          <p>
            Pollería El Pollón (operación Chile). Contacto: canal oficial del local / WhatsApp de
            sucursal.
          </p>

          <h2 className="text-lg font-bold text-[var(--pd-black)]">2. Datos que tratamos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Cuenta: correo, nombre, teléfono, rol y sucursal.</li>
            <li>Operación: pedidos asignados, estados de entrega, tarifas cotizadas.</li>
            <li>
              Ubicación GPS del repartidor <strong>solo mientras comparte ubicación</strong> o tiene
              entregas activas, para el mapa de despacho.
            </li>
            <li>Registros técnicos de auditoría de acciones en PollDriver.</li>
          </ul>

          <h2 className="text-lg font-bold text-[var(--pd-black)]">3. Finalidad</h2>
          <p>
            Asignar y cumplir entregas a domicilio, coordinar cocina/despacho, mejorar tiempos y
            seguridad operativa. No vendemos datos a terceros con fines publicitarios.
          </p>

          <h2 className="text-lg font-bold text-[var(--pd-black)]">4. Base y retención</h2>
          <p>
            El tratamiento se basa en la relación laboral/comercial con repartidores y en la
            ejecución del servicio de delivery al cliente. Conservamos datos el tiempo necesario para
            operación, soporte y obligaciones legales.
          </p>

          <h2 className="text-lg font-bold text-[var(--pd-black)]">5. Ubicación</h2>
          <p>
            El GPS se envía a nuestro backend (Supabase del mismo proyecto de El Pollón). Puedes
            detener el compartir ubicación en la app. Marcadores “stale” dejan de considerarse en vivo
            tras un tiempo sin actualización.
          </p>

          <h2 className="text-lg font-bold text-[var(--pd-black)]">6. Encargados</h2>
          <p>
            Infraestructura: Supabase (base de datos/auth), Vercel (hosting del panel). Se aplican
            sus medidas de seguridad y contratos de tratamiento según su región.
          </p>

          <h2 className="text-lg font-bold text-[var(--pd-black)]">7. Derechos</h2>
          <p>
            Puedes solicitar acceso, rectificación o eliminación de datos de cuenta de repartidor
            contactando a la administración de El Pollón, sujeto a retención operativa legítima.
          </p>

          <h2 className="text-lg font-bold text-[var(--pd-black)]">8. Menores</h2>
          <p>PollDriver no está dirigido a menores de 18 años.</p>
        </section>
      </div>
    </div>
  );
}
