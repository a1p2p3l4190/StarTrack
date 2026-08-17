import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { styles } from '../styles';

const notificationKindStyles = {
  follow: { label: 'Follow', tint: '#75c4ff', accent: '#0d2335' },
  review: { label: 'Review', tint: '#ffd76a', accent: '#2c2515' },
  badge: { label: 'Badge', tint: '#aeffb7', accent: '#122914' },
  reminder: { label: 'Reminder', tint: '#b8a7ff', accent: '#1c1b2d' },
  info: { label: 'Info', tint: '#d4d4d4', accent: '#1b1b1b' },
};

export default function NotificationCenterScreen({
  notifications = [],
  unreadCount = 0,
  loading = false,
  onBack,
  onMarkRead,
  onMarkAllRead,
  onRefresh,
  onExplore,
}) {
  const grouped = notifications.reduce((acc, item) => {
    const kind = item.kind || 'info';
    const bucket = acc[kind] || [];
    bucket.push(item);
    acc[kind] = bucket;
    return acc;
  }, {});

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 16 }}>
        <Pressable onPress={onBack} style={{ paddingVertical: 8 }}>
          <Text style={{ color: '#d2a14c', fontSize: 12, fontWeight: '700' }}>← Back</Text>
        </Pressable>
        <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>Notifications</Text>
        <Pressable onPress={onRefresh} style={{ paddingVertical: 8 }}>
          <Text style={{ color: '#a9b0b5', fontSize: 12, fontWeight: '700' }}>Refresh</Text>
        </Pressable>
      </View>

      <View style={[styles.splitterCard, { backgroundColor: '#111317', padding: 16, marginBottom: 16 }]}>
        <Text style={{ color: '#f8e8cf', fontSize: 22, fontWeight: '800' }}>Inbox</Text>
        <Text style={{ color: '#aaa49a', fontSize: 12, marginTop: 6 }}>
          {unreadCount} unread of {notifications.length} updates
        </Text>
        {unreadCount > 0 && (
          <Pressable onPress={onMarkAllRead} style={{ marginTop: 14, backgroundColor: '#1d2117', borderWidth: 1, borderColor: '#48613e', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: '#d9f8c9', fontSize: 12, fontWeight: '700' }}>Mark all as read</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color="#d2a14c" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={[styles.splitterCard, { backgroundColor: '#111317', padding: 18 }]}>
          <Text style={{ color: '#f8e8cf', fontSize: 15, fontWeight: '700' }}>No alerts yet</Text>
          <Text style={{ color: '#8e8982', fontSize: 12, marginTop: 8 }}>Follow friends, earn badges, and post reviews to get updates here.</Text>
          {onExplore && <Pressable onPress={onExplore} style={styles.copyShareButton}><Text style={styles.copyShareButtonText}>Explore Restaurants</Text></Pressable>}
        </View>
      ) : (
        Object.entries(grouped).map(([kind, items]) => {
          const meta = notificationKindStyles[kind] || notificationKindStyles.info;
          return (
            <View key={kind} style={{ marginBottom: 18 }}>
              <Text style={{ color: '#8e8982', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                {meta.label}
              </Text>
              <View style={{ gap: 10 }}>
                {items.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => onMarkRead && onMarkRead(item.id)}
                    style={{
                      backgroundColor: item.read_at ? '#17181d' : '#141611',
                      borderRadius: 14,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: item.read_at ? '#2a2d34' : meta.tint,
                      shadowColor: item.read_at ? '#000' : meta.tint,
                      shadowOpacity: item.read_at ? 0.15 : 0.25,
                      shadowRadius: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: '#f7e8d3', fontSize: 13, fontWeight: '700' }}>{item.title}</Text>
                      {!item.read_at && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.tint }} />
                      )}
                    </View>
                    <Text style={{ color: '#bdb4aa', fontSize: 12, marginTop: 6, lineHeight: 18 }}>{item.message}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                      <Text style={{ color: meta.tint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{meta.label}</Text>
                      <Text style={{ color: '#8e8982', fontSize: 10, textTransform: 'uppercase' }}>{item.read_at ? 'Read' : 'Unread'}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
