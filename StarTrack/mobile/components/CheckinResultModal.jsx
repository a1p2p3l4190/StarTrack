// components/CheckinResultModal.jsx
// Replaces the plain system Alert.alert() that used to show check-in
// results — same dark/gold card treatment as the badge detail modal on the
// Passport screen, so a check-in outcome reads as part of the same app
// instead of a bare OS dialog.
import React from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { styles } from '../styles';
import BadgeUnlockReveal from './BadgeUnlockReveal';

const KIND_META = {
  success: { icon: '✨', color: '#d2a14c', title: 'Gastronomy Verified' },
  failure: { icon: '📍', color: '#e8b23d', title: 'Check-in Not Verified' },
  offline: { icon: '📡', color: '#e8b23d', title: "You're Offline" },
  error: { icon: '⚠️', color: '#ff6b6b', title: 'Check-in Failed' },
  location: { icon: '📍', color: '#e8b23d', title: 'Location Needed' },
  too_far: { icon: '🔒', color: '#e8b23d', title: 'Check-in Locked' },
};

export default function CheckinResultModal({ visible, kind = 'error', message, badges, restaurantName, scanning = false, onDismiss, onPrimary }) {
  const meta = KIND_META[kind] || KIND_META.error;

  return (
    <Modal visible={visible || scanning} transparent animationType="fade" onRequestClose={scanning ? undefined : onDismiss}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={[styles.splitterCard, { width: '100%', maxWidth: 340, alignItems: 'center', padding: 26, borderColor: meta.color }]}>
          {scanning ? (
            <>
              <ActivityIndicator color="#d2a14c" size="large" />
              <Text style={[styles.sectionHeading, { marginTop: 18, marginBottom: 8, color: '#f8f1e6', textAlign: 'center', fontSize: 17 }]}>Verifying your visit</Text>
              <Text style={{ color: '#aeaea1', textAlign: 'center', fontSize: 13, lineHeight: 19 }}>Hold your phone near the StarTrack tag at {restaurantName || 'the restaurant'}.</Text>
              <Text style={{ color: '#8e8982', textAlign: 'center', fontSize: 11, marginTop: 14 }}>This may take a few seconds. Please keep the app open.</Text>
            </>
          ) : (<>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>{meta.icon}</Text>
          <Text style={[styles.sectionHeading, { marginBottom: 8, color: '#f8f1e6', textAlign: 'center', fontSize: 17 }]}>
            {meta.title}
          </Text>
          <Text style={{ color: '#aeaea1', textAlign: 'center', fontSize: 13, lineHeight: 19 }}>
            {message}
          </Text>

          <BadgeUnlockReveal badges={badges} />

          {kind === 'success' && (
            <Text style={{ color: '#d2a14c', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 14 }}>
              Next step: write your review within 7 days.
            </Text>
          )}

          <Pressable
            style={[styles.copyShareButton, { width: '100%', marginTop: 20, paddingVertical: 12 }]}
            onPress={onPrimary || onDismiss}
          >
            <Text style={styles.copyShareButtonText}>{kind === 'success' ? 'View My Passport' : 'Try Again'}</Text>
          </Pressable>
          {kind !== 'success' && (
            <Pressable onPress={onDismiss} style={{ marginTop: 12, padding: 6 }}>
              <Text style={{ color: '#8e8982', fontSize: 12, fontWeight: '700' }}>Close</Text>
            </Pressable>
          )}
          </>)}
        </View>
      </View>
    </Modal>
  );
}
