import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, FileImage, Trash2, Image as ImageIcon } from 'lucide-react';
import { ImageMetadata } from '../types';
import ErrorMessage from './ErrorMessage';

interface ImageUploaderProps {
  onImageLoaded: (url: string, metadata: ImageMetadata) => void;
  onImageCleared: () => void;
  currentImageName?: string;
  currentImageMetadata?: ImageMetadata | null;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const SUPPORTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export default function ImageUploader({
  onImageLoaded,
  onImageCleared,
  currentImageName,
  currentImageMetadata,
}: ImageUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateAndLoadFile = (file: File) => {
    setError(null);
    setIsValidating(true);

    // 1. Validate File Format
    if (!SUPPORTED_TYPES.includes(file.type)) {
      setError(`Unsupported file format: "${file.name}". Please upload a JPG, JPEG, PNG, or WEBP image.`);
      setIsValidating(false);
      return;
    }

    // 2. Validate File Size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`Image too large: File size is ${formatFileSize(file.size)}. Maximum allowed size is 25 MB.`);
      setIsValidating(false);
      return;
    }

    // 3. Create Object URL and Load Image to validate contents & get dimensions
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      // Image loaded successfully, it is not corrupted
      const metadata: ImageMetadata = {
        name: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
        size: file.size,
      };
      onImageLoaded(objectUrl, metadata);
      setIsValidating(false);
    };

    img.onerror = () => {
      // Failed to load, image might be corrupted
      setError('Corrupted image or failed image loading. The file could not be parsed as a valid image.');
      URL.revokeObjectURL(objectUrl);
      setIsValidating(false);
    };

    img.src = objectUrl;
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndLoadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndLoadFile(e.target.files[0]);
    }
  };

  const triggerSelectFile = () => {
    fileInputRef.current?.click();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onImageCleared();
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full space-y-4">
      {error && <ErrorMessage message={error} onRetry={triggerSelectFile} />}

      {!currentImageName ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerSelectFile}
          className={`relative group flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 min-h-[300px]
            ${
              isDragging
                ? 'border-red-500 bg-red-950/15 scale-[0.99]'
                : 'border-neutral-700 bg-neutral-900/40 hover:border-neutral-500 hover:bg-neutral-900/60'
            }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={handleFileChange}
          />
          
          <div className="p-4 rounded-full bg-neutral-800/80 group-hover:bg-neutral-800 text-neutral-400 group-hover:text-red-500 transition-all duration-300 mb-4 shadow-inner">
            {isValidating ? (
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-8 h-8" />
            )}
          </div>

          <h3 className="text-lg font-semibold text-white mb-2">
            {isValidating ? 'Validating image...' : 'Upload vehicle photo'}
          </h3>
          <p className="text-sm text-neutral-400 max-w-sm mb-1 leading-relaxed">
            Drag & drop your vehicle image here, or <span className="text-red-400 font-medium group-hover:underline">browse</span> to upload.
          </p>
          <p className="text-xs text-neutral-500 mt-2">
            Supports JPG, JPEG, PNG, WEBP up to 25 MB
          </p>
        </div>
      ) : (
        <div className="border border-neutral-800 bg-neutral-900/80 backdrop-blur-sm rounded-xl p-4 flex items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-3 rounded-lg bg-neutral-800 text-red-500 shrink-0 shadow-inner">
              <FileImage className="w-6 h-6" />
            </div>
            <div className="overflow-hidden">
              <h4 className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-xs md:max-w-md">
                {currentImageName}
              </h4>
              {currentImageMetadata && (
                <p className="text-xs text-neutral-400 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>{currentImageMetadata.width} × {currentImageMetadata.height} px</span>
                  <span className="text-neutral-600">•</span>
                  <span>{formatFileSize(currentImageMetadata.size)}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={triggerSelectFile}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-650 text-white border border-neutral-700 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500 cursor-pointer"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-red-950/40 hover:text-red-400 border border-neutral-700 hover:border-red-900/50 text-neutral-400 transition-all focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
              title="Remove image"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}
    </div>
  );
}
