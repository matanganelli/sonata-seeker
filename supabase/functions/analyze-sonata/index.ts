import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SONATA_ANALYSIS_PROMPT = `You are an expert musicologist specializing in Classical and Romantic period formal analysis, particularly sonata form. 

Analyze the provided musical data and identify the sonata form structure. The data includes:
- Key areas detected throughout the piece
- Thematic material patterns
- Cadence points
- Total duration

Based on this data, identify the following sections with precise timestamps:
1. **Exposition** (usually first 30-40% of the piece)
   - First Theme (P): In tonic key
   - Transition (TR): Modulating passage
   - Second Theme (S): In contrasting key (dominant or relative major)
   - Closing Theme (C): Cadential material

2. **Development** (usually middle 25-35%)
   - Fragmentary treatment of themes
   - Harmonic instability
   - Sequential passages

3. **Recapitulation** (usually final 30-40%)
   - Return of First Theme in tonic
   - Second Theme now in tonic key
   - Possible Coda

Consider these musical indicators:
- Key changes suggest section boundaries
- Cadence points (especially PAC/HC) mark phrase endings
- Thematic character changes indicate new sections
- Return to tonic key signals recapitulation

Return your analysis as a JSON object with this exact structure:
{
  "sections": [
    {
      "type": "exposition-theme1" | "exposition-transition" | "exposition-theme2" | "exposition-closing" | "development" | "recapitulation-theme1" | "recapitulation-transition" | "recapitulation-theme2" | "recapitulation-closing" | "coda",
      "startTime": <number in seconds>,
      "endTime": <number in seconds>,
      "confidence": <0.0 to 1.0>,
      "description": "<brief description in Portuguese>",
      "musicalKey": "<key if detected, e.g. 'C major', 'G minor'>"
    }
  ],
  "overallConfidence": <0.0 to 1.0>,
  "summary": "<2-3 sentence summary of the analysis in Portuguese>",
  "musicalInsights": ["<insight 1 in Portuguese>", "<insight 2>", ...]
}

Important:
- Ensure startTime and endTime are within the total duration
- Sections should not overlap
- Be conservative with confidence scores
- Provide specific musical observations in the insights`;

async function analyzeWithAI(pythonData: any): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.log('LOVABLE_API_KEY not configured, using Python analysis only');
    return pythonData;
  }

  const { total_duration, key_areas, thematic_material, cadences, sections } = pythonData;

  const dataContext = `
## Musical Data Extracted from MIDI

### Total Duration: ${total_duration.toFixed(2)} seconds

### Key Areas Detected:
${key_areas?.map((k: any) => `- ${k.key} ${k.mode} (${k.start_time.toFixed(1)}s - ${k.end_time.toFixed(1)}s)`).join('\n') || 'No key areas detected'}

### Thematic Material:
${thematic_material?.map((t: any) => `- ${t.label} at ${t.start_time.toFixed(1)}s - ${t.end_time.toFixed(1)}s (character: ${t.character})`).join('\n') || 'No thematic material detected'}

### Cadence Points:
${cadences?.map((c: any) => `- ${c.type} cadence at ${c.time_seconds.toFixed(1)}s`).join('\n') || 'No cadences detected'}

### Heuristic Sections (from basic analysis):
${sections?.map((s: any) => `- ${s.type}: ${s.startTime.toFixed(1)}s - ${s.endTime.toFixed(1)}s`).join('\n') || 'No sections detected'}

Please analyze this data and provide a detailed sonata form structure analysis.`;

  try {
    console.log('Calling Lovable AI for analysis...');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SONATA_ANALYSIS_PROMPT },
          { role: 'user', content: dataContext }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('AI rate limited, falling back to Python analysis');
        return pythonData;
      }
      if (response.status === 402) {
        console.warn('AI credits exhausted, falling back to Python analysis');
        return pythonData;
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return pythonData;
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    
    if (!content) {
      console.warn('Empty AI response, falling back to Python analysis');
      return pythonData;
    }

    // Extract JSON from response (might be wrapped in markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const aiAnalysis = JSON.parse(jsonStr);
    console.log('AI analysis successful');
    
    // Merge AI analysis with Python data
    return {
      ...aiAnalysis,
      rawData: {
        key_areas,
        thematic_material,
        cadences,
        total_duration,
      },
      analysisType: 'ai-enhanced'
    };

  } catch (error) {
    console.error('AI analysis error:', error);
    // Fall back to Python analysis
    return pythonData;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PYTHON_BACKEND_URL = Deno.env.get('PYTHON_BACKEND_URL');
    
    if (!PYTHON_BACKEND_URL) {
      throw new Error('PYTHON_BACKEND_URL is not configured');
    }

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

    // Forward the file to the Python backend
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

    const pythonResult = await response.json();
    console.log('Python analysis completed, enhancing with AI...');

    // Enhance with AI analysis
    const enhancedAnalysis = await analyzeWithAI(pythonResult);

    return new Response(
      JSON.stringify(enhancedAnalysis),
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
