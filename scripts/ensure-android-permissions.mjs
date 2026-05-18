import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const manifestPath = join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!existsSync(manifestPath)) {
  console.warn(`[ensure-android-permissions] AndroidManifest.xml not found at ${manifestPath}. Run \`npm run android:add\` first.`);
  process.exit(0);
}

let manifest = readFileSync(manifestPath, 'utf8');

const permissions = [
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
  '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
];

const permissionName = (permission) => permission.match(/android:name="([^"]+)"/)?.[1];
const missingPermissions = permissions.filter((permission) => {
  const name = permissionName(permission);
  return name && !manifest.includes(`android:name="${name}"`);
});

if (missingPermissions.length === 0) {
  console.log('[ensure-android-permissions] Android permissions are already present.');
} else {
  const insertBlock = `${missingPermissions.map((permission) => `    ${permission}`).join('\n')}\n`;

  if (manifest.includes('<application')) {
    manifest = manifest.replace(/(\s*<application)/, `\n${insertBlock}$1`);
  } else {
    manifest = manifest.replace(/(<manifest[^>]*>)/, `$1\n${insertBlock}`);
  }

  writeFileSync(manifestPath, manifest);
  console.log(`[ensure-android-permissions] Added ${missingPermissions.length} permission(s) to ${manifestPath}.`);
}

const requiredPermissionNames = permissions.map(permissionName).filter(Boolean);
const missingAfterWrite = requiredPermissionNames.filter((name) => !readFileSync(manifestPath, 'utf8').includes(`android:name="${name}"`));

if (missingAfterWrite.length > 0) {
  console.error(`[ensure-android-permissions] Missing required Android permission(s): ${missingAfterWrite.join(', ')}`);
  process.exit(1);
}

console.log(`[ensure-android-permissions] Verified Android permissions: ${requiredPermissionNames.join(', ')}.`);
