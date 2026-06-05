import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { type SessionStatus } from "./api";
import { isBrowserShell } from "./runtime-platform";
import { type DisplayTmuxSession } from "./session-state-machine";

export type SessionStatusChange = {
  hostName: string;
  previousStatus: SessionStatus;
  session: DisplayTmuxSession;
};

const notificationChannelId = "chatmux-session-status";
const notificationGroupId = "chatmux-session-updates";
const notificationHashMultiplier = 31;
const notificationIdBase = 1000;
const notificationIdModulo = 1_000_000_000;
const notificationImportanceDefault = 3;
const notificationVisibilityPrivate = 0;

export async function ensureSessionNotificationPermission() {
  if (Capacitor.isNativePlatform()) {
    await ensureNativeNotificationPermission();
    return;
  }
  await ensureWebNotificationPermission();
}

export async function sendSessionStatusNotification(change: SessionStatusChange) {
  const payload = sessionNotificationPayload(change);
  if (Capacitor.isNativePlatform()) {
    await sendNativeNotification(payload);
    return;
  }
  await sendWebNotification(payload);
}

function sessionNotificationPayload(change: SessionStatusChange) {
  const sessionName = change.session.title || change.session.name;
  return {
    body: `${change.hostName}: ${change.previousStatus} -> ${change.session.statusLabel}`,
    id: notificationId(`${change.hostName}:${change.session.id}:${change.session.displayStatus}`),
    title: `${sessionName} changed state`,
  };
}

async function ensureNativeNotificationPermission() {
  const current = await LocalNotifications.checkPermissions();
  const next = current.display === "granted" ? current : await LocalNotifications.requestPermissions();
  if (next.display !== "granted") {
    throw new Error("Notification permission was denied");
  }
  await createAndroidNotificationChannel();
}

async function createAndroidNotificationChannel() {
  if (Capacitor.getPlatform() !== "android") {
    return;
  }
  await LocalNotifications.createChannel({
    description: "ChatMux tmux session state changes",
    id: notificationChannelId,
    importance: notificationImportanceDefault,
    name: "Session updates",
    visibility: notificationVisibilityPrivate,
  });
}

async function ensureWebNotificationPermission() {
  if (!("Notification" in window)) {
    throw new Error("Notifications are not available in this browser");
  }
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was denied");
  }
}

async function sendNativeNotification(payload: ReturnType<typeof sessionNotificationPayload>) {
  await LocalNotifications.schedule({
    notifications: [{
      autoCancel: true,
      body: payload.body,
      channelId: notificationChannelId,
      group: notificationGroupId,
      id: payload.id,
      title: payload.title,
    }],
  });
}

async function sendWebNotification(payload: ReturnType<typeof sessionNotificationPayload>) {
  if (Notification.permission !== "granted") {
    throw new Error("Notification permission was denied");
  }
  const options: NotificationOptions = {
    body: payload.body,
    tag: String(payload.id),
  };
  const registration = await webNotificationServiceWorkerRegistration();
  if (registration) {
    await registration.showNotification(payload.title, options);
    return;
  }
  new Notification(payload.title, options);
}

async function webNotificationServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (isNotificationRegistration(registration)) {
    return registration;
  }
  if (import.meta.env.DEV || !isBrowserShell()) {
    return null;
  }
  return notificationRegistration(await navigator.serviceWorker.register("/service-worker.js"));
}

function notificationRegistration(registration: ServiceWorkerRegistration) {
  if (!isNotificationRegistration(registration)) {
    throw new Error("Service worker notifications are not available in this browser");
  }
  return registration;
}

function isNotificationRegistration(registration: ServiceWorkerRegistration | undefined) {
  return Boolean(registration && typeof registration.showNotification === "function");
}

function notificationId(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * notificationHashMultiplier + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash % notificationIdModulo) + notificationIdBase;
}
