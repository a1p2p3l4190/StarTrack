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
  pin: <><Path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" /><Circle cx="12" cy="10" r="2.2" /></>,
  calendar: <><Rect x="4" y="5.5" width="16" height="15" rx="2" /><Path d="M8 3.5v4M16 3.5v4M4 10h16" /></>,
  dining: <><Path d="M7 3v8M4.5 3v4a2.5 2.5 0 0 0 5 0V3M7 11v10M16 3v18M16 3c2 2 3 5 0 8" /></>,
  camera: <><Path d="M4 8.5h3l1.5-2h7L17 8.5h3v10H4z" /><Circle cx="12" cy="13.5" r="3" /></>,
  lock: <><Rect x="5" y="10" width="14" height="10" rx="2" /><Path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  message: <><Path d="M5 5h14v10H9l-4 4V5Z" /><Path d="M8 9h8M8 12h5" /></>,
  link: <><Path d="m10 13 4-4M8 16l-2 2a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0M16 8l2-2a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0" /></>,
};

export default function AppIcon({ name, size = 20, color = '#8e8982', strokeWidth = 1.8 }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">{paths[name]}</Svg>;
}
