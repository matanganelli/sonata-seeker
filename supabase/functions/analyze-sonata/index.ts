import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PYTHON_BACKEND_URL = Deno.env.get('PYTHON_BACKEND_URL');
    
    if (!PYTHON_BACKEND_URL) {
      throw new Error('PYTHON_BACKEND_URL is not configured');
    }

    // Parse JSON body with base64 MIDI data
    const { midiData, fileName } = await req.json();

    if (!midiData) {
      return new Response(
        JSON.stringify({ error: 'No MIDI data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing MIDI file: ${fileName}`);

    // Convert base64 to binary
    const binaryData = Uint8Array.from(atob(midiData), c => c.charCodeAt(0));
    const blob = new Blob([binaryData], { type: 'audio/midi' });

    // Forward the file to the Python backend as FormData
    const backendFormData = new FormData();
    backendFormData.append('midi_file', blob, fileName || 'file.mid');

    const response = await fetch(`${PYTHON_BACKEND_URL}/analyze`, {
      method: 'POST',
      body: backendFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Python backend error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Analysis failed', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const analysisResult = await response.json();
    console.log('Analysis completed successfully');

    return new Response(
      JSON.stringify(analysisResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-sonata function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
