import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { heartbeatHost, type Host } from "./api";
import { errorMessage } from "./view-utils";

const hostHeartbeatIntervalMs = 30_000;

type HostHeartbeatOptions = {
  gatewayReady: boolean;
  hosts: Host[];
  onError: (message: string) => void;
  onHostHeartbeat: (host: Host) => void;
  onHostStatusChange: (hostId: string, status: Host["status"]) => void;
};

export function useHostHeartbeat(options: HostHeartbeatOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const targetKey = useMemo(() => heartbeatTargetsKey(options.hosts), [options.hosts]);

  useEffect(() => {
    if (!options.gatewayReady) {
      return;
    }
    let active = true;
    const beat = () => void heartbeatHosts(optionsRef, () => active);
    beat();
    const timer = window.setInterval(beat, hostHeartbeatIntervalMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [options.gatewayReady, targetKey]);
}

async function heartbeatHosts(optionsRef: MutableRefObject<HostHeartbeatOptions>, isActive: () => boolean) {
  const options = optionsRef.current;
  const targets = heartbeatTargets(options.hosts);
  if (targets.length === 0) {
    return;
  }
  targets.forEach((host) => options.onHostStatusChange(host.id, "connecting"));
  const results = await Promise.allSettled(targets.map((host) => heartbeatHost(host.id)));
  if (!isActive()) {
    return;
  }
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      options.onHostHeartbeat(result.value.host);
      return;
    }
    options.onHostStatusChange(targets[index].id, "error");
    options.onError(errorMessage(result.reason));
  });
}

function heartbeatTargets(hosts: Host[]) {
  return hosts.filter((host) => host.hasCredential && host.hostKeyFingerprint);
}

function heartbeatTargetsKey(hosts: Host[]) {
  return heartbeatTargets(hosts).map((host) => `${host.id}:${host.hostKeyFingerprint}`).join("|");
}
