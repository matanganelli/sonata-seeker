import { useCallback, useState } from 'react';
import { Upload, Music, FileAudio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MidiUploaderProps {
  onFileUpload: (file: File) => void;
  isLoading?: boolean;
}

export function MidiUploader({ onFileUpload, isLoading }: MidiUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.mid') || file.name.endsWith('.midi')) {
        setFileName(file.name);
        onFileUpload(file);
      }
    }
  }, [onFileUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setFileName(file.name);
      onFileUpload(file);
    }
  }, [onFileUpload]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="w-full max-w-2xl mx-auto"
    >
      <label
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300",
          "bg-card/30 backdrop-blur-sm hover:bg-card/50",
          isDragging 
            ? "border-primary bg-primary/10 scale-[1.02] glow-primary" 
            : "border-border hover:border-primary/50",
          isLoading && "pointer-events-none opacity-70"
        )}
      >
        <input
          type="file"
          accept=".mid,.midi"
          onChange={handleFileInput}
          className="hidden"
          disabled={isLoading}
        />
        
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center"
            >
              <div className="relative">
                <Music className="w-16 h-16 text-primary animate-pulse" />
                <motion.div
                  className="absolute inset-0 border-4 border-primary/30 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              </div>
              <p className="mt-4 text-lg text-muted-foreground">Analisando estrutura...</p>
            </motion.div>
          ) : fileName ? (
            <motion.div
              key="file"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center"
            >
              <FileAudio className="w-16 h-16 text-primary" />
              <p className="mt-4 text-lg font-medium text-foreground">{fileName}</p>
              <p className="mt-2 text-sm text-muted-foreground">Clique ou arraste para substituir</p>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Upload className="w-16 h-16 text-muted-foreground" />
              </motion.div>
              <p className="mt-4 text-lg font-heading font-semibold text-foreground">
                Arraste seu arquivo MIDI aqui
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                ou clique para selecionar
              </p>
              <p className="mt-4 text-xs text-muted-foreground/70">
                Suporta arquivos .mid e .midi
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </label>
    </motion.div>
  );
}
