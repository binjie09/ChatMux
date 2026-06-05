import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { type SessionStatus } from "./api";
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
  sendWebNotification(payload);
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

function sendWebNotification(payload: ReturnType<typeof sessionNotificationPayload>) {
  if (Notification.permission !== "granted") {
    throw new Error("Notification permission was denied");
  }
  new Notification(payload.title, {
    body: payload.body,
    tag: String(payload.id),
  });
}

function notificationId(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * notificationHashMultiplier + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash % notificationIdModulo) + notificationIdBase;
}
