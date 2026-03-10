/// <reference types="vite/client" />
import React, { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';

interface CoverScannerProps {
  mode: 'match' | 'identify';
  onResult: (result: any) => void;
  onError: (error: string) => void;
  className?: string;
  variant?: 'default' | 'large';
}

export default function CoverScanner({ mode, onResult, onError, className = '', variant = 'default' }: CoverScannerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      // Resize image before sending to Gemini to improve speed
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 1600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          onError('Failed to process image');
          setIsProcessing(false);
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        const base64Image = canvas.toDataURL('image/jpeg', 0.8);
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        
        try {
          const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
          if (!apiKey) {
            onError('API key is missing');
            setIsProcessing(false);
            return;
          }
          
          const ai = new GoogleGenAI({ apiKey });

          if (mode === 'match') {
            const booksRes = await fetch('/api/books');
            const books = await booksRes.json();
            
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: {
                parts: [
                  {
                    inlineData: {
                      data: base64Data,
                      mimeType: 'image/jpeg'
                    }
                  },
                  {
                    text: `Identify the book in this image. Then, find the best match from the following list of books in our library. Return ONLY a JSON object with the matching book's ISBN. If no book matches, return {"isbn": null}.\n\nLibrary books:\n${JSON.stringify(books)}`
                  }
                ]
              },
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    isbn: {
                      type: Type.STRING,
                      description: "The ISBN of the matching book, or null if not found."
                    }
                  }
                }
              }
            });

            let result: any = {};
            try {
              if (response.text && response.text.includes('Rate exceeded')) {
                throw new Error('Rate limit exceeded. Please try again later.');
              }
              result = JSON.parse(response.text || '{}');
            } catch (e) {
              if (e instanceof SyntaxError) {
                console.error("Failed to parse Gemini response:", response.text);
                throw new Error('Invalid response from AI service.');
              }
              throw e;
            }
            
            if (result.isbn) {
              const bookRes = await fetch(`/api/books/${result.isbn}`);
              if (bookRes.ok) {
                const book = await bookRes.json();
                onResult({ match: true, book });
              } else {
                onResult({ match: false });
              }
            } else {
              onResult({ match: false });
            }
          } else if (mode === 'identify') {
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: {
                parts: [
                  {
                    inlineData: {
                      data: base64Data,
                      mimeType: 'image/jpeg'
                    }
                  },
                  {
                    text: `Extract the book details from this cover image. Return a JSON object with title, author, description (generate a short summary based on the title/author if not visible), category (e.g., Fiction, Science, History), and isbn (if visible). Ensure the title and author are in Title Case, not ALL CAPS.`
                  }
                ]
              },
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    author: { type: Type.STRING },
                    description: { type: Type.STRING },
                    category: { type: Type.STRING },
                    isbn: { type: Type.STRING }
                  }
                }
              }
            });
            console.log("Gemini response:", response.text);
            let result: any = {};
            try {
              if (response.text && response.text.includes('Rate exceeded')) {
                throw new Error('Rate limit exceeded. Please try again later.');
              }
              result = JSON.parse(response.text || '{}');
              
              // Helper to convert to Title Case
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

              if (result.title) result.title = toTitleCase(result.title);
              if (result.author) result.author = toTitleCase(result.author);
              
            } catch (e) {
              if (e instanceof SyntaxError) {
                console.error("Failed to parse Gemini response:", response.text);
                throw new Error('Invalid response from AI service.');
              }
              throw e;
            }
            onResult({ ...result, cover_url: base64Image });
          }
        } catch (err: any) {
          console.error(err);
          if (err.message && err.message.includes('Rate exceeded')) {
            onError('AI service rate limit exceeded. Please try again later.');
          } else {
            onError(err instanceof Error ? err.message : 'Network error while processing image');
          }
        } finally {
          setIsProcessing(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        onError('Failed to load image');
        setIsProcessing(false);
      };
      
      img.src = objectUrl;
    } catch (err) {
      onError('Failed to read image file');
      setIsProcessing(false);
    }
  };

  return (
    <div className={className}>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleCapture}
        className="hidden"
      />
      {variant === 'large' ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="w-full h-full bg-white border-2 border-dashed border-indigo-200 text-indigo-600 py-6 rounded-2xl hover:border-indigo-400 hover:text-indigo-700 transition-colors flex flex-col items-center justify-center gap-2 group disabled:opacity-50"
        >
          <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
            {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
          </div>
          <span className="font-medium text-sm">{isProcessing ? 'Analyzing...' : 'Scan Book Cover'}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 border border-indigo-200 py-3 px-4 rounded-xl font-medium hover:bg-indigo-100 transition-colors disabled:opacity-50"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Analyzing Cover...</span>
            </>
          ) : (
            <>
              <Camera className="w-5 h-5" />
              <span>Scan Book Cover</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
