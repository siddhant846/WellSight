"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface WellGeoItem {
  well_id?: string;
  asset_id?: string;
  well?: string;
  name?: string;
  lat?: number;
  latitude?: number;
  lon?: number;
  longitude?: number;
  lng?: number;
  well_type?: string;
  area?: string;
  is_producing?: boolean;
  status_label?: string;
  delta_t?: number;
  threshold?: number;
  spill_volume_bbl?: number;
  barrels?: number;
  date?: string;
  inspected_at?: string;
}

interface MapComponentProps {
  wells: WellGeoItem[];
  center?: [number, number];
  zoom?: number;
}

export default function MapComponent({ wells, center, zoom }: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Normalize and filter valid coordinates
    const validWells = (wells || [])
      .map((w) => {
        const id = w.well_id || w.asset_id || w.well || "WELL";
        const lat = Number(w.lat ?? w.latitude);
        const lon = Number(w.lon ?? w.longitude ?? w.lng);
        const isSpill = w.spill_volume_bbl !== undefined || w.barrels !== undefined;
        const bbl = w.spill_volume_bbl ?? w.barrels;
        const date = w.date || w.inspected_at || "";
        return {
          id,
          name: w.name || id,
          lat,
          lon,
          well_type: w.well_type || "T200",
          area: w.area || "Permian Basin",
          is_producing: w.is_producing ?? (!isSpill),
          status_label: w.status_label || (isSpill ? `${bbl} bbl spill` : undefined),
          isSpill,
          bbl,
          date,
          delta_t: w.delta_t,
          threshold: w.threshold
        };
      })
      .filter((w) => !isNaN(w.lat) && !isNaN(w.lon) && w.lat !== 0 && w.lon !== 0);

    const defaultCenter: [number, number] = center || (
      validWells.length > 0
        ? [validWells[0].lat, validWells[0].lon]
        : [32.15, -102.16]
    );

    // Initialize map if not already created
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: zoom || 11,
        scrollWheelZoom: false
      });

      // Google Maps Hybrid Satellite Layer (Imagery + Roads + Labels)
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const googleTileUrl = apiKey 
        ? `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${apiKey}&key=${apiKey}`
        : "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";

      L.tileLayer(googleTileUrl, {
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        attribution: '&copy; <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer">Google Maps</a>'
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    // Add markers
    validWells.forEach((w) => {
      // Spills are amber/orange; Non-producing is rose; Producing is emerald
      const color = w.isSpill
        ? "#f59e0b" // amber
        : w.is_producing
        ? "#10b981" // emerald
        : "#f43f5e"; // rose

      const marker = L.circleMarker([w.lat, w.lon], {
        radius: w.isSpill ? 9 : 8,
        color: color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2
      }).addTo(map);

      const statusBadge = w.status_label || (w.isSpill ? `${w.bbl} bbl Spill` : (w.is_producing ? "PRODUCING" : "DOWN"));

      const popupContent = `
        <div style="font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; color: #0f172a; padding: 4px; min-width: 170px;">
          <div style="font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span style="color: #0284c7; font-size: 13px;">${w.id}</span>
            <span style="font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: white; background-color: ${color}; text-transform: uppercase;">
              ${statusBadge}
            </span>
          </div>
          <div style="margin-top: 6px; line-height: 1.5; color: #334155;">
            ${w.date ? `<div>Date: <b>${w.date}</b></div>` : ""}
            ${w.isSpill ? `<div>Volume: <b style="color: #b45309;">${w.bbl} bbl</b></div>` : ""}
            <div>Type: <b>${w.well_type}</b></div>
            <div>Area: <b>${w.area}</b></div>
            ${typeof w.delta_t === "number" ? `<div>ΔT: <b>${w.delta_t}°C</b> (Limit: ${w.threshold}°C)</div>` : ""}
            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Coords: ${w.lat.toFixed(5)}, ${w.lon.toFixed(5)}</div>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
    });

    // If multiple wells, fit bounds
    if (validWells.length > 1) {
      const bounds = L.latLngBounds(validWells.map((w) => [w.lat, w.lon]));
      map.fitBounds(bounds, { padding: [40, 40] });
    } else if (validWells.length === 1) {
      map.setView([validWells[0].lat, validWells[0].lon], 12);
    }

  }, [wells, center, zoom]);

  // Cleanup map instance on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={mapContainerRef}
      className="h-80 w-full rounded-xl overflow-hidden border border-slate-700/60 shadow-lg relative bg-slate-900"
    />
  );
}
