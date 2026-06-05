import { useEffect, useRef } from "react";

type AppStartupEffectsOptions = {
  autoListSessions: boolean;
  gatewayReady: boolean;
  resetCredential: () => void;
  selectedHostHasCredential: boolean;
  selectedHostId: string;
  selectedHostSelectionVersion: number;
  selectedHostUpdatedAt: string;
  onAuditRefresh: () => void;
  onHostsRefresh: () => void;
  onListSessions: () => void;
};

export function useAppStartupEffects(options: AppStartupEffectsOptions) {
  const autoConnectedHostRef = useRef("");

  useEffect(() => {
    options.resetCredential();
    autoConnectedHostRef.current = "";
  }, [options.resetCredential, options.selectedHostHasCredential, options.selectedHostId]);

  useEffect(() => {
    if (!options.gatewayReady) {
      return;
    }
    options.onHostsRefresh();
    options.onAuditRefresh();
  }, [options.gatewayReady]);

  useEffect(() => {
    if (!options.autoListSessions || !options.gatewayReady || !options.selectedHostId || !options.selectedHostHasCredential) {
      return;
    }
    const autoConnectKey = [
      options.selectedHostId,
      options.selectedHostUpdatedAt,
      options.selectedHostHasCredential,
      options.selectedHostSelectionVersion,
    ].join(":");
    if (autoConnectedHostRef.current === autoConnectKey) {
      return;
    }
    autoConnectedHostRef.current = autoConnectKey;
    options.onListSessions();
  }, [
    options.gatewayReady,
    options.autoListSessions,
    options.selectedHostHasCredential,
    options.selectedHostId,
    options.selectedHostSelectionVersion,
    options.selectedHostUpdatedAt,
  ]);
}
