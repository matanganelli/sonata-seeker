import { useState } from 'react';
import { motion } from 'framer-motion';
import { Music2, Sparkles, Wand2 } from 'lucide-react';
import { MidiUploader } from '@/components/MidiUploader';
import { PianoRoll } from '@/components/PianoRoll';
import { SonataStructure } from '@/components/SonataStructure';
import { useMidiParser } from '@/hooks/useMidiParser';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { SonataAnalysis } from '@/types/midi';

// Mock analysis for demo (will be replaced with AI)
function generateMockAnalysis(duration: number): SonataAnalysis {
  const expositionEnd = duration * 0.35;
  const developmentEnd = duration * 0.65;
  const recapEnd = duration * 0.92;

  return {
    sections: [
      {
        type: 'exposition-theme1',
        startTime: 0,
        endTime: expositionEnd * 0.3,
        confidence: 0.85,
        description: 'Primeiro tema na tonalidade principal, apresentando o material temático primário.',
        musicalKey: 'Dó Maior',
      },
      {
        type: 'exposition-transition',
        startTime: expositionEnd * 0.3,
        endTime: expositionEnd * 0.5,
        confidence: 0.75,
        description: 'Passagem modulatória conectando os dois temas principais.',
      },
      {
        type: 'exposition-theme2',
        startTime: expositionEnd * 0.5,
        endTime: expositionEnd * 0.85,
        confidence: 0.82,
        description: 'Segundo tema contrastante, tipicamente na dominante.',
        musicalKey: 'Sol Maior',
      },
      {
        type: 'exposition-closing',
        startTime: expositionEnd * 0.85,
        endTime: expositionEnd,
        confidence: 0.78,
        description: 'Material de fechamento confirmando a nova tonalidade.',
      },
      {
        type: 'development',
        startTime: expositionEnd,
        endTime: developmentEnd,
        confidence: 0.88,
        description: 'Elaboração e transformação dos temas, com modulações extensivas.',
      },
      {
        type: 'recapitulation-theme1',
        startTime: developmentEnd,
        endTime: developmentEnd + (recapEnd - developmentEnd) * 0.35,
        confidence: 0.9,
        description: 'Retorno do primeiro tema na tonalidade original.',
        musicalKey: 'Dó Maior',
      },
      {
        type: 'recapitulation-theme2',
        startTime: developmentEnd + (recapEnd - developmentEnd) * 0.45,
        endTime: recapEnd,
        confidence: 0.85,
        description: 'Segundo tema agora na tonalidade principal.',
        musicalKey: 'Dó Maior',
      },
      {
        type: 'coda',
        startTime: recapEnd,
        endTime: duration,
        confidence: 0.8,
        description: 'Conclusão final reafirmando a tonalidade principal.',
      },
    ],
    overallConfidence: 0.84,
    summary: 'Esta peça apresenta uma estrutura de forma sonata clássica bem definida, com clara distinção entre exposição, desenvolvimento e recapitulação. O desenvolvimento mostra elaboração temática sofisticada.',
    musicalInsights: [
      'Modulação clara para a dominante no segundo tema da exposição',
      'Desenvolvimento apresenta fragmentação temática característica',
      'Recapitulação mantém ambos os temas na tonalidade principal',
      'Coda conclusiva com reforço cadencial',
    ],
  };
}

const Index = () => {
  const { midiData, isLoading: isParsing, error, parseMidi } = useMidiParser();
  const [analysis, setAnalysis] = useState<SonataAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (file: File) => {
    setAnalysis(null);
    await parseMidi(file);
  };

  const handleAnalyze = async () => {
    if (!midiData) return;

    setIsAnalyzing(true);
    
    // Simulate AI analysis delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // TODO: Replace with actual AI analysis via Lovable Cloud
    const mockAnalysis = generateMockAnalysis(midiData.duration);
    setAnalysis(mockAnalysis);
    setIsAnalyzing(false);

    toast({
      title: "Análise concluída",
      description: `Forma sonata identificada com ${Math.round(mockAnalysis.overallConfidence * 100)}% de confiança.`,
    });
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-12">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6"
          >
            <Music2 className="w-10 h-10 text-primary" />
          </motion.div>
          
          <h1 className="text-5xl md:text-6xl font-heading font-bold mb-4">
            <span className="text-gradient">Sonata</span> Analyzer
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Identifique a estrutura da forma sonata em arquivos MIDI usando inteligência artificial
          </p>
        </motion.header>

        {/* Upload section */}
        <section className="mb-12">
          <MidiUploader 
            onFileUpload={handleFileUpload} 
            isLoading={isParsing || isAnalyzing} 
          />
          
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-destructive mt-4"
            >
              {error}
            </motion.p>
          )}
        </section>

        {/* MIDI visualization and analysis */}
        {midiData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* File info */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-heading font-semibold">{midiData.name}</h2>
                <p className="text-muted-foreground">
                  {midiData.tracks.length} trilha(s) • {Math.floor(midiData.duration / 60)}:{String(Math.floor(midiData.duration % 60)).padStart(2, '0')}
                </p>
              </div>
              
              <Button
                variant="hero"
                size="lg"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <Sparkles className="w-5 h-5 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    Analisar Estrutura
                  </>
                )}
              </Button>
            </div>

            {/* Piano roll */}
            <div>
              <h3 className="text-lg font-medium mb-3">Visualização MIDI</h3>
              <PianoRoll 
                midiData={midiData} 
                sections={analysis?.sections} 
              />
            </div>

            {/* Analysis results */}
            {analysis && (
              <SonataStructure 
                analysis={analysis} 
                duration={midiData.duration} 
              />
            )}
          </motion.div>
        )}

        {/* Features section when no file is loaded */}
        {!midiData && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16"
          >
            {[
              {
                icon: Music2,
                title: 'Análise MIDI',
                description: 'Processa arquivos MIDI e extrai informações musicais detalhadas',
              },
              {
                icon: Sparkles,
                title: 'IA Avançada',
                description: 'Identifica automaticamente seções da forma sonata com alta precisão',
              },
              {
                icon: Wand2,
                title: 'Visualização',
                description: 'Apresenta a estrutura musical de forma clara e interativa',
              },
            ].map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + idx * 0.1 }}
                className="bg-card/30 backdrop-blur-sm rounded-xl border border-border p-6 text-center"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-heading font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </motion.section>
        )}
      </div>
    </div>
  );
};

export default Index;
