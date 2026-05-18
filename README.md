<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e60c242b-07a2-498f-a86f-20efa6fdecc1

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Android APK を GitHub Actions でビルドする

このリポジトリは Capacitor を使って、Vite のビルド成果物（`dist`）から Android の debug APK を作成できます。Android Studio は不要で、GitHub Actions の手動実行だけで APK を作れます。

### スマホから APK を作成してダウンロードする手順

1. スマホのブラウザで、このリポジトリの GitHub ページを開きます。
2. 上部またはメニュー内の **Actions** タブを開きます。
3. workflow 一覧から **Build Android APK** を選択します。
4. **Run workflow** をタップします。
5. 対象ブランチを確認して、もう一度 **Run workflow** をタップします。
6. 実行が完了するまで待ちます。
7. 完了した実行結果を開き、**Artifacts** から **v-check-debug-apk** をダウンロードします。
8. ダウンロードした zip を展開し、中の debug APK（例: `app-debug.apk`）を Android 端末にインストールします。

> Android にインストールする際は、端末側で「提供元不明のアプリ」のインストール許可が必要になる場合があります。

### ローカルで debug APK を作る場合

Node.js、Java、Android SDK が入っている環境では、次のコマンドで debug APK を作成できます。

```bash
npm install
npm run android:debug
```

APK は `android/app/build/outputs/apk/debug/` に出力されます。

### Android 権限の付与

APK ビルド時は `npm run cap:sync` の後半で `scripts/ensure-android-permissions.mjs` が実行され、生成済みの `android/app/src/main/AndroidManifest.xml` に録画と保存に必要な権限を追加します。

追加される主な権限は `CAMERA`、`RECORD_AUDIO`、Android 13 以降向けの `READ_MEDIA_VIDEO` / `READ_MEDIA_IMAGES`、古い Android 向けの `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` です。

### 動画保存方式

動画書き出しは、Web ではブラウザのダウンロードとして保存します。Capacitor ネイティブ実行時は、まず `@capacitor-community/media` で Android/iOS のメディアライブラリ内に `V-Check` アルバムを作成して保存し、失敗した場合は `@capacitor/filesystem` で Documents / Data / Cache / ExternalStorage の順にフォールバック保存します。

保存失敗時は、MIME type、Blob サイズ、保存先ディレクトリ、Capacitor 実行環境、各保存 API のエラー内容を `[VideoExport]` ログとして出力します。
