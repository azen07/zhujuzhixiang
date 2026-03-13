import { GoogleGenAI } from "@google/genai";

export interface ImageInput {
  base64: string;
  mimeType: string;
}

export interface EditImageParams {
  images: ImageInput[];
  prompt: string;
}

export const editImage = async ({ images, prompt }: EditImageParams): Promise<string | null> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    // Put prompt first, followed by images
    const parts: any[] = [{ text: prompt }];
    
    images.forEach(img => {
      parts.push({
        inlineData: {
          data: img.base64,
          mimeType: img.mimeType,
        },
      });
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: parts,
      },
    });

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("No candidates returned from Gemini API. This might be due to safety filters.");
    }

    const candidate = response.candidates[0];
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Generation finished with reason: ${candidate.finishReason}`);
    }

    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
      if (part.text) {
        console.log("Gemini returned text instead of image:", part.text);
      }
    }
    
    throw new Error("The model did not return an image part. It might have returned text instead.");
  } catch (error) {
    console.error("Gemini Image Edit Error:", error);
    throw error;
  }
};
