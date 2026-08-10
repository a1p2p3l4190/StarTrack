// screens/PassportScreen.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { Text, View, Pressable, Modal } from 'react-native';
import { styles } from '../styles';
import { PASSPORT_DATES, BADGE_CATEGORIES } from '../constants';
import BadgeFilter from '../components/Badge';
import { api } from '../api';

export default function PassportScreen({ verifiedDays, onPassportCellPress, cuisineBreakdown }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [badges, setBadges] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

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
        <View style={styles.chartCard}>
          {cuisineBreakdown.length === 0 ? (
            <Text style={{ color: '#6b6b70', fontSize: 13, textAlign: 'center', paddingVertical: 8 }}>
              Verify a check-in to start building your cuisine profile.
            </Text>
          ) : (
            cuisineBreakdown.map((item) => (
              <View key={item.label} style={styles.chartRow}>
                <Text style={styles.chartLabel}>{item.label}</Text>
                <View style={styles.chartBarBackground}>
                  <View style={[styles.chartBarFill, { width: `${item.value}%` }]} />
                </View>
                <Text style={styles.chartValue}>{item.value}%</Text>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Block 4: Leaderboard Standings */}
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Social Leaderboard</Text>
        <View style={styles.leaderboardCard}>
          {leaderboard.map((item, index) => (
            <View key={item.id} style={styles.leaderRow}>
              <Text style={styles.leaderRank}>{index + 1}</Text>
              <View style={styles.leaderInfo}>
                <Text style={styles.leaderName}>{item.name}</Text>
                <Text style={styles.leaderRegion}>{item.region}</Text>
              </View>
              <Text style={styles.leaderScore}>{item.score} pts</Text>
            </View>
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
    </View>
  );
}