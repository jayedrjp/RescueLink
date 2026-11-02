import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { Plus, Minus, Crosshair, Layers, Loader2 } from "lucide-react";
import type { Map as LeafletMap, Marker, Circle, LayerGroup } from "leaflet";
import type { EmergencyPlace, Coordinates, DisasterZone } from "@/lib/map/types";

export interface InteractiveMapHandle {
  flyTo: (coords: Coordinates, zoom?: number) => void;
  setView: (coords: Coordinates, zoom?: number) => void;
  getMap: () => LeafletMap | null;
}

interface InteractiveMapProps {
  places: EmergencyPlace[];
  selectedPlaceId?: string | undefined;
  onSelectPlace: (place: EmergencyPlace) => void;
  userLocation: Coordinates | null;
  userAccuracy?: number | undefined;
  center: Coordinates;
  onRecenter: () => void;
  showZones: boolean;
  onToggleZones: () => void;
  disasterZones: DisasterZone[];
  isLoading?: boolean | undefined;
  isTracking?: boolean | undefined;
  onToggleTracking?: (() => void) | undefined;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  shelters: { bg: "#16A34A", text: "#FFFFFF", icon: "🏠" },
  hospitals: { bg: "#0284C7", text: "#FFFFFF", icon: "🏥" },
  police: { bg: "#102D56", text: "#FFFFFF", icon: "🚓" },
  fire: { bg: "#E6293A", text: "#FFFFFF", icon: "🚒" },
  pharmacies: { bg: "#059669", text: "#FFFFFF", icon: "💊" },
};

export const InteractiveMap = forwardRef<InteractiveMapHandle, InteractiveMapProps>(
  function InteractiveMap(
    {
      places,
      selectedPlaceId,
      onSelectPlace,
      userLocation,
      userAccuracy,
      center,
      onRecenter,
      showZones,
      onToggleZones,
      disasterZones,
      isLoading = false,
      isTracking = false,
      onToggleTracking,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<LeafletMap | null>(null);
    const markersLayerRef = useRef<LayerGroup | null>(null);
    const userMarkerRef = useRef<Marker | null>(null);
    const userCircleRef = useRef<Circle | null>(null);
    const zonesLayerRef = useRef<LayerGroup | null>(null);
    const initialCenterRef = useRef<Coordinates>(center);
    const currentCenterRef = useRef<Coordinates>(center);
    currentCenterRef.current = center;
    const onSelectPlaceRef = useRef(onSelectPlace);
    const pendingFlyToRef = useRef<{ coords: Coordinates; zoom: number } | null>(null);
    const userInteractingRef = useRef(false);

    useEffect(() => {
      onSelectPlaceRef.current = onSelectPlace;
    }, [onSelectPlace]);

    const [isClientReady, setIsClientReady] = useState(false);
    const [mapLoaded, setMapLoaded] = useState(false);

    // Expose map camera controls imperatively (MAP-2: queue commands if Leaflet is not yet ready)
    useImperativeHandle(ref, () => ({
      flyTo: (coords: Coordinates, zoom = 16) => {
        if (mapRef.current && isClientReady) {
          mapRef.current.flyTo([coords.lat, coords.lng], zoom, {
            animate: true,
            duration: 1.0,
          });
          pendingFlyToRef.current = null;
        } else {
          pendingFlyToRef.current = { coords, zoom };
        }
      },
      setView: (coords: Coordinates, zoom = 16) => {
        if (mapRef.current && isClientReady) {
          mapRef.current.setView([coords.lat, coords.lng], zoom);
          pendingFlyToRef.current = null;
        } else {
          pendingFlyToRef.current = { coords, zoom };
        }
      },
      getMap: () => mapRef.current,
    }));

    // Initialize Leaflet map instance (strictly in browser client)
    useEffect(() => {
      if (typeof window === "undefined" || !containerRef.current) return;

      let isMounted = true;

      async function initLeaflet() {
        const L = await import("leaflet");

        if (!isMounted || !containerRef.current) return;

        // Ensure container doesn't already have an initialized map
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const startCenter = currentCenterRef.current || initialCenterRef.current;
        const map = L.map(containerRef.current, {
          center: [startCenter.lat, startCenter.lng],
          zoom: 14,
          zoomControl: false,
          attributionControl: true,
        });

        // Standard OpenStreetMap tiles
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        }).addTo(map);

        // Track user interaction to prevent background GPS updates from stealing camera focus
        map.on("dragstart", () => {
          userInteractingRef.current = true;
        });
        map.on("zoomstart", () => {
          userInteractingRef.current = true;
        });

        markersLayerRef.current = L.layerGroup().addTo(map);
        zonesLayerRef.current = L.layerGroup().addTo(map);

        mapRef.current = map;
        setIsClientReady(true);
        setMapLoaded(true);

        // MAP-2: Execute pending flyTo if GPS resolved before Leaflet initialized
        if (pendingFlyToRef.current) {
          const { coords, zoom } = pendingFlyToRef.current;
          map.flyTo([coords.lat, coords.lng], zoom, { animate: true, duration: 1.0 });
          pendingFlyToRef.current = null;
        }
      }

      initLeaflet();

      return () => {
        isMounted = false;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      };
    }, []);

    // Reactive camera update when center prop changes or map becomes ready
    useEffect(() => {
      if (!mapRef.current || !center || !isClientReady) return;
      if (userInteractingRef.current) return;
      const cur = mapRef.current.getCenter();
      const dist = Math.hypot(cur.lat - center.lat, cur.lng - center.lng);
      // Only flyTo if center has actually changed from current Leaflet viewport
      if (dist > 0.0001) {
        mapRef.current.flyTo([center.lat, center.lng], mapRef.current.getZoom() || 15, {
          animate: true,
          duration: 1.0,
        });
      }
    }, [center, isClientReady]);

    // Update places markers
    useEffect(() => {
      if (!mapRef.current || !markersLayerRef.current || !isClientReady) return;

      async function updateMarkers() {
        const L = await import("leaflet");
        if (!markersLayerRef.current) return;

        markersLayerRef.current.clearLayers();

        places.forEach((place) => {
          const meta = CATEGORY_COLORS[place.category] || {
            bg: "#102D56",
            text: "#FFFFFF",
            icon: "📍",
          };
          const isSelected = place.id === selectedPlaceId;

          const iconHtml = `
            <div class="relative flex items-center justify-center transition-transform hover:scale-110 active:scale-95">
              <span style="background-color: ${meta.bg};" class="flex h-10 w-10 items-center justify-center rounded-full text-base shadow-lg border-2 ${
                isSelected ? "border-white ring-4 ring-[#102D56] scale-110" : "border-white"
              }">
                ${meta.icon}
              </span>
            </div>
          `;

          const customIcon = L.divIcon({
            html: iconHtml,
            className: "custom-leaflet-marker",
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          });

          const marker = L.marker([place.coordinates.lat, place.coordinates.lng], {
            icon: customIcon,
            title: place.name,
          });

          marker.on("click", () => {
            onSelectPlaceRef.current(place);
            if (mapRef.current) {
              mapRef.current.panTo([place.coordinates.lat, place.coordinates.lng], {
                animate: true,
                duration: 0.5,
              });
            }
          });

          marker.addTo(markersLayerRef.current!);
        });
      }

      updateMarkers();
    }, [places, selectedPlaceId, isClientReady]);

    // Update user GPS location pin and accuracy circle
    useEffect(() => {
      if (!mapRef.current || !isClientReady) return;

      async function updateUserGps() {
        const L = await import("leaflet");
        if (!mapRef.current) return;

        if (userMarkerRef.current) {
          userMarkerRef.current.remove();
          userMarkerRef.current = null;
        }
        if (userCircleRef.current) {
          userCircleRef.current.remove();
          userCircleRef.current = null;
        }

        if (userLocation) {
          const gpsIconHtml = `
            <div class="relative grid h-8 w-8 place-items-center">
              <span class="absolute inset-0 rounded-full bg-sky-500/25 animate-ping"></span>
              <span class="relative block h-4 w-4 rounded-full border-2 border-white bg-sky-500 shadow-md"></span>
            </div>
          `;

          const userIcon = L.divIcon({
            html: gpsIconHtml,
            className: "user-gps-marker",
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });

          userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
            icon: userIcon,
            zIndexOffset: 1000,
            title: "Your GPS Location",
          }).addTo(mapRef.current);

          if (userAccuracy && userAccuracy > 0) {
            userCircleRef.current = L.circle([userLocation.lat, userLocation.lng], {
              radius: Math.min(userAccuracy, 300),
              color: "#0284C7",
              weight: 1,
              fillColor: "#0284C7",
              fillOpacity: 0.08,
            }).addTo(mapRef.current);
          }
        }
      }

      updateUserGps();
    }, [userLocation, userAccuracy, isClientReady]);

    // Update Disaster Zones
    useEffect(() => {
      if (!mapRef.current || !zonesLayerRef.current || !isClientReady) return;

      async function updateZones() {
        const L = await import("leaflet");
        if (!zonesLayerRef.current) return;

        zonesLayerRef.current.clearLayers();

        if (showZones) {
          disasterZones.forEach((zone) => {
            const color = zone.severity === "critical" ? "#E6293A" : "#F59E0B";

            const circle = L.circle([zone.coordinates.lat, zone.coordinates.lng], {
              radius: zone.radiusMeters,
              color,
              weight: 2,
              dashArray: "6, 6",
              fillColor: color,
              fillOpacity: 0.15,
            });

            circle.bindPopup(`
              <div class="p-1">
                <strong style="color: ${color};">⚠️ ${zone.title}</strong>
                <p class="text-xs mt-1 text-gray-700">${zone.description}</p>
              </div>
            `);

            circle.addTo(zonesLayerRef.current!);
          });
        }
      }

      updateZones();
    }, [showZones, disasterZones, isClientReady]);

    // Controls: Zoom in / Zoom out
    const handleZoomIn = () => {
      if (mapRef.current) mapRef.current.zoomIn();
    };

    const handleZoomOut = () => {
      if (mapRef.current) mapRef.current.zoomOut();
    };

    return (
      <div className="relative h-full w-full overflow-hidden">
        {/* Map DOM Element */}
        <div ref={containerRef} className="h-full w-full bg-[#E5E9EE]" />

        {/* Loading overlay when initializing or loading live data */}
        {(!mapLoaded || isLoading) && (
          <div className="pointer-events-none absolute left-4 top-28 z-[400] flex items-center gap-2 rounded-2xl bg-white/90 px-3 py-1.5 shadow-md backdrop-blur-md">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#102D56]" />
            <span className="text-[11.5px] font-semibold text-[#102D56]">
              {!mapLoaded ? "Loading OpenStreetMap…" : "Updating nearby services…"}
            </span>
          </div>
        )}

        {/* Side Map Controls */}
        <div className="absolute right-4 top-[38%] z-[400] flex flex-col gap-2">
          {/* Track My Location / Recenter Button (MAP-2 & MAP-7) */}
          <button
            type="button"
            aria-label={
              isTracking ? "Live GPS tracking active (click to recenter)" : "Track my location"
            }
            title={isTracking ? "Live GPS Tracking Active" : "Track My Location"}
            onClick={() => {
              userInteractingRef.current = false;
              if (onToggleTracking) {
                onToggleTracking();
              }
              onRecenter();
            }}
            disabled={isLoading}
            className={`press flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg transition-transform active:scale-95 disabled:opacity-75 ${
              isTracking
                ? "bg-sky-500 text-white shadow-sky-500/30 ring-2 ring-sky-300"
                : "bg-white text-navy hover:bg-gray-50"
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
            ) : (
              <Crosshair
                className={`h-5 w-5 ${
                  isTracking
                    ? "text-white animate-pulse"
                    : userLocation
                      ? "text-sky-600"
                      : "text-gray-400"
                }`}
              />
            )}
          </button>

          {/* Disaster Zones Toggle */}
          <button
            type="button"
            aria-label="Toggle disaster zones"
            onClick={onToggleZones}
            className={`press flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg transition-colors active:scale-95 ${
              showZones ? "bg-[#E6293A] text-white" : "bg-white text-[#102D56] hover:bg-gray-50"
            }`}
          >
            <Layers className="h-5 w-5" />
          </button>

          {/* Zoom In */}
          <button
            type="button"
            aria-label="Zoom in"
            onClick={handleZoomIn}
            className="press flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#102D56] shadow-lg transition-colors hover:bg-gray-50 active:scale-95"
          >
            <Plus className="h-5 w-5" />
          </button>

          {/* Zoom Out */}
          <button
            type="button"
            aria-label="Zoom out"
            onClick={handleZoomOut}
            className="press flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#102D56] shadow-lg transition-colors hover:bg-gray-50 active:scale-95"
          >
            <Minus className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  },
);
