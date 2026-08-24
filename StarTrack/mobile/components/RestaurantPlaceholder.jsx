import React from 'react';
import { Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

function initials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]) : [name.trim().slice(0, 2)]).join('').toUpperCase() || 'ST';
}

export default function RestaurantPlaceholder({ name, style }) {
  return (
    <LinearGradient colors={['#2b211b', '#171419', '#0f1015']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#6a4b28', overflow: 'hidden' }, style]}>
      <Text style={{ color: '#d2a14c', fontSize: 22, fontWeight: '800', letterSpacing: 2 }}>{initials(name)}</Text>
      <Text style={{ color: '#8e8982', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 5 }}>STARTRACK</Text>
    </LinearGradient>
  );
}
