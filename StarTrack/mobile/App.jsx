// App.jsx
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Clipboard, ScrollView, Text, View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import NetInfo from '@react-native-community/netinfo';

import { api, setAuthToken, loadStoredAuthToken, setUnauthorizedHandler } from './api';
import { styles } from './styles';
import { computeBillDetails, filterRestaurants, computeCuisineBreakdown, mapCheckinMessage } from './utils';
import CheckinResultModal from './components/CheckinResultModal';

import LoginScreen from './screens/LoginScreen';
import ExploreScreen from './screens/ExploreScreen';
import PassportScreen from './screens/PassportScreen';
import ToolsScreen from './screens/ToolsScreen';
import RestaurantDetailScreen from './screens/RestaurantDetailScreen';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [currentTab, setCurrentTab] = useState('explore');
  const [viewMode, setViewMode] = useState('list');
  const [searchQuery, setSearchQuery] = useState('');

  const [detailTarget, setDetailTarget] = useState(null);

  const [activeFilter, setActiveFilter] = useState({
    country: 'All', city: 'All', cuisine: 'All', year: 'All', stars: 'All'
  });

  const [restaurants, setRestaurants] = useState([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);

  const [verifiedDays, setVerifiedDays] = useState({});
  const [checkinHistory, setCheckinHistory] = useState({});
  const [scanning, setScanning] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);
  const [isOffline, setIsOffline] = useState(false);

  const [total, setTotal] = useState('320.00');
  const [tax, setTax] = useState('8.5');
  const [tip, setTip] = useState('18');
  const [people, setPeople] = useState('4');

  const billDetails = useMemo(
    () => computeBillDetails(total, tax, tip, people),
    [total, tax, tip, people]
  );

  const filteredRestaurants = useMemo(
    () => filterRestaurants(restaurants, activeFilter, searchQuery),
    [restaurants, activeFilter, searchQuery]
  );

  const cuisineBreakdown = useMemo(
    () => computeCuisineBreakdown(checkinHistory, restaurants),
    [checkinHistory, restaurants]
  );

  useEffect(() => {
    if (!currentUser) return;
    loadRestaurants();
    refreshCheckinData();
  }, [currentUser]);

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
    setUnauthorizedHandler(handleLogout);

    (async () => {
      const token = await loadStoredAuthToken();
      if (!token) {
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

  async function loadRestaurants() {
    setRestaurantsLoading(true);
    try {
      const data = await api.restaurants();
      const mapped = (data.restaurants || []).map((r) => ({ ...r, year: r.year_awarded }));
      setRestaurants(mapped);
      setSelectedRestaurant((prev) => prev || mapped[0] || null);
    } catch (err) {
      Alert.alert('Could not load restaurants', err.message);
    } finally {
      setRestaurantsLoading(false);
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

  function handleAuthenticated(user) {
    setCurrentUser(user);
  }

  function handleLogout() {
    setAuthToken(null);
    setCurrentUser(null);
    setRestaurants([]);
    setVerifiedDays({});
    setCheckinHistory({});
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
      setCheckinResult({ kind: 'error', message: mapCheckinMessage(err.message) });
    } finally {
      setScanning(false);
    }
  }

  const processVerificationIntent = () => {
    if (!selectedRestaurant) return;
    Haptics.selectionAsync().catch(() => {});
    if (isOffline) {
      setCheckinResult({ kind: 'offline', message: "You're offline — reconnect to verify your check-in." });
      return;
    }
    Alert.alert(
      'Confirm NFC Session',
      `Prepare to scan physical dining tag at "${selectedRestaurant.name}"?`,
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

  if (!authChecked) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090d', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style="light" />
        <ActivityIndicator color="#d2a14c" />
      </View>
    );
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
          onClose={() => setDetailTarget(null)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={[styles.hero, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }]}>
        <Text style={styles.title}>StarTrack</Text>
        <Pressable onPress={handleLogout}>
          <Text style={{ color: '#8e8982', fontSize: 12 }}>{currentUser.display_name} · Log out</Text>
        </Pressable>
      </View>

      {isOffline && (
        <View style={{ backgroundColor: 'rgba(232,178,61,0.14)', borderColor: '#e8b23d', borderWidth: 1, borderRadius: 14, marginHorizontal: 20, marginBottom: 12, paddingVertical: 8, paddingHorizontal: 14 }}>
          <Text style={{ color: '#e8b23d', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
            📡 Offline mode — reconnect to sync
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {currentTab === 'explore' && (
          <ExploreScreen
            viewMode={viewMode} setViewMode={setViewMode}
            activeFilter={activeFilter} setActiveFilter={setActiveFilter}
            filteredRestaurants={filteredRestaurants}
            restaurantsLoading={restaurantsLoading && restaurants.length === 0}
            selectedRestaurant={selectedRestaurant} setSelectedRestaurant={setSelectedRestaurant}
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            onOpenDetail={(r) => setDetailTarget(r)}
          />
        )}

        {currentTab === 'passport' && (
          <PassportScreen verifiedDays={verifiedDays} onPassportCellPress={handlePassportCellPress} cuisineBreakdown={cuisineBreakdown} />
        )}

        {currentTab === 'tools' && (
          <ToolsScreen total={total} setTotal={setTotal} tax={tax} setTax={setTax} tip={tip} setTip={setTip} people={people} setPeople={setPeople} billDetails={billDetails} onSharePress={copyReceiptToClipboard} />
        )}
      </ScrollView>

      <CheckinResultModal
        visible={!!checkinResult}
        kind={checkinResult?.kind}
        message={checkinResult?.message}
        badges={checkinResult?.badges}
        onDismiss={() => setCheckinResult(null)}
      />

      {selectedRestaurant && (
        <Pressable style={styles.floatingNfcButton} onPress={processVerificationIntent} disabled={scanning}>
          {scanning ? (
            <ActivityIndicator color="#09090d" style={{ marginRight: 6 }} />
          ) : (
            <Text style={styles.floatingNfcIcon}>📡</Text>
          )}
          <Text style={styles.floatingNfcText}>{selectedRestaurant.name.substring(0, 5)}...</Text>
        </Pressable>
      )}

      <View style={styles.tabBar}>
        <Pressable style={styles.tabItem} onPress={() => setCurrentTab('explore')}><Text style={[styles.tabLabel, currentTab === 'explore' && styles.tabLabelActive]}>🗺️ Explore</Text></Pressable>
        <Pressable style={styles.tabItem} onPress={() => setCurrentTab('passport')}><Text style={[styles.tabLabel, currentTab === 'passport' && styles.tabLabelActive]}>🏆 Passport</Text></Pressable>
        <Pressable style={styles.tabItem} onPress={() => setCurrentTab('tools')}><Text style={[styles.tabLabel, currentTab === 'tools' && styles.tabLabelActive]}>🧮 Utilities</Text></Pressable>
      </View>
    </View>
  );
}
