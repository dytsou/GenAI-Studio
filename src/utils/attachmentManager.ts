import type { Attachment } from '../stores/useChatStore';

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50MB

export async function processFile(file: File): Promise<Attachment[]> {
  if (file.type.startsWith('image/')) {
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`Image size exceeds 20MB limit: ${file.name}`);
    }
    const dataUrl = await readFileAsDataURL(file);
    return [{
      type: 'image',
      dataUrl,
      name: file.name
    }];
  }

  if (file.type === 'application/pdf') {
     if (file.size > MAX_PDF_SIZE) {
        throw new Error(`PDF size exceeds 50MB limit: ${file.name}`);
     }
     // Dynamic import so we don't load pdfjs until needed
     const { processPdfToImages } = await import('./pdfProcessor');
     return await processPdfToImages(file);
  }

  throw new Error(`Unsupported file type: ${file.type}. Please upload Images or PDFs only.`);
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
