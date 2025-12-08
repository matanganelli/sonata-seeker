export interface MidiNote {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  name: string;
}

export interface MidiTrack {
  name: string;
  notes: MidiNote[];
  instrument: string;
}

export interface MidiData {
  name: string;
  duration: number;
  tracks: MidiTrack[];
  tempos: { bpm: number; time: number }[];
  timeSignatures: { timeSignature: number[]; time: number }[];
}

export type SonataSection = 
  | 'introduction'
  | 'exposition-theme1'
  | 'exposition-transition'
  | 'exposition-theme2'
  | 'exposition-closing'
  | 'development'
  | 'recapitulation-theme1'
  | 'recapitulation-transition'
  | 'recapitulation-theme2'
  | 'recapitulation-closing'
  | 'coda';

export interface SonataSectionData {
  type: SonataSection;
  startTime: number;
  endTime: number;
  confidence: number;
  description: string;
  musicalKey?: string;
}

export interface SonataAnalysis {
  sections: SonataSectionData[];
  overallConfidence: number;
  summary: string;
  musicalInsights: string[];
}

export interface AIInsights {
  enhancedInsights: string[];
  historicalContext: string;
  technicalAnalysis: string;
}
