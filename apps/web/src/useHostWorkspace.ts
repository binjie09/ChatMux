import { useState } from "react";
import {
  createHost,
  deleteHost,
  listHosts,
  setHostPinned,
  trustHost,
  updateHost,
  type CreateHostInput,
  type Host,
} from "./api";
import { errorMessage, sortHosts } from "./view-utils";

type HostWorkspaceOptions = {
  onAuditRefresh: () => void;
  onError: (message: string) => void;
  onHostCreated: () => void;
  onHostSelected: () => void;
};

export function useHostWorkspace(options: HostWorkspaceOptions) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHostId, setSelectedHostId] = useState("");
  const [hostSelectionVersion, setHostSelectionVersion] = useState(0);
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
    try {
      const host = await createHost(input);
      setHosts((current) => sortHosts([host, ...current]));
      setSelectedHostId(host.id);
      setShowHostForm(false);
      options.onHostCreated();
      options.onAuditRefresh();
      options.onError("");
    } catch (err) {
      options.onError(errorMessage(err));
      throw err;
    }
  }

  function handleSelectHost(hostId: string) {
    setSelectedHostId(hostId);
    setHostSelectionVersion((current) => current + 1);
    options.onHostSelected();
  }

  async function handleTrustHost(hostId = selectedHostId) {
    if (!hostId) {
      return null;
    }
    try {
      const trusted = await trustHost(hostId);
      setHosts((current) => current.map((host) => (host.id === trusted.id ? trusted : host)));
      options.onAuditRefresh();
      options.onError("");
      return trusted;
    } catch (err) {
      options.onError(errorMessage(err));
      throw err;
    }
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

  async function handleUpdateHost(hostId: string, input: CreateHostInput) {
    try {
      const updated = await updateHost(hostId, input);
      updateHostInList(updated);
      options.onAuditRefresh();
      options.onError("");
    } catch (err) {
      options.onError(errorMessage(err));
      throw err;
    }
  }

  async function handleDeleteHost(hostId: string) {
    try {
      await deleteHost(hostId);
      removeHostFromList(hostId);
      options.onAuditRefresh();
      options.onError("");
    } catch (err) {
      options.onError(errorMessage(err));
      throw err;
    }
  }

  function handleHostHeartbeat(host: Host) {
    updateHostInList(host);
  }

  function handleHostHeartbeatStatus(hostId: string, status: Host["status"]) {
    setHosts((current) => current.map((host) => (host.id === hostId ? { ...host, status } : host)));
  }

  function updateHostInList(updated: Host) {
    setHosts((current) => sortHosts(current.map((host) => (host.id === updated.id ? updated : host))));
  }

  function removeHostFromList(hostId: string) {
    const remaining = hosts.filter((host) => host.id !== hostId);
    setHosts(remaining);
    if (selectedHostId === hostId) {
      setSelectedHostId(remaining[0]?.id ?? "");
      options.onHostSelected();
    }
  }

  return {
    handleCreateHost,
    handleDeleteHost,
    handleHostHeartbeat,
    handleHostHeartbeatStatus,
    handleSelectHost,
    handleTogglePin,
    handleTrustHost,
    handleUpdateHost,
    hosts,
    hostSelectionVersion,
    refreshHosts,
    selectedHost,
    selectedHostId,
    setShowHostForm,
    showHostForm,
  };
}
