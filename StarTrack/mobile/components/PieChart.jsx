// components/PieChart.jsx
// Donut chart drawn with react-native-svg using the stacked-stroke-dasharray
// technique (no extra charting dependency, same approach as RadarChart.jsx).
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

// data: [{ label, value, color }]
export default function PieChart({ data, size = 160, strokeWidth = 22, trackColor = '#1c1c22' }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offsetSoFar = 0;
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const fraction = total > 0 ? d.value / total : 0;
      const sliceLength = fraction * circumference;
      const slice = {
        ...d,
        fraction,
        dashArray: `${sliceLength} ${circumference - sliceLength}`,
        dashOffset: -offsetSoFar,
      };
      offsetSoFar += sliceLength;
      return slice;
    });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation={-90} originX={cx} originY={cy}>
          <Circle cx={cx} cy={cy} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
          {slices.map((slice) => (
            <Circle
              key={slice.label}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={slice.dashArray}
              strokeDashoffset={slice.dashOffset}
              strokeLinecap="butt"
            />
          ))}
        </G>
      </Svg>

      <View style={{ marginLeft: 18, flex: 1 }}>
        {total === 0 && (
          <Text style={{ color: '#6b6b70', fontSize: 13 }}>No verified check-ins yet.</Text>
        )}
        {slices.map((slice) => (
          <View key={slice.label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: slice.color, marginRight: 8 }} />
            <Text style={{ color: '#e8dfd2', fontSize: 13, flex: 1 }}>{slice.label}</Text>
            <Text style={{ color: '#c4b9a8', fontSize: 12 }}>{Math.round(slice.fraction * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
