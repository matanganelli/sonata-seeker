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

    console.log(`Analyzing MIDI file: ${fileName}, size: ${midiData.length} bytes (base64)`);
    console.log(`Python backend URL: ${PYTHON_BACKEND_URL}`);

    // Wake up the backend first (Render free tier cold start)
    console.log('Waking up Python backend...');
    try {
      const wakeUpController = new AbortController();
      const wakeUpTimeout = setTimeout(() => wakeUpController.abort(), 60000);
      await fetch(`${PYTHON_BACKEND_URL}/health`, { 
        signal: wakeUpController.signal 
      });
      clearTimeout(wakeUpTimeout);
      console.log('Backend is awake');
    } catch (wakeErr) {
      console.log('Wake-up ping failed or timed out, proceeding anyway...');
    }

    // Convert base64 to binary
    const binaryData = Uint8Array.from(atob(midiData), c => c.charCodeAt(0));
    const blob = new Blob([binaryData], { type: 'audio/midi' });
    console.log(`Binary size: ${binaryData.length} bytes`);

    // Forward the file to the Python backend as FormData
    const backendFormData = new FormData();
    backendFormData.append('midi_file', blob, fileName || 'file.mid');

    console.log('Sending analysis request to Python backend...');
    
    // Add timeout with AbortController (180 seconds to account for cold start + analysis)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    const response = await fetch(`${PYTHON_BACKEND_URL}/analyze`, {
      method: 'POST',
      body: backendFormData,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    console.log(`Python backend responded with status: ${response.status}`);

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errorMessage.includes('abort');
    
    return new Response(
      JSON.stringify({ 
        error: isTimeout ? 'Request timeout - the analysis is taking too long' : errorMessage 
      }),
      { status: isTimeout ? 504 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});