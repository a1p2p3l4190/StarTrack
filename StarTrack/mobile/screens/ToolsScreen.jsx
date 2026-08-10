// screens/ToolsScreen.jsx
import React, { useEffect, useState } from 'react';
import { Text, TextInput, View, Pressable, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
import { styles } from '../styles';
import { api } from '../api';

export default function ToolsScreen({
  total, setTotal, tax, setTax, tip, setTip, people, setPeople, billDetails, onSharePress
}) {
  const [wishlist, setWishlist] = useState([]);
  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    api.wishlist()
      .then((data) => setWishlist(data.wishlist || []))
      .catch((err) => console.warn('Failed to load wishlist', err.message));
  }, []);

  const addWishlistItem = async () => {
    if (!newName.trim()) return;
    try {
      const item = await api.addWishlist({ restaurant_name: newName.trim(), note: newNote.trim() });
      setWishlist((prev) => [item, ...prev]);
      setNewName('');
      setNewNote('');
    } catch (err) {
      Alert.alert('Could not add to wishlist', err.message);
    }
  };

  const removeWishlistItem = async (id) => {
    try {
      await api.removeWishlist(id);
      setWishlist((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      Alert.alert('Could not remove item', err.message);
    }
  };

  return (
    // FIX 1: Keyboard Avoiding View with a continuous tap dismiss interceptor keeps inputs visible during input cycles
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View>
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Convivial Split Utility</Text>
              <View style={styles.splitterCard}>

                <View style={styles.inputGrid}>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Subtotal ($)</Text>
                    <TextInput
                      style={styles.input}
                      value={total}
                      onChangeText={setTotal}
                      keyboardType="numeric"
                      placeholderTextColor="#555"
                      returnKeyType="done"
                    />
                  </View>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>People</Text>
                    <TextInput
                      style={styles.input}
                      value={people}
                      onChangeText={setPeople}
                      keyboardType="number-pad"
                      placeholderTextColor="#555"
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <View style={styles.inputGrid}>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Tax (%)</Text>
                    <TextInput
                      style={styles.input}
                      value={tax}
                      onChangeText={setTax}
                      keyboardType="numeric"
                      placeholderTextColor="#555"
                      returnKeyType="done"
                    />
                  </View>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Tip (%)</Text>
                    <TextInput
                      style={styles.input}
                      value={tip}
                      onChangeText={setTip}
                      keyboardType="numeric"
                      placeholderTextColor="#555"
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <View style={styles.receiptVisualCard}>
                  <Text style={styles.receiptHeader}>AURUM INSPIRED RECEIPT</Text>
                  <View style={styles.receiptRow}><Text style={styles.receiptLabel}>Subtotal</Text><Text style={styles.receiptValue}>${billDetails.subtotal}</Text></View>
                  <View style={styles.receiptRow}><Text style={styles.receiptLabel}>Tax & Gratuity</Text><Text style={styles.receiptValue}>+${(parseFloat(billDetails.taxTotal) + parseFloat(billDetails.tipTotal)).toFixed(2)}</Text></View>
                  <View style={styles.receiptDivider} />
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptTotalLabel}>Grand Total</Text>
                    <Text style={styles.receiptTotalValue}>${billDetails.grandTotal}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.shareAmountLabel}>Each Pays</Text>
                    <Text style={styles.shareAmountValue}>${billDetails.perPerson}</Text>
                  </View>

                  <Pressable style={styles.copyShareButton} onPress={onSharePress}>
                    <Text style={styles.copyShareButtonText}>📋 Share Elegant Breakdowns</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.rowSection}>
              <View style={styles.splitCard}>
                <Text style={styles.sectionHeading}>Reservation Alerts</Text>
                {wishlist.map((item) => (
                  <Pressable key={item.id} style={styles.wishItem} onLongPress={() => removeWishlistItem(item.id)}>
                    <Text style={styles.wishName}>{item.restaurant_name}</Text>
                    <Text style={styles.wishSub}>{item.note || 'Awaiting release details'}</Text>
                  </Pressable>
                ))}
                <View style={{ marginTop: wishlist.length ? 12 : 0 }}>
                  <TextInput
                    style={[styles.input, { marginBottom: 8, height: 38 }]}
                    placeholder="Restaurant name"
                    placeholderTextColor="#555"
                    value={newName}
                    onChangeText={setNewName}
                  />
                  <TextInput
                    style={[styles.input, { marginBottom: 8, height: 38 }]}
                    placeholder="Note (e.g. Next release: 1 May)"
                    placeholderTextColor="#555"
                    value={newNote}
                    onChangeText={setNewNote}
                  />
                  <Pressable style={[styles.copyShareButton, { marginTop: 0, paddingVertical: 8 }]} onPress={addWishlistItem}>
                    <Text style={styles.copyShareButtonText}>+ Add to Wishlist</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.splitCard}>
                <Text style={styles.sectionHeading}>Star Map</Text>
                <Text style={styles.starMapText}>Share your badge wall with friends and control privacy settings.</Text>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
