import React, { useState, useEffect, useRef } from 'react';
import './index.css';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

// API gateway base URL
const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:3000';

interface Event {
  id: string;
  name: string;
  date: string;
  venue: string;
  base_image_url: string | null;
  qr_config: any;
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
  const [activeTab, setActiveTab] = useState<'events' | 'registrations' | 'config'>('events');

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
  const [showScannerDrawer, setShowScannerDrawer] = useState<boolean>(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');

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
  const [isCheckingIn, setIsCheckingIn] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [drawerSubView, setDrawerSubView] = useState<'scan' | 'result'>('scan');
  const drawerSubViewRef = useRef<'scan' | 'result'>('scan');

  useEffect(() => {
    drawerSubViewRef.current = drawerSubView;
  }, [drawerSubView]);

  // Auto-activate camera scanner when entering the scanner tab or opening the scanner drawer
  useEffect(() => {
    if (showScannerDrawer) {
      setIsCameraActive(true);
      setDrawerSubView('scan');
    } else {
      setIsCameraActive(false);
    }
  }, [activeTab, showScannerDrawer]);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [jsonEditorText, setJsonEditorText] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Forms
  const [eventForm, setEventForm] = useState<{
    id?: string;
    name: string;
    date: string;
    venue: string;
    base_image_url: string;
    qr_config: any;
  }>({
    name: '',
    date: '',
    venue: '',
    base_image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60',
    qr_config: {
      qr: { x: 450, y: 40, size: 100 },
      code: { x: 30, y: 175, size: 16, color: '#FFFFFF' },
      name: { x: 30, y: 45, size: 16, color: '#FFFFFF' }
    }
  });

  const [itemForm, setItemForm] = useState<{
    id?: string;
    event_id: string;
    name: string;
    price: string;
    description: string;
    is_active: boolean;
  }>({
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
  const drawerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  // Auto-draw live preview inside the drawer when inputs change
  useEffect(() => {
    if (!showEventModal || !eventForm.base_image_url || !drawerCanvasRef.current) return;

    const canvas = drawerCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = eventForm.base_image_url;

    img.onload = () => {
      const imgWidth = img.naturalWidth || 600;
      const imgHeight = img.naturalHeight || 200;
      
      canvas.width = imgWidth;
      canvas.height = imgHeight;
      
      ctx.drawImage(img, 0, 0, imgWidth, imgHeight);

      // Draw Ticket Code with proportional font size and positioning
      const fontSize = Math.max(14, Math.round(imgHeight * 0.08));
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${fontSize}px Courier New`;
      ctx.fillText('COD: PREVIEW-000000', imgWidth * 0.05, imgHeight * 0.88);
      ctx.fillText((eventForm.name || 'EVENTO DE PRUEBA').toUpperCase(), imgWidth * 0.05, imgHeight * 0.22);

      // Compose QR code using qrcode package for live preview
      const qrSize = Number(eventForm.qr_config.size) || 100;
      const qrX = Number(eventForm.qr_config.x ?? (imgWidth - qrSize - 30));
      const qrY = Number(eventForm.qr_config.y ?? (imgHeight - qrSize - 30));

      QRCode.toDataURL('PREVIEW-000000', { margin: 1, color: { dark: '#08060d', light: '#FFFFFF' } })
        .then(qrDataUrl => {
          const qrImg = new Image();
          qrImg.src = qrDataUrl;
          qrImg.onload = () => {
            ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
          };
        })
        .catch(err => {
          console.error('Error generating preview QR:', err);
        });
    };
    img.onerror = () => {
      // In case of CORS blocks or load errors, clear canvas or draw fallback text
      canvas.width = 600;
      canvas.height = 100;
      ctx.fillStyle = '#18191E';
      ctx.fillRect(0, 0, 600, 100);
      ctx.fillStyle = '#8F919A';
      ctx.font = '10px Courier New';
      ctx.fillText('FALLO AL CARGAR IMAGEN PARA PREVISUALIZACION LIVE', 30, 50);
    };
  }, [showEventModal, eventForm.base_image_url, eventForm.name, eventForm.qr_config.x, eventForm.qr_config.y, eventForm.qr_config.size]);

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

  // Camera scanner lifecycle hook (Safe instance control avoiding race conditions)
  useEffect(() => {
    let isMounted = true;
    let scannerInstance: Html5Qrcode | null = null;

    const startScanner = async () => {
      if (!showScannerDrawer || !isCameraActive) return;

      // Allow DOM settled layout time
      await new Promise(resolve => setTimeout(resolve, 150));
      if (!isMounted) return;

      const qrReaderElem = document.getElementById('qr-reader');
      if (!qrReaderElem) return;

      try {
        // Safe reset preceding ref instances
        if (qrScannerRef.current) {
          try {
            if (qrScannerRef.current.isScanning) {
              await qrScannerRef.current.stop();
            }
          } catch (e) {
            console.warn('Silent stop preceding instance:', e);
          }
          qrScannerRef.current = null;
        }

        const scanner = new Html5Qrcode("qr-reader");
        scannerInstance = scanner;
        qrScannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.7;
              return { width: size, height: size };
            }
          },
          (decodedText) => {
            if (isMounted && drawerSubViewRef.current === 'scan') {
              handleScanValidate(decodedText);
            }
          },
          (_error) => {
            // ignore scan module errors
          }
        );
      } catch (err: any) {
        console.error('Error starting camera scan:', err);
        if (isMounted) {
          showToast('Error al iniciar cámara: ' + err.message, 'error');
          setIsCameraActive(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (scannerInstance) {
        if (scannerInstance.isScanning) {
          scannerInstance.stop()
            .then(() => {
              if (qrScannerRef.current === scannerInstance) {
                qrScannerRef.current = null;
              }
            })
            .catch(err => console.error('Safe stop cleanup error:', err));
        }
      }
    };
  }, [isCameraActive, showScannerDrawer]);

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
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, subfolder: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Por favor selecciona una imagen válida.', 'error');
      return;
    }

    let recordId = eventForm.id;
    if (!recordId) {
      recordId = crypto.randomUUID();
      setEventForm(prev => ({ ...prev, id: recordId }));
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${recordId}.${fileExt}`;
    const uploadPath = `${subfolder}/${fileName}`;

    setIsUploading(true);
    try {
      const res = await fetch(`${gatewayUrl}/storage/v1/object/pictures/${uploadPath}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': file.type,
          'x-upsert': 'true'
        },
        body: file
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Error al subir la imagen');
      }

      const publicUrl = `${gatewayUrl}/storage/v1/object/public/pictures/${uploadPath}`;
      setEventForm(prev => ({ ...prev, base_image_url: publicUrl }));
      showToast('Imagen subida con éxito', 'success');
    } catch (err: any) {
      console.error('Error uploading image:', err);
      showToast('Fallo al subir la imagen: ' + err.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePreviewNewTicket = () => {
    const simulatedEvent: Event = {
      id: eventForm.id || 'PREVIEW-TEMP-ID',
      name: eventForm.name || 'EVENTO DE PRUEBA',
      date: eventForm.date || new Date().toISOString(),
      venue: eventForm.venue || 'SEDE DE PRUEBA',
      base_image_url: eventForm.base_image_url,
      qr_config: eventForm.qr_config,
      created_at: new Date().toISOString()
    };
    handleDrawTicket(simulatedEvent, 'PREVIEW-000000');
  };

  const handleJsonChange = (val: string) => {
    setJsonEditorText(val);
    try {
      const parsed = JSON.parse(val);
      setEventForm(prev => ({
        ...prev,
        qr_config: parsed
      }));
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  // Set default JSON when opening the modal (only for new events)
  useEffect(() => {
    if (showEventModal && !eventForm.id) {
      const initialJson = {
        qr: { x: 450, y: 40, size: 100 },
        code: { x: 30, y: 175, size: 16, color: '#FFFFFF' },
        name: { x: 30, y: 45, size: 16, color: '#FFFFFF' }
      };
      setEventForm(prev => ({
        ...prev,
        qr_config: initialJson
      }));
      setJsonEditorText(JSON.stringify(initialJson, null, 2));
      setJsonError(null);
    }
  }, [showEventModal, eventForm.id]);

  const handleOpenEditModal = (event: Event) => {
    // Convert YYYY-MM-DDTHH:MM:SS.SSSZ to datetime-local expected input format: YYYY-MM-DDTHH:MM
    let dateVal = '';
    if (event.date) {
      dateVal = event.date.substring(0, 16);
    }
    setEventForm({
      id: event.id,
      name: event.name,
      date: dateVal,
      venue: event.venue,
      base_image_url: event.base_image_url || '',
      qr_config: event.qr_config
    });
    setJsonEditorText(JSON.stringify(event.qr_config, null, 2));
    setJsonError(null);
    setShowEventModal(true);
  };

  const handleCloseEventModal = () => {
    setShowEventModal(false);
    setEventForm({
      id: undefined,
      name: '',
      date: '',
      venue: '',
      base_image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60',
      qr_config: {
        qr: { x: 450, y: 40, size: 100 },
        code: { x: 30, y: 175, size: 16, color: '#FFFFFF' },
        name: { x: 30, y: 45, size: 16, color: '#FFFFFF' }
      }
    });
    setJsonEditorText('');
    setJsonError(null);
  };

  const handleUpdateEvent = async (eventId: string) => {
    if (!eventForm.name || !eventForm.date || !eventForm.venue) {
      showToast('Por favor completa todos los campos obligatorios', 'error');
      return;
    }

    try {
      const res = await fetch(`${gatewayUrl}/rest/v1/events?id=eq.${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          name: eventForm.name,
          date: new Date(eventForm.date).toISOString(),
          venue: eventForm.venue,
          base_image_url: eventForm.base_image_url || null,
          qr_config: eventForm.qr_config
        }),
        credentials: 'include'
      });

      if (res.ok) {
        showToast('Evento actualizado exitosamente', 'success');
        setShowEventModal(false);
        setEventForm({
          id: undefined,
          name: '',
          date: '',
          venue: '',
          base_image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60',
          qr_config: {
            qr: { x: 450, y: 40, size: 100 },
            code: { x: 30, y: 175, size: 16, color: '#FFFFFF' },
            name: { x: 30, y: 45, size: 16, color: '#FFFFFF' }
          }
        });
        setJsonEditorText('');
        setJsonError(null);
        await loadEvents();
      } else {
        throw new Error(await res.text());
      }
    } catch (err: any) {
      showToast('Error al actualizar evento: ' + err.message, 'error');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
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
          id: eventForm.id || undefined,
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
          id: undefined,
          name: '',
          date: '',
          venue: '',
          base_image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60',
          qr_config: {
            qr: { x: 450, y: 40, size: 100 },
            code: { x: 30, y: 175, size: 16, color: '#FFFFFF' },
            name: { x: 30, y: 45, size: 16, color: '#FFFFFF' }
          }
        });
        setJsonEditorText('');
        setJsonError(null);
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
          id: undefined,
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

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const eventId = itemForm.event_id || selectedEventId;
    if (!itemForm.id || !eventId || !itemForm.name || !itemForm.price) {
      showToast('Completa los campos obligatorios', 'error');
      return;
    }

    try {
      const res = await fetch(`${gatewayUrl}/rest/v1/event_items?id=eq.${itemForm.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: itemForm.name,
          price: parseFloat(itemForm.price),
          description: itemForm.description || null,
          is_active: itemForm.is_active
        }),
        credentials: 'include'
      });

      if (res.ok) {
        showToast('Producto actualizado', 'success');
        setShowItemModal(false);
        setItemForm({
          id: undefined,
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
      showToast('Error al actualizar producto: ' + err.message, 'error');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este producto/combo del catálogo?')) {
      return;
    }

    try {
      const res = await fetch(`${gatewayUrl}/rest/v1/event_items?id=eq.${itemId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (res.ok) {
        showToast('Producto eliminado del catálogo', 'success');
        if (selectedEventId) {
          await loadEventItems(selectedEventId);
        }
      } else {
        throw new Error(await res.text());
      }
    } catch (err: any) {
      showToast('Error al eliminar producto: ' + err.message, 'error');
    }
  };

  const handleEditItem = (item: EventItem) => {
    setItemForm({
      id: item.id,
      event_id: item.event_id,
      name: item.name,
      price: item.price.toString(),
      description: item.description || '',
      is_active: item.is_active
    });
    setShowItemModal(true);
  };

  const handleNewItem = () => {
    setItemForm({
      id: undefined,
      event_id: selectedEventId,
      name: '',
      price: '',
      description: '',
      is_active: true
    });
    setShowItemModal(true);
  };

  const handleCreateRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    const eventId = regForm.event_id || selectedEventId;
    if (!eventId || !regForm.buyer_name) {
      showToast('Completa los campos obligatorios', 'error');
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

  // Scan Validation Request (Step 1: Check ticket info in database)
  const handleScanValidate = async (code: string) => {
    if (!code) return;
    setIsScanning(true);
    setScanError(null);
    setScannedResult(null);

    // Format validation
    if (!/^(EVT|PREVIEW)-\d{6}$/i.test(code)) {
      setScanError('Formato de código inválido. Debe ser EVT-###### (Ej: EVT-123456)');
      showToast('Formato de código inválido', 'error');
      setIsScanning(false);
      return;
    }

    try {
      // Fetch the registration details and join its event details
      const res = await fetch(`${gatewayUrl}/rest/v1/registrations?ticket_code=eq.${encodeURIComponent(code)}&select=*,events(*)`, {
        credentials: 'include'
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Error al buscar el ticket');
      }

      const registrations = await res.json();
      if (registrations.length === 0) {
        setScanError('Ticket inexistente o código QR inválido');
        showToast('Ticket inexistente o código QR inválido', 'error');
        return;
      }

      const registration = registrations[0];

      if (registration.status === 'canceled') {
        setScanError('Este ticket ha sido cancelado y no es válido para ingreso');
        showToast('Este ticket ha sido cancelado', 'error');
      }

      // Fetch associated products/combos for this ticket (tickets.registration_items)
      const itemsUrl = `${gatewayUrl}/rest/v1/registration_items?registration_id=eq.${registration.id}&select=*,event_items(*)`;
      const itemsRes = await fetch(itemsUrl, { credentials: 'include' });
      let registrationItems = [];
      if (itemsRes.ok) {
        registrationItems = await itemsRes.json();
      }

      setScannedResult({
        registration,
        items: registrationItems
      } as any);

      setDrawerSubView('result');

      if (registration.status === 'checked_in') {
        showToast('Atención: Entrada ya validada previamente', 'info');
      } else if (registration.status === 'pending') {
        showToast('Ticket encontrado. Haz clic en Confirmar para acreditar.', 'success');
      }

    } catch (err: any) {
      setScanError(err.message);
      showToast('Error de red: ' + err.message, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // Step 2: Confirm check-in (Acreditación)
  const handleConfirmAcreditacion = async (regId: string) => {
    setIsCheckingIn(true);
    try {
      const nowStr = new Date().toISOString();
      const res = await fetch(`${gatewayUrl}/rest/v1/registrations?id=eq.${regId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          status: 'checked_in',
          checked_in_at: nowStr,
          updated_at: nowStr
        }),
        credentials: 'include'
      });

      if (res.ok) {
        await res.json();
        showToast('¡Acreditación realizada con éxito!', 'success');
        
        // Update local scanned result state so UI refreshes
        if (scannedResult) {
          setScannedResult({
            ...scannedResult,
            registration: {
              ...scannedResult.registration,
              status: 'checked_in',
              checked_in_at: nowStr
            }
          });
        }
        await loadRegistrations();
      } else {
        const errText = await res.text();
        showToast('Error al acreditar: ' + errText, 'error');
      }
    } catch (err: any) {
      showToast('Error de red: ' + err.message, 'error');
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Claim item handler
  const handleClaimItem = async (regItemId: string) => {
    try {
      const res = await fetch(`${gatewayUrl}/tickets/claim-item`, {
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
        // Match canvas dimensions to the natural dimensions of the uploaded ticket background image
        const imgWidth = img.naturalWidth || 600;
        const imgHeight = img.naturalHeight || 200;
        
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        
        ctx.drawImage(img, 0, 0, imgWidth, imgHeight);

        // Parse JSON config sections with safe fallbacks (backwards compatible)
        const qrConfig = event.qr_config?.qr || {};
        const codeConfig = event.qr_config?.code || {};
        const nameConfig = event.qr_config?.name || {};

        // Draw Ticket Code Text
        const codeSize = Number(codeConfig.size) || Math.max(14, Math.round(imgHeight * 0.08));
        const codeColor = codeConfig.color || '#FFFFFF';
        const codeX = Number(codeConfig.x) ?? (imgWidth * 0.05);
        const codeY = Number(codeConfig.y) ?? (imgHeight * 0.88);

        ctx.fillStyle = codeColor;
        ctx.font = `bold ${codeSize}px Courier New`;
        ctx.fillText(`COD: ${ticketCode}`, codeX, codeY);

        // Draw Event Name Text
        const nameSize = Number(nameConfig.size) || Math.max(14, Math.round(imgHeight * 0.08));
        const nameColor = nameConfig.color || '#FFFFFF';
        const nameX = Number(nameConfig.x) ?? (imgWidth * 0.05);
        const nameY = Number(nameConfig.y) ?? (imgHeight * 0.22);

        ctx.fillStyle = nameColor;
        ctx.font = `bold ${nameSize}px Courier New`;
        ctx.fillText(event.name.toUpperCase(), nameX, nameY);

        // Generate real scannable QR code using qrcode package
        const qrSize = Number(qrConfig.size || event.qr_config?.size) || 100;
        const qrX = Number(qrConfig.x ?? event.qr_config?.x ?? (imgWidth - qrSize - 30));
        const qrY = Number(qrConfig.y ?? event.qr_config?.y ?? (imgHeight - qrSize - 30));

        QRCode.toDataURL(ticketCode, { margin: 1, color: { dark: '#08060d', light: '#FFFFFF' } })
          .then(qrDataUrl => {
            const qrImg = new Image();
            qrImg.crossOrigin = "anonymous";
            qrImg.src = qrDataUrl;
            qrImg.onload = () => {
              ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
            };
          })
          .catch(err => {
            console.error('Error generating real QR code:', err);
          });
      };
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center bg-canvas text-secondaryText font-mono text-xs uppercase tracking-[0.15em] min-h-screen">
        <div className="w-8 h-8 border border-divider border-t-[#FF8000] animate-spin mb-4 rounded-none"></div>
        <span className="animate-pulse">Cargando Módulo de Tickets...</span>
      </div>
    );
  }

  const filteredRegistrations = registrations.filter(reg => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (reg.buyer_name && reg.buyer_name.toLowerCase().includes(query)) ||
      (reg.buyer_email && reg.buyer_email.toLowerCase().includes(query)) ||
      (reg.ticket_code && reg.ticket_code.toLowerCase().includes(query)) ||
      (reg.events?.name && reg.events.name.toLowerCase().includes(query))
    );
  });

  return (
    <div className="flex-grow flex overflow-hidden bg-canvas text-primaryText antialiased">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-none border font-mono text-[10px] uppercase tracking-wider flex items-center gap-2 shadow-2xl animate-slide-in bg-surface ${
          toast.type === 'success' ? 'border-emerald-500/40 text-emerald-400' : toast.type === 'error' ? 'border-rose-500/40 text-rose-400' : 'border-[#FF8000]/40 text-[#FF8000]'
        }`}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* LOCAL SUB-SIDEBAR */}
      <aside className="w-16 bg-surface border-r border-divider flex flex-col items-center py-5 justify-between select-none shrink-0 text-left">
        <div className="flex flex-col gap-4">
          {/* Back to launcher grid icon */}
          {onBack && (
            <button 
              onClick={onBack}
              className="w-10 h-10 text-secondaryText hover:bg-inputBg flex items-center justify-center rounded-none cursor-pointer transition-colors"
              title="Volver al Launcher"
            >
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}
          
          {/* Eventos Icon */}
          <button 
            onClick={() => setActiveTab('events')} 
            className={`w-10 h-10 flex items-center justify-center rounded-none cursor-pointer transition-all ${activeTab === 'events' ? 'bg-[#FF8000] text-canvas' : 'text-secondaryText hover:bg-inputBg'}`}
            title="Eventos Registrados"
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Acreditados Icon */}
          <button 
            onClick={() => setActiveTab('registrations')} 
            className={`w-10 h-10 flex items-center justify-center rounded-none cursor-pointer transition-all ${activeTab === 'registrations' ? 'bg-[#FF8000] text-canvas' : 'text-secondaryText hover:bg-inputBg'}`}
            title="Acreditados y Tickets"
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            </svg>
          </button>

          {/* Control de Acceso (QR) Icon */}
          <button 
            onClick={() => {
              setScanCodeInput('');
              setScanError(null);
              setScannedResult(null);
              setShowScannerDrawer(true);
            }} 
            className={`w-10 h-10 flex items-center justify-center rounded-none cursor-pointer transition-all ${showScannerDrawer ? 'bg-[#FF8000] text-canvas' : 'text-secondaryText hover:bg-inputBg'}`}
            title="Control de Acceso (QR)"
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </button>
        </div>

        {/* Catálogos Icon at the bottom */}
        <button 
          onClick={() => setActiveTab('config')} 
          className={`w-10 h-10 flex items-center justify-center rounded-none cursor-pointer transition-all ${activeTab === 'config' ? 'bg-[#FF8000] text-canvas' : 'text-secondaryText hover:bg-inputBg'}`}
          title="Catálogos de Productos"
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </aside>

      {/* CONTENT WORKSPACE */}
      <main className="flex-grow flex flex-col overflow-hidden bg-canvas">
        
        {/* ==================================================================== */}
        {/* EVENTS TAB */}
        {/* ==================================================================== */}
        {activeTab === 'events' && (
          <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar">
            <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-divider pb-4 gap-4">
              <div>
                <h2 className="text-xl font-medium uppercase tracking-tight text-primaryText">Eventos Registrados</h2>
                <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-secondaryText mt-1">Administra los eventos de acreditación de tu organización</p>
              </div>
              <button
                onClick={() => setShowEventModal(true)}
                className="bg-[#FF8000] text-canvas px-4 py-2.5 rounded-none font-mono uppercase font-bold text-xs tracking-wider transition-all hover:bg-opacity-95 active:scale-[0.98] flex items-center gap-2 cursor-pointer"
              >
                + Crear Evento
              </button>
            </div>

            {events.length === 0 ? (
              <div className="bg-surface border border-divider p-12 text-center rounded-none">
                <svg className="w-12 h-12 text-mutedText mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h3 className="text-sm font-semibold uppercase tracking-tight text-primaryText font-sans mb-1">No hay eventos configurados</h3>
                <p className="text-[10px] text-secondaryText font-mono uppercase max-w-sm mx-auto">Crea tu primer evento para configurar tickets y acreditación QR.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map(event => (
                  <div key={event.id} className="bg-surface border border-divider rounded-none overflow-hidden relative flex flex-col justify-between min-h-[150px] group hover:bg-[#18191E]/60 transition-all">
                    {/* Top color stripe */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-[#FF8000]"></div>
                    
                    <div className="p-5 flex-grow flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-4">
                          <h3 className="text-sm font-semibold uppercase tracking-tight text-primaryText font-sans line-clamp-2 flex-grow">{event.name}</h3>
                          <span className="shrink-0 text-[8px] font-mono uppercase tracking-wider bg-[#FF8000]/10 text-[#FF8000] px-2 py-0.5 border border-[#FF8000]/30 rounded-none">
                            {new Date(event.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                        <p className="text-[10px] text-secondaryText font-mono uppercase mt-1 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-mutedText" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {event.venue}
                        </p>
                      </div>
                      <div className="mt-4 pt-4 border-t border-divider flex gap-2">
                        <button
                          onClick={() => handleDrawTicket(event, 'TEST-123456')}
                          className="flex-1 text-center bg-inputBg hover:bg-divider border border-divider text-secondaryText hover:text-white py-2 px-4 rounded-none font-mono uppercase text-[10px] tracking-wider transition-colors cursor-pointer"
                        >
                          Ver Entrada
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(event)}
                          className="px-3 py-2 bg-inputBg hover:bg-divider border border-divider text-secondaryText hover:text-white rounded-none transition-colors cursor-pointer flex items-center justify-center"
                          title="Editar Entrada (Diseño)"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedEventId(event.id);
                            setActiveTab('config');
                          }}
                          className="px-3 py-2 bg-inputBg hover:bg-divider border border-divider text-secondaryText hover:text-white rounded-none transition-colors cursor-pointer flex items-center justify-center"
                          title="Gestionar Catálogo"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
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
          <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar">
            <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-divider pb-4 gap-4">
              <div>
                <h2 className="text-xl font-medium uppercase tracking-tight text-primaryText">Registro de Entradas</h2>
                <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-secondaryText mt-1">Visualiza tickets emitidos y canje de combos asociados</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-stretch shrink-0">
                <div className="relative">
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por nombre, ticket..." 
                    className="p-2.5 bg-surface text-primaryText thin-border font-mono text-xs focus-ring rounded-none min-w-[240px]"
                  />
                </div>
                <button
                  onClick={() => {
                    setScanCodeInput('');
                    setScanError(null);
                    setScannedResult(null);
                    setShowScannerDrawer(true);
                  }}
                  className="bg-inputBg border border-divider hover:border-secondaryText text-[#FF8000] px-4 py-2.5 rounded-none font-mono uppercase font-bold text-xs tracking-wider transition-all hover:bg-opacity-95 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  QR
                </button>
                <button
                  onClick={() => {
                    if (events.length === 0) {
                      showToast('Debes crear un evento primero', 'error');
                      return;
                    }
                    setShowRegModal(true);
                  }}
                  className="bg-[#FF8000] text-canvas px-4 py-2.5 rounded-none font-mono uppercase font-bold text-xs tracking-wider transition-all hover:bg-opacity-95 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  Emitir Ticket
                </button>
              </div>
            </div>

            {filteredRegistrations.length === 0 ? (
              <div className="bg-surface border border-divider p-12 text-center rounded-none">
                <h3 className="text-sm font-semibold uppercase tracking-tight text-primaryText font-sans mb-1">
                  {searchQuery ? 'No se encontraron resultados' : 'No hay acreditados'}
                </h3>
                <p className="text-[10px] text-secondaryText font-mono uppercase max-w-sm mx-auto">
                  {searchQuery ? 'Prueba con otro término de búsqueda.' : 'Registra participantes manualmente o simula una venta.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRegistrations.map(reg => (
                  <div
                    key={reg.id}
                    className="w-full bg-surface border border-divider p-5 tickets-registration-card-grid rounded-none relative group hover:bg-[#18191E]/40 transition-colors"
                  >
                    {/* Left orange highlight stripe */}
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FF8000]" />

                    {/* Col 1: Icon & Buyer Info */}
                    <div className="flex items-center gap-4 min-w-0 w-full">
                      {/* Ticket Icon Representation */}
                      <div className="w-10 h-10 bg-[#FF8000]/10 text-[#FF8000] border border-[#FF8000]/20 font-mono font-bold flex items-center justify-center rounded-none text-xs shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                        </svg>
                      </div>

                      {/* Buyer Identity */}
                      <div className="min-w-0">
                        <span className="text-[8px] font-mono uppercase tracking-wider text-mutedText block mb-0.5">Comprador</span>
                        <div className="font-mono text-xs font-bold text-primaryText uppercase tracking-tight truncate">
                          {reg.buyer_name}
                        </div>
                        <div className="text-[10px] font-mono text-mutedText mt-0.5 truncate">
                          ✉ {reg.buyer_email || 'sin correo'}
                        </div>
                      </div>
                    </div>

                    {/* Col 2: Event Details */}
                    <div className="flex flex-col w-full">
                      <span className="text-[8px] font-mono uppercase tracking-wider text-mutedText">Evento</span>
                      <span className="font-sans text-xs font-semibold text-primaryText mt-1.5 uppercase tracking-tight truncate">
                        {reg.events?.name}
                      </span>
                    </div>

                    {/* Col 3: Ticket Code */}
                    <div className="flex flex-col w-full">
                      <span className="text-[8px] font-mono uppercase tracking-wider text-mutedText">Código Ticket</span>
                      <span className="font-mono text-xs font-bold text-[#FF8000] mt-1.5">
                        {reg.ticket_code}
                      </span>
                    </div>

                    {/* Col 4: Access State */}
                    <div className="flex flex-col w-full">
                      <span className="text-[8px] font-mono uppercase tracking-wider text-mutedText">Estado Acceso</span>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className={`px-2 py-0.5 border text-[9px] font-mono font-bold uppercase rounded-none ${
                          reg.status === 'checked_in' 
                            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400' 
                            : reg.status === 'canceled' 
                            ? 'bg-rose-950/40 border-rose-500/30 text-rose-400'
                            : 'bg-amber-950/40 border-amber-500/30 text-amber-400'
                        }`}>
                          {reg.status === 'checked_in' ? 'Acreditado' : reg.status === 'canceled' ? 'Cancelado' : 'Pendiente'}
                        </span>
                        {reg.checked_in_at && (
                          <span className="text-[9px] font-mono text-mutedText">
                            {new Date(reg.checked_in_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Col 5: Actions */}
                    <div className="flex w-full justify-start md:justify-end border-t md:border-t-0 border-divider pt-3 md:pt-0">
                      <button
                        onClick={() => handleDrawTicket(reg.events!, reg.ticket_code)}
                        className="p-1.5 bg-inputBg hover:bg-divider border border-divider text-secondaryText hover:text-white cursor-pointer transition-colors"
                        title="Visualizar Entrada"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* CATALOGS / CONFIGURATION TAB */}
        {/* ==================================================================== */}
        {activeTab === 'config' && (
          <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar">
            <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-divider pb-4 gap-4">
              <div>
                <h2 className="text-xl font-medium uppercase tracking-tight text-primaryText">Catálogo de Eventos</h2>
                <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-secondaryText mt-1">Gestiona los combos, productos y precios asociados a tus eventos</p>
              </div>
              <div className="flex gap-3">
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="bg-inputBg border border-divider px-4 py-2.5 text-xs text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none cursor-pointer"
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
                    handleNewItem();
                  }}
                  className="bg-[#FF8000] text-canvas px-4 py-2.5 rounded-none font-mono uppercase font-bold text-xs tracking-wider transition-all hover:bg-opacity-95 active:scale-[0.98] flex items-center gap-2 cursor-pointer"
                >
                  Añadir Producto
                </button>
              </div>
            </div>

            {eventItems.length === 0 ? (
              <div className="bg-surface border border-divider p-12 text-center rounded-none">
                <h3 className="text-sm font-semibold uppercase tracking-tight text-primaryText font-sans mb-1">No hay productos en catálogo</h3>
                <p className="text-[10px] text-secondaryText font-mono uppercase max-w-sm mx-auto">Agrega combos de comida o souvenirs que se puedan asociar a los tickets de este evento.</p>
              </div>
            ) : (
              <div className="bg-surface border border-divider rounded-none overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-inputBg border-b border-divider text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider">
                      <th className="px-6 py-4">Nombre del Producto / Combo</th>
                      <th className="px-6 py-4">Precio</th>
                      <th className="px-6 py-4">Descripción</th>
                      <th className="px-6 py-4">Estado</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/55 text-xs text-secondaryText font-sans">
                    {eventItems.map(item => (
                      <tr key={item.id} className="hover:bg-inputBg/40">
                        <td className="px-6 py-4">
                          <span className="font-bold text-primaryText font-sans">{item.name}</span>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-[#FF8000]">
                          ₲{item.price.toLocaleString('es-PY')}
                        </td>
                        <td className="px-6 py-4 text-secondaryText">{item.description || 'Sin descripción'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 border text-[9px] font-mono font-bold uppercase rounded-none ${
                            item.is_active ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400' : 'bg-inputBg border-divider text-mutedText'
                          }`}>
                            {item.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleEditItem(item)}
                              className="p-1.5 bg-inputBg hover:bg-divider border border-divider text-secondaryText hover:text-white cursor-pointer transition-colors"
                              title="Editar Producto"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1.5 bg-inputBg hover:bg-rose-950/20 border border-divider hover:border-rose-900/30 text-secondaryText hover:text-rose-400 cursor-pointer transition-colors"
                              title="Eliminar Producto"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
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

      {/* SCANNER DRAWER */}
      {showScannerDrawer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex justify-end z-50 animate-fade-in">
          <div className="w-full tickets-drawer-wide bg-surface h-full shadow-2xl p-6 flex flex-col justify-between border-l border-divider animate-slide-in rounded-none text-primaryText overflow-hidden animate-fade-in">
            {/* Drawer Header */}
            <div className="flex justify-between items-center border-b border-divider pb-4 shrink-0">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#FF8000] font-sans">Escanear Ticket QR</h2>
                <p className="text-[9px] text-secondaryText font-mono uppercase mt-0.5">Control de acreditación y canje de productos en tiempo real</p>
              </div>
              <button 
                onClick={() => {
                  setShowScannerDrawer(false);
                  setIsCameraActive(false);
                }} 
                className="text-secondaryText hover:text-white font-bold font-mono text-sm cursor-pointer w-8 h-8 flex items-center justify-center hover:bg-inputBg transition-all"
              >
                ✕
              </button>
            </div>

            {/* Drawer Body (Scrollable content) */}
            <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar text-left">
              {/* PAGE 1: SCANNER SCREEN (Kept mounted, but hidden/shown dynamically) */}
              <div 
                style={{ display: drawerSubView === 'scan' ? 'block' : 'none' }} 
                className="space-y-6 animate-fade-in"
              >
                {/* Camera Scanner Area */}
                <div className="bg-canvas border border-divider p-6 flex flex-col items-center rounded-none relative space-y-6">
                  {/* Virtual Scanner Screen */}
                  <div className="tickets-scanner-screen">
                    {/* Keep qr-reader mounted in DOM, but hide it if camera is inactive */}
                    <div className={`absolute inset-0 w-full h-full ${isCameraActive ? 'block' : 'hidden'}`}>
                      <div id="qr-reader" className="w-full h-full overflow-hidden object-cover"></div>
                    </div>

                    {/* Decorative overlay overlaying the video feed */}
                    {isCameraActive && (
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/25 z-10">
                        <div className="tickets-scanner-target">
                          <div className="tickets-scanner-laser"></div>
                        </div>
                        <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-[#FF8000] bg-canvas/90 px-2 py-0.5 border border-divider mt-3">
                          Lente Activo...
                        </span>
                      </div>
                    )}

                    {!isCameraActive && (
                      <>
                        <span className="text-secondaryText text-[10px] font-mono uppercase tracking-wider opacity-60">Cámara Inactiva</span>
                        <button
                          onClick={() => setIsCameraActive(true)}
                          className="mt-3 bg-[#FF8000] text-canvas px-4 py-2 rounded-none font-mono uppercase font-bold text-[9px] tracking-wider hover:bg-opacity-90 transition-all cursor-pointer"
                        >
                          Reactivar Cámara
                        </button>
                      </>
                    )}

                    {/* Corner Accents */}
                    <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-[#FF8000] pointer-events-none z-10"></div>
                    <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-[#FF8000] pointer-events-none z-10"></div>
                    <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-[#FF8000] pointer-events-none z-10"></div>
                    <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-[#FF8000] pointer-events-none z-10"></div>
                  </div>

                  {/* Manual input simulation */}
                  <div className="w-full mt-2 space-y-2">
                    <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">
                      Digitar Código Manual (Simular escaneo)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Ej. EVT-123456"
                        value={scanCodeInput}
                        onChange={(e) => setScanCodeInput(e.target.value)}
                        className="flex-1 bg-inputBg border border-divider px-3 py-2.5 text-xs text-primaryText font-mono uppercase focus:border-secondaryText focus:outline-none rounded-none"
                      />
                      <button
                        onClick={() => {
                          handleScanValidate(scanCodeInput.trim().toUpperCase());
                        }}
                        disabled={isScanning || !scanCodeInput}
                        className="bg-inputBg hover:bg-divider border border-divider text-[#FF8000] px-5 py-2.5 rounded-none font-mono uppercase font-bold text-[11px] tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isScanning ? 'Validando...' : 'Buscar'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Scan Error box */}
                {scanError && (
                  <div className="bg-surface border border-rose-500/30 p-5 shadow-md flex items-center gap-3 animate-fade-in rounded-none text-left">
                    <div className="text-rose-400 font-bold text-lg">✕</div>
                    <div>
                      <h3 className="text-rose-400 font-sans uppercase font-bold text-xs tracking-tight">Error de Validación</h3>
                      <p className="text-secondaryText font-mono text-[10px] uppercase mt-1 leading-normal">{scanError}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* PAGE 2: VALIDATION RESULT & ACTIONS SCREEN */}
              {drawerSubView === 'result' && scannedResult && (() => {
                const { registration, items } = scannedResult;
                const isCheckedIn = registration.status === 'checked_in';
                const isCanceled = registration.status === 'canceled';
                const hasItems = items && items.length > 0;
                const allItemsClaimed = hasItems && items.every((it: any) => it.status === 'claimed');
                
                return (
                  <div className="space-y-6 animate-fade-in">
                    {/* Back to Scanner button */}
                    <button
                      onClick={() => {
                        setScannedResult(null);
                        setScanError(null);
                        setScanCodeInput('');
                        setDrawerSubView('scan');
                      }}
                      className="flex items-center gap-2 text-secondaryText hover:text-white font-mono uppercase font-bold text-[10px] tracking-wider mb-6 pb-2 border-b border-divider/40 w-full cursor-pointer text-left"
                    >
                      <svg className="w-4 h-4 text-[#FF8000]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                      </svg>
                      Volver al Escáner
                    </button>

                    {/* Status Card */}
                    <div className={`border p-6 rounded-none text-center ${
                      isCheckedIn 
                        ? 'bg-[#1F1414] border-rose-500/40 text-rose-400' 
                        : isCanceled
                        ? 'bg-surface border-divider text-mutedText'
                        : 'bg-[#141A16] border-emerald-500/40 text-emerald-400'
                    }`}>
                      <span className="text-[9px] font-mono uppercase tracking-[0.2em] opacity-80 block mb-1">Estado del Ticket</span>
                      <h3 className="text-sm font-bold uppercase tracking-wider font-mono">
                        {isCheckedIn 
                          ? '⚠️ TICKET YA ACREDITADO (DENTRO)' 
                          : isCanceled
                          ? '🛑 TICKET CANCELADO / INVÁLIDO'
                          : '✓ ENTRADA VÁLIDA — PENDIENTE'}
                      </h3>
                      <p className="text-[11px] text-secondaryText font-mono uppercase mt-2">
                        Código: <span className="font-mono font-bold text-primaryText tracking-widest">{registration.ticket_code}</span>
                      </p>
                    </div>

                    {/* Attendee details */}
                    <div className="bg-surface border border-divider p-6 space-y-4">
                      <h4 className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-[0.15em] border-b border-divider pb-2">
                        Datos del Asistente
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[12px]">
                        <div className="space-y-1">
                          <span className="text-[9px] text-mutedText block font-mono uppercase tracking-wider">Nombre del Acreditado</span>
                          <span className="font-bold text-primaryText text-sm uppercase">{registration.buyer_name}</span>
                          <span className="text-[10px] text-secondaryText font-mono lowercase block">{registration.buyer_email || 'sin correo'}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] text-mutedText block font-mono uppercase tracking-wider">Evento Registrado</span>
                          <span className="font-bold text-primaryText text-sm uppercase block truncate">{registration.events?.name}</span>
                          <span className="text-[10px] text-secondaryText font-mono block">
                            Fecha: {registration.events?.date && new Date(registration.events.date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pending check-in button */}
                    {!isCheckedIn && !isCanceled && (
                      <button
                        onClick={() => handleConfirmAcreditacion(registration.id)}
                        disabled={isCheckingIn}
                        className="tickets-btn-accreditation"
                      >
                        {isCheckingIn ? (
                          <>
                            <svg className="animate-spin h-4 w-4 text-canvas" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Registrando Acceso...
                          </>
                        ) : (
                          'Confirmar Acreditación e Ingresar'
                        )}
                      </button>
                    )}

                    {/* Products / Items Section */}
                    {isCheckedIn && (
                      <div className="border border-divider p-6 bg-surface space-y-6">
                        <div className="flex justify-between items-center border-b border-divider pb-3">
                          <h4 className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-[0.15em]">
                            Entregas y Productos Asociados
                          </h4>
                          <span className="px-2 py-0.5 border text-[9px] font-mono font-bold bg-[#FF8000]/10 border-[#FF8000]/20 text-[#FF8000] uppercase tracking-wider">
                            Check-in OK
                          </span>
                        </div>

                        {!hasItems ? (
                          /* No products associated */
                          <div className="bg-canvas border border-divider/60 p-6 text-center">
                            <span className="text-[11px] text-secondaryText font-mono uppercase italic">
                              Este ticket no tiene productos ni combos asignados.
                            </span>
                          </div>
                        ) : allItemsClaimed ? (
                          /* All products claimed */
                          <div className="bg-[#141A16] border border-emerald-500/20 p-6 text-left space-y-2 animate-fade-in">
                            <span className="text-[11px] font-mono text-emerald-400 uppercase font-bold block tracking-wider">✓ Todo Canjeado</span>
                            <span className="text-[10px] font-mono text-secondaryText block leading-relaxed">
                              Todos los productos y combos de este ticket ya fueron entregados satisfactoriamente al acreditado.
                            </span>
                          </div>
                        ) : (
                          /* Pending products to deliver */
                          <div className="space-y-4">
                            {items.map(item => (
                              <div key={item.id} className="flex justify-between items-center p-5 bg-canvas border border-divider rounded-none transition-all hover:border-divider/80">
                                <div className="text-left min-w-0 pr-4 space-y-1">
                                  <div className="font-bold text-primaryText text-sm truncate">{item.event_items?.name}</div>
                                  <div className="text-[10px] text-secondaryText font-mono truncate leading-normal">{item.event_items?.description || 'Sin descripción'}</div>
                                </div>
                                <div className="shrink-0 ml-4">
                                  {item.status === 'claimed' ? (
                                    <div className="tickets-badge-claimed">
                                      ✓ Entregado
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => handleClaimItem(item.id)}
                                      className="tickets-btn-redeem"
                                    >
                                      Canjear
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Drawer Footer */}
            <div className="border-t border-divider pt-4 mt-auto shrink-0 flex justify-end">
              <button 
                onClick={() => {
                  setShowScannerDrawer(false);
                  setIsCameraActive(false);
                }} 
                className="bg-inputBg hover:bg-divider border border-divider text-secondaryText hover:text-white px-4 py-2.5 rounded-none font-mono uppercase font-bold text-[10px] tracking-wider transition-all cursor-pointer"
              >
                Cerrar Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE EVENT MODAL (Drawer style) */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 bg-canvas/60 backdrop-blur-xs flex justify-end">
          <div className="w-full tickets-drawer-wide bg-surface h-full shadow-2xl p-6 flex flex-col justify-between border-l border-divider animate-slide-in rounded-none text-primaryText overflow-hidden">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6 pb-2 shrink-0">
              <h2 className="text-sm font-semibold uppercase tracking-tight text-primaryText font-sans">{eventForm.id ? 'Editar Evento' : 'Crear Nuevo Evento'}</h2>
              <button onClick={handleCloseEventModal} className="text-secondaryText hover:text-white font-mono text-base cursor-pointer">✕</button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar border-t-0 border-none">
              <form onSubmit={(e) => { e.preventDefault(); if (eventForm.id) { handleUpdateEvent(eventForm.id); } else { handleCreateEvent(e); } }} className="text-left space-y-6">
                <div className="tickets-drawer-grid-3 items-start">
                  
                  {/* Columna 1: Datos Básicos */}
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-mono font-bold text-accentBlue uppercase tracking-wider border-b border-divider pb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accentBlue"></span>
                      Datos del Evento
                    </h3>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Nombre del Evento *</label>
                      <input
                        type="text"
                        required
                        value={eventForm.name}
                        onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                        className="w-full bg-inputBg border border-divider px-3 py-2 text-xs text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none"
                        placeholder="Ej. Torneo de Invierno 2026"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Fecha del Evento *</label>
                      <input
                        type="datetime-local"
                        required
                        value={eventForm.date}
                        onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                        className="w-full bg-inputBg border border-divider px-3 py-2 text-xs text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Lugar / Sede *</label>
                      <input
                        type="text"
                        required
                        value={eventForm.venue}
                        onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })}
                        className="w-full bg-inputBg border border-divider px-3 py-2 text-xs text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none"
                        placeholder="Ej. Polideportivo Central"
                      />
                    </div>
                  </div>

                  {/* Columna 2: Imagen de Fondo */}
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-mono font-bold text-accentBlue uppercase tracking-wider border-b border-divider pb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accentBlue"></span>
                      Diseño del Ticket
                    </h3>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Imagen de Fondo del Ticket *</label>
                      
                      <div className="tickets-compact-dropzone group">
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center z-10">
                          <svg className="w-5 h-5 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-[8px] font-mono text-white uppercase font-bold tracking-wider">
                            {eventForm.base_image_url ? 'Cambiar Imagen' : 'Subir Imagen'}
                          </span>
                        </div>

                        {/* Preview Image or Placeholder */}
                        {eventForm.base_image_url ? (
                          <img 
                            src={eventForm.base_image_url} 
                            alt="Fondo de ticket" 
                            className="w-full h-full object-cover filter grayscale group-hover:grayscale-0 transition-all duration-300"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-center p-3 text-mutedText group-hover:text-primaryText transition-colors">
                            <svg className="w-6 h-6 mb-1 opacity-55" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-[8px] font-mono uppercase tracking-wider font-bold">
                              Haz clic para subir imagen
                            </span>
                          </div>
                        )}

                        {/* Invisible File Input */}
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => handleImageUpload(e, 'tickets')}
                          className="absolute inset-0 opacity-0 cursor-pointer z-20"
                          disabled={isUploading}
                        />
                      </div>

                      {isUploading && (
                        <span className="text-[8px] font-mono text-[#FF8000] block mt-1 uppercase tracking-wide animate-pulse">Subiendo imagen...</span>
                      )}
                      {eventForm.base_image_url && !isUploading && (
                        <span className="text-[8px] font-mono text-emerald-400 block mt-1 uppercase tracking-wide">✓ Cargada con éxito</span>
                      )}

                      {/* Manual URL input fallback */}
                      <div className="pt-1">
                        <span className="text-[8px] font-mono text-mutedText uppercase tracking-wider block mb-1">O introduce una URL externa:</span>
                        <input
                          type="text"
                          value={eventForm.base_image_url}
                          onChange={(e) => setEventForm({ ...eventForm, base_image_url: e.target.value })}
                          className="w-full bg-inputBg border border-divider px-3 py-1.5 text-[10px] text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none"
                          placeholder="https://ejemplo.com/imagen.jpg"
                        />
                      </div>

                      {/* Live Canvas Preview inside the Drawer (Updates in real time as X, Y, Size are modified) */}
                      {eventForm.base_image_url && (
                        <div className="pt-3 space-y-1.5 text-left">
                          <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Previsualización Live del Ticket</label>
                          <div className="flex justify-center bg-canvas p-2 border border-divider rounded-none">
                            <canvas 
                              ref={drawerCanvasRef} 
                              className="tickets-live-preview-canvas rounded-none shadow-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Columna 3: Configuración Avanzada JSON */}
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-mono font-bold text-accentBlue uppercase tracking-wider border-b border-divider pb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accentBlue"></span>
                      Configuración del Ticket (JSON)
                    </h3>
                    
                    <div className="space-y-3 text-left">
                      <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">
                        JSON del QR y Textos
                      </label>
                      <textarea
                        value={jsonEditorText}
                        onChange={(e) => handleJsonChange(e.target.value)}
                        className="tickets-json-editor"
                        rows={18}
                        placeholder="{}"
                      />
                      {jsonError ? (
                        <span className="text-[9px] font-mono font-bold text-red-500 uppercase tracking-wider block mt-1">
                          ✗ JSON Inválido: {jsonError}
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider block mt-1">
                          ✓ JSON Válido y Vinculado
                        </span>
                      )}
                    </div>
                  </div>

                </div>
              </form>
            </div>

             {/* Footer Buttons */}
             <div className="flex gap-3 mt-8 shrink-0 pt-4 border-t border-divider">
               <button
                 type="button"
                 onClick={handleCloseEventModal}
                 className="flex-1 bg-inputBg hover:bg-divider text-secondaryText py-3 px-4 rounded-none font-mono uppercase text-xs tracking-wider transition-colors cursor-pointer text-center"
               >
                 Cancelar
               </button>
               <button
                 type="button"
                 onClick={handlePreviewNewTicket}
                 className="flex-1 bg-inputBg hover:bg-divider text-secondaryText hover:text-white rounded-none border border-divider py-3 px-4 font-mono uppercase text-xs tracking-wider transition-colors cursor-pointer text-center"
               >
                 Previsualizar
               </button>
               <button
                 type="button"
                 onClick={(e) => { e.preventDefault(); if (eventForm.id) { handleUpdateEvent(eventForm.id); } else { handleCreateEvent(e); } }}
                 className="flex-1 bg-[#FF8000] text-canvas py-3 px-4 rounded-none font-mono uppercase font-bold text-xs tracking-wider transition-colors cursor-pointer text-center"
               >
                 {eventForm.id ? 'Guardar Cambios' : 'Crear Evento'}
               </button>
             </div>

          </div>
        </div>
      )}

      {/* ADD ITEM TO CATALOG MODAL */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-canvas/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-surface h-full shadow-2xl p-6 flex flex-col justify-between border-l border-divider animate-slide-in rounded-none text-primaryText">
            <div>
              <div className="flex justify-between items-center mb-6 border-b border-divider pb-4">
                <h2 className="text-sm font-semibold uppercase tracking-tight text-primaryText font-sans">{itemForm.id ? 'Editar Producto / Combo' : 'Agregar Producto / Combo'}</h2>
                <button onClick={() => setShowItemModal(false)} className="text-secondaryText hover:text-white font-mono text-base cursor-pointer">✕</button>
              </div>
              <form onSubmit={itemForm.id ? handleUpdateItem : handleCreateItem} className="space-y-4 text-left">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Nombre del Combo *</label>
                  <input
                    type="text"
                    required
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    className="w-full bg-inputBg border border-divider px-3 py-2 text-xs text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none"
                    placeholder="Ej. Combo Hamburguesa + Bebida"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Precio (₲) *</label>
                  <input
                    type="number"
                    required
                    value={itemForm.price}
                    onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                    className="w-full bg-inputBg border border-divider px-3 py-2 text-xs text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none"
                    placeholder="Ej. 35000"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Descripción</label>
                  <textarea
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                    className="w-full bg-inputBg border border-divider px-3 py-2 text-xs text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none"
                    placeholder="Detalles sobre lo que incluye..."
                    rows={4}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Estado</label>
                  <select
                    value={itemForm.is_active ? 'true' : 'false'}
                    onChange={(e) => setItemForm({ ...itemForm, is_active: e.target.value === 'true' })}
                    className="w-full bg-inputBg border border-divider px-3 py-2 text-xs text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none cursor-pointer"
                  >
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </form>
            </div>
             <div className="flex gap-3 mt-8">
               <button
                 onClick={() => setShowItemModal(false)}
                 className="flex-1 bg-inputBg hover:bg-divider text-secondaryText py-3 px-4 rounded-none font-mono uppercase text-xs tracking-wider transition-colors cursor-pointer text-center"
               >
                 Cancelar
               </button>
               <button
                 onClick={itemForm.id ? handleUpdateItem : handleCreateItem}
                 className="flex-1 bg-[#FF8000] text-canvas py-3 px-4 rounded-none font-mono uppercase font-bold text-xs tracking-wider transition-all hover:bg-opacity-95 active:scale-[0.98] cursor-pointer"
               >
                 {itemForm.id ? 'Guardar Cambios' : 'Agregar Producto'}
               </button>
             </div>
          </div>
        </div>
      )}

      {/* EMIT TICKET REGISTRATION MODAL */}
      {showRegModal && (
        <div className="fixed inset-0 z-50 bg-canvas/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-surface h-full shadow-2xl p-6 flex flex-col justify-between border-l border-divider animate-slide-in rounded-none text-primaryText">
            <div className="flex-grow flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-6 border-b border-divider pb-4 shrink-0">
                <h2 className="text-sm font-semibold uppercase tracking-tight text-primaryText font-sans">Registrar / Emitir Ticket</h2>
                <button onClick={() => setShowRegModal(false)} className="text-secondaryText hover:text-white font-mono text-base cursor-pointer">✕</button>
              </div>
              <form onSubmit={handleCreateRegistration} className="space-y-4 text-left overflow-y-auto flex-grow pr-2 custom-scrollbar">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Seleccionar Evento *</label>
                  <select
                    value={regForm.event_id || selectedEventId}
                    onChange={(e) => {
                      setRegForm({ ...regForm, event_id: e.target.value });
                      loadEventItems(e.target.value);
                    }}
                    className="w-full bg-inputBg border border-divider px-3 py-2 text-xs text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none cursor-pointer"
                  >
                    {events.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Nombre del Participante *</label>
                  <input
                    type="text"
                    required
                    value={regForm.buyer_name}
                    onChange={(e) => setRegForm({ ...regForm, buyer_name: e.target.value })}
                    className="w-full bg-inputBg border border-divider px-3 py-2 text-xs text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none"
                    placeholder="Nombre completo"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block">Correo Electrónico (Opcional)</label>
                  <input
                    type="email"
                    value={regForm.buyer_email}
                    onChange={(e) => setRegForm({ ...regForm, buyer_email: e.target.value })}
                    className="w-full bg-inputBg border border-divider px-3 py-2 text-xs text-primaryText font-mono focus:border-secondaryText focus:outline-none rounded-none"
                    placeholder="correo@ejemplo.com"
                  />
                </div>

                <div className="pt-2">
                  <label className="text-[10px] font-mono font-bold text-mutedText uppercase tracking-wider block mb-2">Asociar combos / productos extra:</label>
                  {eventItems.length === 0 ? (
                    <p className="text-[10px] text-secondaryText font-mono uppercase italic">No hay productos en catálogo para este evento.</p>
                  ) : (
                    <div className="space-y-1 border border-divider p-2 bg-inputBg rounded-none custom-scrollbar" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                      {eventItems.map(item => (
                        <label key={item.id} className="flex items-center gap-2 p-2 hover:bg-divider rounded-none text-xs cursor-pointer">
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
                            className="accent-[#FF8000] cursor-pointer"
                          />
                          <span className="font-bold text-primaryText">{item.name}</span>
                          <span className="text-secondaryText">({item.price.toLocaleString('es-PY')} ₲)</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </form>
            </div>
             <div className="flex gap-3 mt-8 shrink-0">
               <button
                 onClick={() => setShowRegModal(false)}
                 className="flex-1 bg-inputBg hover:bg-divider text-secondaryText py-3 px-4 rounded-none font-mono uppercase text-xs tracking-wider transition-colors cursor-pointer text-center"
               >
                 Cancelar
               </button>
               <button
                 onClick={handleCreateRegistration}
                 className="flex-1 bg-[#FF8000] text-canvas py-3 px-4 rounded-none font-mono uppercase font-bold text-xs tracking-wider transition-colors cursor-pointer text-center"
               >
                 Emitir Ticket
               </button>
             </div>
          </div>
        </div>
      )}

      {/* TICKET VISUAL DESIGNER / PREVIEW OVERLAY (Drawer style) */}
      {showTicketDesigner && (
        <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
          {/* Backdrop */}
          <div 
            onClick={() => setShowTicketDesigner(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fade-in" 
          />
          
          {/* Drawer Panel */}
          <div className="relative bg-surface w-full tickets-drawer-wide border-l border-divider flex flex-col h-full z-10 shadow-2xl animate-slide-in text-primaryText text-left">
            {/* Header */}
            <div className="px-6 py-5 border-b border-divider flex justify-between items-center bg-inputBg shrink-0">
              <h3 className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primaryText">Vista de la Entrada Virtual</h3>
              <button 
                onClick={() => setShowTicketDesigner(null)} 
                className="text-secondaryText hover:text-primaryText p-1 cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Drawer Body */}
            <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar flex flex-col justify-center bg-canvas">
              {/* Canvas ticket rendering */}
              <div className="flex justify-center bg-canvas p-4 border border-divider rounded-none">
                <canvas 
                  ref={canvasRef} 
                  className="max-w-full rounded-none border border-divider bg-canvas shadow-sm"
                  style={{ 
                    maxHeight: 'calc(100vh - 240px)', // Restricts canvas height to fit viewport
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain'
                  }}
                />
              </div>
              
              <div className="text-[10px] text-secondaryText font-mono uppercase text-center">
                El código QR se renderiza dinámicamente superpuesto según las coordenadas configuradas en el evento.
              </div>
            </div>
            
            {/* Drawer Footer */}
            <div className="p-6 border-t border-divider flex justify-end bg-inputBg shrink-0">
              <button
                onClick={() => setShowTicketDesigner(null)}
                className="bg-inputBg hover:bg-divider text-secondaryText hover:text-white px-6 py-2.5 rounded-none font-mono uppercase text-xs tracking-wider transition-colors cursor-pointer border border-divider"
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
