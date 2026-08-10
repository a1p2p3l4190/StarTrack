// components/Shimmer.jsx
// A metallic-gold sweep over a dark placeholder block, used in place of a
// bare spinner while content loads. Built on expo-linear-gradient, which
// was already a dependency (unused until now) — no new package needed.
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export function ShimmerBlock({ width = '100%', height = 14, borderRadius = 6, style }) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1400, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-160, 160] });

  return (
    <View style={[{ width, height, borderRadius, backgroundColor: '#1a1b21', overflow: 'hidden' }, style]}>
      <AnimatedLinearGradient
        colors={['transparent', 'rgba(210,161,76,0.22)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}
      />
    </View>
  );
}

// Mimics the shape of styles.restaurantCard (name line + meta line) so the
// Explore list doesn't visibly jump when real cards swap in.
export function RestaurantCardSkeleton() {
  return (
    <View style={{ backgroundColor: '#121317', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#1d1e24', marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <ShimmerBlock width="55%" height={16} />
        <ShimmerBlock width={50} height={16} />
      </View>
      <ShimmerBlock width="75%" height={12} />
    </View>
  );
}

export default function RestaurantListSkeleton({ count = 5 }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <RestaurantCardSkeleton key={i} />
      ))}
    </View>
  );
}
