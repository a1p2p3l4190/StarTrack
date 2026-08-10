// screens/ExploreScreen.jsx
import React, { useState } from 'react';
import { Pressable, Text, View, ScrollView, TextInput, Modal } from 'react-native';
import { styles } from '../styles';
import { COUNTRIES, CITIES, CUISINES, YEARS, STARS_LEVELS } from '../constants';
import Badge from '../components/Badge';
import RestaurantMap from '../components/RestaurantMap';
import RestaurantListSkeleton from '../components/Shimmer';

export default function ExploreScreen({
  viewMode, setViewMode, activeFilter, setActiveFilter, filteredRestaurants, restaurantsLoading, selectedRestaurant, setSelectedRestaurant, searchQuery, setSearchQuery, onOpenDetail
}) {
  const [drawerVisible, setDrawerVisible] = useState(false);

  const appliedCount = Object.entries(activeFilter).reduce((count, [key, val]) => {
    return val !== 'All' ? count + 1 : count;
  }, 0);

  const handleCountryChange = (country) => {
    setActiveFilter(prev => ({ ...prev, country: country, city: 'All' }));
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Dual Discovery</Text>

      <View style={styles.segmentControl}>
        <Pressable style={[styles.segment, viewMode === 'list' && styles.segmentActive]} onPress={() => setViewMode('list')}>
          <Text style={[styles.segmentLabel, viewMode === 'list' && styles.segmentLabelActive]}>List</Text>
        </Pressable>
        <Pressable style={[styles.segment, viewMode === 'map' && styles.segmentActive]} onPress={() => setViewMode('map')}>
          <Text style={[styles.segmentLabel, viewMode === 'map' && styles.segmentLabelActive]}>Map</Text>
        </Pressable>
      </View>

      <View style={styles.searchBarContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchTextInput}
          placeholder="Search establishment name directly..."
          placeholderTextColor="#6e6b64"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>Primary Curations</Text>
        <Pressable onPress={() => setDrawerVisible(true)}>
          <Text style={{ color: '#d2a14c', fontSize: 13, fontWeight: '700' }}>⚡ More Filters</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionHeading, { fontSize: 11, marginBottom: 6 }]}>City Target</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        {(CITIES[activeFilter.country] || ['All']).map((city) => (
          <Badge
            key={city}
            label={city}
            active={activeFilter.city === city}
            onPress={() => setActiveFilter(prev => ({ ...prev, city: city }))}
          />
        ))}
      </ScrollView>

      <Text style={[styles.sectionHeading, { fontSize: 11, marginBottom: 6, marginTop: 4 }]}>Michelin Stars</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        {STARS_LEVELS.map((s) => (
          <Badge
            key={s}
            label={s === 'All' ? 'All Tiers' : `${s}★`}
            active={activeFilter.stars === s}
            onPress={() => setActiveFilter(prev => ({ ...prev, stars: s }))}
          />
        ))}
      </ScrollView>

      { (appliedCount > 0 || searchQuery.length > 0) && (
        <View style={styles.statusIndicatorBar}>
          <Text style={styles.statusIndicatorText}>✨ Context Matrix: {appliedCount} filters applied</Text>
          <Pressable onPress={() => { setActiveFilter({ country: 'All', city: 'All', cuisine: 'All', year: 'All', stars: 'All' }); setSearchQuery(''); }}>
            <Text style={styles.statusClearText}>Clear All</Text>
          </Pressable>
        </View>
      )}

      {viewMode === 'list' ? (
        <View style={[styles.cardList, { marginTop: 4 }]}>
          {restaurantsLoading && <RestaurantListSkeleton />}
          {filteredRestaurants.map((restaurant) => (
            <Pressable
              key={restaurant.id}
              // UX RE-ENGINEERING: Clicking a restaurant card selects it AND gracefully navigates to its rich profile sheet page
              style={[styles.restaurantCard, selectedRestaurant.id === restaurant.id && styles.restaurantCardSelected]}
              onPress={() => {
                setSelectedRestaurant(restaurant);
                onOpenDetail(restaurant);
              }}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.restaurantName}>{restaurant.name}</Text>
                <Text style={styles.starRating}>{'★'.repeat(restaurant.stars)}</Text>
              </View>
              <Text style={styles.restaurantMeta}>
                {restaurant.city}, {restaurant.country} · {restaurant.cuisine} · {restaurant.year}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.mapContainer}>
          <RestaurantMap
            restaurants={filteredRestaurants}
            selectedRestaurant={selectedRestaurant}
            onSelectRestaurant={setSelectedRestaurant}
          />
        </View>
      )}

      {/* Advanced drawer modal filter overlay framework */}
      <Modal visible={drawerVisible} animationType="slide" transparent={true} onRequestClose={() => setDrawerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalDrawer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={[styles.sectionHeading, { color: '#f8f1e6', fontSize: 16 }]}>Advanced Customization</Text>
              <Pressable onPress={() => setDrawerVisible(false)}><Text style={{ color: '#ff6b6b', fontWeight: '700' }}>Done</Text></Pressable>
            </View>
            <Text style={[styles.sectionHeading, { fontSize: 11, marginBottom: 8 }]}>Country Boundaries</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filters, { marginBottom: 16 }]}>
              {COUNTRIES.map((country) => (
                <Badge key={country} label={country} active={activeFilter.country === country} onPress={() => handleCountryChange(country)} />
              ))}
            </ScrollView>
            <Text style={[styles.sectionHeading, { fontSize: 11, marginBottom: 8 }]}>Culinary Style</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filters, { marginBottom: 16 }]}>
              {CUISINES.map((c) => (
                <Badge key={c} label={c} active={activeFilter.cuisine === c} onPress={() => setActiveFilter(prev => ({ ...prev, cuisine: c }))} />
              ))}
            </ScrollView>
            <Text style={[styles.sectionHeading, { fontSize: 11, marginBottom: 8 }]}>Target Launch Year</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
              {YEARS.map((y) => (
                <Badge key={y} label={y === 'All' ? 'All Years' : String(y)} active={activeFilter.year === y} onPress={() => setActiveFilter(prev => ({ ...prev, year: y }))} />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}