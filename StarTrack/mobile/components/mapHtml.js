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
    .plate-icon {
      width: 13px; height: 13px; border-radius: 50%;
      border: 1.5px solid #e7be69;
      position: relative;
    }
    .plate-icon::after {
      content: ''; position: absolute; width: 4px; height: 4px;
      border-radius: 50%; background: #e7be69; left: 3.5px; top: 3.5px;
    }
    .dining-icon { position: relative; width: 21px; height: 18px; display: flex; align-items: center; justify-content: center; }
    .dining-svg { width: 29px; height: 29px; display: block; }
    .dining-icon .plate-icon { margin-top: 2px; }
    .fork-icon, .knife-icon { position: absolute; top: 1px; height: 16px; width: 2px; background: #e7be69; border-radius: 2px; }
    .fork-icon { left: 1px; }
    .fork-icon::before { content: '|||'; position: absolute; top: -5px; left: -3px; font-size: 7px; letter-spacing: -2px; color: #e7be69; }
    .knife-icon { right: 1px; width: 2px; }
    .knife-icon::before { content: ''; position: absolute; top: -1px; left: -1px; width: 4px; height: 7px; border-radius: 0 4px 0 0; border-right: 1px solid #e7be69; }
    .star-pin.selected {
      background: linear-gradient(135deg, #f3cd7a 0%, #d2a14c 100%);
      border-color: #ffffff;
      transform: scale(1.25);
    }
    .cluster-pin {
      width: 40px; height: 40px; border-radius: 50%;
      background: rgba(24, 23, 27, 0.94);
      border: 1px solid #d2a14c;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 700; color: #f3cd7a;
      box-shadow: 0 6px 16px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.08);
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
    var selectedMarker = null;

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
      if (p.id === selectedId) selectedMarker = marker;
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    if (selectedId !== null) {
      var selectedPoint = points.find(function (p) { return p.id === selectedId; });
      if (selectedPoint) {
        // Selecting another nearby restaurant should not reset the map to the
        // full-world bounds. Keep the user in the local area instead.
        // Zoom past the clustering threshold so nearby restaurants remain
        // individually tappable after selecting one of them.
        map.setView([selectedPoint.lat, selectedPoint.lng], 16);
        if (selectedMarker) selectedMarker.openPopup();
      }
    } else if (points.length > 0) {
      var bounds = L.latLngBounds(points.map(function (p) { return [p.lat, p.lng]; }));
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
    } else {
      map.setView([20, 0], 2);
    }
  </script>
</body>
</html>`;
}
