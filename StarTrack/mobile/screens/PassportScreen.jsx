// screens/PassportScreen.jsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Text, View, Pressable, Modal, ActivityIndicator } from 'react-native';
import { styles } from '../styles';
import { PASSPORT_DATES, BADGE_CATEGORIES } from '../constants';
import BadgeFilter from '../components/Badge';
import RadarChart from '../components/RadarChart';
import PieChart from '../components/PieChart';
import { api } from '../api';

export default function PassportScreen({ verifiedDays, onPassportCellPress, cuisineBreakdown, starBreakdown, currentUser, onFollowChanged, onExplore }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [badges, setBadges] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

  const [wallTarget, setWallTarget] = useState(null);
  const [wallLoading, setWallLoading] = useState(false);
  const [wallLocked, setWallLocked] = useState(false);
  const [wallFollowing, setWallFollowing] = useState(false);
  const [wallData, setWallData] = useState(null);
  const [followBusy, setFollowBusy] = useState(false);
  // Tracks which leaderboard entry's badge-wall fetch is the most recent
  // one requested — without it, tapping entry A then quickly tapping B
  // before A's fetch resolves could let A's response land after B's own
  // fetch already applied, showing A's badges under B's name.
  const wallRequestRef = useRef(null);

  useEffect(() => {
    api.badges()
      .then((data) => setBadges((data.badges || []).map((b) => ({
        id: b.id,
        title: b.title,
        category: b.category,
        description: b.description,
        icon: b.icon,
        unlocked: b.unlocked,
        totalAchieved: b.total_achieved,
        userRank: b.user_rank,
      }))))
      .catch((err) => console.warn('Failed to load badges', err.message));

    api.leaderboard()
      .then((data) => setLeaderboard(data.leaderboard || []))
      .catch((err) => console.warn('Failed to load leaderboard', err.message));
  }, []);

  // Star Map — a leaderboard entry's badge wall. Locked behind following
  // them (server-enforced), so this doubles as the "Follow" entry point.
  const openBadgeWall = async (entry) => {
    setWallTarget(entry);
    setWallData(null);
    setWallLocked(false);
    setWallLoading(true);
    wallRequestRef.current = entry.id;
    try {
      const data = await api.badgeWall(entry.id);
      if (wallRequestRef.current !== entry.id) return;
      setWallData(data);
      setWallFollowing(true);
    } catch (err) {
      if (wallRequestRef.current !== entry.id) return;
      // Matched on the structured error code (backend sends 403/FORBIDDEN
      // for "you must follow this user first") rather than the message
      // text, which is free to change wording without silently breaking
      // this check the way an exact string match did before.
      if (err.code === 'FORBIDDEN' || err.statusCode === 403) {
        setWallLocked(true);
        setWallFollowing(false);
      } else {
        console.warn('Failed to load badge wall', err.message);
      }
    } finally {
      if (wallRequestRef.current === entry.id) setWallLoading(false);
    }
  };

  const closeBadgeWall = () => {
    wallRequestRef.current = null;
    setWallTarget(null);
    setWallData(null);
    setWallLocked(false);
  };

  const followWallTarget = async () => {
    if (!wallTarget) return;
    setFollowBusy(true);
    try {
      const result = await api.toggleFollow(wallTarget.id);
      setWallFollowing(result.following);
      // This changes the logged-in user's own following_count, not just
      // wallTarget's — nothing else refreshes currentUser after a follow
      // action, so without this ProfileScreen's counts go stale.
      onFollowChanged?.();
      if (result.following) {
        await openBadgeWall(wallTarget);
      } else {
        setWallLocked(true);
        setWallData(null);
      }
    } catch (err) {
      console.warn('Failed to update follow state', err.message);
    } finally {
      setFollowBusy(false);
    }
  };

  // Filter badges depending on selected top pill index
  const filteredBadges = useMemo(() => {
    return badges.filter(badge =>
      selectedCategory === 'All' ? true : badge.category === selectedCategory
    );
  }, [badges, selectedCategory]);

  // Handle expander limits (sets safe bounds to 6 records by default)
  const displayedBadges = useMemo(() => {
    if (showAllBadges) return filteredBadges;
    return filteredBadges.slice(0, 6);
  }, [filteredBadges, showAllBadges]);

  return (
    <View>
      {/* Block 1: 28-Day Passport Stamp Tracker */}
      <View style={styles.section}>
        <View style={styles.passportHeaderRow}>
          <Text style={styles.sectionHeading}>Gastronomy Grid</Text>
          <Text style={styles.passportProgress}>
            {Object.keys(verifiedDays).length}/28 Stamped
          </Text>
        </View>

        <View style={styles.passportGrid}>
          {PASSPORT_DATES.map((item) => {
            const isVerified = !!verifiedDays[item.day];
            const displayLabel = isVerified ? verifiedDays[item.day] : item.day;

            return (
              <Pressable
                key={item.day}
                style={[
                  styles.passportCell,
                  isVerified && styles.passportCellVerified,
                  isVerified && item.tier === 'gold' && styles.passportCellGold
                ]}
                onPress={() => onPassportCellPress(item.day, isVerified)}
              >
                <Text style={[styles.passportCellText, isVerified && styles.passportCellTextVerified]}>
                  {displayLabel}
                </Text>
                {isVerified && <Text style={styles.lockIcon}>👑</Text>}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* RESTORED Block 2: Interactive Gamified Achievement System */}
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Gourmet Achievements</Text>

        {/* Category Pill Filters inside Passport */}
        <View style={[styles.filters, { marginBottom: 16 }]}>
          {BADGE_CATEGORIES.map(cat => (
            <BadgeFilter
              key={cat}
              label={cat}
              active={selectedCategory === cat}
              onPress={() => setSelectedCategory(cat)}
            />
          ))}
        </View>

        {/* 3-Column Unlocking Achievement Matrix Grid */}
        <View style={styles.passportGrid}>
          {displayedBadges.map((badge) => (
            <Pressable
              key={badge.id}
              style={[
                styles.passportCell,
                { width: '30%', height: 85, padding: 6 },
                badge.unlocked ? styles.passportCellGold : [styles.passportMuted, { opacity: 0.35 }] // Mutes locked items into grayscale opacity
              ]}
              onPress={() => setSelectedBadge(badge)}
            >
              <Text style={{ fontSize: 22, marginBottom: 2 }}>{badge.icon}</Text>
              <Text style={[styles.passportCellText, { fontSize: 10, textAlign: 'center', color: badge.unlocked ? '#d2a14c' : '#5a5d6e' }]} numberOfLines={1}>
                {badge.title}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Expander Trigger Button control logic */}
        {filteredBadges.length > 6 && (
          <Pressable
            style={{ alignItems: 'center', paddingVertical: 12 }}
            onPress={() => setShowAllBadges(!showAllBadges)}
          >
            <Text style={{ color: '#d2a14c', fontWeight: '700', fontSize: 13 }}>
              {showAllBadges ? 'Show Less' : 'More...'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Block 3: Cuisine Analytics Chart — real breakdown of the cuisines
          behind this user's own verified check-ins, not a fixed mock. */}
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Cuisine Radar</Text>
        <View style={[styles.chartCard, { alignItems: 'center' }]}>
          {cuisineBreakdown.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ color: '#6b6b70', fontSize: 13, textAlign: 'center' }}>Verify a check-in to start building your cuisine profile.</Text>
              {onExplore && <Pressable onPress={onExplore} style={[styles.copyShareButton, { marginTop: 14, paddingHorizontal: 20 }]}><Text style={styles.copyShareButtonText}>Explore Restaurants</Text></Pressable>}
            </View>
          ) : (
            <RadarChart data={cuisineBreakdown} />
          )}
        </View>
      </View>

      {/* Block 3b: Star Statistics — tier coverage across this user's own
          verified check-ins (1-star vs 2-star vs 3-star venues). */}
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Star Statistics</Text>
        <View style={styles.chartCard}>
          <PieChart data={starBreakdown} />
        </View>
      </View>

      {/* Block 4: Leaderboard Standings */}
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Social Leaderboard</Text>
        <View style={styles.leaderboardCard}>
          {leaderboard.map((item, index) => (
            <Pressable key={item.id} style={styles.leaderRow} onPress={() => openBadgeWall(item)}>
              <Text style={styles.leaderRank}>{index + 1}</Text>
              <View style={styles.leaderInfo}>
                <Text style={styles.leaderName}>{item.name}</Text>
                <Text style={styles.leaderRegion}>{item.region}</Text>
              </View>
              <Text style={styles.leaderScore}>{item.score} pts</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Achievement Metric Detailed Overlay Overlay Modal Dialog Box */}
      <Modal
        visible={selectedBadge !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedBadge(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={[styles.splitterCard, { width: '100%', maxWidth: 320, alignItems: 'center', padding: 24, borderColor: '#d2a14c' }]}>
            <Text style={{ fontSize: 44, marginBottom: 10 }}>{selectedBadge?.icon}</Text>
            <Text style={[styles.sectionHeading, { marginBottom: 6, color: '#f8f1e6', textAlign: 'center' }]}>{selectedBadge?.title}</Text>
            <Text style={{ color: '#aeaea1', textAlign: 'center', marginBottom: 18, fontSize: 13, lineHeight: 18 }}>
              {selectedBadge?.description}
            </Text>

            <View style={{ width: '100%', borderTopWidth: 1, borderTopColor: '#252731', paddingTop: 14, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: '#6b6b70', fontSize: 13 }}>Global Earned:</Text>
                <Text style={{ color: '#e8dfd2', fontWeight: '600', fontSize: 13 }}>{selectedBadge?.totalAchieved} foodies</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#6b6b70', fontSize: 13 }}>Your Entry Sequence:</Text>
                <Text style={{ color: '#d2a14c', fontWeight: '700', fontSize: 13 }}>
                  {selectedBadge?.unlocked ? `#${selectedBadge?.userRank}` : 'Locked'}
                </Text>
              </View>
            </View>

            <Pressable
              style={[styles.copyShareButton, { width: '100%', paddingVertical: 10, backgroundColor: '#252731' }]}
              onPress={() => setSelectedBadge(null)}
            >
              <Text style={{ color: '#f8f1e6', fontWeight: '700', fontSize: 13 }}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Star Map — a leaderboard entry's badge wall, gated server-side
          behind following them. */}
      <Modal
        visible={wallTarget !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={closeBadgeWall}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={[styles.splitterCard, { width: '100%', maxWidth: 360, maxHeight: '80%', borderColor: '#d2a14c' }]}>
            <Text style={[styles.sectionHeading, { marginBottom: 4 }]}>{wallTarget?.name}'s Star Map</Text>
            <Text style={{ color: '#8e8982', fontSize: 12, marginBottom: 16 }}>{wallTarget?.region}</Text>

            {wallLoading ? (
              <ActivityIndicator color="#d2a14c" style={{ marginVertical: 24 }} />
            ) : wallLocked ? (
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <Text style={{ color: '#c2bab0', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 }}>
                  🔒 This badge wall is only visible to followers. Follow {wallTarget?.name} to see their achievements and dining footprint.
                </Text>
                <Pressable style={[styles.copyShareButton, { width: '100%' }]} onPress={followWallTarget} disabled={followBusy}>
                  {followBusy ? <ActivityIndicator color="#09090d" /> : <Text style={styles.copyShareButtonText}>+ Follow</Text>}
                </Pressable>
              </View>
            ) : wallData ? (
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ color: '#f8e8cf', fontSize: 16, fontWeight: '800' }}>{wallData.footprint?.verified_checkins ?? 0}</Text>
                    <Text style={{ color: '#8e8982', fontSize: 10 }}>Check-ins</Text>
                  </View>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ color: '#f8e8cf', fontSize: 16, fontWeight: '800' }}>{wallData.footprint?.distinct_restaurants ?? 0}</Text>
                    <Text style={{ color: '#8e8982', fontSize: 10 }}>Restaurants</Text>
                  </View>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ color: '#f8e8cf', fontSize: 16, fontWeight: '800' }}>{wallData.footprint?.distinct_cities ?? 0}</Text>
                    <Text style={{ color: '#8e8982', fontSize: 10 }}>Cities</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {(wallData.badges || []).filter((b) => b.unlocked).map((b) => (
                    <View key={b.id} style={[styles.passportCell, styles.passportCellGold, { width: '30%', height: 78, padding: 6 }]}>
                      <Text style={{ fontSize: 20, marginBottom: 2 }}>{b.icon}</Text>
                      <Text style={{ fontSize: 10, textAlign: 'center', color: '#d2a14c' }} numberOfLines={1}>{b.title}</Text>
                    </View>
                  ))}
                  {(wallData.badges || []).filter((b) => b.unlocked).length === 0 && (
                    <Text style={{ color: '#6b6b70', fontSize: 12 }}>No badges unlocked yet.</Text>
                  )}
                </View>

                {currentUser?.id !== wallTarget?.id && (
                  <Pressable style={[styles.copyShareButton, { marginBottom: 10, backgroundColor: '#252731' }]} onPress={followWallTarget} disabled={followBusy}>
                    {followBusy ? <ActivityIndicator color="#f8f1e6" /> : <Text style={{ color: '#f8f1e6', fontWeight: '700', fontSize: 13 }}>{wallFollowing ? 'Following · Unfollow' : '+ Follow'}</Text>}
                  </Pressable>
                )}
              </View>
            ) : null}

            <Pressable style={{ alignItems: 'center', paddingVertical: 10 }} onPress={closeBadgeWall}>
              <Text style={{ color: '#8e8982', fontSize: 12 }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
