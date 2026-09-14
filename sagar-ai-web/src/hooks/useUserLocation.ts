import { useCallback, useState } from "react";

import { useAppStore } from "../store/appStore";

export type LocationRequestStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable";

export function useUserLocation() {
  const [status, setStatus] = useState<LocationRequestStatus>("idle");

  const setDeviceLocation = useAppStore(
    (state) => state.setDeviceLocation
  );

  const setLocationPermission = useAppStore(
    (state) => state.setLocationPermission
  );

  const requestLocation = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (
        typeof navigator === "undefined" ||
        !navigator.geolocation
      ) {
        setStatus("unavailable");
        setLocationPermission("unavailable");
        resolve(false);
        return;
      }

      setStatus("requesting");

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDeviceLocation(
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            "Current location"
          );
          setStatus("granted");
          resolve(true);
        },
        (error) => {
          const denied = error.code === error.PERMISSION_DENIED;
          setStatus(denied ? "denied" : "unavailable");
          setLocationPermission(denied ? "denied" : "unavailable");
          resolve(false);
        },
        {
          enableHighAccuracy: false,
          maximumAge: 60000,
          timeout: 8000,
        }
      );
    });
  }, [setDeviceLocation, setLocationPermission]);

  return { status, requestLocation };
}

export default useUserLocation;
