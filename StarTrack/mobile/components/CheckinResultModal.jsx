// components/CheckinResultModal.jsx
// Replaces the plain system Alert.alert() that used to show check-in
// results — same dark/gold card treatment as the badge detail modal on the
// Passport screen, so a check-in outcome reads as part of the same app
// instead of a bare OS dialog.
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { styles } from '../styles';
import BadgeUnlockReveal from './BadgeUnlockReveal';

const KIND_META = {
  success: { icon: '✨', color: '#d2a14c', title: 'Gastronomy Verified' },
  failure: { icon: '📍', color: '#e8b23d', title: 'Check-in Not Verified' },
  offline: { icon: '📡', color: '#e8b23d', title: "You're Offline" },
  error: { icon: '⚠️', color: '#ff6b6b', title: 'Check-in Failed' },
};

export default function CheckinResultModal({ visible, kind = 'error', message, badges, onDismiss }) {
  const meta = KIND_META[kind] || KIND_META.error;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={[styles.splitterCard, { width: '100%', maxWidth: 340, alignItems: 'center', padding: 26, borderColor: meta.color }]}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>{meta.icon}</Text>
          <Text style={[styles.sectionHeading, { marginBottom: 8, color: '#f8f1e6', textAlign: 'center', fontSize: 17 }]}>
            {meta.title}
          </Text>
          <Text style={{ color: '#aeaea1', textAlign: 'center', fontSize: 13, lineHeight: 19 }}>
            {message}
          </Text>

          <BadgeUnlockReveal badges={badges} />

          <Pressable
            style={[styles.copyShareButton, { width: '100%', marginTop: 20, paddingVertical: 12 }]}
            onPress={onDismiss}
          >
            <Text style={styles.copyShareButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
