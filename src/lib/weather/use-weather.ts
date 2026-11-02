import { useState, useEffect, useRef, useCallback } from "react";
import type { WeatherData } from "./types";
import { fetchWeather } from "./open-meteo";

export interface UseWeatherOptions {
  coords?: { lat: number; lng: number } | null | undefined;
  locationName?: string | undefined;
  enabled?: boolean | undefined;
}

export function useWeather({ coords, locationName, enabled = true }: UseWeatherOptions = {}) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const dataRef = useRef<WeatherData | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadWeather = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!enabled) return;

      const currentReqId = ++requestIdRef.current;

      if (!dataRef.current) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      try {
        const result = await fetchWeather({
          latitude: coords?.lat,
          longitude: coords?.lng,
          locationName,
          forceRefresh,
        });

        if (mountedRef.current && currentReqId === requestIdRef.current) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current && currentReqId === requestIdRef.current) {
          console.warn("[RescueLink Weather] Could not load weather:", err);
          setError(
            err instanceof Error ? err.message : "Unable to connect to Open-Meteo weather service.",
          );
        }
      } finally {
        if (mountedRef.current && currentReqId === requestIdRef.current) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [coords?.lat, coords?.lng, locationName, enabled],
  );

  useEffect(() => {
    loadWeather(false);
  }, [loadWeather]);

  const refetch = useCallback(() => {
    return loadWeather(true);
  }, [loadWeather]);

  return {
    weather: data,
    loading,
    error,
    isRefreshing,
    refetch,
  };
}
