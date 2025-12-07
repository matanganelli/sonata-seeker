import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Music2, Sparkles, Wand2 } from 'lucide-react';
import { MidiUploader } from '@/components/MidiUploader';
import { PianoRoll } from '@/components/PianoRoll';
import { SonataStructure } from '@/components/SonataStructure';
import { useMidiParser } from '@/hooks/useMidiParser';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { SonataAnalysis } from '@/types/midi';

const Index = () => {
  const { midiData, isLoading: isParsing, error, parseMidi } = useMidiParser();
  const [analysis, setAnalysis] = useState<SonataAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();
  const currentFileRef = useRef<File | null>(null);

  const handleFileUpload = async (file: File) => {
    setAnalysis(null);
    currentFileRef.current = file;
    await parseMidi(file);
  };

  const handleAnalyze = async () => {
    if (!midiData || !currentFileRef.current) return;

    setIsAnalyzing(true);

    try {
      // Convert file to base64
      const arrayBuffer = await currentFileRef.current.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // Call the Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('analyze-sonata', {
        body: {
          midiData: base64,
          fileName: currentFileRef.current.name,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Erro ao analisar arquivo');
      }

      if (!data || !data.sections) {
        throw new Error('Resposta inválida do servidor');
      }

      setAnalysis(data as SonataAnalysis);

      toast({
        title: "Análise concluída",
        description: `Forma sonata identificada com ${Math.round(data.overallConfidence * 100)}% de confiança.`,
      });
    } catch (err) {
      console.error('Analysis error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('504');
      
      toast({
        title: isTimeout ? "Servidor ocupado" : "Erro na análise",
        description: isTimeout 
          ? "O servidor está iniciando. Por favor, tente novamente em alguns segundos."
          : errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
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
            className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-16 max-w-2xl mx-auto"
          >
            {[
              {
                icon: Music2,
                title: 'Análise MIDI',
                description: 'Processa arquivos MIDI e extrai informações musicais detalhadas',
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

      {/* Footer with designer link - static at bottom of page */}
      <footer className="absolute bottom-1 right-8 text-right z-20">
        <p className="text-xs text-yellow-400/70">Design for MA</p>
        <a 
          href="https://www.mariatanganelli.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-yellow-400 hover:text-yellow-300 hover:underline transition-colors mt-2 block cursor-pointer bg-transparent"
        >
          mariatanganelli.com
        </a>
      </footer>
    </div>
  );
};

export default Index;
