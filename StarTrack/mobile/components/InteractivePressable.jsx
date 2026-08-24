import React, { useRef } from 'react';
import { Animated, Pressable } from 'react-native';

export default function InteractivePressable({ children, style, disabled = false, onPress, onPressIn, onPressOut, ...props }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue) => Animated.spring(scale, { toValue, friction: 7, tension: 180, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.55 : 1 }}>
      <Pressable
        {...props}
        disabled={disabled}
        onPress={onPress}
        onPressIn={(event) => { animate(0.96); onPressIn?.(event); }}
        onPressOut={(event) => { animate(1); onPressOut?.(event); }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
