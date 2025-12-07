import { useState, useCallback } from 'react';
import { Midi } from '@tonejs/midi';
import type { MidiData, MidiTrack } from '@/types/midi';

export function useMidiParser() {
  const [midiData, setMidiData] = useState<MidiData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseMidi = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const midi = new Midi(arrayBuffer);

      const tracks: MidiTrack[] = midi.tracks.map(track => ({
        name: track.name || 'Untitled Track',
        notes: track.notes.map(note => ({
          midi: note.midi,
          time: note.time,
          duration: note.duration,
          velocity: note.velocity,
          name: note.name,
        })),
        instrument: track.instrument.name || 'Unknown',
      }));

      const data: MidiData = {
        name: midi.name || file.name.replace(/\.(mid|midi)$/i, ''),
        duration: midi.duration,
        tracks,
        tempos: midi.header.tempos.map(t => ({ bpm: t.bpm, time: t.time })),
        timeSignatures: midi.header.timeSignatures.map(ts => ({
          timeSignature: ts.timeSignature,
          time: ts.ticks / midi.header.ppq,
        })),
      };

      setMidiData(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao processar arquivo MIDI';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setMidiData(null);
    setError(null);
  }, []);

  return {
    midiData,
    isLoading,
    error,
    parseMidi,
    reset,
  };
}
