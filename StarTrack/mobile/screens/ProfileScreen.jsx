import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Alert, ScrollView, Image, ActivityIndicator, Platform } from 'react-native';
import { styles } from '../styles';
import { api, setAuthToken } from '../api';
import { pickAvatar, uploadAvatarImage } from '../avatarStorage';
import InteractivePressable from '../components/InteractivePressable';

const Pressable = InteractivePressable;

const tabs = ['Profile', 'Account', 'Security'];
const regionOptions = ['Global', 'North America', 'United States', 'Chicago', 'New York', 'San Francisco', 'Europe', 'Europe / UK', 'Asia', 'Japan', 'Taiwan', 'Other'];

const renderSettingSection = (title, description, children) => (
  <View style={[styles.splitterCard, { backgroundColor: '#121417' }]}>
    <Text style={styles.sectionHeading}>{title}</Text>
    {description ? (
      <Text style={{ color: '#8e8982', fontSize: 11, lineHeight: 16, marginBottom: 12 }}>{description}</Text>
    ) : null}
    {children}
  </View>
);

export default function ProfileScreen({ currentUser, onUserUpdated, onLogout }) {
  const [activeTab, setActiveTab] = useState('Profile');
  const [displayName, setDisplayName] = useState(currentUser?.display_name || '');
  const [region, setRegion] = useState(currentUser?.region || 'Global');
  const [location, setLocation] = useState(currentUser?.location || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar_url || '');
  const [website, setWebsite] = useState(currentUser?.website || '');
  const [instagram, setInstagram] = useState(currentUser?.instagram || '');
  const [xHandle, setXHandle] = useState(currentUser?.x || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [message, setMessage] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const confirmLogout = () => {
    const logout = async () => {
      await setAuthToken(null);
      onLogout?.();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) logout();
      return;
    }
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);

  useEffect(() => {
    setDisplayName(currentUser?.display_name || '');
    setRegion(currentUser?.region || 'Global');
    setLocation(currentUser?.location || '');
    setBio(currentUser?.bio || '');
    setAvatarUrl(currentUser?.avatar_url || '');
    setWebsite(currentUser?.website || '');
    setInstagram(currentUser?.instagram || '');
    setXHandle(currentUser?.x || '');
  }, [currentUser]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 2500);
    return () => clearTimeout(timer);
  }, [message]);

  const handleAvatarUpload = async () => {
    try {
      setUploadingAvatar(true);
      const photoUri = await pickAvatar();
      if (!photoUri) {
        setUploadingAvatar(false);
        return;
      }

      const { remoteUrl, localUri } = await uploadAvatarImage(photoUri, currentUser?.id || 'user');
      const nextUrl = remoteUrl || localUri || photoUri;
      setAvatarUrl(nextUrl);
      const updated = await api.updateMe({
        avatar_url: nextUrl,
        display_name: displayName.trim(),
        region: region.trim(),
        location: location.trim(),
        bio: bio.trim(),
        website: website.trim(),
        instagram: instagram.trim(),
        x: xHandle.trim(),
      });
      onUserUpdated(updated);
      setMessage('Profile photo saved successfully.');
    } catch (err) {
      Alert.alert('Upload failed', err.message || 'Could not upload the photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveProfile = async () => {
    try {
      const updated = await api.updateMe({
        display_name: displayName.trim(),
        region: region.trim(),
        location: location.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl.trim(),
        website: website.trim(),
        instagram: instagram.trim(),
        x: xHandle.trim(),
      });
      onUserUpdated(updated);
      setMessage('Profile updated successfully.');
    } catch (err) {
      Alert.alert('Profile update failed', err.message);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Missing fields', 'Please fill in both current and new password.');
      return;
    }

    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Password updated successfully.');
    } catch (err) {
      Alert.alert('Password update failed', err.message);
    }
  };

  const requestVerification = async () => {
    try {
      const data = await api.sendVerificationEmail();
      setMessage(data.message || "Verification email sent — check your inbox, then enter the code below.");
    } catch (err) {
      Alert.alert('Verification request failed', err.message);
    }
  };

  const verifyEmail = async () => {
    if (!verifyToken.trim()) {
      Alert.alert('Missing verification token', 'Please paste the verification token to continue.');
      return;
    }

    try {
      const data = await api.verifyEmail({ token: verifyToken.trim() });
      onUserUpdated(data.user);
      setMessage('Email verified successfully.');
      setVerifyToken('');
    } catch (err) {
      Alert.alert('Email verification failed', err.message);
    }
  };

  const requestForgotPassword = async () => {
    try {
      const data = await api.forgotPassword({ email: currentUser?.email || '' });
      setMessage(data.message || 'Reset instructions have been generated.');
    } catch (err) {
      Alert.alert('Password recovery failed', err.message);
    }
  };

  const deleteAccount = async () => {
    if (!deletePassword.trim()) {
      Alert.alert('Confirm password', 'Enter your current password to delete this account.');
      return;
    }

    Alert.alert(
      'Delete account?',
      'This permanently removes your profile and account activity. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteAccount({ password: deletePassword });
              await setAuthToken(null);
              onUserUpdated(null);
            } catch (err) {
              Alert.alert('Delete account failed', err.message);
            }
          },
        },
      ]
    );
  };

  const profileAvatar = avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || currentUser?.email || 'User')}&background=7f6b48&color=fff`;
  const followerCount = currentUser?.followers_count ?? 0;
  const followingCount = currentUser?.following_count ?? 0;

  const renderProfileTab = () => (
    <View style={{ gap: 16 }}>
      <View style={[styles.splitterCard, { padding: 0, overflow: 'hidden', backgroundColor: '#121417' }]}>
        <View style={{ height: 120, backgroundColor: '#1b1b21', justifyContent: 'center', paddingHorizontal: 18 }}>
          <Text style={{ color: '#f9e7c5', fontSize: 18, fontWeight: '800' }}>{displayName || 'Your Name'}</Text>
          <Text style={{ color: '#9a968d', fontSize: 12, marginTop: 4 }}>{location || region || 'City not set'}</Text>
        </View>

        <View style={{ paddingHorizontal: 18, paddingBottom: 18, marginTop: -34 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View style={{ width: 94, height: 94, borderRadius: 47, overflow: 'hidden', borderWidth: 3, borderColor: '#d3a35f', backgroundColor: '#1d1f26' }}>
              <Image source={{ uri: profileAvatar }} style={{ width: '100%', height: '100%' }} />
            </View>

            <Pressable onPress={handleAvatarUpload} style={{ backgroundColor: '#1d1f26', borderWidth: 1, borderColor: '#4d3c21', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}>
              {uploadingAvatar ? <ActivityIndicator color="#d2a14c" /> : <Text style={{ color: '#f6d8a1', fontSize: 12, fontWeight: '700' }}>Edit photo</Text>}
            </Pressable>
          </View>

          <Text style={{ color: '#f3e6d0', fontSize: 22, fontWeight: '800', marginTop: 12 }}>{displayName || currentUser?.display_name || 'Your Name'}</Text>
          <Text style={{ color: '#b0a9a0', fontSize: 12, marginTop: 4 }}>{currentUser?.email || 'you@example.com'}</Text>

          <View style={{ flexDirection: 'row', marginTop: 18, gap: 12 }}>
            <View style={{ flex: 1, backgroundColor: '#17181d', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2a2d34' }}>
              <Text style={{ color: '#f8e8cf', fontSize: 16, fontWeight: '800' }}>{followerCount}</Text>
              <Text style={{ color: '#8e8982', fontSize: 11, marginTop: 3 }}>Followers</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#17181d', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2a2d34' }}>
              <Text style={{ color: '#f8e8cf', fontSize: 16, fontWeight: '800' }}>{followingCount}</Text>
              <Text style={{ color: '#8e8982', fontSize: 11, marginTop: 3 }}>Following</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#17181d', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2a2d34' }}>
              <Text style={{ color: '#f8e8cf', fontSize: 16, fontWeight: '800' }}>{currentUser?.score ?? 0}</Text>
              <Text style={{ color: '#8e8982', fontSize: 11, marginTop: 3 }}>Score</Text>
            </View>
          </View>
        </View>
      </View>

      {renderSettingSection('Public profile', 'Control how people see your identity, location, and story.', (
        <View style={{ width: '100%', gap: 12 }}>
          <Text style={styles.inputLabel}>Display Name</Text>
          <TextInput style={[styles.input, { marginBottom: 2 }]} value={displayName} onChangeText={setDisplayName} placeholder="Display name" />

          <Text style={styles.inputLabel}>Location</Text>
          <TextInput style={[styles.input, { marginBottom: 2 }]} value={location} onChangeText={setLocation} placeholder="Chicago, IL" />

          <Text style={styles.inputLabel}>Region</Text>
          <View style={{ marginBottom: 2 }}>
            <Pressable
              onPress={() => setRegionMenuOpen((prev) => !prev)}
              style={[styles.input, { justifyContent: 'center' }]}
            >
              <Text style={{ color: '#f3e6d0', fontSize: 14 }}>{region || 'Global'}</Text>
            </Pressable>

            {regionMenuOpen ? (
              <View style={{ backgroundColor: '#17181d', borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: '#2a2d34', overflow: 'hidden' }}>
                {regionOptions.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => {
                      setRegion(option);
                      setRegionMenuOpen(false);
                    }}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderBottomWidth: option === regionOptions[regionOptions.length - 1] ? 0 : 1,
                      borderBottomColor: '#2a2d34',
                      backgroundColor: region === option ? '#201d18' : 'transparent',
                    }}
                  >
                    <Text style={{ color: region === option ? '#f6d8a1' : '#e6dfd5', fontSize: 13 }}>{option}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <Text style={styles.inputLabel}>Bio</Text>
          <TextInput style={[styles.input, { marginBottom: 2, height: 96, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} placeholder="Food explorer and Michelin deep-dive collector" multiline />

          <Pressable style={styles.copyShareButton} onPress={saveProfile}>
            <Text style={styles.copyShareButtonText}>Save Public Profile</Text>
          </Pressable>
        </View>
      ))}

      {renderSettingSection('Social links', 'Add links that help people connect with you outside the app.', (
        <View style={{ width: '100%', gap: 12 }}>
          <Text style={styles.inputLabel}>Website</Text>
          <TextInput style={[styles.input, { marginBottom: 2 }]} value={website} onChangeText={setWebsite} placeholder="https://example.com" autoCapitalize="none" />

          <Text style={styles.inputLabel}>Instagram</Text>
          <TextInput style={[styles.input, { marginBottom: 2 }]} value={instagram} onChangeText={setInstagram} placeholder="@yourhandle" autoCapitalize="none" />

          <Text style={styles.inputLabel}>X / Twitter</Text>
          <TextInput style={[styles.input, { marginBottom: 12 }]} value={xHandle} onChangeText={setXHandle} placeholder="@yourhandle" autoCapitalize="none" />

          <Pressable style={styles.copyShareButton} onPress={saveProfile}>
            <Text style={styles.copyShareButtonText}>Save Links</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );

  const renderAccountTab = () => (
    <View style={{ gap: 16 }}>
      {renderSettingSection('Account overview', 'Manage your core identity and account details.', (
        <View style={{ width: '100%', gap: 12 }}>
          <Text style={styles.inputLabel}>Email</Text>
          <View style={[styles.input, { justifyContent: 'center' }]}>
            <Text style={{ color: '#f3e6d0', fontSize: 13 }}>{currentUser?.email || 'you@example.com'}</Text>
          </View>

          <Text style={styles.inputLabel}>Account status</Text>
          <View style={[styles.input, { justifyContent: 'center' }]}>
            <Text style={{ color: currentUser?.email_verified ? '#d7f1d9' : '#f4c7b5', fontSize: 13 }}>
              {currentUser?.email_verified ? 'Verified account' : 'Verification pending'}
            </Text>
          </View>

          <Text style={styles.inputLabel}>Region</Text>
          <View style={[styles.input, { justifyContent: 'center' }]}>
            <Text style={{ color: '#f3e6d0', fontSize: 13 }}>{region || 'Global'}</Text>
          </View>
        </View>
      ))}

      {renderSettingSection('Verification', 'Confirm your identity and unlock trust features.', (
        <View style={{ width: '100%' }}>
          <Text style={{ color: '#aaa49a', fontSize: 12, marginBottom: 12 }}>
            {currentUser?.email_verified ? 'Your email is verified.' : 'Your email is not verified yet.'}
          </Text>
          <Pressable style={[styles.copyShareButton, { marginBottom: 12 }]} onPress={requestVerification}>
            <Text style={styles.copyShareButtonText}>Send Verification Email</Text>
          </Pressable>

          <TextInput
            style={[styles.input, { marginBottom: 12 }]}
            value={verifyToken}
            onChangeText={setVerifyToken}
            placeholder="Code from the email we sent you"
          />

          <Pressable style={[styles.copyShareButton, { backgroundColor: '#1b2a1d' }]} onPress={verifyEmail}>
            <Text style={[styles.copyShareButtonText, { color: '#d7f1d9' }]}>Verify Email</Text>
          </Pressable>
        </View>
      ))}

      {renderSettingSection('Session', 'Manage your current StarTrack session.', (
        <View style={{ width: '100%' }}>
          <Pressable style={[styles.copyShareButton, { backgroundColor: '#2f2d2a' }]} onPress={confirmLogout}>
            <Text style={[styles.copyShareButtonText, { color: '#f7e8d3' }]}>Log Out</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );

  const renderSecurityTab = () => (
    <View style={{ gap: 16 }}>
      {renderSettingSection('Password & login', 'Update how you sign in and recover access to your account.', (
        <View style={{ width: '100%' }}>
          <TextInput style={[styles.input, { marginBottom: 12 }]} value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password" secureTextEntry />
          <TextInput style={[styles.input, { marginBottom: 16 }]} value={newPassword} onChangeText={setNewPassword} placeholder="New password" secureTextEntry />

          <Pressable style={styles.copyShareButton} onPress={changePassword}>
            <Text style={styles.copyShareButtonText}>Update Password</Text>
          </Pressable>

          <Pressable style={[styles.copyShareButton, { marginTop: 12, backgroundColor: '#2f2d2a' }]} onPress={requestForgotPassword}>
            <Text style={[styles.copyShareButtonText, { color: '#f7e8d3' }]}>Forgot Password</Text>
          </Pressable>
        </View>
      ))}

      {renderSettingSection('Danger zone', 'Permanent actions that remove your data or access.', (
        <View style={{ width: '100%' }}>
          <TextInput style={[styles.input, { marginBottom: 16 }]} value={deletePassword} onChangeText={setDeletePassword} placeholder="Current password" secureTextEntry />

          <Pressable style={[styles.copyShareButton, { backgroundColor: '#7d2d2d' }]} onPress={deleteAccount}>
            <Text style={[styles.copyShareButtonText, { color: '#fff' }]}>Delete Account</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
      <View style={{ marginTop: 12 }}>
        <Text style={[styles.sectionHeading, { marginBottom: 10 }]}>Account Center</Text>

        {message ? (
          <View style={{ backgroundColor: '#171613', borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#2a2318' }}>
            <Text style={{ color: '#d2a14c', fontSize: 12 }}>{message}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', backgroundColor: '#101115', borderRadius: 16, borderWidth: 1, borderColor: '#292c34', padding: 5, marginBottom: 16, gap: 4 }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                containerStyle={{ flex: 1 }}
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  paddingHorizontal: 5,
                  borderRadius: 12,
                  backgroundColor: isActive ? '#1e1f26' : 'transparent',
                  borderWidth: isActive ? 1 : 0,
                  borderColor: isActive ? '#3b3426' : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: isActive ? '#f6f0e7' : '#8d8c91', fontSize: 12, letterSpacing: 0.15, fontWeight: '700' }}>{tab}</Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === 'Profile' && renderProfileTab()}
        {activeTab === 'Account' && renderAccountTab()}
        {activeTab === 'Security' && renderSecurityTab()}
      </View>
    </ScrollView>
  );
}
