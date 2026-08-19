import React, { useEffect } from 'react';
import { View } from 'react-native';
import { buildMapHtml } from './mapHtml';

export default function RestaurantMap({ restaurants, selectedRestaurant, onSelectRestaurant }) {
  const html = buildMapHtml(restaurants, selectedRestaurant);

  useEffect(() => {
    function handleMessage(event) {
      if (typeof event.data !== 'string') return;
      const id = Number(event.data);
      if (Number.isNaN(id)) return;
      const restaurant = restaurants.find((r) => r.id === id);
      if (restaurant) onSelectRestaurant(restaurant);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [restaurants, onSelectRestaurant]);

  return (
    <View style={{ flex: 1 }}>
      <iframe title="restaurant-map" srcDoc={html} style={{ border: 0, width: '100%', height: '100%', touchAction: 'none' }} />
    </View>
  );
}
