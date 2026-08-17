import { scheduleLocalNotification, scheduleNotificationAt } from './notificationService';

/**
 * Schedule follow-up notifications for various events.
 * @param {string} kind - Notification kind (follow, badge, review, wishlist)
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {number} delayMs - Delay in milliseconds before showing notification
 * @param {object} data - Additional data to attach
 * @returns {Promise<string>} Notification ID
 */
export async function scheduleEventNotification(kind, title, body, delayMs = 0, data = {}) {
  try {
    const id = await scheduleLocalNotification(
      delayMs || 1000,
      title,
      body,
      kind,
      data
    );
    return id;
  } catch (err) {
    console.warn(`Failed to schedule ${kind} notification:`, err.message);
    return null;
  }
}

/**
 * Schedule a reminder for a restaurant's upcoming reservation release date
 * (Restaurant.next_reservation_release — always freshly computed server-side
 * from ReservationReleaseDay, so this is always scheduling against the true
 * next occurrence rather than a stale one-time date).
 * Fires 24 hours before the release date; no-ops if that's already passed.
 *
 * @param {string} restaurantName
 * @param {string} releaseDateIso - restaurant.next_reservation_release
 * @returns {Promise<string|null>} Notification ID, or null if not scheduled
 */
export async function scheduleReservationReleaseReminder(restaurantName, releaseDateIso) {
  if (!releaseDateIso) return null;
  const releaseDate = new Date(releaseDateIso);
  const reminderAt = new Date(releaseDate.getTime() - 24 * 60 * 60 * 1000);
  if (reminderAt <= new Date()) return null;

  try {
    return await scheduleNotificationAt(
      reminderAt,
      'Reservations open tomorrow',
      `${restaurantName} opens its next reservation window on ${releaseDate.toLocaleDateString()}. Set an alarm — popular dates go fast.`,
      'wishlist',
      { restaurantName, releaseDateIso }
    );
  } catch (err) {
    console.warn('Failed to schedule reservation release reminder:', err.message);
    return null;
  }
}
