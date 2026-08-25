import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { styles } from '../styles';

export default function CheckinConfirmModal({ visible, restaurantName, onCancel, onConfirm }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={[styles.splitterCard, { width: '100%', maxWidth: 340, alignItems: 'center', padding: 26, borderColor: '#d2a14c' }]}>
          <Text style={{ color: '#d2a14c', fontSize: 36, marginBottom: 12 }}>⌁</Text>
          <Text style={[styles.sectionHeading, { marginBottom: 8, color: '#f8f1e6', textAlign: 'center', fontSize: 17 }]}>Confirm your visit</Text>
          <Text style={{ color: '#aeaea1', textAlign: 'center', fontSize: 13, lineHeight: 20 }}>
            You are about to check in at
          </Text>
          <Text style={{ color: '#f8f1e6', textAlign: 'center', fontSize: 16, fontWeight: '800', marginTop: 5 }}>
            {restaurantName || 'this restaurant'}
          </Text>
          <Text style={{ color: '#77736d', textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 12 }}>
            Hold your phone near the StarTrack tag when scanning begins.
          </Text>
          <View style={{ flexDirection: 'row', width: '100%', gap: 10, marginTop: 22 }}>
            <Pressable onPress={onCancel} style={{ flex: 1, borderWidth: 1, borderColor: '#383a42', borderRadius: 13, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#aaa39a', fontSize: 13, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={[styles.copyShareButton, { flex: 1, marginTop: 0, paddingVertical: 12 }]}>
              <Text style={styles.copyShareButtonText}>Begin Scan</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
