// components/ErrorDisplay.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';

export function Toast({ message, type = 'error', onDismiss, autoHide = true }) {
  const [fadeAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (!autoHide) return;
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => onDismiss?.());
    }, 3000);
    return () => clearTimeout(timer);
  }, [autoHide, fadeAnim, onDismiss]);

  const bgColor = type === 'error' ? '#8B4545' : type === 'success' ? '#4B7A4B' : '#5A5A5A';
  const icon = type === 'error' ? '⚠️' : type === 'success' ? '✓' : 'ℹ️';

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        backgroundColor: bgColor,
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <Text style={{ color: '#fff', fontSize: 14, flex: 1, fontWeight: '500' }}>{message}</Text>
    </Animated.View>
  );
}

export function ErrorMessage({ message, onRetry, isDismissible = true }) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <View style={{ backgroundColor: '#8B4545', borderRadius: 10, padding: 14, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#D2A14C' }}>
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500', marginBottom: 8 }}>❌ Error</Text>
      <Text style={{ color: '#e8e8e8', fontSize: 12, marginBottom: onRetry ? 10 : 0, lineHeight: 18 }}>{message}</Text>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
        {onRetry && (
          <Pressable onPress={onRetry} style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#D2A14C', borderRadius: 6 }}>
            <Text style={{ color: '#000', fontWeight: '600', fontSize: 12 }}>Retry</Text>
          </Pressable>
        )}
        {isDismissible && (
          <Pressable onPress={() => setVisible(false)} style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6 }}>
            <Text style={{ color: '#e8e8e8', fontWeight: '600', fontSize: 12 }}>Dismiss</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function EmptyState({ icon = '📭', title = 'No data', description = '', actionLabel = 'Refresh', onAction }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
      <Text style={{ fontSize: 40 }}>{icon}</Text>
      <Text style={{ fontSize: 16, fontWeight: '600', color: '#d2a14c', marginBottom: 4 }}>{title}</Text>
      {description && <Text style={{ fontSize: 13, color: '#a0a0a0', textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>{description}</Text>}
      {onAction && (
        <Pressable onPress={onAction} style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#D2A14C', borderRadius: 6 }}>
          <Text style={{ color: '#000', fontWeight: '600', fontSize: 13 }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
