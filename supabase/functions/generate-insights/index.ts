import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { analysis, fileName } = await req.json();

    if (!analysis || !analysis.sections) {
      return new Response(
        JSON.stringify({ error: 'No analysis data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating AI insights for: ${fileName}`);

    // Format sections for the prompt
    const sectionsDescription = analysis.sections.map((s: any) => 
      `- ${s.type}: ${s.startTime.toFixed(1)}s to ${s.endTime.toFixed(1)}s, key: ${s.musicalKey || 'Unknown'}, confidence: ${Math.round(s.confidence * 100)}%`
    ).join('\n');

    const systemPrompt = `Você é um musicólogo especialista em análise de forma sonata e música clássica. 
Sua tarefa é fornecer insights musicais detalhados e educativos sobre a estrutura de uma peça musical analisada.
Responda sempre em português brasileiro.
Seja conciso mas informativo, focando em aspectos musicais relevantes como:
- Características harmônicas e modulações
- Desenvolvimento temático
- Aspectos estilísticos do período clássico/romântico
- Técnicas composicionais identificáveis
Forneça exatamente 4-5 insights únicos e interessantes.`;

    const userPrompt = `Analise esta estrutura de forma sonata do arquivo "${fileName}":

Resumo: ${analysis.summary}
Confiança geral: ${Math.round(analysis.overallConfidence * 100)}%

Seções identificadas:
${sectionsDescription}

Insights originais do sistema:
${analysis.musicalInsights?.join('\n') || 'Nenhum'}

Por favor, gere insights musicais mais detalhados e educativos sobre esta peça, considerando:
1. A proporção entre as seções (exposição, desenvolvimento, recapitulação)
2. As relações tonais identificadas
3. Características típicas ou atípicas da forma sonata
4. Possíveis influências estilísticas ou período composicional

Responda em formato JSON com a estrutura:
{
  "enhancedInsights": ["insight 1", "insight 2", ...],
  "historicalContext": "breve contexto histórico",
  "technicalAnalysis": "análise técnica resumida"
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from AI');
    }

    console.log('AI response received, parsing...');

    // Parse JSON from the response
    let parsedInsights;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedInsights = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON:', parseErr);
      // Fallback: create structured response from plain text
      parsedInsights = {
        enhancedInsights: content.split('\n').filter((line: string) => line.trim().length > 10).slice(0, 5),
        historicalContext: 'Análise gerada por IA',
        technicalAnalysis: content.substring(0, 300)
      };
    }

    console.log('Insights generated successfully');

    return new Response(
      JSON.stringify(parsedInsights),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-insights function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
