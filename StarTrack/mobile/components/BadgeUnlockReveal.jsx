// components/BadgeUnlockReveal.jsx
// Pure React Native Animated API — no reanimated/Lottie dependency, so it
// carries none of that stack's native-module risk and renders identically
// on web, iOS, and Android.
import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, Easing } from 'react-native';

function BadgeReveal({ badge, delay }) {
  const scale = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }),
      ]),
    ]).start();

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const glowTimer = setTimeout(() => glowLoop.start(), delay);
    return () => {
      clearTimeout(glowTimer);
      glowLoop.stop();
    };
  }, [delay, opacity, scale, glow]);

  return (
    <Animated.View style={{ alignItems: 'center', opacity, transform: [{ scale }], marginHorizontal: 10 }}>
      <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            position: 'absolute',
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: '#d2a14c',
            opacity: glow.interpolate({ inputRange: [0.4, 1], outputRange: [0.12, 0.35] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0.4, 1], outputRange: [0.85, 1.15] }) }],
          }}
        />
        <Text style={{ fontSize: 30 }}>{badge.icon}</Text>
      </View>
      <Text style={{ color: '#d2a14c', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 6, maxWidth: 76 }} numberOfLines={2}>
        {badge.title}
      </Text>
    </Animated.View>
  );
}

export default function BadgeUnlockReveal({ badges }) {
  if (!badges || badges.length === 0) return null;
  return (
    <View style={{ marginTop: 18, marginBottom: 4 }}>
      <Text style={{ color: '#8e8982', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 12 }}>
        New Badge{badges.length > 1 ? 's' : ''} Unlocked
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }}>
        {badges.map((badge, i) => (
          <BadgeReveal key={badge.id || badge.title} badge={badge} delay={i * 180} />
        ))}
      </View>
    </View>
  );
}
