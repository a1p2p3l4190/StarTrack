// components/Dropdown.jsx — a compact single-select control for filter
// options that are open-ended/data-driven (country, city, cuisine, year).
// Chip rows work fine for small fixed domains (Michelin stars, rating
// tiers) but grow unwieldy once the option count depends on how much data
// is loaded, so those use this instead.
import React, { useState } from 'react';
import { Pressable, Text, View, Modal, ScrollView } from 'react-native';
import { styles } from '../styles';

export default function Dropdown({ label, value, options, renderLabel, onChange, containerStyle }) {
  const [visible, setVisible] = useState(false);
  const display = renderLabel ? renderLabel(value) : String(value);

  return (
    <View style={containerStyle}>
      {/* The closed trigger only ever shows the current value — without this
          caption there's no way to tell which filter it belongs to until
          it's tapped open. */}
      <Text style={[styles.sectionHeading, { fontSize: 11, marginBottom: 6 }]} numberOfLines={1}>{label}</Text>
      <Pressable
        onPress={() => setVisible(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: '#111217', borderWidth: 1, borderColor: '#1d1e24', borderRadius: 10,
          paddingVertical: 10, paddingHorizontal: 10, marginBottom: 12,
        }}
      >
        <Text style={{ color: '#f8f0e9', fontSize: 12, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>{display}</Text>
        <Text style={{ color: '#d2a14c', fontSize: 12, marginLeft: 4 }}>▾</Text>
      </Pressable>

      <Modal visible={visible} animationType="fade" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalDrawer, { maxHeight: '70%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={[styles.sectionHeading, { color: '#f8f1e6', fontSize: 15, marginBottom: 0 }]}>{label}</Text>
              <Pressable onPress={() => setVisible(false)}><Text style={{ color: '#ff6b6b', fontWeight: '700' }}>Close</Text></Pressable>
            </View>
            <ScrollView>
              {options.map((opt) => {
                const active = opt === value;
                return (
                  <Pressable
                    key={String(opt)}
                    onPress={() => { onChange(opt); setVisible(false); }}
                    style={{
                      paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1d1e24',
                      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: active ? '#d2a14c' : '#f8f0e9', fontWeight: active ? '700' : '500', fontSize: 14 }}>
                      {renderLabel ? renderLabel(opt) : String(opt)}
                    </Text>
                    {active ? <Text style={{ color: '#d2a14c' }}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
