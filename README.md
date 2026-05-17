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
