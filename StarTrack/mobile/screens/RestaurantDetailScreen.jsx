// screens/RestaurantDetailScreen.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, Keyboard, ActivityIndicator } from 'react-native';
import { styles } from '../styles';
import { api } from '../api';

export default function RestaurantDetailScreen({ restaurant, onClose }) {
  const [comment, setComment] = useState('');
  const [foodPhoto, setFoodPhoto] = useState('');
  const [menuPhoto, setMenuPhoto] = useState('');
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadReviews = useCallback(async () => {
    setLoadingReviews(true);
    try {
      const [reviewsRes, eligibilityRes] = await Promise.all([
        api.reviews(restaurant.id),
        api.reviewEligibility(restaurant.id),
      ]);
      setReviews(reviewsRes.reviews || []);
      setEligible(!!eligibilityRes.eligible);
    } catch (err) {
      Alert.alert('Could not load reviews', err.message);
    } finally {
      setLoadingReviews(false);
    }
  }, [restaurant.id]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const submitReviewPayload = async () => {
    if (!comment.trim()) {
      Alert.alert('Review Error', 'Please write a brief comment regarding your dining experience.');
      return;
    }

    setSubmitting(true);
    try {
      await api.createReview(restaurant.id, {
        rating: 5,
        comment,
        food_photo_label: foodPhoto.trim(),
        menu_label: menuPhoto.trim(),
      });
      setComment('');
      setFoodPhoto('');
      setMenuPhoto('');
      Keyboard.dismiss();
      await loadReviews();
      Alert.alert('Thank You', 'Your premium gastronomy review has been distributed successfully!');
    } catch (err) {
      Alert.alert('Could Not Publish Review', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingHorizontal: 20, paddingTop: 40 }]}>
      {/* Detail View Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <View>
          <Text style={{ color: '#d2a14c', fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>{restaurant.cuisine.toUpperCase()}</Text>
          <Text style={styles.title}>{restaurant.name}</Text>
        </View>
        <Pressable onPress={onClose} style={[styles.badge, { backgroundColor: '#1e1f26' }]}>
          <Text style={{ color: '#ff6b6b', fontWeight: '700' }}>Close</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={[styles.restaurantMeta, { fontSize: 15, marginBottom: 20 }]}>
          📍 Location: {restaurant.city}, {restaurant.country} · Released: {restaurant.year} · Tier: {'★'.repeat(restaurant.stars)}
        </Text>

        {/* Existing Guest Review Feeds */}
        <Text style={styles.sectionHeading}>Gourmet Appraisals ({reviews.length})</Text>
        {loadingReviews ? (
          <ActivityIndicator color="#d2a14c" style={{ marginVertical: 12 }} />
        ) : (
          reviews.map((r) => (
            <View key={r.id} style={[styles.restaurantCard, { borderColor: '#252731', marginBottom: 12 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: '#d2a14c', fontWeight: '700' }}>{r.author}</Text>
                <Text style={{ color: '#6b6b70', fontSize: 11 }}>{new Date(r.created_at).toISOString().split('T')[0]}</Text>
              </View>
              <Text style={{ color: '#f8f0e9', fontSize: 13, lineHeight: 18, marginBottom: 8 }}>{r.comment}</Text>

              {/* Conditional media badge tags */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {r.food_photo_label ? <View style={[styles.badge, { backgroundColor: '#16171d' }]}><Text style={{ color: '#aea9a1', fontSize: 11 }}>📸 {r.food_photo_label}</Text></View> : null}
                {r.menu_label ? <View style={[styles.badge, { backgroundColor: '#16171d' }]}><Text style={{ color: '#aea9a1', fontSize: 11 }}>🥂 {r.menu_label}</Text></View> : null}
              </View>
            </View>
          ))
        )}

        {/* Review composer, gated by a verified checkin within the last 7 days */}
        <Text style={[styles.sectionHeading, { marginTop: 20 }]}>Write An Appraisal</Text>
        {eligible ? (
          <View style={styles.splitterCard}>
            <Text style={[styles.inputLabel, { color: '#d2a14c' }]}>Appraisal Commentary</Text>
            <TextInput
              style={[styles.input, { height: 70, paddingTop: 10, marginBottom: 12 }]}
              multiline
              placeholder="Describe tasting progression notes, service elegance..."
              placeholderTextColor="#555"
              value={comment}
              onChangeText={setComment}
            />

            <Text style={styles.inputLabel}>Food Asset Name (Photo Mock)</Text>
            <TextInput style={[styles.input, { marginBottom: 12 }]} placeholder="e.g. Seared Wagyu A5" placeholderTextColor="#555" value={foodPhoto} onChangeText={setFoodPhoto} />

            <Text style={styles.inputLabel}>Menu Title Reference (Menu Mock)</Text>
            <TextInput style={[styles.input, { marginBottom: 16 }]} placeholder="e.g. Summer Degustation Menu" placeholderTextColor="#555" value={menuPhoto} onChangeText={setMenuPhoto} />

            <Pressable style={styles.copyShareButton} onPress={submitReviewPayload} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#09090d" /> : <Text style={styles.copyShareButtonText}>Publish Premium Review</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={[styles.statusIndicatorBar, { backgroundColor: '#141311', borderColor: '#2a2215', padding: 16 }]}>
            <Text style={{ color: '#8e8982', fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
              🔒 Review submission access is locked. You must establish an NFC check-in log at this establishment within the last 7 days to contribute data.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
