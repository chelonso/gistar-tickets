import React, { useState, useEffect, useRef } from 'react';

// API gateway base URL
const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:3000';

interface Event {
  id: string;
  name: string;
  date: string;
  venue: string;
  base_image_url: string | null;
  qr_config: { x: number; y: number; size: number };
  created_at: string;
}

interface EventItem {
  id: string;
  event_id: string;
  name: string;
  price: number;
  description: string | null;
  is_active: boolean;
}

interface Registration {
  id: string;
  event_id: string;
  ticket_code: string;
  buyer_name: string;
  buyer_email: string;
  status: 'pending' | 'checked_in' | 'canceled';
  checked_in_at: string | null;
  created_at: string;
  events?: Event;
}

interface RegistrationItem {
  id: string;
  registration_id: string;
  event_item_id: string;
  status: 'pending' | 'claimed';
  claimed_at: string | null;
  event_items?: EventItem;
}

interface AppProps {
  onBack?: () => void;
}

export default function App({ onBack }: AppProps) {
  // Tabs
  const [activeTab, setActiveTab] = useState<'events' | 'registrations' | 'scanner' | 'config'>('events');

  // Operational states
  const [tenantId, setTenantId] = useState<string>('');
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [eventItems, setEventItems] = useState<EventItem[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  
  // UI states
  const [loading, setLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // Modals & Panels
  const [showEventModal, setShowEventModal] = useState<boolean>(false);
  const [showItemModal, setShowItemModal] = useState<boolean>(false);
  const [showRegModal, setShowRegModal] = useState<boolean>(false);
  const [showTicketDesigner, setShowTicketDesigner] = useState<Event | null>(null);

  // Scanner Operational UI states
  const [scanCodeInput, setScanCodeInput] = useState<string>('');
  const [scannedResult, setScannedResult] = useState<{
    status: 'accredited' | 'already_checked_in';
    message: string;
    registration: Registration;
    items: RegistrationItem[];
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);

  // Forms
  const [eventForm, setEventForm] = useState({
    name: '',
    date: '',
    venue: '',
    base_image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60',
    qr_config: { x: 450, y: 150, size: 120 }
  });

  const [itemForm, setItemForm] = useState({
    event_id: '',
    name: '',
    price: '',
    description: '',
    is_active: true
  });

  const [regForm, setRegForm] = useState({
    event_id: '',
    buyer_name: '',
    buyer_email: '',
    selected_items: [] as string[] // Selected event_item_ids
  });

  // Canvas ref for composition preview
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadEventItems(selectedEventId);
    } else {
      setEventItems([]);
    }
  }, [selectedEventId]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const activeTenant = await resolveTenantId();
      if (activeTenant) {
        await Promise.all([
          loadEvents(),
          loadRegistrations()
        ]);
      }
    } catch (err: any) {
      showToast('Error cargando los datos iniciales: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const resolveTenantId = async (): Promise<string> => {
    try {
      const locRes = await fetch(`${gatewayUrl}/rest/v1/locations?select=id&limit=1`, { credentials: 'include' });
      if (locRes.ok) {
        const locData = await locRes.json();
        if (locData && locData[0]?.id) {
          setTenantId(locData[0].id);
          return locData[0].id;
        }
      }
      const accRes = await fetch(`${gatewayUrl}/rest/v1/accounts?select=tenant_id&limit=1`, { credentials: 'include' });
      if (accRes.ok) {
        const accData = await accRes.json();
        if (accData && accData[0]?.tenant_id) {
          setTenantId(accData[0].tenant_id);
          return accData[0].tenant_id;
        }
      }
      // Fail-safe default for local dev
      const mockTenant = 'd1a2f3e4-5b6c-7d8e-9f0a-1b2c3d4e5f6a';
      setTenantId(mockTenant);
      return mockTenant;
    } catch (err) {
      const mockTenant = 'd1a2f3e4-5b6c-7d8e-9f0a-1b2c3d4e5f6a';
      setTenantId(mockTenant);
      return mockTenant;
    }
  };

  const loadEvents = async () => {
    try {
      const res = await fetch(`${gatewayUrl}/rest/v1/events?order=date.asc`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
        if (data.length > 0 && !selectedEventId) {
          setSelectedEventId(data[0].id);
        }
      }
    } catch (err: any) {
      showToast('Error al cargar eventos: ' + err.message, 'error');
    }
  };

  const loadEventItems = async (eventId: string) => {
    try {
      const res = await fetch(`${gatewayUrl}/rest/v1/event_items?event_id=eq.${eventId}`, { credentials: 'include' });
      if (res.ok) {
        setEventItems(await res.json());
      }
    } catch (err: any) {
      showToast('Error al cargar productos del evento: ' + err.message, 'error');
    }
  };

  const loadRegistrations = async () => {
    try {
      const res = await fetch(`${gatewayUrl}/rest/v1/registrations?select=*,events(*)&order=created_at.desc`, { credentials: 'include' });
      if (res.ok) {
        setRegistrations(await res.json());
      }
    } catch (err: any) {
      showToast('Error al cargar acreditaciones: ' + err.message, 'error');
    }
  };

  // Event handlers
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.name || !eventForm.date || !eventForm.venue) {
      showToast('Por favor completa todos los campos obligatorios', 'error');
      return;
    }

    try {
      const res = await fetch(`${gatewayUrl}/rest/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          name: eventForm.name,
          date: new Date(eventForm.date).toISOString(),
          venue: eventForm.venue,
          base_image_url: eventForm.base_image_url || null,
          qr_config: eventForm.qr_config,
          tenant_id: tenantId
        }),
        credentials: 'include'
      });

      if (res.ok) {
        showToast('Evento creado exitosamente', 'success');
        setShowEventModal(false);
        setEventForm({
          name: '',
          date: '',
          venue: '',
          base_image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60',
          qr_config: { x: 450, y: 150, size: 120 }
        });
        await loadEvents();
      } else {
        throw new Error(await res.text());
      }
    } catch (err: any) {
      showToast('Error al crear evento: ' + err.message, 'error');
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const eventId = itemForm.event_id || selectedEventId;
    if (!eventId || !itemForm.name || !itemForm.price) {
      showToast('Completa los campos obligatorios', 'error');
      return;
    }

    try {
      const res = await fetch(`${gatewayUrl}/rest/v1/event_items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          event_id: eventId,
          name: itemForm.name,
          price: parseFloat(itemForm.price),
          description: itemForm.description || null,
          is_active: itemForm.is_active,
          tenant_id: tenantId
        }),
        credentials: 'include'
      });

      if (res.ok) {
        showToast('Producto agregado al catálogo', 'success');
        setShowItemModal(false);
        setItemForm({
          event_id: '',
          name: '',
          price: '',
          description: '',
          is_active: true
        });
        await loadEventItems(eventId);
      } else {
        throw new Error(await res.text());
      }
    } catch (err: any) {
      showToast('Error creando producto: ' + err.message, 'error');
    }
  };

  const handleCreateRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    const eventId = regForm.event_id || selectedEventId;
    if (!eventId || !regForm.buyer_name || !regForm.buyer_email) {
      showToast('Completa los campos de registro', 'error');
      return;
    }

    try {
      // Generate a clean ticket code: EVT-RANDOM
      const uniqueCode = `EVT-${Math.floor(100000 + Math.random() * 900000)}`;

      // 1. Create registration
      const regRes = await fetch(`${gatewayUrl}/rest/v1/registrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          event_id: eventId,
          ticket_code: uniqueCode,
          buyer_name: regForm.buyer_name,
          buyer_email: regForm.buyer_email,
          status: 'pending',
          tenant_id: tenantId
        }),
        credentials: 'include'
      });

      if (!regRes.ok) {
        throw new Error(await regRes.text());
      }

      const createdReg = await regRes.json();
      const registrationId = createdReg[0].id;

      // 2. Associate selected items
      if (regForm.selected_items.length > 0) {
        const itemInserts = regForm.selected_items.map(itemId => ({
          registration_id: registrationId,
          event_item_id: itemId,
          status: 'pending',
          tenant_id: tenantId
        }));

        await fetch(`${gatewayUrl}/rest/v1/registration_items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(itemInserts),
          credentials: 'include'
        });
      }

      showToast('Ticket registrado con éxito', 'success');
      setShowRegModal(false);
      setRegForm({
        event_id: '',
        buyer_name: '',
        buyer_email: '',
        selected_items: []
      });
      await loadRegistrations();
    } catch (err: any) {
      showToast('Error registrando ticket: ' + err.message, 'error');
    }
  };

  // Scan Validation Request
  const handleScanValidate = async (code: string) => {
    if (!code) return;
    setIsScanning(true);
    setScanError(null);
    setScannedResult(null);

    try {
      const res = await fetch(`${gatewayUrl}/api/tickets/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ticket_code: code }),
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok) {
        setScannedResult(data);
        if (data.status === 'accredited') {
          showToast('¡Acreditado con éxito!', 'success');
        } else {
          showToast('Acreditación repetida', 'info');
        }
      } else {
        setScanError(data.error || 'Código inválido');
        showToast(data.error || 'Error al validar', 'error');
      }
    } catch (err: any) {
      setScanError(err.message);
      showToast('Error de red: ' + err.message, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // Claim item handler
  const handleClaimItem = async (regItemId: string) => {
    try {
      const res = await fetch(`${gatewayUrl}/api/tickets/claim-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ registration_item_id: regItemId }),
        credentials: 'include'
      });

      if (res.ok) {
        showToast('Producto entregado con éxito', 'success');
        // Refresh scanned result item list
        if (scannedResult) {
          const updatedItems = scannedResult.items.map(item => {
            if (item.id === regItemId) {
              return { ...item, status: 'claimed', claimed_at: new Date().toISOString() };
            }
            return item;
          });
          setScannedResult({ ...scannedResult, items: updatedItems as any });
        }
        await loadRegistrations();
      } else {
        const data = await res.json();
        showToast(data.error || 'No se pudo entregar', 'error');
      }
    } catch (err: any) {
      showToast('Error entregando combo: ' + err.message, 'error');
    }
  };

  // Composes ticket base image + QR code into Canvas preview
  const handleDrawTicket = (event: Event, ticketCode: string) => {
    setShowTicketDesigner(event);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = event.base_image_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60';
      
      img.onload = () => {
        // Match canvas dimensions to image size
        canvas.width = 600;
        canvas.height = 200;
        ctx.drawImage(img, 0, 0, 600, 200);

        // Draw Ticket Code
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Courier New';
        ctx.fillText(`COD: ${ticketCode}`, 30, 175);
        ctx.fillText(event.name.toUpperCase(), 30, 45);

        // Compose QR code simulation
        const qrSize = event.qr_config.size || 100;
        // Transform coords to preview proportions (600x200 canvas scale)
        const qrX = Math.min(event.qr_config.x || 450, 480);
        const qrY = Math.min(event.qr_config.y || 40, 80);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(qrX, qrY, qrSize, qrSize);

        // Draw QR patterns
        ctx.fillStyle = '#08060d';
        ctx.fillRect(qrX + 10, qrY + 10, qrSize - 20, qrSize - 20);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(qrX + 25, qrY + 25, qrSize - 50, qrSize - 50);
        ctx.fillStyle = '#08060d';
        ctx.fillRect(qrX + 35, qrY + 35, qrSize - 70, qrSize - 70);
      };
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center bg-slate-50 font-mono text-xs uppercase tracking-widest text-slate-400 min-h-screen">
        Cargando Módulo de Tickets...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl text-white font-medium flex items-center gap-2 animate-slide-in ${
          toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-rose-600' : 'bg-blue-600'
        }`}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Navigation Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button 
                onClick={onBack}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                title="Volver a la consola principal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-slate-900">
                GISTAR <span className="text-[#FF8000]">TICKETS</span>
              </span>
              <span className="text-xs bg-[#FF8000]/10 text-[#FF8000] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                Sub-App
              </span>
            </div>
          </div>
          <nav className="flex gap-1">
            <button
              onClick={() => setActiveTab('events')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'events' ? 'bg-[#FF8000] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Eventos
            </button>
            <button
              onClick={() => setActiveTab('registrations')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'registrations' ? 'bg-[#FF8000] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Acreditados
            </button>
            <button
              onClick={() => setActiveTab('scanner')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'scanner' ? 'bg-[#FF8000] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Control Acceso (QR)
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'config' ? 'bg-[#FF8000] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Catálogos
            </button>
          </nav>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        
        {/* ==================================================================== */}
        {/* EVENTS TAB */}
        {/* ==================================================================== */}
        {activeTab === 'events' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Eventos Registrados</h1>
                <p className="text-sm text-slate-500">Administra los eventos de acreditación de tu organización</p>
              </div>
              <button
                onClick={() => setShowEventModal(true)}
                className="bg-[#FF8000] text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-[#E07000] transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Crear Evento
              </button>
            </div>

            {events.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
                <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h3 className="text-lg font-bold text-slate-800">No hay eventos configurados</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">Crea tu primer evento para configurar tickets y acreditación QR.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map(event => (
                  <div key={event.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                    <div className="h-40 bg-slate-100 relative">
                      <img 
                        src={event.base_image_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60'} 
                        alt={event.name} 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent flex items-end p-4">
                        <span className="text-white text-xs bg-slate-900/40 backdrop-blur px-2.5 py-1 rounded font-mono font-semibold">
                          {new Date(event.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-950 line-clamp-1">{event.name}</h3>
                        <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {event.venue}
                        </p>
                      </div>
                      <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                        <button
                          onClick={() => handleDrawTicket(event, 'TEST-123456')}
                          className="flex-1 text-center bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-xs font-bold transition-colors"
                        >
                          Ver Entrada (QR)
                        </button>
                        <button
                          onClick={() => {
                            setSelectedEventId(event.id);
                            setActiveTab('config');
                          }}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors"
                          title="Gestionar Catálogo"
                        >
                          🎁
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* REGISTRATIONS TAB */}
        {/* ==================================================================== */}
        {activeTab === 'registrations' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Registro de Entradas</h1>
                <p className="text-sm text-slate-500">Visualiza tickets emitidos y canje de combos asociados</p>
              </div>
              <button
                onClick={() => {
                  if (events.length === 0) {
                    showToast('Debes crear un evento primero', 'error');
                    return;
                  }
                  setShowRegModal(true);
                }}
                className="bg-[#FF8000] text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-[#E07000] transition-colors flex items-center gap-2"
              >
                🧾 Emitir Entrada (Manual)
              </button>
            </div>

            {registrations.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
                <h3 className="text-lg font-bold text-slate-800">No hay acreditados</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">Registra participantes manualmente o simula una venta.</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-4">Evento</th>
                      <th className="px-6 py-4">Comprador</th>
                      <th className="px-6 py-4">Código Ticket</th>
                      <th className="px-6 py-4">Estado Acceso</th>
                      <th className="px-6 py-4">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {registrations.map(reg => (
                      <tr key={reg.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4">
                          <span className="font-semibold text-slate-900">{reg.events?.name}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-800">{reg.buyer_name}</div>
                          <div className="text-xs text-slate-400 font-mono">{reg.buyer_email}</div>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-slate-600">{reg.ticket_code}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                            reg.status === 'checked_in' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : reg.status === 'canceled' 
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {reg.status === 'checked_in' ? 'Acreditado' : reg.status === 'canceled' ? 'Cancelado' : 'Pendiente'}
                          </span>
                          {reg.checked_in_at && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              {new Date(reg.checked_in_at).toLocaleTimeString('es-ES')}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleDrawTicket(reg.events!, reg.ticket_code)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs px-2.5 py-1.5 rounded-lg transition-colors font-bold"
                          >
                            Visualizar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* CONTROL DE ACCESO (QR SCANNER) */}
        {/* ==================================================================== */}
        {activeTab === 'scanner' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Escanear Ticket QR</h1>
              <p className="text-sm text-slate-500">Valida la acreditación de entrada y gestiona el canje de productos asociados</p>
            </div>

            {/* Simulated QR Scan Area */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-md p-6 space-y-6 flex flex-col items-center">
              
              {/* Virtual Scanner Screen */}
              <div className="w-full h-64 bg-slate-950 rounded-xl relative overflow-hidden flex flex-col items-center justify-center border-4 border-slate-900">
                
                {isCameraActive ? (
                  <>
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs flex flex-col items-center justify-center">
                      {/* Laser Line Animation placeholder */}
                      <div className="w-48 h-48 border-2 border-dashed border-[#FF8000] rounded-lg relative flex items-center justify-center animate-pulse">
                        <div className="absolute w-full h-1 bg-[#FF8000] top-1/2 left-0 shadow-lg"></div>
                      </div>
                      <span className="text-white text-xs font-bold uppercase tracking-wider mt-4">
                        Esperando Código QR...
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-white text-sm font-bold opacity-60">Cámara Inactiva</span>
                    <button
                      onClick={() => setIsCameraActive(true)}
                      className="mt-3 bg-[#FF8000] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#E07000] transition-colors"
                    >
                      Activar Cámara de Escaneo
                    </button>
                  </>
                )}

                {/* Corner Accents */}
                <div className="absolute top-4 left-4 w-4 h-4 border-t-4 border-l-4 border-white"></div>
                <div className="absolute top-4 right-4 w-4 h-4 border-t-4 border-r-4 border-white"></div>
                <div className="absolute bottom-4 left-4 w-4 h-4 border-b-4 border-l-4 border-white"></div>
                <div className="absolute bottom-4 right-4 w-4 h-4 border-b-4 border-r-4 border-white"></div>
              </div>

              {/* Manual Input (Fallback / Simulación) */}
              <div className="w-full space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Simular Escaneo (Digita el Código del Ticket)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ej. EVT-123456"
                    value={scanCodeInput}
                    onChange={(e) => setScanCodeInput(e.target.value)}
                    className="flex-1 border border-slate-200 px-4 py-3 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none font-mono uppercase font-bold text-slate-800"
                  />
                  <button
                    onClick={() => {
                      handleScanValidate(scanCodeInput.trim().toUpperCase());
                      setIsCameraActive(true);
                    }}
                    disabled={isScanning || !scanCodeInput}
                    className="bg-[#FF8000] text-white px-5 py-3 rounded-lg text-sm font-bold shadow hover:bg-[#E07000] transition-colors disabled:opacity-50"
                  >
                    {isScanning ? 'Procesando...' : 'Escanear / Validar'}
                  </button>
                </div>
              </div>
            </div>

            {/* Validation Result Screen */}
            {scannedResult && (
              <div className={`border rounded-2xl p-6 shadow-md animate-fade-in ${
                scannedResult.status === 'accredited' 
                  ? 'bg-emerald-50/70 border-emerald-200' 
                  : 'bg-amber-50/70 border-amber-200'
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className={`text-lg font-black ${
                      scannedResult.status === 'accredited' ? 'text-emerald-950' : 'text-amber-950'
                    }`}>
                      {scannedResult.status === 'accredited' ? '✅ ACREDITADO CON ÉXITO' : '⚠️ ATENCIÓN: ENTRADA YA VALIDADA'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Código: <span className="font-mono font-bold">{scannedResult.registration.ticket_code}</span>
                    </p>
                  </div>
                  <button 
                    onClick={() => setScannedResult(null)} 
                    className="text-slate-400 hover:text-slate-600 font-bold"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200/50 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-slate-400 block font-semibold">Participante</span>
                      <span className="font-bold text-slate-900">{scannedResult.registration.buyer_name}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-semibold">Evento</span>
                      <span className="font-bold text-slate-900">{scannedResult.registration.events?.name}</span>
                    </div>
                  </div>

                  {/* Associated Products Claim Section */}
                  <div className="space-y-3 pt-3 border-t border-slate-200/50">
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                      Productos / Combos asociados a entregar:
                    </h4>

                    {scannedResult.items.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No hay productos o combos asociados a esta entrada.</p>
                    ) : (
                      <div className="space-y-2">
                        {scannedResult.items.map(item => (
                          <div key={item.id} className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-100">
                            <div>
                              <div className="font-bold text-slate-800 text-sm">{item.event_items?.name}</div>
                              <div className="text-[10px] text-slate-400">{item.event_items?.description || 'Sin descripción'}</div>
                            </div>
                            <div>
                              {item.status === 'claimed' ? (
                                <div className="text-xs text-emerald-700 bg-emerald-100 font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                                  ✓ Entregado {item.claimed_at && `(${new Date(item.claimed_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })})`}
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleClaimItem(item.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                                >
                                  Entregar Combo / Producto
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {scanError && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 shadow-md flex items-center gap-3 animate-fade-in">
                <div className="text-3xl">❌</div>
                <div>
                  <h3 className="text-rose-950 font-bold text-lg">Error de Validación</h3>
                  <p className="text-rose-700 text-sm">{scanError}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* CATALOGS / CONFIGURATION TAB */}
        {/* ==================================================================== */}
        {activeTab === 'config' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Catálogo de Eventos</h1>
                <p className="text-sm text-slate-500">Gestiona los combos, productos y precios asociados a tus eventos</p>
              </div>
              <div className="flex gap-3">
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="border border-slate-200 px-4 py-2.5 rounded-lg text-sm bg-white font-bold text-slate-700 focus:outline-none focus:border-[#FF8000]"
                >
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!selectedEventId) {
                      showToast('Debes seleccionar o crear un evento', 'error');
                      return;
                    }
                    setShowItemModal(true);
                  }}
                  className="bg-[#FF8000] text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-[#E07000] transition-colors flex items-center gap-2"
                >
                  🎁 Añadir Producto
                </button>
              </div>
            </div>

            {eventItems.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
                <h3 className="text-lg font-bold text-slate-800">No hay productos en catálogo</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">Agrega combos de comida o souvenirs que se puedan asociar a los tickets de este evento.</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-4">Nombre del Producto / Combo</th>
                      <th className="px-6 py-4">Precio</th>
                      <th className="px-6 py-4">Descripción</th>
                      <th className="px-6 py-4">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {eventItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900">{item.name}</span>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-slate-800">
                          ₲{item.price.toLocaleString('es-PY')}
                        </td>
                        <td className="px-6 py-4 text-slate-500">{item.description || 'Sin descripción'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* MODALS */}
      {/* ==================================================================== */}

      {/* CREATE EVENT MODAL (Drawer style) */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl p-6 flex flex-col justify-between border-l border-slate-200 animate-slide-in">
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-900">Crear Nuevo Evento</h2>
                <button onClick={() => setShowEventModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
              <form onSubmit={handleCreateEvent} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Nombre del Evento *</label>
                  <input
                    type="text"
                    required
                    value={eventForm.name}
                    onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none"
                    placeholder="Ej. Torneo de Invierno 2026"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Fecha del Evento *</label>
                  <input
                    type="datetime-local"
                    required
                    value={eventForm.date}
                    onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Lugar / Sede *</label>
                  <input
                    type="text"
                    required
                    value={eventForm.venue}
                    onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none"
                    placeholder="Ej. Polideportivo Central"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Imagen Base del Ticket (Fondo)</label>
                  <input
                    type="text"
                    value={eventForm.base_image_url}
                    onChange={(e) => setEventForm({ ...eventForm, base_image_url: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none"
                    placeholder="URL de imagen de fondo"
                  />
                </div>
                <div className="pt-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">Configuración Coordenadas Código QR (JSON)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 block">Posición X</span>
                      <input
                        type="number"
                        value={eventForm.qr_config.x}
                        onChange={(e) => setEventForm({ 
                          ...eventForm, 
                          qr_config: { ...eventForm.qr_config, x: parseInt(e.target.value) || 0 } 
                        })}
                        className="w-full border border-slate-200 px-2 py-1 rounded text-sm text-center"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 block">Posición Y</span>
                      <input
                        type="number"
                        value={eventForm.qr_config.y}
                        onChange={(e) => setEventForm({ 
                          ...eventForm, 
                          qr_config: { ...eventForm.qr_config, y: parseInt(e.target.value) || 0 } 
                        })}
                        className="w-full border border-slate-200 px-2 py-1 rounded text-sm text-center"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 block">Tamaño</span>
                      <input
                        type="number"
                        value={eventForm.qr_config.size}
                        onChange={(e) => setEventForm({ 
                          ...eventForm, 
                          qr_config: { ...eventForm.qr_config, size: parseInt(e.target.value) || 0 } 
                        })}
                        className="w-full border border-slate-200 px-2 py-1 rounded text-sm text-center"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowEventModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-lg text-sm font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateEvent}
                className="flex-1 bg-[#FF8000] text-white py-3 rounded-lg text-sm font-bold shadow hover:bg-[#E07000] transition-colors"
              >
                Crear Evento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD ITEM TO CATALOG MODAL */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl p-6 flex flex-col justify-between border-l border-slate-200 animate-slide-in">
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-900">Agregar Producto / Combo</h2>
                <button onClick={() => setShowItemModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
              <form onSubmit={handleCreateItem} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block font-semibold">Nombre del Combo *</label>
                  <input
                    type="text"
                    required
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none"
                    placeholder="Ej. Combo Hamburguesa + Bebida"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block font-semibold">Precio (₲) *</label>
                  <input
                    type="number"
                    required
                    value={itemForm.price}
                    onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none"
                    placeholder="Ej. 35000"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block font-semibold">Descripción</label>
                  <textarea
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none"
                    placeholder="Detalles sobre lo que incluye..."
                    rows={4}
                  />
                </div>
              </form>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowItemModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-lg text-sm font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateItem}
                className="flex-1 bg-[#FF8000] text-white py-3 rounded-lg text-sm font-bold shadow hover:bg-[#E07000] transition-colors"
              >
                Añadir Producto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMIT TICKET REGISTRATION MODAL */}
      {showRegModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl p-6 flex flex-col justify-between border-l border-slate-200 animate-slide-in">
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-900">Registrar / Emitir Ticket</h2>
                <button onClick={() => setShowRegModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
              <form onSubmit={handleCreateRegistration} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block font-semibold">Seleccionar Evento *</label>
                  <select
                    value={regForm.event_id || selectedEventId}
                    onChange={(e) => {
                      setRegForm({ ...regForm, event_id: e.target.value });
                      loadEventItems(e.target.value);
                    }}
                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none font-bold text-slate-700"
                  >
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block font-semibold">Nombre del Participante *</label>
                  <input
                    type="text"
                    required
                    value={regForm.buyer_name}
                    onChange={(e) => setRegForm({ ...regForm, buyer_name: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none"
                    placeholder="Nombre completo"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block font-semibold">Correo Electrónico *</label>
                  <input
                    type="email"
                    required
                    value={regForm.buyer_email}
                    onChange={(e) => setRegForm({ ...regForm, buyer_email: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none"
                    placeholder="correo@ejemplo.com"
                  />
                </div>

                <div className="pt-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2 font-semibold">Asociar combos / productos extra:</label>
                  {eventItems.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No hay productos en catálogo para este evento.</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50">
                      {eventItems.map(item => (
                        <label key={item.id} className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            value={item.id}
                            checked={regForm.selected_items.includes(item.id)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const updated = checked 
                                ? [...regForm.selected_items, item.id]
                                : regForm.selected_items.filter(id => id !== item.id);
                              setRegForm({ ...regForm, selected_items: updated });
                            }}
                            className="accent-[#FF8000]"
                          />
                          <span className="font-bold text-slate-800">{item.name}</span>
                          <span className="text-slate-400">({item.price.toLocaleString('es-PY')} ₲)</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </form>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowRegModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-lg text-sm font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateRegistration}
                className="flex-1 bg-[#FF8000] text-white py-3 rounded-lg text-sm font-bold shadow hover:bg-[#E07000] transition-colors"
              >
                Emitir Entrada
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TICKET VISUAL DESIGNER / PREVIEW OVERLAY */}
      {showTicketDesigner && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl w-full max-w-2xl space-y-6 animate-scale-up">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-black text-slate-900">Vista de la Entrada Virtual</h2>
              <button onClick={() => setShowTicketDesigner(null)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            
            {/* Canvas ticket rendering */}
            <div className="flex justify-center">
              <canvas ref={canvasRef} className="max-w-full rounded-xl border border-slate-200 shadow-sm"></canvas>
            </div>

            <div className="text-xs text-slate-400 text-center">
              El código QR se renderiza dinámicamente superpuesto según las coordenadas configuradas en el evento.
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowTicketDesigner(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
              >
                Cerrar Vista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
