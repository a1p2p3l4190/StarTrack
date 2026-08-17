import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import RestaurantMap from './RestaurantMap';
import { api } from '../api';
import { styles } from '../styles';

export default function StarMap({ restaurants = [], checkinHistory = {}, currentUser, onOpenDetail }) {
  const visited = useMemo(() => restaurants.filter((restaurant) => checkinHistory[String(restaurant.id)]), [restaurants, checkinHistory]);
  const cities = useMemo(() => ['All', ...new Set(visited.map((restaurant) => restaurant.city).filter(Boolean))], [visited]);
  const [selectedCity, setSelectedCity] = useState('All');
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [myReview, setMyReview] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const cityRestaurants = useMemo(
    () => selectedCity === 'All' ? visited : visited.filter((restaurant) => restaurant.city === selectedCity),
    [visited, selectedCity]
  );

  useEffect(() => {
    if (!selectedRestaurant) return;
    let cancelled = false;
    setReviewLoading(true);
    api.reviews(selectedRestaurant.id)
      .then((data) => {
        if (!cancelled) setMyReview((data.reviews || []).find((review) => String(review.user_id || review.author?.id) === String(currentUser?.id)) || null);
      })
      .catch(() => { if (!cancelled) setMyReview(null); })
      .finally(() => { if (!cancelled) setReviewLoading(false); });
    return () => { cancelled = true; };
  }, [selectedRestaurant, currentUser?.id]);

  return (
    <View>
      <Text style={styles.sectionHeading}>Star Map</Text>
      <Text style={{ color: '#8e8982', fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
        Explore the restaurants and cities that are part of your dining journey.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {cities.map((city) => (
          <Pressable key={city} onPress={() => setSelectedCity(city)} style={[styles.badge, selectedCity === city && styles.badgeActive]}>
            <Text style={[styles.badgeLabel, selectedCity === city && styles.badgeLabelActive]}>{city}</Text>
          </Pressable>
        ))}
      </View>

      {cityRestaurants.length === 0 ? (
        <View style={styles.splitterCard}>
          <Text style={{ color: '#f8e8cf', fontSize: 15, fontWeight: '700' }}>Your Star Map is waiting</Text>
          <Text style={[styles.starMapText, { marginTop: 8 }]}>Complete a verified check-in to add a restaurant and city to your map.</Text>
        </View>
      ) : (
        <>
          <View style={[styles.mapContainer, { height: 300, marginBottom: 14 }]}>
            <RestaurantMap restaurants={cityRestaurants} selectedRestaurant={selectedRestaurant} onSelectRestaurant={setSelectedRestaurant} />
          </View>
          <View style={{ gap: 10 }}>
            {cityRestaurants.map((restaurant) => {
              const visit = checkinHistory[String(restaurant.id)];
              const active = selectedRestaurant?.id === restaurant.id;
              return (
                <Pressable key={restaurant.id} onPress={() => setSelectedRestaurant(restaurant)} style={[styles.splitterCard, { padding: 14, borderColor: active ? '#d2a14c' : '#23232a' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.wishName}>{restaurant.name}</Text>
                      <Text style={styles.wishSub}>{restaurant.city}, {restaurant.country} · Visited {new Date(visit.timestamp).toLocaleDateString()}</Text>
                    </View>
                    <Text style={{ color: '#d2a14c', fontSize: 18 }}>{'★'.repeat(restaurant.stars)}</Text>
                  </View>
                  {active && (
                    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#292c34', paddingTop: 10 }}>
                      {reviewLoading ? <ActivityIndicator color="#d2a14c" /> : myReview ? (
                        <Text style={{ color: '#c4b9a8', fontSize: 12, lineHeight: 18 }}>“{myReview.comment}”</Text>
                      ) : <Text style={{ color: '#8e8982', fontSize: 12 }}>You did not leave a review for this visit.</Text>}
                      <Pressable onPress={() => onOpenDetail?.(restaurant)} style={{ marginTop: 10 }}>
                        <Text style={{ color: '#d2a14c', fontSize: 12, fontWeight: '800' }}>View Restaurant Details →</Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
