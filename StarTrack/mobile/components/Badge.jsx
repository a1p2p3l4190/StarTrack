// components/Badge.jsx
import React from 'react';
import { Pressable, Text } from 'react-native';
import { styles } from '../styles';

export default function Badge({ label, active, onPress }) {
  return (
    <Pressable style={[styles.badge, active && styles.badgeActive]} onPress={onPress}>
      <Text style={[styles.badgeLabel, active && styles.badgeLabelActive]}>{label}</Text>
    </Pressable>
  );
}