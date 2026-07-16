'use client';

let openCVPromise: Promise<any> | null = null;

export function loadOpenCV(): Promise<any> {
  if (openCVPromise) return openCVPromise;

  openCVPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }

    if ((window as any).cv && (window as any).cv.Mat) {
      resolve((window as any).cv);
      return;
    }

    // Set up the Module callback for OpenCV.js
    (window as any).Module = {
      onRuntimeInitialized: () => {
        resolve((window as any).cv);
      }
    };

    // 3-second loading timeout
    const timeoutId = setTimeout(() => {
      console.warn('OpenCV.js loading timed out. Continuing without OpenCV.');
      resolve(null);
    }, 4000);

    const script = document.createElement('script');
    // Try self-hosted local script first, fall back to CDN if needed
    script.src = '/opencv.js'; 
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      if ((window as any).cv && (window as any).cv.Mat) {
        clearTimeout(timeoutId);
        resolve((window as any).cv);
      } else {
        // Try fallback to CDN if local fails
        const fallbackScript = document.createElement('script');
        fallbackScript.src = 'https://docs.opencv.org/4.5.5/opencv.js';
        fallbackScript.async = true;
        fallbackScript.defer = true;
        fallbackScript.onload = () => {
          if ((window as any).cv && (window as any).cv.Mat) {
            clearTimeout(timeoutId);
            resolve((window as any).cv);
          }
        };
        fallbackScript.onerror = () => {
          clearTimeout(timeoutId);
          resolve(null);
        };
        document.body.appendChild(fallbackScript);
      }
    };

    script.onerror = () => {
      // Try fallback to CDN immediately
      const fallbackScript = document.createElement('script');
      fallbackScript.src = 'https://docs.opencv.org/4.5.5/opencv.js';
      fallbackScript.async = true;
      fallbackScript.defer = true;
      fallbackScript.onload = () => {
        if ((window as any).cv && (window as any).cv.Mat) {
          clearTimeout(timeoutId);
          resolve((window as any).cv);
        }
      };
      fallbackScript.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };
      document.body.appendChild(fallbackScript);
    };

    document.body.appendChild(script);
  });

  return openCVPromise;
}
