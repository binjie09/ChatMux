import { useEffect, useRef } from "react";

export function useExternalReconnect(reconnectSignal: number, reconnect: () => void) {
  const previousSignalRef = useRef(reconnectSignal);
  useEffect(() => {
    if (previousSignalRef.current === reconnectSignal) {
      return;
    }
    previousSignalRef.current = reconnectSignal;
    reconnect();
  }, [reconnectSignal]);
}
