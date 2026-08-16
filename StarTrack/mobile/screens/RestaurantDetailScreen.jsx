// screens/RestaurantDetailScreen.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, Keyboard, ActivityIndicator, Platform } from 'react-native';
import { styles } from '../styles';
import { api } from '../api';

const formatDate = (iso) => new Date(iso).toISOString().split('T')[0];

export default function RestaurantDetailScreen({ restaurant, currentUser, onClose }) {
  const [comment, setComment] = useState('');
  const [foodPhoto, setFoodPhoto] = useState('');
  const [menuPhoto, setMenuPhoto] = useState('');
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [reviewableVisits, setReviewableVisits] = useState([]);
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadReviews = useCallback(async () => {
    setLoadingReviews(true);
    try {
      const [reviewsRes, eligibilityRes] = await Promise.all([
        api.reviews(restaurant.id),
        api.reviewEligibility(restaurant.id),
      ]);
      setReviews(reviewsRes.reviews || []);
      const visits = eligibilityRes.reviewable_visits || [];
      setReviewableVisits(visits);
      setSelectedVisitId((prev) => (visits.some((v) => v.checkin_id === prev) ? prev : (visits[0]?.checkin_id ?? null)));
    } catch (err) {
      Alert.alert('Could not load reviews', err.message);
    } finally {
      setLoadingReviews(false);
    }
  }, [restaurant.id]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const resetComposer = () => {
    setComment('');
    setFoodPhoto('');
    setMenuPhoto('');
    setEditingReviewId(null);
  };

  const startEditing = (review) => {
    setEditingReviewId(review.id);
    setComment(review.comment);
    setFoodPhoto(review.food_photo_label || '');
    setMenuPhoto(review.menu_label || '');
  };

  const submitReviewPayload = async () => {
    if (!comment.trim()) {
      Alert.alert('Review Error', 'Please write a brief comment regarding your dining experience.');
      return;
    }
    if (!editingReviewId && !selectedVisitId) {
      Alert.alert('Review Error', 'Select which visit this appraisal is for.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        rating: 5,
        comment,
        food_photo_label: foodPhoto.trim(),
        menu_label: menuPhoto.trim(),
      };
      if (editingReviewId) {
        await api.updateReview(editingReviewId, payload);
      } else {
        await api.createReview(restaurant.id, { ...payload, checkin_id: selectedVisitId });
      }
      resetComposer();
      Keyboard.dismiss();
      await loadReviews();
      Alert.alert(
        'Thank You',
        editingReviewId
          ? 'Your appraisal has been updated.'
          : 'Your premium gastronomy review has been distributed successfully!'
      );
    } catch (err) {
      Alert.alert('Could Not Publish Review', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteReview = async (review) => {
    try {
      await api.deleteReview(review.id);
      if (editingReviewId === review.id) resetComposer();
      await loadReviews();
    } catch (err) {
      Alert.alert('Could Not Delete Review', err.message);
    }
  };

  const confirmDelete = (review) => {
    const message = 'Remove this appraisal? This cannot be undone from the app.';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) deleteReview(review);
      return;
    }
    Alert.alert('Delete Appraisal', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteReview(review) },
    ]);
  };

  const canCompose = editingReviewId || reviewableVisits.length > 0;

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

        {/* Existing Guest Review Feeds — visible to everyone */}
        <Text style={styles.sectionHeading}>Gourmet Appraisals ({reviews.length})</Text>
        {loadingReviews ? (
          <ActivityIndicator color="#d2a14c" style={{ marginVertical: 12 }} />
        ) : (
          reviews.map((r) => {
            const isOwn = currentUser && r.user_id === currentUser.id;
            return (
              <View key={r.id} style={[styles.restaurantCard, { borderColor: '#252731', marginBottom: 12 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: '#d2a14c', fontWeight: '700' }}>{r.author}</Text>
                  <Text style={{ color: '#6b6b70', fontSize: 11 }}>{formatDate(r.created_at)}</Text>
                </View>
                <Text style={{ color: '#f8f0e9', fontSize: 13, lineHeight: 18, marginBottom: 8 }}>{r.comment}</Text>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: isOwn ? 10 : 0 }}>
                  {r.food_photo_label ? <View style={[styles.badge, { backgroundColor: '#16171d' }]}><Text style={{ color: '#aea9a1', fontSize: 11 }}>📸 {r.food_photo_label}</Text></View> : null}
                  {r.menu_label ? <View style={[styles.badge, { backgroundColor: '#16171d' }]}><Text style={{ color: '#aea9a1', fontSize: 11 }}>🥂 {r.menu_label}</Text></View> : null}
                </View>

                {isOwn && (
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <Pressable onPress={() => startEditing(r)}>
                      <Text style={{ color: '#d2a14c', fontSize: 12, fontWeight: '700' }}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmDelete(r)}>
                      <Text style={{ color: '#ff6b6b', fontSize: 12, fontWeight: '700' }}>Delete</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Review composer — one unreviewed verified visit unlocks one slot */}
        <Text style={[styles.sectionHeading, { marginTop: 20 }]}>
          {editingReviewId ? 'Edit Your Appraisal' : 'Write An Appraisal'}
        </Text>
        {canCompose ? (
          <View style={styles.splitterCard}>
            {!editingReviewId && reviewableVisits.length > 1 && (
              <>
                <Text style={[styles.inputLabel, { color: '#d2a14c' }]}>Which Visit?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {reviewableVisits.map((v) => (
                    <Pressable
                      key={v.checkin_id}
                      onPress={() => setSelectedVisitId(v.checkin_id)}
                      style={[styles.badge, selectedVisitId === v.checkin_id && styles.badgeActive]}
                    >
                      <Text style={[styles.badgeLabel, selectedVisitId === v.checkin_id && styles.badgeLabelActive]}>
                        {formatDate(v.verified_at)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

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
              {submitting ? (
                <ActivityIndicator color="#09090d" />
              ) : (
                <Text style={styles.copyShareButtonText}>{editingReviewId ? 'Save Changes' : 'Publish Premium Review'}</Text>
              )}
            </Pressable>
            {editingReviewId && (
              <Pressable onPress={resetComposer} style={{ marginTop: 10, alignItems: 'center' }}>
                <Text style={{ color: '#8e8982', fontSize: 12 }}>Cancel Edit</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={[styles.statusIndicatorBar, { backgroundColor: '#141311', borderColor: '#2a2215', padding: 16 }]}>
            <Text style={{ color: '#8e8982', fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
              🔒 Review submission access is locked. Check in via NFC at this establishment to unlock a review for that visit.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
