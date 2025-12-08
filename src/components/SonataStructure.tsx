import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';
import type { SonataAnalysis, SonataSectionData, AIInsights } from '@/types/midi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface SonataStructureProps {
  analysis: SonataAnalysis;
  duration: number;
  fileName?: string;
}

const SECTION_LABELS: Record<string, { label: string; color: string }> = {
  'introduction': { label: 'Introdução', color: 'bg-muted-foreground/30' },
  'exposition-theme1': { label: 'Tema I', color: 'bg-sonata-exposition' },
  'exposition-transition': { label: 'Transição', color: 'bg-sonata-exposition/70' },
  'exposition-theme2': { label: 'Tema II', color: 'bg-sonata-exposition/85' },
  'exposition-closing': { label: 'Fechamento', color: 'bg-sonata-exposition/60' },
  'development': { label: 'Desenvolvimento', color: 'bg-sonata-development' },
  'recapitulation-theme1': { label: 'Tema I', color: 'bg-sonata-recapitulation' },
  'recapitulation-transition': { label: 'Transição', color: 'bg-sonata-recapitulation/70' },
  'recapitulation-theme2': { label: 'Tema II', color: 'bg-sonata-recapitulation/85' },
  'recapitulation-closing': { label: 'Fechamento', color: 'bg-sonata-recapitulation/60' },
  'coda': { label: 'Coda', color: 'bg-sonata-coda' },
};

const MAIN_SECTIONS = [
  { key: 'exposition', label: 'Exposição', color: 'text-sonata-exposition' },
  { key: 'development', label: 'Desenvolvimento', color: 'text-sonata-development' },
  { key: 'recapitulation', label: 'Recapitulação', color: 'text-sonata-recapitulation' },
];

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function SectionBar({ section, duration }: { section: SonataSectionData; duration: number }) {
  const config = SECTION_LABELS[section.type] || { label: section.type, color: 'bg-muted' };
  const widthPercent = ((section.endTime - section.startTime) / duration) * 100;
  const leftPercent = (section.startTime / duration) * 100;

  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn(
        "absolute h-full rounded-sm origin-left",
        config.color
      )}
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
      }}
      title={`${config.label}: ${formatTime(section.startTime)} - ${formatTime(section.endTime)}`}
    />
  );
}

export function SonataStructure({ analysis, duration, fileName }: SonataStructureProps) {
  const { sections, overallConfidence, summary, musicalInsights } = analysis;
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const { toast } = useToast();

  const handleGenerateInsights = async () => {
    setIsLoadingInsights(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ analysis, fileName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      const data = await response.json();
      setAiInsights(data);
      toast({
        title: "Insights gerados",
        description: "A IA analisou a estrutura e gerou insights detalhados.",
      });
    } catch (err) {
      console.error('AI insights error:', err);
      toast({
        title: "Erro ao gerar insights",
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: "destructive",
      });
    } finally {
      setIsLoadingInsights(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full space-y-6"
    >
      {/* Main structure visualization */}
      <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-heading font-semibold">Estrutura da Forma Sonata</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Confiança:</span>
            <span className={cn(
              "text-sm font-semibold",
              overallConfidence > 0.7 ? "text-sonata-coda" :
              overallConfidence > 0.4 ? "text-sonata-development" :
              "text-destructive"
            )}>
              {Math.round(overallConfidence * 100)}%
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-4">
          {MAIN_SECTIONS.map(sec => (
            <div key={sec.key} className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-full", sec.color.replace('text-', 'bg-'))} />
              <span className="text-sm text-muted-foreground">{sec.label}</span>
            </div>
          ))}
        </div>

        {/* Timeline bar */}
        <div className="relative h-12 bg-secondary/50 rounded-lg overflow-hidden">
          {sections.map((section, idx) => (
            <SectionBar key={idx} section={section} duration={duration} />
          ))}
          
          {/* Time markers */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-xs text-muted-foreground">
            <span>0:00</span>
            <span>{formatTime(duration / 2)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Section details */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((section, idx) => {
          const config = SECTION_LABELS[section.type] || { label: section.type, color: 'bg-muted' };
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-card/30 backdrop-blur-sm rounded-lg border border-border p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", config.color)} />
                  <span className="font-medium">{config.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {Math.round(section.confidence * 100)}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{section.description}</p>
              <div className="flex justify-between text-xs text-muted-foreground/70">
                <span>{formatTime(section.startTime)}</span>
                <span>{formatTime(section.endTime)}</span>
              </div>
              {section.musicalKey && (
                <div className="mt-2 text-xs text-primary">
                  Tonalidade: {section.musicalKey}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-heading font-semibold">Análise</h3>
          {!aiInsights && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateInsights}
              disabled={isLoadingInsights}
              className="gap-2"
            >
              {isLoadingInsights ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Gerar Insights com IA
                </>
              )}
            </Button>
          )}
        </div>
        <p className="text-muted-foreground mb-4">{summary}</p>
        
        {musicalInsights.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2">Insights Musicais:</h4>
            <ul className="space-y-2">
              {musicalInsights.map((insight, idx) => (
                <motion.li
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + idx * 0.1 }}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="text-primary mt-1">•</span>
                  {insight}
                </motion.li>
              ))}
            </ul>
          </div>
        )}

        {/* AI Enhanced Insights */}
        {aiInsights && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 pt-6 border-t border-border"
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-primary" />
              <h4 className="text-lg font-heading font-semibold text-primary">Análise Aprofundada por IA</h4>
            </div>

            {aiInsights.historicalContext && (
              <div className="mb-4">
                <h5 className="text-sm font-medium mb-1">Contexto Histórico:</h5>
                <p className="text-sm text-muted-foreground">{aiInsights.historicalContext}</p>
              </div>
            )}

            {aiInsights.technicalAnalysis && (
              <div className="mb-4">
                <h5 className="text-sm font-medium mb-1">Análise Técnica:</h5>
                <p className="text-sm text-muted-foreground">{aiInsights.technicalAnalysis}</p>
              </div>
            )}

            {aiInsights.enhancedInsights?.length > 0 && (
              <div>
                <h5 className="text-sm font-medium mb-2">Insights Detalhados:</h5>
                <ul className="space-y-2">
                  {aiInsights.enhancedInsights.map((insight, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className="text-primary mt-1">✦</span>
                      {insight}
                    </motion.li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
