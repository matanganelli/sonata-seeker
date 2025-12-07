import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { MidiData, SonataSectionData } from '@/types/midi';

interface PianoRollProps {
  midiData: MidiData;
  sections?: SonataSectionData[];
  currentTime?: number;
}

const SECTION_COLORS: Record<string, string> = {
  'introduction': 'rgba(100, 100, 100, 0.3)',
  'exposition-theme1': 'rgba(59, 130, 246, 0.3)',
  'exposition-transition': 'rgba(59, 130, 246, 0.2)',
  'exposition-theme2': 'rgba(59, 130, 246, 0.4)',
  'exposition-closing': 'rgba(59, 130, 246, 0.25)',
  'development': 'rgba(245, 158, 11, 0.3)',
  'recapitulation-theme1': 'rgba(168, 85, 247, 0.3)',
  'recapitulation-transition': 'rgba(168, 85, 247, 0.2)',
  'recapitulation-theme2': 'rgba(168, 85, 247, 0.4)',
  'recapitulation-closing': 'rgba(168, 85, 247, 0.25)',
  'coda': 'rgba(34, 197, 94, 0.3)',
};

export function PianoRoll({ midiData, sections = [], currentTime }: PianoRollProps) {
  const allNotes = useMemo(() => {
    return midiData.tracks.flatMap(track => track.notes);
  }, [midiData]);

  const { minNote, maxNote, duration } = useMemo(() => {
    if (allNotes.length === 0) {
      return { minNote: 21, maxNote: 108, duration: 0 };
    }
    const midiValues = allNotes.map(n => n.midi);
    return {
      minNote: Math.max(21, Math.min(...midiValues) - 2),
      maxNote: Math.min(108, Math.max(...midiValues) + 2),
      duration: midiData.duration,
    };
  }, [allNotes, midiData.duration]);

  const noteRange = maxNote - minNote + 1;
  const noteHeight = 100 / noteRange;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full h-80 bg-card/50 backdrop-blur-sm rounded-xl border border-border overflow-hidden relative"
    >
      {/* Section backgrounds */}
      {sections.map((section, idx) => (
        <div
          key={idx}
          className="absolute top-0 bottom-0 transition-opacity duration-300"
          style={{
            left: `${(section.startTime / duration) * 100}%`,
            width: `${((section.endTime - section.startTime) / duration) * 100}%`,
            backgroundColor: SECTION_COLORS[section.type] || 'rgba(100, 100, 100, 0.2)',
          }}
        />
      ))}

      {/* Grid lines */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: Math.ceil(noteRange / 12) }).map((_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-border/30"
            style={{ top: `${(i * 12 * noteHeight)}%` }}
          />
        ))}
      </div>

      {/* Notes */}
      <svg className="w-full h-full" preserveAspectRatio="none">
        {allNotes.map((note, idx) => {
          const x = (note.time / duration) * 100;
          const width = Math.max((note.duration / duration) * 100, 0.3);
          const y = ((maxNote - note.midi) / noteRange) * 100;
          
          return (
            <motion.rect
              key={idx}
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: idx * 0.001, duration: 0.3 }}
              x={`${x}%`}
              y={`${y}%`}
              width={`${width}%`}
              height={`${noteHeight}%`}
              rx="2"
              className="fill-primary"
              style={{
                opacity: 0.6 + note.velocity * 0.4,
              }}
            />
          );
        })}
      </svg>

      {/* Current time indicator */}
      {currentTime !== undefined && (
        <motion.div
          className="absolute top-0 bottom-0 w-0.5 bg-primary glow-primary"
          style={{ left: `${(currentTime / duration) * 100}%` }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}

      {/* Piano keys on the left */}
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-card/80 border-r border-border flex flex-col">
        {Array.from({ length: noteRange }).map((_, i) => {
          const noteNum = maxNote - i;
          const isBlack = [1, 3, 6, 8, 10].includes(noteNum % 12);
          return (
            <div
              key={i}
              className={`flex-1 ${isBlack ? 'bg-secondary' : 'bg-card border-b border-border/20'}`}
              style={{ minHeight: `${noteHeight}%` }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}
