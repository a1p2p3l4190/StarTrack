// components/RadarChart.jsx
// Lightweight spider/radar chart drawn with react-native-svg — no extra
// charting dependency needed since react-native-svg is already a project
// dependency (used by RestaurantMap's marker icons).
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Polygon, Line, Circle } from 'react-native-svg';

const RINGS = 4; // grid rings drawn at 25/50/75/100% of radius

function pointOnAxis(cx, cy, radius, angle, fraction) {
  const r = radius * fraction;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function polygonPoints(cx, cy, radius, angles, fraction) {
  return angles
    .map((angle) => {
      const p = pointOnAxis(cx, cy, radius, angle, fraction);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

// data: [{ label, value }] with value on a 0-100 scale.
export default function RadarChart({ data, size = 240, color = '#d2a14c', gridColor = '#2a2a30' }) {
  const n = data.length;
  const padding = 34; // room for axis labels outside the plotted radius
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - padding;
  const angles = data.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / n);

  const dataPoints = data.map((d, i) => pointOnAxis(cx, cy, radius, angles[i], Math.max(0, Math.min(100, d.value)) / 100));
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {Array.from({ length: RINGS }).map((_, ringIndex) => (
          <Polygon
            key={ringIndex}
            points={polygonPoints(cx, cy, radius, angles, (ringIndex + 1) / RINGS)}
            fill="none"
            stroke={gridColor}
            strokeWidth={1}
          />
        ))}

        {angles.map((angle, i) => {
          const outer = pointOnAxis(cx, cy, radius, angle, 1);
          return <Line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke={gridColor} strokeWidth={1} />;
        })}

        <Polygon points={dataPolygon} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2} />

        {dataPoints.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={color} />
        ))}
      </Svg>

      {/* Labels are plain RN Text positioned around the ring — simpler and
          more legible at small sizes than SVG <Text>, and it wraps normally
          for longer cuisine names. */}
      <View style={{ position: 'absolute', width: size, height: size }}>
        {angles.map((angle, i) => {
          const labelPoint = pointOnAxis(cx, cy, radius, angle, 1.28);
          return (
            <Text
              key={i}
              style={{
                position: 'absolute',
                left: labelPoint.x - 34,
                top: labelPoint.y - 8,
                width: 68,
                textAlign: 'center',
                color: '#c4b9a8',
                fontSize: 11,
                fontWeight: '600',
              }}
              numberOfLines={1}
            >
              {data[i].label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}
