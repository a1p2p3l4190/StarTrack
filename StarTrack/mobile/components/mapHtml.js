// Builds a self-contained Leaflet/OpenStreetMap page, used identically by
// the native WebView and the web iframe variants of RestaurantMap so both
// platforms render pixel-identical maps from one source of truth.
export function buildMapHtml(restaurants, selectedRestaurant) {
  const points = restaurants
    .filter((r) => typeof r.location_lat === 'number' && typeof r.location_long === 'number' && (r.location_lat !== 0 || r.location_long !== 0))
    .map((r) => ({
      id: r.id,
      name: r.name,
      lat: r.location_lat,
      lng: r.location_long,
      stars: r.stars,
      cuisine: r.cuisine,
      city: r.city,
    }));

  const selectedId = selectedRestaurant ? selectedRestaurant.id : null;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #09090d; }
    .star-pin {
      width: 26px; height: 26px; border-radius: 50%;
      background: linear-gradient(135deg, #e4a74b 0%, #d94231 100%);
      border: 2px solid #f8f1e6;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: #17171c; box-shadow: 0 4px 12px rgba(0,0,0,0.45);
    }
    .star-pin.selected {
      background: linear-gradient(135deg, #f3cd7a 0%, #d2a14c 100%);
      border-color: #ffffff;
      transform: scale(1.25);
    }
    .cluster-pin {
      width: 40px; height: 40px; border-radius: 50%;
      background: linear-gradient(135deg, #d94231 0%, #8a1f16 100%);
      border: 2px solid #f8f1e6;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 700; color: #f8f1e6;
      box-shadow: 0 6px 16px rgba(0,0,0,0.5);
    }
    .leaflet-popup-content-wrapper { background: #17171c; color: #f8f1e6; border-radius: 12px; }
    .leaflet-popup-tip { background: #17171c; }
    .popup-title { font-weight: 700; margin-bottom: 4px; }
    .popup-meta { font-size: 12px; color: #c7c2bb; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <script>
    function notifyParent(id) {
      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(String(id)); } catch (e) {}
      try { window.parent && window.parent.postMessage(String(id), '*'); } catch (e) {}
    }

    var points = ${JSON.stringify(points)};
    var selectedId = ${JSON.stringify(selectedId)};

    var map = L.map('map', { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Zoomed out far enough that pins would overlap, they collapse into a
    // single numbered cluster bubble instead — expands back into pins (or
    // spiderfies, if still zoomed in at max) once you zoom/tap in.
    var clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      iconCreateFunction: function (cluster) {
        return L.divIcon({
          className: '',
          html: '<div class="cluster-pin">' + cluster.getChildCount() + '</div>',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
      },
    });

    points.forEach(function (p) {
      var icon = L.divIcon({
        className: '',
        html: '<div class="star-pin' + (p.id === selectedId ? ' selected' : '') + '">' + '★'.repeat(p.stars) + '</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      var marker = L.marker([p.lat, p.lng], { icon: icon });
      marker.bindPopup(
        '<div class="popup-title">' + p.name + '</div>' +
        '<div class="popup-meta">' + p.city + ' · ' + (p.cuisine || '') + ' · ' + '★'.repeat(p.stars) + '</div>'
      );
      marker.on('click', function () { notifyParent(p.id); });
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    if (points.length > 0) {
      var bounds = L.latLngBounds(points.map(function (p) { return [p.lat, p.lng]; }));
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
    } else {
      map.setView([20, 0], 2);
    }
  </script>
</body>
</html>`;
}
