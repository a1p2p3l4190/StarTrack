// App.jsx
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Clipboard, Platform, ScrollView, Text, View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';

import { api, setAuthToken, loadStoredAuthToken, setUnauthorizedHandler, NetworkError } from './api';
import { styles } from './styles';
import { computeBillDetails, filterRestaurants, sortRestaurants, computeCuisineBreakdown, computeStarBreakdown, mapCheckinMessage, distanceBetweenKm, summarizeTodayHours } from './utils';
import { initializePushNotifications, onNotificationReceived, onNotificationTapped } from './notificationService';
import CheckinResultModal from './components/CheckinResultModal';

const CHECKIN_RADIUS_KM = 0.2;

import LoginScreen from './screens/LoginScreen';
import ExploreScreen from './screens/ExploreScreen';
import PassportScreen from './screens/PassportScreen';
import ToolsScreen from './screens/ToolsScreen';
import ProfileScreen from './screens/ProfileScreen';
import NotificationCenterScreen from './screens/NotificationCenterScreen';
import RestaurantDetailScreen from './screens/RestaurantDetailScreen';
import OnboardingScreen from './screens/OnboardingScreen';

const ONBOARDING_KEY = 'startrack_onboarding_completed';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  const [currentTab, setCurrentTab] = useState('explore');
  const [notificationReturnTab, setNotificationReturnTab] = useState('explore');
  const preserveScrollOnReturnRef = useRef(false);
  const contentScrollYRef = useRef(0);
  const savedScrollYRef = useRef(0);
  const [viewMode, setViewMode] = useState('list');
  const [searchQuery, setSearchQuery] = useState('');

  const [detailTarget, setDetailTarget] = useState(null);

  const [activeFilter, setActiveFilter] = useState({
    country: 'All', city: 'All', cuisine: 'All', year: 'All', stars: 'All', minRating: 'All'
  });
  const [sortBy, setSortBy] = useState('default');
  const [quickFilters, setQuickFilters] = useState({ nearby: false, openNow: false, notVisited: false });
  const [userLocation, setUserLocation] = useState(null);
  const [wishlistIds, setWishlistIds] = useState(new Set());

  const [restaurants, setRestaurants] = useState([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);

  const [verifiedDays, setVerifiedDays] = useState({});
  const [checkinHistory, setCheckinHistory] = useState({});
  const [scanning, setScanning] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [pushToken, setPushToken] = useState(null);
  const contentScrollRef = useRef(null);

  useEffect(() => {
    // Each top-level destination starts at its own beginning instead of
    // inheriting the previous tab's scroll position.
    if (preserveScrollOnReturnRef.current) {
      preserveScrollOnReturnRef.current = false;
      requestAnimationFrame(() => {
        contentScrollRef.current?.scrollTo({ y: savedScrollYRef.current, animated: false });
      });
      return;
    }
    requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  }, [currentTab, detailTarget]);

  const [total, setTotal] = useState('320.00');
  const [tax, setTax] = useState('8.5');
  const [tip, setTip] = useState('18');
  const [people, setPeople] = useState('4');

  const billDetails = useMemo(
    () => computeBillDetails(total, tax, tip, people),
    [total, tax, tip, people]
  );

  const filteredRestaurants = useMemo(
    () => sortRestaurants(filterRestaurants(restaurants, activeFilter, searchQuery, quickFilters, checkinHistory), sortBy),
    [restaurants, activeFilter, searchQuery, sortBy, quickFilters, checkinHistory]
  );

  const cuisineBreakdown = useMemo(
    () => computeCuisineBreakdown(checkinHistory, restaurants),
    [checkinHistory, restaurants]
  );

  const starBreakdown = useMemo(
    () => computeStarBreakdown(checkinHistory, restaurants),
    [checkinHistory, restaurants]
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications]
  );

  const openNotifications = () => {
    if (currentTab !== 'notifications') {
      setNotificationReturnTab(currentTab);
      savedScrollYRef.current = contentScrollYRef.current;
    }
    setCurrentTab('notifications');
  };

  useEffect(() => {
    if (!currentUser) return;
    loadRestaurants();
    refreshCheckinData();
    refreshNotifications();
    refreshWishlist();
  }, [currentUser]);

  useEffect(() => {
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') return;
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      } catch (err) {
        console.warn('Location unavailable', err.message);
      }
    })();
  }, []);

  useEffect(() => {
    if (!userLocation) return;
    setRestaurants((current) => current.map((restaurant) => ({
      ...restaurant,
      distance_km: distanceBetweenKm(userLocation.latitude, userLocation.longitude, restaurant.location_lat, restaurant.location_long),
    })));
    setSelectedRestaurant((current) => current ? {
      ...current,
      distance_km: distanceBetweenKm(userLocation.latitude, userLocation.longitude, current.location_lat, current.location_long),
    } : current);
  }, [userLocation]);

  // NetInfo's isInternetReachable is sometimes null (unknown) right after
  // launch or on web — only isConnected is a reliable boolean, so that's
  // what drives the offline banner.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return () => unsubscribe();
  }, []);

  // Restore a session from a previous launch (SecureStore, native only) and
  // register the 401 handler so an expired/invalid token bounces back to
  // the login screen instead of leaving the user stuck on a broken screen.
  useEffect(() => {
    (async () => {
      try {
        const completed = Platform.OS === 'web'
          ? window.localStorage.getItem(ONBOARDING_KEY)
          : await SecureStore.getItemAsync(ONBOARDING_KEY);
        setOnboardingComplete(completed === 'true');
      } catch (err) {
        console.warn('Failed to read onboarding state:', err.message);
      } finally {
        setOnboardingChecked(true);
      }
    })();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(handleLogout);

    (async () => {
      // Initialize push notifications
      try {
        const token = await initializePushNotifications();
        setPushToken(token);
      } catch (err) {
        console.warn('Failed to initialize push notifications:', err.message);
      }

      // Restore auth session
      const authToken = await loadStoredAuthToken();
      if (!authToken) {
        setAuthChecked(true);
        return;
      }
      try {
        const user = await api.me();
        setCurrentUser(user);
      } catch (err) {
        await setAuthToken(null);
      } finally {
        setAuthChecked(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle incoming notifications while app is active and when tapped.
  // Re-subscribes whenever currentUser changes (login/logout) — with an
  // empty dep array this effect only ever ran once at mount, permanently
  // capturing refreshNotifications' closure over currentUser === null (its
  // value before the user had logged in), so refreshNotifications' own
  // `if (!currentUser) return;` guard silently dropped every push received
  // during the session.
  useEffect(() => {
    const notifSubsc = onNotificationReceived(() => {
      // Refresh notifications when one is received
      refreshNotifications().catch(() => {});
    });

    const tapSubsc = onNotificationTapped(() => {
      // Switch to notifications tab when user taps a notification
      setCurrentTab('notifications');
      refreshNotifications().catch(() => {});
    });

    return () => {
      notifSubsc?.remove();
      tapSubsc?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  async function loadRestaurants() {
    setRestaurantsLoading(true);
    try {
      const data = await api.restaurants();
      const mapped = (data.restaurants || []).map((r) => ({ ...r, year: r.year_awarded }));
      const withDistance = mapped.map((restaurant) => ({
        ...restaurant,
        distance_km: userLocation ? distanceBetweenKm(userLocation.latitude, userLocation.longitude, restaurant.location_lat, restaurant.location_long) : null,
      }));
      setRestaurants(withDistance);
      setSelectedRestaurant((prev) => prev || withDistance[0] || null);
    } catch (err) {
      Alert.alert('Could not load restaurants', err.message);
    } finally {
      setRestaurantsLoading(false);
    }
  }

  async function refreshWishlist() {
    try {
      const data = await api.wishlist();
      setWishlistIds(new Set((data.wishlist || []).map((item) => String(item.restaurant_id))));
    } catch (err) {
      console.warn('Failed to refresh wishlist', err.message);
    }
  }

  async function toggleRestaurantSaved(restaurant) {
    try {
      const data = await api.wishlist();
      const existing = (data.wishlist || []).find((item) => String(item.restaurant_id) === String(restaurant.id));
      if (existing) await api.removeWishlist(existing.id);
      else await api.addWishlist({ restaurant_id: restaurant.id, restaurant_name: restaurant.name, photo_url: restaurant.photo_url || '', price_tier: restaurant.price_tier || 0, opening_hours: summarizeTodayHours(restaurant), note: 'Saved from Explore' });
      await refreshWishlist();
    } catch (err) {
      Alert.alert('Could not update saved restaurant', err.message);
    }
  }

  async function refreshCheckinData() {
    try {
      const passportRes = await api.passport();
      setVerifiedDays(passportRes.verified_days || {});
    } catch (err) {
      // Non-fatal — the passport view just stays empty.
      console.warn('Failed to refresh checkin data', err.message);
    }
    try {
      const historyRes = await api.checkinHistory();
      setCheckinHistory(historyRes.history || {});
    } catch (err) {
      console.warn('Failed to refresh checkin history', err.message);
    }
  }

  // Re-fetches the logged-in user's own record — needed after actions taken
  // elsewhere (e.g. following someone from the Star Map) that change counts
  // on *this* user (followers_count/following_count) but only ever update
  // local state for whatever they directly acted on, not currentUser.
  async function refreshCurrentUser() {
    try {
      const user = await api.me();
      setCurrentUser(user);
    } catch (err) {
      console.warn('Failed to refresh current user', err.message);
    }
  }

  async function refreshNotifications() {
    if (!currentUser) return;
    setNotificationsLoading(true);
    try {
      const data = await api.notifications();
      setNotifications(data.notifications || []);
    } catch (err) {
      console.warn('Failed to refresh notifications', err.message);
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function handleNotificationRead(notificationId) {
    if (!notificationId) return;
    try {
      await api.markNotificationRead(notificationId);
      setNotifications((prev) => prev.map((item) => item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item));
    } catch (err) {
      console.warn('Failed to mark notification read', err.message);
    }
  }

  async function handleMarkAllNotificationsRead() {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    } catch (err) {
      console.warn('Failed to mark notifications read', err.message);
    }
  }

  function handleAuthenticated(user) {
    setCurrentUser(user);
  }

  function handleLogout() {
    setAuthToken(null);
    setCurrentUser(null);
    setRestaurants([]);
    setVerifiedDays({});
    setCheckinHistory({});
    setNotifications([]);
    setWishlistIds(new Set());
    setQuickFilters({ nearby: false, openNow: false, notVisited: false });
    setDetailTarget(null);
  }

  async function performCheckIn(restaurant) {
    if (isOffline) {
      setCheckinResult({ kind: 'offline', message: "You're offline — reconnect to verify your check-in." });
      return;
    }

    setScanning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const scan = await api.simulateNfcScan(restaurant.id);
      const result = await api.verifyCheckin({
        tag_id: scan.tag_id,
        signature: scan.signature,
        location_lat: restaurant.location_lat,
        location_long: restaurant.location_long,
      });

      if (result.verified) {
        await refreshCheckinData();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setCheckinResult({
          kind: 'success',
          message: `${result.message} at "${result.restaurant}". ${result.badge}. Your 7-day appraisal window is unlocked.`,
          badges: result.new_badges || [],
        });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setCheckinResult({ kind: 'failure', message: mapCheckinMessage(result.message) });
      }
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      if (err instanceof NetworkError) {
        // We never got a response, so the server may well have completed the
        // checkin anyway (this is exactly what happened in the incident that
        // prompted this: the write succeeded but the reply never arrived).
        // Refresh so the Passport reflects reality instead of leaving the
        // user to assume it failed and immediately retry.
        await refreshCheckinData().catch(() => {});
        setCheckinResult({
          kind: 'error',
          message: "Connection hiccup talking to the server — this check-in may have already gone through. We've refreshed your Passport, so check there before scanning again.",
        });
      } else {
        // A thrown Error here means the backend responded and rejected the
        // request on purpose (bad signature, disabled device, cooldown) —
        // that's a real "not verified" outcome, not a network exception.
        setCheckinResult({ kind: 'failure', message: mapCheckinMessage(err.message) });
      }
    } finally {
      setScanning(false);
    }
  }

  const processVerificationIntent = () => {
    if (!selectedRestaurant) return;
    Haptics.selectionAsync().catch(() => {});
    const distance = selectedRestaurant.distance_km;
    if (!Number.isFinite(distance)) {
      setCheckinResult({ kind: 'location', message: 'Turn on location access so we can confirm that you are at the restaurant.' });
      return;
    }
    if (distance > CHECKIN_RADIUS_KM) {
      setCheckinResult({ kind: 'too_far', message: `You are about ${distance.toFixed(1)} km away. Check-in will unlock when you are within 200 m of the restaurant.` });
      return;
    }
    if (isOffline) {
      setCheckinResult({ kind: 'offline', message: "You're offline — reconnect to verify your check-in." });
      return;
    }
    const confirmMessage = `Prepare to scan physical dining tag at "${selectedRestaurant.name}"?`;

    // react-native-web's Alert.alert() is a no-op, so its buttons never fire
    // there — fall back to window.confirm on web instead.
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMessage)) {
        performCheckIn(selectedRestaurant);
      }
      return;
    }

    Alert.alert(
      'Confirm NFC Session',
      confirmMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Begin Polling', onPress: () => performCheckIn(selectedRestaurant) }
      ]
    );
  };

  const handlePassportCellPress = (day, isVerified) => {
    if (isVerified) {
      return `Stamp verified under order milestone step #${day}.`;
    } else {
      return `Stamp slot #${day} locked. Explore our curators guide list to acquire this card.`;
    }
  };

  const copyReceiptToClipboard = () => {
    const shareMessage = `🥂 StarTrack Invoice:\n• Total Bill: $${billDetails.grandTotal}\n• Split: $${billDetails.perPerson} each for ${people} guests.`;
    Clipboard.setString(shareMessage);
    Alert.alert('📋 Copied to Clipboard', 'Ready to paste into group chats!');
  };

  if (!onboardingChecked || !authChecked) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090d', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style="light" />
        <ActivityIndicator color="#d2a14c" />
      </View>
    );
  }

  if (!onboardingComplete) {
    const completeOnboarding = async () => {
      try {
        if (Platform.OS === 'web') {
          window.localStorage.setItem(ONBOARDING_KEY, 'true');
        } else {
          await SecureStore.setItemAsync(ONBOARDING_KEY, 'true');
        }
      } catch (err) {
        console.warn('Failed to save onboarding state:', err.message);
      }
      setOnboardingComplete(true);
    };
    return <OnboardingScreen onComplete={completeOnboarding} />;
  }

  if (!currentUser) {
    return (
      <>
        <StatusBar style="light" />
        <LoginScreen onAuthenticated={handleAuthenticated} />
      </>
    );
  }

  if (detailTarget) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090d' }}>
        <StatusBar style="light" />
        <RestaurantDetailScreen
          restaurant={detailTarget}
          currentUser={currentUser}
          onClose={() => setDetailTarget(null)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={[styles.hero, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={styles.title}>StarTrack</Text>
        <Pressable onPress={openNotifications} hitSlop={10} style={{ padding: 6 }}>
          <Text style={{ color: '#f8f1e6', fontSize: 23 }}>🔔</Text>
          {unreadCount > 0 && (
            <View style={{ position: 'absolute', right: 0, top: 0, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: '#d2a14c', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
              <Text style={{ color: '#09090d', fontSize: 9, fontWeight: '800' }}>{Math.min(unreadCount, 9)}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {isOffline && (
        <View style={{ backgroundColor: 'rgba(232,178,61,0.14)', borderColor: '#e8b23d', borderWidth: 1, borderRadius: 14, marginHorizontal: 20, marginBottom: 12, paddingVertical: 8, paddingHorizontal: 14 }}>
          <Text style={{ color: '#e8b23d', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
            📡 Offline mode — reconnect to sync
          </Text>
        </View>
      )}

      <ScrollView
        ref={contentScrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={(event) => { contentScrollYRef.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        {currentTab === 'explore' && (
          <ExploreScreen
            viewMode={viewMode} setViewMode={setViewMode}
            activeFilter={activeFilter} setActiveFilter={setActiveFilter}
            sortBy={sortBy} setSortBy={setSortBy}
            restaurants={restaurants}
            filteredRestaurants={filteredRestaurants}
            restaurantsLoading={restaurantsLoading && restaurants.length === 0}
            selectedRestaurant={selectedRestaurant} setSelectedRestaurant={setSelectedRestaurant}
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            onOpenDetail={(r) => setDetailTarget(r)}
            quickFilters={quickFilters} setQuickFilters={setQuickFilters}
            userLocation={userLocation} wishlistIds={wishlistIds}
            onToggleSaved={toggleRestaurantSaved}
          />
        )}

        {currentTab === 'passport' && (
          <PassportScreen verifiedDays={verifiedDays} onPassportCellPress={handlePassportCellPress} cuisineBreakdown={cuisineBreakdown} starBreakdown={starBreakdown} currentUser={currentUser} onFollowChanged={refreshCurrentUser} onExplore={() => setCurrentTab('explore')} />
        )}

        {currentTab === 'tools' && (
          <ToolsScreen
            total={total} setTotal={setTotal} tax={tax} setTax={setTax} tip={tip} setTip={setTip} people={people} setPeople={setPeople} billDetails={billDetails} onSharePress={copyReceiptToClipboard}
            restaurants={restaurants}
            onOpenPassport={() => setCurrentTab('passport')}
            onExplore={() => setCurrentTab('explore')}
            onOpenDetail={(restaurant) => setDetailTarget(restaurant)}
            checkinHistory={checkinHistory}
            currentUser={currentUser}
          />
        )}

        {currentTab === 'profile' && (
          <ProfileScreen
            currentUser={currentUser}
            onUserUpdated={setCurrentUser}
            onLogout={handleLogout}
          />
        )}

        {currentTab === 'notifications' && (
          <NotificationCenterScreen
            notifications={notifications}
            unreadCount={unreadCount}
            loading={notificationsLoading}
            onBack={() => {
              preserveScrollOnReturnRef.current = true;
              setCurrentTab(notificationReturnTab);
            }}
            onMarkRead={handleNotificationRead}
            onMarkAllRead={handleMarkAllNotificationsRead}
            onRefresh={refreshNotifications}
            onExplore={() => setCurrentTab('explore')}
          />
        )}
      </ScrollView>

      <CheckinResultModal
        visible={!!checkinResult}
        kind={checkinResult?.kind}
        message={checkinResult?.message}
        badges={checkinResult?.badges}
        restaurantName={selectedRestaurant?.name}
        scanning={scanning}
        onDismiss={() => setCheckinResult(null)}
        onPrimary={() => {
          setCheckinResult(null);
          if (checkinResult?.kind === 'success') setCurrentTab('passport');
          else processVerificationIntent();
        }}
      />

      {selectedRestaurant && (
        <Pressable
          style={[styles.floatingNfcButton, (!Number.isFinite(selectedRestaurant.distance_km) || selectedRestaurant.distance_km > CHECKIN_RADIUS_KM) && styles.floatingNfcButtonLocked]}
          onPress={processVerificationIntent}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator color="#09090d" style={{ marginRight: 6 }} />
          ) : (
            <Text style={styles.floatingNfcIcon}>📡</Text>
          )}
          <Text style={styles.floatingNfcText}>
            {scanning ? 'Checking in...' : !Number.isFinite(selectedRestaurant.distance_km) ? 'Location needed to check in' : selectedRestaurant.distance_km > CHECKIN_RADIUS_KM ? `Arrive within 200 m · ${selectedRestaurant.distance_km.toFixed(1)} km away` : `Check in at ${selectedRestaurant.name}`}
          </Text>
        </Pressable>
      )}

      <View style={styles.tabBar}>
        <Pressable style={styles.tabItem} onPress={() => setCurrentTab('explore')}><Text style={[styles.tabLabel, currentTab === 'explore' && styles.tabLabelActive]}>🗺️ Explore</Text></Pressable>
        <Pressable style={styles.tabItem} onPress={() => setCurrentTab('passport')}><Text style={[styles.tabLabel, currentTab === 'passport' && styles.tabLabelActive]}>🏆 Passport</Text></Pressable>
        <Pressable style={styles.tabItem} onPress={() => setCurrentTab('tools')}><Text style={[styles.tabLabel, currentTab === 'tools' && styles.tabLabelActive]}>🧮 Tools</Text></Pressable>
        <Pressable style={styles.tabItem} onPress={() => setCurrentTab('profile')}>
          <Text style={[styles.tabLabel, currentTab === 'profile' && styles.tabLabelActive]}>👤 Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}
