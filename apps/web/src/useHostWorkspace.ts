import { useState } from "react";
import {
  createHost,
  listHosts,
  setHostPinned,
  setHostShared,
  trustHost,
  type CreateHostInput,
} from "./api";
import { errorMessage, sortHosts } from "./view-utils";

type HostWorkspaceOptions = {
  onAuditRefresh: () => void;
  onError: (message: string) => void;
  onHostCreated: () => void;
  onHostSelected: () => void;
};

export function useHostWorkspace(options: HostWorkspaceOptions) {
  const [hosts, setHosts] = useState<Awaited<ReturnType<typeof listHosts>>>([]);
  const [selectedHostId, setSelectedHostId] = useState("");
  const [showHostForm, setShowHostForm] = useState(false);
  const selectedHost = hosts.find((host) => host.id === selectedHostId);

  async function refreshHosts() {
    try {
      const nextHosts = await listHosts();
      setHosts(nextHosts);
      setSelectedHostId((current) => current || nextHosts[0]?.id || "");
      options.onError("");
    } catch (err) {
      options.onError(errorMessage(err));
    }
  }

  async function handleCreateHost(input: CreateHostInput) {
    const host = await createHost(input);
    setHosts((current) => sortHosts([host, ...current]));
    setSelectedHostId(host.id);
    setShowHostForm(false);
    options.onHostCreated();
    options.onAuditRefresh();
  }

  function handleSelectHost(hostId: string) {
    setSelectedHostId(hostId);
    options.onHostSelected();
  }

  async function handleTrustHost() {
    if (!selectedHostId) {
      return;
    }
    const trusted = await trustHost(selectedHostId);
    setHosts((current) => current.map((host) => (host.id === trusted.id ? trusted : host)));
    options.onAuditRefresh();
  }

  async function handleTogglePin() {
    if (!selectedHost) {
      return;
    }
    try {
      const updated = await setHostPinned(selectedHost.id, !selectedHost.pinned);
      updateHostInList(updated);
      options.onAuditRefresh();
      options.onError("");
    } catch (err) {
      options.onError(errorMessage(err));
    }
  }

  async function handleToggleShare() {
    if (!selectedHost) {
      return;
    }
    try {
      const updated = await setHostShared(selectedHost.id, !selectedHost.shared);
      updateHostInList(updated);
      options.onAuditRefresh();
      options.onError("");
    } catch (err) {
      options.onError(errorMessage(err));
    }
  }

  function updateHostInList(updated: NonNullable<typeof selectedHost>) {
    setHosts((current) => sortHosts(current.map((host) => (host.id === updated.id ? updated : host))));
  }

  return {
    handleCreateHost,
    handleSelectHost,
    handleTogglePin,
    handleToggleShare,
    handleTrustHost,
    hosts,
    refreshHosts,
    selectedHost,
    selectedHostId,
    setShowHostForm,
    showHostForm,
  };
}
