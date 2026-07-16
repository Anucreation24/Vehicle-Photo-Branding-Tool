'use client';

import { useState, useRef } from 'react';

export function useEditorHistory() {
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);
  const isSyncingRef = useRef(false);

  const pushToHistory = (snap: any) => {
    if (isSyncingRef.current) return;
    if (!snap) return;

    setUndoStack((prev) => {
      const last = prev[prev.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(snap)) {
        return prev;
      }
      return [...prev, snap];
    });
    setRedoStack([]);
  };

  const clearHistory = () => {
    setUndoStack([]);
    setRedoStack([]);
  };

  return {
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    isSyncingRef,
    pushToHistory,
    clearHistory,
  };
}
