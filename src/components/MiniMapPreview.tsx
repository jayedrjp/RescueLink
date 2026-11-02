import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import type { Coordinates } from "@/lib/map/types";
import { isValidCoordinates } from "@/lib/map/types";

interface MiniMapPreviewProps {
  location: Coordinates;
  zoom?: number | undefined;
  responderLocation?: Coordinates | undefined;
  label?: string | undefined;
  className?: string | undefined;
}

export function MiniMapPreview({
  location,
  zoom = 15,
  responderLocation,
  label = "Your Emergency Location",
  className = "h-40 w-full",
}: MiniMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const responderMarkerRef = useRef<Marker | null>(null);

  const hasValidCoords = isValidCoordinates(location);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current || !hasValidCoords) return;

    let isMounted = true;

    async function initMiniMap() {
      const L = await import("leaflet");

      if (!isMounted || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        center: [location.lat, location.lng],
        zoom,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        touchZoom: true,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // User Emergency Marker (Red with pulse)
      const userIcon = L.divIcon({
        html: `
          <div class="relative grid h-8 w-8 place-items-center">
            <span class="absolute inset-0 rounded-full bg-[#E6293A]/30 animate-ping"></span>
            <span class="relative block h-4.5 w-4.5 rounded-full border-2 border-white bg-[#E6293A] shadow-md"></span>
          </div>
        `,
        className: "mini-user-marker",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      userMarkerRef.current = L.marker([location.lat, location.lng], {
        icon: userIcon,
        title: label,
      }).addTo(map);

      // If responder is dispatched, add responder pin and connecting line
      if (responderLocation) {
        const responderIcon = L.divIcon({
          html: `
            <div class="flex h-7 w-7 items-center justify-center rounded-full bg-[#102D56] text-white shadow-md border-2 border-white text-xs">
              🚑
            </div>
          `,
          className: "mini-responder-marker",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        responderMarkerRef.current = L.marker([responderLocation.lat, responderLocation.lng], {
          icon: responderIcon,
          title: "Assigned Responder Unit",
        }).addTo(map);

        L.polyline(
          [
            [responderLocation.lat, responderLocation.lng],
            [location.lat, location.lng],
          ],
          {
            color: "#102D56",
            weight: 3,
            dashArray: "6, 6",
            opacity: 0.8,
          },
        ).addTo(map);

        // Fit both in view
        map.fitBounds(
          [
            [location.lat, location.lng],
            [responderLocation.lat, responderLocation.lng],
          ],
          { padding: [24, 24] },
        );
      }

      mapRef.current = map;
    }

    initMiniMap();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [location.lat, location.lng, responderLocation, label, zoom, hasValidCoords]);

  if (!hasValidCoords) {
    return (
      <div
        className={`grid place-items-center rounded-2xl bg-muted text-xs text-muted-foreground ${className}`}
      >
        Location preview unavailable
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-t-3xl bg-[#E5E9EE] ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
