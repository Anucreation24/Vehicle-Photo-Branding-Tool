let openCVPromise: Promise<any> | null = null;

export function loadOpenCV(): Promise<any> {
  if (openCVPromise) return openCVPromise;

  openCVPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('OpenCV can only be loaded in the browser.'));
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

    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.5.5/opencv.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // Just in case it initialized synchronously
      if ((window as any).cv && (window as any).cv.Mat) {
        resolve((window as any).cv);
      }
    };
    script.onerror = () => {
      reject(new Error('Failed to load OpenCV.js script.'));
    };
    document.body.appendChild(script);
  });

  return openCVPromise;
}
