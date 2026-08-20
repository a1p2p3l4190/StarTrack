import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

const paths = {
  explore: <><Circle cx="12" cy="12" r="8.5" /><Path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  passport: <><Path d="M5 4.5h14v15H5z" /><Path d="M8 8h8M8 12h5M8 16h3" /></>,
  tools: <><Rect x="4" y="4" width="16" height="16" rx="2" /><Path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></>,
  profile: <><Circle cx="12" cy="8" r="3.5" /><Path d="M5 20c.8-3.3 3.1-5 7-5s6.2 1.7 7 5" /></>,
  bell: <><Path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></>,
  search: <><Circle cx="11" cy="11" r="6.5" /><Path d="m16 16 5 5" /></>,
  filter: <><Path d="M4 6h16M4 12h16M4 18h16" /><Circle cx="9" cy="6" r="2" fill="#09090d" /><Circle cx="15" cy="12" r="2" fill="#09090d" /><Circle cx="11" cy="18" r="2" fill="#09090d" /></>,
  nfc: <><Path d="M8 8a5.7 5.7 0 0 1 0 8M11 5a10 10 0 0 1 0 14M16 8a5.7 5.7 0 0 0 0 8" /><Circle cx="13" cy="12" r="1.2" /></>,
};

export default function AppIcon({ name, size = 20, color = '#8e8982', strokeWidth = 1.8 }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">{paths[name]}</Svg>;
}
