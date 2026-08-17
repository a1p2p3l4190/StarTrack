// photoStorage.js — generic image pick/save/upload used by both profile
// avatars (avatarStorage.js) and review photos. Extracted so a second photo
// use case doesn't mean copy-pasting the whole avatar flow.
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

function directoryFor(kind) {
  return `${FileSystem.documentDirectory}${kind}/`;
}

async function ensureDirectory(dir) {
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function pickImage({ aspect } = {}) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permission to access photos is required.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect,
    quality: 0.82,
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return result.assets[0].uri;
}

// Picks any number of images at once (up to selectionLimit). Multi-select
// mode doesn't support the crop/edit UI, so unlike pickImage there's no
// `aspect` option here.
export async function pickImages({ selectionLimit = 6 } = {}) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permission to access photos is required.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit,
    quality: 0.82,
  });

  if (result.canceled || !result.assets?.length) {
    return [];
  }

  return result.assets.map((asset) => asset.uri);
}

export async function saveImageLocally(uri, kind, id = 'item') {
  if (!uri) return null;
  // expo-file-system's directory/copy APIs have no web implementation at
  // all (they throw "not available on web"). The picker already hands back
  // a data: URI on web, which is directly usable as-is — nothing to copy.
  if (Platform.OS === 'web') return uri;

  const dir = directoryFor(kind);
  await ensureDirectory(dir);

  const ext = uri.split('.').pop()?.split('?')[0] || 'jpg';
  const fileName = `${id}-${Date.now()}.${ext}`;
  const dest = `${dir}${fileName}`;

  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

// Saves locally first (always works, no network/credentials needed), then
// tries a best-effort upload to imgbb if EXPO_PUBLIC_IMGBB_API_KEY is set —
// falls back to the local copy's URI on any failure so the feature still
// works end-to-end without cloud credentials configured.
export async function uploadImage(uri, kind, id = 'item') {
  const localUri = await saveImageLocally(uri, kind, id);

  const cloudKey = process.env.EXPO_PUBLIC_IMGBB_API_KEY;
  if (!cloudKey || !uri) {
    return { localUri, remoteUrl: localUri || uri || null };
  }

  const formData = new FormData();
  const fileName = `${id}-${Date.now()}.jpg`;
  formData.append('key', cloudKey);
  // React Native's fetch needs the {uri, name, type} object form to attach
  // an actual file to multipart data — a plain string just sends the local
  // path as literal text, not the image bytes. Web has no such object; its
  // FormData accepts the data: URI string directly.
  formData.append('image', Platform.OS === 'web' ? uri : { uri, name: fileName, type: 'image/jpeg' });
  formData.append('name', fileName);

  try {
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.data?.url) {
      return { localUri, remoteUrl: localUri || uri || null };
    }

    return { localUri, remoteUrl: payload.data.url };
  } catch (err) {
    // Network failure during the cloud upload shouldn't lose the photo —
    // fall back to the local copy already saved above.
    return { localUri, remoteUrl: localUri || uri || null };
  }
}

// Uploads a batch of picked URIs one at a time (each already falls back to
// its local copy on failure, so a single bad upload can't drop the rest).
export async function uploadImages(uris, kind, id = 'item') {
  const results = [];
  for (const uri of uris) {
    results.push(await uploadImage(uri, kind, id));
  }
  return results;
}
