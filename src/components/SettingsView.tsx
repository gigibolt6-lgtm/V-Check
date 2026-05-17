import { useState } from 'react';
import { Palette, Type, History, Trash2, Plus, Check, RotateCcw, Globe } from 'lucide-react';
import { OverlayConfig } from '../types';
import { cn } from '../lib/utils';
import { useTranslation, Language } from '../i18n';

interface SettingsViewProps {
  overlayConfig: OverlayConfig;
  setOverlayConfig: (config: OverlayConfig) => void;
  stateNameHistory: string[];
  setStateNameHistory: (history: string[]) => void;
}

export default function SettingsView({
  overlayConfig,
  setOverlayConfig,
  stateNameHistory,
  setStateNameHistory
}: SettingsViewProps) {
  const { t, language, setLanguage } = useTranslation();
  const [newStateName, setNewStateName] = useState('');

  const addHistoryItem = () => {
    if (newStateName.trim() && !stateNameHistory.includes(newStateName.trim())) {
      setStateNameHistory([...stateNameHistory, newStateName.trim()]);
      setNewStateName('');
    }
  };

  const removeHistoryItem = (name: string) => {
    setStateNameHistory(stateNameHistory.filter(n => n !== name));
  };

  const fonts = [
    { name: 'Default Sans', value: '"SF Pro Text", -apple-system, system-ui, sans-serif' },
    { name: 'Monospace', value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
    { name: 'Serif', value: 'Georgia, serif' }
  ];

  return (
    <div className="flex flex-col h-full bg-[#0A0A0B] p-8 overflow-y-auto pb-24">
      <header className="mb-10">
        <h2 className="text-3xl font-black mb-1 uppercase tracking-tighter">{t.navSettings}</h2>
        <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold">{t.generalSettings}</p>
      </header>

      {/* Language Settings */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <Globe className="w-4 h-4 text-orange-500" />
          <h3 className="font-black uppercase tracking-[0.2em] text-[10px] text-white/60">{t.language}</h3>
        </div>
        
        <div className="space-y-4 bg-[#121214] p-6 rounded-3xl border border-white/5 shadow-2xl">
          <p className="text-[10px] text-white/40 tracking-widest uppercase font-bold">{t.languageDesc}</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'en', label: 'English' },
              { id: 'ja', label: '日本語' },
              { id: 'zh', label: '中文' }
            ].map(lang => (
              <button
                key={lang.id}
                onClick={() => setLanguage(lang.id as Language)}
                className={cn(
                  "px-5 py-4 rounded-2xl border text-sm flex justify-between items-center transition-all active:scale-95",
                  language === lang.id 
                    ? "bg-orange-500/10 border-orange-500 text-white shadow-lg shadow-orange-500/10 font-bold" 
                    : "bg-black/40 border-white/5 text-white/40 hover:border-white/20"
                )}
              >
                {lang.label}
                {language === lang.id && <Check className="w-4 h-4 text-orange-500" />}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Overlay Appearance */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <Palette className="w-4 h-4 text-orange-500" />
          <h3 className="font-black uppercase tracking-[0.2em] text-[10px] text-white/60">Overlay Aesthetics</h3>
        </div>
        
        <div className="space-y-8 bg-[#121214] p-6 rounded-3xl border border-white/5 shadow-2xl">
          <div>
            <label className="text-[9px] text-white/20 uppercase tracking-[0.2em] font-black block mb-4">Typography</label>
            <div className="grid grid-cols-1 gap-3">
              {fonts.map(font => (
                <button
                  key={font.value}
                  onClick={() => setOverlayConfig({ 
                    ...overlayConfig, 
                    panel: { ...overlayConfig.panel, fontFamily: font.value },
                    title: { ...overlayConfig.title, fontFamily: font.value },
                    time: { ...overlayConfig.time, fontFamily: font.value },
                  })}
                  className={cn(
                    "px-5 py-4 rounded-2xl border text-sm flex justify-between items-center transition-all active:scale-95",
                    overlayConfig.panel.fontFamily === font.value 
                      ? "bg-orange-500/10 border-orange-500 text-white shadow-lg shadow-orange-500/10 font-bold" 
                      : "bg-black/40 border-white/5 text-white/40 hover:border-white/20"
                  )}
                  style={{ fontFamily: font.value }}
                >
                  {font.name}
                  {overlayConfig.panel.fontFamily === font.value && <Check className="w-4 h-4 text-orange-500" />}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <label className="text-[9px] text-white/20 uppercase tracking-[0.2em] font-black block mb-4">Text Tone (Global)</label>
              <div className="flex items-center gap-4">
                 <input 
                  type="color" 
                  value={overlayConfig.panel.textColor} 
                  onChange={(e) => setOverlayConfig({ 
                    ...overlayConfig, 
                    panel: { ...overlayConfig.panel, textColor: e.target.value },
                    title: { ...overlayConfig.title, textColor: e.target.value },
                    time: { ...overlayConfig.time, textColor: e.target.value } 
                  })}
                  className="w-12 h-12 rounded-xl bg-transparent cursor-pointer border border-white/10 p-1"
                />
                <span className="text-[10px] font-mono font-bold text-white/40">{overlayConfig.panel.textColor}</span>
              </div>
            </div>
            <div>
              <label className="text-[9px] text-white/20 uppercase tracking-[0.2em] font-black block mb-4">Base Matte (Global)</label>
              <div className="flex items-center gap-4">
                 <input 
                  type="color" 
                  value={overlayConfig.panel.bgColor} 
                  onChange={(e) => setOverlayConfig({ 
                    ...overlayConfig, 
                    panel: { ...overlayConfig.panel, bgColor: e.target.value },
                    title: { ...overlayConfig.title, bgColor: e.target.value },
                    time: { ...overlayConfig.time, bgColor: e.target.value }
                  })}
                  className="w-12 h-12 rounded-xl bg-transparent cursor-pointer border border-white/10 p-1"
                />
                <span className="text-[10px] font-mono font-bold text-white/40">Glassmorp</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* State Name History */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <History className="w-4 h-4 text-orange-500" />
          <h3 className="font-black uppercase tracking-[0.2em] text-[10px] text-white/60">State Vocabulary</h3>
        </div>

        <div className="bg-[#121214] p-6 rounded-3xl border border-white/5 shadow-2xl">
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={newStateName}
              onChange={(e) => setNewStateName(e.target.value)}
              placeholder="Add new state..."
              className="flex-1 bg-black border border-white/10 rounded-2xl px-5 py-3 text-sm text-white focus:outline-none focus:border-orange-500 transition-colors"
            />
            <button 
              onClick={addHistoryItem}
              className="w-12 h-12 bg-orange-500 text-black rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-orange-500/20"
            >
              <Plus className="w-6 h-6 " />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {stateNameHistory.map(name => (
              <div 
                key={name}
                className="flex items-center gap-3 px-4 py-2 bg-black border border-white/5 rounded-full group hover:border-white/20 transition-colors shadow-inner"
              >
                <span className="text-xs font-medium text-white/70">{name}</span>
                <button 
                  onClick={() => removeHistoryItem(name)}
                  className="p-1 rounded-full opacity-0 group-hover:opacity-100 text-white/20 hover:text-rose-500 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {stateNameHistory.length > 0 && (
            <button 
              onClick={() => { if(confirm(t.resetHistoryConfirm)) setStateNameHistory(t.defaultStates); }}
              className="mt-10 flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] text-white/20 hover:text-orange-500 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> {t.clearHistory}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
