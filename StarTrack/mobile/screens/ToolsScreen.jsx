// screens/ToolsScreen.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View, Pressable, Animated, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, Alert, Image } from 'react-native';
import { styles } from '../styles';
import { api } from '../api';
import { scheduleReservationReleaseReminder } from '../reminderScheduler';
import { cancelNotification } from '../notificationService';
import StarMap from '../components/StarMap';
import RestaurantPlaceholder from '../components/RestaurantPlaceholder';

export default function ToolsScreen({
  total, setTotal, tax, setTax, tip, setTip, people, setPeople, billDetails, onSharePress, restaurants = [], onOpenPassport, onExplore, onOpenDetail, checkinHistory = {}, currentUser
}) {
  const [wishlist, setWishlist] = useState([]);
  const [activeSection, setActiveSection] = useState('bill');
  const [reminders, setReminders] = useState({});
  const [reminderPending, setReminderPending] = useState({});
  const [webReminderFeedback, setWebReminderFeedback] = useState({});
  const [billCopied, setBillCopied] = useState(false);
  const billButtonScale = useRef(new Animated.Value(1)).current;

  const animateBillButton = (toValue) => {
    Animated.spring(billButtonScale, {
      toValue,
      friction: 7,
      tension: 180,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    api.wishlist()
      .then((data) => setWishlist(data.wishlist || []))
      .catch((err) => console.warn('Failed to load wishlist', err.message));
  }, []);

  const restaurantById = (id) => restaurants.find((r) => r.id === id);
  const adjustPeople = (amount) => {
    const current = Math.max(1, parseInt(people, 10) || 1);
    setPeople(String(Math.max(1, current + amount)));
  };

  // The release date is never stored on the wishlist item — it's read live
  // off `restaurants` (fetched fresh each app open) so it's always the true
  // next occurrence, even after this month's date has already rolled over.
  const remindWishlistItem = async (item) => {
    if (reminderPending[item.id] || reminders[item.id]) return;
    const restaurant = restaurantById(item.restaurant_id);
    if (!restaurant?.next_reservation_release) return;
    setReminderPending((prev) => ({ ...prev, [item.id]: true }));
    try {
      const id = await scheduleReservationReleaseReminder(restaurant.name, restaurant.next_reservation_release);
      if (id) {
        setReminders((prev) => ({ ...prev, [item.id]: id }));
        Alert.alert('Reminder set', `We'll notify you the day before reservations open at ${restaurant.name}.`);
      } else {
        if (Platform.OS === 'web') {
          setReminders((prev) => ({ ...prev, [item.id]: 'web-preview' }));
          setWebReminderFeedback((prev) => ({ ...prev, [item.id]: true }));
        } else {
          Alert.alert('Could not set reminder', 'That release date is less than 24 hours away, or reminders aren’t supported on this platform.');
        }
      }
    } finally {
      setReminderPending((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const cancelWishlistReminder = async (item) => {
    const notificationId = reminders[item.id];
    if (!notificationId) return;
    if (notificationId !== 'web-preview') {
      await cancelNotification(notificationId);
    }
    setReminders((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    setWebReminderFeedback((prev) => ({ ...prev, [item.id]: false }));
  };

  const handleCopyBill = () => {
    onSharePress();
    setBillCopied(true);
    setTimeout(() => setBillCopied(false), 2000);
  };

  const removeWishlistItem = async (id) => {
    try {
      await api.removeWishlist(id);
      setWishlist((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      Alert.alert('Could not remove item', err.message);
    }
  };

  return (
    // FIX 1: Keyboard Avoiding View with a continuous tap dismiss interceptor keeps inputs visible during input cycles
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View>
            <View style={{ flexDirection: 'row', backgroundColor: '#101115', borderRadius: 16, borderWidth: 1, borderColor: '#292c34', padding: 4, marginBottom: 18 }}>
              {[['bill', 'Bill Splitter'], ['saved', 'Saved'], ['reminders', 'Reminders'], ['map', 'Star Map']].map(([key, label]) => (
                <Pressable key={key} onPress={() => setActiveSection(key)} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: activeSection === key ? '#1e1f26' : 'transparent', alignItems: 'center' }}>
                  <Text style={{ color: activeSection === key ? '#f6f0e7' : '#8d8c91', fontSize: 11, fontWeight: '700' }}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {activeSection === 'bill' && <View style={styles.section}>
              <Text style={styles.sectionHeading}>Bill Splitter</Text>
              <Text style={{ color: '#8e8982', fontSize: 12, lineHeight: 18, marginBottom: 14 }}>Split the bill, calculate gratuity, and share each person’s total.</Text>
              <View style={styles.splitterCard}>

                  <View style={styles.inputGrid}>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Subtotal ($)</Text>
                    <TextInput
                      style={styles.input}
                      value={total}
                      onChangeText={setTotal}
                      keyboardType="numeric"
                      placeholderTextColor="#555"
                      returnKeyType="done"
                    />
                  </View>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>People</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
                      <Pressable onPress={() => adjustPeople(-1)} style={[styles.badge, { marginRight: 0, paddingHorizontal: 9, paddingVertical: 12 }]}><Text style={{ color: '#d2a14c', fontSize: 16, fontWeight: '800' }}>−</Text></Pressable>
                      <TextInput style={[styles.input, { flex: 1, minWidth: 0, textAlign: 'center', paddingHorizontal: 2 }]} value={people} onChangeText={setPeople} keyboardType="number-pad" placeholderTextColor="#555" returnKeyType="done" />
                      <Pressable onPress={() => adjustPeople(1)} style={[styles.badge, { marginRight: 0, paddingHorizontal: 9, paddingVertical: 12 }]}><Text style={{ color: '#d2a14c', fontSize: 16, fontWeight: '800' }}>+</Text></Pressable>
                    </View>
                  </View>
                </View>

                <View style={styles.inputGrid}>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Tax (%)</Text>
                    <TextInput
                      style={styles.input}
                      value={tax}
                      onChangeText={setTax}
                      keyboardType="numeric"
                      placeholderTextColor="#555"
                      returnKeyType="done"
                    />
                  </View>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Tip (%)</Text>
                    <TextInput
                      style={styles.input}
                      value={tip}
                      onChangeText={setTip}
                      keyboardType="numeric"
                      placeholderTextColor="#555"
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <Text style={[styles.inputLabel, { marginTop: 2 }]}>Quick Tip</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {[15, 18, 20].map((value) => (
                    <Pressable key={value} onPress={() => setTip(String(value))} style={[styles.badge, String(tip) === String(value) && styles.badgeActive]}>
                      <Text style={[styles.badgeLabel, String(tip) === String(value) && styles.badgeLabelActive]}>{value}%</Text>
                    </Pressable>
                  ))}
                  <TextInput style={[styles.input, { width: 82, height: 36, paddingHorizontal: 8 }]} value={tip} onChangeText={setTip} keyboardType="numeric" placeholder="Custom" placeholderTextColor="#555" />
                </View>

                <View style={styles.receiptVisualCard}>
                  <Text style={styles.receiptHeader}>BILL SUMMARY</Text>
                  <View style={styles.receiptRow}><Text style={styles.receiptLabel}>Subtotal</Text><Text style={styles.receiptValue}>${billDetails.subtotal}</Text></View>
                  <View style={styles.receiptRow}><Text style={styles.receiptLabel}>Tax & Gratuity</Text><Text style={styles.receiptValue}>+${(parseFloat(billDetails.taxTotal) + parseFloat(billDetails.tipTotal)).toFixed(2)}</Text></View>
                  <View style={styles.receiptDivider} />
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptTotalLabel}>Grand Total</Text>
                    <Text style={styles.receiptTotalValue}>${billDetails.grandTotal}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.shareAmountLabel}>Each Pays</Text>
                    <Text style={styles.shareAmountValue}>${billDetails.perPerson}</Text>
                  </View>

                  <Animated.View style={{ transform: [{ scale: billButtonScale }] }}>
                    <Pressable
                      style={styles.copyShareButton}
                      onPressIn={() => animateBillButton(0.96)}
                      onPressOut={() => animateBillButton(1)}
                      onPress={handleCopyBill}
                    >
                      <Text style={styles.copyShareButtonText}>{billCopied ? '✓ Copied' : '📋 Copy Bill Summary'}</Text>
                    </Pressable>
                  </Animated.View>
                </View>
              </View>
            </View>}

            {activeSection === 'saved' && <View style={[styles.rowSection, { flexDirection: 'column' }]}>
              <View style={styles.splitCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>Saved Restaurants</Text>
                          <Text style={{ color: '#d2a14c', fontSize: 12, fontWeight: '800' }}>{wishlist.length}</Text>
                        </View>
                {wishlist.length === 0 ? (
                  <View>
                    <Text style={styles.starMapText}>No saved restaurants yet. Save a place from Explore to build your personal shortlist.</Text>
                    {onExplore && <Pressable onPress={onExplore} style={[styles.copyShareButton, { marginTop: 14 }]}><Text style={styles.copyShareButtonText}>Find a Restaurant</Text></Pressable>}
                  </View>
                ) : (
                  wishlist.map((item) => {
                    const linkedRestaurant = item.restaurant_id ? restaurantById(item.restaurant_id) : null;
                    const nextRelease = linkedRestaurant?.next_reservation_release;
                    return (
                      <View key={item.id} style={styles.wishItem}>
                        <Pressable onPress={() => linkedRestaurant && onOpenDetail?.(linkedRestaurant)}>
                        <View style={styles.wishCardRow}>
                          {item.photo_url ? (
                            <Image source={{ uri: item.photo_url }} style={styles.wishImage} resizeMode="cover" />
                          ) : (
                            <RestaurantPlaceholder name={item.restaurant_name} style={styles.wishImagePlaceholder} />
                          )}
                          <View style={styles.wishContent}>
                            <Text style={styles.wishName}>{item.restaurant_name}</Text>
                            <Text style={styles.wishSub}>
                              📍 {linkedRestaurant?.city || 'Location unavailable'}
                            </Text>
                            <Text style={styles.wishSub}>
                              🍽️ {linkedRestaurant?.cuisine || 'Category unavailable'}
                            </Text>
                            {nextRelease && (
                              <View style={{ marginTop: 6 }}>
                                <Text style={styles.wishMeta}>📅 Next opens {new Date(nextRelease).toLocaleDateString()}</Text>
                                <Pressable onPress={() => remindWishlistItem(item)} disabled={!!reminderPending[item.id] || !!reminders[item.id]} style={{ marginTop: 4, opacity: reminders[item.id] ? 0.7 : 1 }}>
                                  <Text style={{ color: reminders[item.id] ? '#7ce8b4' : '#d2a14c', fontSize: 12, fontWeight: '700' }}>{reminders[item.id] ? (webReminderFeedback[item.id] ? '✓ Reminder Preview' : '✓ Reminder Set') : reminderPending[item.id] ? 'Setting…' : '🔔 Remind Me'}</Text>
                                </Pressable>
                              </View>
                            )}
                          </View>
                        </View>
                        </Pressable>
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 8 }}>
                          {linkedRestaurant && <Pressable onPress={() => onOpenDetail?.(linkedRestaurant)}><Text style={{ color: '#d2a14c', fontSize: 12, fontWeight: '700' }}>View</Text></Pressable>}
                          <Pressable onPress={() => removeWishlistItem(item.id)}><Text style={{ color: '#ff6b6b', fontSize: 12, fontWeight: '700' }}>Remove</Text></Pressable>
                        </View>
                      </View>
                    );
                  })
                )}
                {wishlist.length > 0 && onExplore && (
                  <Pressable onPress={onExplore} style={[styles.copyShareButton, { marginTop: 14, paddingVertical: 8 }]}>
                    <Text style={styles.copyShareButtonText}>+ Save More Restaurants</Text>
                  </Pressable>
                )}
              </View>
            </View>}

            {activeSection === 'reminders' && (
              <View style={styles.section}>
                <Text style={styles.sectionHeading}>Reservation Reminders</Text>
                <Text style={{ color: '#8e8982', fontSize: 12, lineHeight: 18, marginBottom: 14 }}>Keep track of when your saved restaurants open their next reservation window.</Text>
                {wishlist.filter((item) => reminders[item.id] && restaurantById(item.restaurant_id)?.next_reservation_release).length === 0 ? (
                  <View style={styles.splitterCard}>
                    <Text style={styles.starMapText}>No active reminders yet.</Text>
                    {onExplore && <Pressable onPress={onExplore} style={[styles.copyShareButton, { marginTop: 14 }]}><Text style={styles.copyShareButtonText}>Explore Restaurants</Text></Pressable>}
                  </View>
                ) : wishlist.filter((item) => reminders[item.id] && restaurantById(item.restaurant_id)?.next_reservation_release).map((item) => {
                  const restaurant = restaurantById(item.restaurant_id);
                  return <View key={item.id} style={[styles.splitterCard, { marginBottom: 10, padding: 16 }]}>
                    <Text style={styles.wishName}>{restaurant.name}</Text>
                    <Text style={styles.wishSub}>Reservations open {new Date(restaurant.next_reservation_release).toLocaleDateString()}</Text>
                    <Pressable onPress={() => cancelWishlistReminder(item)} disabled={!reminders[item.id] || !!reminderPending[item.id]} style={[styles.copyShareButton, { marginTop: 12, opacity: reminders[item.id] ? 1 : 0.65 }]}><Text style={styles.copyShareButtonText}>Cancel Reminder</Text></Pressable>
                  </View>;
                })}
              </View>
            )}

            {activeSection === 'map' && (
              <StarMap restaurants={restaurants} checkinHistory={checkinHistory} currentUser={currentUser} onOpenDetail={onOpenDetail} />
            )}
          </View>
        </TouchableWithoutFeedback>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
