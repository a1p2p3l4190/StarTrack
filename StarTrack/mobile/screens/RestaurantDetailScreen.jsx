// screens/RestaurantDetailScreen.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Keyboard, ActivityIndicator, Platform, Image, Alert, Linking, Modal, useWindowDimensions } from 'react-native';
import { styles } from '../styles';
import { api } from '../api';
import { isRestaurantOpen, formatHoursEntry, summarizeTodayHours } from '../utils';
import { pickImages, uploadImages } from '../photoStorage';
import { ReviewCardSkeleton } from '../components/Shimmer';
import { ErrorMessage, Toast, EmptyState } from '../components/ErrorDisplay';
import RestaurantPlaceholder from '../components/RestaurantPlaceholder';
import InteractivePressable from '../components/InteractivePressable';

const formatDate = (iso) => new Date(iso).toISOString().split('T')[0];

const RESERVATION_PLATFORM_META = {
  opentable: { icon: '🍽️', label: 'Reserve on OpenTable' },
  resy: { icon: '📅', label: 'Reserve on Resy' },
  website: { icon: '🔗', label: "Book on Restaurant's Website" },
};

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function RestaurantDetailScreen({ restaurant, currentUser, onClose, onSavedChanged }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(5);
  const [photos, setPhotos] = useState([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [reviewableVisits, setReviewableVisits] = useState([]);
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [reviewComposerExpanded, setReviewComposerExpanded] = useState(false);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewSort, setReviewSort] = useState('newest');
  const [reviewsWithPhotosOnly, setReviewsWithPhotosOnly] = useState(false);
  const [photoGallery, setPhotoGallery] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [toastMessage, setToastMessage] = useState({ text: '', type: 'info' });
  const [hoursExpanded, setHoursExpanded] = useState(false);

  // The Explore list's restaurant objects don't carry star_history/hours
  // (kept out of the list payload on purpose — only fetched here on the
  // detail screen where they're actually shown).
  const [starHistory, setStarHistory] = useState(restaurant.star_history || []);
  const [hours, setHours] = useState(restaurant.hours || []);

  const todayDayOfWeek = new Date().getDay();
  const todayHours = hours.find((h) => h.day_of_week === todayDayOfWeek);
  const currentlyOpen = isRestaurantOpen({ ...restaurant, hours });

  useEffect(() => {
    let cancelled = false;
    api.restaurant(restaurant.id)
      .then((full) => {
        if (cancelled) return;
        setStarHistory(full.star_history || []);
        setHours(full.hours || []);
      })
      .catch((err) => console.warn('Failed to load restaurant details', err.message));
    return () => { cancelled = true; };
  }, [restaurant.id]);

  const refreshSavedState = useCallback(async () => {
    if (!currentUser || !restaurant?.id) return;
    try {
      const wishlist = await api.wishlist();
      const saved = (wishlist.wishlist || []).some((item) => String(item.restaurant_id) === String(restaurant.id) || item.restaurant_name === restaurant.name);
      setIsSaved(saved);
    } catch (err) {
      console.warn('Failed to refresh saved restaurant state', err.message);
    }
  }, [currentUser, restaurant]);

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
    refreshSavedState();
  }, [loadReviews, refreshSavedState]);

  const resetComposer = () => {
    setComment('');
    setRating(5);
    setPhotos([]);
    setEditingReviewId(null);
    setReviewComposerExpanded(false);
  };

  const startEditing = (review) => {
    setEditingReviewId(review.id);
    setReviewComposerExpanded(true);
    setComment(review.comment);
    setRating(review.rating || 5);
    setPhotos((review.photos || []).map((p) => ({ url: p.url, label: p.label || '' })));
  };

  const pickReviewPhotos = async () => {
    try {
      const uris = await pickImages({ selectionLimit: 6 });
      if (!uris.length) return;
      setUploadingPhotos(true);
      const uploaded = await uploadImages(uris, 'reviews', currentUser?.id || 'guest');
      const newPhotos = uploaded.map(({ remoteUrl }, i) => ({ url: remoteUrl || uris[i], label: '' }));
      setPhotos((prev) => [...prev, ...newPhotos]);
    } catch (err) {
      Alert.alert('Could not add photos', err.message);
    } finally {
      setUploadingPhotos(false);
    }
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePhotoLabel = (index, label) => {
    setPhotos((prev) => prev.map((p, i) => (i === index ? { ...p, label } : p)));
  };

  const submitReviewPayload = async () => {
    if (!comment.trim()) {
      Alert.alert('Review Error', 'Please write a brief comment regarding your dining experience.');
      return;
    }
    if (!rating) {
      Alert.alert('Review Error', 'Tap a star rating for this visit.');
      return;
    }
    if (!editingReviewId && !selectedVisitId) {
      Alert.alert('Review Error', 'Select which visit this appraisal is for.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        rating,
        comment,
        photos: photos.map((p) => ({ url: p.url, label: p.label || '' })),
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

  const submitReport = async (review, reason) => {
    try {
      await api.reportReview(review.id, {
        reason,
        details: 'Reported from the mobile review detail screen.',
      });
      Alert.alert('Review reported', 'Thanks — our moderation team will review this report.');
    } catch (err) {
      Alert.alert('Could not report review', err.message);
    }
  };

  const handleReportReview = (review) => {
    const reportReasons = [
      { text: 'Spam', onPress: () => submitReport(review, 'spam') },
      { text: 'Abusive', onPress: () => submitReport(review, 'abusive') },
      { text: 'Offensive', onPress: () => submitReport(review, 'offensive') },
      { text: 'False info', onPress: () => submitReport(review, 'false_info') },
      { text: 'Other', onPress: () => submitReport(review, 'other') },
      { text: 'Cancel', style: 'cancel' },
    ];
    Alert.alert('Report review', 'Why are you reporting this review?', reportReasons);
  };

  const toggleFavorite = async () => {
    if (!currentUser) {
      Alert.alert('Log in required', 'Please sign in before saving a restaurant.');
      return;
    }
    setSavingFavorite(true);
    try {
      const wishlistData = await api.wishlist();
      const existing = (wishlistData.wishlist || []).find((item) => String(item.restaurant_id) === String(restaurant.id) || item.restaurant_name === restaurant.name);
      if (existing) {
        await api.removeWishlist(existing.id);
        setIsSaved(false);
        await onSavedChanged?.();
      } else {
        await api.addWishlist({
          restaurant_id: restaurant.id,
          restaurant_name: restaurant.name,
          photo_url: restaurant.photo_url || '',
          price_tier: restaurant.price_tier || 0,
          opening_hours: summarizeTodayHours({ hours }),
          note: 'Saved from StarTrack',
        });
        setIsSaved(true);
        await onSavedChanged?.();
      }
    } catch (err) {
      Alert.alert('Could not update saved restaurant', err.message);
    } finally {
      setSavingFavorite(false);
    }
  };

  // StarTrack doesn't run its own booking system — this just opens whatever
  // real platform (OpenTable, Resy, the restaurant's own site) the admin
  // has on file for this restaurant.
  const openReservationLink = () => {
    if (!restaurant.reservation_url) return;
    Linking.openURL(restaurant.reservation_url).catch(() => {
      Alert.alert('Could not open link', 'This booking link looks invalid.');
    });
  };

  const canCompose = editingReviewId || reviewableVisits.length > 0;
  const selectedVisit = reviewableVisits.find((visit) => visit.checkin_id === selectedVisitId);
  const visibleReviews = useMemo(() => {
    const query = reviewSearch.trim().toLowerCase();
    return reviews
      .filter((review) => {
        const matchesSearch = !query || `${review.author || ''} ${review.comment || ''}`.toLowerCase().includes(query);
        const matchesFilter = !reviewsWithPhotosOnly
          || (Array.isArray(review.photos) && review.photos.length > 0);
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        if (reviewSort === 'highest') return (b.rating || 0) - (a.rating || 0);
        if (reviewSort === 'lowest') return (a.rating || 0) - (b.rating || 0);
        if (reviewSort === 'newest') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        return 0;
      });
  }, [reviews, reviewSearch, reviewSort, reviewsWithPhotosOnly]);

  return (
    <View style={[styles.container, { paddingHorizontal: 20, paddingTop: 40 }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {restaurant.photo_url ? (
          <Image source={{ uri: restaurant.photo_url }} style={{ width: '100%', height: 210, borderRadius: 18, marginBottom: 18 }} resizeMode="cover" />
        ) : (
          <RestaurantPlaceholder name={restaurant.name} style={{ width: '100%', height: 210, borderRadius: 18, marginBottom: 18 }} />
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: '#d2a14c', fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>{restaurant.cuisine.toUpperCase()}</Text>
            <Text style={styles.title} numberOfLines={3} ellipsizeMode="tail">{restaurant.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
            <InteractivePressable onPress={toggleFavorite} disabled={savingFavorite} style={[styles.badge, { backgroundColor: isSaved ? '#264b39' : '#1e1f26' }]}>
              <Text style={{ color: isSaved ? '#7ce8b4' : '#f8f0e9', fontWeight: '700' }}>{savingFavorite ? '...' : (isSaved ? 'Saved' : 'Save')}</Text>
            </InteractivePressable>
            <InteractivePressable onPress={onClose} style={[styles.badge, { backgroundColor: '#1e1f26' }]}>
              <Text style={{ color: '#ff6b6b', fontWeight: '700' }}>Close</Text>
            </InteractivePressable>
          </View>
        </View>
        <Text style={[styles.restaurantMeta, { fontSize: 15, marginBottom: 8 }]}> 
          📍 {restaurant.city}, {restaurant.country} · Released: {restaurant.year || restaurant.year_awarded || '—'} · Tier: {'★'.repeat(restaurant.stars)}
        </Text>
        {restaurant.review_count > 0 ? (
          <Text style={[styles.restaurantMeta, { fontSize: 13, marginBottom: 12, color: '#d2a14c' }]}>
            ⭐ {restaurant.average_rating?.toFixed(1)} average from {restaurant.review_count} review{restaurant.review_count === 1 ? '' : 's'}
          </Text>
        ) : null}
        <View style={[styles.badge, { backgroundColor: '#1a1e23', marginBottom: 16, alignSelf: 'flex-start' }]}>
          <Text style={{ color: '#f8f0e9', fontSize: 12, fontWeight: '700' }}>{restaurant.price_tier ? '💰'.repeat(restaurant.price_tier) : 'Price unavailable'}</Text>
        </View>

        <View style={[styles.splitterCard, { padding: 0, marginBottom: 16, overflow: 'hidden' }]}>
          <InteractivePressable onPress={() => setHoursExpanded((expanded) => !expanded)} style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: currentlyOpen ? '#18c89a' : '#ff6b6b', marginRight: 12, shadowColor: currentlyOpen ? '#18c89a' : '#ff6b6b', shadowOpacity: 0.6, shadowRadius: 5 }} />
              <Text style={{ color: currentlyOpen ? '#7ce8b4' : '#ff8585', fontSize: 16, fontWeight: '800' }}>{currentlyOpen ? 'Open now' : 'Closed'}</Text>
              <Text numberOfLines={1} style={{ color: '#8e8982', fontSize: 14, marginLeft: 12, flex: 1 }}>{todayHours ? formatHoursEntry(todayHours) : 'Hours unavailable'}</Text>
              <Text style={{ color: '#f3e8d8', fontSize: 24, lineHeight: 22 }}>{hoursExpanded ? '⌃' : '⌄'}</Text>
            </View>
          </InteractivePressable>
          {hoursExpanded && (
            <View style={{ borderTopWidth: 1, borderTopColor: '#292c34', paddingHorizontal: 16, paddingBottom: 10 }}>
              {WEEK_DAYS.map((day, index) => {
                const dayOfWeek = (index + 1) % 7;
                const isToday = todayDayOfWeek === dayOfWeek;
                const entry = hours.find((h) => h.day_of_week === dayOfWeek);
                return (
                  <View key={day} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#22252c' }}>
                    <Text style={{ color: isToday ? '#d2a14c' : '#c4b9a8', fontSize: 13, fontWeight: isToday ? '800' : '500' }}>{day}{isToday ? ' · Today' : ''}</Text>
                    <Text style={{ color: isToday ? '#f8f1e6' : '#8e8982', fontSize: 13 }}>{entry ? formatHoursEntry(entry) : 'Hours unavailable'}</Text>
                  </View>
                );
              })}
              <Text style={{ color: '#6e6b64', fontSize: 11, marginTop: 12 }}>Hours provided by the restaurant.</Text>
            </View>
          )}
        </View>

        {starHistory.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.inputLabel}>Star History</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {[...starHistory].reverse().map((h) => (
                <View key={h.year} style={[styles.badge, { backgroundColor: '#16171d' }]}>
                  <Text style={{ color: '#aea9a1', fontSize: 11 }}>{h.year}: {'★'.repeat(h.stars)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {restaurant.next_reservation_release && (
          <View style={[styles.badge, { backgroundColor: '#201d18', marginBottom: 12, alignSelf: 'flex-start' }]}>
            <Text style={{ color: '#f6d8a1', fontSize: 12, fontWeight: '700' }}>
              📅 Next reservation window opens {new Date(restaurant.next_reservation_release).toLocaleDateString()} — save to Favorites to get reminded
            </Text>
          </View>
        )}

        {restaurant.reservation_url ? (
          <InteractivePressable style={[styles.copyShareButton, { marginBottom: 20 }]} onPress={openReservationLink}>
            <Text style={styles.copyShareButtonText}>
              {(RESERVATION_PLATFORM_META[restaurant.reservation_platform] || RESERVATION_PLATFORM_META.website).icon}{' '}
              {(RESERVATION_PLATFORM_META[restaurant.reservation_platform] || RESERVATION_PLATFORM_META.website).label}
            </Text>
          </InteractivePressable>
        ) : null}

        {/* Existing Guest Review Feeds — visible to everyone */}
        <Text style={styles.sectionHeading}>Gourmet Appraisals ({reviews.length})</Text>
        {reviews.length > 0 ? (
          <>
            <View style={{ backgroundColor: '#121317', borderRadius: 14, borderWidth: 1, borderColor: '#252731', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ color: '#d2a14c', fontSize: 16, marginRight: 8 }}>⌕</Text>
              <TextInput
                value={reviewSearch}
                onChangeText={setReviewSearch}
                placeholder="Search food, service, atmosphere…"
                placeholderTextColor="#68645e"
                style={{ flex: 1, color: '#f8f0e9', height: 42, fontSize: 12 }}
                returnKeyType="search"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: '#77736d', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>SORT</Text>
                {[['newest', 'Newest'], ['highest', 'Highest Rated'], ['lowest', 'Lowest Rated']].map(([value, label]) => (
                  <Pressable key={value} onPress={() => setReviewSort(value)} style={[styles.badge, { paddingVertical: 8, paddingHorizontal: 13 }, reviewSort === value && styles.badgeActive]}>
                    <Text style={[styles.badgeLabel, reviewSort === value && styles.badgeLabelActive]}>{label}</Text>
                  </Pressable>
                ))}
                <View style={{ width: 1, height: 20, backgroundColor: '#303037', marginHorizontal: 3 }} />
                <Text style={{ color: '#77736d', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>FILTER</Text>
                <Pressable onPress={() => setReviewsWithPhotosOnly((enabled) => !enabled)} style={[styles.badge, { paddingVertical: 8, paddingHorizontal: 13 }, reviewsWithPhotosOnly && styles.badgeActive]}>
                  <Text style={[styles.badgeLabel, reviewsWithPhotosOnly && styles.badgeLabelActive]}>Photos</Text>
                </Pressable>
              </View>
            </ScrollView>
          </>
        ) : null}
        {loadingReviews ? (
          <View style={{ gap: 12 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <ReviewCardSkeleton key={i} />
            ))}
          </View>
        ) : reviews.length === 0 ? (
          <EmptyState icon="💬" title="No Reviews Yet" description="Complete a verified visit to unlock your review slot and be the first to share your dining experience." onAction={loadReviews} actionLabel="Check Review Eligibility" />
        ) : (
          visibleReviews.length === 0 ? (
            <Text style={{ color: '#8e8982', fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>No reviews match your search.</Text>
          ) : visibleReviews.map((r) => {
            const isOwn = currentUser && r.user_id === currentUser.id;
            return (
              <View key={r.id} style={[styles.restaurantCard, { borderColor: '#29251f', marginBottom: 14, padding: 18, borderRadius: 20 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#2a2115', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Text style={{ color: '#d2a14c', fontSize: 14, fontWeight: '800' }}>{(r.author || 'G').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <Text style={{ color: '#f4eee5', fontWeight: '700', fontSize: 14 }}>{r.author || 'Guest'}</Text>
                      {isOwn ? <Text style={{ color: '#d2a14c', fontSize: 10, fontWeight: '700' }}>YOUR REVIEW</Text> : null}
                    </View>
                    <Text style={{ color: '#77736d', fontSize: 11, marginTop: 2 }}>{formatDate(r.created_at)}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ color: '#d2a14c', fontSize: 15, letterSpacing: 1 }}>{'★'.repeat(r.rating || 0)}{'☆'.repeat(Math.max(0, 5 - (r.rating || 0)))}</Text>
                </View>
                <Text style={{ color: '#f8f0e9', fontSize: 14, lineHeight: 21, marginBottom: 12 }}>{r.comment}</Text>

                {r.photos && r.photos.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {r.photos.map((p) => (
                        <View key={p.id} style={{ width: 82 }}>
                          <Pressable onPress={() => setPhotoGallery({ photos: r.photos, index: r.photos.indexOf(p) })}>
                            <Image source={{ uri: p.url }} style={{ width: 82, height: 82, borderRadius: 12 }} resizeMode="cover" />
                          </Pressable>
                          {p.label ? (
                            <Text style={{ color: '#aea9a1', fontSize: 10, marginTop: 2 }} numberOfLines={1}>{p.label}</Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                ) : null}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#24242a' }}>
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    {isOwn && (
                      <>
                        <Pressable onPress={() => startEditing(r)}>
                          <Text style={{ color: '#d2a14c', fontSize: 12, fontWeight: '700' }}>Edit</Text>
                        </Pressable>
                        <Pressable onPress={() => confirmDelete(r)}>
                          <Text style={{ color: '#ff6b6b', fontSize: 12, fontWeight: '700' }}>Delete</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                  <Pressable onPress={() => handleReportReview(r)}>
                    <Text style={{ color: '#8e8982', fontSize: 12, fontWeight: '700' }}>Report</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        {/* Review composer — one unreviewed verified visit unlocks one slot */}
        <Pressable
          onPress={() => canCompose && setReviewComposerExpanded((expanded) => !expanded)}
          disabled={!canCompose}
          style={[styles.splitterCard, { marginTop: 20, marginBottom: canCompose && reviewComposerExpanded ? 0 : 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionHeading, { marginTop: 0, marginBottom: 4 }]}>
              {editingReviewId ? 'Edit Your Appraisal' : 'Write An Appraisal'}
            </Text>
            <Text style={{ color: canCompose ? '#aaa39a' : '#6b6b70', fontSize: 12 }}>
              {editingReviewId
                ? 'Update your experience'
                : reviewableVisits.length > 0
                  ? `${reviewableVisits.length} visit${reviewableVisits.length === 1 ? '' : 's'} awaiting review`
                  : 'A verified visit is required'}
            </Text>
          </View>
          <Text style={{ color: canCompose ? '#d2a14c' : '#6b6b70', fontSize: 22 }}>
            {canCompose && reviewComposerExpanded ? '⌃' : '⌄'}
          </Text>
        </Pressable>
        {canCompose ? (
          reviewComposerExpanded ? <View style={[styles.splitterCard, { borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
            {!editingReviewId && (
              <>
                <Text style={[styles.inputLabel, { color: '#d2a14c' }]}>Select your visit</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                  {reviewableVisits.map((v) => (
                    <Pressable
                      key={v.checkin_id}
                      onPress={() => setSelectedVisitId(v.checkin_id)}
                      style={[styles.badge, { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14 }, selectedVisitId === v.checkin_id && styles.badgeActive]}
                    >
                      <Text style={[styles.badgeLabel, { letterSpacing: 0.3 }, selectedVisitId === v.checkin_id && styles.badgeLabelActive]}>
                        {formatDate(v.verified_at)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={[styles.inputLabel, { color: '#d2a14c', marginBottom: 0 }]}>Your experience</Text>
              {selectedVisit ? <Text style={{ color: '#6b6b70', fontSize: 11 }}>Verified check-in</Text> : null}
            </View>
            <TextInput
              style={[styles.input, { height: 70, paddingTop: 10, marginBottom: 12 }]}
              multiline
              placeholder="Tell us about the food, service, and atmosphere…"
              placeholderTextColor="#555"
              value={comment}
              onChangeText={setComment}
            />

            <Text style={styles.inputLabel}>Your rating</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => setRating(star)} hitSlop={6}>
                  <Text style={{ fontSize: 28, color: star <= rating ? '#d2a14c' : '#3a3a3f' }}>★</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>Add photos ({photos.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                {photos.map((p, i) => (
                  <View key={`${p.url}-${i}`} style={{ width: 84 }}>
                    <View style={{ position: 'relative' }}>
                      <Image source={{ uri: p.url }} style={{ width: 84, height: 64, borderRadius: 10 }} resizeMode="cover" />
                      <Pressable
                        onPress={() => removePhoto(i)}
                        style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#09090d', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: '#ff6b6b', fontSize: 12, fontWeight: '700' }}>✕</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      style={[styles.input, { fontSize: 11, height: 28, paddingVertical: 4, paddingHorizontal: 6, marginTop: 4 }]}
                      placeholder="Caption"
                      placeholderTextColor="#555"
                      value={p.label}
                      onChangeText={(text) => updatePhotoLabel(i, text)}
                    />
                  </View>
                ))}
                <Pressable style={[styles.badge, { backgroundColor: '#1e1f26', height: 64, justifyContent: 'center' }]} onPress={pickReviewPhotos} disabled={uploadingPhotos}>
                  {uploadingPhotos ? <ActivityIndicator color="#d2a14c" /> : <Text style={{ color: '#f8f0e9', fontWeight: '700', fontSize: 12 }}>📷 Add Photos</Text>}
                </Pressable>
              </View>
            </ScrollView>
            <Text style={{ color: '#6b6b70', fontSize: 11, marginBottom: 16 }}>Add as many photos as you like in one go, with an optional caption for each.</Text>

            <Pressable style={styles.copyShareButton} onPress={submitReviewPayload} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#09090d" />
              ) : (
                <Text style={styles.copyShareButtonText}>{editingReviewId ? 'Save Changes' : 'Publish Review'}</Text>
              )}
            </Pressable>
            {editingReviewId && (
              <Pressable onPress={resetComposer} style={{ marginTop: 10, alignItems: 'center' }}>
                <Text style={{ color: '#8e8982', fontSize: 12 }}>Cancel Edit</Text>
              </Pressable>
            )}
          </View> : null
        ) : (
          <View style={[styles.statusIndicatorBar, { backgroundColor: '#141311', borderColor: '#2a2215', padding: 16 }]}>
            <Text style={{ color: '#8e8982', fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
              🔒 Review submission access is locked. Check in via NFC at this establishment to unlock a review for that visit.
            </Text>
          </View>
        )}
      </ScrollView>
      <Modal visible={Boolean(photoGallery)} transparent animationType="fade" onRequestClose={() => setPhotoGallery(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(5, 5, 8, 0.98)', justifyContent: 'center' }}>
          <Pressable onPress={() => setPhotoGallery(null)} style={{ position: 'absolute', top: 54, right: 22, zIndex: 2, width: 38, height: 38, borderRadius: 19, backgroundColor: '#202126', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#f8f0e9', fontSize: 20 }}>×</Text>
          </Pressable>
          {photoGallery ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: photoGallery.index * screenWidth, y: 0 }}
              style={{ flexGrow: 0, maxHeight: screenHeight - 150 }}
            >
              {photoGallery.photos.map((photo, index) => (
                <View key={`${photo.url}-${index}`} style={{ width: screenWidth, alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={{ uri: photo.url }} style={{ width: screenWidth - 40, height: Math.min(screenWidth - 40, screenHeight - 220), borderRadius: 16 }} resizeMode="contain" />
                  {photo.label ? <Text style={{ color: '#d8d0c5', fontSize: 12, marginTop: 14 }}>{photo.label}</Text> : null}
                </View>
              ))}
            </ScrollView>
          ) : null}
          {photoGallery ? <Text style={{ color: '#77736d', textAlign: 'center', fontSize: 11, marginTop: 20 }}>{photoGallery.index + 1} / {photoGallery.photos.length}</Text> : null}
        </View>
      </Modal>
    </View>
  );
}
