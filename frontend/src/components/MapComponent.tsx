"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface WellGeoItem {
  well_id: string;
  name: string;
  lat: number;
  lon: number;
  well_type: string;
  area: string;
  is_producing?: boolean;
  status_label?: string;
  delta_t?: number;
  threshold?: number;
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

    // Filter valid wells
    const validWells = wells.filter(
      (w) => typeof w.lat === "number" && typeof w.lon === "number" && !isNaN(w.lat) && !isNaN(w.lon)
    );

    const defaultCenter: [number, number] = center || (
      validWells.length > 0
        ? [validWells[0].lat, validWells[0].lon]
        : [31.9, -102.3]
    );

    // Initialize map if not already created
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: zoom || 7,
        scrollWheelZoom: false
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear existing markers and layer group
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    // Add markers
    validWells.forEach((w) => {
      const isProd = w.is_producing ?? true;
      const color = isProd ? "#10b981" : "#f43f5e";

      const marker = L.circleMarker([w.lat, w.lon], {
        radius: 8,
        color: color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2
      }).addTo(map);

      const popupContent = `
        <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; padding: 2px;">
          <div style="font-weight: bold; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; display: flex; justify-content: space-between; gap: 8px;">
            <span>${w.name} (${w.well_id})</span>
            <span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; color: white; background-color: ${color};">
              ${w.status_label || (isProd ? "PRODUCING" : "NOT PRODUCING")}
            </span>
          </div>
          <div style="margin-top: 4px; line-height: 1.4;">
            <div>Type: <b>${w.well_type}</b></div>
            <div>Area: <b>${w.area}</b></div>
            ${typeof w.delta_t === "number" ? `<div>ΔT: <b>${w.delta_t}°C</b> (Threshold: ${w.threshold}°C)</div>` : ""}
            <div>Coordinates: ${w.lat.toFixed(4)}, ${w.lon.toFixed(4)}</div>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
    });

    // If multiple wells, fit bounds
    if (validWells.length > 1) {
      const bounds = L.latLngBounds(validWells.map((w) => [w.lat, w.lon]));
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    return () => {
      // Keep instance or cleanup on unmount
    };
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
