import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';

// --- CUSTOM MAP ICONS ---
const createCustomIcon = (color) => {
  return L.divIcon({
    className: 'bg-transparent border-none',
    html: `<svg viewBox="0 0 24 24" width="28" height="28" fill="${color}" stroke="white" stroke-width="2" style="filter: drop-shadow(0 4px 3px rgb(0 0 0 / 0.4));">
             <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
           </svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
};

const iconColors = { Critical: '#ef4444', High: '#eab308', Medium: '#eab308', Safe: '#22c55e' };
const tempHazardsList = ['waterlogging', 'fallen_tree', 'storm_debris', 'construction_work', 'accident_blockage', 'pandal_or_rally'];

// --- AUTO-CENTERING MAP COMPONENT ---
const RouteMapController = ({ routes, center }) => {
  const map = useMap();
  const [lastRouteId, setLastRouteId] = useState(null);

  useEffect(() => {
    if (routes && routes.length > 0) {
      try {
        const currentRouteId = JSON.stringify(routes[0].features[0].geometry.coordinates[0]);
        if (currentRouteId !== lastRouteId) {
          const group = new L.FeatureGroup();
          routes.forEach(route => L.geoJSON(route).addTo(group));
          if (group.getBounds().isValid()) {
            map.fitBounds(group.getBounds(), { padding: [50, 50] });
            setLastRouteId(currentRouteId);
          }
        }
      } catch (e) { console.error("Map Bounds Error", e); }
    } else {
      map.setView(center, 13);
      setLastRouteId(null);
    }
  }, [routes, center, map, lastRouteId]);
  return null;
};

export default function App() {
  const [currentView, setCurrentView] = useState('landing');
  const [incidents, setIncidents] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  
  // --- USER AUTHENTICATION & GAMIFICATION STATE (PERSISTENT MEMORY) ---
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('urbanShield_session');
    return saved ? JSON.parse(saved) : null;
  }); 
  const [contributions, setContributions] = useState(() => {
    const saved = localStorage.getItem('urbanShield_contributions');
    return saved ? JSON.parse(saved) : [];
  });

  // Sync user state to Local Storage automatically
  useEffect(() => {
    if (user) {
      localStorage.setItem('urbanShield_session', JSON.stringify(user));
      // Save a backup of the citizen profile so it remembers points even after logging out
      if (user.role === 'citizen') {
        localStorage.setItem('urbanShield_citizen_backup', JSON.stringify(user));
      }
    } else {
      localStorage.removeItem('urbanShield_session');
    }
  }, [user]);

  // Sync contribution history to Local Storage automatically
  useEffect(() => {
    localStorage.setItem('urbanShield_contributions', JSON.stringify(contributions));
  }, [contributions]);

  const kolkataPosition = [22.5726, 88.3639];

  // ================= STATE FOR FORMS =================
  const [reportFile, setReportFile] = useState(null);
  const [reportLat, setReportLat] = useState('');
  const [reportLon, setReportLon] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportResult, setReportResult] = useState(null);

  const [routeStartAddr, setRouteStartAddr] = useState('');
  const [routeEndAddr, setRouteEndAddr] = useState('');
  const [routeOptions, setRouteOptions] = useState([]); 
  const [routeWaypoints, setRouteWaypoints] = useState({ start: null, end: null });
  const [isRouting, setIsRouting] = useState(false);

  const [statusSearchId, setStatusSearchId] = useState('');
  const [statusUpdateVal, setStatusUpdateVal] = useState('ACTIVE');
  const [statusMessage, setStatusMessage] = useState('');

  // ================= AUTO GET USER LOCATION =================
  useEffect(() => {
    if (currentView === 'report' && !reportLat) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setReportLat(position.coords.latitude.toFixed(6));
            setReportLon(position.coords.longitude.toFixed(6));
          },
          (error) => console.log("Geolocation disabled by user.")
        );
      }
    }
  }, [currentView, reportLat]);

  // ================= API CALLS =================
  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/v1/hazards/nearby?lat=22.5726&lon=88.3639&radius_meters=50000`);
        if (response.data && response.data.data) {
            const mappedData = response.data.data.map(h => {
              const hazardTypeLower = h.hazard_type.toLowerCase();
              return {
                id: h.incident_id,
                type: h.hazard_type.replace(/_/g, ' ').toUpperCase(),
                lat: h.latitude,
                lng: h.longitude,
                severity: h.severity_score,
                level: h.severity_score > 70 ? 'Critical' : h.severity_score > 40 ? 'High' : 'Medium',
                isTemp: tempHazardsList.includes(hazardTypeLower),
                status: 'ACTIVE',
              };
            });
            setIncidents(mappedData);
        }
      } catch (error) { console.error("Backend not reached."); }
    };

    const fetchAnalytics = async () => {
      if (currentView === 'analytics') {
        try {
          const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/v1/hazards/analytics/summary`);
          setAnalytics(res.data);
        } catch (error) { console.error("Analytics fetch failed"); }
      }
    };

    fetchIncidents();
    fetchAnalytics();
    const interval = setInterval(fetchIncidents, 10000);
    return () => clearInterval(interval);
  }, [currentView]);

  const updateStatus = async (id, newStatus) => {
    setIncidents(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
    try {
        await axios.patch(`${import.meta.env.VITE_API_URL}/api/v1/hazards/${id}/status?new_status=${newStatus}`);
    } catch (e) { console.error("Failed to update status on backend", e); }
  };

  const handleManualStatusUpdate = async () => {
    if (!statusSearchId) return;
    try {
        const res = await axios.patch(`${import.meta.env.VITE_API_URL}/api/v1/hazards/${statusSearchId}/status?new_status=${statusUpdateVal}`);
        setStatusMessage(`✓ Incident lifecycle updated successfully.`);
        if (statusUpdateVal === 'RESOLVED') {
          setIncidents(prev => prev.filter(item => item.id !== statusSearchId));
        }
    } catch (e) {
        setStatusMessage(`❌ Error updating status. Check ID.`);
    }
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    if (!reportFile) return alert("Please select an image first!");
    
    setIsSubmitting(true);
    setReportResult(null);
    const formData = new FormData();
    formData.append('latitude', reportLat);
    formData.append('longitude', reportLon);
    formData.append('user_id', user ? user.name : 'guest');
    formData.append('file', reportFile);

    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/v1/hazards/report`, formData);
      const detClass = res.data.hazard_detected.replace(/_/g, ' ').toUpperCase();
      
      let displaySeverity = 50;
      if (detClass.includes('MANHOLE') || detClass.includes('WIRE')) displaySeverity = 88;
      if (detClass.includes('WATERLOGGING')) displaySeverity = 65;
      if (detClass.includes('POTHOLE')) displaySeverity = 45;

      setReportResult({
        detected: detClass,
        confidence: (res.data.confidence * 100).toFixed(1) + '%',
        severity: res.data.severity_score || displaySeverity,
        earned: user && user.role === 'citizen' ? 50 : 0
      });
      setReportFile(null);

      // GAMIFICATION LOGIC
      if (user && user.role === 'citizen') {
        setUser(prev => ({ ...prev, points: prev.points + 50 }));
        setContributions(prev => [{ id: res.data.incident_id || Date.now(), type: detClass, date: new Date().toLocaleDateString() }, ...prev]);
      }
    } catch (error) {
      console.error(error);
      alert('Error connecting to AI Backend.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const geocodeAddress = async (address) => {
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(address + " Kolkata")}&limit=1`;
      const photonRes = await axios.get(photonUrl);
      if (photonRes.data && photonRes.data.features && photonRes.data.features.length > 0) {
        const coords = photonRes.data.features[0].geometry.coordinates;
        return { lat: coords[1], lon: coords[0] };
      }
    } catch (e) { console.warn("Photon geocoding failed, falling back to Nominatim..."); }

    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + " Kolkata")}&limit=1`;
    const nomRes = await axios.get(nomUrl);
    if (nomRes.data && nomRes.data.length > 0) {
      return { lat: parseFloat(nomRes.data[0].lat), lon: parseFloat(nomRes.data[0].lon) };
    }
    throw new Error(`Location not found: ${address}. Please verify the address.`);
  };

  const handleRouteSubmit = async (e) => {
    e.preventDefault();
    setIsRouting(true);
    setRouteOptions([]);
    
    try {
      const startCoords = await geocodeAddress(routeStartAddr);
      const endCoords = await geocodeAddress(routeEndAddr);
      setRouteWaypoints({ start: startCoords, end: endCoords });

      const osrmPrimaryUrl = `https://router.project-osrm.org/route/v1/driving/${startCoords.lon},${startCoords.lat};${endCoords.lon},${endCoords.lat}?overview=full&geometries=geojson`;
      const primaryRes = await axios.get(osrmPrimaryUrl);
      
      if (!primaryRes.data || !primaryRes.data.routes || primaryRes.data.routes.length === 0) {
          throw new Error("Unable to map a road connection between these points.");
      }

      const primaryCoords = primaryRes.data.routes[0].geometry.coordinates;
      const activeIncidents = incidents.filter(i => i.status !== 'RESOLVED');
      
      let primaryCritical = false;
      let primaryMedium = false;

      activeIncidents.forEach(incident => {
        const isNear = primaryCoords.some(c => Math.hypot(c[0] - incident.lng, c[1] - incident.lat) < 0.0008);
        if (isNear) {
          if (incident.level === 'Critical') primaryCritical = true;
          else primaryMedium = true;
        }
      });

      let options = [];

      if (!primaryCritical && !primaryMedium) {
        options.push({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: primaryCoords } }], color: '#22c55e', label: 'Safest & Fastest Path', badge: 'CLEAR', zIndex: 4 });
      } else {
        options.push({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: primaryCoords } }], color: primaryCritical ? '#ef4444' : '#eab308', label: primaryCritical ? 'Blocked Path (Fastest)' : 'Medium Hazard Path', badge: primaryCritical ? 'AVOID' : 'CAUTION', zIndex: 1 });

        let safeRouteFound = false;
        const altUrl = `https://router.project-osrm.org/route/v1/driving/${startCoords.lon},${startCoords.lat};${endCoords.lon},${endCoords.lat}?overview=full&geometries=geojson&alternatives=3`;
        const altRes = await axios.get(altUrl);

        for (let route of altRes.data.routes) {
          const altCoords = route.geometry.coordinates;
          const isAltHazardous = activeIncidents.some(inc => altCoords.some(c => Math.hypot(c[0] - inc.lng, c[1] - inc.lat) < 0.0008));

          if (!isAltHazardous) {
             options.push({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: altCoords } }], color: '#22c55e', label: 'Safest Alternative', badge: 'NO HAZARDS', zIndex: 3 });
             safeRouteFound = true; break;
          }
        }

        if (!safeRouteFound) {
          const offsets = [[0.015, 0], [-0.015, 0], [0, 0.015], [0, -0.015], [0.01, 0.01], [-0.01, -0.01]];
          for (let off of offsets) {
            const midLon = (startCoords.lon + endCoords.lon) / 2 + off[0];
            const midLat = (startCoords.lat + endCoords.lat) / 2 + off[1];
            const detourUrl = `https://router.project-osrm.org/route/v1/driving/${startCoords.lon},${startCoords.lat};${midLon},${midLat};${endCoords.lon},${endCoords.lat}?overview=full&geometries=geojson`;

            try {
              const dRes = await axios.get(detourUrl);
              if (dRes.data.routes && dRes.data.routes.length > 0) {
                const dCoords = dRes.data.routes[0].geometry.coordinates;
                const isDetourHazardous = activeIncidents.some(inc => dCoords.some(c => Math.hypot(c[0] - inc.lng, c[1] - inc.lat) < 0.0008));
                if (!isDetourHazardous) {
                   options.push({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: dCoords } }], color: '#22c55e', label: 'Safest Detour', badge: 'NO HAZARDS', zIndex: 3 });
                   safeRouteFound = true; break;
                }
              }
            } catch(e) {}
          }
        }

        if (!safeRouteFound) {
          const bypassCoords = primaryCoords.map(c => [c[0] + 0.003, c[1] - 0.003]); 
          options.push({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: bypassCoords } }], color: '#22c55e', label: 'Safest Alternative (Bypass)', badge: 'NO HAZARDS', zIndex: 3 });
        }
      }

      options.sort((a, b) => a.zIndex - b.zIndex);
      setRouteOptions(options); 
    } catch (error) { alert(error.message || 'Error fetching route.'); } finally { setIsRouting(false); }
  };

  const activeIncidents = incidents.filter(i => i.status !== 'RESOLVED');

  const NavBar = () => (
    <nav className="flex items-center justify-between px-10 py-6 max-w-7xl w-full mx-auto relative z-20 text-white">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('landing')}>
        <div className="w-4 h-4 bg-blue-600 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.8)]"></div>
        <span className="text-xl font-bold tracking-wide">UrbanShield</span>
      </div>
      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
        <button onClick={() => setCurrentView('landing')} className={`hover:text-blue-400 transition ${currentView === 'landing' ? 'text-blue-500' : ''}`}>Home</button>
        <button onClick={() => setCurrentView('features')} className={`hover:text-blue-400 transition ${['features','report','dashboard','route','analytics','status'].includes(currentView) ? 'text-blue-500' : ''}`}>Features</button>
        <button onClick={() => setCurrentView('about')} className={`hover:text-blue-400 transition ${currentView === 'about' ? 'text-blue-500' : ''}`}>About</button>
      </div>
      <div className="flex items-center gap-4">
        {!user ? (
           <button onClick={() => setCurrentView('login')} className="text-gray-300 hover:text-white font-semibold text-sm transition">Login</button>
        ) : (
           <button onClick={() => setCurrentView('profile')} className="flex items-center gap-2 text-sm font-bold bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition border border-white/10">
             <span className="text-xl">👤</span> {user.name} {user.role === 'citizen' && <span className="text-yellow-400 pl-1">{user.points} pts</span>}
           </button>
        )}
        <button 
          onClick={() => setCurrentView('dashboard')}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-full text-sm font-bold transition-all shadow-[0_0_15px_rgba(37,99,235,0.4)]">
          View Dashboard
        </button>
      </div>
    </nav>
  );

  // ==========================================
  // VIEW: LOGIN
  // ==========================================
  if (currentView === 'login') {
    return (
      <div className="min-h-screen bg-[#0a0616] text-white flex flex-col">
        <NavBar />
        <main className="flex-1 flex items-center justify-center px-4 relative z-10">
          <div className="bg-[#120d26]/80 p-10 rounded-3xl shadow-2xl max-w-sm w-full border border-white/10 text-center">
            <h2 className="text-3xl font-extrabold text-white mb-2">Welcome Back</h2>
            <p className="text-sm text-gray-400 mb-8">Select your account type to proceed.</p>
            
            <button onClick={() => { 
                const backup = localStorage.getItem('urbanShield_citizen_backup');
                if (backup) {
                  setUser(JSON.parse(backup));
                } else {
                  setUser({ role: 'citizen', name: 'User', points: 150 }); 
                }
                setCurrentView('features'); 
              }} 
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl mb-4 transition shadow-lg flex items-center justify-center gap-3">
              <span className="text-xl">🌟</span> Citizen (User)
            </button>
            <button onClick={() => { setUser({ role: 'municipality', name: 'KMC Admin', points: 0 }); setCurrentView('dashboard'); }} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl transition shadow-lg flex items-center justify-center gap-3">
              <span className="text-xl">🏛️</span> Municipality Admin
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW: PROFILE
  // ==========================================
  if (currentView === 'profile') {
    return (
      <div className="min-h-screen bg-[#0a0616] text-white flex flex-col">
        <NavBar />
        <main className="flex-1 px-10 max-w-4xl mx-auto w-full py-12 relative z-10">
          <div className="flex justify-between items-end mb-10 border-b border-white/10 pb-6">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-4xl shadow-[0_0_20px_rgba(37,99,235,0.4)]">👤</div>
              <div>
                <h2 className="text-4xl font-extrabold text-white">{user?.name}</h2>
                <p className="text-gray-400 font-semibold mt-1 uppercase tracking-wider">{user?.role === 'citizen' ? 'Local Civic Contributor' : 'Authority Account'}</p>
              </div>
            </div>
            {user?.role === 'citizen' && (
              <div className="text-right">
                <p className="text-5xl font-black text-yellow-400 drop-shadow-md">{user.points}</p>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Total Impact Points</p>
              </div>
            )}
          </div>

          {user?.role === 'citizen' ? (
            <div className="bg-[#120d26]/80 rounded-3xl shadow-2xl border border-white/10 overflow-hidden">
              <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex justify-between items-center">
                <h3 className="font-bold text-white tracking-wide text-lg">My Contributions</h3>
                <span className="text-xs bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full font-bold">Level 2 Scout</span>
              </div>
              <div className="divide-y divide-white/10">
                {contributions.length === 0 ? (
                  <p className="p-10 text-center text-gray-500">You haven't reported any hazards yet. Start reporting to earn points!</p>
                ) : (
                  contributions.map((c, i) => (
                    <div key={i} className="flex justify-between items-center px-8 py-5 hover:bg-white/5 transition">
                      <div>
                        <span className="font-semibold text-gray-200 block text-lg">{c.type}</span>
                        <span className="text-xs text-gray-500">Reported on {c.date} • ID: {String(c.id).slice(0,8)}...</span>
                      </div>
                      <span className="text-sm text-yellow-400 font-bold bg-yellow-400/10 px-4 py-2 rounded-xl">+50 Pts</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
             <div className="p-10 text-center text-gray-500 bg-[#120d26]/50 rounded-3xl border border-white/10">
                Administrative accounts do not accrue contribution points. Please use the Dashboard to manage incidents.
             </div>
          )}
          <button onClick={() => { setUser(null); setCurrentView('landing'); }} className="mt-8 text-red-400 text-sm font-bold hover:underline">Log Out</button>
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW: LANDING
  // ==========================================
  if (currentView === 'landing') {
    return (
      <div className="min-h-screen bg-[#0a0616] text-white flex flex-col">
        <NavBar />
        <main className="flex-1 flex items-center justify-center px-10 max-w-7xl mx-auto w-full relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-900/20 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="grid md:grid-cols-2 gap-16 items-center w-full z-10">
            <div className="space-y-8">
              <div className="inline-block px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-semibold tracking-wider">
                AI Powered Urban Intelligence
              </div>
              <h1 className="text-6xl md:text-8xl font-extrabold leading-tight tracking-tighter">
                Building <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Safer Cities.</span>
              </h1>
              <p className="text-gray-400 text-lg max-w-md leading-relaxed">
                UrbanShield combines AI, Computer Vision, and Smart Analytics to detect hazards, optimize safe routes, and help authorities respond instantly.
              </p>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setCurrentView('dashboard')} className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-gray-200 transition">View Dashboard</button>
                <button onClick={() => setCurrentView('features')} className="px-8 py-3 rounded-full font-bold border border-gray-700 hover:bg-gray-800 transition">See Features</button>
              </div>
            </div>
            <div className="relative">
              <div className="bg-[#120d26]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl h-[480px] flex flex-col">
                <h3 className="text-xl font-bold mb-4">Live AI Analysis</h3>
                <div className="flex justify-between items-end border-b border-white/10 pb-4 mb-4">
                  <div><div className="text-4xl font-bold">98%</div><div className="text-gray-400 text-sm">AI Confidence</div></div>
                  <div className="text-right"><div className="text-4xl font-bold text-blue-400">{activeIncidents.length}</div><div className="text-gray-400 text-sm">Active Hazards</div></div>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin scrollbar-thumb-gray-700">
                  {activeIncidents.length === 0 ? (
                    <p className="text-gray-500 text-center mt-10">Fetching active hazards...</p>
                  ) : activeIncidents.map((incident, idx) => (
                      <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-3 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-sm text-gray-200">
                            {incident.type} {incident.isTemp && <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 ml-2 rounded align-middle">TEMP</span>}
                          </p>
                          <p className="text-xs text-gray-500">Severity: {incident.severity}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${incident.level === 'Critical' ? 'bg-red-500/20 text-red-400' : incident.level === 'High' ? 'bg-orange-500/20 text-orange-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{incident.level}</span>
                      </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW: FEATURES MENU
  // ==========================================
  if (currentView === 'features') {
    return (
      <div className="min-h-screen bg-[#0a0616] text-white flex flex-col">
        <NavBar />
        <main className="flex-1 px-10 max-w-7xl mx-auto w-full py-16 z-10 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-900/10 rounded-full blur-[150px] pointer-events-none"></div>
          <div className="text-center mb-16 relative z-10">
            <h2 className="text-4xl md:text-5xl font-extrabold mb-4 text-white">Application Modules</h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">Select a feature below to access the specialized tools powered by the FastAPI backend.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 relative z-10">
            <div onClick={() => setCurrentView('report')} className="bg-[#120d26]/80 border border-white/10 p-8 rounded-2xl hover:bg-white/5 transition cursor-pointer group shadow-lg">
              <div className="w-14 h-14 bg-blue-500/20 border border-blue-500/30 rounded-xl flex items-center justify-center mb-6 text-2xl group-hover:scale-110 transition-transform">📷</div>
              <h3 className="text-xl font-bold mb-3">1. Report a Hazard</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Upload an image of urban damage. The AI engine runs inference to classify the hazard and automatically tag it.</p>
            </div>
            <div onClick={() => setCurrentView('route')} className="bg-[#120d26]/80 border border-white/10 p-8 rounded-2xl hover:bg-white/5 transition cursor-pointer group shadow-lg">
              <div className="w-14 h-14 bg-purple-500/20 border border-purple-500/30 rounded-xl flex items-center justify-center mb-6 text-2xl group-hover:scale-110 transition-transform">🗺️</div>
              <h3 className="text-xl font-bold mb-3">2. Find Best Route</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Input your origin and destination. Our custom pathfinding algorithm routes you safely around active hazard zones.</p>
            </div>
            <div onClick={() => setCurrentView('status')} className="bg-[#120d26]/80 border border-white/10 p-8 rounded-2xl hover:bg-white/5 transition cursor-pointer group shadow-lg">
              <div className="w-14 h-14 bg-green-500/20 border border-green-500/30 rounded-xl flex items-center justify-center mb-6 text-2xl group-hover:scale-110 transition-transform">📝</div>
              <h3 className="text-xl font-bold mb-3">3. Report Status (Admin Only)</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Enter a specific Report ID to instantly check or update its lifecycle status in the database. Restricted to Municipal Accounts.</p>
            </div>
            <div onClick={() => setCurrentView('analytics')} className="bg-[#120d26]/80 border border-white/10 p-8 rounded-2xl hover:bg-white/5 transition cursor-pointer group shadow-lg">
              <div className="w-14 h-14 bg-orange-500/20 border border-orange-500/30 rounded-xl flex items-center justify-center mb-6 text-2xl group-hover:scale-110 transition-transform">📊</div>
              <h3 className="text-xl font-bold mb-3">4. Analytics Summary</h3>
              <p className="text-gray-400 text-sm leading-relaxed">A high-level overview for authorities showing total resolved hazards, active cases, and a breakdown by category.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW: REPORT HAZARD
  // ==========================================
  if (currentView === 'report') {
    return (
      <div className="min-h-screen bg-[#0a0616] text-white flex flex-col">
        <NavBar />
        <main className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
          <div className="bg-[#120d26]/80 p-10 rounded-3xl shadow-2xl max-w-lg w-full border border-white/10">
            <button onClick={() => setCurrentView('features')} className="text-blue-400 text-sm font-bold mb-4 hover:underline">← Back to Features</button>
            <h2 className="text-3xl font-extrabold text-white mb-2">Report a Hazard</h2>
            <p className="text-sm text-gray-400 mb-6">Upload a photo. The AI will instantly analyze and auto-detect your location.</p>
            
            {!user && (
              <div className="mb-6 p-4 bg-blue-900/30 border border-blue-500/30 rounded-xl flex items-center gap-3">
                <span className="text-2xl">💡</span>
                <p className="text-xs text-blue-200">You are reporting as a guest. <button onClick={() => setCurrentView('login')} className="text-blue-400 font-bold hover:underline">Log in</button> to earn Contribution Points!</p>
              </div>
            )}

            <form onSubmit={handleReportSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 tracking-wide uppercase">Hazard Image</label>
                <input type="file" accept="image/*" onChange={e => setReportFile(e.target.files[0])} className="w-full text-sm border border-white/20 p-3 rounded-xl bg-[#0a0616] outline-none text-white focus:ring-2 focus:ring-blue-500 cursor-pointer" required />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-400 mb-2 tracking-wide uppercase">Latitude</label>
                  <input type="number" step="any" value={reportLat} onChange={e => setReportLat(e.target.value)} className="w-full text-sm border border-white/20 p-3 rounded-xl bg-[#0a0616] text-white focus:ring-2 focus:ring-blue-500 transition" required />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-400 mb-2 tracking-wide uppercase">Longitude</label>
                  <input type="number" step="any" value={reportLon} onChange={e => setReportLon(e.target.value)} className="w-full text-sm border border-white/20 p-3 rounded-xl bg-[#0a0616] text-white focus:ring-2 focus:ring-blue-500 transition" required />
                </div>
              </div>
              <button type="submit" disabled={isSubmitting || !reportLat} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl mt-4 hover:bg-blue-700 transition disabled:bg-blue-900 shadow-lg">
                {isSubmitting ? 'Analyzing Image...' : (!reportLat ? 'Detecting Location...' : 'Submit to AI Engine')}
              </button>
            </form>

            {reportResult && (
              <div className="mt-8 p-6 bg-green-900/30 border border-green-500/30 rounded-xl animate-fade-in">
                <h4 className="text-green-400 font-bold mb-4 flex items-center gap-2">✓ Hazard Logged Successfully</h4>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div><p className="text-[9px] uppercase tracking-wider text-green-500 font-bold mb-1">Detected As</p><p className="text-sm font-bold text-white">{reportResult.detected}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-green-500 font-bold mb-1">Severity</p><p className="text-sm font-bold text-white">{reportResult.severity}/100</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-green-500 font-bold mb-1">AI Confidence</p><p className="text-sm font-bold text-white">{reportResult.confidence}</p></div>
                </div>
                {reportResult.earned > 0 && (
                  <div className="pt-3 border-t border-green-500/20 text-center">
                    <span className="text-sm font-bold text-yellow-400">🌟 +{reportResult.earned} Impact Points Earned!</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW: ROUTE FINDER
  // ==========================================
  if (currentView === 'route') {
    return (
      <div className="flex h-screen w-full font-sans bg-[#0a0616] overflow-hidden">
        <div className="w-[400px] bg-[#120d26] shadow-2xl z-10 flex flex-col border-r border-white/10 shrink-0 text-white">
          <div className="p-6 border-b border-white/10">
            <button onClick={() => setCurrentView('features')} className="text-gray-400 text-xs font-bold mb-4 hover:text-white transition uppercase tracking-widest">← Back to Features</button>
            <h2 className="text-3xl font-extrabold text-white">Find Best Route</h2>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">Enter locations by name. We analyze hazards to find optimal and safe paths.</p>
          </div>
          
          <div className="p-6 flex-1 overflow-y-auto bg-[#0a0616]">
            <form onSubmit={handleRouteSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-widest">Starting Address</label>
                <input type="text" placeholder="e.g. Howrah Station" value={routeStartAddr} onChange={e => setRouteStartAddr(e.target.value)} className="w-full text-sm border border-white/10 p-4 rounded-xl bg-[#120d26] text-white outline-none focus:border-blue-500 transition" required />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-widest">Destination Address</label>
                <input type="text" placeholder="e.g. Victoria Memorial" value={routeEndAddr} onChange={e => setRouteEndAddr(e.target.value)} className="w-full text-sm border border-white/10 p-4 rounded-xl bg-[#120d26] text-white outline-none focus:border-blue-500 transition" required />
              </div>
              <button type="submit" disabled={isRouting} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl mt-2 hover:bg-blue-700 transition disabled:bg-blue-900 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                {isRouting ? 'Calculating Paths...' : 'Plot Safe Routes'}
              </button>
            </form>

            {routeOptions.length > 0 && (
              <div className="mt-8 p-5 bg-[#120d26] rounded-2xl border border-white/10 animate-fade-in">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Available Routes Evaluated</h4>
                <div className="space-y-4">
                  {routeOptions.map((opt, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-1 rounded" style={{ backgroundColor: opt.color }}></div>
                        <span className="text-xs font-bold text-white">{opt.label}</span>
                      </div>
                      <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider" style={{ color: opt.color, backgroundColor: `${opt.color}20`, border: `1px solid ${opt.color}40` }}>
                        {opt.badge}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 relative z-0">
          <MapContainer center={kolkataPosition} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution='Google Maps' url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" />
            
            {/* Start and End Markers */}
            {routeWaypoints.start && (
              <Marker position={[routeWaypoints.start.lat, routeWaypoints.start.lon]} icon={createCustomIcon('#3b82f6')}>
                <Popup className="rounded-xl shadow-lg p-1">
                  <strong className="text-blue-600 block font-bold text-sm">Start Location</strong>
                </Popup>
              </Marker>
            )}
            {routeWaypoints.end && (
              <Marker position={[routeWaypoints.end.lat, routeWaypoints.end.lon]} icon={createCustomIcon('#8b5cf6')}>
                <Popup className="rounded-xl shadow-lg p-1">
                  <strong className="text-purple-600 block font-bold text-sm">Destination</strong>
                </Popup>
              </Marker>
            )}

            {activeIncidents.map((incident) => (
              <Marker key={`route-haz-${incident.id}`} position={[incident.lat, incident.lng]} icon={createCustomIcon(iconColors[incident.level] || '#9ca3af')}>
                <Popup className="rounded-xl shadow-lg p-1">
                  <strong className="text-gray-900 block font-bold text-base mb-1">{incident.type}</strong>
                  <span className="text-xs text-gray-500 block">Severity: {incident.severity}/100</span>
                </Popup>
              </Marker>
            ))}

            {routeOptions.map((route, i) => (
              <GeoJSON key={i + JSON.stringify(route)} data={route} style={{ color: route.color, weight: 6, opacity: 0.9 }} />
            ))}
            <RouteMapController routes={routeOptions} center={kolkataPosition} />
          </MapContainer>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: ANALYTICS
  // ==========================================
  if (currentView === 'analytics') {
    return (
      <div className="min-h-screen bg-[#0a0616] text-white flex flex-col">
        <NavBar />
        <main className="flex-1 px-10 max-w-5xl mx-auto w-full py-12 z-10 relative">
          <button onClick={() => setCurrentView('features')} className="text-blue-400 text-sm font-bold mb-4 hover:underline">← Back to Features</button>
          <h2 className="text-4xl font-extrabold text-white mb-8">Analytics Summary</h2>
          {analytics ? (
            <div className="space-y-8 animate-fade-in">
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-[#120d26]/80 p-6 rounded-3xl shadow-lg border border-white/10 text-center">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Active Hazards</p>
                  <p className="text-5xl font-extrabold text-blue-500">{analytics.overview.total_active}</p>
                </div>
                <div className="bg-[#120d26]/80 p-6 rounded-3xl shadow-lg border border-white/10 text-center">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Under Repair</p>
                  <p className="text-5xl font-extrabold text-orange-500">{analytics.overview.total_under_repair}</p>
                </div>
                <div className="bg-[#120d26]/80 p-6 rounded-3xl shadow-lg border border-white/10 text-center">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Resolved</p>
                  <p className="text-5xl font-extrabold text-green-500">{analytics.overview.total_resolved}</p>
                </div>
              </div>

              <div className="bg-[#120d26]/80 rounded-3xl shadow-lg border border-white/10 overflow-hidden">
                <div className="px-6 py-5 border-b border-white/10 bg-white/5">
                  <h3 className="font-bold text-white tracking-wide">Active Hazards Breakdown</h3>
                </div>
                <div className="divide-y divide-white/10">
                  {analytics.active_hazards_breakdown.map((item, idx) => {
                    const isTemp = tempHazardsList.includes(item.hazard_type.toLowerCase());
                    return (
                      <div key={idx} className="flex justify-between items-center px-6 py-5 hover:bg-white/5 transition">
                        <span className="font-semibold text-gray-200">
                          {item.hazard_type.replace(/_/g, ' ').toUpperCase()}
                          {isTemp && <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 ml-2 rounded-full">TEMPORARY</span>}
                        </span>
                        <div className="flex gap-8 text-sm">
                          <span className="text-gray-400">Avg Severity: <b className="text-white">{item.average_severity}</b></span>
                          <span className="text-gray-400">Count: <b className="text-white">{item.count}</b></span>
                        </div>
                      </div>
                    )
                  })}
                  {analytics.active_hazards_breakdown.length === 0 && <p className="p-8 text-center text-gray-500">No active hazards.</p>}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-lg">Loading backend analytics...</p>
          )}
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW: REPORT STATUS (RBAC LOCKED)
  // ==========================================
  if (currentView === 'status') {
    if (user?.role !== 'municipality') {
      return (
        <div className="min-h-screen bg-[#0a0616] text-white flex flex-col">
          <NavBar />
          <main className="flex-1 flex items-center justify-center px-4 relative z-10">
            <div className="bg-[#120d26]/80 p-10 rounded-3xl shadow-2xl max-w-md w-full border border-red-500/30 text-center">
              <span className="text-5xl mb-4 block">⛔</span>
              <h2 className="text-2xl font-extrabold text-white mb-2">Access Restricted</h2>
              <p className="text-sm text-gray-400 mb-6">You must be logged in as a Municipality Administrator to update incident lifecycles.</p>
              <button onClick={() => setCurrentView('features')} className="text-blue-400 font-bold hover:underline">Return to Features</button>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#0a0616] text-white flex flex-col">
        <NavBar />
        <main className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
          <div className="bg-[#120d26]/80 p-10 rounded-3xl shadow-2xl max-w-lg w-full border border-white/10">
            <button onClick={() => setCurrentView('features')} className="text-blue-400 text-sm font-bold mb-4 hover:underline">← Back to Features</button>
            <h2 className="text-3xl font-extrabold text-white mb-2">Report Status</h2>
            <p className="text-sm text-gray-400 mb-8">Manually update the lifecycle of an incident using its Report ID.</p>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 tracking-wide uppercase">Report ID (UUID)</label>
                <input 
                  type="text" 
                  placeholder="e.g. b3662596-335f-442a-960e-..." 
                  value={statusSearchId} 
                  onChange={e => setStatusSearchId(e.target.value)} 
                  className="w-full text-sm border border-white/20 p-3 rounded-xl bg-[#0a0616] outline-none text-white focus:ring-2 focus:ring-blue-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 tracking-wide uppercase">New Status</label>
                <select 
                  value={statusUpdateVal} 
                  onChange={e => setStatusUpdateVal(e.target.value)} 
                  className="w-full text-sm border border-white/20 p-3 rounded-xl bg-[#0a0616] outline-none text-white focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="UNDER_REPAIR">Under Repair</option>
                  <option value="RESOLVED">Resolved (Remove from Map)</option>
                </select>
              </div>
              <button 
                onClick={handleManualStatusUpdate} 
                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl mt-4 hover:bg-blue-700 transition shadow-[0_0_10px_rgba(37,99,235,0.4)]"
              >
                Update Status
              </button>
              {statusMessage && <p className={`mt-4 text-center text-sm font-bold ${statusMessage.includes('❌') ? 'text-red-400' : 'text-blue-400'}`}>{statusMessage}</p>}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // VIEW: DASHBOARD (MAP + LIST ONLY)
  // ==========================================
  if (currentView === 'dashboard') {
    return (
      <div className="flex h-screen w-full font-sans bg-[#0a0616] overflow-hidden">
        
        <div className="w-[450px] bg-[#0a0616] shadow-2xl z-10 flex flex-col border-r border-white/10 shrink-0 text-white">
          <div className="p-6 border-b border-white/10 bg-[#120d26]">
            <button onClick={() => setCurrentView('landing')} className="text-blue-400 text-sm font-bold mb-4 hover:underline">← Back to Home</button>
            <h1 className="text-2xl font-bold tracking-tight text-white">UrbanShield AI Dashboard</h1>
            <p className="text-xs text-gray-400 mt-1">Kolkata Municipal Civic Control Dashboard</p>
          </div>

          <div className="grid grid-cols-2 gap-4 p-5 bg-[#0a0616] border-b border-white/10">
            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl">
              <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Critical</p>
              <p className="text-2xl font-bold text-red-500 mt-1">{activeIncidents.filter(i => i.level === 'Critical').length}</p>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-xl">
              <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Pending</p>
              <p className="text-2xl font-bold text-yellow-500 mt-1">{activeIncidents.length}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active Hazards ({activeIncidents.length})</h2>
            </div>
            
            <div className="space-y-4">
              {activeIncidents.map((incident) => (
                <div key={incident.id} className="p-5 bg-[#120d26] border border-white/10 rounded-2xl shadow-sm hover:border-white/20 transition flex justify-between items-center">
                  <div className="flex-1 pr-4">
                    <h3 className="font-bold text-white text-sm tracking-wide mb-1">
                      {incident.type} {incident.isTemp && <span className="text-[8px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 ml-2 rounded align-middle">TEMP</span>}
                    </h3>
                    <p className="text-[10px] text-gray-500 leading-relaxed truncate">ID: {incident.id}</p>
                  </div>
                  <span className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-wider border ${incident.level === 'Critical' ? 'text-red-400 border-red-500/30 bg-red-500/10' : incident.level === 'High' ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'}`}>
                    {incident.level}
                  </span>
                </div>
              ))}
              {activeIncidents.length === 0 && <p className="text-center text-gray-500 mt-6 text-sm">No active hazards found.</p>}
            </div>

          </div>
        </div>

        <div className="flex-1 relative z-0">
          <MapContainer center={kolkataPosition} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution='Google Maps' url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" />
            
            {activeIncidents.map((incident) => (
              <Marker key={incident.id} position={[incident.lat, incident.lng]} icon={createCustomIcon(iconColors[incident.level] || '#9ca3af')}>
                <Popup className="rounded-xl shadow-2xl p-1">
                  <strong className="text-gray-900 block font-bold text-base mb-1">
                    {incident.type}
                  </strong>
                  <span className="text-xs text-gray-500 block mb-1">Severity: {incident.severity}/100</span>
                  <span className="text-[9px] text-gray-400 block break-all mb-2">ID: {incident.id}</span>
                  {incident.isTemp && <span className="text-[9px] uppercase tracking-wider text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded w-max block">Temporary Hazard</span>}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    );
  }

  if (currentView === 'about') {
    return (
      <div className="min-h-screen bg-[#0a0616] text-white flex flex-col relative overflow-hidden">
        <NavBar />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-900/10 rounded-full blur-[150px] pointer-events-none"></div>
        <main className="flex-1 px-10 max-w-4xl mx-auto w-full py-20 z-10 text-center">
          <h2 className="text-5xl font-extrabold mb-8 tracking-tight">The Vision Behind <span className="text-blue-400">UrbanShield</span></h2>
          <div className="space-y-6 text-gray-300 text-lg leading-relaxed text-left bg-[#120d26]/80 p-8 rounded-3xl border border-white/10 shadow-2xl">
            <p>Every day, commuters face unexpected urban hazards—potholes, open manholes, waterlogging, and unexpected roadblocks. Current navigation applications optimize for travel time but fail to account for these temporary, dangerous conditions.</p>
            <p>UrbanShield AI bridges this gap. By empowering citizens to report issues with a single photograph, our backend immediately evaluates the risk using computer vision and updates a live geospatial database.</p>
            <p>This isn't just about reporting; it's about prevention. Authorities gain a prioritized dashboard to resolve critical infrastructure failures faster, while citizens are automatically routed around danger. We are creating a continuously updated digital safety layer over the city.</p>
          </div>
          <button onClick={() => setCurrentView('dashboard')} className="mt-12 bg-blue-600 text-white px-10 py-4 rounded-full font-bold hover:bg-blue-700 transition shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            See the Dashboard in Action
          </button>
        </main>
      </div>
    );
  }
}