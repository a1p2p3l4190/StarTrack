import React from 'react';
import { WebView } from 'react-native-webview';
import { buildMapHtml } from './mapHtml';

export default function RestaurantMap({ restaurants, selectedRestaurant, onSelectRestaurant }) {
  const html = buildMapHtml(restaurants, selectedRestaurant);

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={{ flex: 1, backgroundColor: 'transparent' }}
      scrollEnabled={false}
      nestedScrollEnabled={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      onMessage={(event) => {
        const id = Number(event.nativeEvent.data);
        const restaurant = restaurants.find((r) => r.id === id);
        if (restaurant) onSelectRestaurant(restaurant);
      }}
    />
  );
}
