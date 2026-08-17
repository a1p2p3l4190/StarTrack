import React, { useState } from 'react';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import { styles } from '../styles';

const slides = [
  {
    icon: '🗺️',
    eyebrow: 'DISCOVER',
    title: 'Find your next remarkable meal',
    description: 'Explore Michelin restaurants, filter by cuisine and city, and build a wishlist of places worth visiting.',
  },
  {
    icon: '📡',
    eyebrow: 'CHECK IN',
    title: 'Turn every visit into a memory',
    description: 'Check in at participating restaurants with a StarTrack tag and keep your dining history in one place.',
  },
  {
    icon: '🏆',
    eyebrow: 'COLLECT',
    title: 'Build your gourmet passport',
    description: 'Unlock badges, share thoughtful reviews, and see your progress as your dining journey grows.',
  },
];

export default function OnboardingScreen({ onComplete }) {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const isLast = index === slides.length - 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#09090d' }}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 28, paddingBottom: 24 }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Pressable onPress={onComplete} hitSlop={12}>
            <Text style={{ color: '#8e8982', fontSize: 13, fontWeight: '700' }}>Skip</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 132, height: 132, borderRadius: 66, backgroundColor: '#1d1810', borderWidth: 1, borderColor: '#5a4220', justifyContent: 'center', alignItems: 'center', marginBottom: 34 }}>
            <Text style={{ fontSize: 58 }}>{slide.icon}</Text>
          </View>
          <Text style={{ color: '#d2a14c', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 12 }}>{slide.eyebrow}</Text>
          <Text style={{ color: '#f8f1e6', fontSize: 30, lineHeight: 36, fontWeight: '800', textAlign: 'center' }}>{slide.title}</Text>
          <Text style={{ color: '#aaa49a', fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 18, maxWidth: 330 }}>{slide.description}</Text>
        </View>

        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 24 }}>
            {slides.map((_, dotIndex) => (
              <View key={dotIndex} style={{ width: dotIndex === index ? 24 : 7, height: 7, borderRadius: 4, backgroundColor: dotIndex === index ? '#d2a14c' : '#3a3732', marginHorizontal: 4 }} />
            ))}
          </View>
          <Pressable
            style={styles.copyShareButton}
            onPress={() => (isLast ? onComplete() : setIndex((current) => current + 1))}
          >
            <Text style={styles.copyShareButtonText}>{isLast ? 'Get Started' : 'Continue'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
