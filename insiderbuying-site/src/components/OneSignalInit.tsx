"use client";

import { useEffect, useRef } from "react";

export function OneSignalInit() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) return;

    initialized.current = true;

    import("react-onesignal").then((OneSignal) => {
      OneSignal.default.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!,
        allowLocalhostAsSecureOrigin:
          process.env.NODE_ENV === "development",
      });
    });
  }, []);

  return null;
}
