'use client';

import { useState } from 'react';
import { ImageMetadata } from '../../../types';

export function useImageUpload() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata | null>(null);

  const handleImageLoaded = (url: string, metadata: ImageMetadata) => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    setImageUrl(url);
    setImageMetadata(metadata);
  };

  const clearImage = () => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    setImageUrl(null);
    setImageMetadata(null);
  };

  return {
    imageUrl,
    imageMetadata,
    handleImageLoaded,
    clearImage,
  };
}
