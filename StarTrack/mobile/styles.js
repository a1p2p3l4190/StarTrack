// styles.js
import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090d',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 130, // Safely clears space for the pill-shaped FAB
  },
  hero: {
    paddingHorizontal: 20,
    // Compact header with enough room below the native status bar.
    paddingTop: 32,
    paddingBottom: 4,
    marginBottom: 4,
  },
  title: {
    color: '#f8f1e6',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 1,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeading: {
    color: '#f7e8d3',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  brandGold: {
    color: '#d2a14c',
  },
  brandGoldSoft: {
    color: '#f8d8a3',
  },
  segmentControl: {
    flexDirection: 'row',
    borderRadius: 14,
    backgroundColor: '#111216',
    borderWidth: 1,
    borderColor: '#27272d',
    overflow: 'hidden',
    marginBottom: 16,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentActive: {
    backgroundColor: '#1e1f26',
  },
  segmentLabel: {
    color: '#767885',
    fontSize: 14,
    fontWeight: '600',
  },
  segmentLabelActive: {
    color: '#f6f0e7',
  },
  filters: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  badge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#111217',
    borderWidth: 1,
    borderColor: '#1d1e24',
    marginRight: 8,
  },
  badgeActive: {
    backgroundColor: '#d2a14c',
    borderColor: '#d2a14c',
  },
  badgeLabel: {
    color: '#b9b1a8',
    fontSize: 12,
    fontWeight: '600',
  },
  badgeLabelActive: {
    color: '#09090d',
    fontWeight: '700',
  },

  // Search bar styling
  searchBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#111216',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252731',
    paddingHorizontal: 14,
    height: 44,
    alignItems: 'center',
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
    fontSize: 16,
  },
  searchTextInput: {
    flex: 1,
    color: '#f6f0e7',
    fontSize: 14,
  },

  // Active filter helper toast status bar
  statusIndicatorBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#171613',
    borderColor: '#322718',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  statusIndicatorText: {
    color: '#d2a14c',
    fontSize: 12,
    fontWeight: '600',
  },
  statusClearText: {
    color: '#ff6b6b',
    fontSize: 12,
    fontWeight: '700',
  },

  // Modal drawer overlay styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalDrawer: {
    backgroundColor: '#111216',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: '#252731',
  },

  cardList: {
    gap: 14,
  },
  restaurantCard: {
    backgroundColor: '#121317',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1d1e24',
    marginBottom: 12,
  },
  restaurantCardSelected: {
    borderColor: '#d2a14c',
    backgroundColor: '#171613',
  },
  restaurantCardContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  restaurantCardImage: {
    width: 88,
    height: 88,
    borderRadius: 14,
    marginRight: 12,
    backgroundColor: '#1b1d24',
  },
  restaurantCardImagePlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 14,
    marginRight: 12,
    backgroundColor: '#1b1d24',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2d35',
  },
  restaurantCardImagePlaceholderText: {
    color: '#d2a14c',
    fontSize: 24,
    fontWeight: '800',
  },
  restaurantCardBody: {
    flex: 1,
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  restaurantName: {
    color: '#f8f0e9',
    fontSize: 16,
    fontWeight: '700',
  },
  starRating: {
    color: '#d2a14c',
    fontSize: 13,
    letterSpacing: 2,
  },
  restaurantMeta: {
    color: '#8e8982',
    fontSize: 13,
  },
  restaurantInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  restaurantInfoPill: {
    color: '#f5dec0',
    backgroundColor: '#1d1a15',
    borderColor: '#3b2e1d',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  mapContainer: {
    height: 420,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a31',
    backgroundColor: '#131417',
  },
  passportHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  passportProgress: {
    color: '#d2a14c',
    fontSize: 13,
    fontWeight: '700',
  },
  passportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor: '#121317',
    padding: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1d1e24',
  },
  passportCell: {
    width: (width - 68) / 4 - 8,
    height: (width - 68) / 4 - 8,
    backgroundColor: '#1a1b22',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252731',
  },
  passportCellVerified: {
    backgroundColor: '#262015',
    borderColor: '#b76e38',
  },
  passportCellGold: {
    backgroundColor: '#2d2310',
    borderColor: '#d2a14c',
  },
  passportCellText: {
    color: '#5a5d6e',
    fontSize: 13,
    fontWeight: '700',
  },
  passportCellTextVerified: {
    color: '#d2a14c',
    fontSize: 14,
    fontWeight: '900',
  },
  lockIcon: {
    fontSize: 8,
    position: 'absolute',
    top: 4,
    right: 4,
  },

  // BUG FIXED: Added missing passportMuted configuration styles
  passportMuted: {
    backgroundColor: '#141418',
    borderColor: '#232328',
    borderWidth: 1,
  },

  chartCard: {
    backgroundColor: '#131417',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#24242c',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartLabel: {
    color: '#e8dfd2',
    fontSize: 13,
    width: 70,
  },
  chartBarBackground: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#16171d',
    overflow: 'hidden',
    marginHorizontal: 12,
  },
  chartBarFill: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#d39753',
  },
  chartValue: {
    color: '#c4b9a8',
    fontSize: 12,
    width: 35,
    textAlign: 'right',
  },

  // BUG FIXED: Injected missing Utilities Screen styling components
  rowSection: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    marginTop: 20,
  },
  splitCard: {
    flex: 1,
    backgroundColor: '#121317',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#23232a',
  },
  wishItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222228',
  },
  wishCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wishImage: {
    width: 62,
    height: 62,
    borderRadius: 12,
    marginRight: 12,
  },
  wishImagePlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: '#1a1b22',
    borderWidth: 1,
    borderColor: '#2b2e37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishImagePlaceholderText: {
    color: '#d2a14c',
    fontSize: 20,
    fontWeight: '800',
  },
  wishContent: {
    flex: 1,
  },
  wishName: {
    color: '#f3e8d8',
    fontSize: 15,
    fontWeight: '700',
  },
  wishSub: {
    color: '#bfb8ad',
    fontSize: 12,
    marginTop: 2,
  },
  wishMeta: {
    color: '#d8b57a',
    fontSize: 12,
    marginTop: 4,
  },
  starMapText: {
    color: '#c2bab0',
    fontSize: 13,
    lineHeight: 20,
  },

  // BUG FIXED: Cleared duplicate receiptVisualCard styling entry declarations
  splitterCard: {
    backgroundColor: '#121317',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1d1e24',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  inputGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  inputWrapper: {
    flex: 0.48,
  },
  inputLabel: {
    color: '#8a867e',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#1a1b22',
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252731',
    paddingHorizontal: 14,
    color: '#f6f0e7',
  },
  receiptVisualCard: {
    marginTop: 10,
    backgroundColor: '#181410',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d2a14c',
  },
  receiptHeader: {
    color: '#d2a14c',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 12,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  receiptLabel: {
    color: '#a49e94',
    fontSize: 13,
  },
  receiptValue: {
    color: '#f6f0e7',
    fontSize: 13,
    fontWeight: '600',
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#322718',
    marginVertical: 10,
  },
  receiptTotalLabel: {
    color: '#e5d9c9',
    fontSize: 14,
    fontWeight: '700',
  },
  receiptTotalValue: {
    color: '#e5d9c9',
    fontSize: 14,
    fontWeight: '800',
  },
  shareAmountLabel: {
    color: '#d2a14c',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  shareAmountValue: {
    color: '#d2a14c',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  copyShareButton: {
    backgroundColor: '#d2a14c',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  copyShareButtonText: {
    color: '#09090d',
    fontWeight: '800',
    fontSize: 13,
  },
  leaderboardCard: {
    backgroundColor: '#121317',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1d1e24',
  },
  leaderboardCard: {
    backgroundColor: '#121317',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1d1e24',
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1d1e24',
  },
  leaderRank: {
    color: '#b76e38',
    fontSize: 16,
    width: 24,
    fontWeight: '800',
  },
  leaderInfo: {
    flex: 1,
    paddingHorizontal: 12,
  },
  leaderName: {
    color: '#f8f0e9',
    fontWeight: '700',
  },
  leaderRegion: {
    color: '#6e6b64',
    fontSize: 12,
  },
  leaderScore: {
    color: '#e5d9c9',
    fontWeight: '700',
  },

  // UX OPTIMIZATION: Converted FAB to compact side pill displaying locking target contextual name metadata
  floatingNfcButton: {
    position: 'absolute',
    bottom: 95,
    right: 25,
    backgroundColor: '#d2a14c',
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    shadowColor: '#d2a14c',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 999,
  },
  floatingNfcButtonLocked: {
    backgroundColor: '#292a30',
    borderWidth: 1,
    borderColor: '#4a4b53',
    shadowColor: '#000',
    shadowOpacity: 0.2,
  },
  floatingNfcIcon: {
    fontSize: 18,
    color: '#09090d',
    marginRight: 6,
  },
  floatingNfcText: {
    color: '#09090d',
    fontWeight: '800',
    fontSize: 12,
  },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#111216',
    borderTopWidth: 1,
    borderTopColor: '#27272d',
    paddingBottom: 24,
    paddingTop: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b6b70',
    marginTop: 4,
  },
  tabLabelActive: {
    color: '#d2a14c',
  },
});
