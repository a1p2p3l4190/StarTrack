// screens/ExploreScreen.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View, ScrollView, TextInput, Modal, Image } from 'react-native';
import { styles } from '../styles';
import { STARS_LEVELS, RATING_LEVELS, SORT_OPTIONS } from '../constants';
import { deriveFilterOptions, isRestaurantOpen } from '../utils';
import Badge from '../components/Badge';
import Dropdown from '../components/Dropdown';
import RestaurantMap from '../components/RestaurantMap';
import RestaurantListSkeleton from '../components/Shimmer';
import { EmptyState } from '../components/ErrorDisplay';

export default function ExploreScreen({
  viewMode, setViewMode, activeFilter, setActiveFilter, sortBy, setSortBy, restaurants, filteredRestaurants, restaurantsLoading, selectedRestaurant, setSelectedRestaurant, searchQuery, setSearchQuery, onOpenDetail, quickFilters, setQuickFilters, userLocation, wishlistIds, onToggleSaved
}) {
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Derived from the restaurants actually loaded from the backend, not a
  // hand-maintained static list — so a restaurant in a new country/city/
  // cuisine/year is always reachable through these filters.
  const filterOptions = useMemo(() => deriveFilterOptions(restaurants), [restaurants]);
  const latestYear = filterOptions.years[0];

  // Year has no "All" option — it always resolves to one guide edition,
  // defaulting to the latest. Once the real year list is known, snap the
  // filter onto it if it's still unset or points at a year that no longer
  // exists in the data.
  useEffect(() => {
    if (!latestYear) return;
    if (!filterOptions.years.includes(activeFilter.year)) {
      setActiveFilter(prev => ({ ...prev, year: latestYear }));
    }
  }, [latestYear, filterOptions.years]);

  const appliedCount = Object.entries(activeFilter).reduce((count, [key, val]) => {
    if (key === 'year') return (val !== latestYear && filterOptions.years.includes(val)) ? count + 1 : count;
    return val !== 'All' ? count + 1 : count;
  }, 0) + Object.values(quickFilters || {}).filter(Boolean).length;

  const clearAll = () => {
    setActiveFilter({ country: 'All', city: 'All', cuisine: 'All', stars: 'All', minRating: 'All', year: latestYear || 'All' });
    setSearchQuery('');
    setQuickFilters({ nearby: false, openNow: false, notVisited: false });
  };

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

      {/* Country/City/Year are open-ended lists driven by real restaurant
          data, so they use compact dropdowns instead of horizontal chip
          rows that would just keep growing — laid out side by side so they
          don't stack into a tall column. Country comes before City since
          City's options depend on it. */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Dropdown
          label="Country"
          value={activeFilter.country}
          options={filterOptions.countries}
          onChange={handleCountryChange}
          containerStyle={{ flex: 1 }}
        />
        <Dropdown
          label="City"
          value={activeFilter.city}
          options={filterOptions.citiesByCountry[activeFilter.country] || ['All']}
          onChange={(city) => setActiveFilter(prev => ({ ...prev, city }))}
          containerStyle={{ flex: 1 }}
        />
        {filterOptions.years.length > 0 ? (
          <Dropdown
            label="Year"
            value={filterOptions.years.includes(activeFilter.year) ? activeFilter.year : latestYear}
            options={filterOptions.years}
            onChange={(year) => setActiveFilter(prev => ({ ...prev, year }))}
            containerStyle={{ flex: 1 }}
          />
        ) : null}
      </View>

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

      <Text style={[styles.sectionHeading, { fontSize: 11, marginBottom: 6, marginTop: 4 }]}>Quick Filters</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        <Badge label="Nearby" active={quickFilters?.nearby} onPress={() => setQuickFilters((prev) => ({ ...prev, nearby: !prev.nearby }))} />
        <Badge label="Open Now" active={quickFilters?.openNow} onPress={() => setQuickFilters((prev) => ({ ...prev, openNow: !prev.openNow }))} />
        <Badge label="Not Visited" active={quickFilters?.notVisited} onPress={() => setQuickFilters((prev) => ({ ...prev, notVisited: !prev.notVisited }))} />
      </ScrollView>

      <Text style={[styles.sectionHeading, { fontSize: 11, marginBottom: 6, marginTop: 4 }]}>Community Rating</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        {RATING_LEVELS.map((r) => (
          <Badge
            key={r}
            label={r === 'All' ? 'Any Rating' : `${r}★+`}
            active={activeFilter.minRating === r}
            onPress={() => setActiveFilter(prev => ({ ...prev, minRating: r }))}
          />
        ))}
      </ScrollView>

      { (appliedCount > 0 || searchQuery.length > 0) && (
        <View style={styles.statusIndicatorBar}>
          <Text style={styles.statusIndicatorText}>✨ {filteredRestaurants.length} results · {appliedCount} filters applied</Text>
          <Pressable onPress={clearAll}>
            <Text style={styles.statusClearText}>Clear All</Text>
          </Pressable>
        </View>
      )}

      {viewMode === 'list' ? (
        <View style={[styles.cardList, { marginTop: 4 }]}>
          {restaurantsLoading && <RestaurantListSkeleton />}
          {!restaurantsLoading && filteredRestaurants.length === 0 && (
            <EmptyState
              icon="🔎"
              title="No Restaurants Match"
              description="Try loosening a filter or clearing search — nothing fits the current combination."
              actionLabel="Clear Filters"
              onAction={clearAll}
            />
          )}
          {filteredRestaurants.map((restaurant) => (
            <Pressable
              key={restaurant.id}
              style={[styles.restaurantCard, selectedRestaurant?.id === restaurant.id && styles.restaurantCardSelected]}
              onPress={() => {
                setSelectedRestaurant(restaurant);
                onOpenDetail(restaurant);
              }}
            >
              <View style={styles.restaurantCardContent}>
                {restaurant.photo_url ? (
                  <Image source={{ uri: restaurant.photo_url }} style={styles.restaurantCardImage} resizeMode="cover" />
                ) : (
                  <View style={styles.restaurantCardImagePlaceholder}>
                    <Text style={styles.restaurantCardImagePlaceholderText}>★</Text>
                  </View>
                )}

                <View style={styles.restaurantCardBody}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.restaurantName} numberOfLines={1}>{restaurant.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.starRating}>{'★'.repeat(restaurant.stars)}</Text>
                      <Pressable onPress={(event) => { event.stopPropagation?.(); onToggleSaved?.(restaurant); }} hitSlop={10} style={{ marginLeft: 8 }}>
                        <Text style={{ fontSize: 19, color: wishlistIds?.has(String(restaurant.id)) ? '#d2a14c' : '#6b6b70' }}>{wishlistIds?.has(String(restaurant.id)) ? '♥' : '♡'}</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.restaurantMeta}>
                    {restaurant.city}, {restaurant.country} · {restaurant.cuisine} · {restaurant.year}
                  </Text>
                  {restaurant.review_count > 0 ? (
                    <Text style={[styles.restaurantMeta, { color: '#d2a14c' }]}>
                      ⭐ {restaurant.average_rating?.toFixed(1)} ({restaurant.review_count})
                    </Text>
                  ) : null}

                  <View style={styles.restaurantInfoRow}>
                    <Text style={styles.restaurantInfoPill}>{restaurant.price_tier ? '💰'.repeat(restaurant.price_tier) : 'Price N/A'}</Text>
                    <Text style={styles.restaurantInfoPill}>{isRestaurantOpen(restaurant) ? '🟢 Open now' : '⚪ Closed'}</Text>
                    <Text style={styles.restaurantInfoPill}>{restaurant.distance_km != null ? `${restaurant.distance_km < 1 ? Math.round(restaurant.distance_km * 1000) + ' m' : restaurant.distance_km.toFixed(1) + ' km'}` : 'Distance unavailable'}</Text>
                  </View>
                </View>
              </View>
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
            <Text style={[styles.sectionHeading, { fontSize: 11, marginBottom: 8 }]}>Sort By</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filters, { marginBottom: 16 }]}>
              {SORT_OPTIONS.map((opt) => (
                <Badge key={opt.key} label={opt.label} active={sortBy === opt.key} onPress={() => setSortBy(opt.key)} />
              ))}
            </ScrollView>
            <Text style={[styles.sectionHeading, { fontSize: 11, marginBottom: 8 }]}>Culinary Style</Text>
            <Dropdown
              label="Culinary Style"
              value={activeFilter.cuisine}
              options={filterOptions.cuisines}
              onChange={(c) => setActiveFilter(prev => ({ ...prev, cuisine: c }))}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
