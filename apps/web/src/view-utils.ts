import { type Host } from "./api";

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

export function sortHosts(hosts: Host[]) {
  return [...hosts].sort((left, right) => Number(right.pinned) - Number(left.pinned));
}
