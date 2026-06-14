import { describe, it, expect, vi } from 'vitest';
import { extractTextFromPdf } from '../src/services/pdfExtractor.js';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';

vi.mock('pdfjs-dist/build/pdf', () => {
  return {
    GlobalWorkerOptions: {
      workerSrc: ''
    },
    getDocument: vi.fn()
  };
});

describe('PDF Text Extractor', () => {
  it('should extract and reconstruct text by sorting Y desc and X asc', async () => {
    const mockItems = [
      { str: 'TOW', transform: [1, 0, 0, 1, 100, 700] },
      { str: '125000', transform: [1, 0, 0, 1, 150, 700] },
      { str: 'ZFW', transform: [1, 0, 0, 1, 10, 700] },
      { str: '101758', transform: [1, 0, 0, 1, 50, 700] },
      { str: 'CYOW', transform: [1, 0, 0, 1, 10, 720] },
      { str: 'CYYT', transform: [1, 0, 0, 1, 80, 720] }
    ];

    const mockPage = {
      getTextContent: () => Promise.resolve({ items: mockItems })
    };

    const mockPdf = {
      numPages: 1,
      getPage: () => Promise.resolve(mockPage)
    };

    pdfjsLib.getDocument.mockReturnValue({
      promise: Promise.resolve(mockPdf)
    });

    const result = await extractTextFromPdf(new ArrayBuffer(0));
    
    // CYOW is at (10, 720), CYYT is at (80, 720) -> Line 1: CYOW CYYT
    // ZFW is at (10, 700), 101758 is at (50, 700), TOW is at (100, 700), 125000 is at (150, 700) -> Line 2: ZFW 101758 TOW 125000
    expect(result.trim()).toBe("CYOW CYYT\nZFW 101758 TOW 125000");
  });
});
