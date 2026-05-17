import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'en' | 'ja' | 'zh';

export const translations = {
  en: {
    workProcess: 'Work Process',
    defaultStates: ['Idle', 'Working', 'Completed', 'Error'],
    noVideo: 'No Video',
    noVideoDesc: 'Start recording or import a video file.',
    startRecording: 'Start Recording',
    importFile: 'Import from File',
    navRecord: 'RECORD',
    navEdit: 'EDIT',
    navSettings: 'SETTINGS',
    camUnsupported: 'Camera is not supported in this browser or environment. Try opening the app in a new tab or ensure you are on HTTPS.',
    camDenied: 'Camera and microphone access denied. Please grant permissions and click retry. If you are in preview mode, please open the app in a new tab.',
    camNotFound: 'Camera not found or in use by another app.',
    camError: 'Error occurred while starting the camera: ',
    recordFail: 'Failed to start recording. This browser might not support MediaRecorder.',
    unstate: 'Unset',
    camPermReq: 'Camera and microphone permissions are required for recording. Turn them on in your browser settings. (Tip: Try opening the app in a new tab)',
    retry: 'Retry',
    newState: 'New State',
    csvHeader: 'Number,Name,Time,Total Time',
    seekHint: 'Drag to seek / Double click to add point / Pinch to zoom',
    editPoints: 'EDIT POINTS',
    styling: 'STYLING',
    ffSettings: 'Fast-Forward Settings',
    speedMult: 'Speed Multiplier',
    delaySec: 'Delay Seconds (Wait time after point)',
    done: 'Done',
    rmFf: 'Remove Fast-Forward',
    overlayHint: 'You can adjust positions by dragging the overlay directly on the video.',
    exportDesc: 'Creates an MP4 file with overlay info integrated. The section from the first to the last checkpoint is automatically cropped.',
    matchSource: 'Match Source',
    matchSourceDesc: 'Same resolution as original video',
    transparentExport: 'Transparent Overlay Export (Reliable)',
    transparentExportDesc: 'Outputs only a WebM with a transparent background. Overlay it with the original video in your editing software.',
    mp4Export: 'MP4 Composite (In-browser)',
    mp4ExportDesc: 'Composites with the original video using browser features. May not output well depending on the browser.',
    exportCsv: 'Export Work Time to CSV',
    egWorkProcess: 'e.g. Work Process',
    panel: 'PANEL',
    text: 'TEXT',
    background: 'BACKGROUND',
    resetHistoryConfirm: 'Are you sure you want to reset history?',
    generalSettings: 'General Settings',
    clearHistory: 'Clear History',
    clearHistoryDesc: 'Deletes the history of previously entered state names.',
    clear: 'Clear',
    language: 'Language',
    languageDesc: 'Choose your preferred language.',
    title: 'TITLE',
    time: 'TIME',
    totalTime: 'TOTAL TIME',
    saveProject: 'Save Project',
    saveProjectDesc: 'Download the current project with video (.zip)',
    loadProject: 'Load Project',
    loadProjectDesc: 'Restore project from a .zip or .json file',
    editPoint: 'Edit Point',
    prev: 'Prev',
    next: 'Next',
  },
  ja: {
    workProcess: 'ワークプロセス',
    defaultStates: ['待機', '作業中', '完了', 'エラー'],
    noVideo: '動画がありません',
    noVideoDesc: '録画を開始するか、動画ファイルをインポートしてください。',
    startRecording: '録画を始める',
    importFile: 'ファイルからインポート',
    navRecord: 'レコード',
    navEdit: 'エディット',
    navSettings: '設定',
    camUnsupported: 'お使いの環境ではカメラ機能がサポートされていません。アプリを新しいタブで開くか、HTTPS環境で開いているか確認してください。',
    camDenied: 'カメラとマイクへのアクセスが拒否されました。権限を許可し、再試行してください。プレビュー環境で動作しない場合は、アプリを「新しいタブ」で開いてください。',
    camNotFound: 'カメラが見つからないか、別のアプリで使用中です。',
    camError: 'カメラの起動中にエラーが発生しました: ',
    recordFail: '録画の開始に失敗しました。このブラウザ環境がMediaRecorderに対応していない可能性があります。',
    unstate: '未設定',
    camPermReq: '録画にはカメラとマイクの許可が必要です。ブラウザの設定で権限をオンにしてください。（プレビュー環境の場合、アプリを新しいタブで開くと解決することがあります）',
    retry: '再試行',
    newState: '新規状態',
    csvHeader: 'ナンバー,名称,時間,時間総計',
    seekHint: 'ドラッグでシーク / ダブルクリックでポイント追加 / ピンチでズーム',
    editPoints: 'ポイント編集',
    styling: 'スタイリング',
    ffSettings: '動画短縮設定 (Fast-Forward)',
    speedMult: '倍速度',
    delaySec: 'ディレイ秒数 (ポイント経過後の待機時間)',
    done: '完了',
    rmFf: '短縮を削除',
    overlayHint: 'ビデオ上のオーバーレイを直接ドラッグして位置を調整できます。',
    exportDesc: 'オーバーレイ情報を統合したMP4ファイルを作成します。最初のチェックポイントから最後までの区間が自動的に切り出されます。',
    matchSource: 'Match Source',
    matchSourceDesc: '元の動画と同じ解像度',
    transparentExport: '透過オーバーレイ出力 (確実)',
    transparentExportDesc: '背景が透過されたWebMのみを出力します。編集ソフトで元の動画と重ねてください。',
    mp4Export: 'MP4合成 (ブラウザ内処理)',
    mp4ExportDesc: 'ブラウザの機能を使って元の動画と合成します。ブラウザによっては上手く出力されない場合があります。',
    exportCsv: '作業時間をCSV出力',
    egWorkProcess: 'e.g. ワークプロセス',
    panel: 'パネル',
    text: 'テキスト',
    background: '背景',
    resetHistoryConfirm: '履歴をリセットしますか？',
    generalSettings: '基本設定',
    clearHistory: '履歴のクリア',
    clearHistoryDesc: '過去に入力した状態名の履歴を削除します。',
    clear: 'クリア',
    language: '言語 (Language)',
    languageDesc: '表示言語を選択します。',
    title: 'タイトル',
    time: '時間',
    totalTime: 'TOTAL TIME',
    saveProject: 'プロジェクトを保存',
    saveProjectDesc: '動画と編集状態をZIPとして保存します',
    loadProject: 'プロジェクトを読み込む',
    loadProjectDesc: 'ZIP または JSONファイルから編集状態を復元します',
    editPoint: 'ポイント編集',
    prev: '前へ',
    next: '次へ',
  },
  zh: {
    workProcess: '工作流程',
    defaultStates: ['待机', '工作中', '完成', '错误'],
    noVideo: '没有视频',
    noVideoDesc: '开始录制或导入视频文件。',
    startRecording: '开始录制',
    importFile: '从文件导入',
    navRecord: '录制',
    navEdit: '编辑',
    navSettings: '设置',
    camUnsupported: '您所在的环境不支持相机功能。请尝试在新标签页中打开应用，或确保在 HTTPS 环境下访问。',
    camDenied: '无法访问相机和麦克风。请授予权限并重试。如果您在预览模式下，请尝试在新标签页中打开应用。',
    camNotFound: '未找到相机，或已被其他应用占用。',
    camError: '启动相机时发生错误: ',
    recordFail: '录制开始失败。此浏览器环境可能不支持 MediaRecorder。',
    unstate: '未设置',
    camPermReq: '录制需要相机和麦克风权限。请在浏览器设置中开启它。（提示：尝试在新标签页中打开应用通常能解决权限问题）',
    retry: '重试',
    newState: '新状态',
    csvHeader: '编号,名称,时间,总时间',
    seekHint: '拖动以搜索 / 双击以添加点 / 捏合以缩放',
    editPoints: '编辑节点',
    styling: '样式修改',
    ffSettings: '快进设置 (Fast-Forward)',
    speedMult: '倍速',
    delaySec: '延迟秒数 (节点后的等待时间)',
    done: '完成',
    rmFf: '删除快进',
    overlayHint: '您可以直接在视频上拖动覆盖层以调整位置。',
    exportDesc: '创建集成了覆盖层信息的 MP4 文件。从第一个断点到最后一段的区间将自动裁剪出。',
    matchSource: '匹配源',
    matchSourceDesc: '与原始视频分辨率相同',
    transparentExport: '透明覆盖层导出 (可靠)',
    transparentExportDesc: '仅输出背景透明的 WebM。使用您的视频编辑软件将其与原始视频叠加即可。',
    mp4Export: 'MP4 合成 (浏览器内处理)',
    mp4ExportDesc: '使用浏览器功能将其与原始视频合成。具体的表现可能因浏览器而异。',
    exportCsv: '导出工作时间 CSV',
    egWorkProcess: 'e.g. 工作流程',
    panel: '面板',
    text: '文本',
    background: '背景',
    resetHistoryConfirm: '确定要重置历史记录吗？',
    generalSettings: '基础设置',
    clearHistory: '清除历史',
    clearHistoryDesc: '删除过去输入的状态名称历史。',
    clear: '清除',
    language: '语言 (Language)',
    languageDesc: '选择您偏好的语言。',
    title: '标题',
    time: '时间',
    totalTime: 'TOTAL TIME',
    saveProject: '保存项目',
    saveProjectDesc: '将视频和项目保存为.zip文件',
    loadProject: '加载项目',
    loadProjectDesc: '从.zip或.json文件中恢复项目',
    editPoint: '编辑节点',
    prev: '前一个',
    next: '后一个',
  }
};

export const isDefaultStateName = (name: string) => {
  return Object.values(translations).some(lang => lang.newState === name || lang.unstate === name);
};

type Translations = typeof translations.en;

interface I18nContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextProps | undefined>(undefined);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>('ja');

  useEffect(() => {
    const saved = localStorage.getItem('language') as Language;
    if (saved && translations[saved]) {
      setLanguageState(saved);
    } else {
      const browserLang = (navigator.language || 'ja').slice(0, 2);
      if (browserLang === 'ja' || browserLang === 'zh' || browserLang === 'en') {
        setLanguageState(browserLang as Language);
      } else {
        setLanguageState('en'); // Default to English if OS language is unsupported
      }
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t: translations[language] }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};
