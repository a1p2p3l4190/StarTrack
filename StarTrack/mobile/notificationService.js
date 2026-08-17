import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification handling behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Initialize push notification support on app startup.
 * Requests permissions, gets push token, and registers handlers.
 * Returns the push token or null if unavailable.
 */
export async function initializePushNotifications() {
  if (Platform.OS === 'web') {
    console.log('[Notifications] Skipping push notifications on web platform');
    return null;
  }

  try {
    // Request notification permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Notifications] Notification permission denied');
      return null;
    }

    // Get the push token
    const token = await Notifications.getExpoPushTokenAsync();
    console.log('[Notifications] Got push token:', token.data);
    return token.data;
  } catch (err) {
    console.error('[Notifications] Failed to initialize:', err.message);
    return null;
  }
}

/**
 * Register a handler for incoming notifications while app is active.
 * Callback receives the notification object.
 */
export function onNotificationReceived(callback) {
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[Notifications] Received notification:', notification.request.content.data);
    if (callback) callback(notification);
  });
  return subscription;
}

/**
 * Register a handler for when user taps a notification.
 * Callback receives the response object with the notification.
 */
export function onNotificationTapped(callback) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('[Notifications] Notification tapped:', response.notification.request.content.data);
    if (callback) callback(response);
  });
  return subscription;
}

/**
 * Schedule a local notification at a specific time or after a delay.
 * @param {number} delayMillis - Delay in milliseconds (e.g., 5 * 60 * 1000 for 5 minutes)
 * @param {string} title - Notification title
 * @param {string} body - Notification body/message
 * @param {string} kind - Notification kind (follow, review, badge, reservation, etc.)
 * @param {object} data - Additional data to attach to notification
 * @returns {string} Notification ID
 */
export async function scheduleLocalNotification(delayMillis, title, body, kind, data = {}) {
  if (Platform.OS === 'web') return null; // scheduleNotificationAsync has no web implementation
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        badge: 1,
        data: {
          kind,
          ...data,
        },
      },
      trigger: {
        seconds: Math.ceil(delayMillis / 1000),
      },
    });
    console.log('[Notifications] Scheduled notification:', notificationId, '- Kind:', kind);
    return notificationId;
  } catch (err) {
    console.error('[Notifications] Failed to schedule notification:', err.message);
    return null;
  }
}

/**
 * Schedule a notification for a specific date/time.
 * @param {Date} triggerDate - When to trigger the notification
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} kind - Notification kind
 * @param {object} data - Additional data
 * @returns {string} Notification ID
 */
export async function scheduleNotificationAt(triggerDate, title, body, kind, data = {}) {
  if (Platform.OS === 'web') return null; // scheduleNotificationAsync has no web implementation
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        badge: 1,
        data: {
          kind,
          ...data,
        },
      },
      trigger: {
        type: 'date',
        date: triggerDate,
      },
    });
    console.log('[Notifications] Scheduled notification at:', triggerDate.toISOString());
    return notificationId;
  } catch (err) {
    console.error('[Notifications] Failed to schedule notification:', err.message);
    return null;
  }
}

/**
 * Cancel a scheduled notification.
 * @param {string} notificationId - ID of notification to cancel
 */
export async function cancelNotification(notificationId) {
  try {
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      console.log('[Notifications] Cancelled notification:', notificationId);
    }
  } catch (err) {
    console.error('[Notifications] Failed to cancel notification:', err.message);
  }
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Notifications] Cancelled all scheduled notifications');
  } catch (err) {
    console.error('[Notifications] Failed to cancel all notifications:', err.message);
  }
}
