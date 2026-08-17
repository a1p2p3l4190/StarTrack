// avatarStorage.js — profile-photo-specific wrapper around photoStorage.js.
import { pickImage, uploadImage } from './photoStorage';

export async function pickAvatar() {
  return pickImage({ aspect: [1, 1] });
}

export async function uploadAvatarImage(uri, userId = 'user') {
  return uploadImage(uri, 'avatars', userId);
}
