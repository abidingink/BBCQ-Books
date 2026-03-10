import { GoogleGenAI, Type } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn('GEMINI_API_KEY is not set. AI features will be disabled.');
    }
    aiClient = new GoogleGenAI({ apiKey: key || 'dummy-key-to-prevent-crash' });
  }
  return aiClient;
}

export async function augmentBookDataWithAI(isbn: string, initialData: any) {
  try {
    const ai = getAI();
    let prompt = `I am looking for information about a book with ISBN ${isbn}. `;
    
    // Always ask for description to ensure it's high quality
    const missingFields = [];
    if (!initialData.title) missingFields.push('title');
    if (!initialData.author) missingFields.push('author');
    missingFields.push('description');
    if (!initialData.cover_url) missingFields.push('cover_url');
    if (!initialData.category) missingFields.push('categories');

    if (missingFields.length === 0) return initialData;

    prompt += `Please provide the following information: ${missingFields.join(', ')}. `;
    prompt += `For the description, generate a high-quality, readable summary based on the book's title and author. Ignore any existing low-quality or OCR-scanned text. `;
    prompt += `For cover image, provide a high-quality URL, not a small thumbnail. `;
    prompt += `If categories are requested, they MUST be official BISAC category names (e.g., "RELIGION / Christian Church / History"). NEVER return BISAC codes (e.g., "REL067000"). If you return a code, it will be rejected. `;
    prompt += `Return the result as JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            author: { type: Type.STRING },
            description: { type: Type.STRING },
            cover_url: { type: Type.STRING },
            categories: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of BISAC category names." }
          }
        }
      }
    });

    if (response.text) {
      if (response.text.includes('Rate exceeded')) {
        console.warn('Gemini API rate limit exceeded');
        return initialData;
      }
      try {
        const aiData = JSON.parse(response.text);
        
        const toTitleCase = (str: string) => {
          if (!str) return str;
          const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet']);
          return str.replace(
            /\w\S*/g,
            (txt, offset) => {
              if (offset !== 0 && minorWords.has(txt.toLowerCase())) {
                return txt.toLowerCase();
              }
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            }
          );
        };

        return {
          ...initialData,
          title: toTitleCase(initialData.title || aiData.title),
          author: toTitleCase(initialData.author || aiData.author),
          description: aiData.description || initialData.description,
          cover_url: initialData.cover_url || aiData.cover_url,
          category: initialData.category || (aiData.categories ? aiData.categories.join(', ') : null)
        };
      } catch (e) {
        console.warn('Failed to parse Gemini response', e);
      }
    }
  } catch (e) {
    console.warn('AI augmentation failed', e);
  }
  
  return initialData;
}

export async function augmentSingleFieldWithAI(field: string, bookData: any) {
  try {
    const ai = getAI();
    let prompt = `I am editing a book. 
    Current book data: ${JSON.stringify(bookData)}
    Please provide a new, improved value for the '${field}' field. 
    Return ONLY the new value as a JSON string under the key '${field}'.`;

    if (field === 'category') {
      prompt += ` IMPORTANT: Use only standard BISAC (Book Industry Standards and Communications) category codes/names.`;
    }
    
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            [field]: { type: Type.STRING }
          }
        }
      }
    });

    if (response.text) {
      if (response.text.includes('Rate exceeded')) {
        console.warn('Gemini API rate limit exceeded');
        return null;
      }
      try {
        const aiData = JSON.parse(response.text);
        let value = aiData[field];
        
        if (field === 'title' || field === 'author') {
          const toTitleCase = (str: string) => {
            if (!str) return str;
            const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet']);
            return str.replace(
              /\w\S*/g,
              (txt, offset) => {
                if (offset !== 0 && minorWords.has(txt.toLowerCase())) {
                  return txt.toLowerCase();
                }
                return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
              }
            );
          };
          value = toTitleCase(value);
        }
        
        return value;
      } catch (e) {
        console.warn('Failed to parse Gemini response', e);
      }
    }
  } catch (e) {
    console.warn('AI field update failed', e);
  }
  return null;
}
