import { motion, AnimatePresence } from 'motion/react';
import { useMemo } from 'react';
import { Checkpoint, OverlayConfig } from '../types';
import { formatTime, cn } from '../lib/utils';

interface CheckpointOverlayProps {
  checkpoints: Checkpoint[];
  currentTime: number;
  activeCheckpointIndex: number;
  config: OverlayConfig;
  totalCycleTime: number;
}

export default function CheckpointOverlay({ 
  checkpoints, 
  currentTime, 
  activeCheckpointIndex,
  config,
  totalCycleTime
}: CheckpointOverlayProps) {
  const sortedCheckpoints = useMemo(() => 
    [...checkpoints].sort((a, b) => a.time - b.time),
    [checkpoints]
  );

  const firstCheckpointTime = sortedCheckpoints.length > 0 ? sortedCheckpoints[0].time : 0;

  // We want to show the previous, active, and next checkpoints in a drum-roll style
  const visibleIndices = useMemo(() => {
    const indices = [];
    if (activeCheckpointIndex > 0) indices.push(activeCheckpointIndex - 1);
    if (activeCheckpointIndex !== -1) indices.push(activeCheckpointIndex);
    if (activeCheckpointIndex < sortedCheckpoints.length - 1) indices.push(activeCheckpointIndex + 1);
    return indices;
  }, [activeCheckpointIndex, sortedCheckpoints.length]);

  if (sortedCheckpoints.length === 0) return (
    <div 
      className="pointer-events-none flex flex-col items-center justify-center overflow-visible"
      style={{ 
        fontFamily: config.panel.fontFamily,
        minWidth: config.panel.width ? `${config.panel.width}px` : '320px',
        minHeight: config.panel.height ? `${config.panel.height}px` : '160px',
      }}
    />
  );

  return (
    <div 
      className="pointer-events-none flex flex-col items-center justify-center overflow-visible"
      style={{ 
        fontFamily: config.panel.fontFamily,
        minWidth: config.panel.width ? `${config.panel.width}px` : '320px',
        minHeight: config.panel.height ? `${config.panel.height}px` : '160px',
      }}
    >
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        <AnimatePresence mode="popLayout">
          {visibleIndices.map((idx) => {
            const cp = sortedCheckpoints[idx];
            const isActive = idx === activeCheckpointIndex;
            const isPrevious = idx < activeCheckpointIndex;
            const isNext = idx > activeCheckpointIndex;
            const nextCp = sortedCheckpoints[idx + 1];

            const startTime = cp.time - firstCheckpointTime;
            const stateDuration = isActive 
              ? Math.max(0, currentTime - cp.time)
              : (isPrevious && nextCp ? nextCp.time - cp.time : 0);

            return (
              <motion.div
                key={cp.id}
                layout
                initial={{ opacity: 0, y: isNext ? 30 : -30, scale: 0.9, filter: 'blur(10px)' }}
                animate={{ 
                  opacity: isActive ? 1 : 0.75, 
                  y: 0,
                  scale: isActive ? 1 : 0.9,
                  filter: isActive ? 'blur(0px)' : 'blur(0px)'
                }}
                exit={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={cn(
                  "w-full px-6 py-4 rounded-xl flex items-center justify-between gap-4 border transition-colors duration-500 my-1",
                  isActive ? "bg-orange-500/10 border-orange-500/40" : "bg-neutral-800/50 border-neutral-700/50 backdrop-blur-md"
                )}
                style={{ 
                  color: isActive ? config.panel.textColor : undefined, 
                  fontSize: isActive ? `${config.panel.fontSize + 2}px` : `${Math.max(10, config.panel.fontSize - 4)}px`,
                  boxShadow: isActive ? '0 20px 40px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.1)' : 'none'
                }}
              >
                <div className="flex items-center gap-4 w-full">
                  <span 
                    className="text-xs font-black transition-colors shrink-0"
                    style={{ color: isActive ? config.panel.textColor : undefined, opacity: isActive ? 1 : 0.5 }}
                  >
                    {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                  </span>
                  
                  <span 
                    className={cn(
                      "flex-1 font-bold tracking-tight transition-all whitespace-normal break-words leading-tight",
                      !isActive && "italic text-neutral-400 opacity-80"
                    )}
                    style={{ color: isActive ? config.panel.textColor : undefined, fontSize: isActive ? `${config.panel.fontSize + 4}px` : undefined }}
                  >
                    {cp.stateName}
                  </span>

                  <div className={cn(
                    "font-mono transition-opacity flex flex-col items-end shrink-0",
                    isActive ? "opacity-100" : "opacity-80"
                  )}>
                    {isActive ? (
                      <>
                        <span className="text-[10px] opacity-60 font-black uppercase tracking-widest leading-none mb-1" style={{ color: config.panel.textColor }}>State Time</span>
                        <span className="font-bold" style={{ fontSize: `${config.panel.fontSize + 4}px`, color: config.panel.textColor }}>{formatTime(stateDuration)}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: config.panel.textColor, opacity: 0.5 }} className="text-[8px] font-black uppercase tracking-widest leading-none mb-1">
                          {isPrevious ? "Duration" : "Start Time"}
                        </span>
                        <span style={{ color: config.panel.textColor, opacity: 0.7 }} className="font-mono">{formatTime(isPrevious ? stateDuration : startTime)}</span>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Widget Label */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-6 text-[8px] font-black uppercase tracking-[0.4em] text-orange-500/60 flex items-center gap-2"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
        Status Roll Viewer
      </motion.div>
    </div>
  );
}
